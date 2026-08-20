#!/usr/bin/env python3
"""Emit read-only ASOIAF continuation state for the exact checkout."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

COMPONENT_ROOT = Path(__file__).resolve().parent
REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


def load(name: str) -> Any:
    return json.loads((COMPONENT_ROOT / name).read_text(encoding="utf-8"))


def git_required(*arguments: str) -> str:
    completed = subprocess.run(
        ["git", *arguments],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
        shell=False,
    )
    return completed.stdout.strip()


def git_optional(*arguments: str) -> str | None:
    completed = subprocess.run(
        ["git", *arguments],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
        shell=False,
    )
    if completed.returncode != 0:
        return None
    value = completed.stdout.strip()
    return value or None


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def inside_repository(path: Path) -> bool:
    try:
        path.resolve().relative_to(REPOSITORY_ROOT.resolve())
        return True
    except ValueError:
        return False


def main() -> int:
    contract = load("CONTRACT.json")
    components = load("COMPONENTS.json")
    historical = load("HISTORICAL_PATCH.json")
    holds = load("HOLDS.json")

    evidence: list[dict[str, Any]] = []
    missing: list[str] = []
    rejected: list[str] = []

    for row in components["components"]:
        relative = row["evidencePath"]
        path = REPOSITORY_ROOT / relative
        if not inside_repository(path):
            rejected.append(relative)
            continue
        if not path.is_file():
            missing.append(relative)
            continue
        evidence.append(
            {
                "lane": row["lane"],
                "componentId": row["componentId"],
                "repositoryPath": row["repositoryPath"],
                "evidencePath": relative,
                "evidenceBytes": path.stat().st_size,
                "evidenceSha256": digest(path),
                "predecessorArchive": row["predecessorArchive"],
            }
        )

    head = git_required("rev-parse", "HEAD")
    tree = git_required("rev-parse", "HEAD^{tree}")
    branch = git_optional("symbolic-ref", "--short", "-q", "HEAD")
    historical_base = historical["preparedAgainst"]["baseCommit"]

    all_present = len(evidence) == components["successorCount"] and not missing and not rejected
    standing = "SEVEN_SUCCESSOR_LANES_PRESENT" if all_present else "HOLD_REPOSITORY_SURFACE"

    result = {
        "schema": "axm-asoiaf-exact-checkout-state/1",
        "operator": contract["componentId"],
        "standing": standing,
        "repository": "BigBirdReturns/axm-canon",
        "headCommit": head,
        "headTree": tree,
        "branch": branch,
        "successorEvidence": evidence,
        "successorEvidenceCount": len(evidence),
        "missingEvidence": missing,
        "rejectedEvidence": rejected,
        "historicalPatch": {
            "preparedAgainstCommit": historical_base,
            "applicableToExactHead": head == historical_base,
            "applicationAuthorized": False,
            "packetMaterialized": historical["packet"]["materialized"],
        },
        "holds": holds,
        "nonEffects": {
            "historicalPatchApplied": False,
            "checkoutChanged": False,
            "repositoryReset": False,
            "remoteFetched": False,
            "repositoryFilesWritten": 0,
            "commitsCreated": 0,
            "branchesUpdated": 0,
            "sourceTextIngested": False,
            "predecessorArchivesMaterialized": 0,
            "canonPromotions": 0,
            "graphMutations": 0,
            "v4_2Built": False,
            "v4_2Claimed": False
        },
        "authorityBoundary": contract["authorityBoundary"]
    }
    sys.stdout.write(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return 0 if all_present else 5


if __name__ == "__main__":
    raise SystemExit(main())
