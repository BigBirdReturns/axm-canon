#!/usr/bin/env python3
"""Seal exact isolated AGOT postimages into a deterministic no-effect patch bundle."""
from __future__ import annotations

import argparse
import copy
import difflib
import hashlib
import json
import os
import re
import shutil
import stat
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Sequence

COMPONENT_ID = "asoiaf-agot-local-feature-patch-bundle-sealer-v1"
UPSTREAM_COMPONENT_ID = "asoiaf-agot-local-feature-postimage-materializer-v1"
UPSTREAM_STATUS = "PASS_LOCAL_FEATURE_POSTIMAGES_MATERIALIZED_WORKTREE_APPLICATION_WITHHELD"
UPSTREAM_HOLD = "LOCAL_FEATURE_WORKTREE_APPLICATION_WITHHELD"
AUTHORIZATION_SCHEMA = "axm-asoiaf-agot-local-feature-patch-bundle-authorization/1"
MANIFEST_SCHEMA = "axm-asoiaf-agot-local-feature-patch-bundle-manifest/1"
RECEIPT_SCHEMA = "axm-asoiaf-agot-local-feature-patch-bundle-receipt/1"
SUCCESS_STATUS = "PASS_LOCAL_FEATURE_PATCH_BUNDLE_SEALED_WORKTREE_EXECUTOR_COMPATIBILITY_WITHHELD"
NEXT_HOLD = "WORKTREE_EXECUTOR_COMPATIBILITY_VALIDATION_WITHHELD"
SELF_DIGEST_MARKER = "SELF_DIGESTED_OUTPUT"
TARGETS = (
    "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson",
    "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson",
)
BUNDLE_FILES = (
    "PATCH_MANIFEST.json",
    "repository.patch",
    "BUNDLE.SHA256SUMS",
    TARGETS[0],
    TARGETS[1],
)
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
BRANCH = re.compile(r"^(?:feature|agent)/asoiaf-agot/[A-Za-z0-9._/-]+$")
FORBIDDEN_KEYS = {
    "sourcetext", "paragraphtext", "displayedsource", "sourceexcerpt",
    "privateparagraph", "booktext", "rawsource", "sourceprose", "privatepayload",
}


class Refusal(RuntimeError):
    """Fail-closed input, custody, or authority refusal."""


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_object(value: Any) -> str:
    return digest_bytes(canonical(value))


def git_blob_sha1(value: bytes) -> str:
    return hashlib.sha1(f"blob {len(value)}\0".encode("ascii") + value).hexdigest()


def strict_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Refusal(f"duplicate JSON key: {key}")
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


def flatten_scalars(value: Any) -> list[Any]:
    output: list[Any] = []
    if isinstance(value, dict):
        for child in value.values():
            output.extend(flatten_scalars(child))
    elif isinstance(value, list):
        for child in value:
            output.extend(flatten_scalars(child))
    elif isinstance(value, (str, int, float, bool)) or value is None:
        output.append(value)
    return output


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


def require_hex40(value: Any, label: str) -> str:
    text = str(value or "")
    if not HEX40.fullmatch(text):
        raise Refusal(f"{label} must be lowercase Git SHA-1")
    return text


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


def parse_time(value: Any, label: str) -> str:
    text = str(value or "")
    if not text.endswith("Z"):
        raise Refusal(f"{label} must use UTC Z suffix")
    try:
        observed = datetime.fromisoformat(text[:-1] + "+00:00")
    except ValueError as exc:
        raise Refusal(f"{label} is not ISO-8601") from exc
    if observed.tzinfo != timezone.utc:
        raise Refusal(f"{label} must be UTC")
    return text


def verify_known_self_digest(value: dict[str, Any], field: str, label: str) -> str:
    observed = require_hex64(value.get(field), f"{label} {field}")
    marker_candidate = copy.deepcopy(value)
    marker_candidate[field] = SELF_DIGEST_MARKER
    if digest_object(marker_candidate) == observed:
        return observed
    absent_candidate = copy.deepcopy(value)
    absent_candidate.pop(field, None)
    if digest_object(absent_candidate) == observed:
        return observed
    raise Refusal(f"{label} self-digest mismatch")


def verify_any_self_digest(value: dict[str, Any], label: str) -> tuple[str, str]:
    preferred = (
        "receiptSha256", "materializationReceiptSha256", "requestSha256",
        "authorizationSha256", "manifestSha256", "validationSha256",
    )
    candidates = [field for field in preferred if field in value]
    candidates.extend(
        field for field, child in value.items()
        if field not in candidates and isinstance(child, str) and HEX64.fullmatch(child)
    )
    for field in candidates:
        try:
            return field, verify_known_self_digest(value, field, label)
        except Refusal:
            continue
    raise Refusal(f"{label} has no valid supported self-digest")


