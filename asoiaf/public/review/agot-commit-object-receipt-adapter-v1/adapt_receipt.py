#!/usr/bin/env python3
"""Adapt one exact AGOT commit-object receipt without releasing a worktree or moving a reference."""
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

COMPONENT = "asoiaf-agot-commit-object-receipt-adapter-v1"
SOURCE_COMPONENT = "asoiaf-agot-local-feature-commit-object-sealer-v1"
SOURCE_SCHEMA = "axm-asoiaf-agot-local-feature-commit-object-receipt/2"
TARGET_SCHEMA = "axm-asoiaf-agot-local-feature-commit-object-receipt/1"
STATUS = "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD"
ADAPTER_STATUS = "PASS_COMMIT_OBJECT_RECEIPT_ADAPTED_WORKTREE_RELEASE_WITHHELD"
NEXT_HOLD = "REVIEWED_WORKTREE_RELEASE_WITHHELD"
AUTH_SCHEMA = "axm-asoiaf-commit-object-receipt-adaptation-authorization/1"
AUTH_DECISION = "adapt-commit-object-receipt-for-reference-update"
TARGETS = [
    "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
    "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
]
PREFIXES = ("agent/", "review/", "transaction/")
FORBIDDEN_BRANCHES = {"main", "master"}
OID = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
FORBIDDEN_KEYS = {
    "sourcetext", "paragraphtext", "displayedsource", "sourceexcerpt",
    "privateparagraph", "booktext", "rawsource", "sourceprose",
    "copyrightedtext", "privatepayload", "admittedproposition",
    "propositiontext",
}


class Refusal(RuntimeError):
    def __init__(self, status: str, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest_object(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def strict_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Refusal("REFUSE_DUPLICATE_JSON_KEY", key)
        result[key] = value
    return result


def load_object(path: Path, label: str) -> tuple[dict[str, Any], bytes]:
    try:
        info = path.lstat()
    except FileNotFoundError as exc:
        raise Refusal("REFUSE_INPUT", f"{label} missing") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise Refusal("REFUSE_INPUT", f"{label} must be a regular non-symlink file")
    raw = path.read_bytes()
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=strict_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Refusal("REFUSE_INPUT", f"{label} must be strict UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise Refusal("REFUSE_INPUT", f"{label} must be an object")
    return value, raw


def normalized_key(value: str) -> str:
    return value.casefold().replace("_", "").replace("-", "")


def walk_keys(value: Any) -> Iterable[str]:
    if isinstance(value, dict):
        for key, child in value.items():
            yield normalized_key(str(key))
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


def require_hex64(value: Any, label: str) -> str:
    text = str(value or "")
    if not HEX64.fullmatch(text):
        raise Refusal("REFUSE_BINDING", f"{label} must be lowercase SHA-256")
    return text


def require_oid(value: Any, label: str) -> str:
    text = str(value or "")
    if not OID.fullmatch(text):
        raise Refusal("REFUSE_BINDING", f"{label} must be a Git object identity")
    return text


def require_named(value: Any, label: str) -> str:
    text = " ".join(str(value or "").split())
    if len(text) < 3 or len(text) > 200 or text.casefold() in {"actor", "human", "user", "test"}:
        raise Refusal("REFUSE_ACTOR", f"{label} must be separately named")
    return text


def require_time(value: Any, label: str) -> str:
    text = str(value or "")
    if not text.endswith("Z"):
        raise Refusal("REFUSE_AUTHORIZATION", f"{label} must use UTC Z")
    try:
        observed = datetime.fromisoformat(text[:-1] + "+00:00")
    except ValueError as exc:
        raise Refusal("REFUSE_AUTHORIZATION", f"{label} must be ISO-8601") from exc
    if observed.tzinfo != timezone.utc:
        raise Refusal("REFUSE_AUTHORIZATION", f"{label} must be UTC")
    return text


def verify_self_digest(value: dict[str, Any], field: str, status: str) -> str:
    observed = require_hex64(value.get(field), field)
    candidate = dict(value)
    candidate.pop(field, None)
    if digest_object(candidate) != observed:
        raise Refusal(status, f"{field} mismatch")
    return observed


def git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        capture_output=True,
        shell=False,
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
    )
    if check and result.returncode:
        raise Refusal("REFUSE_GIT_STATE", result.stderr.strip() or result.stdout.strip() or "git failed")
    return result


def repository_identity(repo: Path) -> str:
    configured = git(repo, "config", "--get", "remote.origin.url", check=False).stdout.strip()
    if configured:
        return configured
    common_raw = git(repo, "rev-parse", "--git-common-dir").stdout.strip()
    common = Path(common_raw)
    if not common.is_absolute():
        common = repo / common
    return f"local:{common.resolve()}"


def output_outside_repository(repo: Path, output: Path) -> None:
    resolved = output.resolve(strict=False)
    common_raw = git(repo, "rev-parse", "--git-common-dir").stdout.strip()
    common = Path(common_raw)
    if not common.is_absolute():
        common = repo / common
    for root in {repo.resolve(), common.resolve()}:
        if resolved == root or root in resolved.parents:
            raise Refusal("REFUSE_OUTPUT_BOUNDARY", "output must remain outside repository")
    if output.exists() or output.is_symlink():
        raise Refusal("REFUSE_OUTPUT_OVERWRITE", "output already exists")
    if not output.parent.is_dir():
        raise Refusal("REFUSE_OUTPUT_BOUNDARY", "output parent missing")


def file_at_commit(repo: Path, commit: str, path: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), "show", f"{commit}:{path}"],
        capture_output=True,
        shell=False,
    )
    return result.stdout if result.returncode == 0 else b""


