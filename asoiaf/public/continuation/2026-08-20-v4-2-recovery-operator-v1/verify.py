#!/usr/bin/env python3
"""Verify the repository-native ASOIAF v4.2 recovery operator component."""

from __future__ import annotations

# The sibling operator.py retains its historical filename. Remove this script
# directory before importing the standard library so that Python 3.11 cannot
# resolve that sibling in place of the stdlib operator module.
import sys
if sys.path:
    sys.path.pop(0)

import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent


def load(name: str) -> Any:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def main() -> int:
    contract = load("CONTRACT.json")
    inputs = load("INPUTS.json")
    inventory = load("INVENTORY.json")
    last_run = load("LAST_RUN.json")
    policy = load("POLICY.json")
    receipt = load("RECEIPT.json")
    vectors = load("TEST_VECTORS.json")

    checks: list[dict[str, Any]] = []

    def check(condition: bool, label: str) -> None:
        checks.append({"label": label, "passed": bool(condition)})
        if not condition:
            raise AssertionError(label)

    required = contract["requiredInputs"]
    private = required[0]
    frontier = required[1]
    predecessor = contract["predecessorArchive"]
    forbidden = contract["forbiddenEffects"]
    decisions = policy["decisions"]
    vector_rows = vectors["vectors"]

    check(contract["schema"] == "axm-asoiaf-v4.2-recovery-operator-contract/1", "contract schema")
    check(contract["componentId"] == "asoiaf-v4.2-recovery-operator-v1", "component identity")
    check(contract["standing"] == "repository-native-fail-closed-successor", "successor standing")
    check(contract["operation"] == "inspect-exact-input-candidates-without-extraction-or-integration", "bounded operation")
    check(len(required) == 2, "two required inputs")
    check(private["filename"] == "asoiaf-private-world-estate-v4.1.tar.zst", "private filename")
    check(private["bytes"] == 244436743, "private byte count")
    check(private["sha256"] == "48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7", "private digest")
    check(private["materializedInRepository"] is False, "private input absent from repository")
    check(frontier["filename"] == "asoiaf-fourth-generation-dragon-frontier-renewal-v1.tar.zst", "frontier filename")
    check(frontier["bytes"] == 249906, "frontier byte count")
    check(frontier["sha256"] == "a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02", "frontier digest")
    check(frontier["materializedInRepository"] is False, "frontier input absent from repository")
    check(predecessor["filename"] == "asoiaf-v4.2-recovery-kit-v0.1.tar.zst", "predecessor filename")
    check(predecessor["bytes"] == 23112, "predecessor byte count")
    check(predecessor["sha256"] == "538410c5470f44e325952fe2c2b47142276be0670ca594361f3035500dd64a75", "predecessor digest")
    check(predecessor["materialized"] is False, "predecessor remains absent")
    check(predecessor["exactIdentityClaimed"] is False, "no predecessor identity claim")
    check(predecessor["byteReproductionClaimed"] is False, "no predecessor byte claim")
    check(forbidden["searchForSubstitute"] is True, "substitute search forbidden")
    check(forbidden["downloadRemoteContent"] is True, "remote download forbidden")
    check(forbidden["followSymlink"] is True, "symlink following forbidden")
    check(forbidden["acceptWrongFilename"] is True, "wrong filename forbidden")
    check(forbidden["acceptWrongByteCount"] is True, "wrong byte count forbidden")
    check(forbidden["acceptDigestMismatch"] is True, "digest mismatch forbidden")
    check(forbidden["copyInput"] is True, "input copy forbidden")
    check(forbidden["extractArchive"] is True, "archive extraction forbidden")
    check(forbidden["reconstructArchive"] is True, "archive reconstruction forbidden")
    check(forbidden["buildV4_2"] is True, "v4.2 build forbidden")
    check(forbidden["claimV4_2"] is True, "v4.2 claim forbidden")
    check(forbidden["promoteCanon"] is True, "canon promotion forbidden")
    check(forbidden["mutateGraph"] is True, "graph mutation forbidden")
    check(forbidden["invokeShell"] is True, "shell invocation forbidden")
    check(decisions["candidateAbsent"] == "HOLD_TRANSPORT", "absent candidate decision")
    check(decisions["candidateSymlink"] == "REJECT_SYMLINK", "symlink decision")
    check(decisions["roleCollision"] == "REJECT_ROLE_COLLISION", "role collision decision")
    check(decisions["bothExact"] == "EXACT_INPUT_PAIR_VERIFIED_ONLY", "exact pair decision")
    check(len(policy["nonEffects"]) == 10 and len(set(policy["nonEffects"])) == 10, "ten unique non-effects")
    check(inputs["jointGate"]["allInputsRequired"] is True, "all inputs required")
    check(inputs["jointGate"]["samePathAllowed"] is False, "same path forbidden")
    check(inputs["jointGate"]["partialStanding"] == "HOLD_TRANSPORT", "partial standing")
    check(inputs["jointGate"]["exactPairStanding"] == "EXACT_INPUT_PAIR_VERIFIED_ONLY", "pair standing")
    check(len(vector_rows) == 8, "eight adversarial vectors")
    check(len({row["id"] for row in vector_rows}) == 8, "unique vector identities")
    check({row["expectedExit"] for row in vector_rows} == {3, 4}, "bounded vector exits")
    check(vectors["everyVectorRequires"]["builtV4_2"] is False and vectors["everyVectorRequires"]["claimedV4_2"] is False, "vectors preserve v4.2 non-effect")
    check(last_run["decision"] == "HOLD_TRANSPORT", "retained run holds")
    check(all(row["observedState"] == "absent" and row["accepted"] is False for row in last_run["inputs"]), "retained inputs absent")
    check(inventory["fileCount"] == 11 and len(inventory["files"]) == 11, "eleven-file inventory")
    check(all((ROOT / row["path"]).is_file() for row in inventory["files"]), "inventory files present")
    check(receipt["qualification"]["liveChecks"] == {"passed": 52, "total": 52} and receipt["qualification"]["archiveReplayChecks"] == {"passed": 52, "total": 52}, "qualification totals")
    check(receipt["authorityBoundary"]["automaticCanonPromotions"] == 0 and receipt["authorityBoundary"]["automaticGraphMutations"] == 0 and receipt["authorityBoundary"]["v4_2Built"] is False and receipt["authorityBoundary"]["v4_2Claimed"] is False, "authority boundary retained")

    if len(checks) != 52:
        raise AssertionError(f"verifier defect: expected 52 checks, executed {len(checks)}")

    result = {
        "schema": "axm-asoiaf-v4.2-recovery-verification/1",
        "componentId": contract["componentId"],
        "passed": sum(1 for row in checks if row["passed"]),
        "total": len(checks),
        "status": "PASS",
        "warningsAsErrors": os.environ.get("PYTHONWARNINGS") == "error",
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "v4_2Built": False,
        "v4_2Claimed": False
    }
    sys.stdout.write(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
