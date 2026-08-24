#!/usr/bin/env python3
"""Validate one AGOT end-to-end authority-continuity receipt independently."""
from __future__ import annotations

import argparse
import hashlib
import json
import stat
from pathlib import Path
from typing import Any, Sequence

RECEIPT_SCHEMA = "axm-asoiaf-agot-end-to-end-authority-continuity-receipt/1"
COMPONENT_ID = "asoiaf-agot-end-to-end-authority-continuity-auditor-v1"
SUCCESS_STATUS = "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD"
NEXT_HOLD = "FIRST_REAL_NAMED_HUMAN_TRANSACTION_WITHHELD"
SELF_DIGEST_MARKER = "SELF_DIGESTED_OUTPUT"
EXPECTED_COMPONENTS = [
    "asoiaf-agot-local-human-review-workstation-v1",
    "asoiaf-agot-named-human-disposition-recorder-v1",
    "asoiaf-agot-local-feature-materialization-request-v1",
    "asoiaf-agot-local-feature-postimage-materializer-v1",
    "asoiaf-agot-local-postimage-patch-bundle-sealer-v1",
    "asoiaf-agot-repository-patch-worktree-executor-v1",
    "asoiaf-agot-named-human-worktree-diff-review-recorder-v1",
    "asoiaf-agot-local-feature-commit-object-sealer-v1",
    "asoiaf-agot-feature-reference-updater-v1",
    "asoiaf-agot-remote-feature-push-operator-v1",
    "asoiaf-agot-draft-pr-request-packet-v1",
    "asoiaf-agot-draft-pr-creator-v1",
    "asoiaf-agot-draft-pr-readiness-operator-v1",
    "asoiaf-agot-pr-merge-request-packet-v1",
    "asoiaf-agot-pull-request-merge-executor-v1",
    "asoiaf-agot-post-merge-admission-verifier-v1",
]


class Refusal(RuntimeError):
    """Fail-closed validation refusal."""


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def strict_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Refusal(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load(path: Path) -> dict[str, Any]:
    try:
        info = path.lstat()
    except FileNotFoundError as exc:
        raise Refusal("receipt missing") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise Refusal("receipt must be a regular non-symlink file")
    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=strict_pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise Refusal("receipt is not strict UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise Refusal("receipt must be a JSON object")
    return value


def verify(value: dict[str, Any]) -> dict[str, Any]:
    if value.get("schema") != RECEIPT_SCHEMA:
        raise Refusal("receipt schema mismatch")
    if value.get("componentId") != COMPONENT_ID:
        raise Refusal("component identity mismatch")
    if value.get("status") != SUCCESS_STATUS or value.get("nextAuthorityHold") != NEXT_HOLD:
        raise Refusal("receipt status or next hold mismatch")
    observed = value.get("receiptSha256")
    if not isinstance(observed, str) or len(observed) != 64:
        raise Refusal("receipt digest malformed")
    candidate = json.loads(json.dumps(value))
    candidate["receiptSha256"] = SELF_DIGEST_MARKER
    if digest(candidate) != observed:
        raise Refusal("receipt self-digest mismatch")

    repository = value.get("repository")
    if not isinstance(repository, dict):
        raise Refusal("repository binding missing")
    for field in ("headCommit", "headTree"):
        token = repository.get(field)
        if not isinstance(token, str) or len(token) != 40:
            raise Refusal(f"repository {field} malformed")
    if repository.get("workingStateChangedByAudit") is not False:
        raise Refusal("audit changed repository working state")

    lane = value.get("lane")
    if not isinstance(lane, dict) or lane.get("stepCount") != len(EXPECTED_COMPONENTS):
        raise Refusal("lane census mismatch")
    steps = lane.get("steps")
    if not isinstance(steps, list) or len(steps) != len(EXPECTED_COMPONENTS):
        raise Refusal("lane steps missing")
    identities = [step.get("componentId") if isinstance(step, dict) else None for step in steps]
    if identities != EXPECTED_COMPONENTS:
        raise Refusal("ordered component identity mismatch")
    if [step.get("ordinal") for step in steps] != list(range(1, 17)):
        raise Refusal("lane ordinal mismatch")
    if any(step.get("privateSourceTextRead") is not False for step in steps):
        raise Refusal("private source read boundary changed")
    if any(step.get("privatePayloadRead") is not False for step in steps):
        raise Refusal("private payload read boundary changed")
    if any(step.get("componentRuntimeExecuted") is not False for step in steps):
        raise Refusal("component runtime execution boundary changed")
    for field in ("orderedComponentsSha256", "orderedStatusBoundariesSha256", "orderedAuthorityHoldsSha256"):
        token = lane.get(field)
        if not isinstance(token, str) or len(token) != 64:
            raise Refusal(f"lane digest malformed: {field}")
    if digest(identities) != lane["orderedComponentsSha256"]:
        raise Refusal("ordered component digest mismatch")
    if digest([step["matchedStatus"] for step in steps]) != lane["orderedStatusBoundariesSha256"]:
        raise Refusal("ordered status digest mismatch")
    if digest([step["matchedNextAuthorityHold"] for step in steps]) != lane["orderedAuthorityHoldsSha256"]:
        raise Refusal("ordered hold digest mismatch")

    census = value.get("substantiveCensus")
    if not isinstance(census, dict) or any(item != 0 for item in census.values()):
        raise Refusal("substantive census is not zero")
    boundary = value.get("authorityBoundary")
    if not isinstance(boundary, dict):
        raise Refusal("authority boundary missing")
    for key, expected in {
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
    }.items():
        if boundary.get(key) != expected:
            raise Refusal(f"authority boundary mismatch: {key}")
    return {
        "schema": "axm-asoiaf-agot-end-to-end-authority-continuity-validation/1",
        "status": "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_RECEIPT_VALID",
        "stepCount": len(steps),
        "receiptSha256": observed,
        "repositoryFilesWrittenByRuntime": 0,
        "worktreesModifiedByRuntime": 0,
        "liveIndexesModifiedByRuntime": 0,
        "commitsCreatedByRuntime": 0,
        "referencesUpdatedByRuntime": 0,
        "remotePushesByRuntime": 0,
        "pullRequestsOpenedByRuntime": 0,
        "canonEffect": "none",
        "graphEffect": "none",
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args(argv)
    try:
        result = verify(load(Path(args.receipt)))
    except Refusal as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-end-to-end-authority-continuity-validation-refusal/1",
            "status": "REFUSE_AGOT_END_TO_END_AUTHORITY_CONTINUITY_RECEIPT_INVALID",
            "reason": str(exc),
            "canonEffect": "none",
            "graphEffect": "none",
        }, indent=2, sort_keys=True))
        return 3
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
