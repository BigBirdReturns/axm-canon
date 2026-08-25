#!/usr/bin/env python3
"""Static qualification for the AGOT commit-object authorization sealer."""
from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
COMPONENT_ID = "asoiaf-agot-local-commit-object-authorization-sealer-v1"
TARGETS = [
    "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
    "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
]


def load(name: str) -> Any:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def main() -> int:
    contract = load("CONTRACT.json")
    standing = load("CURRENT_STANDING.json")
    plan = load("PLAN_TEMPLATE.json")
    sealer_text = (ROOT / "seal_authorization.py").read_text(encoding="utf-8")
    validator_text = (ROOT / "validate_authorization.py").read_text(encoding="utf-8")
    synthetic_text = (ROOT / "synthetic_campaign.py").read_text(encoding="utf-8")
    compatibility_text = (ROOT / "compatibility_campaign.py").read_text(encoding="utf-8")
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, bool(condition)))

    expected_files = {
        "CONTRACT.json",
        "CURRENT_STANDING.json",
        "PLAN_TEMPLATE.json",
        "README.md",
        "Run-Seal-Commit-Object-Authorization.cmd",
        "seal_authorization.py",
        "validate_authorization.py",
        "verify.py",
        "synthetic_campaign.py",
        "compatibility_campaign.py",
    }
    check("exact component file census", {p.name for p in ROOT.iterdir() if p.is_file()} == expected_files)
    for name in sorted(expected_files):
        check(f"nonempty {name}", (ROOT / name).stat().st_size > 0)

    check("contract schema", contract.get("schema") == "axm-asoiaf-agot-local-commit-object-authorization-sealer-contract/1")
    check("contract component", contract.get("componentId") == COMPONENT_ID)
    check("upstream component", contract.get("upstream", {}).get("componentId") == "asoiaf-agot-named-human-worktree-diff-review-recorder-v1")
    check("upstream admission", contract.get("upstream", {}).get("admissionCommit") == "566200a79ad132af9e2c31799863c3216e53872e")
    check("upstream auth schema", contract.get("upstream", {}).get("requiredAuthorizationSchema") == "axm-asoiaf-human-diff-review-authorization/2")
    check("upstream decision", contract.get("upstream", {}).get("requiredAuthorizationDecision") == "approve-local-commit-object")
    check("upstream receipt schema", contract.get("upstream", {}).get("requiredReceiptSchema") == "axm-asoiaf-agot-named-human-worktree-diff-review-receipt/1")
    check("upstream receipt status", contract.get("upstream", {}).get("requiredReceiptStatus") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD")
    check("upstream validation status", contract.get("upstream", {}).get("requiredValidationStatus") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR")
    check("upstream hold", contract.get("upstream", {}).get("requiredNextAuthorityHold") == "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD")
    check("downstream component", contract.get("downstream", {}).get("componentId") == "asoiaf-agot-local-feature-commit-object-sealer-v1")
    check("downstream admission", contract.get("downstream", {}).get("admissionCommit") == "70da97f7f92e792eaad32fdc7a456c598347bd78")
    check("downstream auth schema", contract.get("downstream", {}).get("requiredAuthorizationSchema") == "axm-asoiaf-commit-object-authorization/2")
    check("downstream decision", contract.get("downstream", {}).get("requiredAuthorizationDecision") == "create-unreferenced-commit-object")
    check("downstream standing", contract.get("downstream", {}).get("successStanding") == "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD")
    check("plan schema", contract.get("planSchema") == "axm-asoiaf-agot-local-commit-object-plan/1")
    check("authorization schema", contract.get("authorizationSchema") == "axm-asoiaf-commit-object-authorization/2")
    check("receipt schema", contract.get("receiptSchema") == "axm-asoiaf-agot-local-commit-object-authorization-receipt/1")
    check("success status", contract.get("successStatus") == "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_SEALED_OBJECT_CREATION_WITHHELD")
    check("next hold", contract.get("nextAuthorityHold") == "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD")

    for key in (
        "exactDiffReviewAuthorizationBytesRequired",
        "exactReviewReceiptBytesRequired",
        "exactReviewValidationBytesRequired",
        "allUpstreamSelfDigestsRequired",
        "repositoryIdentityRequired",
        "baseCommitAndFeatureBranchRequired",
        "changeSetDigestRequired",
        "commitPlanSelfDigestRequired",
        "duplicateJsonKeysForbidden",
        "symlinkInputsForbidden",
        "isolatedEmptyOutputDirectoryRequired",
        "outputInsideGitWorktreeForbidden",
        "outputOverwriteForbidden",
    ):
        check(f"binding boundary {key}", contract.get("bindingBoundary", {}).get(key) is True)
    for key in (
        "separatelyNamedCommitObjectActorRequired",
        "planAuthorMustMatchCommitObjectActor",
        "sealingActorMustMatchCommitObjectActor",
        "commitObjectActorMustDifferFromDiffReviewer",
        "machineGeneratedPlanForbidden",
    ):
        check(f"actor boundary {key}", contract.get("actorBoundary", {}).get(key) is True)
    for key in (
        "privateSourceTextForbidden",
        "privatePayloadForbidden",
        "worktreeBytesNotRead",
        "commitMessageDerivedFromBoundedTransactionId",
        "humanEvidencePersistedAsDigestOnly",
    ):
        check(f"content boundary {key}", contract.get("contentBoundary", {}).get(key) is True)
    authority = contract.get("authorityBoundary", {})
    check("authorization not commit object", authority.get("authorizationIsNotCommitObject") is True)
    for key in (
        "repositoryFilesWrittenByRuntime",
        "worktreeBytesModifiedByRuntime",
        "liveIndexModifiedByRuntime",
        "commitObjectsCreatedByRuntime",
        "referencesUpdatedByRuntime",
        "remotePushesByRuntime",
        "pullRequestsOpenedByRuntime",
    ):
        check(f"zero authority {key}", authority.get(key) == 0)
    check("automatic canon none", authority.get("automaticCanonEffect") == "none")
    check("automatic graph none", authority.get("automaticGraphEffect") == "none")

    check("standing schema", standing.get("schema") == "axm-asoiaf-agot-local-commit-object-authorization-sealer-standing/1")
    check("standing component", standing.get("componentId") == COMPONENT_ID)
    check("standing status", standing.get("status") == "REPOSITORY_SOURCE_CANDIDATE_REAL_COMMIT_OBJECT_AUTHORIZATION_WITHHELD")
    check("standing counts all zero", all(value == 0 for value in standing.get("counts", {}).values()))
    check("standing private source false", standing.get("privateSourceTextPresent") is False)
    check("standing private payload false", standing.get("privatePayloadPresent") is False)
    check("standing repository effect none", standing.get("runtimeRepositoryEffect") == "none")
    check("standing canon none", standing.get("canonEffect") == "none")
    check("standing graph none", standing.get("graphEffect") == "none")
    check("standing control question", "independently validated commit-object authorization" in standing.get("nextControlQuestion", ""))

    expected_plan_keys = {
        "schema", "diffReviewAuthorizationSha256", "diffReviewAuthorizationFileSha256",
        "reviewReceiptSha256", "reviewReceiptFileSha256", "reviewValidationFileSha256",
        "repositoryIdentity", "baseCommit", "branch", "changeSetSha256", "decision",
        "commitObjectActor", "planAuthorActor", "transactionId", "authorName", "authorEmail",
        "authorDate", "authorizedAt", "nonce", "authorizationEvidence", "reasonCodes",
        "machineGenerated", "unreferencedCommitObjectAuthorized", "worktreeMutationAuthorized",
        "liveIndexMutationAuthorized", "referenceUpdateAuthorized", "remotePushAuthorized",
        "pullRequestAuthorized", "privateSourceTextPresent", "privatePayloadPresent",
        "canonEffect", "graphEffect", "planSha256",
    }
    check("plan exact key census", set(plan) == expected_plan_keys)
    check("plan template schema", plan.get("schema") == "axm-asoiaf-agot-local-commit-object-plan/1")
    check("plan template decision", plan.get("decision") == "AUTHORIZE_UNREFERENCED_COMMIT_OBJECT")
    check("plan machine generated false", plan.get("machineGenerated") is False)
    check("plan object authorized", plan.get("unreferencedCommitObjectAuthorized") is True)
    for key in (
        "worktreeMutationAuthorized", "liveIndexMutationAuthorized", "referenceUpdateAuthorized",
        "remotePushAuthorized", "pullRequestAuthorized", "privateSourceTextPresent", "privatePayloadPresent",
    ):
        check(f"plan false boundary {key}", plan.get(key) is False)
    check("plan canon none", plan.get("canonEffect") == "none")
    check("plan graph none", plan.get("graphEffect") == "none")

    for script in ("seal_authorization.py", "validate_authorization.py", "verify.py", "synthetic_campaign.py", "compatibility_campaign.py"):
        try:
            ast.parse((ROOT / script).read_text(encoding="utf-8"), filename=script)
            parsed = True
        except SyntaxError:
            parsed = False
        check(f"syntax {script}", parsed)

    check("sealer strict duplicate keys", "object_pairs_hook=strict_pairs" in sealer_text)
    check("sealer symlink refusal", "stat.S_ISLNK" in sealer_text)
    check("sealer source-field refusal", "REFUSE_SOURCE_TEXT_FIELD" in sealer_text)
    check("sealer exact file hashes", "diffReviewAuthorizationFileSha256" in sealer_text and "reviewValidationFileSha256" in sealer_text)
    check("sealer review self digest", 'verify_self_digest(review_receipt, "receiptSha256"' in sealer_text)
    check("sealer plan self digest", 'verify_self_digest(plan, "planSha256"' in sealer_text)
    check("sealer actor separation", "commit-object actor collides with diff reviewer" in sealer_text)
    check("sealer actor match", "sealing actor must match commit-object actor" in sealer_text)
    check("sealer bounded branch", 'branch.startswith("feature/asoiaf-agot/")' in sealer_text)
    check("sealer bounded transaction id", "TRANSACTION_ID.fullmatch" in sealer_text)
    check("sealer deterministic message", "Admit AGOT reviewed transaction" in sealer_text)
    check("sealer evidence digest only", "authorizationEvidenceSha256" in sealer_text and '"authorizationEvidence":' not in sealer_text.split("def build_receipt", 1)[1])
    check("sealer isolated directory", "output directory must be empty" in sealer_text)
    check("sealer Git worktree output refusal", "outside every Git worktree" in sealer_text)
    check("sealer exclusive writes", "os.O_EXCL" in sealer_text)
    check("sealer rollback", "for path in written" in sealer_text and "unlink(missing_ok=True)" in sealer_text)
    check("sealer injected rollback case", "AXM_INJECT_FAILURE_AFTER_AUTHORIZATION" in sealer_text)
    check("sealer no subprocess", "subprocess" not in sealer_text)
    check("sealer no Git invocation", '"git"' not in sealer_text and "commit-tree" not in sealer_text)
    check("sealer no network", "urllib" not in sealer_text and "requests" not in sealer_text and "socket" not in sealer_text)
    check("sealer no repository argument", 'add_argument("--repo"' not in sealer_text)
    check("sealer no worktree path argument", "worktree" not in " ".join(line for line in sealer_text.splitlines() if "add_argument" in line))
    check("sealer output auth schema", '"schema": AUTHORIZATION_SCHEMA' in sealer_text)
    check("sealer output decision", '"decision": "create-unreferenced-commit-object"' in sealer_text)
    check("sealer success status", "SUCCESS_STATUS" in sealer_text)
    check("sealer next hold", "NEXT_HOLD" in sealer_text)
    check("sealer receipt self digest", 'receipt["receiptSha256"] = digest_object(receipt)' in sealer_text)

    check("validator imports shared reconstruction", "build_authorization" in validator_text and "build_receipt" in validator_text)
    check("validator exact authorization bytes", "authorization bytes differ from exact reconstruction" in validator_text)
    check("validator exact receipt bytes", "receipt bytes differ from exact reconstruction" in validator_text)
    check("validator no writes", "open(" not in validator_text and "write_text" not in validator_text and "write_bytes" not in validator_text)
    check("validator no subprocess", "subprocess" not in validator_text)
    check("validator pass standing", "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_VALID_FOR_SEPARATE_OBJECT_SEALER" in validator_text)

    check("synthetic fixture only declaration", "noncopyrightedFixtureOnly" in synthetic_text)
    check("synthetic deterministic replay", "deterministic replay" in synthetic_text)
    check("synthetic duplicate key case", "duplicate JSON key" in synthetic_text)
    check("synthetic symlink case", "symlink" in synthetic_text)
    check("synthetic rollback case", "injected rollback" in synthetic_text)
    check("synthetic validator tamper cases", "validator rejects" in synthetic_text)

    check("compatibility invokes recorder", "record_diff_review.py" in compatibility_text)
    check("compatibility invokes review validator", "validate_record.py" in compatibility_text)
    check("compatibility invokes authorization sealer", "seal_authorization.py" in compatibility_text)
    check("compatibility invokes commit sealer", "seal_commit_object.py" in compatibility_text)
    check("compatibility checks branch unchanged", "branch ref unchanged" in compatibility_text)
    check("compatibility checks live index", "live index clean" in compatibility_text)
    check("compatibility checks worktree retained", "worktree paths retained" in compatibility_text)
    check("compatibility fixture only declaration", "noncopyrightedFixtureOnly" in compatibility_text)

    failed = [name for name, passed in checks if not passed]
    output = {
        "schema": "axm-asoiaf-agot-local-commit-object-authorization-sealer-verification/1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "realDiffReviewAuthorizationsConsumed": 0,
        "realReviewReceiptsConsumed": 0,
        "realReviewValidationsConsumed": 0,
        "realCommitObjectPlansConsumed": 0,
        "realCommitObjectAuthorizationsSealed": 0,
        "realCommitObjectsCreated": 0,
        "realReferencesUpdated": 0,
        "realRemotePushes": 0,
        "realPullRequestsOpened": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
