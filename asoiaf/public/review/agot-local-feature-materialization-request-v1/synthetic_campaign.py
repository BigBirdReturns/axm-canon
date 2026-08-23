#!/usr/bin/env python3
"""Run noncopyrighted adversarial cases for the AGOT materialization-request sealer."""
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

ROOT = Path(__file__).resolve().parent
SEALER = ROOT / "seal_request.py"
VALIDATOR = ROOT / "validate_request.py"
MARKER = "SELF_DIGESTED_OUTPUT"
CANON_PATH = "asoiaf/public/review/ledger/AGOT_CANON_TRANSACTIONS.ndjson"
GRAPH_PATH = "asoiaf/public/review/ledger/AGOT_GRAPH_TRANSACTIONS.ndjson"
ACTOR = "principal:materialization-requester"
REVIEWER = "principal:named-reviewer"
PYTHON = sys.executable
ENVIRONMENT = {**os.environ, "PYTHONWARNINGS": "error", "PYTHONSAFEPATH": "1"}


class CampaignFailure(RuntimeError):
    """One synthetic case failed."""


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_object(value: Any) -> str:
    return sha256(canonical(value))


def mark_digest(value: dict[str, Any], field: str) -> None:
    value[field] = MARKER
    value[field] = digest_object(value)


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")


def write_json(path: Path, value: Any) -> bytes:
    payload = json_bytes(value)
    path.write_bytes(payload)
    return payload


def base_receipt() -> dict[str, Any]:
    proposition = "The fixture beacon remains lit above the north quay."
    receipt: dict[str, Any] = {
        "schema": "axm-asoiaf-agot-named-human-disposition-receipt/1",
        "componentId": "asoiaf-agot-named-human-disposition-recorder-v1",
        "status": "PASS_NAMED_HUMAN_DISPOSITION_RECORDED_NEXT_EFFECT_WITHHELD",
        "candidateId": "AGOT-FIXTURE-001",
        "decision": "ADMIT_EXACT_PROPOSITION",
        "nextAuthorityHold": "LOCAL_FEATURE_MATERIALIZATION_REQUEST_WITHHELD",
        "exactBindings": {
            "intakeSha256": sha256(b"fixture-intake-object"),
            "intakeFileSha256": sha256(b"fixture-intake-file"),
            "validationFileSha256": sha256(b"fixture-validation-file"),
            "dispositionFileSha256": sha256(b"fixture-disposition-file"),
            "dispositionSha256": sha256(b"fixture-disposition-object"),
            "sourceParagraphSha256": sha256(b"fixture-private-paragraph-withheld"),
        },
        "humanAuthority": {
            "reviewerPrincipal": REVIEWER,
            "reviewerDisplayName": "Named Fixture Reviewer",
            "authorPrincipal": REVIEWER,
            "authorDisplayName": "Named Fixture Reviewer",
            "authoredAt": "2026-08-23T19:00:00Z",
            "humanActionEvidence": "fixture-keyboard-confirmation",
            "reasonCodes": ["EXACT_PROPOSITION_REVIEWED", "SOURCE_BINDING_CONFIRMED"],
            "rationale": "The fixture proposition is bounded, atomic, and independently reviewed.",
            "machineGenerated": False,
        },
        "decisionPayload": {
            "admittedProposition": proposition,
            "admittedPropositionSha256": sha256(proposition.encode("utf-8")),
            "replacementIntakeSha256": None,
            "additionalEvidenceKeys": [],
        },
        "authorityBoundary": {
            "receiptIsNotLocalFeatureMaterializationRequest": True,
            "repositoryFilesWrittenByRuntime": 0,
            "commitsCreatedByRuntime": 0,
            "referencesUpdatedByRuntime": 0,
            "remotePushesByRuntime": 0,
            "pullRequestsOpenedByRuntime": 0,
            "privateSourceTextPresent": False,
            "privatePayloadPresent": False,
            "canonEffect": "none",
            "graphEffect": "none",
        },
        "selfDigestMethod": MARKER,
        "receiptSha256": MARKER,
    }
    mark_digest(receipt, "receiptSha256")
    return receipt


