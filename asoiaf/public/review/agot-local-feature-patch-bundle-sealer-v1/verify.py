#!/usr/bin/env python3
"""Static qualification for the AGOT local-feature patch-bundle sealer."""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REQUIRED = {
    "AUTHORIZATION_TEMPLATE.json",
    "CONTRACT.json",
    "CURRENT_STANDING.json",
    "README.md",
    "Run-Seal-Local-Feature-Patch-Bundle.cmd",
    "seal_patch_bundle.py",
    "validate_bundle.py",
    "verify.py",
    "synthetic_campaign.py",
}
TARGETS = [
    "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
    "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
]


def add(checks: list[tuple[str, bool]], name: str, value: bool) -> None:
    checks.append((name, bool(value)))


def main() -> int:
    checks: list[tuple[str, bool]] = []
    names = {path.name for path in ROOT.iterdir() if path.is_file()}
    add(checks, "exact source file census", names == REQUIRED)
    for name in sorted(REQUIRED):
        add(checks, f"required file present: {name}", (ROOT / name).is_file())
        add(checks, f"required file nonempty: {name}", (ROOT / name).stat().st_size > 0)

    contract = json.loads((ROOT / "CONTRACT.json").read_text(encoding="utf-8"))
    standing = json.loads((ROOT / "CURRENT_STANDING.json").read_text(encoding="utf-8"))
    authorization = json.loads((ROOT / "AUTHORIZATION_TEMPLATE.json").read_text(encoding="utf-8"))
    add(checks, "contract schema", contract["schema"] == "axm-asoiaf-agot-local-feature-patch-bundle-sealer-contract/1")
    add(checks, "component identity", contract["componentId"] == "asoiaf-agot-local-feature-patch-bundle-sealer-v1")
    add(checks, "upstream identity", contract["upstream"]["componentId"] == "asoiaf-agot-local-feature-postimage-materializer-v1")
    add(checks, "upstream admission commit", contract["upstream"]["admissionCommit"] == "ca74f4a51a18a754f21bfdbab8ca2782d3c5665b")
    add(checks, "upstream status", contract["upstream"]["requiredStatus"] == "PASS_LOCAL_FEATURE_POSTIMAGES_MATERIALIZED_WORKTREE_APPLICATION_WITHHELD")
    add(checks, "upstream hold", contract["upstream"]["requiredNextAuthorityHold"] == "LOCAL_FEATURE_WORKTREE_APPLICATION_WITHHELD")
    add(checks, "success status", contract["successStatus"] == "PASS_LOCAL_FEATURE_PATCH_BUNDLE_SEALED_WORKTREE_EXECUTOR_COMPATIBILITY_WITHHELD")
    add(checks, "next hold", contract["nextAuthorityHold"] == "WORKTREE_EXECUTOR_COMPATIBILITY_VALIDATION_WITHHELD")
    add(checks, "governed targets", contract["governedTargets"] == TARGETS)
    add(checks, "bundle target files", contract["bundleFiles"][-2:] == TARGETS)
    add(checks, "exact bundle census", len(contract["bundleFiles"]) == 5)
    for key, value in contract["bindingBoundary"].items():
        add(checks, f"binding boundary true: {key}", value is True)
    for key, value in contract["interpretationBoundary"].items():
        add(checks, f"interpretation boundary true: {key}", value is True)
    authority = contract["authorityBoundary"]
    add(checks, "bundle is not worktree application", authority["bundleSealingIsNotWorktreeApplication"] is True)
    for key in (
        "worktreesModifiedByRuntime",
        "liveIndexesModifiedByRuntime",
        "commitsCreatedByRuntime",
        "referencesUpdatedByRuntime",
        "remotePushesByRuntime",
        "pullRequestsOpenedByRuntime",
    ):
        add(checks, f"zero authority count: {key}", authority[key] == 0)
    add(checks, "contract canon effect none", authority["automaticCanonEffect"] == "none")
    add(checks, "contract graph effect none", authority["automaticGraphEffect"] == "none")

    add(checks, "standing schema", standing["schema"] == "axm-asoiaf-agot-local-feature-patch-bundle-sealer-standing/1")
    add(checks, "standing component", standing["componentId"] == contract["componentId"])
    add(checks, "standing held", standing["status"] == "REPOSITORY_SOURCE_CANDIDATE_REAL_PATCH_BUNDLE_WITHHELD")
    for key, value in standing["counts"].items():
        add(checks, f"standing zero: {key}", value == 0)
    add(checks, "standing private text absent", standing["privateSourceTextPresent"] is False)
    add(checks, "standing private payload absent", standing["privatePayloadPresent"] is False)
    add(checks, "standing repository effect none", standing["runtimeRepositoryEffect"] == "none")
    add(checks, "standing canon effect none", standing["canonEffect"] == "none")
    add(checks, "standing graph effect none", standing["graphEffect"] == "none")
    add(checks, "standing control question", "byte-compatible" in standing["nextControlQuestion"])

    add(checks, "authorization schema", authorization["schema"] == "axm-asoiaf-agot-local-feature-patch-bundle-authorization/1")
    add(checks, "authorization targets", authorization["targetPaths"] == TARGETS)
    add(checks, "authorization machine false", authorization["machineGenerated"] is False)
    for key in (
        "worktreeApplicationAuthorized",
        "commitAuthorized",
        "referenceUpdateAuthorized",
        "remotePushAuthorized",
        "pullRequestAuthorized",
    ):
        add(checks, f"authorization withheld: {key}", authorization[key] is False)
    add(checks, "authorization canon none", authorization["canonEffect"] == "none")
    add(checks, "authorization graph none", authorization["graphEffect"] == "none")

    sealer = (ROOT / "seal_patch_bundle.py").read_text(encoding="utf-8")
    validator = (ROOT / "validate_bundle.py").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    for script in ("seal_patch_bundle.py", "validate_bundle.py", "verify.py", "synthetic_campaign.py"):
        try:
            ast.parse((ROOT / script).read_text(encoding="utf-8"))
            compiled = True
        except SyntaxError:
            compiled = False
        add(checks, f"Python syntax: {script}", compiled)
    for needle in (
        "SELF_DIGESTED_OUTPUT",
        "PATCH_MANIFEST.json",
        "repository.patch",
        "BUNDLE.SHA256SUMS",
        "output directory must be empty",
        "outside every Git worktree",
        "postimage is not append-only",
        "duplicate JSON key",
        "symlink refused",
        "bundleSealingIsNotWorktreeApplication",
        "worktreesModifiedByRuntime",
        "liveIndexesModifiedByRuntime",
        "commitsCreatedByRuntime",
        "referencesUpdatedByRuntime",
        "remotePushesByRuntime",
        "pullRequestsOpenedByRuntime",
        "canonEffect",
        "graphEffect",
    ):
        add(checks, f"sealer contains boundary: {needle}", needle in sealer)
    for needle in (
        "PASS_LOCAL_FEATURE_PATCH_BUNDLE_VALID_FOR_SEPARATE_COMPATIBILITY_EXECUTOR",
        "bundle file census mismatch",
        "bundle byte mismatch",
        "validatorExecutedWorktreeApplication",
        "worktreesModifiedByRuntime",
        "liveIndexesModifiedByRuntime",
        "commitsCreatedByRuntime",
        "referencesUpdatedByRuntime",
        "remotePushesByRuntime",
        "pullRequestsOpenedByRuntime",
    ):
        add(checks, f"validator contains boundary: {needle}", needle in validator)
    add(checks, "README denies compatibility proof", "not evidence that the already admitted worktree executor accepts it" in readme)
    add(checks, "README states exact success", contract["successStatus"] in readme)
    add(checks, "README states no Git authority", "creates no commit" in readme and "moves no reference" in readme)

    failed = [name for name, passed in checks if not passed]
    output = {
        "schema": "axm-asoiaf-agot-local-feature-patch-bundle-static-qualification/1",
        "componentId": contract["componentId"],
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "realMaterializationReceiptsConsumed": 0,
        "realPatchBundlesSealed": 0,
        "realWorktreesModified": 0,
        "realLiveIndexesModified": 0,
        "realCommitsCreated": 0,
        "realReferencesUpdated": 0,
        "realRemotePushes": 0,
        "realPullRequestsOpened": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failed else 3


if __name__ == "__main__":
    raise SystemExit(main())
