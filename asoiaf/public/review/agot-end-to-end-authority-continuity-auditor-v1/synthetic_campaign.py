#!/usr/bin/env python3
"""Noncopyrighted adversarial campaign for the AGOT authority-continuity auditor."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parent
AUDITOR = ROOT / "audit_lane.py"
VALIDATOR = ROOT / "validate_receipt.py"

spec = importlib.util.spec_from_file_location("agot_continuity_audit", AUDITOR)
if spec is None or spec.loader is None:
    raise RuntimeError("auditor module could not be loaded")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
STEP_SPECS = module.STEP_SPECS


def run(command: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        env={**os.environ, "PYTHONWARNINGS": "error", "PYTHONSAFEPATH": "1"},
        capture_output=True,
        text=True,
    )


def metadata_for(step: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "axm-asoiaf-agot-public-fixture-admission/1",
        "componentId": step["componentId"],
        "status": step["statuses"][0],
        "nextAuthorityHold": step["holds"][0],
        "counts": {
            "repositoryFilesWrittenByRuntime": 0,
            "worktreesModifiedByRuntime": 0,
            "liveIndexesModifiedByRuntime": 0,
            "commitsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "automaticCanonPromotions": 0,
            "automaticGraphMutations": 0,
        },
        "authorityBoundary": {
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
            "canonEffect": "none",
            "graphEffect": "none",
            "automaticCanonEffect": "none",
            "automaticGraphEffect": "none",
        },
    }


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def make_repository(root: Path) -> None:
    review = root / "asoiaf" / "public" / "review"
    review.mkdir(parents=True)
    for step in STEP_SPECS:
        directory = review / step["directory"]
        directory.mkdir()
        write_json(directory / "ADMISSION.json", metadata_for(step))
        (directory / "README.md").write_text(
            f"# {step['componentId']}\n\n{step['statuses'][0]}\n\n{step['holds'][0]}\n",
            encoding="utf-8",
        )
    run(["git", "init", "-q"], root)
    run(["git", "config", "user.email", "fixture@example.invalid"], root)
    run(["git", "config", "user.name", "Public Fixture"], root)
    run(["git", "add", "."], root)
    committed = run(["git", "commit", "-q", "-m", "public continuity fixture"], root)
    if committed.returncode != 0:
        raise RuntimeError(committed.stderr)


def audit(repo: Path, output: Path) -> subprocess.CompletedProcess[str]:
    return run([
        "python",
        "-W",
        "error",
        "-S",
        str(AUDITOR),
        "--repository-root",
        str(repo),
        "--output",
        str(output),
    ])


def validate(receipt: Path) -> subprocess.CompletedProcess[str]:
    return run([
        "python",
        "-W",
        "error",
        "-S",
        str(VALIDATOR),
        "--receipt",
        str(receipt),
    ])


def parsed(completed: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        raise AssertionError("JSON object output required")
    return value


def expect_pass(completed: subprocess.CompletedProcess[str], status: str) -> dict[str, Any]:
    if completed.returncode != 0:
        raise AssertionError(completed.stderr or completed.stdout)
    value = parsed(completed)
    if value.get("status") != status:
        raise AssertionError(value)
    return value


def expect_refusal(completed: subprocess.CompletedProcess[str], phrase: str) -> None:
    if completed.returncode == 0:
        raise AssertionError("expected refusal")
    value = parsed(completed)
    if phrase not in str(value.get("reason", "")):
        raise AssertionError(value)


def mutate_json(path: Path, mutation: Callable[[dict[str, Any]], None]) -> None:
    value = json.loads(path.read_text(encoding="utf-8"))
    mutation(value)
    write_json(path, value)


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    def case(name: str, action: Callable[[], None]) -> None:
        try:
            action()
        except Exception as exc:
            results.append((name, False, str(exc)))
        else:
            results.append((name, True, ""))

    with tempfile.TemporaryDirectory(prefix="axm-agot-continuity-") as temporary:
        temp = Path(temporary)
        repo = temp / "repo"
        repo.mkdir()
        make_repository(repo)
        review = repo / "asoiaf" / "public" / "review"

        receipt_one = temp / "receipt-one.json"
        receipt_two = temp / "receipt-two.json"

        def happy_audit() -> None:
            value = expect_pass(
                audit(repo, receipt_one),
                "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD",
            )
            if value["lane"]["stepCount"] != 16:
                raise AssertionError("step census mismatch")
            if value["authorityBoundary"]["canonEffect"] != "none":
                raise AssertionError("canon boundary changed")

        case("valid sixteen-step public fixture", happy_audit)
        case(
            "independent receipt validation",
            lambda: expect_pass(
                validate(receipt_one),
                "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_RECEIPT_VALID",
            ),
        )

        def deterministic_replay() -> None:
            expect_pass(
                audit(repo, receipt_two),
                "PASS_AGOT_END_TO_END_AUTHORITY_CONTINUITY_VERIFIED_REAL_TRANSACTION_WITHHELD",
            )
            first = json.loads(receipt_one.read_text(encoding="utf-8"))
            second = json.loads(receipt_two.read_text(encoding="utf-8"))
            if first != second:
                raise AssertionError("deterministic replay diverged")

        case("deterministic audit replay", deterministic_replay)

        first_step = STEP_SPECS[0]
        first_dir = review / first_step["directory"]
        first_json = first_dir / "ADMISSION.json"

        def missing_component() -> None:
            backup = temp / "missing-component"
            first_dir.rename(backup)
            try:
                expect_refusal(audit(repo, temp / "missing.json"), "component directory missing")
            finally:
                backup.rename(first_dir)

        case("missing component refusal", missing_component)

        def missing_status() -> None:
            original = first_json.read_bytes()
            mutate_json(first_json, lambda value: value.__setitem__("status", "HOLD_FIXTURE"))
            (first_dir / "README.md").write_text("fixture without status\n" + first_step["holds"][0] + "\n", encoding="utf-8")
            try:
                expect_refusal(audit(repo, temp / "missing-status.json"), "missing status boundary")
            finally:
                first_json.write_bytes(original)
                (first_dir / "README.md").write_text(
                    f"# {first_step['componentId']}\n\n{first_step['statuses'][0]}\n\n{first_step['holds'][0]}\n",
                    encoding="utf-8",
                )

        case("missing status refusal", missing_status)

        def missing_hold() -> None:
            original = first_json.read_bytes()
            mutate_json(first_json, lambda value: value.__setitem__("nextAuthorityHold", "HOLD_FIXTURE"))
            (first_dir / "README.md").write_text("fixture\n" + first_step["statuses"][0] + "\n", encoding="utf-8")
            try:
                expect_refusal(audit(repo, temp / "missing-hold.json"), "missing authority hold")
            finally:
                first_json.write_bytes(original)
                (first_dir / "README.md").write_text(
                    f"# {first_step['componentId']}\n\n{first_step['statuses'][0]}\n\n{first_step['holds'][0]}\n",
                    encoding="utf-8",
                )

        case("missing authority hold refusal", missing_hold)

        def component_identity_drift() -> None:
            original = first_json.read_bytes()
            mutate_json(first_json, lambda value: value.__setitem__("componentId", "asoiaf-agot-drifted-fixture-v1"))
            (first_dir / "README.md").write_text(first_step["statuses"][0] + "\n" + first_step["holds"][0] + "\n", encoding="utf-8")
            try:
                expect_refusal(audit(repo, temp / "identity.json"), "component identity absent")
            finally:
                first_json.write_bytes(original)
                (first_dir / "README.md").write_text(
                    f"# {first_step['componentId']}\n\n{first_step['statuses'][0]}\n\n{first_step['holds'][0]}\n",
                    encoding="utf-8",
                )

        case("component identity drift refusal", component_identity_drift)

        def symlink_metadata() -> None:
            original = first_json.read_bytes()
            first_json.unlink()
            target = temp / "external-admission.json"
            target.write_bytes(original)
            first_json.symlink_to(target)
            try:
                expect_refusal(audit(repo, temp / "symlink-metadata.json"), "symlink refused")
            finally:
                first_json.unlink()
                first_json.write_bytes(original)

        case("symlink metadata refusal", symlink_metadata)

        def symlink_component() -> None:
            backup = temp / "component-backup"
            first_dir.rename(backup)
            first_dir.symlink_to(backup, target_is_directory=True)
            try:
                expect_refusal(audit(repo, temp / "symlink-component.json"), "component directory missing or unsafe")
            finally:
                first_dir.unlink()
                backup.rename(first_dir)

        case("symlink component refusal", symlink_component)

        def duplicate_json_key() -> None:
            original = first_json.read_bytes()
            first_json.write_text('{"schema":"x","schema":"y"}\n', encoding="utf-8")
            try:
                expect_refusal(audit(repo, temp / "duplicate.json"), "duplicate JSON key")
            finally:
                first_json.write_bytes(original)

        case("duplicate metadata key refusal", duplicate_json_key)

        def invalid_utf8() -> None:
            original = first_json.read_bytes()
            first_json.write_bytes(b"\xff\xfe\x00")
            try:
                expect_refusal(audit(repo, temp / "utf8.json"), "metadata is not UTF-8")
            finally:
                first_json.write_bytes(original)

        case("invalid UTF-8 refusal", invalid_utf8)

        def no_metadata_object() -> None:
            original = first_json.read_bytes()
            first_json.rename(first_dir / "fixture.txt")
            try:
                expect_refusal(audit(repo, temp / "no-object.json"), "no admission metadata object")
            finally:
                (first_dir / "fixture.txt").rename(first_json)
                first_json.write_bytes(original)

        case("missing admission object refusal", no_metadata_object)

        def private_source_field() -> None:
            original = first_json.read_bytes()
            mutate_json(first_json, lambda value: value.__setitem__("sourceText", "public fixture words"))
            try:
                expect_refusal(audit(repo, temp / "source-field.json"), "private source or payload field refused")
            finally:
                first_json.write_bytes(original)

        case("private source field refusal", private_source_field)

        def private_payload_field() -> None:
            original = first_json.read_bytes()
            mutate_json(first_json, lambda value: value.__setitem__("privatePayload", {"fixture": True}))
            try:
                expect_refusal(audit(repo, temp / "payload-field.json"), "private source or payload field refused")
            finally:
                first_json.write_bytes(original)

        case("private payload field refusal", private_payload_field)

        for field, value in [
            ("automaticCanonPromotions", 1),
            ("automaticGraphMutations", 1),
            ("repositoryFilesWrittenByRuntime", 1),
            ("worktreesModifiedByRuntime", 1),
            ("liveIndexesModifiedByRuntime", 1),
            ("commitsCreatedByRuntime", 1),
            ("referencesUpdatedByRuntime", 1),
            ("remotePushesByRuntime", 1),
            ("pullRequestsOpenedByRuntime", 1),
        ]:
            def count_case(field: str = field, value: int = value) -> None:
                original = first_json.read_bytes()
                def mutate(data: dict[str, Any]) -> None:
                    data["counts"][field] = value
                mutate_json(first_json, mutate)
                try:
                    expect_refusal(audit(repo, temp / f"count-{field}.json"), "runtime effect count changed")
                finally:
                    first_json.write_bytes(original)
            case(f"nonzero {field} refusal", count_case)

        for field in ("canonEffect", "graphEffect", "automaticCanonEffect", "automaticGraphEffect"):
            def effect_case(field: str = field) -> None:
                original = first_json.read_bytes()
                def mutate(data: dict[str, Any]) -> None:
                    data["authorityBoundary"][field] = "activate"
                mutate_json(first_json, mutate)
                try:
                    expect_refusal(audit(repo, temp / f"effect-{field}.json"), "automatic effect boundary changed")
                finally:
                    first_json.write_bytes(original)
            case(f"automatic {field} refusal", effect_case)

        case(
            "output inside repository refusal",
            lambda: expect_refusal(audit(repo, repo / "continuity.json"), "outside repository"),
        )
        case(
            "output overwrite refusal",
            lambda: expect_refusal(audit(repo, receipt_one), "output already exists"),
        )
        case(
            "non-repository root refusal",
            lambda: expect_refusal(audit(temp, temp / "not-repo.json"), "repository root missing"),
        )

        def tampered_receipt() -> None:
            value = json.loads(receipt_one.read_text(encoding="utf-8"))
            value["nextAuthorityHold"] = "EFFECT_ACTIVATION_ALLOWED"
            path = temp / "tampered-receipt.json"
            write_json(path, value)
            expect_refusal(validate(path), "receipt status or next hold mismatch")

        case("tampered receipt refusal", tampered_receipt)

        def reordered_steps() -> None:
            value = json.loads(receipt_one.read_text(encoding="utf-8"))
            value["lane"]["steps"][0], value["lane"]["steps"][1] = value["lane"]["steps"][1], value["lane"]["steps"][0]
            value["receiptSha256"] = "0" * 64
            path = temp / "reordered.json"
            write_json(path, value)
            expect_refusal(validate(path), "receipt self-digest mismatch")

        case("reordered receipt refusal", reordered_steps)

        def valid_digest_with_reordered_steps() -> None:
            value = json.loads(receipt_one.read_text(encoding="utf-8"))
            value["lane"]["steps"][0], value["lane"]["steps"][1] = value["lane"]["steps"][1], value["lane"]["steps"][0]
            value["receiptSha256"] = "SELF_DIGESTED_OUTPUT"
            value["receiptSha256"] = hashlib.sha256(
                json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            path = temp / "reordered-valid-digest.json"
            write_json(path, value)
            expect_refusal(validate(path), "ordered component identity mismatch")

        case("reordered valid-digest receipt refusal", valid_digest_with_reordered_steps)

        def nonzero_substantive_census() -> None:
            value = json.loads(receipt_one.read_text(encoding="utf-8"))
            value["substantiveCensus"]["realNamedHumanTransactionsConsumed"] = 1
            value["receiptSha256"] = "SELF_DIGESTED_OUTPUT"
            value["receiptSha256"] = hashlib.sha256(
                json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            path = temp / "nonzero-census.json"
            write_json(path, value)
            expect_refusal(validate(path), "substantive census is not zero")

        case("nonzero substantive census refusal", nonzero_substantive_census)

        def private_read_claim() -> None:
            value = json.loads(receipt_one.read_text(encoding="utf-8"))
            value["lane"]["steps"][3]["privateSourceTextRead"] = True
            value["receiptSha256"] = "SELF_DIGESTED_OUTPUT"
            value["receiptSha256"] = hashlib.sha256(
                json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            path = temp / "private-read.json"
            write_json(path, value)
            expect_refusal(validate(path), "private source read boundary changed")

        case("private source read claim refusal", private_read_claim)

    failed = [{"name": name, "reason": reason} for name, passed, reason in results if not passed]
    report = {
        "schema": "axm-asoiaf-agot-end-to-end-authority-continuity-synthetic-campaign/1",
        "componentId": "asoiaf-agot-end-to-end-authority-continuity-auditor-v1",
        "status": "PASS" if not failed else "FAIL",
        "passed": len(results) - len(failed),
        "total": len(results),
        "failedCases": failed,
        "noncopyrightedFixtureOnly": True,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
        "realPrivateParagraphsConsumed": 0,
        "realNamedHumanTransactionsConsumed": 0,
        "componentRuntimesExecuted": 0,
        "repositoryFilesWrittenByRuntime": 0,
        "worktreesModifiedByRuntime": 0,
        "liveIndexesModifiedByRuntime": 0,
        "commitsCreatedByRuntime": 0,
        "referencesUpdatedByRuntime": 0,
        "remotePushesByRuntime": 0,
        "pullRequestsOpenedByRuntime": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
