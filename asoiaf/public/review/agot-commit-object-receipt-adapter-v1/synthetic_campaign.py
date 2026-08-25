#!/usr/bin/env python3
"""Run noncopyrighted adversarial qualification for the AGOT receipt adapter."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import sys
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))

import adapt_receipt as adapter

ROOT = Path(__file__).resolve().parent
ADAPT = ROOT / "adapt_receipt.py"
VALIDATE = ROOT / "validate_adapted_receipt.py"
PYTHON = os.environ.get("PYTHON", "python")


def run(*args: str, cwd: Path | None = None, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(args),
        cwd=cwd,
        env={**os.environ, "PYTHONSAFEPATH": "1", "PYTHONWARNINGS": "error", **(env or {})},
        text=True,
        capture_output=True,
        check=False,
    )


def git(repo: Path, *args: str, input_text: str | None = None, env: dict[str, str] | None = None) -> str:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        input=input_text,
        env={**os.environ, **(env or {})},
        text=True,
        capture_output=True,
        check=True,
    )
    return completed.stdout.strip()


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def self_digest(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = dict(value)
    result[field] = adapter.digest_object(result)
    return result


def fixture(root: Path, present: bool = True) -> dict[str, Any]:
    repo = root / "repo"
    repo.mkdir()
    git(repo, "init", "-q")
    git(repo, "config", "user.name", "Fixture Builder")
    git(repo, "config", "user.email", "fixture@example.invalid")
    git(repo, "remote", "add", "origin", "https://example.invalid/axm-canon.git")
    (repo / "README.md").write_text("fixture\n", encoding="utf-8")
    if present:
        for index, rel in enumerate(adapter.TARGETS, start=1):
            path = repo / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"fixture": index, "state": "base"}, sort_keys=True) + "\n", encoding="utf-8")
    git(repo, "add", ".")
    git(repo, "commit", "-qm", "base")
    git(repo, "branch", "-M", "agent/fixture")
    base = git(repo, "rev-parse", "HEAD")

    for index, rel in enumerate(adapter.TARGETS, start=1):
        path = repo / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        before = path.read_text(encoding="utf-8") if path.exists() else ""
        path.write_text(before + json.dumps({"fixture": index, "state": "reviewed"}, sort_keys=True) + "\n", encoding="utf-8")

    with tempfile.TemporaryDirectory(prefix="adapter-index-") as td:
        index_path = str(Path(td) / "index")
        env = {"GIT_INDEX_FILE": index_path}
        git(repo, "read-tree", base, env=env)
        git(repo, "add", "--", *adapter.TARGETS, env=env)
        tree = git(repo, "write-tree", env=env)
        commit_env = {
            **env,
            "GIT_AUTHOR_NAME": "Commit Object Actor",
            "GIT_AUTHOR_EMAIL": "commit@example.invalid",
            "GIT_AUTHOR_DATE": "2026-08-24T12:00:00Z",
            "GIT_COMMITTER_NAME": "Commit Object Actor",
            "GIT_COMMITTER_EMAIL": "commit@example.invalid",
            "GIT_COMMITTER_DATE": "2026-08-24T12:00:00Z",
        }
        commit = git(repo, "commit-tree", tree, "-p", base, input_text="Admit AGOT reviewed transaction fixture\n", env=commit_env)

    rows: list[dict[str, Any]] = []
    for rel in adapter.TARGETS:
        before = adapter.file_at_commit(repo, base, rel)
        current = (repo / rel).read_bytes()
        rows.append({
            "path": rel,
            "baseBytes": len(before),
            "baseSha256": adapter.digest_bytes(before),
            "currentBytes": len(current),
            "currentSha256": adapter.digest_bytes(current),
        })
    source = {
        "schema": adapter.SOURCE_SCHEMA,
        "componentId": adapter.SOURCE_COMPONENT,
        "status": adapter.STATUS,
        "repositoryIdentity": "https://example.invalid/axm-canon.git",
        "baseCommit": base,
        "branch": "agent/fixture",
        "treeSha": tree,
        "commitObjectSha": commit,
        "changeSetSha256": adapter.digest_object(rows),
        "changeSetRows": rows,
        "diffReviewerActor": "Named Diff Reviewer",
        "commitObjectActor": "Commit Object Actor",
        "diffReviewAuthorizationSha256": "1" * 64,
        "commitAuthorizationSha256": "2" * 64,
        "liveIndexModified": False,
        "branchReferenceUpdated": False,
        "worktreeChangesRetained": True,
        "remotePushExecuted": False,
        "pullRequestOpened": False,
        "canonEffect": "none",
        "graphEffect": "none",
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
    }
    source = self_digest(source, "commitObjectReceiptSha256")
    source_path = root / "source.json"
    write_json(source_path, source)
    source_file_digest = adapter.digest_bytes(source_path.read_bytes())
    authorization = {
        "schema": adapter.AUTH_SCHEMA,
        "decision": adapter.AUTH_DECISION,
        "sourceReceiptFileSha256": source_file_digest,
        "sourceReceiptSha256": source["commitObjectReceiptSha256"],
        "repositoryIdentity": source["repositoryIdentity"],
        "baseCommit": base,
        "branch": source["branch"],
        "commitObjectSha": commit,
        "treeSha": tree,
        "adapterActor": "Receipt Adapter Actor",
        "authorizedAt": "2026-08-24T12:01:00Z",
        "nonce": "fixture-adaptation-001",
        "repositoryEffectAuthorized": False,
        "worktreeReleaseAuthorized": False,
        "referenceUpdateAuthorized": False,
        "remotePushAuthorized": False,
        "pullRequestAuthorized": False,
        "canonEffect": "none",
        "graphEffect": "none",
    }
    authorization = self_digest(authorization, "authorizationSha256")
    auth_path = root / "authorization.json"
    write_json(auth_path, authorization)
    return {
        "root": root,
        "repo": repo,
        "source": source,
        "source_path": source_path,
        "authorization": authorization,
        "auth_path": auth_path,
        "base": base,
        "tree": tree,
        "commit": commit,
    }


def execute(fx: dict[str, Any], output: Path | None = None, actor: str = "Receipt Adapter Actor") -> subprocess.CompletedProcess[str]:
    output = output or fx["root"] / "adapted.json"
    return run(
        PYTHON, "-W", "error", "-S", str(ADAPT),
        "--repo", str(fx["repo"]),
        "--source-receipt", str(fx["source_path"]),
        "--authorization", str(fx["auth_path"]),
        "--output", str(output),
        "--actor", actor,
    )


def validate(fx: dict[str, Any], adapted: Path) -> subprocess.CompletedProcess[str]:
    return run(
        PYTHON, "-W", "error", "-S", str(VALIDATE),
        "--repo", str(fx["repo"]),
        "--source-receipt", str(fx["source_path"]),
        "--authorization", str(fx["auth_path"]),
        "--adapted-receipt", str(adapted),
        "--actor", "Receipt Adapter Actor",
    )


def mutate_json(fx: dict[str, Any], which: str, mutate: Callable[[dict[str, Any]], None], digest_field: str | None = None) -> None:
    path = fx["source_path"] if which == "source" else fx["auth_path"]
    value = json.loads(path.read_text(encoding="utf-8"))
    mutate(value)
    if digest_field:
        value.pop(digest_field, None)
        value[digest_field] = adapter.digest_object(value)
    write_json(path, value)
    if which == "source":
        auth = json.loads(fx["auth_path"].read_text(encoding="utf-8"))
        auth["sourceReceiptFileSha256"] = adapter.digest_bytes(path.read_bytes())
        if digest_field == "commitObjectReceiptSha256":
            auth["sourceReceiptSha256"] = value["commitObjectReceiptSha256"]
        auth.pop("authorizationSha256", None)
        auth["authorizationSha256"] = adapter.digest_object(auth)
        write_json(fx["auth_path"], auth)


def expect_refusal(name: str, setup: Callable[[dict[str, Any]], None], expected: str) -> None:
    with tempfile.TemporaryDirectory(prefix=f"adapter-{name}-") as td:
        fx = fixture(Path(td))
        setup(fx)
        completed = execute(fx)
        if completed.returncode == 0:
            raise AssertionError(f"{name}: unexpectedly passed")
        parsed = json.loads(completed.stdout)
        if parsed.get("status") != expected:
            raise AssertionError(f"{name}: {parsed}")


def main() -> int:
    passed: list[str] = []

    with tempfile.TemporaryDirectory(prefix="adapter-happy-") as td:
        fx = fixture(Path(td))
        output = Path(td) / "adapted.json"
        completed = execute(fx, output)
        assert completed.returncode == 0, completed.stderr + completed.stdout
        receipt = json.loads(output.read_text(encoding="utf-8"))
        assert receipt["schema"] == adapter.TARGET_SCHEMA
        assert receipt["adapterStatus"] == adapter.ADAPTER_STATUS
        assert receipt["nextAuthorityHold"] == adapter.NEXT_HOLD
        assert receipt["worktreeReleased"] is False
        assert receipt["branchReferenceUpdated"] is False
        checked = validate(fx, output)
        assert checked.returncode == 0, checked.stderr + checked.stdout
        assert json.loads(checked.stdout)["passed"] is True
        second = Path(td) / "adapted-2.json"
        assert execute(fx, second).returncode == 0
        assert output.read_bytes() == second.read_bytes()
        passed += ["happy-path", "independent-validation", "deterministic-replay"]

    with tempfile.TemporaryDirectory(prefix="adapter-absent-") as td:
        fx = fixture(Path(td), present=False)
        output = Path(td) / "adapted.json"
        assert execute(fx, output).returncode == 0
        assert validate(fx, output).returncode == 0
        passed.append("absent-ledger-preimages")

    cases: list[tuple[str, Callable[[dict[str, Any]], None], str]] = [
        ("source-schema", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("schema", "wrong"), "commitObjectReceiptSha256"), "REFUSE_SOURCE_RECEIPT"),
        ("source-component", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("componentId", "wrong"), "commitObjectReceiptSha256"), "REFUSE_SOURCE_RECEIPT"),
        ("source-status", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("status", "wrong"), "commitObjectReceiptSha256"), "REFUSE_SOURCE_RECEIPT"),
        ("source-self-digest", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("commitObjectReceiptSha256", "0" * 64)), "REFUSE_SOURCE_RECEIPT"),
        ("source-repository", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("repositoryIdentity", "wrong"), "commitObjectReceiptSha256"), "REFUSE_SOURCE_RECEIPT"),
        ("source-tree", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("treeSha", f["base"]), "commitObjectReceiptSha256"), "REFUSE_COMMIT_OBJECT"),
        ("source-branch", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("branch", "main"), "commitObjectReceiptSha256"), "REFUSE_BRANCH_BOUNDARY"),
        ("source-prior-actor-collision", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("commitObjectActor", v["diffReviewerActor"]), "commitObjectReceiptSha256"), "REFUSE_ACTOR_COLLISION"),
        ("source-boundary", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("branchReferenceUpdated", True), "commitObjectReceiptSha256"), "REFUSE_SOURCE_RECEIPT"),
        ("source-private-field", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("sourceText", "fixture"), "commitObjectReceiptSha256"), "REFUSE_SOURCE_TEXT_FIELD"),
        ("source-row-order", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("changeSetRows", list(reversed(v["changeSetRows"]))), "commitObjectReceiptSha256"), "REFUSE_SOURCE_RECEIPT"),
        ("source-row-hash", lambda f: mutate_json(f, "source", lambda v: v["changeSetRows"][0].__setitem__("currentSha256", "3" * 64), "commitObjectReceiptSha256"), "REFUSE_SOURCE_RECEIPT"),
        ("source-change-digest", lambda f: mutate_json(f, "source", lambda v: v.__setitem__("changeSetSha256", "4" * 64), "commitObjectReceiptSha256"), "REFUSE_SOURCE_RECEIPT"),
        ("auth-schema", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("schema", "wrong"), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-decision", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("decision", "wrong"), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-self-digest", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("authorizationSha256", "0" * 64)), "REFUSE_AUTHORIZATION"),
        ("auth-source-file", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("sourceReceiptFileSha256", "5" * 64), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-source-digest", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("sourceReceiptSha256", "6" * 64), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-repository", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("repositoryIdentity", "wrong"), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-actor-collision", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("adapterActor", "Commit Object Actor"), "authorizationSha256"), "REFUSE_ACTOR_COLLISION"),
        ("auth-time", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("authorizedAt", "yesterday"), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-nonce", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("nonce", ""), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-worktree-release", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("worktreeReleaseAuthorized", True), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-reference-update", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("referenceUpdateAuthorized", True), "authorizationSha256"), "REFUSE_AUTHORIZATION"),
        ("auth-private-field", lambda f: mutate_json(f, "auth", lambda v: v.__setitem__("privatePayload", "fixture"), "authorizationSha256"), "REFUSE_SOURCE_TEXT_FIELD"),
        ("actor-mismatch", lambda f: None, "REFUSE_ACTOR"),
        ("branch-moved", lambda f: git(f["repo"], "update-ref", "refs/heads/agent/fixture", f["commit"], f["base"]), "REFUSE_GIT_STATE"),
        ("commit-referenced", lambda f: git(f["repo"], "branch", "review/reference", f["commit"]), "REFUSE_REFERENCED_COMMIT_OBJECT"),
        ("index-dirty", lambda f: git(f["repo"], "add", adapter.TARGETS[0]), "REFUSE_LIVE_INDEX"),
        ("extra-worktree-path", lambda f: (f["repo"] / "extra.txt").write_text("extra\n"), "REFUSE_WORKTREE_DIFF"),
        ("changed-worktree-bytes", lambda f: (f["repo"] / adapter.TARGETS[0]).write_text("changed\n"), "REFUSE_SOURCE_RECEIPT"),
        ("output-inside-repo", lambda f: f.__setitem__("force_output", f["repo"] / "receipt.json"), "REFUSE_OUTPUT_BOUNDARY"),
        ("output-overwrite", lambda f: (f["root"] / "adapted.json").write_text("occupied\n"), "REFUSE_OUTPUT_OVERWRITE"),
    ]

    for name, setup, expected in cases:
        with tempfile.TemporaryDirectory(prefix=f"adapter-{name}-") as td:
            fx = fixture(Path(td))
            setup(fx)
            output = fx.get("force_output", Path(td) / "adapted.json")
            actor = "Wrong Actor" if name == "actor-mismatch" else ("Commit Object Actor" if name == "auth-actor-collision" else "Receipt Adapter Actor")
            completed = execute(fx, output=output, actor=actor)
            if completed.returncode == 0:
                raise AssertionError(f"{name}: unexpectedly passed")
            parsed = json.loads(completed.stdout)
            if parsed.get("status") != expected:
                raise AssertionError(f"{name}: expected {expected}, got {parsed}")
            passed.append(name)

    with tempfile.TemporaryDirectory(prefix="adapter-duplicate-") as td:
        fx = fixture(Path(td))
        raw = fx["source_path"].read_text(encoding="utf-8")
        fx["source_path"].write_text(raw.replace('{\n  "baseCommit"', '{\n  "schema": "duplicate",\n  "baseCommit"', 1), encoding="utf-8")
        completed = execute(fx)
        assert completed.returncode != 0 and json.loads(completed.stdout)["status"] == "REFUSE_DUPLICATE_JSON_KEY"
        passed.append("duplicate-json-key")

    if hasattr(os, "symlink"):
        with tempfile.TemporaryDirectory(prefix="adapter-symlink-") as td:
            fx = fixture(Path(td))
            real = fx["source_path"]
            link = Path(td) / "source-link.json"
            link.symlink_to(real)
            fx["source_path"] = link
            completed = execute(fx)
            assert completed.returncode != 0 and json.loads(completed.stdout)["status"] == "REFUSE_INPUT"
            passed.append("symlink-input")

    with tempfile.TemporaryDirectory(prefix="adapter-tamper-") as td:
        fx = fixture(Path(td))
        output = Path(td) / "adapted.json"
        assert execute(fx, output).returncode == 0
        value = json.loads(output.read_text(encoding="utf-8"))
        value["branch"] = "agent/tampered"
        write_json(output, value)
        completed = validate(fx, output)
        assert completed.returncode != 0
        passed.append("validator-tamper")

    with tempfile.TemporaryDirectory(prefix="adapter-noncanonical-") as td:
        fx = fixture(Path(td))
        output = Path(td) / "adapted.json"
        assert execute(fx, output).returncode == 0
        value = json.loads(output.read_text(encoding="utf-8"))
        output.write_text(json.dumps(value) + "\n", encoding="utf-8")
        completed = validate(fx, output)
        assert completed.returncode != 0
        passed.append("validator-noncanonical-bytes")

    expected_total = 4 + len(cases) + 4
    assert len(passed) == expected_total, (len(passed), expected_total, passed)
    print(json.dumps({
        "schema": "axm-asoiaf-agot-commit-object-receipt-adapter-synthetic-campaign/1",
        "componentId": adapter.COMPONENT,
        "status": "PASS",
        "passed": len(passed),
        "total": len(passed),
        "cases": passed,
        "noncopyrightedFixtureOnly": True,
        "privateSourceTextUsed": False,
        "realSourceReceiptsConsumed": 0,
        "realAdaptedReceiptsSealed": 0,
        "realWorktreeReleases": 0,
        "realReferenceUpdates": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
