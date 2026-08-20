#!/usr/bin/env python3
"""Verify the static ASOIAF repository-state successor component."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent


def load(name: str) -> Any:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def main() -> int:
    components = load("COMPONENTS.json")
    contract = load("CONTRACT.json")
    historical = load("HISTORICAL_PATCH.json")
    holds = load("HOLDS.json")
    inventory = load("INVENTORY.json")
    policy = load("POLICY.json")
    receipt = load("RECEIPT.json")

    checks: list[dict[str, Any]] = []

    def check(condition: bool, label: str) -> None:
        checks.append({"label": label, "passed": bool(condition)})
        if not condition:
            raise AssertionError(label)

    rows = components["components"]
    packet = historical["packet"]

    check(contract["schema"] == "axm-asoiaf-repository-state-operator-contract/1", "contract schema")
    check(contract["componentId"] == "asoiaf-repository-state-operator-v1", "component identity")
    check(contract["standing"] == "repository-native-read-only-state-successor", "successor standing")
    check(contract["operation"] == "derive-exact-checkout-state-and-hash-declared-evidence", "bounded operation")
    check(packet["filename"] == "axm-canon-state-refresh-v0.2.tar.zst", "historical packet filename")
    check(packet["bytes"] == 3596, "historical packet byte count")
    check(packet["sha256"] == "bd4b5f0d5fb46d9cc50e100f8911f7f066f8257c20056fc0928014576a47e533", "historical packet digest")
    check(packet["materialized"] is False, "historical packet absent")
    check(historical["patch"]["sha256"] == "34ddb453952805d99e51ed9638e84871bfa455b566272a05ab13916a096d1b28", "historical patch digest")
    check(historical["repositoryReplay"]["sha256"] == "09dc60b62e0dcd935417dc71b2b9ac0a81d7f3243ea26def36270d2a657c7ac3", "historical replay digest")
    check(historical["preparedAgainst"]["baseCommit"] == "fec0ddc9a5697d465ac46e55b7e3cb7647221952", "historical base commit")
    check(historical["currentPolicy"]["applyHistoricalPatch"] is False, "historical patch application forbidden")
    check(components["successorCount"] == 7 and len(rows) == 7, "seven successor lanes")
    check(len({row["componentId"] for row in rows}) == 7, "unique successor identities")
    check(inventory["sourcePayloadPresent"] is False, "no source payload")

    for row in rows:
        check(row["repositoryPath"].startswith("asoiaf/public/continuation/"), f"repository path bounded: {row['componentId']}")
        check(row["evidencePath"] == f"{row['repositoryPath']}/README.md", f"evidence path bound: {row['componentId']}")
        check(row["predecessorArchive"]["materialized"] is False, f"predecessor absent: {row['componentId']}")
        check(row["predecessorArchive"]["bytes"] > 0 and len(row["predecessorArchive"]["sha256"]) == 64, f"predecessor identity complete: {row['componentId']}")

    check(inventory["fileCount"] == 11, "inventory file count")
    check(len(inventory["files"]) == 11, "inventory row count")
    check(all((ROOT / row["path"]).is_file() for row in inventory["files"]), "all component files present")
    check(contract["componentId"] in {row["componentId"] for row in rows}, "self successor registered")
    check(set(contract["supportingSurfaces"]) == {
        "asoiaf/public/continuation/2026-08-18-v3/ADMISSION.json",
        "asoiaf/public/continuation/2026-08-19-public-admission-stack-v1/STACK.json",
    }, "supporting surfaces declared")
    check(receipt["qualification"]["staticLiveChecks"] == {"passed": 50, "total": 50} and receipt["qualification"]["staticArchiveReplayChecks"] == {"passed": 50, "total": 50}, "qualification totals")
    check(
        holds["counts"]["continuationV3LanesWithoutSuccessor"] == 0
        and holds["counts"]["unmaterializedV3PredecessorArchives"] == 7
        and receipt["authorityBoundary"]["automaticCanonPromotions"] == 0
        and receipt["authorityBoundary"]["automaticGraphMutations"] == 0
        and receipt["stateStanding"]["v4_2Built"] is False
        and receipt["stateStanding"]["v4_2Claimed"] is False,
        "authority and hold boundary",
    )

    if len(checks) != 50:
        raise AssertionError(f"verifier defect: expected 50 checks, executed {len(checks)}")

    result = {
        "schema": "axm-asoiaf-repository-state-static-verification/1",
        "componentId": contract["componentId"],
        "passed": sum(1 for row in checks if row["passed"]),
        "total": len(checks),
        "status": "PASS",
        "warningsAsErrors": os.environ.get("PYTHONWARNINGS") == "error",
        "successorLanes": 7,
        "unmaterializedPredecessors": 7,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "v4_2Built": False,
        "v4_2Claimed": False,
    }
    sys.stdout.write(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
