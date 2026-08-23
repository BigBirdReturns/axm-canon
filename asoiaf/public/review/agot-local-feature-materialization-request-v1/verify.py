#!/usr/bin/env python3
"""Statically qualify the AGOT local-feature materialization request sealer."""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
COMPONENT_ID = "asoiaf-agot-local-feature-materialization-request-v1"
UPSTREAM_COMMIT = "d5898d092ec4091395612ac0f4c555334acec21e"
CANON_PATH = "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson"
GRAPH_PATH = "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson"
PASS_STATUS = "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD"
NEXT_HOLD = "LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD"
EXPECTED_FILES = {
    "CONTRACT.json",
    "CURRENT_STANDING.json",
    "README.md",
    "REQUEST_TEMPLATE.json",
    "Run-Seal-Local-Feature-Materialization-Request.cmd",
    "seal_request.py",
    "synthetic_campaign.py",
    "validate_request.py",
    "verify.py",
}


class QualificationFailure(RuntimeError):
    """One bounded source qualification check failed."""


def load_json(name: str) -> dict[str, Any]:
    value = json.loads((ROOT / name).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise QualificationFailure(f"{name} is not a JSON object")
    return value


def main() -> int:
    checks: list[dict[str, Any]] = []

    def check(condition: bool, name: str) -> None:
        checks.append({"name": name, "passed": bool(condition)})
        if not condition:
            raise QualificationFailure(name)

    contract = load_json("CONTRACT.json")
    standing = load_json("CURRENT_STANDING.json")
    template = load_json("REQUEST_TEMPLATE.json")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    launcher = (ROOT / "Run-Seal-Local-Feature-Materialization-Request.cmd").read_text(
        encoding="utf-8"
    )
    sealer_source = (ROOT / "seal_request.py").read_text(encoding="utf-8")
    validator_source = (ROOT / "validate_request.py").read_text(encoding="utf-8")
    synthetic_source = (ROOT / "synthetic_campaign.py").read_text(encoding="utf-8")

    check({path.name for path in ROOT.iterdir() if path.is_file()} == EXPECTED_FILES, "exact component file census")
    check(contract.get("schema") == "axm-asoiaf-agot-local-feature-materialization-request-contract/1", "contract schema")
    check(contract.get("componentId") == COMPONENT_ID, "contract component identity")
    check(contract.get("standing") == "repository-native-source-candidate-real-materialization-request-held", "contract standing")
    upstream = contract.get("upstream") or {}
    check(upstream.get("componentId") == "asoiaf-agot-named-human-disposition-recorder-v1", "upstream component")
    check(upstream.get("admissionCommit") == UPSTREAM_COMMIT, "upstream admission commit")
    check(upstream.get("requiredReceiptSchema") == "axm-asoiaf-agot-named-human-disposition-receipt/1", "upstream receipt schema")
    check(upstream.get("requiredReceiptStatus") == "PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD", "upstream receipt status")
    check(upstream.get("requiredDecision") == "ADMIT_EXACT_PROPOSITION", "upstream decision")
    check(upstream.get("requiredNextAuthorityHold") == "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD", "upstream authority hold")
    check(contract.get("planSchema") == "axm-asoiaf-agot-local-feature-materialization-plan/1", "plan schema")
    check(contract.get("requestSchema") == "axm-asoiaf-agot-local-feature-materialization-request/1", "request schema")
    check(contract.get("validationSchema") == "axm-asoiaf-agot-local-feature-materialization-request-validation/1", "validation schema")
    check(contract.get("successStatus") == PASS_STATUS, "success standing")
    check(contract.get("nextAuthorityHold") == NEXT_HOLD, "next authority hold")

    repository = contract.get("repositoryTarget") or {}
    check(repository.get("repository") == "BigBirdReturns/axm-canon", "repository identity")
    check(repository.get("baseBranch") == "main", "repository base branch")
    check(repository.get("featureBranchPrefix") == "feature/asoiaf-agot/", "feature branch prefix")
    check(repository.get("governedPaths") == [CANON_PATH, GRAPH_PATH], "exact governed path set and order")

    binding = contract.get("bindingBoundary") or {}
    for field in (
        "exactDispositionReceiptBytesRequired",
        "dispositionReceiptSelfDigestRequired",
        "exactAdmittedPropositionRequired",
        "sourceParagraphDigestRequired",
        "materializationPlanSelfDigestRequired",
        "exactTargetPreimagesRequired",
        "requesterMustDifferFromDispositionReviewer",
        "duplicateJsonKeysForbidden",
        "symlinkInputsForbidden",
        "outputOverwriteForbidden",
    ):
        check(binding.get(field) is True, f"binding boundary {field}")

    classification = contract.get("classificationBoundary") or {}
    for field in (
        "claimClassRequired",
        "epistemicClassRequired",
        "rightsClassRequired",
        "continuityClassRequired",
        "sortedReconciliationKeysRequired",
        "sortedSubjectKeysRequired",
        "graphRelationRequired",
    ):
        check(classification.get(field) is True, f"classification boundary {field}")

    content = contract.get("contentBoundary") or {}
    check(content.get("privateSourceTextForbidden") is True, "private source text forbidden")
    check(content.get("privatePayloadForbidden") is True, "private payload forbidden")
    check(content.get("admittedPropositionMaximumCharacters") == 2000, "proposition length bound")
    check(content.get("humanEvidencePersistedAsDigestOnly") is True, "human evidence digest only")
    check(content.get("humanRationalePersistedAsDigestOnly") is True, "human rationale digest only")
    check(content.get("postimageBytesPersisted") is False, "postimage bytes not persisted")
    check(content.get("appendRowsPersisted") is True, "append rows persisted")

    boundary = contract.get("authorityBoundary") or {}
    expected_boundary = {
        "requestIsNotRepositoryMutation": True,
        "postimageFilesWrittenByRuntime": 0,
        "repositoryFilesWrittenByRuntime": 0,
        "worktreesModifiedByRuntime": 0,
        "commitsCreatedByRuntime": 0,
        "referencesUpdatedByRuntime": 0,
        "remotePushesByRuntime": 0,
        "pullRequestsOpenedByRuntime": 0,
        "automaticCanonEffect": "none",
        "automaticGraphEffect": "none",
    }
    check(all(boundary.get(key) == value for key, value in expected_boundary.items()), "contract authority boundary")

    check(standing.get("schema") == "axm-asoiaf-agot-local-feature-materialization-request-standing/1", "standing schema")
    check(standing.get("componentId") == COMPONENT_ID, "standing component identity")
    check(standing.get("status") == "REPOSITORY_SOURCE_CANDIDATE_REAL_MATERIALIZATION_REQUEST_WITHHELD", "standing status")
    counts = standing.get("counts") or {}
    check(len(counts) == 12 and all(value == 0 for value in counts.values()), "zero substantive census")
    check(standing.get("privateSourceTextPresent") is False, "standing private source absence")
    check(standing.get("privatePayloadPresent") is False, "standing private payload absence")
    check(standing.get("runtimeRepositoryEffect") == "none", "standing repository effect")
    check(standing.get("canonEffect") == "none", "standing canon effect")
    check(standing.get("graphEffect") == "none", "standing graph effect")
    check("postimage" in str(standing.get("nextControlQuestion") or "").casefold(), "next control question")

    check(template.get("schema") == "axm-asoiaf-agot-local-feature-materialization-plan/1", "template schema")
    check(template.get("candidateId") == "", "template candidate inert")
    check(template.get("repositoryTarget", {}).get("targetPaths") == [CANON_PATH, GRAPH_PATH], "template target paths")
    check(template.get("targetPreimages", {}).get("canon", {}).get("state") == "ABSENT", "template canon absence")
    check(template.get("targetPreimages", {}).get("graph", {}).get("state") == "ABSENT", "template graph absence")
    check(template.get("authorityBoundary") == {
        "repositoryEffectAuthorized": False,
        "worktreeWriteAuthorized": False,
        "commitAuthorized": False,
        "referenceUpdateAuthorized": False,
        "remotePushAuthorized": False,
        "pullRequestAuthorized": False,
        "canonEffect": "none",
        "graphEffect": "none",
    }, "template zero-effect boundary")
    check(template.get("selfDigestMethod") == "SELF_DIGESTED_OUTPUT" and template.get("planSha256") == "", "template self-digest slot")

    check("PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD" in readme, "README success state")
    check("LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD" in readme, "README next hold")
    check("does not write either postimage file" in readme, "README postimage refusal")
    check("PYTHONSAFEPATH=1" in launcher and "-W error -S" in launcher, "Windows launcher warnings-as-errors")

    sealer_tree = ast.parse(sealer_source, filename="seal_request.py")
    validator_tree = ast.parse(validator_source, filename="validate_request.py")
    ast.parse(synthetic_source, filename="synthetic_campaign.py")
    check(isinstance(sealer_tree, ast.Module), "sealer parses")
    check(isinstance(validator_tree, ast.Module), "validator parses")
    check("O_EXCL" in sealer_source and "output already exists" in sealer_source, "exclusive no-overwrite output")
    check("object_pairs_hook=strict_pairs" in sealer_source, "sealer duplicate-key refusal")
    check("object_pairs_hook=strict_pairs" in validator_source, "validator duplicate-key refusal")
    check("stat.S_ISLNK" in sealer_source and "stat.S_ISLNK" in validator_source, "symlink input refusal")
    check("SELF_DIGESTED_OUTPUT" in sealer_source and "candidate[field] = SELF_DIGEST_MARKER" in sealer_source, "stable marker self-digest")
    check("requestIsNotRepositoryMutation" in sealer_source and "postimageFilesWrittenByRuntime" in sealer_source, "request zero-effect receipt")
    check("PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_VALID_FOR_SEPARATE_EXECUTOR" in validator_source, "independent validator standing")
    check("PROPOSED_LOCAL_FEATURE_MATERIALIZATION" in sealer_source, "append rows remain proposed")
    check("canonical(row) + b\"\\n\"" in sealer_source, "canonical append-row encoding")
    check("preimage + append" in sealer_source and "postimageSha256" in sealer_source, "postimage computed in memory")
    check("requester must be separate from disposition reviewer" in sealer_source, "actor separation refusal")
    check("target.get(\"targetPaths\") != [CANON_PATH, GRAPH_PATH]" in sealer_source, "exact path set refusal")
    check("require_sorted_unique_keys" in sealer_source, "sorted unique classification keys")
    check("validate_ndjson" in sealer_source and "must end with newline" in sealer_source, "present NDJSON preimage qualification")
    check("privateSourceTextPresent\": False" in sealer_source and "privatePayloadPresent\": False" in sealer_source, "private-content absence recorded")

    forbidden_imports = {"subprocess", "socket", "urllib", "requests", "sqlite3"}
    sealer_imports = {
        alias.name.split(".", 1)[0]
        for node in ast.walk(sealer_tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    } | {
        node.module.split(".", 1)[0]
        for node in ast.walk(sealer_tree)
        if isinstance(node, ast.ImportFrom) and node.module
    }
    validator_imports = {
        alias.name.split(".", 1)[0]
        for node in ast.walk(validator_tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    } | {
        node.module.split(".", 1)[0]
        for node in ast.walk(validator_tree)
        if isinstance(node, ast.ImportFrom) and node.module
    }
    check(not forbidden_imports.intersection(sealer_imports), "sealer has no network, process, or database client")
    check(not forbidden_imports.intersection(validator_imports), "validator has no network, process, or database client")
    check(not re.search(r"\bgit\s+(add|commit|push|update-ref|checkout|switch)\b", sealer_source), "sealer contains no Git effect command")
    check(not re.search(r"\bgh\s+(pr|api)\b", sealer_source), "sealer contains no GitHub effect command")

    result = {
        "schema": "axm-asoiaf-agot-local-feature-materialization-request-qualification/1",
        "componentId": COMPONENT_ID,
        "status": "PASS",
        "passed": len(checks),
        "total": len(checks),
        "checks": checks,
        "realDispositionReceiptsConsumed": 0,
        "realAdmittedPropositionsConsumed": 0,
        "realMaterializationPlansConsumed": 0,
        "realMaterializationRequestsSealed": 0,
        "realPostimagesMaterialized": 0,
        "realRepositoryFilesWritten": 0,
        "realCommitsCreated": 0,
        "realReferencesUpdated": 0,
        "realRemotePushes": 0,
        "realPullRequestsOpened": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except QualificationFailure as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-local-feature-materialization-request-qualification/1",
            "status": "FAIL",
            "reason": str(exc),
        }, indent=2, sort_keys=True))
        raise SystemExit(1)