def locate_target_descriptor(value: Any, target: str) -> dict[str, Any]:
    candidates: list[tuple[int, int, dict[str, Any]]] = []

    def visit(node: Any, depth: int) -> None:
        if isinstance(node, dict):
            scalars = flatten_scalars(node)
            if target in scalars:
                keys = [normalize_key(str(key)) for key in node]
                score = sum("sha256" in key for key in keys) * 5 + sum("byte" in key for key in keys) * 3
                score += sum("preimage" in key or "postimage" in key for key in keys) * 4
                candidates.append((score, -depth, node))
            for child in node.values():
                visit(child, depth + 1)
        elif isinstance(node, list):
            for child in node:
                visit(child, depth + 1)

    visit(value, 0)
    if not candidates:
        raise Refusal(f"materialization receipt does not bind target: {target}")
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


def validate_ndjson(raw: bytes, label: str, allow_empty: bool) -> None:
    if not raw:
        if allow_empty:
            return
        raise Refusal(f"{label} must not be empty")
    if not raw.endswith(b"\n"):
        raise Refusal(f"{label} must end with LF")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise Refusal(f"{label} must be UTF-8") from exc
    for number, line in enumerate(text.splitlines(), start=1):
        if not line:
            raise Refusal(f"{label} contains blank NDJSON line {number}")
        try:
            parsed = json.loads(line, object_pairs_hook=strict_pairs)
        except json.JSONDecodeError as exc:
            raise Refusal(f"{label} line {number} is invalid JSON") from exc
        if not isinstance(parsed, dict):
            raise Refusal(f"{label} line {number} must be an object")


def ensure_isolated_empty_directory(path: Path) -> Path:
    try:
        info = path.lstat()
    except FileNotFoundError as exc:
        raise Refusal("output directory missing") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise Refusal("output directory must be a real directory")
    if any(path.iterdir()):
        raise Refusal("output directory must be empty")
    resolved = path.resolve()
    for ancestor in (resolved, *resolved.parents):
        marker = ancestor / ".git"
        if marker.exists() or marker.is_symlink():
            raise Refusal("output directory must be outside every Git worktree")
    return resolved


def validate_authorization(authorization: dict[str, Any], receipt_file_sha: str, receipt: dict[str, Any], actor: str) -> dict[str, str]:
    if authorization.get("schema") != AUTHORIZATION_SCHEMA:
        raise Refusal("authorization schema mismatch")
    verify_known_self_digest(authorization, "authorizationSha256", "authorization")
    if FORBIDDEN_KEYS.intersection(walk_keys(authorization)):
        raise Refusal("private source or payload field refused")
    repository = str(authorization.get("repository") or "")
    if not REPOSITORY.fullmatch(repository):
        raise Refusal("repository identity invalid")
    base_commit = require_hex40(authorization.get("baseCommit"), "base commit")
    feature_branch = str(authorization.get("featureBranch") or "")
    if not BRANCH.fullmatch(feature_branch):
        raise Refusal("feature branch outside governed prefix")
    if authorization.get("targetPaths") != list(TARGETS):
        raise Refusal("authorization target path order mismatch")
    if require_hex64(authorization.get("materializationReceiptFileSha256"), "receipt-file digest") != receipt_file_sha:
        raise Refusal("authorization receipt-file binding mismatch")
    authorized_actor = require_named(authorization.get("authorizedActor"), "authorized actor")
    author = require_named(authorization.get("authorizationAuthor"), "authorization author")
    if authorized_actor != require_named(actor, "runtime actor"):
        raise Refusal("runtime actor mismatch")
    if author == authorized_actor:
        raise Refusal("authorization author and bundle actor must differ")
    parse_time(authorization.get("authorizedAt"), "authorizedAt")
    if authorization.get("machineGenerated") is not False:
        raise Refusal("machine-generated authorization refused")
    for field in (
        "worktreeApplicationAuthorized", "commitAuthorized", "referenceUpdateAuthorized",
        "remotePushAuthorized", "pullRequestAuthorized",
    ):
        if authorization.get(field) is not False:
            raise Refusal(f"downstream authority refused: {field}")
    if authorization.get("canonEffect") != "none" or authorization.get("graphEffect") != "none":
        raise Refusal("authorization canon or graph effect refused")
    receipt_scalars = flatten_scalars(receipt)
    for value, label in ((repository, "repository"), (base_commit, "base commit"), (feature_branch, "feature branch")):
        if value not in receipt_scalars:
            raise Refusal(f"materialization receipt does not bind authorized {label}")
    upstream_actors: set[str] = set()

    def collect_actors(node: Any) -> None:
        if isinstance(node, dict):
            for key, child in node.items():
                normalized = normalize_key(str(key))
                if isinstance(child, str) and any(token in normalized for token in ("actor", "principal", "author", "reviewer", "requester", "materializer")):
                    if child.strip():
                        upstream_actors.add(child.strip())
                collect_actors(child)
        elif isinstance(node, list):
            for child in node:
                collect_actors(child)

    collect_actors(receipt)
    if authorized_actor in upstream_actors or author in upstream_actors:
        raise Refusal("bundle authority collides with an upstream human or execution actor")
    return {
        "repository": repository,
        "baseCommit": base_commit,
        "featureBranch": feature_branch,
        "authorizedActor": authorized_actor,
        "authorizationAuthor": author,
        "authorizedAt": str(authorization["authorizedAt"]),
        "authorizationSha256": str(authorization["authorizationSha256"]),
    }


