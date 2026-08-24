#!/usr/bin/env python3
"""Independently validate one AGOT worktree diff-review record against exact inputs."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))

from record_diff_review import (
    AUTHORIZATION_SCHEMA,
    RECEIPT_SCHEMA,
    Refusal,
    build_authorization,
    build_receipt,
    load_object,
    serialize,
    validate_inputs,
    verify_self_digest,
)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--worktree-receipt", required=True)
    parser.add_argument("--worktree-authorization", required=True)
    parser.add_argument("--review", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    try:
        worktree_receipt, worktree_receipt_raw = load_object(Path(args.worktree_receipt), "worktree receipt")
        worktree_authorization, worktree_authorization_raw = load_object(
            Path(args.worktree_authorization),
            "worktree authorization",
        )
        review, review_raw = load_object(Path(args.review), "human review")
        bound = validate_inputs(
            Path(args.repo),
            worktree_receipt,
            worktree_receipt_raw,
            worktree_authorization,
            worktree_authorization_raw,
            review,
            review_raw,
            args.actor,
        )
        expected_authorization = build_authorization(bound)
        expected_receipt = build_receipt(bound, expected_authorization)
        receipt, receipt_raw = load_object(Path(args.receipt), "review receipt")
        if receipt.get("schema") != RECEIPT_SCHEMA:
            raise Refusal("REFUSE_REVIEW_RECEIPT", "receipt schema mismatch")
        verify_self_digest(receipt, "receiptSha256", "review receipt")
        if receipt_raw != serialize(expected_receipt):
            raise Refusal("REFUSE_REVIEW_RECEIPT", "receipt bytes differ from exact reconstruction")

        authorization_path = Path(args.authorization)
        if expected_authorization is None:
            if authorization_path.exists() or authorization_path.is_symlink():
                raise Refusal("REFUSE_DIFF_REVIEW_AUTHORIZATION", "non-approval decision emitted authorization")
            authorization_sha = None
        else:
            authorization, authorization_raw = load_object(authorization_path, "diff-review authorization")
            if authorization.get("schema") != AUTHORIZATION_SCHEMA:
                raise Refusal("REFUSE_DIFF_REVIEW_AUTHORIZATION", "authorization schema mismatch")
            verify_self_digest(authorization, "authorizationSha256", "diff-review authorization")
            if authorization_raw != serialize(expected_authorization):
                raise Refusal("REFUSE_DIFF_REVIEW_AUTHORIZATION", "authorization bytes differ from exact reconstruction")
            authorization_sha = authorization["authorizationSha256"]

        output = {
            "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-validation/1",
            "status": "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR",
            "passed": True,
            "decision": bound["decision"],
            "nextAuthorityHold": bound["nextAuthorityHold"],
            "receiptSha256": receipt["receiptSha256"],
            "diffReviewAuthorizationSha256": authorization_sha,
            "repositoryFilesWrittenByValidator": 0,
            "worktreeBytesModifiedByValidator": 0,
            "liveIndexModifiedByValidator": 0,
            "commitObjectsCreatedByValidator": 0,
            "referencesUpdatedByValidator": 0,
            "remotePushesByValidator": 0,
            "pullRequestsOpenedByValidator": 0,
            "canonEffect": "none",
            "graphEffect": "none",
        }
        print(json.dumps(output, indent=2, sort_keys=True))
        return 0
    except Refusal as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-validation/1",
            "status": "REFUSE_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_INVALID",
            "passed": False,
            "detail": exc.detail,
            "repositoryFilesWrittenByValidator": 0,
            "worktreeBytesModifiedByValidator": 0,
            "liveIndexModifiedByValidator": 0,
            "commitObjectsCreatedByValidator": 0,
            "referencesUpdatedByValidator": 0,
            "remotePushesByValidator": 0,
            "pullRequestsOpenedByValidator": 0,
            "canonEffect": "none",
            "graphEffect": "none",
        }, indent=2, sort_keys=True))
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
