#!/usr/bin/env python3
"""Inspect exact ASOIAF v4.2 recovery inputs without copying or extraction."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VERSION = "asoiaf-v4.2-recovery-operator-v1"

EXPECTED = {
    "private-v4.1-root": {
        "filename": "asoiaf-private-world-estate-v4.1.tar.zst",
        "bytes": 244_436_743,
        "sha256": "48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7",
    },
    "fourth-generation-frontier": {
        "filename": "asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst",
        "bytes": 249_906,
        "sha256": "a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02",
    },
}

NON_EFFECTS = {
    "copiedInputs": False,
    "extractedArchives": False,
    "reconstructedArchives": False,
    "searchedForSubstitutes": False,
    "downloadedRemoteContent": False,
    "invokedShell": False,
    "builtV4_2": False,
    "claimedV4_2": False,
    "canonPromotions": 0,
    "graphMutations": 0,
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inspect_candidate(role: str, supplied: str) -> dict[str, Any]:
    expected = EXPECTED[role]
    path = Path(supplied)
    record: dict[str, Any] = {
        "role": role,
        "suppliedPath": supplied,
        "expectedFilename": expected["filename"],
        "expectedBytes": expected["bytes"],
        "expectedSha256": expected["sha256"],
        "observedState": "unknown",
        "accepted": False,
    }

    try:
        metadata = path.lstat()
    except FileNotFoundError:
        record["observedState"] = "absent"
        record["decision"] = "HOLD_TRANSPORT"
        return record
    except OSError as exc:
        record["observedState"] = "unreadable"
        record["decision"] = "REJECT_FILE_TYPE"
        record["errorType"] = type(exc).__name__
        return record

    if stat.S_ISLNK(metadata.st_mode):
        record["observedState"] = "symlink"
        record["decision"] = "REJECT_SYMLINK"
        return record
    if not stat.S_ISREG(metadata.st_mode):
        record["observedState"] = "not-regular-file"
        record["decision"] = "REJECT_FILE_TYPE"
        return record

    record["observedFilename"] = path.name
    record["observedBytes"] = metadata.st_size
    if path.name != expected["filename"]:
        record["observedState"] = "filename-mismatch"
        record["decision"] = "REJECT_FILENAME"
        return record
    if metadata.st_size != expected["bytes"]:
        record["observedState"] = "size-mismatch"
        record["decision"] = "REJECT_SIZE"
        return record

    observed_digest = sha256_file(path)
    record["observedSha256"] = observed_digest
    if observed_digest != expected["sha256"]:
        record["observedState"] = "digest-mismatch"
        record["decision"] = "REJECT_DIGEST"
        return record

    record["observedState"] = "exact"
    record["decision"] = "EXACT_INPUT_VERIFIED"
    record["accepted"] = True
    return record


def build_receipt(private_path: str, frontier_path: str) -> dict[str, Any]:
    absolute_private = os.path.abspath(private_path)
    absolute_frontier = os.path.abspath(frontier_path)
    collision = absolute_private == absolute_frontier

    inspections = [
        inspect_candidate("private-v4.1-root", private_path),
        inspect_candidate("fourth-generation-frontier", frontier_path),
    ]

    if collision:
        decision = "REJECT_ROLE_COLLISION"
    elif any(str(item.get("decision", "")).startswith("REJECT_") for item in inspections):
        decision = next(
            str(item["decision"])
            for item in inspections
            if str(item.get("decision", "")).startswith("REJECT_")
        )
    elif all(item.get("accepted") is True for item in inspections):
        decision = "EXACT_INPUT_PAIR_VERIFIED_ONLY"
    else:
        decision = "HOLD_TRANSPORT"

    return {
        "schema": "axm-asoiaf-v4.2-recovery-inspection-receipt/1",
        "operator": VERSION,
        "inspectedAt": datetime.now(timezone.utc).isoformat(),
        "decision": decision,
        "roleCollision": collision,
        "inputs": inspections,
        "nonEffects": dict(NON_EFFECTS),
        "authorityBoundary": {
            "successfulInspectionDoesNotAuthorizeExtraction": True,
            "successfulInspectionDoesNotAuthorizeIntegration": True,
            "successfulInspectionDoesNotBuildV4_2": True,
            "automaticCanonEffect": "none",
            "automaticGraphEffect": "none",
            "privateIntegrationEffect": "none",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-v4-1", required=True)
    parser.add_argument("--frontier", required=True)
    parser.add_argument("--receipt")
    args = parser.parse_args()

    receipt = build_receipt(args.private_v4_1, args.frontier)
    rendered = json.dumps(receipt, indent=2, sort_keys=True) + "\n"
    if args.receipt:
        output = Path(args.receipt)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    sys.stdout.write(rendered)

    if receipt["decision"] == "EXACT_INPUT_PAIR_VERIFIED_ONLY":
        return 0
    if receipt["decision"] == "HOLD_TRANSPORT":
        return 3
    return 4


if __name__ == "__main__":
    raise SystemExit(main())
