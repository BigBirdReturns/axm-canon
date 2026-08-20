#!/usr/bin/env python3
from __future__ import annotations

import ast
import hashlib
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OPERATOR_PATH = ROOT / "operator.py"


def load_operator():
    spec = importlib.util.spec_from_file_location("asoiaf_v4_2_recovery_operator", OPERATOR_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("operator module could not be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    operator = load_operator()
    checks: list[str] = []

    admission = json.loads((ROOT / "ADMISSION.json").read_text(encoding="utf-8"))
    contract = json.loads((ROOT / "CONTRACT.json").read_text(encoding="utf-8"))
    current = json.loads((ROOT / "CURRENT_HOLD.json").read_text(encoding="utf-8"))

    require(admission["componentId"] == "asoiaf-v4-2-recovery-source-v1", "component identity")
    require(admission["standing"].startswith("repository-native-fail-closed"), "standing")
    checks.append("admission-identity")

    required = admission["requiredInputs"]
    require(len(required) == 2, "required input count")
    require(required[0]["bytes"] == 244436743, "private archive byte count")
    require(required[0]["sha256"] == "48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7", "private archive digest")
    require(required[1]["bytes"] == 249906, "campaign archive byte count")
    require(required[1]["sha256"] == "a3df744e910e8d1e20606e773024911182378b3e91e5eab9fca04f991f5a3b02", "campaign archive digest")
    checks.append("exact-input-identities")

    predecessor = admission["sealedPredecessor"]
    require(predecessor["bytes"] == 23112, "predecessor byte count")
    require(predecessor["sha256"] == "538410c5470f44e325952fe2c2b47142276be0670ca594361f3035500dd64a75", "predecessor digest")
    require(predecessor["materialized"] is False, "predecessor materialization")
    require(predecessor["byteReproductionClaimed"] is False, "predecessor reproduction")
    checks.append("sealed-predecessor-hold")

    local_package = admission["qualifiedLocalPackage"]
    require(local_package["bytes"] == 10686, "local package byte count")
    require(local_package["sha256"] == "76e55f765d05203256fc0111e54a20e809048ac57650b1f2b2f86f76d45edc67", "local package digest")
    require(local_package["repositoryReachable"] is False, "local package reachability")
    require(local_package["materializationClaimed"] is False, "local package materialization claim")
    checks.append("qualified-local-package-boundary")

    boundary = admission["authorityBoundary"]
    for key in (
        "operatorMayCopyInputs",
        "operatorMayExtractInputs",
        "operatorMayReconstructInputs",
        "operatorMaySubstituteInputs",
        "operatorMayIntegrateInputs",
        "operatorMayBuildV4_2",
        "operatorMayClaimV4_2",
    ):
        require(boundary[key] is False, key)
    require(boundary["automaticCanonEffect"] == "none", "canon effect")
    require(boundary["automaticGraphEffect"] == "none", "graph effect")
    checks.append("authority-boundary")

    require(current["status"] == "HOLD_EXACT_ARCHIVES_UNAVAILABLE", "current hold status")
    require(current["exitCode"] == 10, "current hold exit")
    require(all(item["materialized"] is False for item in current["requiredInputs"]), "current materialization")
    require(current["effects"]["v4_2Built"] is False, "current build effect")
    require(current["effects"]["v4_2Claimed"] is False, "current claim effect")
    checks.append("current-hold")

    forbidden = set(contract["forbiddenOperations"])
    require("extract-input" in forbidden, "extract refusal")
    require("reconstruct-input" in forbidden, "reconstruction refusal")
    require("substitute-input" in forbidden, "substitution refusal")
    require("build-v4.2" in forbidden and "claim-v4.2" in forbidden, "v4.2 refusal")
    checks.append("contract-refusals")

    source = OPERATOR_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    imported = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    }
    imported.update(
        node.module or ""
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
    )
    banned_imports = {"tarfile", "zipfile", "shutil", "subprocess"}
    require(imported.isdisjoint(banned_imports), f"banned imports present: {imported & banned_imports}")
    banned_attributes = {"extract", "extractall", "unpack_archive", "copy", "copy2", "move", "rename"}
    observed_attributes = {
        node.attr for node in ast.walk(tree) if isinstance(node, ast.Attribute)
    }
    require(observed_attributes.isdisjoint(banned_attributes), f"banned operations present: {observed_attributes & banned_attributes}")
    checks.append("static-operation-boundary")

    with tempfile.TemporaryDirectory(prefix="asoiaf-v4-2-operator-") as tmp:
        root = Path(tmp)
        exact_a = b"alpha"
        exact_b = b"bravo!"
        specs = (
            operator.InputSpec("a", "a.bin", len(exact_a), hashlib.sha256(exact_a).hexdigest()),
            operator.InputSpec("b", "b.bin", len(exact_b), hashlib.sha256(exact_b).hexdigest()),
        )

        code, receipt = operator.evaluate(specs, {"a": root / "missing-a", "b": root / "missing-b"})
        require(code == operator.EXIT_UNAVAILABLE, "missing exit")
        require(receipt["status"] == "HOLD_EXACT_ARCHIVES_UNAVAILABLE", "missing status")
        checks.append("missing-refusal")

        (root / "a.bin").write_bytes(exact_a + b"x")
        (root / "b.bin").write_bytes(exact_b)
        code, receipt = operator.evaluate(specs, {"a": root / "a.bin", "b": root / "b.bin"})
        require(code == operator.EXIT_SIZE_MISMATCH, "size exit")
        require(receipt["status"] == "REFUSE_SIZE_MISMATCH", "size status")
        checks.append("size-refusal")

        (root / "a.bin").write_bytes(b"ALPHA")
        code, receipt = operator.evaluate(specs, {"a": root / "a.bin", "b": root / "b.bin"})
        require(code == operator.EXIT_DIGEST_MISMATCH, "digest exit")
        require(receipt["status"] == "REFUSE_DIGEST_MISMATCH", "digest status")
        checks.append("digest-refusal")

        (root / "a.bin").write_bytes(exact_a)
        code, receipt = operator.evaluate(specs, {"a": root / "a.bin", "b": root / "b.bin"})
        require(code == operator.EXIT_READY, "ready exit")
        require(receipt["status"] == "READY_EXACT_ARCHIVES_VERIFIED", "ready status")
        require(receipt["allExactInputsVerified"] is True, "ready verification")
        ready_boundary = receipt["authorityBoundary"]
        require(ready_boundary["integrationAuthorized"] is False, "ready integration authority")
        require(ready_boundary["v4_2Built"] is False, "ready build effect")
        require(ready_boundary["v4_2Claimed"] is False, "ready claim effect")
        checks.append("ready-without-integration")

    require(admission["automaticCanonPromotions"] == 0, "canon promotions")
    require(admission["automaticGraphMutations"] == 0, "graph mutations")
    require(admission["v4_2Built"] is False and admission["v4_2Claimed"] is False, "v4.2 standing")
    checks.append("zero-authority-effects")

    result = {
        "schema": "axm-asoiaf-v4-2-recovery-source-verification/1",
        "componentId": admission["componentId"],
        "status": "PASS",
        "checks": {"passed": len(checks), "total": len(checks)},
        "checkIds": checks,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "v4_2Built": False,
        "v4_2Claimed": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
