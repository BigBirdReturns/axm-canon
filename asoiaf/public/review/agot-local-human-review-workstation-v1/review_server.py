#!/usr/bin/env python3
"""Loopback-only named-human review workstation for the AGOT opening gate."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import parse_qs, quote, urlparse

EXPECTED_DATABASE = {
    "filename": "ASOIAF-PRIVATE-CORPUS.sqlite3",
    "bytes": 106_151_936,
    "sha256": "71cf5fe7b22ee33e5deb21440acce40dd2102771edaddff2d3e4853fc5d50843",
}
ALLOWED_ACTIONS = {"confirm", "correct", "split", "merge", "reject", "defer"}
LOOPBACKS = {"127.0.0.1", "localhost", "::1"}
SAFE_ID = re.compile(r"[^A-Za-z0-9._-]+")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_candidates(path: Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    document = load_json(path)
    rows = document.get("candidates") if isinstance(document, dict) else None
    if not isinstance(rows, list) or len(rows) != 45:
        raise RuntimeError("candidate file must contain exactly 45 candidates")
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        candidate_id = str(row.get("candidateId") or "")
        binding = row.get("sourceBinding") or {}
        if not candidate_id or candidate_id in indexed:
            raise RuntimeError("candidate identities must be nonempty and unique")
        if not isinstance(binding.get("unitOrder"), int) or not isinstance(binding.get("paragraphIndex"), int):
            raise RuntimeError(f"candidate {candidate_id} lacks an exact locator")
        indexed[candidate_id] = row
    locators = {
        (row["sourceBinding"]["unitOrder"], row["sourceBinding"]["paragraphIndex"])
        for row in rows
    }
    if len(locators) != 31:
        raise RuntimeError("candidate set must bind exactly 31 private locators")
    return document, indexed


def manifest_from(path: Path | None) -> dict[str, Any]:
    return load_json(path) if path is not None else dict(EXPECTED_DATABASE)


def verify_database(path: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    path = path.resolve()
    if not path.is_file():
        raise RuntimeError("private database is unavailable")
    observed_bytes = path.stat().st_size
    observed_sha256 = sha256_file(path)
    if observed_bytes != int(manifest["bytes"]):
        raise RuntimeError("private database byte count mismatch")
    if observed_sha256 != str(manifest["sha256"]):
        raise RuntimeError("private database SHA-256 mismatch")
    return {"bytes": observed_bytes, "sha256": observed_sha256}


def open_database(path: Path) -> sqlite3.Connection:
    uri = f"file:{quote(str(path.resolve()))}?mode=ro&immutable=1"
    database = sqlite3.connect(uri, uri=True, check_same_thread=False)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA query_only=ON")
    if database.execute("PRAGMA query_only").fetchone()[0] != 1:
        database.close()
        raise RuntimeError("SQLite query_only boundary was not applied")
    columns = {row[1] for row in database.execute("PRAGMA table_info(documents)")}
    required = {
        "source_id",
        "edition_key",
        "unit_order",
        "paragraph_index",
        "text_digest",
        "text",
    }
    if not required.issubset(columns):
        database.close()
        raise RuntimeError("private database schema is incompatible")
    return database


def paragraph_for(database: sqlite3.Connection, candidate: dict[str, Any]) -> dict[str, Any]:
    binding = candidate["sourceBinding"]
    rows = database.execute(
        """SELECT source_id,edition_key,unit_label,unit_order,paragraph_index,
                  text_digest,text,char_count,word_count,locator_json
           FROM documents
           WHERE source_id=? AND edition_key=? AND unit_order=? AND paragraph_index=?""",
        (
            binding.get("sourceId", "local-agot"),
            binding["editionKey"],
            binding["unitOrder"],
            binding["paragraphIndex"],
        ),
    ).fetchall()
    if len(rows) != 1:
        raise RuntimeError("private locator is missing or ambiguous")
    row = rows[0]
    expected_digest = str(binding.get("textDigest") or "").removeprefix("sha256:")
    observed_digest = str(row["text_digest"]).removeprefix("sha256:")
    if expected_digest and expected_digest != observed_digest:
        raise RuntimeError("private paragraph text digest differs from candidate binding")
    if sha256_text(row["text"]) != observed_digest:
        raise RuntimeError("stored paragraph digest does not match private text")
    return {
        "sourceId": row["source_id"],
        "editionKey": row["edition_key"],
        "unitLabel": row["unit_label"],
        "unitOrder": row["unit_order"],
        "paragraphIndex": row["paragraph_index"],
        "textDigest": row["text_digest"],
        "text": row["text"],
        "charCount": row["char_count"],
        "wordCount": row["word_count"],
        "locator": json.loads(row["locator_json"]),
    }


def named_reviewer(value: str) -> str:
    reviewer = " ".join(value.split())
    if len(reviewer) < 3 or reviewer.casefold() in {
        "reviewer",
        "human",
        "user",
        "anonymous",
        "test",
    }:
        raise RuntimeError("a separately named human reviewer is required")
    return reviewer


def lines(value: str) -> list[str]:
    return [item.strip() for item in value.splitlines() if item.strip()]


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def make_intake(
    candidate: dict[str, Any],
    paragraph: dict[str, Any],
    reviewer: str,
    form: dict[str, list[str]],
    database_receipt: dict[str, Any],
) -> dict[str, Any]:
    action = (form.get("action") or [""])[0]
    rationale = (form.get("rationale") or [""])[0].strip()
    if action not in ALLOWED_ACTIONS:
        raise RuntimeError("unsupported review action")
    if not rationale:
        raise RuntimeError("a bounded rationale is required")
    corrected = (form.get("correctedStatement") or [""])[0].strip()
    split_statements = lines((form.get("splitStatements") or [""])[0])
    merge_ids = lines((form.get("mergeCandidateIds") or [""])[0])
    if action == "correct" and not corrected:
        raise RuntimeError("correct requires a corrected statement")
    if action == "split" and len(split_statements) < 2:
        raise RuntimeError("split requires at least two proposed statements")
    if action == "merge" and not merge_ids:
        raise RuntimeError("merge requires at least one other candidate identity")
    intake = {
        "schema": "axm-asoiaf-agot-human-review-intake/1",
        "candidateId": candidate["candidateId"],
        "parentClaimId": candidate.get("parentClaimId", ""),
        "parentRecordFingerprint": candidate.get("parentRecordFingerprint", ""),
        "candidateStatement": candidate.get("candidateStatement", ""),
        "reviewer": reviewer,
        "reviewedAt": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "rationale": rationale,
        "correctedStatement": corrected or None,
        "splitStatements": split_statements,
        "mergeCandidateIds": merge_ids,
        "databaseSha256": database_receipt["sha256"],
        "sourceExcerptSha256": sha256_text(paragraph["text"]),
        "sourceBinding": {
            "sourceId": paragraph["sourceId"],
            "editionKey": paragraph["editionKey"],
            "unitLabel": paragraph["unitLabel"],
            "unitOrder": paragraph["unitOrder"],
            "paragraphIndex": paragraph["paragraphIndex"],
            "storedTextDigest": paragraph["textDigest"],
            "charCount": paragraph["charCount"],
            "wordCount": paragraph["wordCount"],
            "locator": paragraph["locator"],
        },
        "executed": False,
        "validationStanding": "UNVALIDATED_FOR_SEPARATE_EXECUTOR",
        "canonEffect": "none",
        "graphEffect": "none",
    }
    intake["intakeSha256"] = hashlib.sha256(canonical(intake)).hexdigest()
    return intake


class ReviewApplication:
    def __init__(
        self,
        candidates_path: Path,
        database_path: Path,
        manifest: dict[str, Any],
        reviewer: str,
        output_dir: Path,
    ):
        _, self.candidates = load_candidates(candidates_path)
        self.database_receipt = verify_database(database_path, manifest)
        self.database = open_database(database_path)
        self.reviewer = named_reviewer(reviewer)
        self.output_dir = output_dir.resolve()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.csrf = secrets.token_urlsafe(32)
        self.lock = threading.Lock()

    def close(self) -> None:
        self.database.close()

    def save(self, intake: dict[str, Any]) -> Path:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        safe = SAFE_ID.sub("_", intake["candidateId"])
        target = self.output_dir / f"{stamp}-{safe}.json"
        payload = json.dumps(intake, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
        with self.lock:
            descriptor = os.open(
                target,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(payload)
        return target


def handler_factory(app: ReviewApplication):
    class Handler(BaseHTTPRequestHandler):
        server_version = "AXM-AGOT-LocalReview/1"

        def log_message(self, format: str, *args: Any) -> None:
            return

        def end_headers(self) -> None:
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header(
                "Content-Security-Policy",
                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
            )
            super().end_headers()

        def html_response(self, body: str, status: int = 200) -> None:
            encoded = body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def json_response(self, value: Any, status: int = 200) -> None:
            encoded = (
                json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
            ).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/health":
                return self.json_response(
                    {
                        "status": "READY_FOR_LOOPBACK_NAMED_HUMAN_REVIEW",
                        "candidateCount": len(app.candidates),
                        "reviewer": app.reviewer,
                        "sourceTextReturned": False,
                        "canonEffect": "none",
                        "graphEffect": "none",
                    }
                )
            if parsed.path == "/":
                items = []
                for row in app.candidates.values():
                    binding = row["sourceBinding"]
                    items.append(
                        '<li><a href="/candidate?id='
                        + html.escape(row["candidateId"], quote=True)
                        + '">'
                        + html.escape(row["candidateId"])
                        + "</a> | "
                        + html.escape(str(binding.get("unitLabel") or binding["unitOrder"]))
                        + " ¶"
                        + str(binding["paragraphIndex"])
                        + "</li>"
                    )
                return self.html_response(
                    "<!doctype html><meta charset=utf-8><title>AGOT local review</title>"
                    "<style>body{max-width:1100px;margin:auto;font:16px system-ui;line-height:1.5}li{margin:.35rem 0}</style>"
                    "<h1>AGOT local named-human review</h1><p>Reviewer: <strong>"
                    + html.escape(app.reviewer)
                    + "</strong></p><p>Saved intakes are unexecuted and carry no canon or graph effect.</p><ol>"
                    + "".join(items)
                    + "</ol>"
                )
            if parsed.path == "/candidate":
                candidate_id = (parse_qs(parsed.query).get("id") or [""])[0]
                candidate = app.candidates.get(candidate_id)
                if candidate is None:
                    return self.html_response("<h1>Unknown candidate</h1>", 404)
                try:
                    paragraph = paragraph_for(app.database, candidate)
                except Exception as exc:
                    return self.html_response(
                        "<h1>Locator refused</h1><pre>"
                        + html.escape(str(exc))
                        + "</pre>",
                        409,
                    )
                options = "".join(
                    f"<option>{action}</option>" for action in sorted(ALLOWED_ACTIONS)
                )
                return self.html_response(
                    f"""<!doctype html><meta charset=utf-8><title>{html.escape(candidate_id)}</title>