def status_paths(repo: Path) -> list[str]:
    rows: list[str] = []
    for line in git(repo, "status", "--porcelain=v1", "--untracked-files=all").stdout.splitlines():
        if len(line) >= 4:
            rows.append(line[3:].replace("\\", "/"))
    return sorted(rows)


def validate_source(repo: Path, receipt: dict[str, Any], raw: bytes) -> dict[str, Any]:
    if receipt.get("schema") != SOURCE_SCHEMA or receipt.get("componentId") != SOURCE_COMPONENT:
        raise Refusal("REFUSE_SOURCE_RECEIPT", "schema or component")
    if receipt.get("status") != STATUS:
        raise Refusal("REFUSE_SOURCE_RECEIPT", "standing")
    if FORBIDDEN_KEYS.intersection(walk_keys(receipt)):
        raise Refusal("REFUSE_SOURCE_TEXT_FIELD", "source or private field")
    source_digest = verify_self_digest(receipt, "commitObjectReceiptSha256", "REFUSE_SOURCE_RECEIPT")
    boundaries = {
        "liveIndexModified": False,
        "branchReferenceUpdated": False,
        "worktreeChangesRetained": True,
        "remotePushExecuted": False,
        "pullRequestOpened": False,
        "canonEffect": "none",
        "graphEffect": "none",
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
    }
    for field, expected in boundaries.items():
        if receipt.get(field) != expected:
            raise Refusal("REFUSE_SOURCE_RECEIPT", f"authority boundary: {field}")

    identity = repository_identity(repo)
    if receipt.get("repositoryIdentity") != identity:
        raise Refusal("REFUSE_SOURCE_RECEIPT", "repository identity")
    base = require_oid(receipt.get("baseCommit"), "base commit")
    commit = require_oid(receipt.get("commitObjectSha"), "commit object")
    tree = require_oid(receipt.get("treeSha"), "tree")
    if len({len(base), len(commit), len(tree)}) != 1:
        raise Refusal("REFUSE_SOURCE_RECEIPT", "mixed object-id formats")
    branch = str(receipt.get("branch") or "")
    if branch in FORBIDDEN_BRANCHES or not branch.startswith(PREFIXES):
        raise Refusal("REFUSE_BRANCH_BOUNDARY", branch)
    reviewer = require_named(receipt.get("diffReviewerActor"), "diff reviewer")
    commit_actor = require_named(receipt.get("commitObjectActor"), "commit actor")
    if reviewer.casefold() == commit_actor.casefold():
        raise Refusal("REFUSE_ACTOR_COLLISION", "prior actors collide")
    diff_auth = require_hex64(receipt.get("diffReviewAuthorizationSha256"), "diff-review authorization")
    commit_auth = require_hex64(receipt.get("commitAuthorizationSha256"), "commit authorization")
    change_digest = require_hex64(receipt.get("changeSetSha256"), "change-set digest")

    if git(repo, "rev-parse", "HEAD").stdout.strip() != base:
        raise Refusal("REFUSE_GIT_STATE", "HEAD differs from reviewed base")
    symbolic = git(repo, "symbolic-ref", "--short", "HEAD", check=False).stdout.strip()
    if symbolic != branch:
        raise Refusal("REFUSE_GIT_STATE", "reviewed branch is not current")
    if git(repo, "diff", "--cached", "--quiet", check=False).returncode:
        raise Refusal("REFUSE_LIVE_INDEX", "live index changed")
    if status_paths(repo) != sorted(TARGETS):
        raise Refusal("REFUSE_WORKTREE_DIFF", "reviewed worktree paths changed")
    if git(repo, "diff", "--check", check=False).returncode:
        raise Refusal("REFUSE_WORKTREE_DIFF", "git diff --check failed")

    if git(repo, "cat-file", "-t", base).stdout.strip() != "commit":
        raise Refusal("REFUSE_COMMIT_OBJECT", "base is not commit")
    if git(repo, "cat-file", "-t", commit).stdout.strip() != "commit":
        raise Refusal("REFUSE_COMMIT_OBJECT", "new object is not commit")
    parents = git(repo, "rev-list", "--parents", "-n", "1", commit).stdout.strip().split()
    if parents != [commit, base]:
        raise Refusal("REFUSE_FAST_FORWARD", "parent vector")
    if git(repo, "rev-parse", f"{commit}^{{tree}}").stdout.strip() != tree:
        raise Refusal("REFUSE_COMMIT_OBJECT", "tree binding")
    changed = sorted(git(repo, "diff-tree", "--no-commit-id", "--name-only", "-r", base, commit).stdout.splitlines())
    if changed != sorted(TARGETS):
        raise Refusal("REFUSE_CHANGED_PATHS", str(changed))
    if git(repo, "rev-parse", "--verify", f"refs/heads/{branch}").stdout.strip() != base:
        raise Refusal("REFUSE_EXPECTED_OLD_VALUE", branch)
    containing = git(repo, "for-each-ref", "--format=%(refname)", "--contains", commit, "refs/heads", check=False).stdout.splitlines()
    if containing:
        raise Refusal("REFUSE_REFERENCED_COMMIT_OBJECT", str(containing))

    rows = receipt.get("changeSetRows")
    if not isinstance(rows, list) or len(rows) != 2:
        raise Refusal("REFUSE_SOURCE_RECEIPT", "change-set census")
    normalized: list[dict[str, Any]] = []
    for row, path in zip(rows, TARGETS, strict=True):
        if not isinstance(row, dict) or str(row.get("path") or "") != path:
            raise Refusal("REFUSE_SOURCE_RECEIPT", "change-set path order")
        before = file_at_commit(repo, base, path)
        current_path = repo / path
        current = current_path.read_bytes() if current_path.is_file() else b""
        expected = {
            "path": path,
            "baseBytes": len(before),
            "baseSha256": digest_bytes(before),
            "currentBytes": len(current),
            "currentSha256": digest_bytes(current),
        }
        if row != expected:
            raise Refusal("REFUSE_SOURCE_RECEIPT", f"change-set row drift: {path}")
        normalized.append(expected)
    if digest_object(normalized) != change_digest:
        raise Refusal("REFUSE_SOURCE_RECEIPT", "change-set digest")

    return {
        "identity": identity,
        "base": base,
        "commit": commit,
        "tree": tree,
        "branch": branch,
        "reviewer": reviewer,
        "commitActor": commit_actor,
        "diffAuth": diff_auth,
        "commitAuth": commit_auth,
        "changeDigest": change_digest,
        "rows": normalized,
        "sourceDigest": source_digest,
        "sourceFileDigest": digest_bytes(raw),
    }


