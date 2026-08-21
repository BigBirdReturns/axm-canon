#!/usr/bin/env python3
"""Noncopyrighted end-to-end qualification for the AGOT local review source."""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
checks: list[dict[str, Any]] = []


def check(value: bool, label: str) -> None:
    checks.append({"label": label, "passed": bool(value)})
    if not value:
        raise AssertionError(label)


def digest_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def create_fixture(root: Path) -> tuple[Path, Path, Path]:
    rows = []
    for index in range(45):
        unit_order = 6 + index // 6
        paragraph_index = 2 + (index % 31)
        if index >= 31:
            source_index = index - 31
            unit_order = 6 + source_index // 6
            paragraph_index = 2 + (source_index % 31)
        text = (
            f"Synthetic paragraph for unit {unit_order} and paragraph {paragraph_index}. "
            "This fixture contains no book text."
        )
        rows.append(
            {
                "candidateId": f"fixture-candidate-{index + 1:02d}",
                "parentClaimId": f"fixture-parent-{min(index, 30) + 1:02d}",
                "parentRecordFingerprint": hashlib.sha256(
                    f"parent-{min(index, 30)}".encode()
                ).hexdigest(),
                "candidateStatement": f"Synthetic bounded statement {index + 1}.",
                "sourceBinding": {
                    "sourceId": "local-agot",
                    "editionKey": "bantam-calibre-isbn-9780553588484-v1-1f37c562f9636",
                    "unitLabel": f"Fixture {unit_order}",
                    "unitOrder": unit_order,
                    "paragraphIndex": paragraph_index,
                    "textDigest": digest_text(text),
                },
            }
        )
    locators = {
        (row["sourceBinding"]["unitOrder"], row["sourceBinding"]["paragraphIndex"])
        for row in rows
    }
    if len(locators) != 31:
        raise RuntimeError(f"fixture expected 31 locators, observed {len(locators)}")
    candidates = root / "candidates.json"
    candidates.write_text(
        json.dumps(
            {
                "schema": "axm-asoiaf-agot-local-review-candidates/1",
                "counts": {"atomicCandidates": 45, "exactPrivateLocators": 31},
                "candidates": rows,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    database = root / "fixture.sqlite3"
    connection = sqlite3.connect(database)
    connection.execute(
        """CREATE TABLE documents(
             source_id TEXT,edition_key TEXT,unit_label TEXT,unit_order INTEGER,
             paragraph_index INTEGER,text_digest TEXT,text TEXT,char_count INTEGER,
             word_count INTEGER,locator_json TEXT
           )"""
    )
    for unit_order, paragraph_index in sorted(locators):
        text = (
            f"Synthetic paragraph for unit {unit_order} and paragraph {paragraph_index}. "
            "This fixture contains no book text."
        )
        connection.execute(
            "INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?)",
            (
                "local-agot",
                "bantam-calibre-isbn-9780553588484-v1-1f37c562f9636",
                f"Fixture {unit_order}",
                unit_order,
                paragraph_index,
                digest_text(text),
                text,
                len(text),
                len(text.split()),
                json.dumps(
                    {
                        "kind": "record",
                        "unit": f"fixture/{unit_order}/{paragraph_index}",
                    }
                ),
            ),
        )
    connection.commit()
    connection.close()
    manifest = root / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "filename": database.name,
                "bytes": database.stat().st_size,
                "sha256": sha256_file(database),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    return database, candidates, manifest


def wait_receipt(path: Path, process: subprocess.Popen[str]) -> dict[str, Any]:
    for _ in range(100):
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        if process.poll() is not None:
            raise RuntimeError(process.stderr.read())
        time.sleep(0.05)
    raise RuntimeError("server startup timeout")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="axm-agot-review-") as temporary:
        root = Path(temporary)
        database, candidates, manifest = create_fixture(root)
        output = root / "intakes"
        startup = root / "startup.json"
        process = subprocess.Popen(
            [
                sys.executable,
                str(ROOT / "review_server.py"),
                "serve",
                "--database",
                str(database),
                "--database-manifest",
                str(manifest),
                "--candidates",
                str(candidates),
                "--reviewer",
                "Synthetic Reviewer",
                "--host",
                "127.0.0.1",
                "--port",
                "0",
                "--output-dir",
                str(output),
                "--startup-receipt",
                str(startup),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            receipt = wait_receipt(startup, process)
            base = f"http://127.0.0.1:{receipt['port']}"
            check(
                receipt["status"] == "READY_FOR_LOOPBACK_NAMED_HUMAN_REVIEW"
                and receipt["candidateCount"] == 45,
                "loopback server starts with forty-five candidates",
            )
            health = json.loads(
                urllib.request.urlopen(base + "/health").read().decode()
            )
            check(
                health["candidateCount"] == 45
                and health["sourceTextReturned"] is False,
                "health endpoint returns metadata only",
            )
            document = json.loads(candidates.read_text(encoding="utf-8"))
            candidate = document["candidates"][0]
            candidate_id = candidate["candidateId"]
            binding = candidate["sourceBinding"]
            expected = (
                f"Synthetic paragraph for unit {binding['unitOrder']} and paragraph "
                f"{binding['paragraphIndex']}. This fixture contains no book text."
            )
            page = urllib.request.urlopen(
                base + "/candidate?id=" + urllib.parse.quote(candidate_id)
            ).read().decode()
            check(expected in page, "one synthetic private paragraph is displayed locally")
            token = re.search(r'name="csrf" value="([^"]+)"', page).group(1)
            bad = urllib.parse.urlencode(
                {
                    "csrf": "bad",
                    "candidateId": candidate_id,
                    "action": "confirm",
                    "rationale": "Synthetic rationale.",
                }
            ).encode()
            try:
                urllib.request.urlopen(
                    urllib.request.Request(base + "/save", data=bad, method="POST")
                )
                bad_status = 200
            except urllib.error.HTTPError as exc:
                bad_status = exc.code
            check(bad_status == 403, "bad CSRF token is refused")
            good = urllib.parse.urlencode(
                {
                    "csrf": token,
                    "candidateId": candidate_id,
                    "action": "confirm",
                    "rationale": "Synthetic evidence supports the bounded fixture statement.",
                }
            ).encode()
            response = urllib.request.urlopen(
                urllib.request.Request(base + "/save", data=good, method="POST")
            )
            check(response.status == 201, "valid intake is saved inertly")
            saved = next(output.glob("*.json"))
            intake = json.loads(saved.read_text(encoding="utf-8"))
            check(
                expected not in saved.read_text(encoding="utf-8")
                and intake["sourceExcerptSha256"] == digest_text(expected),
                "saved intake contains a hash and no paragraph text",
            )
            validation = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "validate_intakes.py"),
                    str(saved),
                    "--candidates",
                    str(candidates),
                ],
                capture_output=True,
                text=True,
            )
            check(
                validation.returncode == 0
                and json.loads(validation.stdout)["status"]
                == "PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR",
                "separate validator accepts complete inert intake",
            )
            tampered = dict(intake)
            tampered["sourceText"] = expected
            tampered.pop("intakeSha256", None)
            tampered["intakeSha256"] = hashlib.sha256(
                json.dumps(
                    tampered,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode()
            ).hexdigest()
            tampered_path = root / "tampered.json"
            tampered_path.write_text(json.dumps(tampered), encoding="utf-8")
            refused = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "validate_intakes.py"),
                    str(tampered_path),
                    "--candidates",
                    str(candidates),
                ],
                capture_output=True,
                text=True,
            )
            check(refused.returncode != 0, "validator refuses a source-text field")
            nonloop = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "review_server.py"),
                    "serve",
                    "--database",
                    str(database),
                    "--database-manifest",
                    str(manifest),
                    "--candidates",
                    str(candidates),
                    "--reviewer",
                    "Synthetic Reviewer",
                    "--host",
                    "0.0.0.0",
                    "--port",
                    "0",
                    "--output-dir",
                    str(output),
                ],
                capture_output=True,
                text=True,
            )
            check(nonloop.returncode != 0, "non-loopback binding is refused")
            wrong = json.loads(manifest.read_text(encoding="utf-8"))
            wrong["sha256"] = "0" * 64
            wrong_manifest = root / "wrong.json"
            wrong_manifest.write_text(json.dumps(wrong), encoding="utf-8")
            mismatch = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "review_server.py"),
                    "check",
                    "--database",
                    str(database),
                    "--database-manifest",
                    str(wrong_manifest),
                    "--candidates",
                    str(candidates),
                ],
                capture_output=True,
                text=True,
            )
            check(mismatch.returncode != 0, "wrong database digest is refused")
            check(
                intake["executed"] is False
                and intake["canonEffect"] == "none"
                and intake["graphEffect"] == "none",
                "saved intake preserves the zero-effect boundary",
            )
            check(
                len(
                    {
                        (
                            row["sourceBinding"]["unitOrder"],
                            row["sourceBinding"]["paragraphIndex"],
                        )
                        for row in document["candidates"]
                    }
                )
                == 31,
                "synthetic campaign spans thirty-one locators",
            )
            check(len(checks) == 11, "eleven substantive checks precede closure")
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
    check(len(checks) == 12, "synthetic campaign closes at twelve checks")
    result = {
        "schema": "axm-asoiaf-agot-local-human-review-workstation-synthetic-test/1",
        "componentId": "asoiaf-agot-local-human-review-workstation-v1",
        "passed": 12,
        "total": 12,
        "failed": 0,
        "status": "PASS",
        "warningsAsErrors": os.environ.get("PYTHONWARNINGS") == "error",
        "fixtureSourceTextOnly": True,
        "realPrivateSourceUsed": False,
        "realReviewIntakesSaved": 0,
        "executedHumanTransactions": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
