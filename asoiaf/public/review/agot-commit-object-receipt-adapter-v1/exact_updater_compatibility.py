#!/usr/bin/env python3
"""Prove exact compatibility with the admitted feature-reference updater without updating a reference."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Sequence

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import adapt_receipt as adapter
import synthetic_campaign as campaign

PYTHON = os.environ.get("PYTHON", "python")


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(args),
        cwd=cwd,
        env={**os.environ, "PYTHONSAFEPATH": "1", "PYTHONWARNINGS": "error"},
        text=True,
        capture_output=True,
        check=False,
    )


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True, check=True).stdout.strip()


def snapshot(repo: Path) -> dict[str, str]:
    return {
        "branchRef": git(repo, "rev-parse", "refs/heads/agent/fixture"),
        "head": git(repo, "rev-parse", "HEAD"),
        "symbolic": subprocess.run(["git", "-C", str(repo), "symbolic-ref", "--short", "HEAD"], text=True, capture_output=True).stdout.strip(),
        "cached": subprocess.run(["git", "-C", str(repo), "diff", "--cached", "--binary"], text=True, capture_output=True, check=True).stdout,
        "worktree": subprocess.run(["git", "-C", str(repo), "diff", "--binary"], text=True, capture_output=True, check=True).stdout,
        "refs": git(repo, "for-each-ref", "--sort=refname", "--format=%(refname) %(objectname)", "refs/heads"),
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--updater-root", required=True)
    args = parser.parse_args(argv)
    updater_root = Path(args.updater_root).resolve()
    updater = updater_root / "update_reference.py"
    if not updater.is_file():
        raise SystemExit("exact updater source missing")

    checks: list[str] = []
    with tempfile.TemporaryDirectory(prefix="adapter-updater-compat-") as td:
        root = Path(td)
        fx = campaign.fixture(root)
        adapted = root / "adapted.json"
        completed = campaign.execute(fx, adapted)
        assert completed.returncode == 0, completed.stderr + completed.stdout
        receipt = json.loads(adapted.read_text(encoding="utf-8"))
        checks.append("adapter-success")
        assert receipt["schema"] == "axm-asoiaf-agot-local-feature-commit-object-receipt/1"
        checks.append("updater-schema-exact")
        assert receipt["status"] == "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD"
        checks.append("updater-status-exact")

        authorization = {
            "schema": "axm-asoiaf-feature-reference-update-authorization/1",
            "decision": "update-local-feature-reference",
            "commitObjectReceiptSha256": receipt["commitObjectReceiptSha256"],
            "repositoryIdentity": receipt["repositoryIdentity"],
            "branch": receipt["branch"],
            "expectedOldCommit": receipt["baseCommit"],
            "newCommitObjectSha": receipt["commitObjectSha"],
            "referenceUpdateActor": "Reference Update Actor",
            "reason": "Attach the exact reviewed commit object after separate worktree release.",
            "nonce": "fixture-reference-update-001",
        }
        authorization["authorizationSha256"] = digest(authorization)
        auth_path = root / "reference-authorization.json"
        campaign.write_json(auth_path, authorization)
        checks.append("reference-authorization-sealed")

        before = snapshot(fx["repo"])
        checked_out_receipt = root / "checked-out-preflight.json"
        checked_out = run(
            PYTHON, "-W", "error", "-S", str(updater), "preflight",
            "--repo", str(fx["repo"]),
            "--commit-object-receipt", str(adapted),
            "--authorization", str(auth_path),
            "--receipt", str(checked_out_receipt),
        )
        assert checked_out.returncode == 3, checked_out.stderr + checked_out.stdout
        checked_out_result = json.loads(checked_out.stdout)
        assert checked_out_result["status"] == "REFUSE_CHECKED_OUT_BRANCH", checked_out_result
        checks.append("exact-updater-accepts-receipt-through-checked-out-boundary")
        assert not checked_out_receipt.exists()
        checks.append("checked-out-refusal-writes-no-receipt")
        assert snapshot(fx["repo"]) == before
        checks.append("checked-out-refusal-has-zero-local-effect")

        subprocess.run(["git", "-C", str(fx["repo"]), "checkout", "--detach", fx["base"]], text=True, capture_output=True, check=True)
        detached = snapshot(fx["repo"])
        assert detached["branchRef"] == before["branchRef"] == fx["base"]
        checks.append("detachment-does-not-move-feature-reference")
        assert detached["head"] == before["head"] == fx["base"]
        checks.append("detachment-keeps-head-object")
        assert detached["symbolic"] == ""
        checks.append("detachment-releases-branch-registration")
        assert detached["cached"] == before["cached"] == ""
        checks.append("detachment-keeps-live-index-clean")
        assert detached["worktree"] == before["worktree"]
        checks.append("detachment-keeps-reviewed-worktree-bytes")
        assert detached["refs"] == before["refs"]
        checks.append("detachment-keeps-all-head-references")

        preflight_path = root / "detached-preflight.json"
        preflight = run(
            PYTHON, "-W", "error", "-S", str(updater), "preflight",
            "--repo", str(fx["repo"]),
            "--commit-object-receipt", str(adapted),
            "--authorization", str(auth_path),
            "--receipt", str(preflight_path),
        )
        assert preflight.returncode == 0, preflight.stderr + preflight.stdout
        result = json.loads(preflight.stdout)
        assert result["status"] == "PASS_FEATURE_REFERENCE_READY_FOR_EXPLICIT_COMPARE_AND_SWAP", result
        checks.append("exact-updater-detached-preflight-passes")
        assert result["targetBranchCheckedOut"] is False
        checks.append("updater-observes-unchecked-out-target")
        assert result["branch"] == "agent/fixture"
        checks.append("updater-branch-binding")
        assert result["expectedOldCommit"] == fx["base"]
        checks.append("updater-old-value-binding")
        assert result["newCommitObjectSha"] == fx["commit"]
        checks.append("updater-new-object-binding")
        assert sorted(result["changedPaths"]) == sorted(adapter.TARGETS)
        checks.append("updater-two-path-binding")
        assert result["worktreeModified"] is False and result["liveIndexModified"] is False
        checks.append("updater-preflight-zero-worktree-index-effect")
        assert result["remotePushExecuted"] is False and result["pullRequestOpened"] is False
        checks.append("updater-preflight-zero-remote-pr-effect")
        assert result["canonEffect"] == "none" and result["graphEffect"] == "none"
        checks.append("updater-preflight-zero-canon-graph-effect")
        after = snapshot(fx["repo"])
        assert after == detached
        checks.append("detached-preflight-has-zero-local-effect")
        assert preflight_path.is_file()
        checks.append("detached-preflight-receipt-written-outside-repository")

    print(json.dumps({
        "schema": "axm-asoiaf-agot-commit-object-receipt-adapter-updater-compatibility/1",
        "componentId": adapter.COMPONENT,
        "status": "PASS",
        "passed": len(checks),
        "total": len(checks),
        "checks": checks,
        "sourceReceiptSchema": adapter.SOURCE_SCHEMA,
        "adaptedReceiptSchema": adapter.TARGET_SCHEMA,
        "checkedOutBoundary": "REFUSE_CHECKED_OUT_BRANCH",
        "detachedBoundary": "PASS_FEATURE_REFERENCE_READY_FOR_EXPLICIT_COMPARE_AND_SWAP",
        "realSourceReceiptsConsumed": 0,
        "realAdaptedReceiptsSealed": 0,
        "realWorktreeReleases": 0,
        "realReferenceUpdates": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "noncopyrightedFixtureOnly": True,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