def bind_inputs(receipt_path: Path, validation_path: Path, materialized_root: Path, preimages: dict[str, Path], authorization_path: Path, actor: str) -> dict[str, Any]:
    receipt, receipt_raw = load_object(receipt_path, "materialization receipt")
    validation, validation_raw = load_object(validation_path, "materialization validation")
    authorization, authorization_raw = load_object(authorization_path, "bundle authorization")
    if receipt.get("componentId") != UPSTREAM_COMPONENT_ID:
        raise Refusal("upstream component identity mismatch")
    if receipt.get("status") != UPSTREAM_STATUS:
        raise Refusal("upstream materialization status mismatch")
    if receipt.get("nextAuthorityHold") != UPSTREAM_HOLD:
        raise Refusal("upstream authority hold mismatch")
    schema = str(receipt.get("schema") or "")
    if not schema.startswith("axm-asoiaf-agot-") or "material" not in schema.casefold():
        raise Refusal("upstream receipt schema outside admitted materialization family")
    receipt_digest_field, receipt_digest = verify_any_self_digest(receipt, "materialization receipt")
    if FORBIDDEN_KEYS.intersection(walk_keys(receipt)):
        raise Refusal("materialization receipt contains private source or payload field")
    receipt_file_sha = digest_bytes(receipt_raw)
    validation_schema = str(validation.get("schema") or "")
    validation_status = str(validation.get("status") or "")
    if not validation_schema.startswith("axm-asoiaf-agot-") or "valid" not in validation_schema.casefold():
        raise Refusal("materialization validation schema mismatch")
    if not validation_status.startswith("PASS_") or "VALID" not in validation_status:
        raise Refusal("materialization validation status mismatch")
    if receipt_file_sha not in flatten_scalars(validation):
        raise Refusal("materialization validation is not bound to exact receipt bytes")
    if validation.get("canonEffect", "none") != "none" or validation.get("graphEffect", "none") != "none":
        raise Refusal("materialization validation authority boundary changed")
    if FORBIDDEN_KEYS.intersection(walk_keys(validation)):
        raise Refusal("materialization validation contains private source or payload field")
    authority = validate_authorization(authorization, receipt_file_sha, receipt, actor)
    root_info = materialized_root.lstat() if materialized_root.exists() or materialized_root.is_symlink() else None
    if root_info is None or stat.S_ISLNK(root_info.st_mode) or not stat.S_ISDIR(root_info.st_mode):
        raise Refusal("materialized root must be a real directory")
    targets: list[dict[str, Any]] = []
    for target in TARGETS:
        pure = PurePosixPath(target)
        post_path = materialized_root / Path(*pure.parts)
        post_raw = require_regular_file(post_path, f"postimage {target}")
        pre_raw = require_regular_file(preimages[target], f"preimage {target}")
        validate_ndjson(pre_raw, f"preimage {target}", allow_empty=True)
        validate_ndjson(post_raw, f"postimage {target}", allow_empty=False)
        if not post_raw.startswith(pre_raw):
            raise Refusal(f"postimage is not append-only for {target}")
        descriptor = locate_target_descriptor(receipt, target)
        scalars = flatten_scalars(descriptor)
        pre_sha = digest_bytes(pre_raw)
        post_sha = digest_bytes(post_raw)
        for expected, label in ((pre_sha, "preimage SHA-256"), (post_sha, "postimage SHA-256"), (len(pre_raw), "preimage byte count"), (len(post_raw), "postimage byte count")):
            if expected not in scalars:
                raise Refusal(f"materialization receipt target descriptor lacks exact {label}: {target}")
        targets.append({
            "targetPath": target,
            "preimageBytes": pre_raw,
            "postimageBytes": post_raw,
            "preimageSha256": pre_sha,
            "postimageSha256": post_sha,
            "preimageGitBlobSha1": git_blob_sha1(pre_raw),
            "postimageGitBlobSha1": git_blob_sha1(post_raw),
            "appendBytes": len(post_raw) - len(pre_raw),
        })
    return {
        "receipt": receipt,
        "receiptRaw": receipt_raw,
        "receiptFileSha256": receipt_file_sha,
        "receiptDigestField": receipt_digest_field,
        "receiptSha256": receipt_digest,
        "validationRaw": validation_raw,
        "validationFileSha256": digest_bytes(validation_raw),
        "authorizationRaw": authorization_raw,
        "authority": authority,
        "targets": targets,
    }