def base_plan(
    receipt: dict[str, Any],
    receipt_payload: bytes,
    *,
    canon_state: str = "ABSENT",
    graph_state: str = "ABSENT",
    canon_raw: bytes | None = None,
    graph_raw: bytes | None = None,
) -> dict[str, Any]:
    proposition_sha = receipt["decisionPayload"]["admittedPropositionSha256"]
    source_sha = receipt["exactBindings"]["sourceParagraphSha256"]

    def descriptor(path: str, state: str, raw: bytes | None) -> dict[str, Any]:
        if state == "ABSENT":
            return {"path": path, "state": "ABSENT", "bytes": 0, "sha256": None}
        assert raw is not None
        return {"path": path, "state": "PRESENT", "bytes": len(raw), "sha256": sha256(raw)}

    plan: dict[str, Any] = {
        "schema": "axm-asoiaf-agot-local-feature-materialization-plan/1",
        "candidateId": receipt["candidateId"],
        "dispositionBinding": {
            "receiptSha256": receipt["receiptSha256"],
            "receiptFileSha256": sha256(receipt_payload),
            "propositionSha256": proposition_sha,
            "sourceParagraphSha256": source_sha,
        },
        "requestAuthority": {
            "requesterPrincipal": ACTOR,
            "requesterDisplayName": "Fixture Materialization Requester",
            "authoredAt": "2026-08-23T19:05:00Z",
            "machinePrepared": True,
            "humanAuthorized": True,
            "authorizationEvidence": "fixture-request-authorization",
        },
        "repositoryTarget": {
            "repository": "BigBirdReturns/axm-canon",
            "baseBranch": "main",
            "expectedBaseCommit": "1" * 40,
            "featureBranch": "feature/asoiaf-agot/fixture-001",
            "targetPaths": [CANON_PATH, GRAPH_PATH],
        },
        "classification": {
            "claimClass": "FACTUAL",
            "epistemicClass": "EXPLICIT",
            "rightsClass": "PRIVATE_SOURCE_DERIVATION",
            "continuityClass": "AGOT_OPENING_GATE",
            "reconciliationKeys": ["candidate:AGOT-FIXTURE-001", "source:fixture-paragraph"],
            "subjectKeys": ["location:north-quay", "object:fixture-beacon"],
            "relation": "DESCRIBES",
        },
        "targetPreimages": {
            "canon": descriptor(CANON_PATH, canon_state, canon_raw),
            "graph": descriptor(GRAPH_PATH, graph_state, graph_raw),
        },
        "authorityBoundary": {
            "repositoryEffectAuthorized": False,
            "worktreeWriteAuthorized": False,
            "commitAuthorized": False,
            "referenceUpdateAuthorized": False,
            "remotePushAuthorized": False,
            "pullRequestAuthorized": False,
            "canonEffect": "none",
            "graphEffect": "none",
        },
        "selfDigestMethod": MARKER,
        "planSha256": MARKER,
    }
    mark_digest(plan, "planSha256")
    return plan


def prepare_fixture(
    directory: Path,
    *,
    present: bool = False,
    canon_raw: bytes | None = None,
    graph_raw: bytes | None = None,
) -> dict[str, Any]:
    directory.mkdir(parents=True)
    receipt = base_receipt()
    receipt_path = directory / "receipt.json"
    receipt_payload = write_json(receipt_path, receipt)

    canon_path: Path | None = None
    graph_path: Path | None = None
    if present:
        if canon_raw is None:
            canon_raw = canonical({"schema": "fixture-existing-canon/1", "row": 1}) + b"\n"
        if graph_raw is None:
            graph_raw = canonical({"schema": "fixture-existing-graph/1", "row": 1}) + b"\n"
        canon_path = directory / "canon.ndjson"
        graph_path = directory / "graph.ndjson"
        canon_path.write_bytes(canon_raw)
        graph_path.write_bytes(graph_raw)
    plan = base_plan(
        receipt,
        receipt_payload,
        canon_state="PRESENT" if present else "ABSENT",
        graph_state="PRESENT" if present else "ABSENT",
        canon_raw=canon_raw,
        graph_raw=graph_raw,
    )
    plan_path = directory / "plan.json"
    plan_payload = write_json(plan_path, plan)
    return {
        "directory": directory,
        "receipt": receipt,
        "receiptPath": receipt_path,
        "receiptPayload": receipt_payload,
        "plan": plan,
        "planPath": plan_path,
        "planPayload": plan_payload,
        "canonPath": canon_path,
        "graphPath": graph_path,
        "outputPath": directory / "request.json",
    }