def validate_authorization(auth: dict[str, Any], state: dict[str, Any], actor: str) -> dict[str, str]:
    if auth.get("schema") != AUTH_SCHEMA or auth.get("decision") != AUTH_DECISION:
        raise Refusal("REFUSE_AUTHORIZATION", "schema or decision")
    if FORBIDDEN_KEYS.intersection(walk_keys(auth)):
        raise Refusal("REFUSE_SOURCE_TEXT_FIELD", "authorization source or private field")
    auth_digest = verify_self_digest(auth, "authorizationSha256", "REFUSE_AUTHORIZATION")
    expected = {
        "sourceReceiptFileSha256": state["sourceFileDigest"],
        "sourceReceiptSha256": state["sourceDigest"],
        "repositoryIdentity": state["identity"],
        "baseCommit": state["base"],
        "branch": state["branch"],
        "commitObjectSha": state["commit"],
        "treeSha": state["tree"],
    }
    for field, value in expected.items():
        if auth.get(field) != value:
            raise Refusal("REFUSE_AUTHORIZATION", f"{field} binding")
    adapter_actor = require_named(auth.get("adapterActor"), "adapter actor")
    if require_named(actor, "recording actor") != adapter_actor:
        raise Refusal("REFUSE_ACTOR", "recording actor mismatch")
    if adapter_actor.casefold() in {state["reviewer"].casefold(), state["commitActor"].casefold()}:
        raise Refusal("REFUSE_ACTOR_COLLISION", "adapter actor collides with prior actor")
    require_time(auth.get("authorizedAt"), "authorizedAt")
    if not str(auth.get("nonce") or "").strip():
        raise Refusal("REFUSE_AUTHORIZATION", "nonce missing")
    for field in (
        "repositoryEffectAuthorized", "worktreeReleaseAuthorized", "referenceUpdateAuthorized",
        "remotePushAuthorized", "pullRequestAuthorized",
    ):
        if auth.get(field) is not False:
            raise Refusal("REFUSE_AUTHORIZATION", f"{field} must remain false")
    if auth.get("canonEffect") != "none" or auth.get("graphEffect") != "none":
        raise Refusal("REFUSE_AUTHORIZATION", "canon or graph boundary")
    return {"actor": adapter_actor, "authDigest": auth_digest, "authorizedAt": str(auth["authorizedAt"])}


