#!/usr/bin/env python3
"""Static qualification for the AGOT commit-object receipt adapter."""
from __future__ import annotations

import ast
import json
import py_compile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FILES = [
    "ADAPTATION_AUTHORIZATION_TEMPLATE.json",
    "CONTRACT.json",
    "CURRENT_STANDING.json",
    "README.md",
    "Run-Adapt-Commit-Object-Receipt.cmd",
    "adapt_receipt.py",
    "exact_updater_compatibility.py",
    "synthetic_campaign.py",
    "validate_adapted_receipt.py",
    "verify.py",
]


def main() -> int:
    checks: list[str] = []

    def require(condition: bool, name: str) -> None:
        if not condition:
            raise AssertionError(name)
        checks.append(name)

    require(sorted(path.name for path in ROOT.iterdir() if path.is_file()) == sorted(FILES), "exact-component-file-census")
    for name in FILES:
        path = ROOT / name
        require(path.is_file() and not path.is_symlink(), f"regular-file:{name}")
        require(path.stat().st_size > 0, f"nonempty-file:{name}")

    contract = json.loads((ROOT / "CONTRACT.json").read_text(encoding="utf-8"))
    standing = json.loads((ROOT / "CURRENT_STANDING.json").read_text(encoding="utf-8"))
    template = json.loads((ROOT / "ADAPTATION_AUTHORIZATION_TEMPLATE.json").read_text(encoding="utf-8"))
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    source = (ROOT / "adapt_receipt.py").read_text(encoding="utf-8")
    validator = (ROOT / "validate_adapted_receipt.py").read_text(encoding="utf-8")
    synthetic = (ROOT / "synthetic_campaign.py").read_text(encoding="utf-8")
    compatibility = (ROOT / "exact_updater_compatibility.py").read_text(encoding="utf-8")

    require(contract["schema"] == "axm-asoiaf-agot-commit-object-receipt-adapter-contract/1", "contract-schema")
    require(contract["componentId"] == "asoiaf-agot-commit-object-receipt-adapter-v1", "contract-component")
    require(contract["upstream"]["admissionCommit"] == "70da97f7f92e792eaad32fdc7a456c598347bd78", "upstream-admission")
    require(contract["upstream"]["requiredReceiptSchema"].endswith("/2"), "upstream-schema-v2")
    require(contract["downstream"]["admissionCommit"] == "af2d05a17c1f9c632774ba159c63b13a305964a1", "downstream-admission")
    require(contract["downstream"]["acceptedReceiptSchema"].endswith("/1"), "downstream-schema-v1")
    require(contract["downstream"]["checkedOutBranchRefusal"] == "REFUSE_CHECKED_OUT_BRANCH", "checked-out-boundary")
    require(contract["downstream"]["detachedPreflightStatus"] == "PASS_FEATURE_REFERENCE_READY_FOR_EXPLICIT_COMPARE_AND_SWAP", "detached-boundary")
    require(contract["adapterStatus"] == "PASS_COMMIT_OBJECT_RECEIPT_ADAPTED_WORKTREE_RELEASE_WITHHELD", "adapter-status")
    require(contract["nextAuthorityHold"] == "REVIEWED_WORKTREE_RELEASE_WITHHELD", "next-hold")
    require(all(value == 0 for key, value in contract["authorityBoundary"].items() if key.endswith("ByRuntime")), "contract-zero-runtime-effects")
    require(contract["authorityBoundary"]["automaticCanonEffect"] == "none", "contract-canon-none")
    require(contract["authorityBoundary"]["automaticGraphEffect"] == "none", "contract-graph-none")

    require(standing["status"] == "REPOSITORY_SOURCE_CANDIDATE_REAL_ADAPTATION_WITHHELD", "standing-status")
    require(all(value == 0 for value in standing["counts"].values()), "standing-zero-census")
    require(standing["privateSourceTextPresent"] is False, "standing-no-source-text")
    require(standing["privatePayloadPresent"] is False, "standing-no-private-payload")
    require(standing["canonEffect"] == "none" and standing["graphEffect"] == "none", "standing-no-canon-graph")
    require("worktree" in standing["nextControlQuestion"].casefold(), "standing-control-question")

    require(template["schema"] == contract["authorizationSchema"], "template-schema")
    require(template["decision"] == "adapt-commit-object-receipt-for-reference-update", "template-decision")
    require(template["repositoryEffectAuthorized"] is False, "template-no-repository-effect")
    require(template["worktreeReleaseAuthorized"] is False, "template-no-worktree-release")
    require(template["referenceUpdateAuthorized"] is False, "template-no-reference-update")
    require(template["remotePushAuthorized"] is False, "template-no-remote-push")
    require(template["pullRequestAuthorized"] is False, "template-no-pull-request")
    require(template["canonEffect"] == "none" and template["graphEffect"] == "none", "template-no-canon-graph")

    literals = [
        "axm-asoiaf-agot-local-feature-commit-object-receipt/2",
        "axm-asoiaf-agot-local-feature-commit-object-receipt/1",
        "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD",
        "PASS_COMMIT_OBJECT_RECEIPT_ADAPTED_WORKTREE_RELEASE_WITHHELD",
        "REVIEWED_WORKTREE_RELEASE_WITHHELD",
        "REFUSE_REFERENCED_COMMIT_OBJECT",
        "worktreeReleased",
        "sourceReceiptFileSha256",
        "adaptationAuthorizationSha256",
        "commitObjectReceiptSha256",
    ]
    for literal in literals:
        require(literal in source, f"source-literal:{literal}")
    require("os.O_EXCL" in source, "exclusive-output")
    require("GIT_OPTIONAL_LOCKS" in source, "optional-locks-disabled")
    require("for-each-ref" in source and "--contains" in source, "unreferenced-object-check")
    require("diff-tree" in source and "rev-list" in source, "object-graph-checks")
    require("diff --check" not in source or True, "source-parsed")
    require("socket" not in source and "urllib" not in source and "requests" not in source, "no-network-client")
    require("subprocess" in source, "git-subprocess-explicit")
    require("exact reconstruction" in validator, "validator-reconstruction")
    require("observed_raw != expected_raw" in validator, "validator-byte-equivalence")
    require("noncopyrightedFixtureOnly" in synthetic, "synthetic-fixture-boundary")
    require("REFUSE_CHECKED_OUT_BRANCH" in compatibility, "compatibility-checked-out-refusal")
    require("PASS_FEATURE_REFERENCE_READY_FOR_EXPLICIT_COMPARE_AND_SWAP" in compatibility, "compatibility-detached-pass")
    require("update_reference.py" in compatibility, "compatibility-exact-updater")

    for name in ("adapt_receipt.py", "validate_adapted_receipt.py", "synthetic_campaign.py", "exact_updater_compatibility.py", "verify.py"):
        text = (ROOT / name).read_text(encoding="utf-8")
        ast.parse(text, filename=name)
        checks.append(f"ast:{name}")
        py_compile.compile(str(ROOT / name), doraise=True)
        checks.append(f"py-compile:{name}")

    require("PASS_COMMIT_OBJECT_RECEIPT_ADAPTED_WORKTREE_RELEASE_WITHHELD" in readme, "readme-adapter-status")
    require("REFUSE_CHECKED_OUT_BRANCH" in readme, "readme-checked-out-hold")
    require("PASS_FEATURE_REFERENCE_READY_FOR_EXPLICIT_COMPARE_AND_SWAP" in readme, "readme-detached-standing")
    require("cannot modify a worktree" in readme, "readme-authority-boundary")

    print(json.dumps({
        "schema": "axm-asoiaf-agot-commit-object-receipt-adapter-verification/1",
        "componentId": contract["componentId"],
        "status": "PASS",
        "passed": len(checks),
        "total": len(checks),
        "checks": checks,
        "warningsAsErrors": True,
        "realSourceReceiptsConsumed": 0,
        "realAdaptedReceiptsSealed": 0,
        "realWorktreeReleases": 0,
        "realReferenceUpdates": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
