#!/usr/bin/env python3
"""Independently validate one sealed AGOT local-feature materialization request."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import stat
from pathlib import Path
from typing import Any, Iterable, Sequence

COMPONENT_ID = "asoiaf-agot-local-feature-materialization-request-v1"
REQUEST_SCHEMA = "axm-asoiaf-agot-local-feature-materialization-request/1"
SELF_DIGEST_MARKER = "SELF_DIGESTED_OUTPUT"
PASS_STATUS = "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD"
VALID_STATUS = "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_VALID_FOR_SEPARATE_EXECUTOR"
NEXT_HOLD = "LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_WITHHELD"
REPOSITORY = "BigBirdReturns/axm-canon"
BASE_BRANCH = "main"
CANON_PATH = "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson"
GRAPH_PATH = "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson"
MAX_PREIMAGE_BYTES = 16 * 1024 * 1024
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")
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
    """Fail-closed validation refusal."""


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
        raise Refusal(f"{label} must be regular file")
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
        raise Refusal(f"{label} must be object")
    return value, raw


def require_hex64(value: Any, label: str) -> str:
    text = str(value or "")
    if not HEX64.fullmatch(text):
        raise Refusal(f"{label} invalid")
    return text


def verify_request_digest(value: dict[str, Any]) -> str:
    observed = require_hex64(value.get("requestSha256"), "request self-digest")
    if value.get("selfDigestMethod") != SELF_DIGEST_MARKER:
        raise Refusal("request self-digest method mismatch")
    candidate = copy.deepcopy(value)
    candidate["requestSha256"] = SELF_DIGEST_MARKER
    if digest_object(candidate) != observed:
        raise Refusal("request self-digest mismatch")
    return observed


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
        raise Refusal(f"{label} is not UTF-8") from exc
    for index, line in enumerate(text.splitlines(), start=1):
        if not line:
            raise Refusal(f"{label} blank line")
        try:
            value = json.loads(line, object_pairs_hook=strict_pairs)
        except json.JSONDecodeError as exc:
            raise Refusal(f"{label} invalid JSON line {index}") from exc
        if not isinstance(value, dict):
            raise Refusal(f"{label} line {index} is not object")


def resolve_preimage(descriptor: dict[str, Any], path_text: str | None, label: str) -> bytes:
    state = descriptor.get("preimageState")
    if state == "ABSENT":
        if path_text is not None:
            raise Refusal(f"{label} supplied for absent preimage")
        if descriptor.get("preimageBytes") != 0 or descriptor.get("preimageSha256") not in (None, ""):
            raise Refusal(f"{label} absent preimage descriptor inconsistent")
        return b""
    if state != "PRESENT":
        raise Refusal(f"{label} preimage state invalid")
    if path_text is None:
        raise Refusal(f"{label} preimage path required")
    raw = require_regular_file(Path(path_text), label, maximum=MAX_PREIMAGE_BYTES)
    validate_ndjson(raw, label)
    if len(raw) != descriptor.get("preimageBytes"):
        raise Refusal(f"{label} preimage byte count mismatch")
    if digest_bytes(raw) != require_hex64(descriptor.get("preimageSha256"), f"{label} preimage digest"):
        raise Refusal(f"{label} preimage digest mismatch")
    return raw


def validate_descriptor(
    descriptor: Any,
    path: str,
    preimage_path: str | None,
    label: str,
) -> tuple[bytes, dict[str, Any], str, str]:
    if not isinstance(descriptor, dict) or descriptor.get("path") != path:
        raise Refusal(f"{label} target path mismatch")
    preimage = resolve_preimage(descriptor, preimage_path, label)
    row = descriptor.get("appendRow")
    if not isinstance(row, dict):
        raise Refusal(f"{label} append row missing")
    append = canonical(row) + b"\n"
    if descriptor.get("appendBytes") != len(append):
        raise Refusal(f"{label} append byte count mismatch")
    append_sha = require_hex64(descriptor.get("appendSha256"), f"{label} append digest")
    if digest_bytes(append) != append_sha:
        raise Refusal(f"{label} append digest mismatch")
    postimage = preimage + append
    if descriptor.get("postimageBytes") != len(postimage):
        raise Refusal(f"{label} postimage byte count mismatch")
    postimage_sha = require_hex64(descriptor.get("postimageSha256"), f"{label} postimage digest")
    if digest_bytes(postimage) != postimage_sha:
        raise Refusal(f"{label} postimage digest mismatch")
    return preimage, row, append_sha, postimage_sha


def validate_request(value: dict[str, Any], raw: bytes, canon_path: str | None, graph_path: str | None) -> dict[str, Any]:
    if value.get("schema") != REQUEST_SCHEMA or value.get("componentId") != COMPONENT_ID:
        raise Refusal("request schema or component mismatch")
    if value.get("status") != PASS_STATUS or value.get("nextAuthorityHold") != NEXT_HOLD:
        raise Refusal("request standing mismatch")
    if FORBIDDEN_KEYS.intersection(walk_keys(value)):
        raise Refusal("private source or payload field refused")
    request_sha = verify_request_digest(value)
    candidate_id = str(value.get("candidateId") or "")
    if len(candidate_id) < 3:
        raise Refusal("candidateId missing")

    exact = value.get("exactBindings")
    if not isinstance(exact, dict):
        raise Refusal("exact bindings missing")
    for field in (
        "dispositionReceiptSha256",
        "dispositionReceiptFileSha256",
        "materializationPlanSha256",
        "materializationPlanFileSha256",
        "sourceParagraphSha256",
        "admittedPropositionSha256",
    ):
        require_hex64(exact.get(field), field)

    target = value.get("repositoryTarget")
    if not isinstance(target, dict):
        raise Refusal("repository target missing")
    if target.get("repository") != REPOSITORY or target.get("baseBranch") != BASE_BRANCH:
        raise Refusal("repository target identity mismatch")
    base_commit = str(target.get("expectedBaseCommit") or "")
    if not HEX40.fullmatch(base_commit):
        raise Refusal("expected base commit invalid")
    feature_branch = str(target.get("featureBranch") or "")
    if not FEATURE_BRANCH.fullmatch(feature_branch) or ".." in feature_branch or "//" in feature_branch:
        raise Refusal("feature branch invalid")
    if target.get("targetPaths") != [CANON_PATH, GRAPH_PATH]:
        raise Refusal("target path set mismatch")

    proposed = value.get("proposedPostimages")
    if not isinstance(proposed, dict) or set(proposed) != {"canon", "graph"}:
        raise Refusal("proposed postimages must contain canon and graph only")
    _, canon_row, canon_append_sha, canon_post_sha = validate_descriptor(
        proposed["canon"], CANON_PATH, canon_path, "canon"
    )
    _, graph_row, graph_append_sha, graph_post_sha = validate_descriptor(
        proposed["graph"], GRAPH_PATH, graph_path, "graph"
    )

    proposition = str(canon_row.get("proposition") or "")
    proposition_sha = require_hex64(canon_row.get("propositionSha256"), "canon proposition digest")
    if digest_bytes(proposition.encode("utf-8")) != proposition_sha:
        raise Refusal("canon proposition digest mismatch")
    if proposition_sha != exact["admittedPropositionSha256"]:
        raise Refusal("canon row proposition is not exact admitted proposition")
    if canon_row.get("candidateId") != candidate_id or graph_row.get("candidateId") != candidate_id:
        raise Refusal("append row candidate identity mismatch")
    if canon_row.get("sourceParagraphSha256") != exact["sourceParagraphSha256"]:
        raise Refusal("canon row source binding mismatch")
    proposition_node = graph_row.get("propositionNode")
    source_node = graph_row.get("sourceEvidenceNode")
    if not isinstance(proposition_node, dict) or proposition_node.get("sha256") != proposition_sha:
        raise Refusal("graph proposition node mismatch")
    if not isinstance(source_node, dict) or source_node.get("sha256") != exact["sourceParagraphSha256"]:
        raise Refusal("graph source node mismatch")
    if canon_row.get("dispositionReceiptSha256") != exact["dispositionReceiptSha256"]:
        raise Refusal("canon row disposition binding mismatch")
    if graph_row.get("dispositionReceiptSha256") != exact["dispositionReceiptSha256"]:
        raise Refusal("graph row disposition binding mismatch")
    for row in (canon_row, graph_row):
        if row.get("standing") != "PROPOSED_LOCAL_FEATURE_MATERIALIZATION":
            raise Refusal("append row standing mismatch")
        if row.get("repositoryEffect") != "none" or row.get("canonEffect") != "none" or row.get("graphEffect") != "none":
            raise Refusal("append row authority boundary changed")

    boundary = value.get("authorityBoundary")
    expected_boundary = {
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
    }
    if not isinstance(boundary, dict) or any(boundary.get(k) != v for k, v in expected_boundary.items()):
        raise Refusal("request authority boundary changed")

    seed = {
        "candidateId": candidate_id,
        "receiptFileSha256": exact["dispositionReceiptFileSha256"],
        "planFileSha256": exact["materializationPlanFileSha256"],
        "repository": REPOSITORY,
        "expectedBaseCommit": base_commit,
        "featureBranch": feature_branch,
        "canonAppendSha256": canon_append_sha,
        "graphAppendSha256": graph_append_sha,
        "canonPostimageSha256": canon_post_sha,
        "graphPostimageSha256": graph_post_sha,
    }
    if value.get("requestId") != digest_object(seed):
        raise Refusal("request identity mismatch")

    return {
        "schema": "axm-asoiaf-agot-local-feature-materialization-request-validation/1",
        "status": VALID_STATUS,
        "requestId": value["requestId"],
        "requestSha256": request_sha,
        "requestFileSha256": digest_bytes(raw),
        "candidateId": candidate_id,
        "validatedTargetPaths": [CANON_PATH, GRAPH_PATH],
        "postimageFilesWrittenByValidator": 0,
        "repositoryFilesWrittenByValidator": 0,
        "worktreesModifiedByValidator": 0,
        "commitsCreatedByValidator": 0,
        "referencesUpdatedByValidator": 0,
        "remotePushesByValidator": 0,
        "pullRequestsOpenedByValidator": 0,
        "canonEffect": "none",
        "graphEffect": "none",
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True)
    parser.add_argument("--canon-preimage")
    parser.add_argument("--graph-preimage")
    args = parser.parse_args(argv)
    try:
        value, raw = load_object(Path(args.request), "request")
        result = validate_request(value, raw, args.canon_preimage, args.graph_preimage)
    except Refusal as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-local-feature-materialization-request-validation/1",
            "status": "REFUSE_INVALID_LOCAL_FEATURE_MATERIALIZATION_REQUEST",
            "reason": str(exc),
            "postimageFilesWrittenByValidator": 0,
            "repositoryFilesWrittenByValidator": 0,
            "worktreesModifiedByValidator": 0,
            "commitsCreatedByValidator": 0,
            "referencesUpdatedByValidator": 0,
            "remotePushesByValidator": 0,
            "pullRequestsOpenedByValidator": 0,
            "canonEffect": "none",
            "graphEffect": "none",
        }, indent=2, sort_keys=True))
        return 3
    print(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
