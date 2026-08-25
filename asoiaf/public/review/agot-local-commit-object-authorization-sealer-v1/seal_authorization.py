#!/usr/bin/env python3
"""Seal one exact commit-object authorization without creating a Git object."""
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

COMPONENT_ID = "asoiaf-agot-local-commit-object-authorization-sealer-v1"
DIFF_AUTH_SCHEMA = "axm-asoiaf-human-diff-review-authorization/2"
REVIEW_RECEIPT_SCHEMA = "axm-asoiaf-agot-named-human-worktree-diff-review-receipt/1"
REVIEW_VALIDATION_SCHEMA = "axm-asoiaf-agot-named-human-worktree-diff-review-validation/1"
REVIEW_VALIDATION_STATUS = "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR"
PLAN_SCHEMA = "axm-asoiaf-agot-local-commit-object-plan/1"
AUTHORIZATION_SCHEMA = "axm-asoiaf-commit-object-authorization/2"
RECEIPT_SCHEMA = "axm-asoiaf-agot-local-commit-object-authorization-receipt/1"
SUCCESS_STATUS = "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_SEALED_OBJECT_CREATION_WITHHELD"
NEXT_HOLD = "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD"
TARGETS = [
    "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
    "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
]
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TRANSACTION_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$")
REASON = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")
FORBIDDEN_BRANCHES = {"main", "master"}
FORBIDDEN_KEYS = {
    "sourcetext",
    "paragraphtext",
    "displayedsource",
    "sourceexcerpt",
    "privateparagraph",
    "booktext",
    "copyrightedtext",
    "rawsource",
    "sourceprose",
    "privatepayload",
}


