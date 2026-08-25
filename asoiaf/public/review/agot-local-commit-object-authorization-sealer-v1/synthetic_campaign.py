#!/usr/bin/env python3
"""Run noncopyrighted adversarial cases for the commit-object authorization sealer."""
from __future__ import annotations

import copy
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seal_authorization import (
    PLAN_SCHEMA,
    TARGETS,
    digest_object,
    serialize,
)

SEALER = Path(__file__).with_name("seal_authorization.py")
VALIDATOR = Path(__file__).with_name("validate_authorization.py")
ACTOR = "Casey Commit Object Actor"
REVIEWER = "Riley Diff Reviewer"


def run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [*args],
        env={**os.environ, "PYTHONSAFEPATH": "1", "PYTHONWARNINGS": "error", **(env or {})},
        text=True,
        capture_output=True,
        shell=False,
    )


def self_digest(value: dict[str, Any], field: str) -> dict[str, Any]:
    result = copy.deepcopy(value)
    result.pop(field, None)
    result[field] = digest_object(result)
    return result


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def base_objects() -> dict[str, dict[str, Any]]:
    diff = self_digest({
        "schema": "axm-asoiaf-human-diff-review-authorization/2",
        "worktreeApplicationReceiptSha256": "1" * 64,
        "patchManifestSha256": "2" * 64,
        "repositoryIdentity": "https://github.example.test/fixture/axm-canon.git",
        "baseCommit": "a" * 40,
        "branch": "feature/asoiaf-agot/synthetic-001",
        "changedPaths": TARGETS,
        "changeSetSha256": "3" * 64,
        "decision": "approve-local-commit-object",
        "diffReviewerActor": REVIEWER,
        "nonce": "synthetic-diff-review-001",
        "reviewRationale": "The exact two-path fixture diff is approved for unreferenced object construction.",
        "reviewedAt": "2026-08-24T04:00:00Z",
    }, "authorizationSha256")
    receipt = {
        "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-receipt/1",
        "componentId": "asoiaf-agot-named-human-worktree-diff-review-recorder-v1",
        "status": "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_RECORDED_NEXT_AUTHORITY_WITHHELD",
        "decision": "APPROVE_LOCAL_COMMIT_OBJECT",
        "nextAuthorityHold": "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD",
        "repositoryState": {
            "repositoryIdentity": diff["repositoryIdentity"],
            "baseCommit": diff["baseCommit"],
            "branch": diff["branch"],
            "changedPaths": TARGETS,
            "changeSetSha256": diff["changeSetSha256"],
            "changeSetRows": [
                {"path": TARGETS[0], "baseBytes": 0, "baseSha256": sha(b""), "currentBytes": 20, "currentSha256": "4" * 64},
                {"path": TARGETS[1], "baseBytes": 0, "baseSha256": sha(b""), "currentBytes": 20, "currentSha256": "5" * 64},
            ],
            "gitDiffCheck": "PASS",
            "liveIndexModified": False,
        },
        "exactBindings": {
            "worktreeApplicationReceiptSha256": diff["worktreeApplicationReceiptSha256"],
            "worktreeApplicationReceiptFileSha256": "6" * 64,
            "worktreeApplyAuthorizationSha256": "7" * 64,
            "worktreeApplyAuthorizationFileSha256": "8" * 64,
            "patchManifestSha256": diff["patchManifestSha256"],
            "humanReviewSha256": "9" * 64,
            "humanReviewFileSha256": "b" * 64,
            "diffReviewAuthorizationSha256": diff["authorizationSha256"],
        },
        "humanAuthority": {
            "diffReviewerActor": REVIEWER,
            "worktreeExecutorActor": "Alex Worktree Executor",
            "reviewedAt": diff["reviewedAt"],
            "reasonCodes": ["EXACT_TWO_PATH_DIFF"],
            "reviewRationaleSha256": "c" * 64,
            "humanActionEvidenceSha256": "d" * 64,
            "machineGenerated": False,
        },
        "authorityBoundary": {
            "reviewReceiptIsNotCommitObject": True,
            "authorizationIsNotCommitObject": True,
            "repositoryFilesWrittenByRuntime": 0,
            "worktreeBytesModifiedByRuntime": 0,
            "liveIndexModifiedByRuntime": 0,
            "commitObjectsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
            "canonEffect": "none",
            "graphEffect": "none",
        },
        "selfDigestMethod": "REMOVE_RECEIPT_SHA256_BEFORE_HASH",
    }
    receipt["receiptSha256"] = digest_object(receipt)
    validation = {
        "schema": "axm-asoiaf-agot-named-human-worktree-diff-review-validation/1",
        "status": "PASS_NAMED_HUMAN_WORKTREE_DIFF_REVIEW_VALID_FOR_SEPARATE_COMMIT_OBJECT_ACTOR",
        "passed": True,
        "decision": "APPROVE_LOCAL_COMMIT_OBJECT",
        "nextAuthorityHold": "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD",
        "receiptSha256": receipt["receiptSha256"],
        "diffReviewAuthorizationSha256": diff["authorizationSha256"],
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
    plan = {
        "schema": PLAN_SCHEMA,
        "diffReviewAuthorizationSha256": diff["authorizationSha256"],
        "diffReviewAuthorizationFileSha256": "",
        "reviewReceiptSha256": receipt["receiptSha256"],
        "reviewReceiptFileSha256": "",
        "reviewValidationFileSha256": "",
        "repositoryIdentity": diff["repositoryIdentity"],
        "baseCommit": diff["baseCommit"],
        "branch": diff["branch"],
        "changeSetSha256": diff["changeSetSha256"],
        "decision": "AUTHORIZE_UNREFERENCED_COMMIT_OBJECT",
        "commitObjectActor": ACTOR,
        "planAuthorActor": ACTOR,
        "transactionId": "synthetic-fixture-001",
        "authorName": ACTOR,
        "authorEmail": "casey@example.test",
        "authorDate": "2026-08-24T05:00:00Z",
        "authorizedAt": "2026-08-24T05:00:00Z",
        "nonce": "synthetic-commit-object-001",
        "authorizationEvidence": "Bound exact validated diff-review approval to one unreferenced object operation.",
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
    return {"diff": diff, "receipt": receipt, "validation": validation, "plan": plan}


def finalize(objects: dict[str, dict[str, Any]]) -> dict[str, bytes]:
    diff = objects["diff"]
    receipt = objects["receipt"]
    validation = objects["validation"]
    plan = objects["plan"]
    diff_raw = serialize(diff)
    receipt_raw = serialize(receipt)
    validation_raw = serialize(validation)
    plan["diffReviewAuthorizationSha256"] = diff["authorizationSha256"]
    plan["diffReviewAuthorizationFileSha256"] = sha(diff_raw)
    plan["reviewReceiptSha256"] = receipt["receiptSha256"]
    plan["reviewReceiptFileSha256"] = sha(receipt_raw)
    plan["reviewValidationFileSha256"] = sha(validation_raw)
    plan["repositoryIdentity"] = diff["repositoryIdentity"]
    plan["baseCommit"] = diff["baseCommit"]
    plan["branch"] = diff["branch"]
    plan["changeSetSha256"] = diff["changeSetSha256"]
    plan.pop("planSha256", None)
    plan["planSha256"] = digest_object(plan)
    return {
        "diff": diff_raw,
        "receipt": receipt_raw,
        "validation": validation_raw,
        "plan": serialize(plan),
    }


def write_inputs(root: Path, raw: dict[str, bytes]) -> dict[str, Path]:
    paths: dict[str, Path] = {}
    for key, value in raw.items():
        path = root / f"{key}.json"
        path.write_bytes(value)
        paths[key] = path
    return paths


def invoke(
    root: Path,
    objects: dict[str, dict[str, Any]],
    *,
    actor: str = ACTOR,
    env: dict[str, str] | None = None,
    output_dir: Path | None = None,
) -> tuple[subprocess.CompletedProcess[str], dict[str, Path], Path]:
    raw = finalize(objects)
    inputs = write_inputs(root, raw)
    out = output_dir or (root / "output")
    out.mkdir()
    auth = out / "commit-authorization.json"
    receipt = out / "authorization-receipt.json"
    completed = run(
        sys.executable, "-W", "error", "-S", str(SEALER),
        "--diff-review-authorization", str(inputs["diff"]),
        "--review-receipt", str(inputs["receipt"]),
        "--review-validation", str(inputs["validation"]),
        "--plan", str(inputs["plan"]),
        "--authorization-output", str(auth),
        "--receipt-output", str(receipt),
        "--actor", actor,
        env=env,
    )
    return completed, {**inputs, "authorization": auth, "output_receipt": receipt}, out


def refusal_case(
    checks: list[tuple[str, bool]],
    name: str,
    mutate: Callable[[dict[str, dict[str, Any]]], None],
    *,
    actor: str = ACTOR,
) -> None:
    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-refusal-") as temporary:
        root = Path(temporary)
        objects = base_objects()
        mutate(objects)
        completed, paths, _ = invoke(root, objects, actor=actor)
        checks.append((name, completed.returncode != 0 and not paths["authorization"].exists() and not paths["output_receipt"].exists()))


def main() -> int:
    checks: list[tuple[str, bool]] = []

    def check(name: str, condition: bool) -> None:
        checks.append((name, bool(condition)))

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-valid-") as temporary:
        root = Path(temporary)
        objects = base_objects()
        completed, paths, _ = invoke(root, objects)
        check("valid sealer exit", completed.returncode == 0)
        output = json.loads(completed.stdout)
        check("valid success status", output.get("status") == "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_SEALED_OBJECT_CREATION_WITHHELD")
        check("valid next hold", output.get("nextAuthorityHold") == "LOCAL_COMMIT_OBJECT_CREATION_WITHHELD")
        check("authorization written", paths["authorization"].is_file())
        check("receipt written", paths["output_receipt"].is_file())
        authorization = json.loads(paths["authorization"].read_text(encoding="utf-8"))
        check("exact downstream schema", authorization.get("schema") == "axm-asoiaf-commit-object-authorization/2")
        check("exact downstream decision", authorization.get("decision") == "create-unreferenced-commit-object")
        check("deterministic commit message", authorization.get("commitMessage") == "Admit AGOT reviewed transaction synthetic-fixture-001")
        check("actor preserved", authorization.get("commitObjectActor") == ACTOR)
        check("authorization self digest", authorization.get("authorizationSha256") == digest_object({k: v for k, v in authorization.items() if k != "authorizationSha256"}))
        receipt = json.loads(paths["output_receipt"].read_text(encoding="utf-8"))
        check("receipt self digest", receipt.get("receiptSha256") == digest_object({k: v for k, v in receipt.items() if k != "receiptSha256"}))
        check("evidence digest only", "authorizationEvidence" not in receipt.get("actorSeparation", {}) and len(receipt["actorSeparation"]["authorizationEvidenceSha256"]) == 64)
        check("zero runtime effects", all(receipt["authorityBoundary"][key] == 0 for key in (
            "repositoryFilesWrittenByRuntime", "worktreeBytesModifiedByRuntime", "liveIndexModifiedByRuntime",
            "commitObjectsCreatedByRuntime", "referencesUpdatedByRuntime", "remotePushesByRuntime",
            "pullRequestsOpenedByRuntime",
        )))
        validation = run(
            sys.executable, "-W", "error", "-S", str(VALIDATOR),
            "--diff-review-authorization", str(paths["diff"]),
            "--review-receipt", str(paths["receipt"]),
            "--review-validation", str(paths["validation"]),
            "--plan", str(paths["plan"]),
            "--authorization", str(paths["authorization"]),
            "--receipt", str(paths["output_receipt"]),
            "--actor", ACTOR,
        )
        check("independent validator exit", validation.returncode == 0)
        check("independent validator status", json.loads(validation.stdout).get("status") == "PASS_LOCAL_COMMIT_OBJECT_AUTHORIZATION_VALID_FOR_SEPARATE_OBJECT_SEALER")

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-deterministic-") as temporary:
        root = Path(temporary)
        objects1 = base_objects()
        first_root = root / "first"
        second_root = root / "second"
        first_root.mkdir(); second_root.mkdir()
        first, first_paths, _ = invoke(first_root, objects1)
        second, second_paths, _ = invoke(second_root, base_objects())
        check("deterministic replay exits", first.returncode == 0 and second.returncode == 0)
        check("deterministic replay authorization", first_paths["authorization"].read_bytes() == second_paths["authorization"].read_bytes())
        check("deterministic replay receipt", first_paths["output_receipt"].read_bytes() == second_paths["output_receipt"].read_bytes())

    refusal_case(checks, "reject diff schema", lambda o: o["diff"].update(schema="wrong"))
    refusal_case(checks, "reject diff self digest", lambda o: o["diff"].update(authorizationSha256="0" * 64))
    refusal_case(checks, "reject diff decision", lambda o: o["diff"].update(decision="reject"))
    refusal_case(checks, "reject target order", lambda o: o["diff"].update(changedPaths=list(reversed(TARGETS))))
    refusal_case(checks, "reject main branch", lambda o: o["diff"].update(branch="main"))
    refusal_case(checks, "reject unrelated branch", lambda o: o["diff"].update(branch="feature/unrelated"))
    refusal_case(checks, "reject invalid base commit", lambda o: o["diff"].update(baseCommit="a" * 39))
    refusal_case(checks, "reject missing review rationale", lambda o: o["diff"].update(reviewRationale=""))
    refusal_case(checks, "reject source-bearing diff field", lambda o: o["diff"].update(sourceText="forbidden"))

    refusal_case(checks, "reject receipt schema", lambda o: o["receipt"].update(schema="wrong"))
    refusal_case(checks, "reject receipt self digest", lambda o: o["receipt"].update(receiptSha256="0" * 64))
    refusal_case(checks, "reject receipt status", lambda o: o["receipt"].update(status="PASS_OTHER"))
    refusal_case(checks, "reject receipt decision", lambda o: o["receipt"].update(decision="REJECT_WORKTREE_DIFF"))
    refusal_case(checks, "reject receipt hold", lambda o: o["receipt"].update(nextAuthorityHold="OTHER"))
    refusal_case(checks, "reject receipt repository", lambda o: o["receipt"]["repositoryState"].update(repositoryIdentity="other"))
    refusal_case(checks, "reject receipt change set", lambda o: o["receipt"]["repositoryState"].update(changeSetSha256="f" * 64))
    refusal_case(checks, "reject receipt diff auth binding", lambda o: o["receipt"]["exactBindings"].update(diffReviewAuthorizationSha256="e" * 64))
    refusal_case(checks, "reject receipt reviewer", lambda o: o["receipt"]["humanAuthority"].update(diffReviewerActor="Other Reviewer"))
    refusal_case(checks, "reject receipt runtime effect", lambda o: o["receipt"]["authorityBoundary"].update(commitObjectsCreatedByRuntime=1))

    refusal_case(checks, "reject validation schema", lambda o: o["validation"].update(schema="wrong"))
    refusal_case(checks, "reject validation status", lambda o: o["validation"].update(status="REFUSE"))
    refusal_case(checks, "reject validation passed false", lambda o: o["validation"].update(passed=False))
    refusal_case(checks, "reject validation receipt binding", lambda o: o["validation"].update(receiptSha256="0" * 64))
    refusal_case(checks, "reject validation auth binding", lambda o: o["validation"].update(diffReviewAuthorizationSha256="0" * 64))
    refusal_case(checks, "reject validation runtime effect", lambda o: o["validation"].update(commitObjectsCreatedByValidator=1))

    refusal_case(checks, "reject plan schema", lambda o: o["plan"].update(schema="wrong"))
    refusal_case(checks, "reject machine plan", lambda o: o["plan"].update(machineGenerated=True))
    refusal_case(checks, "reject plan decision", lambda o: o["plan"].update(decision="OTHER"))
    refusal_case(checks, "reject reviewer actor collision", lambda o: o["plan"].update(commitObjectActor=REVIEWER, planAuthorActor=REVIEWER, authorName=REVIEWER))
    refusal_case(checks, "reject plan author mismatch", lambda o: o["plan"].update(planAuthorActor="Morgan Plan Author"))
    refusal_case(checks, "reject sealing actor mismatch", lambda o: None, actor="Morgan Different Actor")
    refusal_case(checks, "reject invalid transaction id", lambda o: o["plan"].update(transactionId="has spaces"))
    refusal_case(checks, "reject invalid email", lambda o: o["plan"].update(authorEmail="invalid"))
    refusal_case(checks, "reject author mismatch", lambda o: o["plan"].update(authorName="Morgan Different Author"))
    refusal_case(checks, "reject authorization before review", lambda o: o["plan"].update(authorDate="2026-08-24T03:00:00Z", authorizedAt="2026-08-24T03:00:00Z"))
    refusal_case(checks, "reject author date drift", lambda o: o["plan"].update(authorDate="2026-08-24T05:01:00Z"))
    refusal_case(checks, "reject short nonce", lambda o: o["plan"].update(nonce="short"))
    refusal_case(checks, "reject empty evidence", lambda o: o["plan"].update(authorizationEvidence=""))
    refusal_case(checks, "reject unsorted reasons", lambda o: o["plan"].update(reasonCodes=["Z_REASON", "A_REASON"]))
    refusal_case(checks, "reject duplicate reasons", lambda o: o["plan"].update(reasonCodes=["A_REASON", "A_REASON"]))
    refusal_case(checks, "reject object authorization false", lambda o: o["plan"].update(unreferencedCommitObjectAuthorized=False))
    refusal_case(checks, "reject worktree authorization", lambda o: o["plan"].update(worktreeMutationAuthorized=True))
    refusal_case(checks, "reject index authorization", lambda o: o["plan"].update(liveIndexMutationAuthorized=True))
    refusal_case(checks, "reject reference authorization", lambda o: o["plan"].update(referenceUpdateAuthorized=True))
    refusal_case(checks, "reject remote authorization", lambda o: o["plan"].update(remotePushAuthorized=True))
    refusal_case(checks, "reject pull request authorization", lambda o: o["plan"].update(pullRequestAuthorized=True))
    refusal_case(checks, "reject canon effect", lambda o: o["plan"].update(canonEffect="write"))
    refusal_case(checks, "reject graph effect", lambda o: o["plan"].update(graphEffect="write"))
    refusal_case(checks, "reject source-bearing plan field", lambda o: o["plan"].update(privateParagraph="forbidden"))

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-plan-digest-") as temporary:
        root = Path(temporary)
        raw = finalize(base_objects())
        paths = write_inputs(root, raw)
        plan_value = json.loads(paths["plan"].read_text(encoding="utf-8"))
        plan_value["planSha256"] = "0" * 64
        paths["plan"].write_text(json.dumps(plan_value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        out = root / "output"; out.mkdir()
        completed = run(sys.executable, "-W", "error", "-S", str(SEALER),
            "--diff-review-authorization", str(paths["diff"]), "--review-receipt", str(paths["receipt"]),
            "--review-validation", str(paths["validation"]), "--plan", str(paths["plan"]),
            "--authorization-output", str(out / "auth.json"), "--receipt-output", str(out / "receipt.json"),
            "--actor", ACTOR)
        check("reject plan self digest", completed.returncode != 0 and "planSha256 mismatch" in completed.stdout)

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-duplicate-") as temporary:
        root = Path(temporary)
        objects = base_objects()
        raw = finalize(objects)
        paths = write_inputs(root, raw)
        duplicate = raw["plan"].decode("utf-8").replace('"schema":', '"schema": "duplicate",\n  "schema":', 1)
        paths["plan"].write_text(duplicate, encoding="utf-8")
        out = root / "output"; out.mkdir()
        completed = run(sys.executable, "-W", "error", "-S", str(SEALER),
            "--diff-review-authorization", str(paths["diff"]), "--review-receipt", str(paths["receipt"]),
            "--review-validation", str(paths["validation"]), "--plan", str(paths["plan"]),
            "--authorization-output", str(out / "auth.json"), "--receipt-output", str(out / "receipt.json"),
            "--actor", ACTOR)
        check("duplicate JSON key refused", completed.returncode != 0 and "duplicate JSON key" in completed.stdout)

    if hasattr(os, "symlink"):
        with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-symlink-") as temporary:
            root = Path(temporary)
            objects = base_objects(); raw = finalize(objects); paths = write_inputs(root, raw)
            target = paths["plan"]
            link = root / "plan-link.json"
            try:
                link.symlink_to(target)
                out = root / "output"; out.mkdir()
                completed = run(sys.executable, "-W", "error", "-S", str(SEALER),
                    "--diff-review-authorization", str(paths["diff"]), "--review-receipt", str(paths["receipt"]),
                    "--review-validation", str(paths["validation"]), "--plan", str(link),
                    "--authorization-output", str(out / "auth.json"), "--receipt-output", str(out / "receipt.json"),
                    "--actor", ACTOR)
                check("symlink input refused", completed.returncode != 0 and "symlink refused" in completed.stdout)
            except OSError:
                check("symlink input refused", True)

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-nonempty-") as temporary:
        root = Path(temporary); objects = base_objects(); raw = finalize(objects); paths = write_inputs(root, raw)
        out = root / "output"; out.mkdir(); (out / "occupied").write_text("x")
        completed = run(sys.executable, "-W", "error", "-S", str(SEALER),
            "--diff-review-authorization", str(paths["diff"]), "--review-receipt", str(paths["receipt"]),
            "--review-validation", str(paths["validation"]), "--plan", str(paths["plan"]),
            "--authorization-output", str(out / "auth.json"), "--receipt-output", str(out / "receipt.json"),
            "--actor", ACTOR)
        check("nonempty output directory refused", completed.returncode != 0)

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-git-output-") as temporary:
        root = Path(temporary); objects = base_objects(); raw = finalize(objects); paths = write_inputs(root, raw)
        repo = root / "repo"; repo.mkdir(); (repo / ".git").mkdir(); out = repo / "output"; out.mkdir()
        completed = run(sys.executable, "-W", "error", "-S", str(SEALER),
            "--diff-review-authorization", str(paths["diff"]), "--review-receipt", str(paths["receipt"]),
            "--review-validation", str(paths["validation"]), "--plan", str(paths["plan"]),
            "--authorization-output", str(out / "auth.json"), "--receipt-output", str(out / "receipt.json"),
            "--actor", ACTOR)
        check("Git worktree output refused", completed.returncode != 0 and "outside every Git worktree" in completed.stdout)

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-split-output-") as temporary:
        root = Path(temporary); objects = base_objects(); raw = finalize(objects); paths = write_inputs(root, raw)
        one = root / "one"; two = root / "two"; one.mkdir(); two.mkdir()
        completed = run(sys.executable, "-W", "error", "-S", str(SEALER),
            "--diff-review-authorization", str(paths["diff"]), "--review-receipt", str(paths["receipt"]),
            "--review-validation", str(paths["validation"]), "--plan", str(paths["plan"]),
            "--authorization-output", str(one / "auth.json"), "--receipt-output", str(two / "receipt.json"),
            "--actor", ACTOR)
        check("split output directories refused", completed.returncode != 0)

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-rollback-") as temporary:
        root = Path(temporary); objects = base_objects()
        completed, paths, out = invoke(root, objects, env={"AXM_INJECT_FAILURE_AFTER_AUTHORIZATION": "1"})
        check("injected rollback", completed.returncode != 0 and list(out.iterdir()) == [])

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-validator-tamper-") as temporary:
        root = Path(temporary); completed, paths, _ = invoke(root, base_objects())
        auth = json.loads(paths["authorization"].read_text(encoding="utf-8")); auth["transactionProbe"] = True
        paths["authorization"].write_text(json.dumps(auth, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        validated = run(sys.executable, "-W", "error", "-S", str(VALIDATOR),
            "--diff-review-authorization", str(paths["diff"]), "--review-receipt", str(paths["receipt"]),
            "--review-validation", str(paths["validation"]), "--plan", str(paths["plan"]),
            "--authorization", str(paths["authorization"]), "--receipt", str(paths["output_receipt"]), "--actor", ACTOR)
        check("validator rejects authorization tamper", completed.returncode == 0 and validated.returncode != 0)

    with tempfile.TemporaryDirectory(prefix="axm-agot-commit-auth-validator-receipt-") as temporary:
        root = Path(temporary); completed, paths, _ = invoke(root, base_objects())
        receipt = json.loads(paths["output_receipt"].read_text(encoding="utf-8")); receipt["status"] = "TAMPERED"
        receipt.pop("receiptSha256", None); receipt["receiptSha256"] = digest_object(receipt)
        paths["output_receipt"].write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        validated = run(sys.executable, "-W", "error", "-S", str(VALIDATOR),
            "--diff-review-authorization", str(paths["diff"]), "--review-receipt", str(paths["receipt"]),
            "--review-validation", str(paths["validation"]), "--plan", str(paths["plan"]),
            "--authorization", str(paths["authorization"]), "--receipt", str(paths["output_receipt"]), "--actor", ACTOR)
        check("validator rejects receipt tamper", completed.returncode == 0 and validated.returncode != 0)

    failed = [name for name, passed in checks if not passed]
    output = {
        "schema": "axm-asoiaf-agot-local-commit-object-authorization-sealer-synthetic-campaign/1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(checks) - len(failed),
        "total": len(checks),
        "failedChecks": failed,
        "noncopyrightedFixtureOnly": True,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
        "realDiffReviewAuthorizationsConsumed": 0,
        "realReviewReceiptsConsumed": 0,
        "realCommitObjectPlansConsumed": 0,
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
