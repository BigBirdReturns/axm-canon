#!/usr/bin/env python3
"""Verify the seven-lane ASOIAF public admission stack v2."""

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
    inventory = load("INVENTORY.json")
    policy = load("POLICY.json")
    receipt = load("RECEIPT.json")
    stack = load("STACK.json")

    checks: list[dict[str, Any]] = []

    def check(condition: bool, label: str) -> None:
        checks.append({"label": label, "passed": bool(condition)})
        if not condition:
            raise AssertionError(label)

    successors = stack["successors"]
    counts = stack["counts"]
    predecessor = stack["predecessorStack"]
    holds = stack["remainingHolds"]
    authority = stack["authorityBoundary"]

    check(stack["schema"] == "axm-asoiaf-public-admission-stack/2", "stack schema")
    check(stack["stackId"] == "asoiaf-public-admission-stack-v2", "stack identity")
    check(stack["standing"] == "seven-successor-lanes-admitted-predecessors-held", "stack standing")
    check(predecessor["path"] == "asoiaf/public/continuation/2026-08-19-public-admission-stack-v1/STACK.json", "historical stack path")
    check(predecessor["standing"] == "historical-five-successor-snapshot" and predecessor["rewritten"] is False, "historical stack retained")
    check(counts["successorLanes"] == 7, "seven successor lanes declared")
    check(len(successors) == 7, "seven successor rows")
    check(len({row["componentId"] for row in successors}) == 7, "seven unique successor identities")
    check(counts["successorLanesWithoutRepositorySurface"] == 0, "no missing successor lane")
    check(counts["unmaterializedPredecessorArchives"] == 7, "seven predecessor holds")
    check(stack["stateBinding"]["operatorPath"] == "asoiaf/public/continuation/2026-08-20-repository-state-operator-v1/state.py" and stack["stateBinding"]["mode"] == "runtime-exact-checkout", "runtime state binding")
    check(holds["continuationWave"]["materialized"] is False and len(holds["continuationWave"]["sha256"]) == 64, "continuation wave held")

    for row in successors:
        check(row["repositoryPath"].startswith("asoiaf/public/continuation/"), f"bounded successor path: {row['componentId']}")
        check(row["predecessorArchive"]["materialized"] is False and len(row["predecessorArchive"]["sha256"]) == 64, f"predecessor held: {row['componentId']}")

    check(holds["privateV4_1Root"]["materialized"] is False and holds["privateV4_1Root"]["bytes"] == 244436743 and len(holds["privateV4_1Root"]["sha256"]) == 64, "private v4.1 root held")
    check(holds["privateV4_1Root"]["v4_2Built"] is False and holds["privateV4_1Root"]["v4_2Claimed"] is False, "v4.2 remains unbuilt and unclaimed")
    check(inventory["fileCount"] == 7 and len(inventory["files"]) == 7, "seven-file inventory")
    check(all((ROOT / row["path"]).is_file() for row in inventory["files"]), "all inventory files present")
    check(receipt["qualification"]["staticLiveChecks"] == {"passed": 32, "total": 32} and receipt["qualification"]["staticArchiveReplayChecks"] == {"passed": 32, "total": 32}, "qualification totals")
    check(
        counts["automaticCanonPromotions"] == 0
        and counts["automaticGraphMutations"] == 0
        and authority["automaticCanonEffect"] == "none"
        and authority["automaticGraphEffect"] == "none"
        and authority["privateIntegrationEffect"] == "none"
        and policy["authorityBoundary"]["successfulQualificationDoesNotAuthorizePrivateIntegration"] is True
        and receipt["authorityBoundary"]["automaticCanonPromotions"] == 0
        and receipt["authorityBoundary"]["automaticGraphMutations"] == 0,
        "authority boundary retained",
    )

    if len(checks) != 32:
        raise AssertionError(f"verifier defect: expected 32 checks, executed {len(checks)}")

    result = {
        "schema": "axm-asoiaf-public-admission-stack-verification/2",
        "stackId": stack["stackId"],
        "passed": sum(1 for row in checks if row["passed"]),
        "total": len(checks),
        "status": "PASS",
        "warningsAsErrors": os.environ.get("PYTHONWARNINGS") == "error",
        "successorLanes": counts["successorLanes"],
        "unmaterializedPredecessorArchives": counts["unmaterializedPredecessorArchives"],
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "v4_2Built": False,
        "v4_2Claimed": False,
    }
    sys.stdout.write(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
