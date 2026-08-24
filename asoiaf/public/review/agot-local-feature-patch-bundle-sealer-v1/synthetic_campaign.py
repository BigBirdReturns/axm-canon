#!/usr/bin/env python3
"""Noncopyrighted adversarial campaign for the AGOT patch-bundle sealer."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

from seal_patch_bundle import SELF_DIGEST_MARKER, TARGETS, canonical, digest_bytes

ROOT = Path(__file__).resolve().parent
SEALER = ROOT / "seal_patch_bundle.py"
VALIDATOR = ROOT / "validate_bundle.py"
REPOSITORY = "BigBirdReturns/axm-canon"
FEATURE_BRANCH = "feature/asoiaf-agot/fixture-one"
ACTOR = "bundle.executor.erin"
AUTHOR = "bundle.author.dana"


def self_digest(value: dict[str, Any], field: str) -> None:
    value[field] = SELF_DIGEST_MARKER
    value[field] = hashlib.sha256(canonical(value)).hexdigest()


def dump(path: Path, value: dict[str, Any]) -> bytes:
    raw = (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return raw


def git(repo: Path, *args: str) -> str:
    completed = subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)
    return completed.stdout.strip()


def make_row(kind: str, sequence: int) -> bytes:
    value = {
        "schema": f"axm-fixture-{kind}/1",
        "candidateId": "fixture-candidate-001",
        "sequence": sequence,
        "statement": "A fictional raven carried a blue ribbon across an empty courtyard.",
    }
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def make_fixture(root: Path, present: bool) -> dict[str, Path | str]:
    repo = root / "repo"
    repo.mkdir(parents=True)
    git(repo, "init", "-q")
    git(repo, "config", "user.name", "Fixture User")
    git(repo, "config", "user.email", "fixture@example.invalid")
    pre_root = root / "preimages"
    materialized = root / "materialized"
    pre_root.mkdir()
    materialized.mkdir()
    descriptors = []
    pre_paths: dict[str, Path] = {}
    for index, target in enumerate(TARGETS, start=1):
        pre = make_row("preimage", index) if present else b""
        post = pre + make_row("append", index)
        pre_path = pre_root / f"preimage-{index}.ndjson"
        pre_path.write_bytes(pre)
        pre_paths[target] = pre_path
        post_path = materialized / Path(target)
        post_path.parent.mkdir(parents=True, exist_ok=True)
        post_path.write_bytes(post)
        if pre:
            repo_path = repo / Path(target)
            repo_path.parent.mkdir(parents=True, exist_ok=True)
            repo_path.write_bytes(pre)
        descriptors.append({
            "targetPath": target,
            "preimage": {"bytes": len(pre), "sha256": digest_bytes(pre)},
            "postimage": {"bytes": len(post), "sha256": digest_bytes(post)},
            "append": {"bytes": len(post) - len(pre), "sha256": digest_bytes(post[len(pre):])},
        })
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "--allow-empty", "-m", "fixture base")
    base_commit = git(repo, "rev-parse", "HEAD")
    receipt = {
        "schema": "axm-asoiaf-agot-local-feature-postimage-materialization-receipt/1",
        "componentId": "asoiaf-agot-local-feature-postimage-materializer-v1",
        "status": "PASS_LOCAL_FEATURE_POSTIMAGES_MATERIALIZED_WORKTREE_APPLICATION_WITHHELD",
        "nextAuthorityHold": "LOCAL_FEATURE_WORKTREE_APPLICATION_WITHHELD",
        "repository": {"fullName": REPOSITORY, "baseCommit": base_commit, "featureBranch": FEATURE_BRANCH},
        "upstreamActors": {
            "reviewerPrincipal": "reviewer.alice",
            "requestActor": "request.actor.bob",
            "materializerActor": "materializer.actor.charlie"
        },
        "targets": descriptors,
        "authorityBoundary": {
            "worktreeApplicationExecuted": False,
            "commitCreated": False,
            "canonEffect": "none",
            "graphEffect": "none"
        },
        "selfDigestMethod": SELF_DIGEST_MARKER,
        "receiptSha256": SELF_DIGEST_MARKER
    }
    self_digest(receipt, "receiptSha256")
    receipt_path = root / "materialization-receipt.json"
    receipt_raw = dump(receipt_path, receipt)
    validation = {
        "schema": "axm-asoiaf-agot-local-feature-postimage-materialization-validation/1",
        "componentId": "asoiaf-agot-local-feature-postimage-materializer-v1",
        "status": "PASS_LOCAL_FEATURE_POSTIMAGE_MATERIALIZATION_VALID_FOR_SEPARATE_EXECUTOR",
        "validatedMaterializationReceiptFileSha256": digest_bytes(receipt_raw),
        "validatedMaterializationReceiptSha256": receipt["receiptSha256"],
        "validatorExecutedWorktreeApplication": False,
        "canonEffect": "none",
        "graphEffect": "none"
    }
    validation_path = root / "materialization-validation.json"
    dump(validation_path, validation)
    authorization = {
        "schema": "axm-asoiaf-agot-local-feature-patch-bundle-authorization/1",
        "repository": REPOSITORY,
        "baseCommit": base_commit,
        "featureBranch": FEATURE_BRANCH,
        "targetPaths": list(TARGETS),
        "materializationReceiptFileSha256": digest_bytes(receipt_raw),
        "authorizedActor": ACTOR,
        "authorizationAuthor": AUTHOR,
        "authorizedAt": "2026-08-24T08:00:00Z",
        "machineGenerated": False,
        "worktreeApplicationAuthorized": False,
        "commitAuthorized": False,
        "referenceUpdateAuthorized": False,
        "remotePushAuthorized": False,
        "pullRequestAuthorized": False,
        "canonEffect": "none",
        "graphEffect": "none",
        "authorizationSha256": SELF_DIGEST_MARKER
    }
    self_digest(authorization, "authorizationSha256")
    authorization_path = root / "authorization.json"
    dump(authorization_path, authorization)
    output = root / "bundle"
    output.mkdir()
    return {
        "repo": repo,
        "receipt": receipt_path,
        "validation": validation_path,
        "materialized": materialized,
        "canon_preimage": pre_paths[TARGETS[0]],
        "graph_preimage": pre_paths[TARGETS[1]],
        "authorization": authorization_path,
        "output": output,
        "bundle_receipt": root / "bundle-receipt.json",
        "base_commit": base_commit
    }


def command(fixture: dict[str, Path | str], actor: str = ACTOR) -> list[str]:
    return [
        sys.executable, "-W", "error", "-S", str(SEALER),
        "--materialization-receipt", str(fixture["receipt"]),
        "--materialization-validation", str(fixture["validation"]),
        "--materialized-root", str(fixture["materialized"]),
        "--canon-preimage", str(fixture["canon_preimage"]),
        "--graph-preimage", str(fixture["graph_preimage"]),
        "--authorization", str(fixture["authorization"]),
        "--output-dir", str(fixture["output"]),
        "--receipt-output", str(fixture["bundle_receipt"]),
        "--actor", actor
    ]


def run(fixture: dict[str, Path | str], actor: str = ACTOR) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command(fixture, actor), capture_output=True, text=True, env={**os.environ, "PYTHONSAFEPATH": "1", "PYTHONWARNINGS": "error"})


def validate(fixture: dict[str, Path | str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run([
        sys.executable, "-W", "error", "-S", str(VALIDATOR),
        "--materialization-receipt", str(fixture["receipt"]),
        "--materialization-validation", str(fixture["validation"]),
        "--materialized-root", str(fixture["materialized"]),
        "--canon-preimage", str(fixture["canon_preimage"]),
        "--graph-preimage", str(fixture["graph_preimage"]),
        "--authorization", str(fixture["authorization"]),
        "--bundle-dir", str(fixture["output"]),
        "--bundle-receipt", str(fixture["bundle_receipt"]),
        "--actor", ACTOR
    ], capture_output=True, text=True, env={**os.environ, "PYTHONSAFEPATH": "1", "PYTHONWARNINGS": "error"})


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def rebind_receipt(fixture: dict[str, Path | str]) -> None:
    receipt_raw = Path(fixture["receipt"]).read_bytes()
    receipt = load(Path(fixture["receipt"]))
    validation = load(Path(fixture["validation"]))
    validation["validatedMaterializationReceiptFileSha256"] = digest_bytes(receipt_raw)
    validation["validatedMaterializationReceiptSha256"] = receipt["receiptSha256"]
    dump(Path(fixture["validation"]), validation)
    authorization = load(Path(fixture["authorization"]))
    authorization["materializationReceiptFileSha256"] = digest_bytes(receipt_raw)
    self_digest(authorization, "authorizationSha256")
    dump(Path(fixture["authorization"]), authorization)


def mutate_json(path: Path, mutation: Callable[[dict[str, Any]], None], digest_field: str | None = None) -> None:
    value = load(path)
    mutation(value)
    if digest_field:
        self_digest(value, digest_field)
    dump(path, value)


def refusal_case(parent: Path, name: str, mutator: Callable[[dict[str, Path | str]], None], present: bool = False, actor: str = ACTOR) -> bool:
    fixture = make_fixture(parent / name, present)
    mutator(fixture)
    completed = run(fixture, actor)
    output_files = [path for path in Path(fixture["output"]).rglob("*") if path.is_file()]
    return completed.returncode == 3 and not output_files and not Path(fixture["bundle_receipt"]).exists()


def main() -> int:
    results: list[tuple[str, bool]] = []
    with tempfile.TemporaryDirectory(prefix="axm-patch-bundle-campaign-") as temporary:
        parent = Path(temporary)
        absent = make_fixture(parent / "valid-absent", False)
        absent_run = run(absent)
        absent_obj = json.loads(absent_run.stdout) if absent_run.returncode == 0 else {}
        results.append(("valid absent preimages", absent_run.returncode == 0 and absent_obj.get("status", "").startswith("PASS_")))
        absent_validation = validate(absent)
        absent_validation_obj = json.loads(absent_validation.stdout) if absent_validation.returncode == 0 else {}
        results.append(("independent validation absent", absent_validation.returncode == 0 and "VALID" in absent_validation_obj.get("status", "")))
        patch = Path(absent["output"]) / "repository.patch"
        apply_check = subprocess.run(["git", "-C", str(absent["repo"]), "apply", "--check", str(patch)], capture_output=True, text=True)
        results.append(("Git apply check absent", apply_check.returncode == 0))
        results.append(("Git apply check has no effect", git(Path(absent["repo"]), "status", "--porcelain") == ""))
        present = make_fixture(parent / "valid-present", True)
        results.append(("valid present preimages", run(present).returncode == 0))
        results.append(("independent validation present", validate(present).returncode == 0))
        patch2 = Path(present["output"]) / "repository.patch"
        apply_check2 = subprocess.run(["git", "-C", str(present["repo"]), "apply", "--check", str(patch2)], capture_output=True, text=True)
        results.append(("Git apply check present", apply_check2.returncode == 0))
        results.append(("present check has no effect", git(Path(present["repo"]), "status", "--porcelain") == ""))
        replay = make_fixture(parent / "deterministic-replay", False)
        replay2 = make_fixture(parent / "deterministic-replay-2", False)
        first_base = str(replay["base_commit"])
        mutate_json(Path(replay2["receipt"]), lambda value: value["repository"].update({"baseCommit": first_base}), "receiptSha256")
        rebind_receipt(replay2)
        mutate_json(Path(replay2["authorization"]), lambda value: value.update({"baseCommit": first_base}), "authorizationSha256")
        one = run(replay)
        two = run(replay2)
        files_one = {p.relative_to(Path(replay["output"])).as_posix(): p.read_bytes() for p in Path(replay["output"]).rglob("*") if p.is_file()}
        files_two = {p.relative_to(Path(replay2["output"])).as_posix(): p.read_bytes() for p in Path(replay2["output"]).rglob("*") if p.is_file()}
        results.append(("deterministic bundle replay", one.returncode == 0 and two.returncode == 0 and files_one == files_two))
        results.extend([
            ("receipt status refusal", refusal_case(parent, "bad-status", lambda f: (mutate_json(Path(f["receipt"]), lambda v: v.update({"status": "PASS_OTHER"}), "receiptSha256"), rebind_receipt(f)))),
            ("receipt hold refusal", refusal_case(parent, "bad-hold", lambda f: (mutate_json(Path(f["receipt"]), lambda v: v.update({"nextAuthorityHold": "OTHER_HOLD"}), "receiptSha256"), rebind_receipt(f)))),
            ("receipt component refusal", refusal_case(parent, "bad-component", lambda f: (mutate_json(Path(f["receipt"]), lambda v: v.update({"componentId": "other"}), "receiptSha256"), rebind_receipt(f)))),
            ("receipt self-digest refusal", refusal_case(parent, "bad-receipt-digest", lambda f: mutate_json(Path(f["receipt"]), lambda v: v.update({"receiptSha256": "0" * 64})))),
            ("receipt private field refusal", refusal_case(parent, "private-receipt", lambda f: (mutate_json(Path(f["receipt"]), lambda v: v.update({"sourceText": "forbidden"}), "receiptSha256"), rebind_receipt(f)))),
            ("validation status refusal", refusal_case(parent, "bad-validation-status", lambda f: mutate_json(Path(f["validation"]), lambda v: v.update({"status": "REFUSE_INVALID"})))),
            ("validation receipt binding refusal", refusal_case(parent, "bad-validation-binding", lambda f: mutate_json(Path(f["validation"]), lambda v: v.update({"validatedMaterializationReceiptFileSha256": "1" * 64})))),
            ("validation effect refusal", refusal_case(parent, "validation-effect", lambda f: mutate_json(Path(f["validation"]), lambda v: v.update({"canonEffect": "write"})))),
            ("authorization receipt binding refusal", refusal_case(parent, "bad-auth-binding", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"materializationReceiptFileSha256": "2" * 64}), "authorizationSha256"))),
            ("authorization actor mismatch", refusal_case(parent, "actor-mismatch", lambda f: None, actor="different.actor")),
            ("authorization actor collapse", refusal_case(parent, "actor-collapse", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"authorizationAuthor": ACTOR}), "authorizationSha256"))),
            ("authorization upstream collision", refusal_case(parent, "actor-upstream", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"authorizedActor": "materializer.actor.charlie"}), "authorizationSha256"), actor="materializer.actor.charlie")),
            ("machine authorization refusal", refusal_case(parent, "machine-auth", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"machineGenerated": True}), "authorizationSha256"))),
            ("worktree authorization refusal", refusal_case(parent, "worktree-authority", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"worktreeApplicationAuthorized": True}), "authorizationSha256"))),
            ("commit authorization refusal", refusal_case(parent, "commit-authority", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"commitAuthorized": True}), "authorizationSha256"))),
            ("reference authorization refusal", refusal_case(parent, "ref-authority", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"referenceUpdateAuthorized": True}), "authorizationSha256"))),
            ("remote authorization refusal", refusal_case(parent, "remote-authority", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"remotePushAuthorized": True}), "authorizationSha256"))),
            ("pull request authorization refusal", refusal_case(parent, "pr-authority", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"pullRequestAuthorized": True}), "authorizationSha256"))),
            ("authorization canon effect refusal", refusal_case(parent, "auth-canon", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"canonEffect": "write"}), "authorizationSha256"))),
            ("repository drift refusal", refusal_case(parent, "repo-drift", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"repository": "Elsewhere/repo"}), "authorizationSha256"))),
            ("base drift refusal", refusal_case(parent, "base-drift", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"baseCommit": "a" * 40}), "authorizationSha256"))),
            ("branch drift refusal", refusal_case(parent, "branch-drift", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"featureBranch": "feature/asoiaf-agot/other"}), "authorizationSha256"))),
            ("target order refusal", refusal_case(parent, "target-order", lambda f: mutate_json(Path(f["authorization"]), lambda v: v.update({"targetPaths": list(reversed(TARGETS))}), "authorizationSha256"))),
            ("changed postimage refusal", refusal_case(parent, "changed-postimage", lambda f: Path(f["materialized"]).joinpath(TARGETS[0]).write_bytes(make_row("tamper", 9)))),
            ("changed preimage refusal", refusal_case(parent, "changed-preimage", lambda f: Path(f["canon_preimage"]).write_bytes(make_row("tamper", 9)))),
            ("non-append postimage refusal", refusal_case(parent, "non-append", lambda f: Path(f["materialized"]).joinpath(TARGETS[0]).write_bytes(make_row("replacement", 9)), present=True)),
            ("invalid postimage NDJSON refusal", refusal_case(parent, "bad-post-json", lambda f: Path(f["materialized"]).joinpath(TARGETS[0]).write_bytes(b"not-json\n"))),
            ("output nonempty refusal", refusal_case(parent, "output-nonempty", lambda f: Path(f["output"]).joinpath("occupied").write_text("x", encoding="utf-8"))),
            ("receipt overwrite refusal", refusal_case(parent, "receipt-overwrite", lambda f: Path(f["bundle_receipt"]).write_text("occupied", encoding="utf-8"))),
            ("receipt inside bundle refusal", refusal_case(parent, "receipt-inside", lambda f: f.update({"bundle_receipt": Path(f["output"]) / "receipt.json"})))
        ])
        if hasattr(os, "symlink"):
            results.append(("receipt symlink refusal", refusal_case(parent, "receipt-symlink", lambda f: (Path(f["receipt"]).unlink(), os.symlink(Path(f["validation"]), Path(f["receipt"]))))))
            results.append(("preimage symlink refusal", refusal_case(parent, "preimage-symlink", lambda f: (Path(f["canon_preimage"]).unlink(), os.symlink(Path(f["graph_preimage"]), Path(f["canon_preimage"]))))))
            results.append(("materialized root symlink refusal", refusal_case(parent, "root-symlink", lambda f: (shutil.rmtree(Path(f["materialized"])), os.symlink(Path(f["repo"]), Path(f["materialized"]), target_is_directory=True)))))
        duplicate_fixture = make_fixture(parent / "duplicate-key", False)
        auth_text = Path(duplicate_fixture["authorization"]).read_text(encoding="utf-8")
        Path(duplicate_fixture["authorization"]).write_text(auth_text.replace('"repository":', '"repository": "Duplicate/repo",\n  "repository":', 1), encoding="utf-8")
        results.append(("duplicate JSON key refusal", run(duplicate_fixture).returncode == 3))
        inside_fixture = make_fixture(parent / "inside-worktree", False)
        inside_output = Path(inside_fixture["repo"]) / "bundle"
        inside_output.mkdir()
        inside_fixture["output"] = inside_output
        results.append(("worktree output refusal", run(inside_fixture).returncode == 3))
        tamper = make_fixture(parent / "validator-tamper", False)
        results.append(("tamper setup", run(tamper).returncode == 0))
        patch_path = Path(tamper["output"]) / "repository.patch"
        original_patch = patch_path.read_bytes()
        patch_path.write_bytes(original_patch + b"#tamper\n")
        results.append(("validator patch tamper refusal", validate(tamper).returncode == 3))
        patch_path.write_bytes(original_patch)
        manifest_path = Path(tamper["output"]) / "PATCH_MANIFEST.json"
        original_manifest = manifest_path.read_bytes()
        manifest_path.write_bytes(original_manifest.replace(b"repository.patch", b"repository.patcx", 1))
        results.append(("validator manifest tamper refusal", validate(tamper).returncode == 3))
        manifest_path.write_bytes(original_manifest)
        extra = Path(tamper["output"]) / "EXTRA"
        extra.write_text("x", encoding="utf-8")
        results.append(("validator extra-file refusal", validate(tamper).returncode == 3))
        extra.unlink()
        receipt_path = Path(tamper["bundle_receipt"])
        original_receipt = receipt_path.read_bytes()
        receipt_path.write_bytes(original_receipt.replace(b"PASS_LOCAL", b"POSS_LOCAL", 1))
        results.append(("validator receipt tamper refusal", validate(tamper).returncode == 3))
    failed = [name for name, passed in results if not passed]
    output = {
        "schema": "axm-asoiaf-agot-local-feature-patch-bundle-synthetic-campaign/1",
        "componentId": "asoiaf-agot-local-feature-patch-bundle-sealer-v1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(results) - len(failed),
        "total": len(results),
        "failedCases": failed,
        "noncopyrightedFixtureOnly": True,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
        "realMaterializationReceiptsConsumed": 0,
        "realPatchBundlesSealed": 0,
        "realWorktreesModified": 0,
        "realLiveIndexesModified": 0,
        "realCommitsCreated": 0,
        "realReferencesUpdated": 0,
        "realRemotePushes": 0,
        "realPullRequestsOpened": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0
    }
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not failed else 3


if __name__ == "__main__":
    raise SystemExit(main())