def build_receipt(state: dict[str, Any], authority: dict[str, str]) -> dict[str, Any]:
    output: dict[str, Any] = {
        "schema": TARGET_SCHEMA,
        "componentId": SOURCE_COMPONENT,
        "status": STATUS,
        "repositoryIdentity": state["identity"],
        "baseCommit": state["base"],
        "branch": state["branch"],
        "treeSha": state["tree"],
        "commitObjectSha": state["commit"],
        "changeSetSha256": state["changeDigest"],
        "changeSetRows": state["rows"],
        "diffReviewerActor": state["reviewer"],
        "commitObjectActor": state["commitActor"],
        "diffReviewAuthorizationSha256": state["diffAuth"],
        "commitAuthorizationSha256": state["commitAuth"],
        "adapterComponentId": COMPONENT,
        "adapterActor": authority["actor"],
        "adapterStatus": ADAPTER_STATUS,
        "nextAuthorityHold": NEXT_HOLD,
        "authorizedAt": authority["authorizedAt"],
        "sourceReceiptSchema": SOURCE_SCHEMA,
        "sourceReceiptFileSha256": state["sourceFileDigest"],
        "sourceReceiptSha256": state["sourceDigest"],
        "adaptationAuthorizationSha256": authority["authDigest"],
        "liveIndexModified": False,
        "branchReferenceUpdated": False,
        "worktreeChangesRetained": True,
        "worktreeReleased": False,
        "remotePushExecuted": False,
        "pullRequestOpened": False,
        "canonEffect": "none",
        "graphEffect": "none",
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
    }
    output["commitObjectReceiptSha256"] = digest_object(output)
    return output


def write_exclusive(path: Path, value: dict[str, Any]) -> None:
    raw = (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=True) as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        raise


def refusal(status: str, detail: str) -> dict[str, Any]:
    return {
        "schema": "axm-asoiaf-agot-commit-object-receipt-adapter-refusal/1",
        "componentId": COMPONENT,
        "status": status,
        "detail": detail,
        "repositoryFilesWrittenByRuntime": 0,
        "worktreesModifiedByRuntime": 0,
        "liveIndexesModifiedByRuntime": 0,
        "commitsCreatedByRuntime": 0,
        "referencesUpdatedByRuntime": 0,
        "remotePushesByRuntime": 0,
        "pullRequestsOpenedByRuntime": 0,
        "canonEffect": "none",
        "graphEffect": "none",
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--source-receipt", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    try:
        repo = Path(args.repo).resolve()
        if not (repo / ".git").exists():
            raise Refusal("REFUSE_GIT_STATE", "repository metadata missing")
        output = Path(args.output)
        output_outside_repository(repo, output)
        source, source_raw = load_object(Path(args.source_receipt), "source receipt")
        authorization, _ = load_object(Path(args.authorization), "authorization")
        state = validate_source(repo, source, source_raw)
        authority = validate_authorization(authorization, state, args.actor)
        adapted = build_receipt(state, authority)
        write_exclusive(output, adapted)
    except Refusal as exc:
        print(json.dumps(refusal(exc.status, exc.detail), indent=2, sort_keys=True))
        return 3
    except Exception as exc:
        print(json.dumps(refusal("REFUSE_UNHANDLED_INPUT", f"{type(exc).__name__}: {exc}"), indent=2, sort_keys=True))
        return 4
    print(json.dumps(adapted, indent=2, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
