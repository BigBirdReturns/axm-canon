#!/usr/bin/env python3
"""Static qualification for the AGOT end-to-end authority-continuity auditor."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
EXPECTED_TOTAL = 133
STEP_ROWS = [
    ("asoiaf-agot-local-human-review-workstation-v1", "agot-local-human-review-workstation-v1", "PASS_NAMED_HUMAN_INTAKE_RECORDED_DISPOSITION_WITHHELD"),
    ("asoiaf-agot-named-human-disposition-recorder-v1", "agot-named-human-disposition-recorder-v1", "PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD"),
    ("asoiaf-agot-local-feature-materialization-request-v1", "agot-local-feature-materialization-request-v1", "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD"),
    ("asoiaf-agot-local-feature-postimage-materializer-v1", "agot-local-feature-postimage-materializer-v1", "PASS_LOCAL_FEATURE_POSTIMAGES_MATERIALIZED_WORKTREE_APPLICATION_WITHHELD"),
    ("asoiaf-agot-local-postimage-patch-bundle-sealer-v1", "agot-local-postimage-patch-bundle-sealer-v1", "PASS_LOCAL_POSTIMAGE_PATCH_BUNDLE_SEALED_WORKTREE_APPLICATION_WITHHELD"),
    ("asoiaf-agot-repository-patch-worktree-executor-v1", "agot-repository-patch-worktree-executor-v1", "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT"),
    ("asoiaf-agot-named-human-worktree-diff-review-recorder-v1", "agot-named-human-worktree-diff-review-recorder-v1", "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD"),
    ("asoiaf-agot-local-feature-commit-object-sealer-v1", "agot-local-feature-commit-object-sealer-v1", "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD"),
    ("asoiaf-agot-feature-reference-updater-v1", "agot-feature-reference-updater-v1", "PASS_LOCAL_FEATURE_BRANCH_REFERENCE_UPDATED_REMOTE_PUSH_WITHHELD"),
    ("asoiaf-agot-remote-feature-push-operator-v1", "agot-remote-feature-push-operator-v1", "PASS_REMOTE_FEATURE_BRANCH_PUSHED_PULL_REQUEST_WITHHELD"),
    ("asoiaf-agot-draft-pr-request-packet-v1", "agot-draft-pr-request-packet-v1", "PASS_DRAFT_PULL_REQUEST_REQUEST_PACKET_SEALED_CREATION_WITHHELD"),
    ("asoiaf-agot-draft-pr-creator-v1", "agot-draft-pr-creator-v1", "PASS_DRAFT_PULL_REQUEST_CREATED_REVIEW_AND_MERGE_WITHHELD"),
    ("asoiaf-agot-draft-pr-readiness-operator-v1", "agot-draft-pr-readiness-operator-v1", "PASS_PULL_REQUEST_MARKED_READY_APPROVAL_AND_MERGE_WITHHELD"),
    ("asoiaf-agot-pr-merge-request-packet-v1", "agot-pr-merge-request-packet-v1", "PASS_PULL_REQUEST_MERGE_REQUEST_PACKET_SEALED_EXECUTION_WITHHELD"),
    ("asoiaf-agot-pull-request-merge-executor-v1", "agot-pull-request-merge-executor-v1", "PASS_PULL_REQUEST_SQUASH_MERGED_POST_MERGE_ADMISSION_WITHHELD"),
    ("asoiaf-agot-post-merge-admission-verifier-v1", "agot-post-merge-admission-verifier-v1", "PASS_POST_MERGE_REPOSITORY_ADMISSION_VERIFIED_EFFECT_ACTIVATION_WITHHELD"),
]


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AssertionError(f"JSON object required: {path}")
    return value


def main() -> int:
    names = ["CONTRACT.json", "CURRENT_STANDING.json", "README.md", "audit_lane.py", "validate_receipt.py"]
    paths = {name: ROOT / name for name in names}
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, bool(condition)))

    for name in names:
        check(f"file exists: {name}", paths[name].is_file())

    contract = load_json(paths["CONTRACT.json"])
    standing = load_json(paths["CURRENT_STANDING.json"])
    check("contract is object", isinstance(contract, dict))
    check("standing is object", isinstance(standing, dict))

    check("contract schema", contract.get("schema") == "axm-asoiaf-agot-end-to-end-authority-continuity-auditor-contract/1")
    check("contract component", contract.get("componentId") == "asoiaf-agot-end-to-end-authority-continuity-auditor-v1")
    check("contract standing", contract.get("standing") == "repository-native-source-candidate-real-transaction-held")
    scope = contract.get("scope", {})
    check("scope step count", scope.get("expectedStepCount") == 16)
    check("ordered component identity", scope.get("orderedComponentIdentityRequired") is True)
    check("ordered status boundary", scope.get("orderedStatusBoundaryRequired") is True)
    check("ordered authority hold", scope.get("orderedAuthorityHoldRequired") is True)
    check("repository tree digest", scope.get("exactRepositoryTreeDigestRecorded") is True)
    success = contract.get("success", {})
    check("success status", success.get("status") == "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD")
    check("success next hold", success.get("nextAuthorityHold") == "FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD")
    inspection = contract.get("inspectionBoundary", {})
    check("private source read forbidden", inspection.get("privateSourceReadForbidden") is True)
    check("private payload read forbidden", inspection.get("privatePayloadReadForbidden") is True)
    check("component runtime forbidden", inspection.get("componentRuntimeExecutionForbidden") is True)
    check("receipt fabrication forbidden", inspection.get("receiptFabricationForbidden") is True)
    check("repository mutation forbidden", inspection.get("repositoryMutationForbidden") is True)
    authority = contract.get("authorityBoundary", {})
    check("automatic canon none", authority.get("automaticCanonEffect") == "none")
    check("automatic graph none", authority.get("automaticGraphEffect") == "none")

    check("standing schema", standing.get("schema") == "axm-asoiaf-agot-end-to-end-authority-continuity-auditor-standing/1")
    check("standing component", standing.get("componentId") == "asoiaf-agot-end-to-end-authority-continuity-auditor-v1")
    check("standing status", standing.get("status") == "REPOSITORY_SOURCE_CANDIDATE_REAL_TRANSACTION_WITHHELD")
    counts = standing.get("counts")
    check("standing counts object", isinstance(counts, dict))
    check("standing counts census", isinstance(counts, dict) and len(counts) >= 20)
    check("standing counts zero", isinstance(counts, dict) and all(value == 0 for value in counts.values()))
    check("standing private source absent", standing.get("privateSourceTextPresent") is False)
    check("standing private payload absent", standing.get("privatePayloadPresent") is False)
    check("standing repository effect none", standing.get("runtimeRepositoryEffect") == "none")
    check("standing canon none", standing.get("canonEffect") == "none")
    check("standing graph none", standing.get("graphEffect") == "none")
    question = standing.get("nextControlQuestion")
    check("standing control question", isinstance(question, str) and question.endswith("?"))
    check("standing names private paragraph", isinstance(question, str) and "private paragraph" in question)

    audit_text = paths["audit_lane.py"].read_text(encoding="utf-8")
    for marker in [
        "asoiaf-agot-end-to-end-authority-continuity-auditor-v1",
        "axm-asoiaf-agot-end-to-end-authority-continuity-receipt/1",
        "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD",
        "FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD",
        "SELF_DIGESTED_OUTPUT",
        "STEP_SPECS",
        "strict_pairs",
        "duplicate JSON key",
        "symlink refused in component metadata",
        "audit output must remain outside repository",
        "repository changed during audit",
        "private source or payload field refused",
        "runtime effect count changed",
        "automatic effect boundary changed",
        "--porcelain=v1",
        "workingStateChangedByAudit",
        "orderedComponentsSha256",
        "orderedStatusBoundariesSha256",
        "orderedAuthorityHoldsSha256",
        "auditIsNotHumanReview",
        "auditIsNotTransactionExecution",
        "repositoryFilesWrittenByRuntime",
        '"canonEffect": "none"',
        '"graphEffect": "none"',
        "os.O_EXCL",
    ]:
        check(f"audit marker: {marker}", marker in audit_text)

    validator_text = paths["validate_receipt.py"].read_text(encoding="utf-8")
    for marker in [
        "axm-asoiaf-agot-end-to-end-authority-continuity-receipt/1",
        "asoiaf-agot-end-to-end-authority-continuity-auditor-v1",
        "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD",
        "FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD",
        "SELF_DIGESTED_OUTPUT",
        "duplicate JSON key",
        "ordered component identity mismatch",
        "lane ordinal mismatch",
        "private source read boundary changed",
        "component runtime execution boundary changed",
        "ordered component digest mismatch",
        "ordered status digest mismatch",
        "ordered hold digest mismatch",
        "substantive census is not zero",
        "authority boundary mismatch",
    ]:
        check(f"validator marker: {marker}", marker in validator_text)

    readme = paths["README.md"].read_text(encoding="utf-8")
    for marker in [
        "AGOT end-to-end authority-continuity auditor",
        "sixteen component identities",
        "public admission metadata",
        "private paragraph",
        "FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD",
        "cannot display or review source",
        "audit_lane.py --repository-root",
        "validate_receipt.py --receipt",
    ]:
        check(f"README marker: {marker}", marker in readme)

    for component_id, directory, status in STEP_ROWS:
        check(f"step component: {component_id}", component_id in audit_text)
        check(f"step directory: {directory}", directory in audit_text)
        check(f"step status: {status}", status in audit_text)

    if len(checks) != EXPECTED_TOTAL:
        raise AssertionError(f"qualification census drift: {len(checks)} != {EXPECTED_TOTAL}")
    failed = [name for name, passed in checks if not passed]
    result = {
        "schema": "axm-asoiaf-agot-end-to-end-authority-continuity-static-verification/1",
        "componentId": "asoiaf-agot-end-to-end-authority-continuity-auditor-v1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "realPrivateParagraphsConsumed": 0,
        "realNamedHumanTransactionsConsumed": 0,
        "componentRuntimesExecuted": 0,
        "repositoryFilesWrittenByRuntime": 0,
        "worktreesModifiedByRuntime": 0,
        "liveIndexesModifiedByRuntime": 0,
        "commitsCreatedByRuntime": 0,
        "referencesUpdatedByRuntime": 0,
        "remotePushesByRuntime": 0,
        "pullRequestsOpenedByRuntime": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
