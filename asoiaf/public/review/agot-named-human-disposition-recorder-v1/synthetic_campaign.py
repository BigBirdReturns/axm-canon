#!/usr/bin/env python3
"""Twenty-case noncopyrighted synthetic campaign for the AGOT disposition recorder."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent
RECORDER = ROOT / "record_disposition.py"
VALIDATOR = ROOT / "validate_receipt.py"
ACTOR = "Jonathan Sandhu"


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def seal(value: dict[str, Any], field: str) -> None:
    value.pop(field, None)
    value[field] = sha256_bytes(canonical(value))


def payload(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")


def base_intake() -> dict[str, Any]:
    value: dict[str, Any] = {
        "schema": "axm-asoiaf-agot-human-review-intake/1",
        "candidateId": "AGOT-CANDIDATE-0001",
        "parentClaimId": "AGOT-CLAIM-0001",
        "parentRecordFingerprint": "1" * 64,
        "reviewer": ACTOR,
        "action": "confirm",
        "rationale": "Synthetic reviewer confirmed the bounded fixture proposition.",
        "databaseSha256": "2" * 64,
        "sourceExcerptSha256": "3" * 64,
        "sourceBinding": {
            "sourceId": "fixture-source",
            "editionKey": "fixture-edition",
            "unitOrder": 1,
            "paragraphIndex": 1,
            "storedTextDigest": "4" * 64,
        },
        "reviewedAt": "2026-08-23T12:00:00Z",
        "executed": False,
        "canonEffect": "none",
        "graphEffect": "none",
    }
    seal(value, "intakeSha256")
    return value


def base_validation(intake_name: str, intake_raw: bytes) -> dict[str, Any]:
    return {
        "schema": "axm-asoiaf-agot-human-review-intake-validation/1",
        "status": "PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR",
        "checked": 1,
        "failed": 0,
        "results": [{"path": intake_name, "passed": True, "errors": []}],
        "validatedIntakeFileSha256": sha256_bytes(intake_raw),
        "validatorExecutedTransaction": False,
        "executedHumanTransactions": 0,
        "canonEffect": "none",
        "graphEffect": "none",
    }


def base_disposition(
    intake: dict[str, Any],
    intake_raw: bytes,
    decision: str,
) -> dict[str, Any]:
    admitted: str | None = None
    replacement: str | None = None
    evidence_keys: list[str] = []
    reasons = ["SOURCE_MATCH"]
    if decision == "ADMIT_EXACT_PROPOSITION":
        admitted = "The fixture raven crossed the synthetic courtyard before noon."
    elif decision == "REJECT_EXACT_PROPOSITION":
        reasons = ["SOURCE_CONTRADICTS"]
    elif decision == "RETURN_FOR_CORRECTION":
        replacement = "5" * 64
        reasons = ["INTAKE_CORRECTION_REQUIRED"]
    elif decision == "DEFER_PENDING_EVIDENCE":
        evidence_keys = ["FIXTURE-EVIDENCE-001"]
        reasons = ["ADDITIONAL_EVIDENCE_REQUIRED"]
    value: dict[str, Any] = {
        "schema": "axm-asoiaf-agot-named-human-disposition/1",
        "candidateId": intake["candidateId"],
        "intakeSha256": intake["intakeSha256"],
        "intakeFileSha256": sha256_bytes(intake_raw),
        "sourceParagraphSha256": intake["sourceExcerptSha256"],
        "reviewerPrincipal": ACTOR,
        "reviewerDisplayName": ACTOR,
        "authorPrincipal": ACTOR,
        "authorDisplayName": ACTOR,
        "authoredAt": "2026-08-23T12:05:00Z",
        "machineGenerated": False,
        "humanActionEvidence": "fixture-local-human-action-001",
        "decision": decision,
        "reasonCodes": reasons,
        "rationale": "Synthetic human disposition for a noncopyrighted fixture.",
        "admittedProposition": admitted,
        "propositionIsSourceExcerpt": False,
        "replacementIntakeSha256": replacement,
        "additionalEvidenceKeys": evidence_keys,
        "repositoryEffectAuthorized": False,
        "canonEffect": "none",
        "graphEffect": "none",
    }
    seal(value, "dispositionSha256")
    return value


def run_recorder(
    intake_path: Path,
    validation_path: Path,
    disposition_path: Path,
    output_path: Path,
    actor: str,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-S",
            str(RECORDER),
            "--intake",
            str(intake_path),
            "--validation",
            str(validation_path),
            "--disposition",
            str(disposition_path),
            "--output",
            str(output_path),
            "--actor",
            actor,
        ],
        check=False,
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONWARNINGS": "error", "PYTHONSAFEPATH": "1"},
    )


def assert_success(decision: str, expected_hold: str) -> None:
    with tempfile.TemporaryDirectory(prefix="axm-disposition-success-") as directory:
        root = Path(directory)
        intake_path = root / "INTAKE.json"
        validation_path = root / "VALIDATION.json"
        disposition_path = root / "DISPOSITION.json"
        output_path = root / "RECEIPT.json"
        intake = base_intake()
        intake_raw = payload(intake)
        intake_path.write_bytes(intake_raw)
        validation_path.write_bytes(payload(base_validation(intake_path.name, intake_raw)))
        disposition_path.write_bytes(payload(base_disposition(intake, intake_raw, decision)))
        completed = run_recorder(intake_path, validation_path, disposition_path, output_path, ACTOR)
        assert completed.returncode == 0, completed.stderr or completed.stdout
        receipt = json.loads(output_path.read_text(encoding="utf-8"))
        assert receipt["status"] == "PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD"
        assert receipt["decision"] == decision
        assert receipt["nextAuthorityHold"] == expected_hold
        validation = subprocess.run(
            [sys.executable, "-S", str(VALIDATOR), str(output_path)],
            check=False,
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONWARNINGS": "error", "PYTHONSAFEPATH": "1"},
        )
        assert validation.returncode == 0, validation.stderr or validation.stdout
        assert json.loads(validation.stdout)["status"] == "PASS_NAMED_HUMAN_DISPOSITION_RECEIPT_VALID_NEXT_EFFECT_WITHHELD"


def assert_refusal(
    mutate_intake: Callable[[dict[str, Any]], None] | None = None,
    mutate_validation: Callable[[dict[str, Any]], None] | None = None,
    mutate_disposition: Callable[[dict[str, Any]], None] | None = None,
    *,
    actor: str = ACTOR,
    tamper_intake_after_seal: bool = False,
    tamper_disposition_after_seal: bool = False,
    duplicate_disposition_key: bool = False,
    precreate_output: bool = False,
    symlink_intake: bool = False,
    decision: str = "ADMIT_EXACT_PROPOSITION",
) -> None:
    with tempfile.TemporaryDirectory(prefix="axm-disposition-refusal-") as directory:
        root = Path(directory)
        real_intake_path = root / "INTAKE.json"
        intake_path = real_intake_path
        validation_path = root / "VALIDATION.json"
        disposition_path = root / "DISPOSITION.json"
        output_path = root / "RECEIPT.json"

        intake = base_intake()
        if mutate_intake is not None:
            mutate_intake(intake)
            seal(intake, "intakeSha256")
        if tamper_intake_after_seal:
            intake["candidateId"] = "AGOT-CANDIDATE-TAMPERED"
        intake_raw = payload(intake)
        real_intake_path.write_bytes(intake_raw)
        if symlink_intake:
            intake_path = root / "INTAKE-LINK.json"
            intake_path.symlink_to(real_intake_path)

        validation = base_validation(intake_path.name, intake_raw)
        if mutate_validation is not None:
            mutate_validation(validation)
        validation_path.write_bytes(payload(validation))

        disposition = base_disposition(intake, intake_raw, decision)
        if mutate_disposition is not None:
            mutate_disposition(disposition)
            seal(disposition, "dispositionSha256")
        if tamper_disposition_after_seal:
            disposition["rationale"] = "Tampered after self-digest."
        if duplicate_disposition_key:
            encoded = json.dumps(disposition, ensure_ascii=False, sort_keys=True)
            disposition_path.write_text(
                encoded[:-1] + ',"decision":"REJECT_EXACT_PROPOSITION"}\n',
                encoding="utf-8",
            )
        else:
            disposition_path.write_bytes(payload(disposition))

        if precreate_output:
            output_path.write_text("sentinel\n", encoding="utf-8")
        completed = run_recorder(intake_path, validation_path, disposition_path, output_path, actor)
        assert completed.returncode == 3, completed.stderr or completed.stdout
        result = json.loads(completed.stdout)
        assert result["status"] == "REFUSE_NAMED_HUMAN_DISPOSITION_NOT_RECORDED"
        if precreate_output:
            assert output_path.read_text(encoding="utf-8") == "sentinel\n"
        else:
            assert not output_path.exists()


def main() -> int:
    cases: list[tuple[str, Callable[[], None]]] = [
        ("admit success", lambda: assert_success("ADMIT_EXACT_PROPOSITION", "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD")),
        ("reject success", lambda: assert_success("REJECT_EXACT_PROPOSITION", "CLOSE_INTAKE_WITHHELD")),
        ("correction success", lambda: assert_success("RETURN_FOR_CORRECTION", "CORRECTED_INTAKE_WITHHELD")),
        ("defer success", lambda: assert_success("DEFER_PENDING_EVIDENCE", "ADDITIONAL_EVIDENCE_WITHHELD")),
        ("machine generation refused", lambda: assert_refusal(mutate_disposition=lambda value: value.__setitem__("machineGenerated", True))),
        ("reviewer drift refused", lambda: assert_refusal(mutate_disposition=lambda value: value.__setitem__("reviewerPrincipal", "Different Reviewer"))),
        ("actor drift refused", lambda: assert_refusal(actor="Different Actor")),
        ("intake self-digest tamper refused", lambda: assert_refusal(tamper_intake_after_seal=True)),
        ("disposition self-digest tamper refused", lambda: assert_refusal(tamper_disposition_after_seal=True)),
        ("duplicate JSON key refused", lambda: assert_refusal(duplicate_disposition_key=True)),
        ("source text field refused", lambda: assert_refusal(mutate_disposition=lambda value: value.__setitem__("sourceText", "forbidden fixture text"))),
        ("validation status refused", lambda: assert_refusal(mutate_validation=lambda value: value.__setitem__("status", "REFUSE_INVALID_OR_INCOMPLETE_INTAKE"))),
        ("validation byte drift refused", lambda: assert_refusal(mutate_validation=lambda value: value.__setitem__("validatedIntakeFileSha256", "9" * 64))),
        ("same correction digest refused", lambda: assert_refusal(decision="RETURN_FOR_CORRECTION", mutate_disposition=lambda value: value.__setitem__("replacementIntakeSha256", value["intakeSha256"]))),
        ("empty defer evidence refused", lambda: assert_refusal(decision="DEFER_PENDING_EVIDENCE", mutate_disposition=lambda value: value.__setitem__("additionalEvidenceKeys", []))),
        ("missing admission proposition refused", lambda: assert_refusal(mutate_disposition=lambda value: value.__setitem__("admittedProposition", None))),
        ("timestamp inversion refused", lambda: assert_refusal(mutate_disposition=lambda value: value.__setitem__("authoredAt", "2026-08-23T11:59:59Z"))),
        ("output overwrite refused", lambda: assert_refusal(precreate_output=True)),
        ("symlink intake refused", lambda: assert_refusal(symlink_intake=True)),
        ("repository effect request refused", lambda: assert_refusal(mutate_disposition=lambda value: value.__setitem__("repositoryEffectAuthorized", True))),
    ]
    failures: list[dict[str, str]] = []
    for label, operation in cases:
        try:
            operation()
        except Exception as exc:
            failures.append({"case": label, "error": f"{type(exc).__name__}: {exc}"})
    output = {
        "schema": "axm-asoiaf-agot-named-human-disposition-recorder-synthetic-campaign/1",
        "status": "PASS" if not failures else "FAIL",
        "passed": len(cases) - len(failures),
        "total": len(cases),
        "failures": failures,
        "noncopyrightedFixtureOnly": True,
        "privateSourceTextUsed": False,
        "realPrivateParagraphsConsumed": 0,
        "realValidatedIntakesConsumed": 0,
        "realNamedHumanDispositionsConsumed": 0,
        "realPropositionAdmissions": 0,
        "realLocalFeatureMaterializationRequests": 0,
        "realLocalFeaturesMaterialized": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failures and len(cases) == 20 else 1


if __name__ == "__main__":
    raise SystemExit(main())