def create_repository_patch(targets: list[dict[str, Any]]) -> bytes:
    sections: list[str] = []
    for target in targets:
        path = target["targetPath"]
        pre = target["preimageBytes"]
        post = target["postimageBytes"]
        old_lines = pre.decode("utf-8").splitlines()
        new_lines = post.decode("utf-8").splitlines()
        sections.append(f"diff --git a/{path} b/{path}")
        if pre:
            sections.append(f"index {target['preimageGitBlobSha1'][:7]}..{target['postimageGitBlobSha1'][:7]} 100644")
            from_name = f"a/{path}"
        else:
            sections.append("new file mode 100644")
            sections.append(f"index 0000000..{target['postimageGitBlobSha1'][:7]}")
            from_name = "/dev/null"
        sections.extend(difflib.unified_diff(old_lines, new_lines, fromfile=from_name, tofile=f"b/{path}", n=3, lineterm=""))
    return ("\n".join(sections) + "\n").encode("utf-8")


def build_bundle(bound: dict[str, Any]) -> tuple[dict[str, bytes], dict[str, Any], dict[str, Any]]:
    patch = create_repository_patch(bound["targets"])
    target_rows = []
    payload_files: dict[str, bytes] = {"repository.patch": patch}
    for target in bound["targets"]:
        path = target["targetPath"]
        post = target["postimageBytes"]
        payload_files[path] = post
        target_rows.append({
            "targetPath": path,
            "preimage": {"present": bool(target["preimageBytes"]), "bytes": len(target["preimageBytes"]), "sha256": target["preimageSha256"], "gitBlobSha1": target["preimageGitBlobSha1"]},
            "postimage": {"bytes": len(post), "sha256": target["postimageSha256"], "gitBlobSha1": target["postimageGitBlobSha1"]},
            "appendBytes": target["appendBytes"],
            "bundleRelativePath": path,
            "appendOnly": True,
        })
    manifest: dict[str, Any] = {
        "schema": MANIFEST_SCHEMA,
        "componentId": COMPONENT_ID,
        "status": SUCCESS_STATUS,
        "nextAuthorityHold": NEXT_HOLD,
        "upstream": {
            "componentId": UPSTREAM_COMPONENT_ID,
            "materializationStatus": UPSTREAM_STATUS,
            "materializationNextAuthorityHold": UPSTREAM_HOLD,
            "materializationReceiptFileSha256": bound["receiptFileSha256"],
            "materializationReceiptSha256": bound["receiptSha256"],
            "materializationValidationFileSha256": bound["validationFileSha256"],
        },
        "repository": {"fullName": bound["authority"]["repository"], "baseCommit": bound["authority"]["baseCommit"], "featureBranch": bound["authority"]["featureBranch"]},
        "bundleAuthority": {
            "authorizedActor": bound["authority"]["authorizedActor"],
            "authorizationAuthor": bound["authority"]["authorizationAuthor"],
            "authorizedAt": bound["authority"]["authorizedAt"],
            "authorizationSha256": bound["authority"]["authorizationSha256"],
            "machineGenerated": False,
        },
        "targets": target_rows,
        "patch": {"path": "repository.patch", "bytes": len(patch), "sha256": digest_bytes(patch)},
        "authorityBoundary": {
            "bundleSealingIsNotWorktreeApplication": True,
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
        "manifestSha256": SELF_DIGEST_MARKER,
    }
    manifest["manifestSha256"] = digest_object(manifest)
    manifest_raw = (json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
    payload_files["PATCH_MANIFEST.json"] = manifest_raw
    ledger_raw = ("\n".join(f"{digest_bytes(raw)}  {path}" for path, raw in sorted(payload_files.items())) + "\n").encode("ascii")
    payload_files["BUNDLE.SHA256SUMS"] = ledger_raw
    receipt: dict[str, Any] = {
        "schema": RECEIPT_SCHEMA,
        "componentId": COMPONENT_ID,
        "status": SUCCESS_STATUS,
        "nextAuthorityHold": NEXT_HOLD,
        "materializationReceiptFileSha256": bound["receiptFileSha256"],
        "materializationReceiptSha256": bound["receiptSha256"],
        "materializationValidationFileSha256": bound["validationFileSha256"],
        "bundleAuthorizationFileSha256": digest_bytes(bound["authorizationRaw"]),
        "bundleAuthorizationSha256": bound["authority"]["authorizationSha256"],
        "patchManifestSha256": manifest["manifestSha256"],
        "patchManifestFileSha256": digest_bytes(manifest_raw),
        "bundleChecksumLedgerSha256": digest_bytes(ledger_raw),
        "repository": manifest["repository"],
        "targets": [{"targetPath": row["targetPath"], "preimageSha256": row["preimage"]["sha256"], "postimageSha256": row["postimage"]["sha256"]} for row in target_rows],
        "bundleFiles": list(BUNDLE_FILES),
        "authorityBoundary": manifest["authorityBoundary"],
        "selfDigestMethod": SELF_DIGEST_MARKER,
        "receiptSha256": SELF_DIGEST_MARKER,
    }
    receipt["receiptSha256"] = digest_object(receipt)
    return payload_files, manifest, receipt


def write_exclusive(path: Path, raw: bytes) -> None:
    if path.exists() or path.is_symlink():
        raise Refusal(f"output already exists: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
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


def materialize_bundle(output_dir: Path, receipt_output: Path, files: dict[str, bytes], receipt: dict[str, Any]) -> None:
    output = ensure_isolated_empty_directory(output_dir)
    receipt_resolved = receipt_output.resolve(strict=False)
    if receipt_resolved == output or output in receipt_resolved.parents:
        raise Refusal("receipt output must remain outside the bundle directory")
    if receipt_output.exists() or receipt_output.is_symlink():
        raise Refusal("receipt output already exists")
    stage = output / f".stage-{os.getpid()}"
    written: list[Path] = []
    try:
        stage.mkdir(mode=0o700)
        for relative, raw in files.items():
            pure = PurePosixPath(relative)
            if pure.is_absolute() or ".." in pure.parts or "\\" in relative:
                raise Refusal(f"unsafe bundle path: {relative}")
            target = stage / Path(*pure.parts)
            write_exclusive(target, raw)
            if require_regular_file(target, f"staged bundle file {relative}") != raw:
                raise Refusal(f"staged bundle verification failed: {relative}")
        for child in sorted(stage.iterdir(), key=lambda path: path.name):
            destination = output / child.name
            os.replace(child, destination)
            written.append(destination)
        stage.rmdir()
        receipt_raw = (json.dumps(receipt, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
        write_exclusive(receipt_output, receipt_raw)
        written.append(receipt_output)
    except Exception:
        if stage.exists():
            shutil.rmtree(stage, ignore_errors=True)
        for path in reversed(written):
            try:
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            except FileNotFoundError:
                pass
        raise


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--materialization-receipt", required=True)
    parser.add_argument("--materialization-validation", required=True)
    parser.add_argument("--materialized-root", required=True)
    parser.add_argument("--canon-preimage", required=True)
    parser.add_argument("--graph-preimage", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--receipt-output", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    try:
        bound = bind_inputs(
            Path(args.materialization_receipt), Path(args.materialization_validation), Path(args.materialized_root),
            {TARGETS[0]: Path(args.canon_preimage), TARGETS[1]: Path(args.graph_preimage)},
            Path(args.authorization), args.actor,
        )
        files, _manifest, receipt = build_bundle(bound)
        materialize_bundle(Path(args.output_dir), Path(args.receipt_output), files, receipt)
    except Refusal as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-local-feature-patch-bundle-refusal/1",
            "status": "REFUSE_LOCAL_FEATURE_PATCH_BUNDLE_NOT_SEALED",
            "reason": str(exc),
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
