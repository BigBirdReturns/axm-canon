#!/usr/bin/env python3
"""Validate one AGOT named-human disposition receipt without executing its next effect."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import stat
from pathlib import Path
from typing import Any, Iterable, Sequence

COMPONENT_ID = "asoiaf-agot-named-human-disposition-recorder-v1"
RECEIPT_SCHEMA = "axm-asoiaf-agot-named-human-disposition-receipt/1"
SELF_DIGEST_MARKER = "SELF_DIGESTED_OUTPUT"
HEX64 = re.compile(r"^[0-9a-f]{64}$")
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


class Invalid(RuntimeError):
    """Receipt validation failure."""


def strict_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Invalid(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


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


def require_hex64(value: Any, label: str) -> str:
    text = str(value or "")
    if not HEX64.fullmatch(text):
        raise Invalid(f"{label} must be lowercase SHA-256")
    return text


def require_named(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if len(text) < 3 or len(text) > 2000:
        raise Invalid(f"{label} missing or out of bounds")
    return text


def load_receipt(path: Path) -> dict[str, Any]:
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise Invalid("receipt must be a regular non-symlink file")
    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=strict_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Invalid("receipt must be strict UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise Invalid("receipt must be a JSON object")
    return value


def validate(value: dict[str, Any]) -> None:
    if value.get("schema") != RECEIPT_SCHEMA:
        raise Invalid("receipt schema mismatch")
    if value.get("componentId") != COMPONENT_ID:
        raise Invalid("component identity mismatch")
    if value.get("status") != "PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD":
        raise Invalid("receipt status mismatch")
    if value.get("selfDigestMethod") != SELF_DIGEST_MARKER:
        raise Invalid("self-digest method mismatch")
    observed = require_hex64(value.get("receiptSha256"), "receipt digest")
    candidate = dict(value)
    candidate["receiptSha256"] = SELF_DIGEST_MARKER
    if digest(candidate) != observed:
        raise Invalid("receipt self-digest mismatch")
    if FORBIDDEN_KEYS.intersection(walk_keys(value)):
        raise Invalid("private source or payload field refused")

    decision = str(value.get("decision") or "")
    if decision not in NEXT_HOLD:
        raise Invalid("invalid receipt decision")
    if value.get("nextAuthorityHold") != NEXT_HOLD[decision]:
        raise Invalid("next authority hold mismatch")
    require_named(value.get("candidateId"), "candidateId")

    bindings = value.get("exactBindings")
    if not isinstance(bindings, dict):
        raise Invalid("exact bindings missing")
    for key in (
        "intakeSha256",
        "intakeFileSha256",
        "validationFileSha256",
        "dispositionFileSha256",
        "dispositionSha256",
        "sourceParagraphSha256",
    ):
        require_hex64(bindings.get(key), f"binding {key}")

    human = value.get("humanAuthority")
    if not isinstance(human, dict):
        raise Invalid("human authority missing")
    if human.get("machineGenerated") is not False:
        raise Invalid("machine-generated authority refused")
    reviewer = require_named(human.get("reviewerPrincipal"), "reviewer principal")
    reviewer_display = require_named(human.get("reviewerDisplayName"), "reviewer display name")
    if require_named(human.get("authorPrincipal"), "author principal") != reviewer:
        raise Invalid("author principal mismatch")
    if require_named(human.get("authorDisplayName"), "author display name") != reviewer_display:
        raise Invalid("author display name mismatch")
    require_named(human.get("authoredAt"), "authoredAt")
    require_named(human.get("humanActionEvidence"), "human action evidence")
    require_named(human.get("rationale"), "rationale")
    reasons = human.get("reasonCodes")
    if not isinstance(reasons, list) or not reasons or len(set(map(str, reasons))) != len(reasons):
        raise Invalid("reason-code boundary changed")

    payload = value.get("decisionPayload")
    if not isinstance(payload, dict):
        raise Invalid("decision payload missing")
    proposition = payload.get("admittedProposition")
    proposition_sha = payload.get("admittedPropositionSha256")
    replacement = payload.get("replacementIntakeSha256")
    evidence_keys = payload.get("additionalEvidenceKeys")
    if decision == "ADMIT_EXACT_PROPOSITION":
        proposition_text = require_named(proposition, "admitted proposition")
        if len(proposition_text) > 2000:
            raise Invalid("admitted proposition exceeds bound")
        expected = hashlib.sha256(proposition_text.encode("utf-8")).hexdigest()
        if require_hex64(proposition_sha, "admitted proposition digest") != expected:
            raise Invalid("admitted proposition digest mismatch")
        if replacement is not None or evidence_keys not in (None, []):
            raise Invalid("admission payload overreach")
    elif decision == "RETURN_FOR_CORRECTION":
        require_hex64(replacement, "replacement intake digest")
        if proposition is not None or proposition_sha is not None:
            raise Invalid("correction proposition overreach")
    elif decision == "DEFER_PENDING_EVIDENCE":
        if not isinstance(evidence_keys, list) or not evidence_keys:
            raise Invalid("defer evidence keys missing")
        if proposition is not None or proposition_sha is not None:
            raise Invalid("defer proposition overreach")
    else:
        if proposition is not None or proposition_sha is not None or replacement is not None:
            raise Invalid("rejection payload overreach")
        if evidence_keys not in (None, []):
            raise Invalid("rejection evidence overreach")

    authority = value.get("authorityBoundary")
    if not isinstance(authority, dict):
        raise Invalid("authority boundary missing")
    expected_authority = {
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
    }
    for key, expected in expected_authority.items():
        if authority.get(key) != expected:
            raise Invalid(f"authority boundary mismatch: {key}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path")
    args = parser.parse_args(argv)
    try:
        receipt = load_receipt(Path(args.path))
        validate(receipt)
    except (OSError, Invalid) as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-named-human-disposition-receipt-validation/1",
            "status": "REFUSE_INVALID_NAMED_HUMAN_DISPOSITION_RECEIPT",
            "reason": str(exc),
            "nextEffectExecuted": False,
            "canonEffect": "none",
            "graphEffect": "none",
        }, indent=2, sort_keys=True))
        return 3
    print(json.dumps({
        "schema": "axm-asoiaf-agot-named-human-disposition-receipt-validation/1",
        "status": "PASS_NAMED_HUMAN_DISPOSITION_RECEIPT_VALID_NEXT_EFFECT_WITHHELD",
        "candidateId": receipt["candidateId"],
        "decision": receipt["decision"],
        "nextAuthorityHold": receipt["nextAuthorityHold"],
        "receiptSha256": receipt["receiptSha256"],
        "nextEffectExecuted": False,
        "repositoryFilesWrittenByRuntime": 0,
        "commitsCreatedByRuntime": 0,
        "referencesUpdatedByRuntime": 0,
        "remotePushesByRuntime": 0,
        "pullRequestsOpenedByRuntime": 0,
        "canonEffect": "none",
        "graphEffect": "none",
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
