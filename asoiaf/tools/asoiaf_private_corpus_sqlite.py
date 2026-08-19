#!/usr/bin/env python3
"""Build, verify, and query the holder-controlled ASOIAF SQLite corpus.

The database contains private normalized paragraph text and is never repository
eligible. Public outputs may retain source digests, edition identities, unit and
paragraph locators, text digests, query receipts, and reviewed paraphrases, but
must never copy the database or source payload into Git.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import stat
import sys
import time
from pathlib import Path
from typing import Any, Iterable, Sequence

FORMAT = "axm-asoiaf-private-corpus-sqlite/1"
RECEIPT_FORMAT = "axm-asoiaf-private-corpus-sqlite-receipt/1"
QUERY_FORMAT = "axm-asoiaf-private-corpus-query-receipt/1"
DEFAULT_DATABASE_NAME = "ASOIAF-PRIVATE-CORPUS.sqlite3"
DEFAULT_RECEIPT_NAME = "ASOIAF-PRIVATE-CORPUS-RECEIPT.json"
TOKEN_PATTERN = re.compile(r"[\w’']+", re.UNICODE)


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def digest_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_ndjson(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except Exception as exc:  # pragma: no cover - defensive boundary
                raise RuntimeError(f"invalid NDJSON {path}:{line_number}: {exc}") from exc
            if not isinstance(value, dict):
                raise RuntimeError(f"NDJSON row is not an object: {path}:{line_number}")
            yield value


def set_private(path: Path, *, directory: bool = False) -> None:
    try:
        path.chmod(0o700 if directory else 0o600)
    except OSError:
        pass


def private_paths(root: Path) -> tuple[Path, Path]:
    directory = root.resolve() / "private-research"
    return directory / DEFAULT_DATABASE_NAME, directory / DEFAULT_RECEIPT_NAME


def safe_private_path(edition_root: Path, relative_uri: str) -> Path:
    if not relative_uri.strip() or Path(relative_uri).is_absolute():
        raise RuntimeError(f"unsafe private URI {relative_uri!r}")
    target = (edition_root / relative_uri).resolve()
    resolved_root = edition_root.resolve()
    if target != resolved_root and resolved_root not in target.parents:
        raise RuntimeError(f"private URI escapes edition root: {relative_uri!r}")
    return target


def provenance_class(manifest: dict[str, Any]) -> str:
    publisher = str((manifest.get("metadata") or {}).get("publisher") or "")
    if manifest.get("sourceId") == "local-adwd" and "epub bud" in publisher.casefold():
        return "holder-supplied-converted-edition"
    if manifest.get("sourceId") == "local-dunk-egg" and not publisher:
        return "holder-supplied-collection-weak-bibliographic-metadata"
    if publisher:
        return "holder-supplied-publisher-identified-edition"
    return "holder-supplied-edition"


def document_id(payload: dict[str, Any]) -> str:
    return "asoiaf-private-document:" + hashlib.sha256(canonical_bytes(payload)).hexdigest()[:32]


def create_schema(database: sqlite3.Connection) -> None:
    database.executescript(
        """
        PRAGMA foreign_keys = ON;
        PRAGMA temp_store = MEMORY;
        PRAGMA synchronous = OFF;
        PRAGMA journal_mode = OFF;
        PRAGMA cache_size = -262144;

        CREATE TABLE metadata (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE editions (
          edition_key TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          edition_id TEXT NOT NULL,
          continuity_id TEXT NOT NULL,
          title TEXT,
          language TEXT,
          publisher TEXT,
          source_digest TEXT NOT NULL,
          source_bytes INTEGER NOT NULL,
          manifest_fingerprint TEXT NOT NULL,
          collector_observation_id TEXT,
          unit_count INTEGER NOT NULL,
          segment_count INTEGER NOT NULL,
          char_count INTEGER NOT NULL,
          word_count INTEGER NOT NULL,
          provenance_class TEXT NOT NULL,
          private_text_retained INTEGER NOT NULL CHECK (private_text_retained IN (0,1))
        ) WITHOUT ROWID;

        CREATE TABLE units (
          unit_rowid INTEGER PRIMARY KEY,
          edition_key TEXT NOT NULL REFERENCES editions(edition_key),
          unit_id TEXT NOT NULL UNIQUE,
          unit_order INTEGER NOT NULL,
          label TEXT NOT NULL,
          source_part_digest TEXT NOT NULL,
          text_digest TEXT NOT NULL,
          char_count INTEGER NOT NULL,
          word_count INTEGER NOT NULL,
          paragraph_count INTEGER NOT NULL,
          locator_json TEXT NOT NULL,
          UNIQUE (edition_key, unit_order)
        );

        CREATE TABLE documents (
          rowid INTEGER PRIMARY KEY,
          document_id TEXT UNIQUE NOT NULL,
          source_id TEXT NOT NULL,
          edition_id TEXT NOT NULL,
          edition_key TEXT NOT NULL REFERENCES editions(edition_key),
          continuity_id TEXT NOT NULL,
          source_digest TEXT NOT NULL,
          manifest_fingerprint TEXT NOT NULL,
          unit_id TEXT NOT NULL REFERENCES units(unit_id),
          unit_label TEXT NOT NULL,
          unit_order INTEGER NOT NULL,
          segment_id TEXT NOT NULL UNIQUE,
          segment_order INTEGER NOT NULL,
          paragraph_index INTEGER NOT NULL,
          start_char INTEGER NOT NULL,
          end_char INTEGER NOT NULL,
          char_count INTEGER NOT NULL,
          word_count INTEGER NOT NULL,
          text_digest TEXT NOT NULL,
          locator_json TEXT NOT NULL,
          text TEXT NOT NULL,
          UNIQUE (edition_key, unit_order, paragraph_index)
        );

        CREATE INDEX documents_source_unit
          ON documents(source_id, unit_order, paragraph_index);
        CREATE INDEX documents_edition_unit
          ON documents(edition_key, unit_order, paragraph_index);
        CREATE INDEX documents_unit
          ON documents(unit_id, paragraph_index);
        CREATE INDEX documents_digest
          ON documents(text_digest);

        CREATE VIRTUAL TABLE documents_fts USING fts5(
          text,
          content='documents',
          content_rowid='rowid',
          tokenize='unicode61 remove_diacritics 2'
        );
        """
    )


def build_corpus(
    root: Path,
    output: Path,
    generated_at: str,
    *,
    force: bool = False,
) -> dict[str, Any]:
    root = root.resolve()
    output = output.resolve()
    manifests = sorted((root / "local-editions").glob("*/edition-manifest.json"))
    if not manifests:
        raise RuntimeError(f"no local edition manifests beneath {root}")
    if output.exists() and not force:
        raise RuntimeError(f"database already exists: {output}; pass --force to replace")

    output.parent.mkdir(parents=True, exist_ok=True)
    set_private(output.parent, directory=True)
    temporary = output.with_suffix(output.suffix + f".tmp-{os.getpid()}")
    temporary.unlink(missing_ok=True)

    database: sqlite3.Connection | None = sqlite3.connect(temporary)
    database.row_factory = sqlite3.Row
    try:
        create_schema(database)
        bindings: list[dict[str, Any]] = []
        logical_documents: list[tuple[Any, ...]] = []
        total_units = 0
        total_documents = 0
        total_words = 0
        total_characters = 0

        for manifest_path in manifests:
            edition_root = manifest_path.parent
            manifest = read_json(manifest_path)
            if not manifest.get("privateTextRetained"):
                raise RuntimeError(f"private text absent for {manifest['editionKey']}")

            units = list(read_ndjson(edition_root / "units.ndjson"))
            segments = list(read_ndjson(edition_root / "segments.ndjson"))
            private_index = read_json(edition_root / "private-text-index.json")
            private_entries = {
                row["unitId"]: row for row in private_index.get("entries", [])
            }
            unit_by_id = {row["unitId"]: row for row in units}
            if len(units) != manifest["unitCount"]:
                raise RuntimeError(f"unit count mismatch for {manifest['editionKey']}")
            if len(segments) != manifest["segmentCount"]:
                raise RuntimeError(f"segment count mismatch for {manifest['editionKey']}")

            metadata = manifest.get("metadata") or {}
            binding = {
                "sourceId": manifest["sourceId"],
                "editionId": manifest["editionId"],
                "editionKey": manifest["editionKey"],
                "continuityId": manifest["continuityId"],
                "title": metadata.get("title"),
                "publisher": metadata.get("publisher"),
                "sourceDigest": manifest["sourceDigest"],
                "manifestFingerprint": manifest["manifestFingerprint"],
                "collectorObservationId": manifest.get("collectorObservationId"),
                "unitCount": manifest["unitCount"],
                "segmentCount": manifest["segmentCount"],
                "wordCount": manifest["wordCount"],
                "provenanceClass": provenance_class(manifest),
            }
            bindings.append(binding)
            database.execute(
                """INSERT INTO editions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    manifest["editionKey"],
                    manifest["sourceId"],
                    manifest["editionId"],
                    manifest["continuityId"],
                    metadata.get("title"),
                    metadata.get("language"),
                    metadata.get("publisher"),
                    manifest["sourceDigest"],
                    manifest["sourceBytes"],
                    manifest["manifestFingerprint"],
                    manifest.get("collectorObservationId"),
                    manifest["unitCount"],
                    manifest["segmentCount"],
                    manifest["charCount"],
                    manifest["wordCount"],
                    provenance_class(manifest),
                    1,
                ),
            )

            unit_texts: dict[str, str] = {}
            for unit in sorted(units, key=lambda row: row["order"]):
                private_entry = private_entries.get(unit["unitId"])
                if private_entry is None:
                    raise RuntimeError(f"private index lost {unit['unitId']}")
                target = safe_private_path(edition_root, private_entry["relativeUri"])
                text = target.read_text(encoding="utf-8")
                if digest_text(text) != unit["textDigest"]:
                    raise RuntimeError(f"unit digest mismatch {unit['unitId']}")
                unit_texts[unit["unitId"]] = text
                database.execute(
                    """INSERT INTO units (
                    edition_key,unit_id,unit_order,label,source_part_digest,text_digest,
                    char_count,word_count,paragraph_count,locator_json
                    ) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (
                        manifest["editionKey"],
                        unit["unitId"],
                        unit["order"],
                        unit["label"],
                        unit["sourcePartDigest"],
                        unit["textDigest"],
                        unit["charCount"],
                        unit["wordCount"],
                        unit["paragraphCount"],
                        json.dumps(
                            unit["locator"],
                            ensure_ascii=False,
                            sort_keys=True,
                            separators=(",", ":"),
                        ),
                    ),
                )

            rows: list[tuple[Any, ...]] = []
            for segment in sorted(segments, key=lambda row: row["order"]):
                unit = unit_by_id.get(segment["unitId"])
                if unit is None:
                    raise RuntimeError(f"segment references unknown unit {segment['unitId']}")
                text = unit_texts[segment["unitId"]][
                    segment["startChar"] : segment["endChar"]
                ]
                if len(text) != segment["charCount"]:
                    raise RuntimeError(f"segment char count mismatch {segment['segmentId']}")
                if digest_text(text) != segment["textDigest"]:
                    raise RuntimeError(f"segment digest mismatch {segment['segmentId']}")
                identity = {
                    "sourceId": manifest["sourceId"],
                    "editionKey": manifest["editionKey"],
                    "unitId": unit["unitId"],
                    "segmentId": segment["segmentId"],
                    "textDigest": segment["textDigest"],
                }
                doc_id = document_id(identity)
                locator_json = json.dumps(
                    segment["locator"],
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                rows.append(
                    (
                        doc_id,
                        manifest["sourceId"],
                        manifest["editionId"],
                        manifest["editionKey"],
                        manifest["continuityId"],
                        manifest["sourceDigest"],
                        manifest["manifestFingerprint"],
                        unit["unitId"],
                        unit["label"],
                        unit["order"],
                        segment["segmentId"],
                        segment["order"],
                        segment["paragraphIndex"],
                        segment["startChar"],
                        segment["endChar"],
                        segment["charCount"],
                        segment["wordCount"],
                        segment["textDigest"],
                        locator_json,
                        text,
                    )
                )
                logical_documents.append(
                    (
                        doc_id,
                        segment["textDigest"],
                        manifest["sourceId"],
                        manifest["editionKey"],
                        unit["order"],
                        segment["paragraphIndex"],
                        segment["locator"]["unit"],
                    )
                )
                if len(rows) >= 2_000:
                    database.executemany(
                        """INSERT INTO documents (
                        document_id,source_id,edition_id,edition_key,continuity_id,
                        source_digest,manifest_fingerprint,unit_id,unit_label,unit_order,
                        segment_id,segment_order,paragraph_index,start_char,end_char,
                        char_count,word_count,text_digest,locator_json,text
                        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        rows,
                    )
                    rows.clear()
            if rows:
                database.executemany(
                    """INSERT INTO documents (
                    document_id,source_id,edition_id,edition_key,continuity_id,
                    source_digest,manifest_fingerprint,unit_id,unit_label,unit_order,
                    segment_id,segment_order,paragraph_index,start_char,end_char,
                    char_count,word_count,text_digest,locator_json,text
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    rows,
                )

            total_units += manifest["unitCount"]
            total_documents += manifest["segmentCount"]
            total_words += manifest["wordCount"]
            total_characters += sum(row["charCount"] for row in segments)
            database.commit()

        database.execute("INSERT INTO documents_fts(documents_fts) VALUES('rebuild')")
        logical = {
            "format": FORMAT,
            "generatedAt": generated_at,
            "custody": "user-controlled-private",
            "sourcePayloadInGit": False,
            "editionBindings": bindings,
            "editionCount": len(bindings),
            "unitCount": total_units,
            "documentCount": total_documents,
            "wordCount": total_words,
            "characterCount": total_characters,
            "documents": logical_documents,
            "graphEffect": "none",
            "canonEffect": "none",
        }
        logical_fingerprint = sha256_bytes(canonical_bytes(logical))
        metadata = {
            "format": FORMAT,
            "generatedAt": generated_at,
            "logicalFingerprint": logical_fingerprint,
            "editionCount": len(bindings),
            "unitCount": total_units,
            "documentCount": total_documents,
            "wordCount": total_words,
            "characterCount": total_characters,
            "sourcePathRetained": False,
            "sourceFilenameRetained": False,
            "repositoryEligible": False,
            "graphEffect": "none",
            "canonEffect": "none",
        }
        for key, value in metadata.items():
            database.execute(
                "INSERT INTO metadata(key,value_json) VALUES (?,?)",
                (key, json.dumps(value, ensure_ascii=False, separators=(",", ":"))),
            )
        database.commit()
        database.execute("PRAGMA optimize")
        database.execute("VACUUM")
        database.close()
        database = None

        check = sqlite3.connect(temporary)
        quick = check.execute("PRAGMA quick_check").fetchone()[0]
        integrity = check.execute("PRAGMA integrity_check").fetchone()[0]
        counts = {
            "editions": check.execute("SELECT count(*) FROM editions").fetchone()[0],
            "units": check.execute("SELECT count(*) FROM units").fetchone()[0],
            "documents": check.execute("SELECT count(*) FROM documents").fetchone()[0],
            "ftsRows": check.execute("SELECT count(*) FROM documents_fts").fetchone()[0],
            "words": check.execute("SELECT sum(word_count) FROM documents").fetchone()[0],
            "characters": check.execute("SELECT sum(char_count) FROM documents").fetchone()[0],
        }
        witnesses = {}
        for name, query in (
            ("winterfell", "Winterfell"),
            ("jonSnow", '"Jon Snow"'),
            ("blackfyre", "Blackfyre"),
            ("weirwood", "weirwood"),
        ):
            witnesses[name] = check.execute(
                "SELECT count(*) FROM documents_fts WHERE documents_fts MATCH ?",
                (query,),
            ).fetchone()[0]
        sqlite_version = check.execute("SELECT sqlite_version()").fetchone()[0]
        check.close()

        expected = {
            "editions": len(bindings),
            "units": total_units,
            "documents": total_documents,
            "ftsRows": total_documents,
            "words": total_words,
            "characters": total_characters,
        }
        if quick != "ok" or integrity != "ok":
            raise RuntimeError(f"SQLite integrity failure: quick={quick}, integrity={integrity}")
        if counts != expected:
            raise RuntimeError(f"SQLite count mismatch: {counts} != {expected}")

        temporary.replace(output)
        set_private(output)
        receipt = {
            "format": RECEIPT_FORMAT,
            "status": "PASS_PRIVATE_CORPUS_SQLITE",
            "generatedAt": generated_at,
            "databaseRelativeUri": f"private-research/{output.name}",
            "databaseBytes": output.stat().st_size,
            "databaseSha256": sha256_file(output),
            "logicalFingerprint": logical_fingerprint,
            "integrityCheck": integrity,
            "quickCheck": quick,
            "counts": counts,
            "queryWitnessCounts": witnesses,
            "editionBindings": bindings,
            "sqliteVersion": sqlite_version,
            "fts5": True,
            "sourcePathRetained": False,
            "sourceFilenameRetained": False,
            "privateTextRetained": True,
            "repositoryEligible": False,
            "graphEffect": "none",
            "canonEffect": "none",
            "passed": True,
        }
        receipt["receiptSha256"] = sha256_bytes(canonical_bytes(receipt))
        receipt_path = output.parent / DEFAULT_RECEIPT_NAME
        receipt_path.write_text(
            json.dumps(receipt, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        set_private(receipt_path)
        return receipt
    finally:
        if database is not None:
            database.close()
        if temporary.exists() and not output.exists():
            temporary.unlink(missing_ok=True)


def load_receipt(receipt_path: Path | None) -> dict[str, Any] | None:
    if receipt_path is None or not receipt_path.exists():
        return None
    value = read_json(receipt_path)
    if not isinstance(value, dict):
        raise RuntimeError(f"receipt is not an object: {receipt_path}")
    return value


def verify_corpus(database_path: Path, receipt_path: Path | None = None) -> dict[str, Any]:
    database_path = database_path.resolve()
    if not database_path.exists():
        raise RuntimeError(f"database does not exist: {database_path}")
    database = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    try:
        integrity = database.execute("PRAGMA integrity_check").fetchone()[0]
        quick = database.execute("PRAGMA quick_check").fetchone()[0]
        counts = {
            "editions": database.execute("SELECT count(*) FROM editions").fetchone()[0],
            "units": database.execute("SELECT count(*) FROM units").fetchone()[0],
            "documents": database.execute("SELECT count(*) FROM documents").fetchone()[0],
            "ftsRows": database.execute("SELECT count(*) FROM documents_fts").fetchone()[0],
            "words": database.execute("SELECT sum(word_count) FROM documents").fetchone()[0],
            "characters": database.execute("SELECT sum(char_count) FROM documents").fetchone()[0],
        }
        metadata = {
            row[0]: json.loads(row[1])
            for row in database.execute("SELECT key,value_json FROM metadata")
        }
    finally:
        database.close()
    errors: list[str] = []
    if integrity != "ok":
        errors.append(f"integrity_check={integrity}")
    if quick != "ok":
        errors.append(f"quick_check={quick}")
    if counts["documents"] != counts["ftsRows"]:
        errors.append("document and FTS row counts differ")
    receipt = load_receipt(receipt_path)
    observed_digest = sha256_file(database_path)
    if receipt is not None:
        if receipt.get("databaseSha256") != observed_digest:
            errors.append("database digest differs from receipt")
        if receipt.get("counts") != counts:
            errors.append("database counts differ from receipt")
        candidate = dict(receipt)
        observed_receipt_digest = candidate.pop("receiptSha256", None)
        expected_receipt_digest = sha256_bytes(canonical_bytes(candidate))
        if observed_receipt_digest != expected_receipt_digest:
            errors.append("receipt self-digest mismatch")
    return {
        "format": "axm-asoiaf-private-corpus-sqlite-verification/1",
        "status": "PASS" if not errors else "HOLD",
        "databaseSha256": observed_digest,
        "counts": counts,
        "logicalFingerprint": metadata.get("logicalFingerprint"),
        "integrityCheck": integrity,
        "quickCheck": quick,
        "receiptChecked": receipt is not None,
        "errors": errors,
        "sourceTextReturned": False,
        "graphEffect": "none",
        "canonEffect": "none",
        "passed": not errors,
    }


def tokens(value: str) -> list[str]:
    return [match.group(0).casefold() for match in TOKEN_PATTERN.finditer(value)]


def quote_fts(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def compile_query(text: str, mode: str) -> tuple[str, list[str]]:
    query_tokens = tokens(text)
    if not query_tokens:
        raise RuntimeError("query has no indexable terms")
    if mode == "phrase":
        return quote_fts(" ".join(query_tokens)), query_tokens
    operator = " AND " if mode == "all" else " OR "
    return operator.join(quote_fts(term) for term in query_tokens), query_tokens


def bounded_snippet(text: str, query_tokens: Sequence[str], context: int) -> str:
    folded = text.casefold()
    positions = [folded.find(term) for term in query_tokens]
    positions = [position for position in positions if position >= 0]
    center = min(positions) if positions else 0
    start = max(0, center - context)
    end = min(len(text), center + max((len(term) for term in query_tokens), default=1) + context)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end].strip() + suffix


def query_corpus(
    database_path: Path,
    text: str,
    *,
    mode: str = "all",
    limit: int = 20,
    source_ids: Sequence[str] = (),
    edition_keys: Sequence[str] = (),
    continuity_ids: Sequence[str] = (),
    include_snippet: bool = False,
    context_characters: int = 90,
) -> dict[str, Any]:
    if mode not in {"all", "any", "phrase"}:
        raise RuntimeError(f"unsupported query mode {mode!r}")
    limit = max(1, min(int(limit), 100))
    context_characters = max(20, min(int(context_characters), 500))
    fts_query, query_tokens = compile_query(text, mode)
    clauses = ["documents_fts MATCH ?"]
    parameters: list[Any] = [fts_query]
    for column, values in (
        ("d.source_id", source_ids),
        ("d.edition_key", edition_keys),
        ("d.continuity_id", continuity_ids),
    ):
        if values:
            placeholders = ",".join("?" for _ in values)
            clauses.append(f"{column} IN ({placeholders})")
            parameters.extend(values)
    parameters.append(limit)
    query = f"""
      SELECT d.document_id,d.source_id,d.edition_id,d.edition_key,d.continuity_id,
             d.unit_id,d.unit_label,d.unit_order,d.segment_id,d.paragraph_index,
             d.text_digest,d.locator_json,d.text,bm25(documents_fts) AS rank
      FROM documents_fts
      JOIN documents d ON d.rowid=documents_fts.rowid
      WHERE {' AND '.join(clauses)}
      ORDER BY rank,d.source_id,d.unit_order,d.paragraph_index
      LIMIT ?
    """
    database = sqlite3.connect(f"file:{database_path.resolve()}?mode=ro", uri=True)
    database.row_factory = sqlite3.Row
    try:
        rows = database.execute(query, parameters).fetchall()
    finally:
        database.close()
    matches = []
    for row in rows:
        match = {
            "documentId": row["document_id"],
            "sourceId": row["source_id"],
            "editionId": row["edition_id"],
            "editionKey": row["edition_key"],
            "continuityId": row["continuity_id"],
            "unitId": row["unit_id"],
            "unitLabel": row["unit_label"],
            "unitOrder": row["unit_order"],
            "segmentId": row["segment_id"],
            "paragraphIndex": row["paragraph_index"],
            "textDigest": row["text_digest"],
            "locator": json.loads(row["locator_json"]),
            "rank": round(float(row["rank"]), 8),
            "snippet": None,
            "snippetDigest": None,
            "graphEffect": "none",
            "canonEffect": "none",
        }
        if include_snippet:
            snippet = bounded_snippet(row["text"], query_tokens, context_characters)
            match["snippet"] = snippet
            match["snippetDigest"] = digest_text(snippet)
        matches.append(match)
    receipt = {
        "format": QUERY_FORMAT,
        "databaseSha256": sha256_file(database_path),
        "queryTextDigest": digest_text(text),
        "mode": mode,
        "limit": limit,
        "filters": {
            "sourceIds": sorted(set(source_ids)),
            "editionKeys": sorted(set(edition_keys)),
            "continuityIds": sorted(set(continuity_ids)),
        },
        "includeSnippet": include_snippet,
        "returnedCount": len(matches),
        "matches": matches,
        "graphEffect": "none",
        "canonEffect": "none",
    }
    receipt["receiptSha256"] = sha256_bytes(canonical_bytes(receipt))
    return receipt


def emit(value: Any) -> None:
    sys.stdout.write(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Build the private SQLite FTS corpus")
    build.add_argument("--root", required=True)
    build.add_argument("--out")
    build.add_argument("--at", required=True)
    build.add_argument("--force", action="store_true")

    verify = sub.add_parser("verify", help="Verify database and receipt custody")
    verify.add_argument("--database", required=True)
    verify.add_argument("--receipt")

    query = sub.add_parser("query", help="Run a private full-text query")
    query.add_argument("--database", required=True)
    query.add_argument("--text", required=True)
    query.add_argument("--mode", choices=("all", "any", "phrase"), default="all")
    query.add_argument("--limit", type=int, default=20)
    query.add_argument("--source-id", action="append", default=[])
    query.add_argument("--edition-key", action="append", default=[])
    query.add_argument("--continuity-id", action="append", default=[])
    query.add_argument("--include-snippet", action="store_true")
    query.add_argument("--context-characters", type=int, default=90)
    return root


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.command == "build":
        root = Path(args.root)
        default_database, _ = private_paths(root)
        output = Path(args.out) if args.out else default_database
        emit(build_corpus(root, output, args.at, force=args.force))
        return 0
    if args.command == "verify":
        receipt = Path(args.receipt) if args.receipt else None
        result = verify_corpus(Path(args.database), receipt)
        emit(result)
        return 0 if result["passed"] else 1
    if args.command == "query":
        emit(
            query_corpus(
                Path(args.database),
                args.text,
                mode=args.mode,
                limit=args.limit,
                source_ids=args.source_id,
                edition_keys=args.edition_key,
                continuity_ids=args.continuity_id,
                include_snippet=args.include_snippet,
                context_characters=args.context_characters,
            )
        )
        return 0
    raise RuntimeError(f"unhandled command {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
