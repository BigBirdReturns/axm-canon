#!/usr/bin/env python3
"""Independently validate one sealed AGOT commit-object authorization."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))

from seal_authorization import (
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
    parser.add_argument("--diff-review-authorization", required=True)
    parser.add_argument("--review-receipt", required=True)
    parser.add_argument("--review-validation", required=True)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
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
        expected_authorization = build_authorization(bound)
        expected_receipt = build_receipt(bound, expected_authorization)

        authorization, authorization_raw = load_object(Path(args.authorization), "commit-object authorization")
        if authorization.get("schema") != AUTHORIZATION_SCHEMA:
            raise Refusal("REFUSE_COMMIT_AUTHORIZATION", "authorization schema mismatch")
        verify_self_digest(authorization, "authorizationSha256", "commit-object authorization")
        if authorization_raw != serialize(expected_authorization):
            raise Refusal("REFUSE_COMMIT_AUTHORIZATION", "authorization bytes differ from exact reconstruction")

        receipt, receipt_raw = load_object(Path(args.receipt), "authorization receipt")
        if receipt.get("schema") != RECEIPT_SCHEMA:
            raise Refusal("REFUSE_AUTHORIZATION_RECEIPT", "receipt schema mismatch")
        verify_self_digest(receipt, "receiptSha256", "authorization receipt")
        if receipt_raw != serialize(expected_receipt):
            raise Refusal("REFUSE_AUTHORIZATION_RECEIPT", "receipt bytes differ from exact reconstruction")

        output = {
            "schema": "axm-asoiaf-agot-local-commit-object-authorization-validation/1",
            "status": "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_VALID_FOR_SEPARATE_OBJECT_SEALER",
            "passed": True,
            "authorizationSha256": authorization["authorizationSha256"],
            "receiptSha256": receipt["receiptSha256"],
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
            "schema": "axm-asoiaf-agot-local-commit-object-authorization-validation/1",
            "status": "REFUSE_LOCAL_COMMIT_OBJECT_AUTHORIZATION_INVALID",
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
