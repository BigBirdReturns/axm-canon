#!/usr/bin/env python3
"""Audit the admitted AGOT review lane without executing any transaction effect."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
from pathlib import Path
from typing import Any, Iterable, Sequence

COMPONENT_ID = "asoiaf-agot-end-to-end-authority-continuity-auditor-v1"
RECEIPT_SCHEMA = "axm-asoiaf-agot-end-to-end-authority-continuity-receipt/1"
SUCCESS_STATUS = "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD"
NEXT_HOLD = "FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD"
SELF_DIGEST_MARKER = "SELF_DIGESTED_OUTPUT"
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
TEXT_SUFFIXES = {".json", ".md", ".py", ".ts", ".txt", ".cmd", ".yml", ".yaml"}
METADATA_NAMES = {"ADMISSION.json", "CONTRACT.json", "CURRENT_STANDING.json"}
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
ZERO_COUNT_KEYS = {
    "automaticcanonpromotions",
    "automaticgraphmutations",
    "repositoryfileswrittenbyruntime",
    "worktreesmodifiedbyruntime",
    "liveindexesmodifiedbyruntime",
    "commitscreatedbyruntime",
    "referencesupdatedbyruntime",
    "remotepushesbyruntime",
    "pullrequestsopenedbyruntime",
}
NONE_EFFECT_KEYS = {
    "automaticcanoneffect",
    "automaticgrapheffect",
    "canoneffect",
    "grapheffect",
    "runtimerepositoryeffect",
}

STEP_SPECS: tuple[dict[str, Any], ...] = (
    {
        "ordinal": 1,
        "componentId": "asoiaf-agot-local-human-review-workstation-v1",
        "directory": "agot-local-human-review-workstation-v1",
        "statuses": ("PASS_NAMED_HUMAN_INTAKE_RECORDED_DISPOSITION_WITHHELD",),
        "holds": ("NAMED_HUMAN_DISPOSITION_WITHHELD", "DISPOSITION_WITHHELD"),
    },
    {
        "ordinal": 2,
        "componentId": "asoiaf-agot-named-human-disposition-recorder-v1",
        "directory": "agot-named-human-disposition-recorder-v1",
        "statuses": ("PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD",),
        "holds": ("LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD",),
    },
    {
        "ordinal": 3,
        "componentId": "asoiaf-agot-local-feature-materialization-request-v1",
        "directory": "agot-local-feature-materialization-request-v1",
        "statuses": ("PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD",),
        "holds": ("LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD",),
    },
    {
        "ordinal": 4,
        "componentId": "asoiaf-agot-local-feature-postimage-materializer-v1",
        "directory": "agot-local-feature-postimage-materializer-v1",
        "statuses": ("PASS_LOCAL_FEATURE_POSTIMAGES_MATERIALIZED_WORKTREE_APPLICATION_WITHHELD",),
        "holds": ("LOCAL_FEATURE_WORKTREE_APPLICATION_WITHHELD",),
    },
    {
        "ordinal": 5,
        "componentId": "asoiaf-agot-local-postimage-patch-bundle-sealer-v1",
        "directory": "agot-local-postimage-patch-bundle-sealer-v1",
        "statuses": ("PASS_LOCAL_POSTIMAGE_PATCH_BUNDLE_SEALED_WORKTREE_APPLICATION_WITHHELD",),
        "holds": ("LOCAL_FEATURE_WORKTREE_APPLICATION_WITHHELD",),
    },
    {
        "ordinal": 6,
        "componentId": "asoiaf-agot-repository-patch-worktree-executor-v1",
        "directory": "agot-repository-patch-worktree-executor-v1",
        "statuses": ("PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT",),
        "holds": ("HUMAN_DIFF_REVIEW", "PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT"),
    },
    {
        "ordinal": 7,
        "componentId": "asoiaf-agot-named-human-worktree-diff-review-recorder-v1",
        "directory": "agot-named-human-worktree-diff-review-recorder-v1",
        "statuses": ("PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD",),
        "holds": ("LOCAL_COMMIT_OBJECT_CREATION_WITHHELD",),
    },
    {
        "ordinal": 8,
        "componentId": "asoiaf-agot-local-feature-commit-object-sealer-v1",
        "directory": "agot-local-feature-commit-object-sealer-v1",
        "statuses": ("PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD",),
        "holds": ("REF_UPDATE_WITHHELD", "LOCAL_FEATURE_REFERENCE_UPDATE_WITHHELD"),
    },
    {
        "ordinal": 9,
        "componentId": "asoiaf-agot-feature-reference-updater-v1",
        "directory": "agot-feature-reference-updater-v1",
        "statuses": ("PASS_LOCAL_FEATURE_BRANCH_REFERENCE_UPDATED_REMOTE_PUSH_WITHHELD",),
        "holds": ("REMOTE_PUSH_WITHHELD",),
    },
    {
        "ordinal": 10,
        "componentId": "asoiaf-agot-remote-feature-push-operator-v1",
        "directory": "agot-remote-feature-push-operator-v1",
        "statuses": ("PASS_REMOTE_FEATURE_BRANCH_PUSHED_PULL_REQUEST_WITHHELD",),
        "holds": ("PULL_REQUEST_WITHHELD",),
    },
    {
        "ordinal": 11,
        "componentId": "asoiaf-agot-draft-pr-request-packet-v1",
        "directory": "agot-draft-pr-request-packet-v1",
        "statuses": ("PASS_DRAFT_PULL_REQUEST_REQUEST_PACKET_SEALED_CREATION_WITHHELD",),
        "holds": ("CREATION_WITHHELD", "DRAFT_PULL_REQUEST_CREATION_WITHHELD"),
    },
    {
        "ordinal": 12,
        "componentId": "asoiaf-agot-draft-pr-creator-v1",
        "directory": "agot-draft-pr-creator-v1",
        "statuses": ("PASS_DRAFT_PULL_REQUEST_CREATED_REVIEW_AND_MERGE_WITHHELD",),
        "holds": ("REVIEW_AND_MERGE_WITHHELD",),
    },
    {
        "ordinal": 13,
        "componentId": "asoiaf-agot-draft-pr-readiness-operator-v1",
        "directory": "agot-draft-pr-readiness-operator-v1",
        "statuses": ("PASS_PULL_REQUEST_MARKED_READY_APPROVAL_AND_MERGE_WITHHELD",),
        "holds": ("APPROVAL_AND_MERGE_WITHHELD",),
    },
    {
        "ordinal": 14,
        "componentId": "asoiaf-agot-pr-merge-request-packet-v1",
        "directory": "agot-pr-merge-request-packet-v1",
        "statuses": ("PASS_PULL_REQUEST_MERGE_REQUEST_PACKET_SEALED_EXECUTION_WITHHELD",),
        "holds": ("EXECUTION_WITHHELD", "MERGE_EXECUTION_WITHHELD"),
    },
    {
        "ordinal": 15,
        "componentId": "asoiaf-agot-pull-request-merge-executor-v1",
        "directory": "agot-pull-request-merge-executor-v1",
        "statuses": ("PASS_PULL_REQUEST_SQUASH_MERGED_POST_MERGE_ADMISSION_WITHHELD",),
        "holds": ("POST_MERGE_ADMISSION_WITHHELD",),
    },
    {
        "ordinal": 16,
        "componentId": "asoiaf-agot-post-merge-admission-verifier-v1",
        "directory": "agot-post-merge-admission-verifier-v1",
        "statuses": ("PASS_POST_MERGE_REPOSITORY_ADMISSION_VERIFIED_EFFECT_ACTIVATION_WITHHELD",),
        "holds": ("EFFECT_ACTIVATION_WITHHELD",),
    },
)


class Refusal(RuntimeError):
    """Fail-closed audit refusal."""


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


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


def normalize_key(value: str) -> str:
    return value.casefold().replace("_", "").replace("-", "")


def walk_items(value: Any) -> Iterable[tuple[str, Any]]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield normalize_key(str(key)), child
            yield from walk_items(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_items(child)


def git(root: Path, *arguments: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(root), *arguments],
        check=True,
        capture_output=True,
        text=True,
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
    )
    return completed.stdout.strip()


def ensure_outside_repository(root: Path, output: Path) -> None:
    resolved_root = root.resolve()
    resolved_output = output.resolve(strict=False)
    try:
        resolved_output.relative_to(resolved_root)
    except ValueError:
        return
    raise Refusal("audit output must remain outside repository")


def read_metadata(directory: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    if directory.is_symlink() or not directory.is_dir():
        raise Refusal(f"component directory missing or unsafe: {directory.name}")
    text_records: list[dict[str, Any]] = []
    metadata_objects: list[dict[str, Any]] = []
    digest_parts: list[bytes] = []
    for path in sorted(directory.rglob("*"), key=lambda item: item.as_posix()):
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode):
            raise Refusal(f"symlink refused in component metadata: {path}")
        if not stat.S_ISREG(info.st_mode) or path.suffix.casefold() not in TEXT_SUFFIXES:
            continue
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise Refusal(f"metadata is not UTF-8: {path}") from exc
        relative = path.relative_to(directory).as_posix()
        digest = digest_bytes(raw)
        text_records.append({"path": relative, "bytes": len(raw), "sha256": digest, "text": text})
        digest_parts.extend((relative.encode("utf-8"), b"\0", digest.encode("ascii"), b"\n"))
        if path.name in METADATA_NAMES:
            try:
                value = json.loads(text, object_pairs_hook=strict_pairs)
            except json.JSONDecodeError as exc:
                raise Refusal(f"invalid metadata JSON: {path}") from exc
            if not isinstance(value, dict):
                raise Refusal(f"metadata JSON must be object: {path}")
            metadata_objects.append(value)
    if not text_records:
        raise Refusal(f"no public metadata found for component: {directory.name}")
    if not metadata_objects:
        raise Refusal(f"no admission metadata object found for component: {directory.name}")
    return text_records, metadata_objects, digest_bytes(b"".join(digest_parts))


def verify_zero_effects(objects: list[dict[str, Any]], component_id: str) -> None:
    for value in objects:
        for key, child in walk_items(value):
            if key in FORBIDDEN_KEYS:
                raise Refusal(f"private source or payload field refused in {component_id}: {key}")
            if key in ZERO_COUNT_KEYS and child != 0:
                raise Refusal(f"runtime effect count changed in {component_id}: {key}")
            if key in NONE_EFFECT_KEYS and child != "none":
                raise Refusal(f"automatic effect boundary changed in {component_id}: {key}")


def match_any(haystack: str, alternatives: Sequence[str], label: str) -> str:
    for value in alternatives:
        if value in haystack:
            return value
    raise Refusal(f"missing {label}: expected one of {list(alternatives)}")


def audit_step(public_review_root: Path, spec: dict[str, Any]) -> dict[str, Any]:
    directory = public_review_root / str(spec["directory"])
    records, metadata_objects, metadata_sha = read_metadata(directory)
    combined = "\n".join(record["text"] for record in records)
    component_id = str(spec["componentId"])
    if component_id not in combined:
        raise Refusal(f"component identity absent from metadata: {component_id}")
    matched_status = match_any(combined, spec["statuses"], f"status boundary for {component_id}")
    matched_hold = match_any(combined, spec["holds"], f"authority hold for {component_id}")
    verify_zero_effects(metadata_objects, component_id)
    public_files = [
        {"path": record["path"], "bytes": record["bytes"], "sha256": record["sha256"]}
        for record in records
    ]
    return {
        "ordinal": int(spec["ordinal"]),
        "componentId": component_id,
        "repositoryPath": directory.relative_to(public_review_root.parent.parent.parent).as_posix(),
        "matchedStatus": matched_status,
        "matchedNextAuthorityHold": matched_hold,
        "metadataTreeSha256": metadata_sha,
        "metadataFileCount": len(public_files),
        "metadataFiles": public_files,
        "privateSourceTextRead": False,
        "privatePayloadRead": False,
        "componentRuntimeExecuted": False,
    }


def build_receipt(root: Path) -> dict[str, Any]:
    if root.is_symlink() or not (root / ".git").exists():
        raise Refusal("repository root missing or unsafe")
    public_review_root = root / "asoiaf" / "public" / "review"
    if public_review_root.is_symlink() or not public_review_root.is_dir():
        raise Refusal("public review root missing or unsafe")

    before = {
        "head": git(root, "rev-parse", "HEAD"),
        "tree": git(root, "rev-parse", "HEAD^{tree}"),
        "status": git(root, "status", "--porcelain=v1", "--untracked-files=all"),
    }
    if not HEX40.fullmatch(before["head"]) or not HEX40.fullmatch(before["tree"]):
        raise Refusal("repository object identity malformed")

    steps = [audit_step(public_review_root, spec) for spec in STEP_SPECS]
    if [step["ordinal"] for step in steps] != list(range(1, len(STEP_SPECS) + 1)):
        raise Refusal("authority lane ordinal drift")
    if len({step["componentId"] for step in steps}) != len(steps):
        raise Refusal("duplicate component identity in authority lane")

    after = {
        "head": git(root, "rev-parse", "HEAD"),
        "tree": git(root, "rev-parse", "HEAD^{tree}"),
        "status": git(root, "status", "--porcelain=v1", "--untracked-files=all"),
    }
    if before != after:
        raise Refusal("repository changed during audit")

    receipt: dict[str, Any] = {
        "schema": RECEIPT_SCHEMA,
        "componentId": COMPONENT_ID,
        "status": SUCCESS_STATUS,
        "nextAuthorityHold": NEXT_HOLD,
        "repository": {
            "rootName": root.name,
            "headCommit": before["head"],
            "headTree": before["tree"],
            "workingStateSha256": digest_bytes(before["status"].encode("utf-8")),
            "workingStateChangedByAudit": False,
        },
        "lane": {
            "stepCount": len(steps),
            "firstComponent": steps[0]["componentId"],
            "lastComponent": steps[-1]["componentId"],
            "orderedComponentsSha256": digest_object([step["componentId"] for step in steps]),
            "orderedStatusBoundariesSha256": digest_object([step["matchedStatus"] for step in steps]),
            "orderedAuthorityHoldsSha256": digest_object([step["matchedNextAuthorityHold"] for step in steps]),
            "steps": steps,
        },
        "substantiveCensus": {
            "realPrivateParagraphsConsumed": 0,
            "realNamedHumanTransactionsConsumed": 0,
            "realRepositoryTransactionsConsumed": 0,
            "realCanonPromotions": 0,
            "realGraphMutations": 0,
        },
        "authorityBoundary": {
            "auditIsNotHumanReview": True,
            "auditIsNotTransactionExecution": True,
            "repositoryFilesWrittenByRuntime": 0,
            "worktreesModifiedByRuntime": 0,
            "liveIndexesModifiedByRuntime": 0,
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
    if not HEX64.fullmatch(receipt["receiptSha256"]):
        raise Refusal("receipt digest construction failed")
    return receipt


def write_exclusive(path: Path, value: dict[str, Any]) -> None:
    if path.exists() or path.is_symlink():
        raise Refusal("output already exists")
    if not path.parent.is_dir() or path.parent.is_symlink():
        raise Refusal("output parent missing or unsafe")
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
    parser.add_argument("--repository-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    try:
        root = Path(args.repository_root)
        output = Path(args.output)
        ensure_outside_repository(root, output)
        receipt = build_receipt(root)
        write_exclusive(output, receipt)
    except (Refusal, subprocess.CalledProcessError, OSError) as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-end-to-end-authority-continuity-refusal/1",
            "status": "REFUSE_AGOT_END_TO_END_AUTHORITY_CONTINUITY_NOT_VERIFIED",
            "reason": str(exc),
            "repositoryFilesWrittenByRuntime": 0,
            "worktreesModifiedByRuntime": 0,
            "liveIndexesModifiedByRuntime": 0,
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
