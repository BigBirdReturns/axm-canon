#!/usr/bin/env python3
"""Static qualification for the AGOT named-human worktree diff-review recorder."""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EXPECTED_FILES = {
    "CONTRACT.json",
    "CURRENT_STANDING.json",
    "README.md",
    "REVIEW_TEMPLATE.json",
    "Run-Record-Worktree-Diff-Review.cmd",
    "compatibility_campaign.py",
    "record_diff_review.py",
    "synthetic_campaign.py",
    "validate_record.py",
    "verify.py",
}
TARGETS = [
    "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
    "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
]


def main() -> int:
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, bool(condition)))

    observed = {path.name for path in ROOT.iterdir() if path.is_file()}
    check("exact file census", observed == EXPECTED_FILES)
    for name in sorted(EXPECTED_FILES):
        path = ROOT / name
        check(f"file present: {name}", path.is_file())
        check(f"file nonempty: {name}", path.stat().st_size > 0 if path.is_file() else False)

    contract = json.loads((ROOT / "CONTRACT.json").read_text(encoding="utf-8"))
    standing = json.loads((ROOT / "CURRENT_STANDING.json").read_text(encoding="utf-8"))
    template = json.loads((ROOT / "REVIEW_TEMPLATE.json").read_text(encoding="utf-8"))
    recorder = (ROOT / "record_diff_review.py").read_text(encoding="utf-8")
    validator = (ROOT / "validate_record.py").read_text(encoding="utf-8")
    synthetic = (ROOT / "synthetic_campaign.py").read_text(encoding="utf-8")
    compatibility = (ROOT / "compatibility_campaign.py").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    launcher = (ROOT / "Run-Record-Worktree-Diff-Review.cmd").read_text(encoding="utf-8")

    check("contract schema", contract.get("schema") == "axm-asoiaf-agot-named-human-worktree-diff-review-recorder-contract/1")
    check("component identity", contract.get("componentId") == "asoiaf-agot-named-human-worktree-diff-review-recorder-v1")
    check("upstream component", contract.get("upstream", {}).get("componentId") == "asoiaf-agot-repository-patch-worktree-executor-v1")
    check("upstream commit", contract.get("upstream", {}).get("admissionCommit") == "d558a4d2304f9dc41c73e25092dc381d5e7e0498")
    check("upstream receipt schema", contract.get("upstream", {}).get("requiredReceiptSchema") == "axm-asoiaf-agot-local-worktree-patch-application/1")
    check("upstream receipt status", contract.get("upstream", {}).get("requiredReceiptStatus") == "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT")
    check("upstream auth schema", contract.get("upstream", {}).get("requiredWorktreeAuthorizationSchema") == "axm-asoiaf-local-worktree-apply-authorization/1")
    check("downstream component", contract.get("downstream", {}).get("componentId") == "asoiaf-agot-local-feature-commit-object-sealer-v1")
    check("downstream commit", contract.get("downstream", {}).get("admissionCommit") == "70da97f7f92e792eaad32fdc7a456c598347bd78")
    check("downstream auth schema", contract.get("downstream", {}).get("requiredAuthorizationSchema") == "axm-asoiaf-human-diff-review-authorization/2")
    check("downstream decision", contract.get("downstream", {}).get("requiredApprovalDecision") == "approve-local-commit-object")
    check("contract targets", contract.get("allowedChangedPaths") == TARGETS)
    check("four decisions", contract.get("allowedDecisions") == [
        "APPROVE_LOCAL_COMMIT_OBJECT",
        "REJECT_WORKTREE_DIFF",
        "RETURN_FOR_CORRECTION",
        "DEFER_PENDING_REVIEW",
    ])
    expected_holds = {
        "APPROVE_LOCAL_COMMIT_OBJECT": "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD",
        "REJECT_WORKTREE_DIFF": "WORKTREE_ROLLBACK_WITHHELD",
        "RETURN_FOR_CORRECTION": "CORRECTED_PATCH_BUNDLE_AND_WORKTREE_APPLICATION_WITHHELD",
        "DEFER_PENDING_REVIEW": "ADDITIONAL_DIFF_REVIEW_EVIDENCE_WITHHELD",
    }
    check("decision holds", contract.get("nextAuthorityHolds") == expected_holds)
    for key in (
        "exactWorktreeReceiptBytesRequired",
        "exactWorktreeAuthorizationBytesRequired",
        "repositoryIdentityRequired",
        "fixedHeadAndBranchRequired",
        "cleanLiveIndexRequired",
        "exactTwoPathWorktreeDiffRequired",
        "changeSetRecomputedFromBaseAndWorktreeBytes",
        "reviewSelfDigestRequired",
        "duplicateJsonKeysForbidden",
        "symlinkInputsForbidden",
        "outputOverwriteForbidden",
    ):
        check(f"binding boundary: {key}", contract.get("bindingBoundary", {}).get(key) is True)
    for key in (
        "machineGeneratedReviewForbidden",
        "separatelyNamedReviewerRequired",
        "reviewerMustDifferFromWorktreeExecutor",
        "recordingActorMustMatchReviewer",
        "humanActionEvidenceRequired",
        "reasonCodesRequired",
        "rationaleRequired",
    ):
        check(f"human boundary: {key}", contract.get("humanBoundary", {}).get(key) is True)
    authority = contract.get("authorityBoundary", {})
    for key in ("reviewReceiptIsNotCommitObject", "authorizationIsNotCommitObject"):
        check(f"authority boolean: {key}", authority.get(key) is True)
    for key in (
        "repositoryFilesWrittenByRuntime",
        "worktreeBytesModifiedByRuntime",
        "liveIndexModifiedByRuntime",
        "commitObjectsCreatedByRuntime",
        "referencesUpdatedByRuntime",
        "remotePushesByRuntime",
        "pullRequestsOpenedByRuntime",
    ):
        check(f"authority zero: {key}", authority.get(key) == 0)
    check("contract canon none", authority.get("automaticCanonEffect") == "none")
    check("contract graph none", authority.get("automaticGraphEffect") == "none")
    check("success status", contract.get("successStatus") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD")

    check("standing schema", standing.get("schema") == "axm-asoiaf-agot-named-human-worktree-diff-review-recorder-standing/1")
    check("standing component", standing.get("componentId") == contract.get("componentId"))
    check("standing held", standing.get("status") == "REPOSITORY_SOURCE_CANDIDATE_REAL_WORKTREE_DIFF_REVIEW_WITHHELD")
    check("standing counts zero", all(value == 0 for value in standing.get("counts", {}).values()))
    check("standing source absent", standing.get("privateSourceTextPresent") is False)
    check("standing payload absent", standing.get("privatePayloadPresent") is False)
    check("standing repo effect none", standing.get("runtimeRepositoryEffect") == "none")
    check("standing canon none", standing.get("canonEffect") == "none")
    check("standing graph none", standing.get("graphEffect") == "none")
    check("standing control question", "commit-object sealer" in standing.get("nextControlQuestion", ""))

    check("template schema", template.get("schema") == "axm-asoiaf-agot-named-human-worktree-diff-review/1")
    check("template targets", template.get("changedPaths") == TARGETS)
    check("template machine false", template.get("machineGenerated") is False)
    check("template effect false", template.get("repositoryEffectAuthorized") is False)
    check("template canon none", template.get("canonEffect") == "none")
    check("template graph none", template.get("graphEffect") == "none")
    for key in (
        "worktreeApplicationReceiptSha256",
        "worktreeApplyAuthorizationSha256",
        "patchManifestSha256",
        "repositoryIdentity",
        "baseCommit",
        "branch",
        "changeSetSha256",
        "diffReviewerActor",
        "reviewedAt",
        "humanActionEvidence",
        "decision",
        "reasonCodes",
        "reviewRationale",
        "nonce",
        "reviewSha256",
    ):
        check(f"template field: {key}", key in template)

    for source_name in ("record_diff_review.py", "validate_record.py", "synthetic_campaign.py", "compatibility_campaign.py", "verify.py"):
        source = (ROOT / source_name).read_text(encoding="utf-8")
        try:
            ast.parse(source)
            parsed = True
        except SyntaxError:
            parsed = False
        check(f"Python parses: {source_name}", parsed)
        if source_name != "verify.py":
            check(f"no network library: {source_name}", all(token not in source for token in ("requests", "urllib.request", "http.client", "socket.")))
            check(f"no shell true: {source_name}", "shell=True" not in source)

    recorder_tokens = (
        "strict_pairs",
        "require_regular_file",
        "REFUSE_DUPLICATE_JSON_KEY",
        "REFUSE_SYMLINK",
        "git(repo, \"diff\", \"--cached\", \"--quiet\"",
        "git(repo, \"diff\", \"--check\"",
        "status_paths(repo)",
        "change_set(repo, head)",
        "APPROVE_LOCAL_COMMIT_OBJECT",
        "REJECT_WORKTREE_DIFF",
        "RETURN_FOR_CORRECTION",
        "DEFER_PENDING_REVIEW",
        "axm-asoiaf-human-diff-review-authorization/2",
        "approve-local-commit-object",
        "AXM_INJECT_FAILURE_AFTER_AUTHORIZATION",
        "os.O_EXCL",
        "worktreeBytesModifiedByRuntime",
        "commitObjectsCreatedByRuntime",
        "privateSourceTextPresent",
        "privatePayloadPresent",
    )
    for token in recorder_tokens:
        check(f"recorder token: {token}", token in recorder)
    validator_tokens = (
        "build_authorization",
        "build_receipt",
        "bytes differ from exact reconstruction",
        "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR",
        "commitObjectsCreatedByValidator",
    )
    for token in validator_tokens:
        check(f"validator token: {token}", token in validator)
    synthetic_tokens = (
        "noncopyrightedFixtureOnly",
        "duplicate JSON",
        "injected authorization rollback",
        "dirty index",
        "extra path",
        "deterministic authorization bytes",
        "REJECT_WORKTREE_DIFF",
        "RETURN_FOR_CORRECTION",
        "DEFER_PENDING_REVIEW",
    )
    for token in synthetic_tokens:
        check(f"synthetic token: {token}", token in synthetic)
    compatibility_tokens = (
        "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT",
        "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD",
        "approve-local-commit-object",
        "create-unreferenced-commit-object",
        "branchReferenceUpdated",
        "liveIndexModified",
        "worktreeChangesRetained",
    )
    for token in compatibility_tokens:
        check(f"compatibility token: {token}", token in compatibility)

    check("README names upstream", "clean-worktree executor" in readme)
    check("README names downstream", "commit-object sealer" in readme)
    check("README approval hold", "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD" in readme)
    check("README refusal decisions", all(value in readme for value in ("Rejection", "correction", "deferral")))
    check("README no commit authority", "does not modify the worktree or live index" in readme)
    check("launcher safe path", "PYTHONSAFEPATH=1" in launcher)
    check("launcher warnings errors", "-W error -S" in launcher)
    check("launcher correct script", "record_diff_review.py" in launcher)

    failed = [name for name, passed in checks if not passed]
    output = {
        "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-recorder-verification/1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "warningsAsErrorsRequired": True,
        "realWorktreeApplicationReceiptsConsumed": 0,
        "realHumanDiffReviewsConsumed": 0,
        "realDiffReviewAuthorizationsSealed": 0,
        "realCommitObjectsCreated": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