def run_sealer(
    fixture: dict[str, Any],
    *,
    actor: str = ACTOR,
    receipt_path: Path | None = None,
    plan_path: Path | None = None,
    output_path: Path | None = None,
    canon_path: Path | None | object = ...,
    graph_path: Path | None | object = ...,
) -> subprocess.CompletedProcess[str]:
    command = [
        PYTHON,
        "-W",
        "error",
        "-S",
        str(SEALER),
        "--disposition-receipt",
        str(receipt_path or fixture["receiptPath"]),
        "--plan",
        str(plan_path or fixture["planPath"]),
        "--output",
        str(output_path or fixture["outputPath"]),
        "--actor",
        actor,
    ]
    resolved_canon = fixture["canonPath"] if canon_path is ... else canon_path
    resolved_graph = fixture["graphPath"] if graph_path is ... else graph_path
    if resolved_canon is not None:
        command.extend(["--canon-preimage", str(resolved_canon)])
    if resolved_graph is not None:
        command.extend(["--graph-preimage", str(resolved_graph)])
    return subprocess.run(command, check=False, capture_output=True, text=True, env=ENVIRONMENT)


def run_validator(
    fixture: dict[str, Any],
    *,
    request_path: Path | None = None,
    canon_path: Path | None | object = ...,
    graph_path: Path | None | object = ...,
) -> subprocess.CompletedProcess[str]:
    command = [
        PYTHON,
        "-W",
        "error",
        "-S",
        str(VALIDATOR),
        "--request",
        str(request_path or fixture["outputPath"]),
    ]
    resolved_canon = fixture["canonPath"] if canon_path is ... else canon_path
    resolved_graph = fixture["graphPath"] if graph_path is ... else graph_path
    if resolved_canon is not None:
        command.extend(["--canon-preimage", str(resolved_canon)])
    if resolved_graph is not None:
        command.extend(["--graph-preimage", str(resolved_graph)])
    return subprocess.run(command, check=False, capture_output=True, text=True, env=ENVIRONMENT)


