#!/usr/bin/env python3
"""Record one exact named-human AGOT disposition without executing its next effect."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

COMPONENT_ID = "asoiaf-agot-named-human-disposition-recorder-v1"
INTAKE_SCHEMA = "axm-asoiaf-agot-human-review-intake/1"
VALIDATION_SCHEMA = "axm-asoiaf-agot-human-review-intake-validation/1"
VALIDATION_STATUS = "PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR"
DISPOSITION_SCHEMA = "axm-asoiaf-agot-named-human-disposition/1"
RECEIPT_SCHEMA = "axm-asoiaf-agot-named-human-disposition-receipt/1"
SELF_DIGEST_MARKER = "SELF_DIGESTED_OUTPUT"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
REASON = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")
NEXT_HOLD = {
    "ADMIT_EXACT_PROPOSITION": "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD",
    "REJECT_EXACT_PROPOSITION": "CLOSE_INTAKE_WITHHELD",
    "RETURN_FOR_CORRECTION": "CORRECTED_INTAKE_WITHHELD",
    "DEFER_PENDING_EVIDENCE": "ADDITIONAL_EVIDENCE_WITHHELD",
}
FORBIDDEN_KEYS = {
    "sourcetext",
    "paragraphtext",
    "displayedsource",
    "sourceexcerpt",
    "privateparagraph",
    "booktext",
    "rawsource",
    "sourceprose",
    "privatepayload",
}


class Refusal(RuntimeError):
    """Fail-closed input or authority refusal."""


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_object(value: Any) -> str:
    return digest_bytes(canonical(value))


def strict_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Refusal(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def normalize_key(key: str) -> str:
    return key.casefold().replace("_", "").replace("-", "")


def walk_keys(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield normalize_key(str(key))
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


def require_regular_file(path: Path, label: str) -> bytes:
    try:
        info = path.lstat()
    except FileNotFoundError as exc:
        raise Refusal(f"{label} missing") from exc
    if stat.S_ISLNK(info.st_mode):
        raise Refusal(f"{label} symlink refused")
    if not stat.S_ISREG(info.st_mode):
        raise Refusal(f"{label} must be a regular file")
    return path.read_bytes()


def load_object(path: Path, label: str) -> tuple[dict[str, Any], bytes]:
    raw = require_regular_file(path, label)
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=strict_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Refusal(f"{label} is not strict UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise Refusal(f"{label} must be a JSON object")
    return value, raw


def require_hex64(value: Any, label: str) -> str:
    text = str(value or "")
    if not HEX64.fullmatch(text):
        raise Refusal(f"{label} must be lowercase SHA-256")
    return text


def require_named(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if len(text) < 3 or len(text) > 200:
        raise Refusal(f"{label} missing or out of bounds")
    return text


def parse_time(value: Any, label: str) -> datetime:
    text = str(value or "")
    if not text.endswith("Z"):
        raise Refusal(f"{label} must be UTC with Z suffix")
    try:
        observed = datetime.fromisoformat(text[:-1] + "+00:00")
    except ValueError as exc:
        raise Refusal(f"{label} is not ISO-8601") from exc
    if observed.tzinfo != timezone.utc:
        raise Refusal(f"{label} must be UTC")
    return observed


def verify_self_digest(value: dict[str, Any], field: str, label: str) -> str:
    observed = require_hex64(value.get(field), f"{label} {field}")
    candidate = dict(value)
    candidate.pop(field, None)
    if digest_object(candidate) != observed:
        raise Refusal(f"{label} self-digest mismatch")
    return observed


def validation_intake_digest(validation: dict[str, Any]) -> str:
    direct = validation.get("validatedIntakeFileSha256")
    binding = validation.get("binding")
    nested = binding.get("intakeFileSha256") if isinstance(binding, dict) else None
    return require_hex64(direct or nested, "validation intake file digest")


def validate_inputs(
    intake: dict[str, Any],
    intake_raw: bytes,
    intake_name: str,
    validation: dict[str, Any],
    disposition: dict[str, Any],
    actor: str,
) -> dict[str, Any]:
    if intake.get("schema") != INTAKE_SCHEMA:
        raise Refusal("intake schema mismatch")
    if intake.get("executed") is not False:
        raise Refusal("intake must remain unexecuted")
    if intake.get("canonEffect") != "none" or intake.get("graphEffect") != "none":
        raise Refusal("intake authority boundary changed")
    intake_sha = verify_self_digest(intake, "intakeSha256", "intake")
    intake_file_sha = digest_bytes(intake_raw)
    source_sha = require_hex64(intake.get("sourceExcerptSha256"), "source paragraph digest")
    candidate_id = require_named(intake.get("candidateId"), "candidateId")
    reviewer_principal = require_named(
        intake.get("reviewerPrincipal") or intake.get("reviewer"),
        "intake reviewer principal",
    )
    reviewer_display = require_named(
        intake.get("reviewerDisplayName") or intake.get("reviewer"),
        "intake reviewer display name",
    )

    if validation.get("schema") != VALIDATION_SCHEMA:
        raise Refusal("validation schema mismatch")
    if validation.get("status") != VALIDATION_STATUS:
        raise Refusal("validation status mismatch")
    if int(validation.get("checked", 0)) != 1 or int(validation.get("failed", 1)) != 0:
        raise Refusal("validation census mismatch")
    results = validation.get("results")
    if not isinstance(results, list) or len(results) != 1:
        raise Refusal("validation result census mismatch")
    result = results[0]
    if not isinstance(result, dict) or result.get("passed") is not True:
        raise Refusal("validation did not pass exact intake")
    if str(result.get("path") or "") != intake_name:
        raise Refusal("validation path mismatch")
    if validation_intake_digest(validation) != intake_file_sha:
        raise Refusal("validation is not bound to exact intake bytes")
    if validation.get("validatorExecutedTransaction") is not False:
        raise Refusal("validator execution boundary changed")
    if validation.get("canonEffect") != "none" or validation.get("graphEffect") != "none":
        raise Refusal("validation authority boundary changed")

    if disposition.get("schema") != DISPOSITION_SCHEMA:
        raise Refusal("disposition schema mismatch")
    if disposition.get("machineGenerated") is not False:
        raise Refusal("machine-generated disposition refused")
    if FORBIDDEN_KEYS.intersection(walk_keys(disposition)):
        raise Refusal("private source or payload field refused")
    disposition_sha = verify_self_digest(disposition, "dispositionSha256", "disposition")
    if require_named(disposition.get("candidateId"), "disposition candidateId") != candidate_id:
        raise Refusal("candidate identity mismatch")
    if require_hex64(disposition.get("intakeSha256"), "disposition intake digest") != intake_sha:
        raise Refusal("intake self-digest binding mismatch")
    if require_hex64(disposition.get("intakeFileSha256"), "disposition intake file digest") != intake_file_sha:
        raise Refusal("intake byte binding mismatch")
    if require_hex64(disposition.get("sourceParagraphSha256"), "disposition source digest") != source_sha:
        raise Refusal("source paragraph digest mismatch")

    disposition_reviewer = require_named(disposition.get("reviewerPrincipal"), "disposition reviewer principal")
    disposition_reviewer_display = require_named(
        disposition.get("reviewerDisplayName"),
        "disposition reviewer display name",
    )
    if disposition_reviewer != reviewer_principal or disposition_reviewer_display != reviewer_display:
        raise Refusal("reviewer mismatch")
    author_principal = require_named(disposition.get("authorPrincipal"), "disposition author principal")
    author_display = require_named(disposition.get("authorDisplayName"), "disposition author display name")
    if author_principal != reviewer_principal or author_display != reviewer_display:
        raise Refusal("disposition author must be the named intake reviewer")
    if require_named(actor, "recording actor") != author_principal:
        raise Refusal("recording actor mismatch")

    authored_at = parse_time(disposition.get("authoredAt"), "disposition authoredAt")
    intake_time_value = intake.get("reviewedAt") or intake.get("reviewTime") or intake.get("savedAt")
    if intake_time_value is not None and authored_at < parse_time(intake_time_value, "intake review time"):
        raise Refusal("disposition predates intake review")
    evidence = require_named(disposition.get("humanActionEvidence"), "human action evidence")
    rationale = require_named(disposition.get("rationale"), "rationale")
    reason_codes = disposition.get("reasonCodes")
    if not isinstance(reason_codes, list) or not reason_codes:
        raise Refusal("reason codes required")
    normalized_reasons = [str(value) for value in reason_codes]
    if len(set(normalized_reasons)) != len(normalized_reasons):
        raise Refusal("duplicate reason codes refused")
    if any(not REASON.fullmatch(value) for value in normalized_reasons):
        raise Refusal("invalid reason code")

    if disposition.get("repositoryEffectAuthorized") is not False:
        raise Refusal("repository effect authorization refused")
    if disposition.get("canonEffect") != "none" or disposition.get("graphEffect") != "none":
        raise Refusal("canon or graph effect refused")

    decision = str(disposition.get("decision") or "")
    if decision not in NEXT_HOLD:
        raise Refusal("invalid disposition decision")
    proposition: str | None = None
    replacement: str | None = None
    evidence_keys: list[str] = []
    if decision == "ADMIT_EXACT_PROPOSITION":
        proposition = str(disposition.get("admittedProposition") or "").strip()
        if not proposition or len(proposition) > 2000:
            raise Refusal("bounded admitted proposition required")
        if disposition.get("propositionIsSourceExcerpt") is True:
            raise Refusal("source excerpt cannot be admitted as proposition payload")
        if disposition.get("replacementIntakeSha256") not in (None, ""):
            raise Refusal("replacement intake forbidden for admission")
        if disposition.get("additionalEvidenceKeys") not in (None, []):
            raise Refusal("additional evidence keys forbidden for admission")
    elif decision == "RETURN_FOR_CORRECTION":
        replacement = require_hex64(
            disposition.get("replacementIntakeSha256"),
            "replacement intake digest",
        )
        if replacement == intake_sha:
            raise Refusal("replacement intake digest must differ")
        if disposition.get("admittedProposition") not in (None, ""):
            raise Refusal("admitted proposition forbidden for correction")
    elif decision == "DEFER_PENDING_EVIDENCE":
        raw_keys = disposition.get("additionalEvidenceKeys")
        if not isinstance(raw_keys, list) or not raw_keys:
            raise Refusal("additional evidence keys required")
        evidence_keys = [require_named(value, "additional evidence key") for value in raw_keys]
        if len(set(evidence_keys)) != len(evidence_keys):
            raise Refusal("duplicate additional evidence keys refused")
        if disposition.get("admittedProposition") not in (None, ""):
            raise Refusal("admitted proposition forbidden for defer")
    else:
        if disposition.get("admittedProposition") not in (None, ""):
            raise Refusal("admitted proposition forbidden for rejection")
        if disposition.get("replacementIntakeSha256") not in (None, ""):
            raise Refusal("replacement intake forbidden for rejection")
        if disposition.get("additionalEvidenceKeys") not in (None, []):
            raise Refusal("additional evidence keys forbidden for rejection")

    return {
        "candidateId": candidate_id,
        "intakeSha256": intake_sha,
        "intakeFileSha256": intake_file_sha,
        "sourceParagraphSha256": source_sha,
        "reviewerPrincipal": reviewer_principal,
        "reviewerDisplayName": reviewer_display,
        "authorPrincipal": author_principal,
        "authorDisplayName": author_display,
        "authoredAt": disposition["authoredAt"],
        "humanActionEvidence": evidence,
        "decision": decision,
        "reasonCodes": normalized_reasons,
        "rationale": rationale,
        "admittedProposition": proposition,
        "replacementIntakeSha256": replacement,
        "additionalEvidenceKeys": evidence_keys,
        "dispositionSha256": disposition_sha,
    }


def build_receipt(
    bound: dict[str, Any],
    validation_raw: bytes,
    disposition_raw: bytes,
) -> dict[str, Any]:
    proposition = bound["admittedProposition"]
    receipt: dict[str, Any] = {
        "schema": RECEIPT_SCHEMA,
        "componentId": COMPONENT_ID,
        "status": "PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD",
        "candidateId": bound["candidateId"],
        "decision": bound["decision"],
        "nextAuthorityHold": NEXT_HOLD[bound["decision"]],
        "exactBindings": {
            "intakeSha256": bound["intakeSha256"],
            "intakeFileSha256": bound["intakeFileSha256"],
            "validationFileSha256": digest_bytes(validation_raw),
            "dispositionFileSha256": digest_bytes(disposition_raw),
            "dispositionSha256": bound["dispositionSha256"],
            "sourceParagraphSha256": bound["sourceParagraphSha256"],
        },
        "humanAuthority": {
            "reviewerPrincipal": bound["reviewerPrincipal"],
            "reviewerDisplayName": bound["reviewerDisplayName"],
            "authorPrincipal": bound["authorPrincipal"],
            "authorDisplayName": bound["authorDisplayName"],
            "authoredAt": bound["authoredAt"],
            "humanActionEvidence": bound["humanActionEvidence"],
            "reasonCodes": bound["reasonCodes"],
            "rationale": bound["rationale"],
            "machineGenerated": False,
        },
        "decisionPayload": {
            "admittedProposition": proposition,
            "admittedPropositionSha256": (
                digest_bytes(proposition.encode("utf-8")) if proposition is not None else None
            ),
            "replacementIntakeSha256": bound["replacementIntakeSha256"],
            "additionalEvidenceKeys": bound["additionalEvidenceKeys"],
        },
        "authorityBoundary": {
            "receiptIsNotLocalFeatureMaterializationRequest": True,
            "repositoryFilesWrittenByRuntime": 0,
            "commitsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
            "canonEffect": "none",
            "graphEffect": "none",
        },
        "selfDigestMethod": SELF_DIGEST_MARKER,
        "receiptSha256": SELF_DIGEST_MARKER,
    }
    receipt["receiptSha256"] = digest_object(receipt)
    return receipt


def write_exclusive(path: Path, value: dict[str, Any]) -> None:
    if path.exists() or path.is_symlink():
        raise Refusal("output already exists")
    if not path.parent.is_dir():
        raise Refusal("output parent directory missing")
    payload = (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        raise


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--intake", required=True)
    parser.add_argument("--validation", required=True)
    parser.add_argument("--disposition", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    try:
        intake_path = Path(args.intake)
        intake, intake_raw = load_object(intake_path, "intake")
        validation, validation_raw = load_object(Path(args.validation), "validation")
        disposition, disposition_raw = load_object(Path(args.disposition), "disposition")
        bound = validate_inputs(
            intake,
            intake_raw,
            intake_path.name,
            validation,
            disposition,
            args.actor,
        )
        receipt = build_receipt(bound, validation_raw, disposition_raw)
        write_exclusive(Path(args.output), receipt)
    except Refusal as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-named-human-disposition-refusal/1",
            "status": "REFUSE_NAMED_HUMAN_DISPOSITION_NOT_RECORDED",
            "reason": str(exc),
            "repositoryFilesWrittenByRuntime": 0,
            "commitsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "canonEffect": "none",
            "graphEffect": "none",
        }, indent=2, sort_keys=True))
        return 3
    print(json.dumps(receipt, indent=2, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
