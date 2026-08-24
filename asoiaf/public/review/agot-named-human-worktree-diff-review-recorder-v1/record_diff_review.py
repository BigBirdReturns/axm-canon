#!/usr/bin/env python3
"""Record one named-human review of the exact AGOT two-path worktree diff."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

COMPONENT_ID = "asoiaf-agot-named-human-worktree-diff-review-recorder-v1"
WORKTREE_RECEIPT_SCHEMA = "axm-asoiaf-agot-local-worktree-patch-application/1"
WORKTREE_RECEIPT_STATUS = "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT"
WORKTREE_AUTH_SCHEMA = "axm-asoiaf-local-worktree-apply-authorization/1"
REVIEW_SCHEMA = "axm-asoiaf-agot-named-human-worktree-diff-review/1"
AUTHORIZATION_SCHEMA = "axm-asoiaf-human-diff-review-authorization/2"
RECEIPT_SCHEMA = "axm-asoiaf-agot-named-human-worktree-diff-review-receipt/1"
TARGETS = [
    "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
    "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
]
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
REASON = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")
DECISION_HOLDS = {
    "APPROVE_LOCAL_COMMIT_OBJECT": "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD",
    "REJECT_WORKTREE_DIFF": "WORKTREE_ROLLBACK_WITHHELD",
    "RETURN_FOR_CORRECTION": "CORRECTED_PATCH_BUNDLE_AND_WORKTREE_APPLICATION_WITHHELD",
    "DEFER_PENDING_REVIEW": "ADDITIONAL_DIFF_REVIEW_EVIDENCE_WITHHELD",
}


class Refusal(RuntimeError):
    """Fail-closed input, state, or authority refusal."""

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


def verify_self_digest(value: dict[str, Any], field: str, label: str) -> str:
    observed = str(value.get(field) or "")
    candidate = dict(value)
    candidate.pop(field, None)
    if observed != digest_object(candidate):
        raise Refusal("REFUSE_SELF_DIGEST", f"{label} {field} mismatch")
    return observed


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


def git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        capture_output=True,
        shell=False,
    )
    if check and completed.returncode != 0:
        raise Refusal(
            "REFUSE_GIT_STATE",
            completed.stderr.strip() or completed.stdout.strip() or "git command failed",
        )
    return completed


def repository_identity(repo: Path) -> str:
    completed = git(repo, "config", "--get", "remote.origin.url", check=False)
    return completed.stdout.strip() or f"local:{repo.resolve()}"


def status_paths(repo: Path) -> list[str]:
    paths: list[str] = []
    for line in git(repo, "status", "--porcelain=v1", "--untracked-files=all").stdout.splitlines():
        if len(line) < 4:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        paths.append(path.replace("\\", "/"))
    return sorted(paths)


def base_bytes(repo: Path, head: str, path: str) -> bytes:
    completed = subprocess.run(
        ["git", "-C", str(repo), "show", f"{head}:{path}"],
        capture_output=True,
        shell=False,
    )
    return completed.stdout if completed.returncode == 0 else b""


def change_set(repo: Path, head: str) -> tuple[str, list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    for relative in TARGETS:
        target = repo / Path(*relative.split("/"))
        current = target.read_bytes() if target.is_file() else b""
        before = base_bytes(repo, head, relative)
        rows.append(
            {
                "path": relative,
                "baseBytes": len(before),
                "baseSha256": digest_bytes(before),
                "currentBytes": len(current),
                "currentSha256": digest_bytes(current),
            }
        )
    return digest_object(rows), rows


def ensure_outside_repository(repo: Path, path: Path, label: str) -> None:
    repo_resolved = repo.resolve()
    path_resolved = path.resolve()
    if path_resolved == repo_resolved or repo_resolved in path_resolved.parents:
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", f"{label} must remain outside repository")


def validate_inputs(
    repo: Path,
    worktree_receipt: dict[str, Any],
    worktree_receipt_raw: bytes,
    worktree_authorization: dict[str, Any],
    worktree_authorization_raw: bytes,
    review: dict[str, Any],
    review_raw: bytes,
    actor: str,
) -> dict[str, Any]:
    repo = repo.resolve()
    if not (repo / ".git").exists():
        raise Refusal("REFUSE_GIT_STATE", "repository metadata missing")
    refuse_source_fields(worktree_receipt, worktree_authorization, review)

    head = git(repo, "rev-parse", "HEAD").stdout.strip()
    branch = git(repo, "symbolic-ref", "--short", "HEAD", check=False).stdout.strip()
    if not branch or branch in FORBIDDEN_BRANCHES:
        raise Refusal("REFUSE_BRANCH_BOUNDARY", branch or "detached HEAD")
    if git(repo, "diff", "--cached", "--quiet", check=False).returncode != 0:
        raise Refusal("REFUSE_LIVE_INDEX", "live index must remain clean")
    changed = status_paths(repo)
    if changed != sorted(TARGETS):
        raise Refusal("REFUSE_WORKTREE_DIFF", f"changed paths differ: {changed}")
    diff_check = git(repo, "diff", "--check", check=False)
    if diff_check.returncode != 0 or diff_check.stdout.strip() or diff_check.stderr.strip():
        raise Refusal("REFUSE_DIFF_CHECK", diff_check.stdout + diff_check.stderr)
    identity = repository_identity(repo)
    change_sha, change_rows = change_set(repo, head)

    if worktree_receipt.get("schema") != WORKTREE_RECEIPT_SCHEMA:
        raise Refusal("REFUSE_WORKTREE_RECEIPT", "schema mismatch")
    if worktree_receipt.get("status") != WORKTREE_RECEIPT_STATUS:
        raise Refusal("REFUSE_WORKTREE_RECEIPT", "status mismatch")
    worktree_receipt_sha = verify_self_digest(
        worktree_receipt,
        "applicationReceiptSha256",
        "worktree receipt",
    )
    expected_receipt = {
        "repositoryIdentity": identity,
        "headCommitUnchanged": head,
        "branch": branch,
        "changedPaths": sorted(TARGETS),
        "gitDiffCheck": "PASS",
        "gitIndexModified": False,
        "gitCommitCreated": False,
        "localReferenceUpdated": False,
        "remotePushExecuted": False,
        "pullRequestOpened": False,
        "canonEffect": "none",
        "graphEffect": "none",
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
    }
    for key, expected in expected_receipt.items():
        observed = sorted(worktree_receipt.get(key) or []) if key == "changedPaths" else worktree_receipt.get(key)
        if observed != expected:
            raise Refusal("REFUSE_WORKTREE_RECEIPT", f"{key} binding mismatch")
    patch_manifest_sha = str(worktree_receipt.get("patchManifestSha256") or "")
    if len(patch_manifest_sha) != 64:
        raise Refusal("REFUSE_WORKTREE_RECEIPT", "patch manifest digest missing")

    if worktree_authorization.get("schema") != WORKTREE_AUTH_SCHEMA:
        raise Refusal("REFUSE_WORKTREE_AUTHORIZATION", "schema mismatch")
    worktree_authorization_sha = verify_self_digest(
        worktree_authorization,
        "authorizationSha256",
        "worktree authorization",
    )
    expected_worktree_auth = {
        "decision": "apply-to-local-feature-worktree",
        "patchManifestSha256": patch_manifest_sha,
        "targetBaseCommit": head,
        "targetBranch": branch,
        "repositoryIdentity": identity,
    }
    for key, expected in expected_worktree_auth.items():
        if worktree_authorization.get(key) != expected:
            raise Refusal("REFUSE_WORKTREE_AUTHORIZATION", f"{key} binding mismatch")
    worktree_executor = named(
        worktree_authorization.get("worktreeExecutorActor"),
        "worktree executor",
    )
    if not str(worktree_authorization.get("reason") or "").strip() or not str(
        worktree_authorization.get("nonce") or ""
    ).strip():
        raise Refusal("REFUSE_WORKTREE_AUTHORIZATION", "reason or nonce missing")

    if review.get("schema") != REVIEW_SCHEMA:
        raise Refusal("REFUSE_HUMAN_REVIEW", "schema mismatch")
    if review.get("machineGenerated") is not False:
        raise Refusal("REFUSE_HUMAN_REVIEW", "machine-generated review refused")
    review_sha = verify_self_digest(review, "reviewSha256", "human review")
    reviewer = named(review.get("diffReviewerActor"), "diff reviewer")
    if reviewer.casefold() == worktree_executor.casefold():
        raise Refusal("REFUSE_ACTOR_COLLISION", "diff reviewer collides with worktree executor")
    if named(actor, "recording actor") != reviewer:
        raise Refusal("REFUSE_HUMAN_AUTHORITY", "recording actor must match named reviewer")

    expected_review = {
        "worktreeApplicationReceiptSha256": worktree_receipt_sha,
        "worktreeApplyAuthorizationSha256": worktree_authorization_sha,
        "patchManifestSha256": patch_manifest_sha,
        "repositoryIdentity": identity,
        "baseCommit": head,
        "branch": branch,
        "changedPaths": TARGETS,
        "changeSetSha256": change_sha,
        "repositoryEffectAuthorized": False,
        "canonEffect": "none",
        "graphEffect": "none",
    }
    for key, expected in expected_review.items():
        if review.get(key) != expected:
            raise Refusal("REFUSE_HUMAN_REVIEW", f"{key} binding mismatch")

    reviewed_at = parse_time(review.get("reviewedAt"), "reviewedAt")
    authorized_at_value = worktree_authorization.get("authorizedAt")
    if authorized_at_value not in (None, "") and reviewed_at < parse_time(authorized_at_value, "authorizedAt"):
        raise Refusal("REFUSE_TIME", "review predates worktree authorization")
    rationale = str(review.get("reviewRationale") or "").strip()
    evidence = str(review.get("humanActionEvidence") or "").strip()
    nonce = str(review.get("nonce") or "").strip()
    if not rationale or len(rationale) > 2000 or not evidence or len(evidence) > 500 or not nonce:
        raise Refusal("REFUSE_HUMAN_REVIEW", "rationale, evidence, or nonce missing or out of bounds")
    reason_codes = review.get("reasonCodes")
    if not isinstance(reason_codes, list) or not reason_codes:
        raise Refusal("REFUSE_HUMAN_REVIEW", "reason codes required")
    normalized_reasons = [str(value) for value in reason_codes]
    if len(set(normalized_reasons)) != len(normalized_reasons):
        raise Refusal("REFUSE_HUMAN_REVIEW", "duplicate reason codes refused")
    if any(not REASON.fullmatch(value) for value in normalized_reasons):
        raise Refusal("REFUSE_HUMAN_REVIEW", "invalid reason code")
    decision = str(review.get("decision") or "")
    if decision not in DECISION_HOLDS:
        raise Refusal("REFUSE_HUMAN_REVIEW", "invalid decision")

    return {
        "repo": repo,
        "repositoryIdentity": identity,
        "head": head,
        "branch": branch,
        "changedPaths": TARGETS,
        "changeSetSha256": change_sha,
        "changeSetRows": change_rows,
        "worktreeReceiptSha256": worktree_receipt_sha,
        "worktreeReceiptFileSha256": digest_bytes(worktree_receipt_raw),
        "worktreeAuthorizationSha256": worktree_authorization_sha,
        "worktreeAuthorizationFileSha256": digest_bytes(worktree_authorization_raw),
        "worktreeExecutorActor": worktree_executor,
        "patchManifestSha256": patch_manifest_sha,
        "reviewSha256": review_sha,
        "reviewFileSha256": digest_bytes(review_raw),
        "reviewer": reviewer,
        "reviewedAt": review["reviewedAt"],
        "reviewRationale": rationale,
        "reviewRationaleSha256": digest_bytes(rationale.encode("utf-8")),
        "humanActionEvidence": evidence,
        "humanActionEvidenceSha256": digest_bytes(evidence.encode("utf-8")),
        "nonce": nonce,
        "reasonCodes": normalized_reasons,
        "decision": decision,
        "nextAuthorityHold": DECISION_HOLDS[decision],
    }


def build_authorization(bound: dict[str, Any]) -> dict[str, Any] | None:
    if bound["decision"] != "APPROVE_LOCAL_COMMIT_OBJECT":
        return None
    authorization: dict[str, Any] = {
        "schema": AUTHORIZATION_SCHEMA,
        "worktreeApplicationReceiptSha256": bound["worktreeReceiptSha256"],
        "patchManifestSha256": bound["patchManifestSha256"],
        "repositoryIdentity": bound["repositoryIdentity"],
        "baseCommit": bound["head"],
        "branch": bound["branch"],
        "changedPaths": TARGETS,
        "changeSetSha256": bound["changeSetSha256"],
        "decision": "approve-local-commit-object",
        "diffReviewerActor": bound["reviewer"],
        "nonce": bound["nonce"],
        "reviewRationale": bound["reviewRationale"],
        "reviewedAt": bound["reviewedAt"],
    }
    authorization["authorizationSha256"] = digest_object(authorization)
    return authorization


def build_receipt(bound: dict[str, Any], authorization: dict[str, Any] | None) -> dict[str, Any]:
    authorization_sha = authorization.get("authorizationSha256") if authorization else None
    receipt: dict[str, Any] = {
        "schema": RECEIPT_SCHEMA,
        "componentId": COMPONENT_ID,
        "status": "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD",
        "decision": bound["decision"],
        "nextAuthorityHold": bound["nextAuthorityHold"],
        "repositoryState": {
            "repositoryIdentity": bound["repositoryIdentity"],
            "baseCommit": bound["head"],
            "branch": bound["branch"],
            "changedPaths": TARGETS,
            "changeSetSha256": bound["changeSetSha256"],
            "changeSetRows": bound["changeSetRows"],
            "gitDiffCheck": "PASS",
            "liveIndexModified": False,
        },
        "exactBindings": {
            "worktreeApplicationReceiptSha256": bound["worktreeReceiptSha256"],
            "worktreeApplicationReceiptFileSha256": bound["worktreeReceiptFileSha256"],
            "worktreeApplyAuthorizationSha256": bound["worktreeAuthorizationSha256"],
            "worktreeApplyAuthorizationFileSha256": bound["worktreeAuthorizationFileSha256"],
            "patchManifestSha256": bound["patchManifestSha256"],
            "humanReviewSha256": bound["reviewSha256"],
            "humanReviewFileSha256": bound["reviewFileSha256"],
            "diffReviewAuthorizationSha256": authorization_sha,
        },
        "humanAuthority": {
            "diffReviewerActor": bound["reviewer"],
            "worktreeExecutorActor": bound["worktreeExecutorActor"],
            "reviewedAt": bound["reviewedAt"],
            "reasonCodes": bound["reasonCodes"],
            "reviewRationaleSha256": bound["reviewRationaleSha256"],
            "humanActionEvidenceSha256": bound["humanActionEvidenceSha256"],
            "machineGenerated": False,
        },
        "authorityBoundary": {
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
        "selfDigestMethod": "REMOVE_RECEIPT_SHA256_BEFORE_HASH",
    }
    receipt["receiptSha256"] = digest_object(receipt)
    return receipt


def serialize(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")


def exclusive_write(path: Path, raw: bytes) -> None:
    if path.exists() or path.is_symlink():
        raise Refusal("REFUSE_OUTPUT_EXISTS", f"output already exists: {path}")
    if not path.parent.is_dir():
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", f"output parent missing: {path.parent}")
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
    authorization: dict[str, Any] | None,
    receipt: dict[str, Any],
) -> None:
    if authorization_path == receipt_path:
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", "authorization and receipt outputs must differ")
    for path in (authorization_path, receipt_path):
        if path.exists() or path.is_symlink():
            raise Refusal("REFUSE_OUTPUT_EXISTS", f"output already exists: {path}")
        if not path.parent.is_dir():
            raise Refusal("REFUSE_OUTPUT_BOUNDARY", f"output parent missing: {path.parent}")
    written: list[Path] = []
    try:
        if authorization is not None:
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
        repo = Path(args.repo)
        authorization_output = Path(args.authorization_output)
        receipt_output = Path(args.receipt_output)
        ensure_outside_repository(repo, authorization_output, "authorization output")
        ensure_outside_repository(repo, receipt_output, "receipt output")
        worktree_receipt, worktree_receipt_raw = load_object(Path(args.worktree_receipt), "worktree receipt")
        worktree_authorization, worktree_authorization_raw = load_object(
            Path(args.worktree_authorization),
            "worktree authorization",
        )
        review, review_raw = load_object(Path(args.review), "human review")
        bound = validate_inputs(
            repo,
            worktree_receipt,
            worktree_receipt_raw,
            worktree_authorization,
            worktree_authorization_raw,
            review,
            review_raw,
            args.actor,
        )
        authorization = build_authorization(bound)
        receipt = build_receipt(bound, authorization)
        write_outputs(authorization_output, receipt_output, authorization, receipt)
        return receipt, 0
    except Refusal as exc:
        return {
            "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-refusal/1",
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
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
        }, 3
    except Exception as exc:
        return {
            "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-refusal/1",
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
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
        }, 4


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--worktree-receipt", required=True)
    parser.add_argument("--worktree-authorization", required=True)
    parser.add_argument("--review", required=True)
    parser.add_argument("--authorization-output", required=True)
    parser.add_argument("--receipt-output", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    result, code = execute(args)
    print(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
