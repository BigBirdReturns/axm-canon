#!/usr/bin/env python3
"""Prove exact recorder-to-authorization-to-commit-sealer compatibility."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Sequence

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seal_authorization import PLAN_SCHEMA, TARGETS, digest_object, serialize

SEALER = Path(__file__).with_name("seal_authorization.py")
VALIDATOR = Path(__file__).with_name("validate_authorization.py")


def run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [*args],
        env={**os.environ, "PYTHONSAFEPATH": "1", "PYTHONWARNINGS": "error", **(env or {})},
        text=True,
        capture_output=True,
        shell=False,
    )


def git(repo: Path, *args: str, input_text: str | None = None) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        input=input_text,
        text=True,
        capture_output=True,
        shell=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr or completed.stdout)
    return completed.stdout.strip()


def self_digest(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = copy.deepcopy(value)
    result.pop(field, None)
    result[field] = digest_object(result)
    return result


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_bytes(serialize(value))


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def repository_identity(repo: Path) -> str:
    return git(repo, "config", "--get", "remote.origin.url")


def base_bytes(repo: Path, head: str, path: str) -> bytes:
    completed = subprocess.run(
        ["git", "-C", str(repo), "show", f"{head}:{path}"],
        capture_output=True,
        shell=False,
    )
    return completed.stdout if completed.returncode == 0 else b""


def change_set(repo: Path, head: str) -> tuple[str, list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    for relative in TARGETS:
        current = (repo / relative).read_bytes() if (repo / relative).is_file() else b""
        before = base_bytes(repo, head, relative)
        rows.append({
            "path": relative,
            "baseBytes": len(before),
            "baseSha256": sha(before),
            "currentBytes": len(current),
            "currentSha256": sha(current),
        })
    return digest_object(rows), rows


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-recorder", required=True)
    parser.add_argument("--commit-sealer", required=True)
    args = parser.parse_args(argv)
    review_recorder = Path(args.review_recorder).resolve()
    commit_sealer = Path(args.commit_sealer).resolve()
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, bool(condition)))

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-compat-") as temporary:
        root = Path(temporary)
        repo = root / "repo"
        repo.mkdir()
        git(repo, "init", "-q", "-b", "main")
        git(repo, "config", "user.name", "Compatibility Fixture")
        git(repo, "config", "user.email", "compatibility@example.test")
        git(repo, "remote", "add", "origin", "https://github.example.test/fixture/axm-canon.git")
        (repo / "README.md").write_text("compatibility fixture\n", encoding="utf-8")
        git(repo, "add", "README.md")
        git(repo, "commit", "-q", "-m", "compatibility base")
        head = git(repo, "rev-parse", "HEAD")
        branch = "feature/asoiaf-agot/commit-authorization-compatibility-001"
        git(repo, "switch", "-q", "-c", branch)
        repo_id = repository_identity(repo)

        canon = (json.dumps({"fixture": "commit-authorization", "kind": "canon"}, sort_keys=True) + "\n").encode()
        graph = (json.dumps({"fixture": "commit-authorization", "kind": "graph"}, sort_keys=True) + "\n").encode()
        for relative, raw in zip(TARGETS, (canon, graph)):
            target = repo / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        change_sha, change_rows = change_set(repo, head)
        patch_manifest_sha = "2" * 64

        apply_auth = self_digest({
            "schema": "axm-asoiaf-local-worktree-apply-authorization/1",
            "decision": "apply-to-local-feature-worktree",
            "patchManifestSha256": patch_manifest_sha,
            "targetBaseCommit": head,
            "targetBranch": branch,
            "repositoryIdentity": repo_id,
            "reason": "Apply exact compatibility fixture for named-human review.",
            "nonce": "compatibility-worktree-apply-001",
            "authorizedAt": "2026-08-24T03:00:00Z",
            "worktreeExecutorActor": "Alex Worktree Executor",
        }, "authorizationSha256")
        apply_auth_path = root / "worktree-authorization.json"
        write_json(apply_auth_path, apply_auth)

        worktree_receipt = {
            "schema": "axm-asoiaf-agot-local-worktree-patch-application/1",
            "componentId": "asoiaf-agot-repository-patch-worktree-executor-v1",
            "status": "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT",
            "repositoryIdentity": repo_id,
            "patchManifestSha256": patch_manifest_sha,
            "headCommitUnchanged": head,
            "branch": branch,
            "changedPaths": TARGETS,
            "gitDiffCheck": "PASS",
            "gitIndexModified": False,
            "gitCommitCreated": False,
            "localReferenceUpdated": False,
            "remotePushExecuted": False,
            "pullRequestOpened": False,
            "canonEffect": "none",
            "graphEffect": "none",
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
        }
        worktree_receipt["applicationReceiptSha256"] = digest_object(worktree_receipt)
        worktree_receipt_path = root / "worktree-receipt.json"
        write_json(worktree_receipt_path, worktree_receipt)

        review = self_digest({
            "schema": "axm-asoiaf-agot-named-human-worktree-diff-review/1",
            "worktreeApplicationReceiptSha256": worktree_receipt["applicationReceiptSha256"],
            "worktreeApplyAuthorizationSha256": apply_auth["authorizationSha256"],
            "patchManifestSha256": patch_manifest_sha,
            "repositoryIdentity": repo_id,
            "baseCommit": head,
            "branch": branch,
            "changedPaths": TARGETS,
            "changeSetSha256": change_sha,
            "diffReviewerActor": "Riley Diff Reviewer",
            "reviewedAt": "2026-08-24T04:00:00Z",
            "machineGenerated": False,
            "humanActionEvidence": "Reviewed both exact fixture diff hunks against the authorized worktree application.",
            "decision": "APPROVE_LOCAL_COMMIT_OBJECT",
            "reasonCodes": ["DOWNSTREAM_SCHEMA_MATCH", "EXACT_TWO_PATH_DIFF"],
            "reviewRationale": "The worktree contains only the two exact authorized fixture postimages and is ready for unreferenced commit-object authorization.",
            "nonce": "compatibility-diff-review-001",
            "repositoryEffectAuthorized": False,
            "canonEffect": "none",
            "graphEffect": "none",
        }, "reviewSha256")
        review_path = root / "human-review.json"
        write_json(review_path, review)

        review_outputs = root / "review-outputs"
        review_outputs.mkdir()
        diff_auth_path = review_outputs / "diff-review-authorization.json"
        review_receipt_path = review_outputs / "diff-review-receipt.json"
        recorded = run(
            sys.executable, "-W", "error", "-S", str(review_recorder / "record_diff_review.py"),
            "--repo", str(repo),
            "--worktree-receipt", str(worktree_receipt_path),
            "--worktree-authorization", str(apply_auth_path),
            "--review", str(review_path),
            "--authorization-output", str(diff_auth_path),
            "--receipt-output", str(review_receipt_path),
            "--actor", "Riley Diff Reviewer",
        )
        check("exact review recorder exit", recorded.returncode == 0)
        recorded_receipt = json.loads(recorded.stdout)
        check("exact review recorder status", recorded_receipt.get("status") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD")
        check("exact review recorder hold", recorded_receipt.get("nextAuthorityHold") == "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD")
        diff_auth = json.loads(diff_auth_path.read_text(encoding="utf-8"))
        check("exact diff authorization schema", diff_auth.get("schema") == "axm-asoiaf-human-diff-review-authorization/2")
        check("exact diff authorization decision", diff_auth.get("decision") == "approve-local-commit-object")
        check("exact diff change set", diff_auth.get("changeSetSha256") == change_sha)

        review_validation = run(
            sys.executable, "-W", "error", "-S", str(review_recorder / "validate_record.py"),
            "--repo", str(repo),
            "--worktree-receipt", str(worktree_receipt_path),
            "--worktree-authorization", str(apply_auth_path),
            "--review", str(review_path),
            "--authorization", str(diff_auth_path),
            "--receipt", str(review_receipt_path),
            "--actor", "Riley Diff Reviewer",
        )
        check("exact review validator exit", review_validation.returncode == 0)
        review_validation_object = json.loads(review_validation.stdout)
        check("exact review validator status", review_validation_object.get("status") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR")
        review_validation_path = root / "review-validation.json"
        review_validation_path.write_text(review_validation.stdout, encoding="utf-8")

        diff_raw = diff_auth_path.read_bytes()
        review_receipt_raw = review_receipt_path.read_bytes()
        review_validation_raw = review_validation_path.read_bytes()
        plan = {
            "schema": PLAN_SCHEMA,
            "diffReviewAuthorizationSha256": diff_auth["authorizationSha256"],
            "diffReviewAuthorizationFileSha256": sha(diff_raw),
            "reviewReceiptSha256": recorded_receipt["receiptSha256"],
            "reviewReceiptFileSha256": sha(review_receipt_raw),
            "reviewValidationFileSha256": sha(review_validation_raw),
            "repositoryIdentity": repo_id,
            "baseCommit": head,
            "branch": branch,
            "changeSetSha256": change_sha,
            "decision": "AUTHORIZE_UNREFERENCED_COMMIT_OBJECT",
            "commitObjectActor": "Casey Commit Object Actor",
            "planAuthorActor": "Casey Commit Object Actor",
            "transactionId": "compatibility-fixture-001",
            "authorName": "Casey Commit Object Actor",
            "authorEmail": "casey@example.test",
            "authorDate": "2026-08-24T05:00:00Z",
            "authorizedAt": "2026-08-24T05:00:00Z",
            "nonce": "compatibility-commit-object-001",
            "authorizationEvidence": "Bound the exact validated named-human review to one unreferenced commit-object operation.",
            "reasonCodes": ["ACTOR_SEPARATION", "EXACT_DIFF_REVIEW_BINDING"],
            "machineGenerated": False,
            "unreferencedCommitObjectAuthorized": True,
            "worktreeMutationAuthorized": False,
            "liveIndexMutationAuthorized": False,
            "referenceUpdateAuthorized": False,
            "remotePushAuthorized": False,
            "pullRequestAuthorized": False,
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
            "canonEffect": "none",
            "graphEffect": "none",
        }
        plan["planSha256"] = digest_object(plan)
        plan_path = root / "commit-object-plan.json"
        write_json(plan_path, plan)

        auth_outputs = root / "authorization-outputs"
        auth_outputs.mkdir()
        commit_auth_path = auth_outputs / "commit-authorization.json"
        auth_receipt_path = auth_outputs / "authorization-receipt.json"
        sealed = run(
            sys.executable, "-W", "error", "-S", str(SEALER),
            "--diff-review-authorization", str(diff_auth_path),
            "--review-receipt", str(review_receipt_path),
            "--review-validation", str(review_validation_path),
            "--plan", str(plan_path),
            "--authorization-output", str(commit_auth_path),
            "--receipt-output", str(auth_receipt_path),
            "--actor", "Casey Commit Object Actor",
        )
        check("authorization sealer exit", sealed.returncode == 0)
        auth_receipt = json.loads(sealed.stdout)
        check("authorization sealer status", auth_receipt.get("status") == "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_SEALED_OBJECT_CREATION_WITHHELD")
        check("authorization sealer hold", auth_receipt.get("nextAuthorityHold") == "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD")
        commit_auth = json.loads(commit_auth_path.read_text(encoding="utf-8"))
        check("commit authorization exact schema", commit_auth.get("schema") == "axm-asoiaf-commit-object-authorization/2")
        check("commit authorization exact decision", commit_auth.get("decision") == "create-unreferenced-commit-object")
        check("commit authorization exact diff binding", commit_auth.get("diffReviewAuthorizationSha256") == diff_auth["authorizationSha256"])
        check("commit authorization exact repository", commit_auth.get("repositoryIdentity") == repo_id)
        check("commit authorization exact base", commit_auth.get("baseCommit") == head)
        check("commit authorization exact branch", commit_auth.get("branch") == branch)
        check("commit authorization actor separated", commit_auth.get("commitObjectActor") != diff_auth.get("diffReviewerActor"))

        validated = run(
            sys.executable, "-W", "error", "-S", str(VALIDATOR),
            "--diff-review-authorization", str(diff_auth_path),
            "--review-receipt", str(review_receipt_path),
            "--review-validation", str(review_validation_path),
            "--plan", str(plan_path),
            "--authorization", str(commit_auth_path),
            "--receipt", str(auth_receipt_path),
            "--actor", "Casey Commit Object Actor",
        )
        check("authorization validator exit", validated.returncode == 0)
        check("authorization validator status", json.loads(validated.stdout).get("status") == "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_VALID_FOR_SEPARATE_OBJECT_SEALER")

        branch_before = git(repo, "rev-parse", branch)
        head_before = git(repo, "rev-parse", "HEAD")
        index_before = git(repo, "write-tree")
        status_before = git(repo, "status", "--porcelain=v1", "--untracked-files=all")
        commit_receipt_path = root / "commit-object-receipt.json"
        preflight = run(
            sys.executable, "-W", "error", "-S", str(commit_sealer / "seal_commit_object.py"),
            "preflight",
            "--repo", str(repo),
            "--worktree-receipt", str(worktree_receipt_path),
            "--diff-review", str(diff_auth_path),
            "--commit-authorization", str(commit_auth_path),
            "--receipt", str(root / "commit-preflight.json"),
        )
        check("exact commit sealer preflight exit", preflight.returncode == 0)
        check("exact commit sealer preflight status", json.loads(preflight.stdout).get("status") == "PASS_REVIEWED_WORKTREE_READY_FOR_EXPLICIT_COMMIT_OBJECT_SEAL")
        committed = run(
            sys.executable, "-W", "error", "-S", str(commit_sealer / "seal_commit_object.py"),
            "seal",
            "--repo", str(repo),
            "--worktree-receipt", str(worktree_receipt_path),
            "--diff-review", str(diff_auth_path),
            "--commit-authorization", str(commit_auth_path),
            "--receipt", str(commit_receipt_path),
            "--seal",
        )
        check("exact commit sealer exit", committed.returncode == 0)
        commit_receipt = json.loads(committed.stdout)
        check("exact commit sealer status", commit_receipt.get("status") == "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD")
        check("commit object exists", git(repo, "cat-file", "-t", commit_receipt.get("commitObjectSha", "")) == "commit")
        check("branch ref unchanged", git(repo, "rev-parse", branch) == branch_before)
        check("HEAD unchanged", git(repo, "rev-parse", "HEAD") == head_before)
        check("live index clean", git(repo, "write-tree") == index_before and git(repo, "diff", "--cached", "--name-only") == "")
        check("worktree paths retained", git(repo, "status", "--porcelain=v1", "--untracked-files=all") == status_before)
        check("worktree canon retained", (repo / TARGETS[0]).read_bytes() == canon)
        check("worktree graph retained", (repo / TARGETS[1]).read_bytes() == graph)
        check("commit receipt diff binding", commit_receipt.get("diffReviewAuthorizationSha256") == diff_auth["authorizationSha256"])
        check("commit receipt auth binding", commit_receipt.get("commitAuthorizationSha256") == commit_auth["authorizationSha256"])
        check("commit receipt no reference effect", commit_receipt.get("branchReferenceUpdated") is False)
        check("commit receipt no remote effect", commit_receipt.get("remotePushExecuted") is False)
        check("commit receipt no pull request effect", commit_receipt.get("pullRequestOpened") is False)
        check("commit receipt canon none", commit_receipt.get("canonEffect") == "none")
        check("commit receipt graph none", commit_receipt.get("graphEffect") == "none")

    failed = [name for name, passed in checks if not passed]
    output = {
        "schema": "axm-asoiaf-agot-local-commit-object-authorization-compatibility-campaign/1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "reviewRecorderCompatibility": "PASS" if not failed else "FAIL",
        "commitObjectSealerCompatibility": "PASS" if not failed else "FAIL",
        "noncopyrightedFixtureOnly": True,
        "realHumanDiffReviewsConsumed": 0,
        "realCommitObjectAuthorizationsSealed": 0,
        "realCommitObjectsCreated": 0,
        "realReferencesUpdated": 0,
        "realRemotePushes": 0,
        "realPullRequestsOpened": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
