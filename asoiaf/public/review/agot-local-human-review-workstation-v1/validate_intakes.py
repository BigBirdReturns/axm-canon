#!/usr/bin/env python3
"""Validate inert AGOT human-review intakes for a separate governed executor."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable, Sequence

ALLOWED = {"confirm", "correct", "split", "merge", "reject", "defer"}
HEX64 = re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_KEYS = {
    "sourcetext",
    "paragraphtext",
    "displayedsource",
    "sourceexcerpt",
    "privateparagraph",
    "booktext",
}


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def walk_keys(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield str(key).casefold().replace("_", "").replace("-", "")
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


def load_candidates(path: Path) -> dict[str, dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get("candidates", [])
    if not isinstance(rows, list) or len(rows) != 45:
        raise RuntimeError("candidate file must contain exactly 45 candidates")
    return {str(row["candidateId"]): row for row in rows}


def validate(
    value: dict[str, Any],
    candidates: dict[str, dict[str, Any]],
) -> list[str]:
    errors: list[str] = []
    candidate_id = str(value.get("candidateId") or "")
    candidate = candidates.get(candidate_id)
    if candidate is None:
        errors.append("unknown candidateId")
        return errors
    if value.get("schema") != "axm-asoiaf-agot-human-review-intake/1":
        errors.append("schema mismatch")
    if value.get("parentClaimId", "") != candidate.get("parentClaimId", ""):
        errors.append("parent claim mismatch")
    if value.get("parentRecordFingerprint", "") != candidate.get(
        "parentRecordFingerprint",
        "",
    ):
        errors.append("parent record fingerprint mismatch")
    if len(str(value.get("reviewer") or "").strip()) < 3:
        errors.append("named reviewer missing")
    action = value.get("action")
    if action not in ALLOWED:
        errors.append("invalid action")
    if not str(value.get("rationale") or "").strip():
        errors.append("rationale missing")
    if action == "correct" and not str(value.get("correctedStatement") or "").strip():
        errors.append("corrected statement missing")
    if action == "split" and len(value.get("splitStatements") or []) < 2:
        errors.append("split statements missing")
    if action == "merge" and not value.get("mergeCandidateIds"):
        errors.append("merge candidate identities missing")
    if not HEX64.fullmatch(str(value.get("databaseSha256") or "")):
        errors.append("database SHA-256 invalid")
    if not HEX64.fullmatch(str(value.get("sourceExcerptSha256") or "")):
        errors.append("source excerpt SHA-256 invalid")
    binding = value.get("sourceBinding") or {}
    expected = candidate["sourceBinding"]
    for key in ("sourceId", "editionKey", "unitOrder", "paragraphIndex"):
        if binding.get(key) != expected.get(key):
            errors.append(f"source binding mismatch: {key}")
    expected_text = str(expected.get("textDigest") or "")
    if expected_text and binding.get("storedTextDigest") != expected_text:
        errors.append("stored text digest mismatch")
    if value.get("executed") is not False:
        errors.append("intake must remain unexecuted")
    if value.get("canonEffect") != "none" or value.get("graphEffect") != "none":
        errors.append("intake authority boundary changed")
    if FORBIDDEN_KEYS.intersection(walk_keys(value)):
        errors.append("source text field is forbidden")
    observed = value.get("intakeSha256")
    candidate_value = dict(value)
    candidate_value.pop("intakeSha256", None)
    expected_digest = hashlib.sha256(canonical(candidate_value)).hexdigest()
    if observed != expected_digest:
        errors.append("intake self-digest mismatch")
    return errors


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path")
    parser.add_argument("--candidates", required=True)
    args = parser.parse_args(argv)
    candidates = load_candidates(Path(args.candidates))
    target = Path(args.path)
    paths = sorted(target.glob("*.json")) if target.is_dir() else [target]
    results = []
    failed = 0
    for path in paths:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            errors = validate(value, candidates)
        except Exception as exc:
            errors = [f"invalid intake: {exc}"]
        failed += bool(errors)
        results.append({"path": path.name, "passed": not errors, "errors": errors})
    output = {
        "schema": "axm-asoiaf-agot-human-review-intake-validation/1",
        "status": (
            "PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR"
            if paths and failed == 0
            else "REFUSE_INVALID_OR_INCOMPLETE_INTAKE"
        ),
        "checked": len(paths),
        "failed": failed,
        "results": results,
        "validatorExecutedTransaction": False,
        "executedHumanTransactions": 0,
        "canonEffect": "none",
        "graphEffect": "none",
    }
    print(json.dumps(output, indent=2, ensure_ascii=False, sort_keys=True))
    return 0 if output["status"].startswith("PASS_") else 3


if __name__ == "__main__":
    raise SystemExit(main())
