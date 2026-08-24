#!/usr/bin/env python3
"""Independently reconstruct and validate one AGOT local-feature patch bundle."""
from __future__ import annotations

import argparse
import json
import stat
from pathlib import Path, PurePosixPath
from typing import Any, Sequence

from seal_patch_bundle import (
    BUNDLE_FILES,
    COMPONENT_ID,
    FORBIDDEN_KEYS,
    NEXT_HOLD,
    Refusal,
    SUCCESS_STATUS,
    TARGETS,
    bind_inputs,
    build_bundle,
    digest_bytes,
    load_object,
    require_regular_file,
    verify_known_self_digest,
    walk_keys,
)

VALIDATION_SCHEMA = "axm-asoiaf-agot-local-feature-patch-bundle-validation/1"
VALIDATION_STATUS = "PASS_LOCAL_FEATURE_PATCH_BUNDLE_VALID_FOR_SEPARATE_COMPATIBILITY_EXECUTOR"


def validate_actual_bundle(bundle_dir: Path, expected: dict[str, bytes]) -> dict[str, Any]:
    try:
        info = bundle_dir.lstat()
    except FileNotFoundError as exc:
        raise Refusal("bundle directory missing") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise Refusal("bundle directory must be a real directory")
    observed_paths: list[str] = []
    for path in sorted(bundle_dir.rglob("*")):
        if path.is_symlink():
            raise Refusal("bundle symlink refused")
        if path.is_file():
            observed_paths.append(path.relative_to(bundle_dir).as_posix())
    if observed_paths != sorted(BUNDLE_FILES):
        raise Refusal("bundle file census mismatch")
    results = []
    for relative in sorted(BUNDLE_FILES):
        pure = PurePosixPath(relative)
        raw = require_regular_file(bundle_dir / Path(*pure.parts), f"bundle file {relative}")
        expected_raw = expected[relative]
        if raw != expected_raw:
            raise Refusal(f"bundle byte mismatch: {relative}")
        results.append({"path": relative, "bytes": len(raw), "sha256": digest_bytes(raw)})
    return {"files": results}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--materialization-receipt", required=True)
    parser.add_argument("--materialization-validation", required=True)
    parser.add_argument("--materialized-root", required=True)
    parser.add_argument("--canon-preimage", required=True)
    parser.add_argument("--graph-preimage", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--bundle-dir", required=True)
    parser.add_argument("--bundle-receipt", required=True)
    parser.add_argument("--actor", required=True)
    args = parser.parse_args(argv)
    try:
        bound = bind_inputs(
            Path(args.materialization_receipt),
            Path(args.materialization_validation),
            Path(args.materialized_root),
            {TARGETS[0]: Path(args.canon_preimage), TARGETS[1]: Path(args.graph_preimage)},
            Path(args.authorization),
            args.actor,
        )
        expected_files, _manifest, expected_receipt = build_bundle(bound)
        bundle_result = validate_actual_bundle(Path(args.bundle_dir), expected_files)
        observed_receipt, observed_receipt_raw = load_object(Path(args.bundle_receipt), "bundle receipt")
        verify_known_self_digest(observed_receipt, "receiptSha256", "bundle receipt")
        if observed_receipt != expected_receipt:
            raise Refusal("bundle receipt semantic mismatch")
        if FORBIDDEN_KEYS.intersection(walk_keys(observed_receipt)):
            raise Refusal("bundle receipt contains private source or payload field")
        if observed_receipt.get("status") != SUCCESS_STATUS or observed_receipt.get("nextAuthorityHold") != NEXT_HOLD:
            raise Refusal("bundle receipt standing mismatch")
        validation = {
            "schema": VALIDATION_SCHEMA,
            "componentId": COMPONENT_ID,
            "status": VALIDATION_STATUS,
            "validatedBundleReceiptFileSha256": digest_bytes(observed_receipt_raw),
            "validatedBundleReceiptSha256": observed_receipt["receiptSha256"],
            "validatedPatchManifestSha256": observed_receipt["patchManifestSha256"],
            "validatedBundleChecksumLedgerSha256": observed_receipt["bundleChecksumLedgerSha256"],
            "repository": observed_receipt["repository"],
            "targets": observed_receipt["targets"],
            "files": bundle_result["files"],
            "validatorExecutedWorktreeApplication": False,
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
        }
    except Refusal as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-local-feature-patch-bundle-validation-refusal/1",
            "status": "REFUSE_LOCAL_FEATURE_PATCH_BUNDLE_INVALID",
            "reason": str(exc),
            "validatorExecutedWorktreeApplication": False,
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
    print(json.dumps(validation, indent=2, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
