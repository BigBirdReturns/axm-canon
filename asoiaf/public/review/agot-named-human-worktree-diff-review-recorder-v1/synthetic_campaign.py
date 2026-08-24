#!/usr/bin/env python3
"""Run noncopyrighted adversarial qualification for the worktree diff-review recorder."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from record_diff_review import (
    DECISION_HOLDS,
    REVIEW_SCHEMA,
    TARGETS,
    change_set,
    digest_object,
    repository_identity,
)

SCRIPT = Path(__file__).with_name("record_diff_review.py")
VALIDATOR = Path(__file__).with_name("validate_record.py")


def run(*args: str, cwd: Path | None = None, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [*args],
        cwd=cwd,
        env={**os.environ, "PYTHONWARNINGS": "error", "PYTHONSAFEPATH": "1", **(env or {})},
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


def make_repo(root: Path) -> tuple[Path, str, str, str]:
    repo = root / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.name", "Fixture Builder")
    git(repo, "config", "user.email", "fixture@example.test")
    git(repo, "remote", "add", "origin", "https://github.example.test/fixture/axm-canon.git")
    (repo / "README.md").write_text("fixture repository\n", encoding="utf-8")
    git(repo, "add", "README.md")
    git(repo, "commit", "-q", "-m", "fixture base")
    head = git(repo, "rev-parse", "HEAD")
    branch = "feature/asoiaf-agot/fixture-001"
    git(repo, "switch", "-q", "-c", branch)
    for relative, row in zip(TARGETS, (
        {"kind": "canon", "fixture": 1},
        {"kind": "graph", "fixture": 1},
    )):
        target = repo / Path(*relative.split("/"))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(row, sort_keys=True) + "\n", encoding="utf-8")
    return repo, head, branch, repository_identity(repo)


def fixture_objects(repo: Path, head: str, branch: str, identity: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    patch_sha = hashlib.sha256(b"fixture-patch-manifest").hexdigest()
    worktree_authorization = self_digest({
        "schema": "axm-asoiaf-local-worktree-apply-authorization/1",
        "decision": "apply-to-local-feature-worktree",
        "patchManifestSha256": patch_sha,
        "targetBaseCommit": head,
        "targetBranch": branch,
        "repositoryIdentity": identity,
        "reason": "Apply the independently validated fixture postimages for human review.",
        "nonce": "fixture-worktree-authorization-001",
        "authorizedAt": "2026-08-24T01:00:00Z",
        "worktreeExecutorActor": "Alex Worktree Executor",
    }, "authorizationSha256")
    worktree_receipt = self_digest({
        "schema": "axm-asoiaf-agot-local-worktree-patch-application/1",
        "componentId": "asoiaf-agot-repository-patch-worktree-executor-v1",
        "status": "PASS_LOCAL_FEATURE_WORKTREE_PATCH_APPLIED_PENDING_HUMAN_DIFF_REVIEW_AND_COMMIT",
        "preflightSha256": hashlib.sha256(b"fixture-preflight").hexdigest(),
        "repositoryIdentity": identity,
        "headCommitUnchanged": head,
        "branch": branch,
        "patchManifestSha256": patch_sha,
        "changedPaths": sorted(TARGETS),
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
    }, "applicationReceiptSha256")
    change_sha, _ = change_set(repo, head)
    review = self_digest({
        "schema": REVIEW_SCHEMA,
        "worktreeApplicationReceiptSha256": worktree_receipt["applicationReceiptSha256"],
        "worktreeApplyAuthorizationSha256": worktree_authorization["authorizationSha256"],
        "patchManifestSha256": patch_sha,
        "repositoryIdentity": identity,
        "baseCommit": head,
        "branch": branch,
        "changedPaths": TARGETS,
        "changeSetSha256": change_sha,
        "diffReviewerActor": "Riley Diff Reviewer",
        "reviewedAt": "2026-08-24T02:00:00Z",
        "machineGenerated": False,
        "humanActionEvidence": "Reviewed both exact ledger diffs locally and verified the append-only rows.",
        "decision": "APPROVE_LOCAL_COMMIT_OBJECT",
        "reasonCodes": ["EXACT_TWO_PATH_DIFF", "APPEND_ONLY_REVIEWED"],
        "reviewRationale": "The exact two governed files match the authorized patch manifest and contain only the reviewed fixture append rows.",
        "nonce": "fixture-diff-review-001",
        "repositoryEffectAuthorized": False,
        "canonEffect": "none",
        "graphEffect": "none",
    }, "reviewSha256")
    return worktree_receipt, worktree_authorization, review


def invoke(
    root: Path,
    repo: Path,
    worktree_receipt: dict[str, Any],
    worktree_authorization: dict[str, Any],
    review: dict[str, Any],
    *,
    actor: str = "Riley Diff Reviewer",
    suffix: str = "case",
    env: dict[str, str] | None = None,
    raw_review: str | None = None,
    symlink_label: str | None = None,
) -> tuple[subprocess.CompletedProcess[str], Path, Path, Path, Path, Path]:
    case = root / suffix
    case.mkdir(parents=True, exist_ok=False)
    wr = case / "worktree-receipt.json"
    wa = case / "worktree-authorization.json"
    rv = case / "review.json"
    auth = case / "diff-review-authorization.json"
    receipt = case / "review-receipt.json"
    write_json(wr, worktree_receipt)
    write_json(wa, worktree_authorization)
    if raw_review is None:
        write_json(rv, review)
    else:
        rv.write_text(raw_review, encoding="utf-8")
    if symlink_label:
        target = {"worktree": wr, "authorization": wa, "review": rv}[symlink_label]
        real = target.with_suffix(".real.json")
        target.rename(real)
        target.symlink_to(real.name)
    completed = run(
        "python", "-W", "error", "-S", str(SCRIPT),
        "--repo", str(repo),
        "--worktree-receipt", str(wr),
        "--worktree-authorization", str(wa),
        "--review", str(rv),
        "--authorization-output", str(auth),
        "--receipt-output", str(receipt),
        "--actor", actor,
        env=env,
    )
    return completed, wr, wa, rv, auth, receipt


def mutate(value: dict[str, Any], field: str, replacement: Any, digest_field: str) -> dict[str, Any]:
    result = copy.deepcopy(value)
    result[field] = replacement
    return self_digest(result, digest_field)


def main() -> int:
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, bool(condition)))

    with tempfile.TemporaryDirectory(prefix="axm-agot-diff-review-") as temporary:
        root = Path(temporary)
        repo, head, branch, identity = make_repo(root)
        wr, wa, review = fixture_objects(repo, head, branch, identity)

        success, wrp, wap, rvp, authp, receiptp = invoke(root, repo, wr, wa, review, suffix="approval")
        check("approval exit", success.returncode == 0)
        approval_result = json.loads(success.stdout)
        check("approval status", approval_result.get("status") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD")
        check("approval next hold", approval_result.get("nextAuthorityHold") == "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD")
        check("approval authorization exists", authp.is_file())
        check("approval receipt exists", receiptp.is_file())
        authorization = json.loads(authp.read_text(encoding="utf-8"))
        check("downstream schema", authorization.get("schema") == "axm-asoiaf-human-diff-review-authorization/2")
        check("downstream decision", authorization.get("decision") == "approve-local-commit-object")
        check("downstream change set", authorization.get("changeSetSha256") == review["changeSetSha256"])
        check("reviewer retained", authorization.get("diffReviewerActor") == "Riley Diff Reviewer")
        check("authorization self digest", authorization.get("authorizationSha256") == digest_object({k: v for k, v in authorization.items() if k != "authorizationSha256"}))
        check("receipt self digest", approval_result.get("receiptSha256") == digest_object({k: v for k, v in approval_result.items() if k != "receiptSha256"}))
        check("index clean", git(repo, "diff", "--cached", "--name-only") == "")
        check("worktree retained", sorted(git(repo, "status", "--porcelain=v1", "--untracked-files=all").splitlines()) != [])
        check("head unchanged", git(repo, "rev-parse", "HEAD") == head)
        check("branch unchanged", git(repo, "symbolic-ref", "--short", "HEAD") == branch)

        validation = run(
            "python", "-W", "error", "-S", str(VALIDATOR),
            "--repo", str(repo),
            "--worktree-receipt", str(wrp),
            "--worktree-authorization", str(wap),
            "--review", str(rvp),
            "--authorization", str(authp),
            "--receipt", str(receiptp),
            "--actor", "Riley Diff Reviewer",
        )
        check("validator exit", validation.returncode == 0)
        check("validator status", json.loads(validation.stdout).get("status") == "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR")

        replay, *_ = invoke(root, repo, wr, wa, review, suffix="approval-replay")
        check("deterministic replay exit", replay.returncode == 0)
        replay_case = root / "approval-replay"
        check("deterministic authorization bytes", authp.read_bytes() == (replay_case / "diff-review-authorization.json").read_bytes())
        check("deterministic receipt bytes", receiptp.read_bytes() == (replay_case / "review-receipt.json").read_bytes())

        for decision in ("REJECT_WORKTREE_DIFF", "RETURN_FOR_CORRECTION", "DEFER_PENDING_REVIEW"):
            case_review = mutate(review, "decision", decision, "reviewSha256")
            completed, _, _, _, auth, receipt = invoke(root, repo, wr, wa, case_review, suffix=decision.lower())
            check(f"{decision} exit", completed.returncode == 0)
            parsed = json.loads(completed.stdout)
            check(f"{decision} hold", parsed.get("nextAuthorityHold") == DECISION_HOLDS[decision])
            check(f"{decision} no authorization", not auth.exists())
            check(f"{decision} receipt", receipt.is_file())

        refusal_cases: list[tuple[str, dict[str, Any], dict[str, Any], dict[str, Any], str]] = []
        refusal_cases.append(("machine generated", wr, wa, mutate(review, "machineGenerated", True, "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("reviewer collision", wr, wa, mutate(review, "diffReviewerActor", "Alex Worktree Executor", "reviewSha256"), "REFUSE_ACTOR_COLLISION"))
        refusal_cases.append(("review digest", wr, wa, {**review, "reviewSha256": "0" * 64}, "REFUSE_SELF_DIGEST"))
        refusal_cases.append(("receipt digest", {**wr, "applicationReceiptSha256": "0" * 64}, wa, review, "REFUSE_SELF_DIGEST"))
        refusal_cases.append(("worktree auth digest", wr, {**wa, "authorizationSha256": "0" * 64}, review, "REFUSE_SELF_DIGEST"))
        refusal_cases.append(("receipt schema", mutate(wr, "schema", "wrong", "applicationReceiptSha256"), wa, review, "REFUSE_WORKTREE_RECEIPT"))
        refusal_cases.append(("receipt status", mutate(wr, "status", "wrong", "applicationReceiptSha256"), wa, review, "REFUSE_WORKTREE_RECEIPT"))
        refusal_cases.append(("worktree auth schema", wr, mutate(wa, "schema", "wrong", "authorizationSha256"), review, "REFUSE_WORKTREE_AUTHORIZATION"))
        refusal_cases.append(("worktree auth decision", wr, mutate(wa, "decision", "wrong", "authorizationSha256"), review, "REFUSE_WORKTREE_AUTHORIZATION"))
        refusal_cases.append(("repository identity", wr, wa, mutate(review, "repositoryIdentity", "wrong", "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("base commit", wr, wa, mutate(review, "baseCommit", "0" * 40, "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("branch", wr, wa, mutate(review, "branch", "feature/wrong", "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("path order", wr, wa, mutate(review, "changedPaths", list(reversed(TARGETS)), "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("change set", wr, wa, mutate(review, "changeSetSha256", "0" * 64, "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("patch manifest", wr, wa, mutate(review, "patchManifestSha256", "0" * 64, "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("repository effect", wr, wa, mutate(review, "repositoryEffectAuthorized", True, "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("canon effect", wr, wa, mutate(review, "canonEffect", "write", "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("graph effect", wr, wa, mutate(review, "graphEffect", "write", "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("duplicate reasons", wr, wa, mutate(review, "reasonCodes", ["EXACT_TWO_PATH_DIFF", "EXACT_TWO_PATH_DIFF"], "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("invalid reason", wr, wa, mutate(review, "reasonCodes", ["bad reason"], "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("empty rationale", wr, wa, mutate(review, "reviewRationale", "", "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("empty evidence", wr, wa, mutate(review, "humanActionEvidence", "", "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("empty nonce", wr, wa, mutate(review, "nonce", "", "reviewSha256"), "REFUSE_HUMAN_REVIEW"))
        refusal_cases.append(("review predates auth", wr, wa, mutate(review, "reviewedAt", "2026-08-24T00:00:00Z", "reviewSha256"), "REFUSE_TIME"))
        refusal_cases.append(("private field", wr, wa, self_digest({**review, "sourceText": "forbidden"}, "reviewSha256"), "REFUSE_SOURCE_TEXT_FIELD"))

        for index, (name, wr_case, wa_case, review_case, expected_status) in enumerate(refusal_cases):
            completed, *_ = invoke(root, repo, wr_case, wa_case, review_case, suffix=f"refusal-{index:02d}")
            parsed = json.loads(completed.stdout)
            check(f"refusal {name} exit", completed.returncode != 0)
            check(f"refusal {name} status", parsed.get("status") == expected_status)

        actor_mismatch, *_ = invoke(root, repo, wr, wa, review, actor="Morgan Recorder", suffix="actor-mismatch")
        check("actor mismatch exit", actor_mismatch.returncode != 0)
        check("actor mismatch status", json.loads(actor_mismatch.stdout).get("status") == "REFUSE_HUMAN_AUTHORITY")

        duplicate_raw = json.dumps(review, sort_keys=True)[:-1] + ',"decision":"APPROVE_LOCAL_COMMIT_OBJECT"}'
        duplicate, *_ = invoke(root, repo, wr, wa, review, raw_review=duplicate_raw, suffix="duplicate-json")
        check("duplicate JSON exit", duplicate.returncode != 0)
        check("duplicate JSON status", json.loads(duplicate.stdout).get("status") == "REFUSE_DUPLICATE_JSON_KEY")

        symlink, *_ = invoke(root, repo, wr, wa, review, symlink_label="review", suffix="symlink-review")
        check("symlink exit", symlink.returncode != 0)
        check("symlink status", json.loads(symlink.stdout).get("status") == "REFUSE_SYMLINK")

        exists_case = root / "output-exists"
        exists_case.mkdir()
        preexisting = exists_case / "diff-review-authorization.json"
        preexisting.write_text("preserve\n", encoding="utf-8")
        write_json(exists_case / "worktree-receipt.json", wr)
        write_json(exists_case / "worktree-authorization.json", wa)
        write_json(exists_case / "review.json", review)
        exists = run(
            "python", "-W", "error", "-S", str(SCRIPT),
            "--repo", str(repo),
            "--worktree-receipt", str(exists_case / "worktree-receipt.json"),
            "--worktree-authorization", str(exists_case / "worktree-authorization.json"),
            "--review", str(exists_case / "review.json"),
            "--authorization-output", str(preexisting),
            "--receipt-output", str(exists_case / "receipt.json"),
            "--actor", "Riley Diff Reviewer",
        )
        check("output exists exit", exists.returncode != 0)
        check("output exists preserved", preexisting.read_text(encoding="utf-8") == "preserve\n")
        check("output exists no receipt", not (exists_case / "receipt.json").exists())

        injected, _, _, _, injected_auth, injected_receipt = invoke(
            root,
            repo,
            wr,
            wa,
            review,
            suffix="injected-rollback",
            env={"AXM_INJECT_FAILURE_AFTER_AUTHORIZATION": "1"},
        )
        check("injected failure exit", injected.returncode != 0)
        check("injected authorization rollback", not injected_auth.exists())
        check("injected receipt rollback", not injected_receipt.exists())

        extra = repo / "EXTRA.txt"
        extra.write_text("unexpected\n", encoding="utf-8")
        dirty, *_ = invoke(root, repo, wr, wa, review, suffix="extra-worktree-path")
        check("extra path exit", dirty.returncode != 0)
        check("extra path status", json.loads(dirty.stdout).get("status") == "REFUSE_WORKTREE_DIFF")
        extra.unlink()

        staged = repo / "STAGED.txt"
        staged.write_text("staged\n", encoding="utf-8")
        git(repo, "add", "STAGED.txt")
        index_dirty, *_ = invoke(root, repo, wr, wa, review, suffix="dirty-index")
        check("dirty index exit", index_dirty.returncode != 0)
        check("dirty index status", json.loads(index_dirty.stdout).get("status") == "REFUSE_LIVE_INDEX")
        git(repo, "reset", "-q", "HEAD", "--", "STAGED.txt")
        staged.unlink()

    failed = [name for name, passed in checks if not passed]
    output = {
        "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-synthetic-campaign/1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "noncopyrightedFixtureOnly": True,
        "privateSourceTextUsed": False,
        "realWorktreeApplicationReceiptsConsumed": 0,
        "realHumanDiffReviewsConsumed": 0,
        "realDiffReviewAuthorizationsSealed": 0,
        "realCommitObjectsCreated": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
