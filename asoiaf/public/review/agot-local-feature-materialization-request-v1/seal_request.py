#!/usr/bin/env python3
"""Seal one AGOT local-feature materialization request without executing it."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import stat
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Sequence

COMPONENT_ID = "asoiaf-agot-local-feature-materialization-request-v1"
UPSTREAM_COMPONENT_ID = "asoiaf-agot-named-human-disposition-recorder-v1"
UPSTREAM_RECEIPT_SCHEMA = "axm-asoiaf-agot-named-human-disposition-receipt/1"
UPSTREAM_STATUS = "PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD"
UPSTREAM_DECISION = "ADMIT_EXACT_PROPOSITION"
UPSTREAM_HOLD = "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD"
PLAN_SCHEMA = "axm-asoiaf-agot-local-feature-materialization-plan/1"
REQUEST_SCHEMA = "axm-asoiaf-agot-local-feature-materialization-request/1"
SELF_DIGEST_MARKER = "SELF_DIGESTED_OUTPUT"
PASS_STATUS = "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD"
NEXT_HOLD = "LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD"
REPOSITORY = "BigBirdReturns/axm-canon"
BASE_BRANCH = "main"
CANON_PATH = "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson"
GRAPH_PATH = "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson"
MAX_PREIMAGE_BYTES = 16 * 1024 * 1024
MAX_PROPOSITION_CHARS = 2000
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")
CODE = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")
KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$")
FEATURE_BRANCH = re.compile(r"^feature/asoiaf-agot/[a-z0-9][a-z0-9._/-]{2,120}$")
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
    "sourcebytes",
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


def require_regular_file(path: Path, label: str, *, maximum: int | None = None) -> bytes:
    try:
        info = path.lstat()
    except FileNotFoundError as exc:
        raise Refusal(f"{label} missing") from exc
    if stat.S_ISLNK(info.st_mode):
        raise Refusal(f"{label} symlink refused")
    if not stat.S_ISREG(info.st_mode):
        raise Refusal(f"{label} must be a regular file")
    if maximum is not None and info.st_size > maximum:
        raise Refusal(f"{label} exceeds byte limit")
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


def require_hex40(value: Any, label: str) -> str:
    text = str(value or "")
    if not HEX40.fullmatch(text):
        raise Refusal(f"{label} must be a lowercase 40-character Git object ID")
    return text


def require_named(value: Any, label: str, *, maximum: int = 500) -> str:
    text = str(value or "").strip()
    if len(text) < 3 or len(text) > maximum:
        raise Refusal(f"{label} missing or out of bounds")
    return text


def require_code(value: Any, label: str) -> str:
    text = str(value or "")
    if not CODE.fullmatch(text):
        raise Refusal(f"{label} must be a governed uppercase code")
    return text


def require_key(value: Any, label: str) -> str:
    text = str(value or "")
    if not KEY.fullmatch(text) or ".." in text or "//" in text:
        raise Refusal(f"{label} must be a governed key")
    return text


def require_sorted_unique_keys(value: Any, label: str, *, maximum: int = 16) -> list[str]:
    if not isinstance(value, list) or not value or len(value) > maximum:
        raise Refusal(f"{label} must contain 1 to {maximum} keys")
    keys = [require_key(item, f"{label} item") for item in value]
    if keys != sorted(keys):
        raise Refusal(f"{label} must be sorted")
    if len(set(keys)) != len(keys):
        raise Refusal(f"{label} contains duplicates")
    return keys


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


def verify_marker_digest(value: dict[str, Any], field: str, label: str) -> str:
    observed = require_hex64(value.get(field), f"{label} {field}")
    if value.get("selfDigestMethod") != SELF_DIGEST_MARKER:
        raise Refusal(f"{label} self-digest method mismatch")
    candidate = copy.deepcopy(value)
    candidate[field] = SELF_DIGEST_MARKER
    if digest_object(candidate) != observed:
        raise Refusal(f"{label} self-digest mismatch")
    return observed


def verify_receipt(receipt: dict[str, Any], receipt_raw: bytes) -> dict[str, Any]:
    if receipt.get("schema") != UPSTREAM_RECEIPT_SCHEMA:
        raise Refusal("disposition receipt schema mismatch")
    if receipt.get("componentId") != UPSTREAM_COMPONENT_ID:
        raise Refusal("disposition receipt component mismatch")
    if receipt.get("status") != UPSTREAM_STATUS:
        raise Refusal("disposition receipt status mismatch")
    if receipt.get("decision") != UPSTREAM_DECISION:
        raise Refusal("only exact proposition admissions may be materialized")
    if receipt.get("nextAuthorityHold") != UPSTREAM_HOLD:
        raise Refusal("disposition receipt next-authority hold mismatch")
    if FORBIDDEN_KEYS.intersection(walk_keys(receipt)):
        raise Refusal("private source or payload field refused")
    receipt_sha = verify_marker_digest(receipt, "receiptSha256", "disposition receipt")

    candidate_id = require_named(receipt.get("candidateId"), "candidateId", maximum=200)
    exact = receipt.get("exactBindings")
    if not isinstance(exact, dict):
        raise Refusal("disposition receipt exact bindings missing")
    source_sha = require_hex64(exact.get("sourceParagraphSha256"), "source paragraph digest")
    for field in (
        "intakeSha256",
        "intakeFileSha256",
        "validationFileSha256",
        "dispositionFileSha256",
        "dispositionSha256",
    ):
        require_hex64(exact.get(field), f"disposition receipt {field}")

    authority = receipt.get("humanAuthority")
    if not isinstance(authority, dict):
        raise Refusal("human authority block missing")
    if authority.get("machineGenerated") is not False:
        raise Refusal("human disposition authority changed")
    reviewer_principal = require_named(authority.get("reviewerPrincipal"), "reviewer principal")
    reviewer_display = require_named(authority.get("reviewerDisplayName"), "reviewer display name")
    author_principal = require_named(authority.get("authorPrincipal"), "disposition author principal")
    author_display = require_named(authority.get("authorDisplayName"), "disposition author display name")
    if reviewer_principal != author_principal or reviewer_display != author_display:
        raise Refusal("human disposition authority is internally inconsistent")
    authored_at = parse_time(authority.get("authoredAt"), "disposition authoredAt")
    evidence = require_named(authority.get("humanActionEvidence"), "human action evidence")
    rationale = require_named(authority.get("rationale"), "human rationale", maximum=2000)
    reasons = authority.get("reasonCodes")
    if not isinstance(reasons, list) or not reasons:
        raise Refusal("disposition reason codes missing")
    reason_codes = [require_code(item, "disposition reason code") for item in reasons]
    if len(set(reason_codes)) != len(reason_codes):
        raise Refusal("duplicate disposition reason codes refused")

    payload = receipt.get("decisionPayload")
    if not isinstance(payload, dict):
        raise Refusal("decision payload missing")
    proposition = str(payload.get("admittedProposition") or "").strip()
    if not proposition or len(proposition) > MAX_PROPOSITION_CHARS:
        raise Refusal("bounded admitted proposition missing")
    proposition_sha = require_hex64(
        payload.get("admittedPropositionSha256"),
        "admitted proposition digest",
    )
    if digest_bytes(proposition.encode("utf-8")) != proposition_sha:
        raise Refusal("admitted proposition digest mismatch")
    if payload.get("replacementIntakeSha256") not in (None, ""):
        raise Refusal("replacement intake is incompatible with admission")
    if payload.get("additionalEvidenceKeys") not in (None, []):
        raise Refusal("additional evidence hold is incompatible with admission")

    boundary = receipt.get("authorityBoundary")
    expected_boundary = {
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
    if not isinstance(boundary, dict) or any(boundary.get(k) != v for k, v in expected_boundary.items()):
        raise Refusal("disposition receipt authority boundary changed")

    return {
        "candidateId": candidate_id,
        "receiptSha256": receipt_sha,
        "receiptFileSha256": digest_bytes(receipt_raw),
        "sourceParagraphSha256": source_sha,
        "proposition": proposition,
        "propositionSha256": proposition_sha,
        "reviewerPrincipal": reviewer_principal,
        "reviewerDisplayName": reviewer_display,
        "authorPrincipal": author_principal,
        "authorDisplayName": author_display,
        "authoredAt": authority["authoredAt"],
        "authoredAtParsed": authored_at,
        "humanActionEvidenceSha256": digest_bytes(evidence.encode("utf-8")),
        "rationaleSha256": digest_bytes(rationale.encode("utf-8")),
        "reasonCodes": reason_codes,
    }


def verify_feature_branch(value: Any) -> str:
    branch = str(value or "")
    if not FEATURE_BRANCH.fullmatch(branch):
        raise Refusal("feature branch does not match governed prefix")
    if ".." in branch or "//" in branch or branch.endswith("/") or branch.endswith(".lock"):
        raise Refusal("unsafe feature branch")
    return branch


def expected_preimage_descriptor(value: Any, path: str, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise Refusal(f"{label} descriptor missing")
    if value.get("path") != path:
        raise Refusal(f"{label} target path mismatch")
    state = str(value.get("state") or "")
    if state not in {"ABSENT", "PRESENT"}:
        raise Refusal(f"{label} state invalid")
    try:
        byte_count = int(value.get("bytes"))
    except (TypeError, ValueError) as exc:
        raise Refusal(f"{label} byte count invalid") from exc
    if byte_count < 0 or byte_count > MAX_PREIMAGE_BYTES:
        raise Refusal(f"{label} byte count out of bounds")
    if state == "ABSENT":
        if byte_count != 0 or value.get("sha256") not in (None, ""):
            raise Refusal(f"{label} absent descriptor inconsistent")
        sha = None
    else:
        sha = require_hex64(value.get("sha256"), f"{label} preimage digest")
    return {"path": path, "state": state, "bytes": byte_count, "sha256": sha}


def verify_plan(
    plan: dict[str, Any],
    plan_raw: bytes,
    receipt: dict[str, Any],
    actor: str,
) -> dict[str, Any]:
    if plan.get("schema") != PLAN_SCHEMA:
        raise Refusal("materialization plan schema mismatch")
    if FORBIDDEN_KEYS.intersection(walk_keys(plan)):
        raise Refusal("private source or payload field refused")
    plan_sha = verify_marker_digest(plan, "planSha256", "materialization plan")
    if plan.get("candidateId") != receipt["candidateId"]:
        raise Refusal("plan candidate identity mismatch")
    bindings = plan.get("dispositionBinding")
    if not isinstance(bindings, dict):
        raise Refusal("plan disposition binding missing")
    expected_bindings = {
        "receiptSha256": receipt["receiptSha256"],
        "receiptFileSha256": receipt["receiptFileSha256"],
        "propositionSha256": receipt["propositionSha256"],
        "sourceParagraphSha256": receipt["sourceParagraphSha256"],
    }
    if any(bindings.get(k) != v for k, v in expected_bindings.items()):
        raise Refusal("plan is not bound to exact disposition receipt")

    requester = plan.get("requestAuthority")
    if not isinstance(requester, dict):
        raise Refusal("request authority block missing")
    principal = require_named(requester.get("requesterPrincipal"), "requester principal")
    display = require_named(requester.get("requesterDisplayName"), "requester display name")
    if require_named(actor, "request sealing actor") != principal:
        raise Refusal("request sealing actor mismatch")
    if principal in {receipt["reviewerPrincipal"], receipt["authorPrincipal"]}:
        raise Refusal("requester must be separate from disposition reviewer")
    if requester.get("humanAuthorized") is not True:
        raise Refusal("human request authorization missing")
    if not isinstance(requester.get("machinePrepared"), bool):
        raise Refusal("machinePrepared must be boolean")
    authorization_evidence = require_named(
        requester.get("authorizationEvidence"),
        "request authorization evidence",
    )
    authored_at = parse_time(requester.get("authoredAt"), "request authoredAt")
    if authored_at < receipt["authoredAtParsed"]:
        raise Refusal("request predates disposition")

    target = plan.get("repositoryTarget")
    if not isinstance(target, dict):
        raise Refusal("repository target missing")
    if target.get("repository") != REPOSITORY or target.get("baseBranch") != BASE_BRANCH:
        raise Refusal("repository identity or base branch mismatch")
    base_commit = require_hex40(target.get("expectedBaseCommit"), "expected base commit")
    feature_branch = verify_feature_branch(target.get("featureBranch"))
    if target.get("targetPaths") != [CANON_PATH, GRAPH_PATH]:
        raise Refusal("target path set or order mismatch")

    classification = plan.get("classification")
    if not isinstance(classification, dict):
        raise Refusal("classification block missing")
    claim_class = require_code(classification.get("claimClass"), "claim class")
    epistemic_class = require_code(classification.get("epistemicClass"), "epistemic class")
    rights_class = require_code(classification.get("rightsClass"), "rights class")
    continuity_class = require_code(classification.get("continuityClass"), "continuity class")
    reconciliation_keys = require_sorted_unique_keys(
        classification.get("reconciliationKeys"),
        "reconciliation keys",
    )
    subject_keys = require_sorted_unique_keys(
        classification.get("subjectKeys"),
        "subject keys",
    )
    relation = require_code(classification.get("relation"), "graph relation")

    preimages = plan.get("targetPreimages")
    if not isinstance(preimages, dict) or set(preimages) != {"canon", "graph"}:
        raise Refusal("target preimage descriptors must contain canon and graph only")
    canon_expected = expected_preimage_descriptor(preimages["canon"], CANON_PATH, "canon preimage")
    graph_expected = expected_preimage_descriptor(preimages["graph"], GRAPH_PATH, "graph preimage")

    boundary = plan.get("authorityBoundary")
    expected_boundary = {
        "repositoryEffectAuthorized": False,
        "worktreeWriteAuthorized": False,
        "commitAuthorized": False,
        "referenceUpdateAuthorized": False,
        "remotePushAuthorized": False,
        "pullRequestAuthorized": False,
        "canonEffect": "none",
        "graphEffect": "none",
    }
    if not isinstance(boundary, dict) or any(boundary.get(k) != v for k, v in expected_boundary.items()):
        raise Refusal("materialization plan authority boundary changed")

    return {
        "planSha256": plan_sha,
        "planFileSha256": digest_bytes(plan_raw),
        "requesterPrincipal": principal,
        "requesterDisplayName": display,
        "machinePrepared": requester["machinePrepared"],
        "authoredAt": requester["authoredAt"],
        "authorizationEvidenceSha256": digest_bytes(authorization_evidence.encode("utf-8")),
        "repository": REPOSITORY,
        "baseBranch": BASE_BRANCH,
        "expectedBaseCommit": base_commit,
        "featureBranch": feature_branch,
        "claimClass": claim_class,
        "epistemicClass": epistemic_class,
        "rightsClass": rights_class,
        "continuityClass": continuity_class,
        "reconciliationKeys": reconciliation_keys,
        "subjectKeys": subject_keys,
        "relation": relation,
        "canonExpected": canon_expected,
        "graphExpected": graph_expected,
    }


def validate_ndjson(raw: bytes, label: str) -> None:
    if len(raw) > MAX_PREIMAGE_BYTES:
        raise Refusal(f"{label} exceeds byte limit")
    if not raw:
        return
    if not raw.endswith(b"\n"):
        raise Refusal(f"{label} must end with newline")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise Refusal(f"{label} must be UTF-8") from exc
    if "\x00" in text:
        raise Refusal(f"{label} contains NUL")
    for index, line in enumerate(text.splitlines(), start=1):
        if not line:
            raise Refusal(f"{label} contains blank NDJSON line")
        try:
            value = json.loads(line, object_pairs_hook=strict_pairs)
        except json.JSONDecodeError as exc:
            raise Refusal(f"{label} line {index} is invalid JSON") from exc
        if not isinstance(value, dict):
            raise Refusal(f"{label} line {index} is not an object")


def resolve_preimage(
    expected: dict[str, Any],
    path_text: str | None,
    label: str,
) -> bytes:
    if expected["state"] == "ABSENT":
        if path_text is not None:
            raise Refusal(f"{label} path supplied for absent preimage")
        return b""
    if path_text is None:
        raise Refusal(f"{label} path required for present preimage")
    raw = require_regular_file(Path(path_text), label, maximum=MAX_PREIMAGE_BYTES)
    validate_ndjson(raw, label)
    if len(raw) != expected["bytes"] or digest_bytes(raw) != expected["sha256"]:
        raise Refusal(f"{label} bytes do not match plan descriptor")
    return raw


def build_rows(receipt: dict[str, Any], plan: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    proposition_key = f"agot-proposition:{receipt['propositionSha256']}"
    source_key = f"agot-source-paragraph:{receipt['sourceParagraphSha256']}"
    canon_row = {
        "schema": "axm-asoiaf-agot-canon-transaction/1",
        "candidateId": receipt["candidateId"],
        "propositionId": proposition_key,
        "proposition": receipt["proposition"],
        "propositionSha256": receipt["propositionSha256"],
        "sourceParagraphSha256": receipt["sourceParagraphSha256"],
        "dispositionReceiptSha256": receipt["receiptSha256"],
        "dispositionReceiptFileSha256": receipt["receiptFileSha256"],
        "classification": {
            "claimClass": plan["claimClass"],
            "epistemicClass": plan["epistemicClass"],
            "rightsClass": plan["rightsClass"],
            "continuityClass": plan["continuityClass"],
        },
        "reconciliationKeys": plan["reconciliationKeys"],
        "humanAuthority": {
            "reviewerPrincipal": receipt["reviewerPrincipal"],
            "dispositionAuthorPrincipal": receipt["authorPrincipal"],
            "requesterPrincipal": plan["requesterPrincipal"],
        },
        "standing": "PROPOSED_LOCAL_FEATURE_MATERIALIZATION",
        "repositoryEffect": "none",
        "canonEffect": "none",
        "graphEffect": "none",
    }
    edges = [
        {"from": subject, "relation": plan["relation"], "to": proposition_key}
        for subject in plan["subjectKeys"]
    ]
    edges.append({"from": source_key, "relation": "SUPPORTS", "to": proposition_key})
    graph_row = {
        "schema": "axm-asoiaf-agot-graph-transaction/1",
        "candidateId": receipt["candidateId"],
        "propositionNode": {
            "key": proposition_key,
            "sha256": receipt["propositionSha256"],
        },
        "sourceEvidenceNode": {
            "key": source_key,
            "sha256": receipt["sourceParagraphSha256"],
        },
        "subjectKeys": plan["subjectKeys"],
        "edges": edges,
        "dispositionReceiptSha256": receipt["receiptSha256"],
        "standing": "PROPOSED_LOCAL_FEATURE_MATERIALIZATION",
        "repositoryEffect": "none",
        "canonEffect": "none",
        "graphEffect": "none",
    }
    return canon_row, graph_row


def postimage_descriptor(
    path: str,
    expected: dict[str, Any],
    preimage: bytes,
    row: dict[str, Any],
) -> dict[str, Any]:
    append = canonical(row) + b"\n"
    postimage = preimage + append
    return {
        "path": path,
        "preimageState": expected["state"],
        "preimageBytes": len(preimage),
        "preimageSha256": digest_bytes(preimage) if expected["state"] == "PRESENT" else None,
        "appendBytes": len(append),
        "appendSha256": digest_bytes(append),
        "postimageBytes": len(postimage),
        "postimageSha256": digest_bytes(postimage),
        "appendRow": row,
    }


def build_request(
    receipt: dict[str, Any],
    plan: dict[str, Any],
    canon_preimage: bytes,
    graph_preimage: bytes,
) -> dict[str, Any]:
    canon_row, graph_row = build_rows(receipt, plan)
    canon = postimage_descriptor(CANON_PATH, plan["canonExpected"], canon_preimage, canon_row)
    graph = postimage_descriptor(GRAPH_PATH, plan["graphExpected"], graph_preimage, graph_row)
    request_seed = {
        "candidateId": receipt["candidateId"],
        "receiptFileSha256": receipt["receiptFileSha256"],
        "planFileSha256": plan["planFileSha256"],
        "repository": plan["repository"],
        "expectedBaseCommit": plan["expectedBaseCommit"],
        "featureBranch": plan["featureBranch"],
        "canonAppendSha256": canon["appendSha256"],
        "graphAppendSha256": graph["appendSha256"],
        "canonPostimageSha256": canon["postimageSha256"],
        "graphPostimageSha256": graph["postimageSha256"],
    }
    request_id = digest_object(request_seed)
    request: dict[str, Any] = {
        "schema": REQUEST_SCHEMA,
        "componentId": COMPONENT_ID,
        "status": PASS_STATUS,
        "requestId": request_id,
        "candidateId": receipt["candidateId"],
        "nextAuthorityHold": NEXT_HOLD,
        "exactBindings": {
            "dispositionReceiptSha256": receipt["receiptSha256"],
            "dispositionReceiptFileSha256": receipt["receiptFileSha256"],
            "materializationPlanSha256": plan["planSha256"],
            "materializationPlanFileSha256": plan["planFileSha256"],
            "sourceParagraphSha256": receipt["sourceParagraphSha256"],
            "admittedPropositionSha256": receipt["propositionSha256"],
        },
        "humanAuthority": {
            "reviewerPrincipal": receipt["reviewerPrincipal"],
            "reviewerDisplayName": receipt["reviewerDisplayName"],
            "dispositionAuthorPrincipal": receipt["authorPrincipal"],
            "dispositionAuthorDisplayName": receipt["authorDisplayName"],
            "dispositionAuthoredAt": receipt["authoredAt"],
            "requesterPrincipal": plan["requesterPrincipal"],
            "requesterDisplayName": plan["requesterDisplayName"],
            "requestAuthoredAt": plan["authoredAt"],
            "machinePrepared": plan["machinePrepared"],
            "humanActionEvidenceSha256": receipt["humanActionEvidenceSha256"],
            "humanRationaleSha256": receipt["rationaleSha256"],
            "requestAuthorizationEvidenceSha256": plan["authorizationEvidenceSha256"],
            "reasonCodes": receipt["reasonCodes"],
        },
        "repositoryTarget": {
            "repository": plan["repository"],
            "baseBranch": plan["baseBranch"],
            "expectedBaseCommit": plan["expectedBaseCommit"],
            "featureBranch": plan["featureBranch"],
            "targetPaths": [CANON_PATH, GRAPH_PATH],
        },
        "classification": {
            "claimClass": plan["claimClass"],
            "epistemicClass": plan["epistemicClass"],
            "rightsClass": plan["rightsClass"],
            "continuityClass": plan["continuityClass"],
            "reconciliationKeys": plan["reconciliationKeys"],
            "subjectKeys": plan["subjectKeys"],
            "relation": plan["relation"],
        },
        "proposedPostimages": {
            "canon": canon,
            "graph": graph,
        },
        "authorityBoundary": {
            "requestIsNotRepositoryMutation": True,
            "postimageFilesWrittenByRuntime": 0,
            "repositoryFilesWrittenByRuntime": 0,
            "worktreesModifiedByRuntime": 0,
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
        "requestSha256": SELF_DIGEST_MARKER,
    }
    request["requestSha256"] = digest_object(request)
    return request


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
    parser.add_argument("--disposition-receipt", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--canon-preimage")
    parser.add_argument("--graph-preimage")
    args = parser.parse_args(argv)
    try:
        receipt_value, receipt_raw = load_object(Path(args.disposition_receipt), "disposition receipt")
        plan_value, plan_raw = load_object(Path(args.plan), "materialization plan")
        receipt = verify_receipt(receipt_value, receipt_raw)
        plan = verify_plan(plan_value, plan_raw, receipt, args.actor)
        canon_preimage = resolve_preimage(plan["canonExpected"], args.canon_preimage, "canon preimage")
        graph_preimage = resolve_preimage(plan["graphExpected"], args.graph_preimage, "graph preimage")
        request = build_request(receipt, plan, canon_preimage, graph_preimage)
        write_exclusive(Path(args.output), request)
    except Refusal as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-local-feature-materialization-request-refusal/1",
            "status": "REFUSE_LOCAL_FEATURE_MATERIALIZATION_REQUEST_NOT_SEALED",
            "reason": str(exc),
            "postimageFilesWrittenByRuntime": 0,
            "repositoryFilesWrittenByRuntime": 0,
            "worktreesModifiedByRuntime": 0,
            "commitsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "canonEffect": "none",
            "graphEffect": "none",
        }, indent=2, sort_keys=True))
        return 3
    print(json.dumps(request, indent=2, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
