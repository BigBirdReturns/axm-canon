#!/usr/bin/env python3
"""Independently validate one adapted AGOT commit-object receipt."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
import adapt_receipt as adapter


def result(status: str, detail: str, passed: bool) -> dict[str, object]:
    return {
        "schema": "axm-asoiaf-agot-commit-object-receipt-adapter-validation/1",
        "componentId": adapter.COMPONENT,
        "status": status,
        "detail": detail,
        "passed": passed,
        "worktreeReleased": False,
        "referenceUpdated": False,
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
    parser.add_argument("--repo", required=True)
    parser.add_argument("--source-receipt", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--adapted-receipt", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    try:
        repo = Path(args.repo).resolve()
        source, source_raw = adapter.load_object(Path(args.source_receipt), "source receipt")
        authorization, _ = adapter.load_object(Path(args.authorization), "authorization")
        observed, observed_raw = adapter.load_object(Path(args.adapted_receipt), "adapted receipt")
        state = adapter.validate_source(repo, source, source_raw)
        authority = adapter.validate_authorization(authorization, state, args.actor)
        expected = adapter.build_receipt(state, authority)
        if observed != expected:
            raise adapter.Refusal("REFUSE_ADAPTED_RECEIPT", "object differs from exact reconstruction")
        expected_raw = (json.dumps(expected, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
        if observed_raw != expected_raw:
            raise adapter.Refusal("REFUSE_ADAPTED_RECEIPT", "serialized bytes differ from canonical receipt")
    except adapter.Refusal as exc:
        print(json.dumps(result("REFUSE_ADAPTED_RECEIPT_INVALID", f"{exc.status}: {exc.detail}", False), indent=2, sort_keys=True))
        return 3
    except Exception as exc:
        print(json.dumps(result("REFUSE_ADAPTED_RECEIPT_INVALID", f"{type(exc).__name__}: {exc}", False), indent=2, sort_keys=True))
        return 4
    print(json.dumps(result("PASS_ADAPTED_COMMIT_OBJECT_RECEIPT_VALID_FOR_SEPARATE_WORKTREE_RELEASE", "exact reconstruction matched", True), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