<style>body{{max-width:1100px;margin:auto;font:16px system-ui;line-height:1.5}}pre{{white-space:pre-wrap;border:1px solid #888;padding:1rem}}label{{display:block;margin:.7rem 0}}textarea,input,select{{width:100%;box-sizing:border-box}}</style>
<p><a href="/">Back</a></p><h1>{html.escape(candidate_id)}</h1>
<h2>Candidate statement</h2><p>{html.escape(candidate.get("candidateStatement", ""))}</p>
<h2>Exact private paragraph</h2><p>{html.escape(paragraph["unitLabel"])} | unit {paragraph["unitOrder"]} | paragraph {paragraph["paragraphIndex"]}</p>
<pre>{html.escape(paragraph["text"])}</pre>
<form method="post" action="/save"><input type="hidden" name="csrf" value="{html.escape(app.csrf, quote=True)}"><input type="hidden" name="candidateId" value="{html.escape(candidate_id, quote=True)}">
<label>Action<select name="action">{options}</select></label>
<label>Rationale<textarea name="rationale" rows="5" required></textarea></label>
<label>Corrected statement, required only for correct<textarea name="correctedStatement" rows="3"></textarea></label>
<label>Split statements, one per line<textarea name="splitStatements" rows="4"></textarea></label>
<label>Merge candidate IDs, one per line<textarea name="mergeCandidateIds" rows="3"></textarea></label>
<button type="submit">Save inert review intake</button></form>"""
                )
            return self.html_response("<h1>Not found</h1>", 404)

        def do_POST(self) -> None:
            if urlparse(self.path).path != "/save":
                return self.html_response("<h1>Not found</h1>", 404)
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 256_000:
                    raise RuntimeError("invalid request size")
                form = parse_qs(
                    self.rfile.read(length).decode("utf-8"),
                    keep_blank_values=True,
                )
                if (form.get("csrf") or [""])[0] != app.csrf:
                    return self.html_response("<h1>CSRF refused</h1>", 403)
                candidate_id = (form.get("candidateId") or [""])[0]
                candidate = app.candidates.get(candidate_id)
                if candidate is None:
                    raise RuntimeError("unknown candidate")
                paragraph = paragraph_for(app.database, candidate)
                intake = make_intake(
                    candidate,
                    paragraph,
                    app.reviewer,
                    form,
                    app.database_receipt,
                )
                path = app.save(intake)
                return self.html_response(
                    "<h1>Inert intake saved</h1><p>"
                    + html.escape(path.name)
                    + "</p><p>This file is not an executed transaction.</p><p><a href='/'>Return</a></p>",
                    201,
                )
            except Exception as exc:
                return self.html_response(
                    "<h1>Review intake refused</h1><pre>"
                    + html.escape(str(exc))
                    + "</pre>",
                    400,
                )

    return Handler


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--database", required=True)
    serve.add_argument("--candidates", required=True)
    serve.add_argument("--reviewer", required=True)
    serve.add_argument("--database-manifest")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--output-dir", required=True)
    serve.add_argument("--startup-receipt")
    check = sub.add_parser("check")
    check.add_argument("--database", required=True)
    check.add_argument("--candidates", required=True)
    check.add_argument("--database-manifest")
    return root


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        manifest = manifest_from(
            Path(args.database_manifest) if args.database_manifest else None
        )
        _, indexed = load_candidates(Path(args.candidates))
        database_receipt = verify_database(Path(args.database), manifest)
        database = open_database(Path(args.database))
        try:
            for row in indexed.values():
                paragraph_for(database, row)
        finally:
            database.close()
        if args.command == "check":
            print(
                json.dumps(
                    {
                        "status": "READY_FOR_LOOPBACK_NAMED_HUMAN_REVIEW",
                        "candidateCount": 45,
                        "locatorCount": 31,
                        "databaseSha256": database_receipt["sha256"],
                        "sourceTextReturned": False,
                        "executedHumanTransactions": 0,
                        "canonEffect": "none",
                        "graphEffect": "none",
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
            return 0
        if args.host not in LOOPBACKS:
            raise RuntimeError("non-loopback binding is forbidden")
        app = ReviewApplication(
            Path(args.candidates),
            Path(args.database),
            manifest,
            args.reviewer,
            Path(args.output_dir),
        )
        server = ThreadingHTTPServer((args.host, args.port), handler_factory(app))
        actual_host, actual_port = server.server_address[:2]
        receipt = {
            "status": "READY_FOR_LOOPBACK_NAMED_HUMAN_REVIEW",
            "host": actual_host,
            "port": actual_port,
            "reviewer": app.reviewer,
            "candidateCount": 45,
            "locatorCount": 31,
            "databaseSha256": app.database_receipt["sha256"],
            "csrfIssued": True,
            "sourceTextPersisted": False,
            "executedHumanTransactions": 0,
            "canonEffect": "none",
            "graphEffect": "none",
        }
        if args.startup_receipt:
            Path(args.startup_receipt).write_text(
                json.dumps(receipt, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
        print(json.dumps(receipt, indent=2, sort_keys=True), flush=True)
        print(f"Open http://{actual_host}:{actual_port}/", flush=True)
        try:
            server.serve_forever()
        finally:
            server.server_close()
            app.close()
        return 0
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "HOLD",
                    "error": str(exc),
                    "sourceTextReturned": False,
                    "executedHumanTransactions": 0,
                    "canonEffect": "none",
                    "graphEffect": "none",
                },
                indent=2,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