class Refusal(RuntimeError):
    """Fail-closed input or authority refusal."""

    def __init__(self, status: str, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def canonical(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def digest_object(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def serialize(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")


def strict_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Refusal("REFUSE_DUPLICATE_JSON_KEY", f"duplicate JSON key: {key}")
        result[key] = value
    return result


def normalize_key(value: str) -> str:
    return value.casefold().replace("_", "").replace("-", "")


def walk_keys(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield normalize_key(str(key))
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


def refuse_source_fields(*values: Any) -> None:
    if any(FORBIDDEN_KEYS.intersection(walk_keys(value)) for value in values):
        raise Refusal("REFUSE_SOURCE_TEXT_FIELD", "private-source-bearing field is forbidden")


def require_regular_file(path: Path, label: str) -> bytes:
    try:
        info = path.lstat()
    except FileNotFoundError as exc:
        raise Refusal("REFUSE_INPUT", f"{label} missing") from exc
    if stat.S_ISLNK(info.st_mode):
        raise Refusal("REFUSE_SYMLINK", f"{label} symlink refused")
    if not stat.S_ISREG(info.st_mode):
        raise Refusal("REFUSE_INPUT", f"{label} must be a regular file")
    return path.read_bytes()


def load_object(path: Path, label: str) -> tuple[dict[str, Any], bytes]:
    raw = require_regular_file(path, label)
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=strict_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Refusal("REFUSE_INPUT", f"{label} is not strict UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise Refusal("REFUSE_INPUT", f"{label} must be a JSON object")
    return value, raw


def require_hex40(value: Any, label: str) -> str:
    text = str(value or "")
    if not HEX40.fullmatch(text):
        raise Refusal("REFUSE_BINDING", f"{label} must be lowercase SHA-1")
    return text


def require_hex64(value: Any, label: str) -> str:
    text = str(value or "")
    if not HEX64.fullmatch(text):
        raise Refusal("REFUSE_BINDING", f"{label} must be lowercase SHA-256")
    return text


def named(value: Any, label: str) -> str:
    text = " ".join(str(value or "").split())
    if len(text) < 3 or len(text) > 200 or text.casefold() in {"actor", "human", "user", "test"}:
        raise Refusal("REFUSE_HUMAN_AUTHORITY", f"{label} must be separately named")
    return text


def parse_time(value: Any, label: str) -> datetime:
    text = str(value or "")
    if not text.endswith("Z"):
        raise Refusal("REFUSE_TIME", f"{label} must use UTC Z suffix")
    try:
        parsed = datetime.fromisoformat(text[:-1] + "+00:00")
    except ValueError as exc:
        raise Refusal("REFUSE_TIME", f"{label} is not ISO-8601") from exc
    if parsed.tzinfo != timezone.utc:
        raise Refusal("REFUSE_TIME", f"{label} must be UTC")
    return parsed


def verify_self_digest(value: dict[str, Any], field: str, label: str) -> str:
    observed = require_hex64(value.get(field), f"{label} {field}")
    candidate = dict(value)
    candidate.pop(field, None)
    if digest_object(candidate) != observed:
        raise Refusal("REFUSE_SELF_DIGEST", f"{label} {field} mismatch")
    return observed


def require_boundary(value: dict[str, Any], expected: dict[str, Any], label: str) -> None:
    for key, wanted in expected.items():
        if value.get(key) != wanted:
            raise Refusal("REFUSE_AUTHORITY_BOUNDARY", f"{label} {key} mismatch")


def path_inside_git_worktree(path: Path) -> bool:
    current = path.resolve()
    for parent in (current, *current.parents):
        marker = parent / ".git"
        if marker.exists() or marker.is_symlink():
            return True
    return False


def validate_output_paths(authorization_path: Path, receipt_path: Path) -> Path:
    if authorization_path.resolve() == receipt_path.resolve():
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", "authorization and receipt outputs must differ")
    if authorization_path.parent.resolve() != receipt_path.parent.resolve():
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", "authorization and receipt outputs must share one isolated directory")
    output_dir = authorization_path.parent
    try:
        info = output_dir.lstat()
    except FileNotFoundError as exc:
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", "output directory missing") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", "output directory must be a real directory")
    if path_inside_git_worktree(output_dir):
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", "output directory must remain outside every Git worktree")
    if any(output_dir.iterdir()):
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", "output directory must be empty")
    return output_dir


def validate_inputs(
    diff_authorization: dict[str, Any],
    diff_authorization_raw: bytes,
    review_receipt: dict[str, Any],
    review_receipt_raw: bytes,
    review_validation: dict[str, Any],
    review_validation_raw: bytes,
    plan: dict[str, Any],
    plan_raw: bytes,
    actor: str,
) -> dict[str, Any]:
    refuse_source_fields(diff_authorization, review_receipt, review_validation, plan)

    if diff_authorization.get("schema") != DIFF_AUTH_SCHEMA:
        raise Refusal("REFUSE_DIFF_REVIEW_AUTHORIZATION", "schema mismatch")
    diff_authorization_sha = verify_self_digest(
        diff_authorization,
        "authorizationSha256",
        "diff-review authorization",
    )
    if diff_authorization.get("decision") != "approve-local-commit-object":
        raise Refusal("REFUSE_DIFF_REVIEW_AUTHORIZATION", "approval decision required")
    if diff_authorization.get("changedPaths") != TARGETS:
        raise Refusal("REFUSE_DIFF_REVIEW_AUTHORIZATION", "governed path order mismatch")
    repository_identity = named(diff_authorization.get("repositoryIdentity"), "repository identity")
    base_commit = require_hex40(diff_authorization.get("baseCommit"), "base commit")
    branch = str(diff_authorization.get("branch") or "")
    if branch in FORBIDDEN_BRANCHES or not branch.startswith("feature/asoiaf-agot/"):
        raise Refusal("REFUSE_BRANCH_BOUNDARY", "governed feature branch required")
    change_set_sha = require_hex64(diff_authorization.get("changeSetSha256"), "change-set digest")
    worktree_receipt_sha = require_hex64(
        diff_authorization.get("worktreeApplicationReceiptSha256"),
        "worktree application receipt digest",
    )
    patch_manifest_sha = require_hex64(
        diff_authorization.get("patchManifestSha256"),
        "patch manifest digest",
    )
    reviewer = named(diff_authorization.get("diffReviewerActor"), "diff reviewer")
    reviewed_at = parse_time(diff_authorization.get("reviewedAt"), "diff-review reviewedAt")
    if not str(diff_authorization.get("reviewRationale") or "").strip():
        raise Refusal("REFUSE_DIFF_REVIEW_AUTHORIZATION", "review rationale missing")
    if not str(diff_authorization.get("nonce") or "").strip():
        raise Refusal("REFUSE_DIFF_REVIEW_AUTHORIZATION", "review nonce missing")

    if review_receipt.get("schema") != REVIEW_RECEIPT_SCHEMA:
        raise Refusal("REFUSE_REVIEW_RECEIPT", "schema mismatch")
    review_receipt_sha = verify_self_digest(review_receipt, "receiptSha256", "review receipt")
    if review_receipt.get("status") != "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD":
        raise Refusal("REFUSE_REVIEW_RECEIPT", "status mismatch")
    if review_receipt.get("decision") != "APPROVE_LOCAL_COMMIT_OBJECT":
        raise Refusal("REFUSE_REVIEW_RECEIPT", "approval decision required")
    if review_receipt.get("nextAuthorityHold") != NEXT_HOLD:
        raise Refusal("REFUSE_REVIEW_RECEIPT", "next authority hold mismatch")
    repository_state = review_receipt.get("repositoryState")
    if not isinstance(repository_state, dict):
        raise Refusal("REFUSE_REVIEW_RECEIPT", "repository state missing")
    expected_state = {
        "repositoryIdentity": repository_identity,
        "baseCommit": base_commit,
        "branch": branch,
        "changedPaths": TARGETS,
        "changeSetSha256": change_set_sha,
        "gitDiffCheck": "PASS",
        "liveIndexModified": False,
    }
    for key, wanted in expected_state.items():
        if repository_state.get(key) != wanted:
            raise Refusal("REFUSE_REVIEW_RECEIPT", f"repository state {key} mismatch")
    exact_bindings = review_receipt.get("exactBindings")
    if not isinstance(exact_bindings, dict):
        raise Refusal("REFUSE_REVIEW_RECEIPT", "exact bindings missing")
    for key, wanted in {
        "worktreeApplicationReceiptSha256": worktree_receipt_sha,
        "patchManifestSha256": patch_manifest_sha,
        "diffReviewAuthorizationSha256": diff_authorization_sha,
    }.items():
        if exact_bindings.get(key) != wanted:
            raise Refusal("REFUSE_REVIEW_RECEIPT", f"exact binding {key} mismatch")
    human_authority = review_receipt.get("humanAuthority")
    if not isinstance(human_authority, dict):
        raise Refusal("REFUSE_REVIEW_RECEIPT", "human authority missing")
    if human_authority.get("diffReviewerActor") != reviewer or human_authority.get("machineGenerated") is not False:
        raise Refusal("REFUSE_REVIEW_RECEIPT", "reviewer authority mismatch")
    if human_authority.get("reviewedAt") != diff_authorization.get("reviewedAt"):
        raise Refusal("REFUSE_REVIEW_RECEIPT", "review time mismatch")
    receipt_boundary = review_receipt.get("authorityBoundary")
    if not isinstance(receipt_boundary, dict):
        raise Refusal("REFUSE_REVIEW_RECEIPT", "authority boundary missing")
    require_boundary(
        receipt_boundary,
        {
            "reviewReceiptIsNotCommitObject": True,
            "authorizationIsNotCommitObject": True,
            "repositoryFilesWrittenByRuntime": 0,
            "worktreeBytesModifiedByRuntime": 0,
            "liveIndexModifiedByRuntime": 0,
            "commitObjectsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
            "canonEffect": "none",
            "graphEffect": "none",
        },
        "review receipt",
    )

    if review_validation.get("schema") != REVIEW_VALIDATION_SCHEMA:
        raise Refusal("REFUSE_REVIEW_VALIDATION", "schema mismatch")
    if review_validation.get("status") != REVIEW_VALIDATION_STATUS or review_validation.get("passed") is not True:
        raise Refusal("REFUSE_REVIEW_VALIDATION", "validation did not pass")
    for key, wanted in {
        "decision": "APPROVE_LOCAL_COMMIT_OBJECT",
        "nextAuthorityHold": NEXT_HOLD,
        "receiptSha256": review_receipt_sha,
        "diffReviewAuthorizationSha256": diff_authorization_sha,
        "repositoryFilesWrittenByValidator": 0,
        "worktreeBytesModifiedByValidator": 0,
        "liveIndexModifiedByValidator": 0,
        "commitObjectsCreatedByValidator": 0,
        "referencesUpdatedByValidator": 0,
        "remotePushesByValidator": 0,
        "pullRequestsOpenedByValidator": 0,
        "canonEffect": "none",
        "graphEffect": "none",
    }.items():
        if review_validation.get(key) != wanted:
            raise Refusal("REFUSE_REVIEW_VALIDATION", f"{key} mismatch")

    if plan.get("schema") != PLAN_SCHEMA:
        raise Refusal("REFUSE_COMMIT_PLAN", "schema mismatch")
    if plan.get("machineGenerated") is not False:
        raise Refusal("REFUSE_COMMIT_PLAN", "machine-generated plan refused")
    plan_sha = verify_self_digest(plan, "planSha256", "commit-object plan")
    expected_plan_bindings = {
        "diffReviewAuthorizationSha256": diff_authorization_sha,
        "diffReviewAuthorizationFileSha256": digest_bytes(diff_authorization_raw),
        "reviewReceiptSha256": review_receipt_sha,
        "reviewReceiptFileSha256": digest_bytes(review_receipt_raw),
        "reviewValidationFileSha256": digest_bytes(review_validation_raw),
        "repositoryIdentity": repository_identity,
        "baseCommit": base_commit,
        "branch": branch,
        "changeSetSha256": change_set_sha,
    }
    for key, wanted in expected_plan_bindings.items():
        if plan.get(key) != wanted:
            raise Refusal("REFUSE_COMMIT_PLAN", f"{key} binding mismatch")
    if plan.get("decision") != "AUTHORIZE_UNREFERENCED_COMMIT_OBJECT":
        raise Refusal("REFUSE_COMMIT_PLAN", "decision mismatch")
    commit_actor = named(plan.get("commitObjectActor"), "commit-object actor")
    plan_author = named(plan.get("planAuthorActor"), "plan author")
    if commit_actor != plan_author:
        raise Refusal("REFUSE_HUMAN_AUTHORITY", "plan author must be the named commit-object actor")
    if commit_actor.casefold() == reviewer.casefold():
        raise Refusal("REFUSE_ACTOR_COLLISION", "commit-object actor collides with diff reviewer")
    if named(actor, "sealing actor") != commit_actor:
        raise Refusal("REFUSE_HUMAN_AUTHORITY", "sealing actor must match commit-object actor")
    transaction_id = str(plan.get("transactionId") or "")
    if not TRANSACTION_ID.fullmatch(transaction_id):
        raise Refusal("REFUSE_COMMIT_PLAN", "transactionId is invalid")
    author_name = named(plan.get("authorName"), "commit author")
    if author_name != commit_actor:
        raise Refusal("REFUSE_HUMAN_AUTHORITY", "commit author must match commit-object actor")
    author_email = str(plan.get("authorEmail") or "").strip()
    if not EMAIL.fullmatch(author_email):
        raise Refusal("REFUSE_COMMIT_PLAN", "author email is invalid")
    authorized_at = parse_time(plan.get("authorizedAt"), "authorizedAt")
    author_date = parse_time(plan.get("authorDate"), "authorDate")
    if authorized_at < reviewed_at:
        raise Refusal("REFUSE_TIME", "commit authorization predates diff review")
    if author_date != authorized_at:
        raise Refusal("REFUSE_TIME", "authorDate must equal authorizedAt")
    nonce = str(plan.get("nonce") or "").strip()
    if len(nonce) < 8 or len(nonce) > 200:
        raise Refusal("REFUSE_COMMIT_PLAN", "nonce missing or out of bounds")
    evidence = str(plan.get("authorizationEvidence") or "").strip()
    if len(evidence) < 3 or len(evidence) > 500:
        raise Refusal("REFUSE_COMMIT_PLAN", "authorization evidence missing or out of bounds")
    reason_codes = plan.get("reasonCodes")
    if not isinstance(reason_codes, list) or not reason_codes:
        raise Refusal("REFUSE_COMMIT_PLAN", "reason codes required")
    normalized_reasons = [str(value) for value in reason_codes]
    if normalized_reasons != sorted(normalized_reasons) or len(set(normalized_reasons)) != len(normalized_reasons):
        raise Refusal("REFUSE_COMMIT_PLAN", "reason codes must be sorted and unique")
    if any(not REASON.fullmatch(value) for value in normalized_reasons):
        raise Refusal("REFUSE_COMMIT_PLAN", "invalid reason code")
    require_boundary(
        plan,
        {
            "unreferencedCommitObjectAuthorized": True,
            "worktreeMutationAuthorized": False,
            "liveIndexMutationAuthorized": False,
            "referenceUpdateAuthorized": False,
            "remotePushAuthorized": False,
            "pullRequestAuthorized": False,
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
            "canonEffect": "none",
            "graphEffect": "none",
        },
        "commit-object plan",
    )

    return {
        "diffAuthorizationSha256": diff_authorization_sha,
        "diffAuthorizationFileSha256": digest_bytes(diff_authorization_raw),
        "reviewReceiptSha256": review_receipt_sha,
        "reviewReceiptFileSha256": digest_bytes(review_receipt_raw),
        "reviewValidationFileSha256": digest_bytes(review_validation_raw),
        "planSha256": plan_sha,
        "planFileSha256": digest_bytes(plan_raw),
        "repositoryIdentity": repository_identity,
        "baseCommit": base_commit,
        "branch": branch,
        "changeSetSha256": change_set_sha,
        "diffReviewerActor": reviewer,
        "reviewedAt": diff_authorization["reviewedAt"],
        "commitObjectActor": commit_actor,
        "transactionId": transaction_id,
        "authorName": author_name,
        "authorEmail": author_email,
        "authorDate": plan["authorDate"],
        "authorizedAt": plan["authorizedAt"],
        "nonce": nonce,
        "authorizationEvidenceSha256": digest_bytes(evidence.encode("utf-8")),
        "reasonCodes": normalized_reasons,
    }


def build_authorization(bound: dict[str, Any]) -> dict[str, Any]:
    authorization: dict[str, Any] = {
        "schema": AUTHORIZATION_SCHEMA,
        "diffReviewAuthorizationSha256": bound["diffAuthorizationSha256"],
        "repositoryIdentity": bound["repositoryIdentity"],
        "baseCommit": bound["baseCommit"],
        "branch": bound["branch"],
        "decision": "create-unreferenced-commit-object",
        "commitObjectActor": bound["commitObjectActor"],
        "commitMessage": f"Admit AGOT reviewed transaction {bound['transactionId']}",
        "authorName": bound["authorName"],
        "authorEmail": bound["authorEmail"],
        "authorDate": bound["authorDate"],
        "authorizedAt": bound["authorizedAt"],
        "nonce": bound["nonce"],
    }
    authorization["authorizationSha256"] = digest_object(authorization)
    return authorization


def build_receipt(bound: dict[str, Any], authorization: dict[str, Any]) -> dict[str, Any]:
    receipt: dict[str, Any] = {
        "schema": RECEIPT_SCHEMA,
        "componentId": COMPONENT_ID,
        "status": SUCCESS_STATUS,
        "nextAuthorityHold": NEXT_HOLD,
        "repositoryBinding": {
            "repositoryIdentity": bound["repositoryIdentity"],
            "baseCommit": bound["baseCommit"],
            "branch": bound["branch"],
            "changeSetSha256": bound["changeSetSha256"],
        },
        "exactBindings": {
            "diffReviewAuthorizationSha256": bound["diffAuthorizationSha256"],
            "diffReviewAuthorizationFileSha256": bound["diffAuthorizationFileSha256"],
            "reviewReceiptSha256": bound["reviewReceiptSha256"],
            "reviewReceiptFileSha256": bound["reviewReceiptFileSha256"],
            "reviewValidationFileSha256": bound["reviewValidationFileSha256"],
            "commitObjectPlanSha256": bound["planSha256"],
            "commitObjectPlanFileSha256": bound["planFileSha256"],
            "commitObjectAuthorizationSha256": authorization["authorizationSha256"],
        },
        "actorSeparation": {
            "diffReviewerActor": bound["diffReviewerActor"],
            "commitObjectActor": bound["commitObjectActor"],
            "actorsDiffer": bound["diffReviewerActor"].casefold() != bound["commitObjectActor"].casefold(),
            "reviewedAt": bound["reviewedAt"],
            "authorizedAt": bound["authorizedAt"],
            "reasonCodes": bound["reasonCodes"],
            "authorizationEvidenceSha256": bound["authorizationEvidenceSha256"],
        },
        "authorityBoundary": {
            "authorizationIsNotCommitObject": True,
            "repositoryFilesWrittenByRuntime": 0,
            "worktreeBytesModifiedByRuntime": 0,
            "liveIndexModifiedByRuntime": 0,
            "commitObjectsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
            "canonEffect": "none",
            "graphEffect": "none",
        },
        "selfDigestMethod": "REMOVE_RECEIPT_SHA256_BEFORE_HASH",
    }
    receipt["receiptSha256"] = digest_object(receipt)
    return receipt


def exclusive_write(path: Path, raw: bytes) -> None:
    if path.exists() or path.is_symlink():
        raise Refusal("REFUSE_OUTPUT_EXISTS", f"output already exists: {path}")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        path.unlink(missing_ok=True)
        raise


def write_outputs(
    authorization_path: Path,
    receipt_path: Path,
    authorization: dict[str, Any],
    receipt: dict[str, Any],
) -> None:
    validate_output_paths(authorization_path, receipt_path)
    written: list[Path] = []
    try:
        exclusive_write(authorization_path, serialize(authorization))
        written.append(authorization_path)
        if os.environ.get("AXM_INJECT_FAILURE_AFTER_AUTHORIZATION") == "1":
            raise Refusal("REFUSE_INJECTED_FAILURE", "injected failure after authorization write")
        exclusive_write(receipt_path, serialize(receipt))
        written.append(receipt_path)
    except Exception:
        for path in written:
            path.unlink(missing_ok=True)
        raise


def execute(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    try:
        diff_authorization, diff_authorization_raw = load_object(
            Path(args.diff_review_authorization),
            "diff-review authorization",
        )
        review_receipt, review_receipt_raw = load_object(Path(args.review_receipt), "review receipt")
        review_validation, review_validation_raw = load_object(
            Path(args.review_validation),
            "review validation",
        )
        plan, plan_raw = load_object(Path(args.plan), "commit-object plan")
        bound = validate_inputs(
            diff_authorization,
            diff_authorization_raw,
            review_receipt,
            review_receipt_raw,
            review_validation,
            review_validation_raw,
            plan,
            plan_raw,
            args.actor,
        )
        authorization = build_authorization(bound)
        receipt = build_receipt(bound, authorization)
        write_outputs(
            Path(args.authorization_output),
            Path(args.receipt_output),
            authorization,
            receipt,
        )
        return receipt, 0
    except Refusal as exc:
        return {
            "schema": "axm-asoiaf-agot-local-commit-object-authorization-refusal/1",
            "componentId": COMPONENT_ID,
            "status": exc.status,
            "detail": exc.detail,
            "repositoryFilesWrittenByRuntime": 0,
            "worktreeBytesModifiedByRuntime": 0,
            "liveIndexModifiedByRuntime": 0,
            "commitObjectsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "canonEffect": "none",
            "graphEffect": "none",
        }, 3
    except Exception as exc:
        return {
            "schema": "axm-asoiaf-agot-local-commit-object-authorization-refusal/1",
            "componentId": COMPONENT_ID,
            "status": "REFUSE_UNHANDLED_INPUT",
            "detail": f"{type(exc).__name__}: {exc}",
            "repositoryFilesWrittenByRuntime": 0,
            "worktreeBytesModifiedByRuntime": 0,
            "liveIndexModifiedByRuntime": 0,
            "commitObjectsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "canonEffect": "none",
            "graphEffect": "none",
        }, 4


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--diff-review-authorization", required=True)
    parser.add_argument("--review-receipt", required=True)
    parser.add_argument("--review-validation", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--authorization-output", required=True)
    parser.add_argument("--receipt-output", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    output, code = execute(args)
    print(json.dumps(output, indent=2, ensure_ascii=False, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
