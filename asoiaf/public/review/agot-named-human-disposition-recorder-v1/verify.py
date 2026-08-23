#!/usr/bin/env python3
"""Static qualification for the repository-native AGOT disposition recorder."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent


def load(name: str) -> dict[str, Any]:
    value = json.loads((ROOT / name).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"{name} must contain an object")
    return value


def main() -> int:
    contract = load("CONTRACT.json")
    standing = load("CURRENT_STANDING.json")
    template = load("DISPOSITION_TEMPLATE.json")
    recorder = (ROOT / "record_disposition.py").read_text(encoding="utf-8")
    validator = (ROOT / "validate_receipt.py").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    required = {
        "CONTRACT.json",
        "CURRENT_STANDING.json",
        "DISPOSITION_TEMPLATE.json",
        "README.md",
        "Run-Record-Named-Human-Disposition.cmd",
        "record_disposition.py",
        "validate_receipt.py",
        "verify.py",
        "synthetic_campaign.py",
    }
    observed = {path.name for path in ROOT.iterdir() if path.is_file()}
    checks: list[tuple[str, bool]] = [
        ("component inventory exact", observed == required),
        ("contract schema", contract.get("schema") == "axm-asoiaf-agot-named-human-disposition-recorder-contract/1"),
        ("component identity", contract.get("componentId") == "asoiaf-agot-named-human-disposition-recorder-v1"),
        ("candidate standing", contract.get("standing") == "repository-native-source-candidate-real-named-human-disposition-held"),
        ("upstream component", contract["upstream"].get("componentId") == "asoiaf-agot-local-human-review-workstation-v1"),
        ("upstream admission", contract["upstream"].get("admissionCommit") == "85b6ad80a7e115bb867d729ec8fccb8a9b76b79e"),
        ("intake schema", contract["upstream"].get("requiredIntakeSchema") == "axm-asoiaf-agot-human-review-intake/1"),
        ("validation schema", contract["upstream"].get("requiredValidationSchema") == "axm-asoiaf-agot-human-review-intake-validation/1"),
        ("validation status", contract["upstream"].get("requiredValidationStatus") == "PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR"),
        ("four decisions", contract.get("allowedDecisions") == ["ADMIT_EXACT_PROPOSITION", "REJECT_EXACT_PROPOSITION", "RETURN_FOR_CORRECTION", "DEFER_PENDING_EVIDENCE"]),
        ("admit hold", contract["nextAuthorityHolds"].get("ADMIT_EXACT_PROPOSITION") == "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD"),
        ("reject hold", contract["nextAuthorityHolds"].get("REJECT_EXACT_PROPOSITION") == "CLOSE_INTAKE_WITHHELD"),
        ("correction hold", contract["nextAuthorityHolds"].get("RETURN_FOR_CORRECTION") == "CORRECTED_INTAKE_WITHHELD"),
        ("defer hold", contract["nextAuthorityHolds"].get("DEFER_PENDING_EVIDENCE") == "ADDITIONAL_EVIDENCE_WITHHELD"),
        ("named reviewer", contract["humanBoundary"].get("namedReviewerRequired") is True),
        ("actor author binding", contract["humanBoundary"].get("recordingActorMustMatchDispositionAuthor") is True),
        ("author reviewer binding", contract["humanBoundary"].get("dispositionAuthorMustMatchIntakeReviewer") is True),
        ("machine generation forbidden", contract["humanBoundary"].get("machineGeneratedDispositionForbidden") is True),
        ("human evidence required", contract["humanBoundary"].get("humanActionEvidenceRequired") is True),
        ("reason codes required", contract["humanBoundary"].get("reasonCodesRequired") is True),
        ("rationale required", contract["humanBoundary"].get("rationaleRequired") is True),
        ("exact intake bytes", contract["bindingBoundary"].get("exactIntakeBytesSha256Required") is True),
        ("intake self digest", contract["bindingBoundary"].get("intakeSelfDigestRequired") is True),
        ("source paragraph digest", contract["bindingBoundary"].get("sourceParagraphSha256Required") is True),
        ("validation exact binding", contract["bindingBoundary"].get("validationMustBindExactIntakeBytes") is True),
        ("disposition self digest", contract["bindingBoundary"].get("dispositionSelfDigestRequired") is True),
        ("duplicate keys forbidden", contract["bindingBoundary"].get("duplicateJsonKeysForbidden") is True),
        ("symlinks forbidden", contract["bindingBoundary"].get("symlinkInputsForbidden") is True),
        ("overwrite forbidden", contract["bindingBoundary"].get("outputOverwriteForbidden") is True),
        ("source text forbidden", contract["contentBoundary"].get("privateSourceTextForbidden") is True),
        ("private payload forbidden", contract["contentBoundary"].get("privatePayloadForbidden") is True),
        ("proposition decision bound", contract["contentBoundary"].get("admittedPropositionAllowedOnlyForAdmissionDecision") is True),
        ("proposition size bound", contract["contentBoundary"].get("admittedPropositionMaximumCharacters") == 2000),
        ("receipt is not request", contract["authorityBoundary"].get("receiptIsNotLocalFeatureMaterializationRequest") is True),
        ("runtime repository writes zero", contract["authorityBoundary"].get("repositoryFilesWrittenByRuntime") == 0),
        ("runtime commits zero", contract["authorityBoundary"].get("commitsCreatedByRuntime") == 0),
        ("runtime references zero", contract["authorityBoundary"].get("referencesUpdatedByRuntime") == 0),
        ("runtime pushes zero", contract["authorityBoundary"].get("remotePushesByRuntime") == 0),
        ("runtime pull requests zero", contract["authorityBoundary"].get("pullRequestsOpenedByRuntime") == 0),
        ("automatic canon none", contract["authorityBoundary"].get("automaticCanonEffect") == "none"),
        ("automatic graph none", contract["authorityBoundary"].get("automaticGraphEffect") == "none"),
        ("standing status", standing.get("status") == "REPOSITORY_SOURCE_CANDIDATE_REAL_DISPOSITION_WITHHELD"),
        ("standing census zero", all(value == 0 for value in standing["counts"].values())),
        ("standing source absent", standing.get("privateSourceTextPresent") is False),
        ("standing payload absent", standing.get("privatePayloadPresent") is False),
        ("template schema", template.get("schema") == "axm-asoiaf-agot-named-human-disposition/1"),
        ("template human only", template.get("machineGenerated") is False),
        ("template repository effect false", template.get("repositoryEffectAuthorized") is False),
        ("template canon none", template.get("canonEffect") == "none"),
        ("template graph none", template.get("graphEffect") == "none"),
        ("exclusive output operation", "os.O_EXCL" in recorder and "output already exists" in recorder),
        ("stable self digest", "SELF_DIGESTED_OUTPUT" in recorder and "receiptSha256" in validator),
    ]
    failed = [label for label, passed in checks if not passed]
    output = {
        "schema": "axm-asoiaf-agot-named-human-disposition-recorder-verification/1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "realPrivateParagraphsConsumed": 0,
        "realValidatedIntakesConsumed": 0,
        "realNamedHumanDispositionsConsumed": 0,
        "realPropositionAdmissions": 0,
        "realLocalFeatureMaterializationRequests": 0,
        "realLocalFeaturesMaterialized": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failed and len(checks) == 52 else 1


if __name__ == "__main__":
    raise SystemExit(main())