def parsed(completed: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    try:
        value = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise CampaignFailure(f"non-JSON output: {completed.stdout!r} stderr={completed.stderr!r}") from exc
    if not isinstance(value, dict):
        raise CampaignFailure("command output is not an object")
    return value


def require_success(completed: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    if completed.returncode != 0:
        raise CampaignFailure(f"expected success, rc={completed.returncode}, stdout={completed.stdout}, stderr={completed.stderr}")
    value = parsed(completed)
    if value.get("status") != "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_SEALED_EXECUTION_WITHHELD":
        raise CampaignFailure("unexpected sealer success status")
    return value


def require_refusal(completed: subprocess.CompletedProcess[str], output_path: Path | None = None) -> dict[str, Any]:
    if completed.returncode != 3:
        raise CampaignFailure(f"expected refusal rc=3, received {completed.returncode}: {completed.stdout} {completed.stderr}")
    value = parsed(completed)
    if value.get("status") != "REFUSE_LOCAL_FEATURE_MATERIALIZATION_REQUEST_NOT_SEALED":
        raise CampaignFailure("unexpected sealer refusal status")
    for field in (
        "postimageFilesWrittenByRuntime",
        "repositoryFilesWrittenByRuntime",
        "worktreesModifiedByRuntime",
        "commitsCreatedByRuntime",
        "referencesUpdatedByRuntime",
        "remotePushesByRuntime",
        "pullRequestsOpenedByRuntime",
    ):
        if value.get(field) != 0:
            raise CampaignFailure(f"refusal changed zero-effect field {field}")
    if value.get("canonEffect") != "none" or value.get("graphEffect") != "none":
        raise CampaignFailure("refusal changed canon or graph effect")
    if output_path is not None and output_path.exists():
        raise CampaignFailure("refusal created output")
    return value


def rewrite_receipt(fixture: dict[str, Any], mutate: Callable[[dict[str, Any]], None], *, rehash: bool) -> None:
    value = copy.deepcopy(fixture["receipt"])
    mutate(value)
    if rehash:
        mark_digest(value, "receiptSha256")
    fixture["receipt"] = value
    fixture["receiptPayload"] = write_json(fixture["receiptPath"], value)


def rewrite_plan(
    fixture: dict[str, Any],
    mutate: Callable[[dict[str, Any]], None],
    *,
    rehash: bool,
    rebind_receipt: bool = False,
) -> None:
    value = copy.deepcopy(fixture["plan"])
    if rebind_receipt:
        receipt = fixture["receipt"]
        value["dispositionBinding"] = {
            "receiptSha256": receipt["receiptSha256"],
            "receiptFileSha256": sha256(fixture["receiptPayload"]),
            "propositionSha256": receipt["decisionPayload"]["admittedPropositionSha256"],
            "sourceParagraphSha256": receipt["exactBindings"]["sourceParagraphSha256"],
        }
    mutate(value)
    if rehash:
        mark_digest(value, "planSha256")
    fixture["plan"] = value
    fixture["planPayload"] = write_json(fixture["planPath"], value)


def campaign() -> dict[str, Any]:
    cases: list[dict[str, Any]] = []

    def execute(name: str, function: Callable[[Path], None], root: Path) -> None:
        case_root = root / f"{len(cases) + 1:02d}-{name}"
        function(case_root)
        cases.append({"name": name, "passed": True})

    with tempfile.TemporaryDirectory(prefix="axm-materialization-request-") as temporary:
        root = Path(temporary)

        def success_absent(path: Path) -> None:
            fixture = prepare_fixture(path)
            value = require_success(run_sealer(fixture))
            if not fixture["outputPath"].is_file():
                raise CampaignFailure("successful request file absent")
            if set(value.get("proposedPostimages") or {}) != {"canon", "graph"}:
                raise CampaignFailure("postimage descriptor census mismatch")
            if value["proposedPostimages"]["canon"]["preimageState"] != "ABSENT":
                raise CampaignFailure("canon absence was not preserved")
            if value["authorityBoundary"]["postimageFilesWrittenByRuntime"] != 0:
                raise CampaignFailure("request sealer wrote a postimage")

        def validate_absent(path: Path) -> None:
            fixture = prepare_fixture(path)
            require_success(run_sealer(fixture))
            completed = run_validator(fixture)
            if completed.returncode != 0:
                raise CampaignFailure(f"validator failed: {completed.stdout} {completed.stderr}")
            value = parsed(completed)
            if value.get("status") != "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_VALID_FOR_SEPARATE_EXECUTOR":
                raise CampaignFailure("unexpected validator status")
            if value.get("postimageFilesWrittenByValidator") != 0:
                raise CampaignFailure("validator wrote postimages")

        def deterministic_absent(path: Path) -> None:
            first = prepare_fixture(path / "a")
            second = prepare_fixture(path / "b")
            require_success(run_sealer(first))
            require_success(run_sealer(second))
            if first["outputPath"].read_bytes() != second["outputPath"].read_bytes():
                raise CampaignFailure("deterministic replay diverged")

        def success_present(path: Path) -> None:
            fixture = prepare_fixture(path, present=True)
            value = require_success(run_sealer(fixture))
            for label in ("canon", "graph"):
                descriptor = value["proposedPostimages"][label]
                if descriptor["preimageState"] != "PRESENT":
                    raise CampaignFailure(f"{label} present state lost")
                if descriptor["postimageBytes"] <= descriptor["preimageBytes"]:
                    raise CampaignFailure(f"{label} append not represented")

        def validate_present(path: Path) -> None:
            fixture = prepare_fixture(path, present=True)
            require_success(run_sealer(fixture))
            completed = run_validator(fixture)
            if completed.returncode != 0 or parsed(completed).get("status") != "PASS_LOCAL_FEATURE_MATERIALIZATION_REQUEST_VALID_FOR_SEPARATE_EXECUTOR":
                raise CampaignFailure("present-preimage validator failed")

        def output_overwrite(path: Path) -> None:
            fixture = prepare_fixture(path)
            require_success(run_sealer(fixture))
            before = fixture["outputPath"].read_bytes()
            value = require_refusal(run_sealer(fixture))
            if "output already exists" not in str(value.get("reason")):
                raise CampaignFailure("overwrite refusal reason missing")
            if fixture["outputPath"].read_bytes() != before:
                raise CampaignFailure("existing output changed")

        def receipt_schema(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_receipt(fixture, lambda value: value.__setitem__("schema", "wrong"), rehash=True)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def receipt_status(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_receipt(fixture, lambda value: value.__setitem__("status", "PASS_OTHER"), rehash=True)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def receipt_decision(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_receipt(fixture, lambda value: value.__setitem__("decision", "REJECT_EXACT_PROPOSITION"), rehash=True)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def receipt_hold(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_receipt(fixture, lambda value: value.__setitem__("nextAuthorityHold", "OTHER_HOLD"), rehash=True)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def receipt_self_digest(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_receipt(fixture, lambda value: value.__setitem__("candidateId", "TAMPERED-CANDIDATE"), rehash=False)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def receipt_private_field(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_receipt(fixture, lambda value: value.__setitem__("sourceText", "forbidden fixture prose"), rehash=True)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def proposition_digest(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_receipt(
                fixture,
                lambda value: value["decisionPayload"].__setitem__("admittedPropositionSha256", "0" * 64),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def plan_schema(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(fixture, lambda value: value.__setitem__("schema", "wrong"), rehash=True)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def plan_candidate(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(fixture, lambda value: value.__setitem__("candidateId", "AGOT-FIXTURE-OTHER"), rehash=True)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def plan_binding(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["dispositionBinding"].__setitem__("receiptFileSha256", "0" * 64),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def same_requester(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["requestAuthority"].__setitem__("requesterPrincipal", REVIEWER),
                rehash=True,
            )
            require_refusal(run_sealer(fixture, actor=REVIEWER), fixture["outputPath"])

        def actor_mismatch(path: Path) -> None:
            fixture = prepare_fixture(path)
            require_refusal(run_sealer(fixture, actor="principal:different-actor"), fixture["outputPath"])

        def authorization_missing(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["requestAuthority"].__setitem__("humanAuthorized", False),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def request_predates(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["requestAuthority"].__setitem__("authoredAt", "2026-08-23T18:59:59Z"),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def wrong_repository(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["repositoryTarget"].__setitem__("repository", "Other/repository"),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def bad_branch(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["repositoryTarget"].__setitem__("featureBranch", "main"),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def path_drift(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["repositoryTarget"].__setitem__("targetPaths", [GRAPH_PATH, CANON_PATH]),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def unsorted_reconciliation(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["classification"].__setitem__(
                    "reconciliationKeys", ["source:fixture-paragraph", "candidate:AGOT-FIXTURE-001"]
                ),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def duplicate_subject(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["classification"].__setitem__(
                    "subjectKeys", ["object:fixture-beacon", "object:fixture-beacon"]
                ),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def plan_self_digest(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["classification"].__setitem__("claimClass", "INTERPRETIVE"),
                rehash=False,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def absent_path_supplied(path: Path) -> None:
            fixture = prepare_fixture(path)
            extra = path / "unexpected.ndjson"
            extra.write_bytes(canonical({"fixture": True}) + b"\n")
            require_refusal(run_sealer(fixture, canon_path=extra), fixture["outputPath"])

        def present_path_missing(path: Path) -> None:
            fixture = prepare_fixture(path, present=True)
            require_refusal(run_sealer(fixture, canon_path=None), fixture["outputPath"])

        def present_digest_mismatch(path: Path) -> None:
            fixture = prepare_fixture(path, present=True)
            fixture["canonPath"].write_bytes(canonical({"changed": True}) + b"\n")
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def present_no_newline(path: Path) -> None:
            raw = canonical({"fixture": "no-newline"})
            fixture = prepare_fixture(path, present=True, canon_raw=raw)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def duplicate_plan_key(path: Path) -> None:
            fixture = prepare_fixture(path)
            fixture["planPath"].write_text(
                '{"schema":"axm-asoiaf-agot-local-feature-materialization-plan/1","schema":"duplicate"}',
                encoding="utf-8",
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def symlink_receipt(path: Path) -> None:
            fixture = prepare_fixture(path)
            link = path / "receipt-link.json"
            link.symlink_to(fixture["receiptPath"].name)
            require_refusal(run_sealer(fixture, receipt_path=link), fixture["outputPath"])

        def plan_private_field(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(fixture, lambda value: value.__setitem__("privatePayload", "forbidden"), rehash=True)
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def plan_effect_authorized(path: Path) -> None:
            fixture = prepare_fixture(path)
            rewrite_plan(
                fixture,
                lambda value: value["authorityBoundary"].__setitem__("commitAuthorized", True),
                rehash=True,
            )
            require_refusal(run_sealer(fixture), fixture["outputPath"])

        def validator_tampered_request(path: Path) -> None:
            fixture = prepare_fixture(path)
            require_success(run_sealer(fixture))
            value = json.loads(fixture["outputPath"].read_text(encoding="utf-8"))
            value["candidateId"] = "AGOT-TAMPERED-REQUEST"
            write_json(fixture["outputPath"], value)
            completed = run_validator(fixture)
            if completed.returncode != 3 or parsed(completed).get("status") != "REFUSE_INVALID_LOCAL_FEATURE_MATERIALIZATION_REQUEST":
                raise CampaignFailure("validator accepted tampered request")

        def validator_wrong_preimage(path: Path) -> None:
            fixture = prepare_fixture(path, present=True)
            require_success(run_sealer(fixture))
            wrong = path / "wrong-canon.ndjson"
            wrong.write_bytes(canonical({"schema": "wrong-but-valid/1"}) + b"\n")
            completed = run_validator(fixture, canon_path=wrong)
            if completed.returncode != 3 or parsed(completed).get("status") != "REFUSE_INVALID_LOCAL_FEATURE_MATERIALIZATION_REQUEST":
                raise CampaignFailure("validator accepted wrong preimage")

        for name, function in (
            ("success-absent-preimages", success_absent),
            ("independent-validation-absent", validate_absent),
            ("deterministic-absent-replay", deterministic_absent),
            ("success-present-preimages", success_present),
            ("independent-validation-present", validate_present),
            ("output-overwrite-refused", output_overwrite),
            ("receipt-schema-refused", receipt_schema),
            ("receipt-status-refused", receipt_status),
            ("receipt-decision-refused", receipt_decision),
            ("receipt-hold-refused", receipt_hold),
            ("receipt-self-digest-refused", receipt_self_digest),
            ("receipt-private-field-refused", receipt_private_field),
            ("proposition-digest-refused", proposition_digest),
            ("plan-schema-refused", plan_schema),
            ("plan-candidate-refused", plan_candidate),
            ("plan-receipt-binding-refused", plan_binding),
            ("requester-reviewer-collapse-refused", same_requester),
            ("actor-mismatch-refused", actor_mismatch),
            ("missing-human-authorization-refused", authorization_missing),
            ("predated-request-refused", request_predates),
            ("wrong-repository-refused", wrong_repository),
            ("unsafe-feature-branch-refused", bad_branch),
            ("target-path-drift-refused", path_drift),
            ("unsorted-reconciliation-refused", unsorted_reconciliation),
            ("duplicate-subject-refused", duplicate_subject),
            ("plan-self-digest-refused", plan_self_digest),
            ("absent-preimage-substitute-refused", absent_path_supplied),
            ("present-preimage-missing-refused", present_path_missing),
            ("present-preimage-digest-refused", present_digest_mismatch),
            ("present-preimage-newline-refused", present_no_newline),
            ("duplicate-json-key-refused", duplicate_plan_key),
            ("symlink-receipt-refused", symlink_receipt),
            ("private-plan-field-refused", plan_private_field),
            ("downstream-effect-authorization-refused", plan_effect_authorized),
            ("validator-tampered-request-refused", validator_tampered_request),
            ("validator-wrong-preimage-refused", validator_wrong_preimage),
        ):
            execute(name, function, root)

    return {
        "schema": "axm-asoiaf-agot-local-feature-materialization-request-synthetic-campaign/1",
        "componentId": "asoiaf-agot-local-feature-materialization-request-v1",
        "status": "PASS",
        "passed": len(cases),
        "total": len(cases),
        "cases": cases,
        "noncopyrightedFixtureOnly": True,
        "privateSourceTextUsed": False,
        "privatePayloadUsed": False,
        "realDispositionReceiptsConsumed": 0,
        "realAdmittedPropositionsConsumed": 0,
        "realMaterializationPlansConsumed": 0,
        "realMaterializationRequestsSealed": 0,
        "realPostimagesMaterialized": 0,
        "realRepositoryFilesWritten": 0,
        "realCommitsCreated": 0,
        "realReferencesUpdated": 0,
        "realRemotePushes": 0,
        "realPullRequestsOpened": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }


def main() -> int:
    try:
        result = campaign()
    except (CampaignFailure, OSError, AssertionError) as exc:
        print(json.dumps({
            "schema": "axm-asoiaf-agot-local-feature-materialization-request-synthetic-campaign/1",
            "status": "FAIL",
            "reason": str(exc),
        }, indent=2, sort_keys=True))
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
