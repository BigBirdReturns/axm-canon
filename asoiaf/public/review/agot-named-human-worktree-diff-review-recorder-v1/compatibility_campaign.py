#!/usr/bin/env python3
"""Prove exact compatibility from admitted worktree executor through commit-object sealer."""
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
from record_diff_review import REVIEW_SCHEMA, TARGETS, change_set, digest_object, repository_identity

RECORDER = Path(__file__).with_name("record_diff_review.py")
VALIDATOR = Path(__file__).with_name("validate_record.py")


def run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [*args],
        env={**os.environ, "PYTHONSAFEPATH": "1", "PYTHONWARNINGS": "error", **(env or {})},
        text=True,
        capture_output=True,
        shell=False,
    )


def git(repo: Path, *args: str) -> str:
    completed = run("git", "-C", str(repo), *args)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr or completed.stdout)
    return completed.stdout.strip()


def self_digest(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = copy.deepcopy(value)
    result.pop(field, None)
    result[field] = digest_object(result)
    return result


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def identity(raw: bytes) -> dict[str, Any]:
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worktree-executor", required=True)
    parser.add_argument("--commit-sealer", required=True)
    args = parser.parse_args(argv)
    worktree_executor = Path(args.worktree_executor).resolve()
    commit_sealer = Path(args.commit_sealer).resolve()
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, bool(condition)))

    with tempfile.TemporaryDirectory(prefix="axm-agot-diff-review-compat-") as temporary:
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
        branch = "feature/asoiaf-agot/compatibility-001"
        git(repo, "switch", "-q", "-c", branch)
        repo_id = repository_identity(repo)

        canon = (json.dumps({"kind": "canon", "fixture": "compatibility"}, sort_keys=True) + "\n").encode()
        graph = (json.dumps({"kind": "graph", "fixture": "compatibility"}, sort_keys=True) + "\n").encode()
        patch = (
            "diff --git a/asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson b/asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson\n"
            "new file mode 100644\n"
            "--- /dev/null\n"
            "+++ b/asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson\n"
            "+{\"fixture\": \"compatibility\", \"kind\": \"canon\"}\n"
            "diff --git a/asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson b/asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson\n"
            "new file mode 100644\n"
            "--- /dev/null\n"
            "+++ b/asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson\n"
            "+{\"fixture\": \"compatibility\", \"kind\": \"graph\"}\n"
        ).encode()
        bundle = root / "bundle"
        for relative, raw in zip(TARGETS, (canon, graph)):
            target = bundle / "proposed" / Path(*relative.split("/"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        (bundle / "repository.patch").write_bytes(patch)
        manifest = {
            "schema": "axm-asoiaf-agot-repository-patch-manifest/1",
            "status": "PASS_REPOSITORY_PATCH_MATERIALIZED_PENDING_HUMAN_PR_REVIEW",
            "patchExecutorActor": "Pat Patch Bundle Sealer",
            "preconditions": {
                "targetBaseCommit": head,
                "canonBeforeSha256": hashlib.sha256(b"").hexdigest(),
                "graphBeforeSha256": hashlib.sha256(b"").hexdigest(),
            },
            "proposedOutputs": {
                TARGETS[0]: identity(canon),
                TARGETS[1]: identity(graph),
                "repository.patch": identity(patch),
            },
        }
        manifest["patchManifestSha256"] = digest_object(manifest)
        write_json(bundle / "PATCH_MANIFEST.json", manifest)
        validation = {
            "schema": "axm-asoiaf-agot-repository-patch-validation/1",
            "status": "PASS_VALID_FOR_SEPARATE_REPOSITORY_EXECUTOR_AND_PR_REVIEW",
            "passed": True,
        }
        validation_path = root / "patch-validation.json"
        write_json(validation_path, validation)
        apply_auth = self_digest({
            "schema": "axm-asoiaf-local-worktree-apply-authorization/1",
            "decision": "apply-to-local-feature-worktree",
            "patchManifestSha256": manifest["patchManifestSha256"],
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
        worktree_receipt_path = root / "worktree-receipt.json"
        execute = run(
            "python", "-W", "error", "-S", str(worktree_executor / "execute_worktree.py"),
            "apply",
            "--repo", str(repo),
            "--bundle", str(bundle),
            "--validation", str(validation_path),
            "--authorization", str(apply_auth_path),
            "--receipt", str(worktree_receipt_path),
            "--apply",
        )
        check("worktree executor exit", execute.returncode == 0)
        worktree_receipt = json.loads(execute.stdout)
        check("worktree executor status", worktree_receipt.get("status") == "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT")
        check("worktree executor changed paths", worktree_receipt.get("changedPaths") == sorted(TARGETS))
        check("worktree executor index clean", worktree_receipt.get("gitIndexModified") is False)
        check("worktree executor commit absent", worktree_receipt.get("gitCommitCreated") is False)
        check("worktree executor reference unchanged", worktree_receipt.get("localReferenceUpdated") is False)
        check("worktree bytes exact canon", (repo / TARGETS[0]).read_bytes() == canon)
        check("worktree bytes exact graph", (repo / TARGETS[1]).read_bytes() == graph)

        change_sha, _ = change_set(repo, head)
        review = self_digest({
            "schema": REVIEW_SCHEMA,
            "worktreeApplicationReceiptSha256": worktree_receipt["applicationReceiptSha256"],
            "worktreeApplyAuthorizationSha256": apply_auth["authorizationSha256"],
            "patchManifestSha256": manifest["patchManifestSha256"],
            "repositoryIdentity": repo_id,
            "baseCommit": head,
            "branch": branch,
            "changedPaths": TARGETS,
            "changeSetSha256": change_sha,
            "diffReviewerActor": "Riley Diff Reviewer",
            "reviewedAt": "2026-08-24T04:00:00Z",
            "machineGenerated": False,
            "humanActionEvidence": "Reviewed both exact fixture diff hunks against the authorized patch bundle.",
            "decision": "APPROVE_LOCAL_COMMIT_OBJECT",
            "reasonCodes": ["EXACT_TWO_PATH_DIFF", "DOWNSTREAM_SCHEMA_MATCH"],
            "reviewRationale": "The worktree contains only the two exact authorized fixture postimages and is ready for unreferenced commit-object construction.",
            "nonce": "compatibility-diff-review-001",
            "repositoryEffectAuthorized": False,
            "canonEffect": "none",
            "graphEffect": "none",
        }, "reviewSha256")
        review_path = root / "human-review.json"
        write_json(review_path, review)
        diff_auth_path = root / "diff-review-authorization.json"
        review_receipt_path = root / "diff-review-receipt.json"
        recorded = run(
            "python", "-W", "error", "-S", str(RECORDER),
            "--repo", str(repo),
            "--worktree-receipt", str(worktree_receipt_path),
            "--worktree-authorization", str(apply_auth_path),
            "--review", str(review_path),
            "--authorization-output", str(diff_auth_path),
            "--receipt-output", str(review_receipt_path),
            "--actor", "Riley Diff Reviewer",
        )
        check("review recorder exit", recorded.returncode == 0)
        recorded_receipt = json.loads(recorded.stdout)
        check("review recorder status", recorded_receipt.get("status") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD")
        check("review recorder hold", recorded_receipt.get("nextAuthorityHold") == "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD")
        diff_auth = json.loads(diff_auth_path.read_text(encoding="utf-8"))
        check("exact downstream auth schema", diff_auth.get("schema") == "axm-asoiaf-human-diff-review-authorization/2")
        check("exact downstream auth decision", diff_auth.get("decision") == "approve-local-commit-object")
        check("exact downstream change set", diff_auth.get("changeSetSha256") == change_sha)

        validated = run(
            "python", "-W", "error", "-S", str(VALIDATOR),
            "--repo", str(repo),
            "--worktree-receipt", str(worktree_receipt_path),
            "--worktree-authorization", str(apply_auth_path),
            "--review", str(review_path),
            "--authorization", str(diff_auth_path),
            "--receipt", str(review_receipt_path),
            "--actor", "Riley Diff Reviewer",
        )
        check("review validation exit", validated.returncode == 0)
        check("review validation status", json.loads(validated.stdout).get("status") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR")

        commit_auth = self_digest({
            "schema": "axm-asoiaf-commit-object-authorization/2",
            "diffReviewAuthorizationSha256": diff_auth["authorizationSha256"],
            "repositoryIdentity": repo_id,
            "baseCommit": head,
            "branch": branch,
            "decision": "create-unreferenced-commit-object",
            "commitObjectActor": "Casey Commit Object Actor",
            "commitMessage": "Admit AGOT reviewed transaction compatibility-fixture-001",
            "authorName": "Casey Commit Object Actor",
            "authorEmail": "casey@example.test",
            "authorDate": "2026-08-24T05:00:00Z",
            "authorizedAt": "2026-08-24T05:00:00Z",
            "nonce": "compatibility-commit-object-001",
        }, "authorizationSha256")
        commit_auth_path = root / "commit-authorization.json"
        write_json(commit_auth_path, commit_auth)
        commit_receipt_path = root / "commit-object-receipt.json"
        branch_before = git(repo, "rev-parse", branch)
        commit_result = run(
            "python", "-W", "error", "-S", str(commit_sealer / "seal_commit_object.py"),
            "seal",
            "--repo", str(repo),
            "--worktree-receipt", str(worktree_receipt_path),
            "--diff-review", str(diff_auth_path),
            "--commit-authorization", str(commit_auth_path),
            "--receipt", str(commit_receipt_path),
            "--seal",
        )
        check("commit sealer exit", commit_result.returncode == 0)
        commit_receipt = json.loads(commit_result.stdout)
        check("commit sealer status", commit_receipt.get("status") == "PASS_LOCAL_COMMIT_OBJECT_CREATED_REF_UPDATE_WITHHELD")
        check("commit object exists", git(repo, "cat-file", "-t", commit_receipt.get("commitObjectSha", "")) == "commit")
        check("branchReferenceUpdated", commit_receipt.get("branchReferenceUpdated") is False)
        check("liveIndexModified", commit_receipt.get("liveIndexModified") is False)
        check("worktreeChangesRetained", commit_receipt.get("worktreeChangesRetained") is True)
        check("branch ref unchanged", git(repo, "rev-parse", branch) == branch_before)
        check("HEAD unchanged", git(repo, "rev-parse", "HEAD") == head)
        check("live index clean after commit seal", git(repo, "diff", "--cached", "--name-only") == "")
        check("worktree paths retained", sorted(line[3:] for line in git(repo, "status", "--porcelain=v1", "--untracked-files=all").splitlines()) == sorted(TARGETS))
        check("commit auth reviewer separation", commit_auth["commitObjectActor"].casefold() != diff_auth["diffReviewerActor"].casefold())
        check("no remote effect", commit_receipt.get("remotePushExecuted") is False)
        check("no pull request effect", commit_receipt.get("pullRequestOpened") is False)
        check("canon effect none", commit_receipt.get("canonEffect") == "none")
        check("graph effect none", commit_receipt.get("graphEffect") == "none")

    failed = [name for name, passed in checks if not passed]
    output = {
        "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-compatibility-campaign/1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "worktreeExecutorCompatibility": "PASS" if not failed else "FAIL",
        "commitObjectSealerCompatibility": "PASS" if not failed else "FAIL",
        "noncopyrightedFixtureOnly": True,
        "realWorktreePatchesApplied": 0,
        "realHumanDiffReviewsConsumed": 0,
        "realCommitObjectsCreated": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
