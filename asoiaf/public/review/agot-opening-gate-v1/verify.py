#!/usr/bin/env python3
"""Verify the exact AGOT opening-gate structural triage and inert decision queue."""

from __future__ import annotations

import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent.parent / "corpus-v1" / "OPENING_GATE.json"
EXPECTED_BLOB = "01624a17e21eb0c31d8273f3bf1063402b112fae"
EXPECTED_GATE = "sha256:b8a8cadc1f5a49f0704f1dbe4b38358d86a52ac27520fc193657c0ffb949cda4"
ALLOWED_ACTIONS = ["confirm", "correct", "split", "merge", "reject", "defer"]
EXPECTED_DISPOSITIONS = {
    "agot-opening-gared-night-watch-tenure": "split-before-review",
    "agot-opening-will-poacher-scout": "split-before-review",
    "agot-opening-waymar-reanimation": "review-as-is",
    "agot-opening-bran-first-execution": "split-before-review",
    "agot-opening-jon-instructs-bran": "review-as-is",
    "agot-opening-eddard-courage-lesson": "review-as-is",
    "agot-opening-stark-execution-law": "split-before-review",
    "agot-opening-five-direwolf-pups": "review-as-is",
    "agot-opening-sixth-white-pup": "review-as-is",
    "agot-opening-catelyn-faith": "rewrite-before-review",
    "agot-opening-jon-arryn-death": "review-as-is",
    "agot-opening-king-rides-winterfell": "review-as-is",
    "agot-opening-catelyn-omen-reading": "split-before-review",
    "agot-opening-viserys-ten-thousand-dothraki": "split-before-review",
    "agot-opening-daenerys-red-door-memory": "split-before-review",
    "agot-opening-viserys-beggar-king": "split-before-review",
    "agot-opening-royal-party-scale": "split-before-review",
    "agot-opening-robert-as-king": "rewrite-before-review",
    "agot-opening-tyrion-stigma-parallel": "rewrite-before-review",
    "agot-opening-arya-crooked-stitches": "review-as-is",
    "agot-opening-arya-rejects-needlework": "rewrite-before-review",
    "agot-opening-bran-climbing-habit": "review-as-is",
    "agot-opening-bran-witnesses-queen": "review-as-is",
    "agot-opening-jaime-pushes-bran": "review-as-is",
    "agot-opening-tyrion-season-study": "review-as-is",
    "agot-opening-joffrey-rejects-bran-obligation": "rewrite-before-review",
    "agot-opening-tyrion-disciplines-joffrey": "rewrite-before-review",
    "agot-opening-catelyn-excludes-jon": "review-as-is",
    "agot-opening-jon-claims-bran-brother": "review-as-is",
    "agot-opening-catelyn-wishes-jon-harmed": "rewrite-before-review",
    "agot-opening-robert-invokes-lyanna": "split-before-review",
}


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def rows_as_dicts(document: dict[str, Any]) -> list[dict[str, Any]]:
    fields = document["rowSchema"]
    return [dict(zip(fields, row, strict=True)) for row in document["queue" if "queue" in document else "rows"]]


def git_blob_sha1(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def main() -> int:
    source_bytes = SOURCE.read_bytes()
    source = json.loads(source_bytes)
    triage = load(ROOT / "TRIAGE.json")
    templates_document = load(ROOT / "DECISION_TEMPLATES.json")
    receipt = load(ROOT / "RECEIPT.json")
    inventory = load(ROOT / "INVENTORY.json")
    queue = rows_as_dicts(triage)
    templates = rows_as_dicts(templates_document)
    source_records = source["records"]
    checks: list[tuple[str, bool]] = []

    def check(label: str, condition: bool) -> None:
        checks.append((label, bool(condition)))
        if not condition:
            raise AssertionError(label)

    check("source format", source["format"] == "axm-asoiaf-opening-gate/1")
    check("source git blob", git_blob_sha1(source_bytes) == EXPECTED_BLOB)
    check("source gate fingerprint", source["gateFingerprint"] == EXPECTED_GATE)
    check("source declared record count", source["recordCount"] == 31)
    check("source observed record count", len(source_records) == 31)
    check("source review required", source["humanReviewRequired"] is True)
    check("source promotion count zero", source["promotionCount"] == 0)
    check("source canon effect none", source["canonEffect"] == "none")
    check("source graph effect none", source["graphEffect"] == "none")
    check("source text absent", source["sourceTextPresent"] is False)

    check("triage schema", triage["schema"] == "axm-asoiaf-agot-opening-gate-triage/1")
    check("triage component", triage["componentId"] == "asoiaf-agot-opening-gate-triage-v1")
    check("triage standing", triage["standing"] == "structurally-triaged-human-decisions-unexecuted")
    check("source path bound", triage["sourceBinding"]["path"] == "asoiaf/public/corpus-v1/OPENING_GATE.json")
    check("source blob bound", triage["sourceBinding"]["gitBlobSha1"] == EXPECTED_BLOB)
    check("source fingerprint bound", triage["sourceBinding"]["gateFingerprint"] == EXPECTED_GATE)
    check("queue count", len(queue) == 31)
    check("template count", len(templates) == 31)
    check("source count receipt", triage["counts"]["sourceRecords"] == 31)
    check("as-is count receipt", triage["counts"]["reviewAsIs"] == 14)
    check("split count receipt", triage["counts"]["splitBeforeReview"] == 10)
    check("rewrite count receipt", triage["counts"]["rewriteBeforeReview"] == 7)
    check("decision template count receipt", triage["counts"]["decisionTemplates"] == 31)
    check("executed transaction count zero", triage["counts"]["executedHumanTransactions"] == 0)
    check("canon promotion count zero", triage["counts"]["automaticCanonPromotions"] == 0)
    check("graph mutation count zero", triage["counts"]["automaticGraphMutations"] == 0)

    check("unique queue claims", len({row["claimId"] for row in queue}) == 31)
    check("unique queue fingerprints", len({row["recordFingerprint"] for row in queue}) == 31)
    check("queue ordinals", [row["sourceOrdinal"] for row in queue] == list(range(1, 32)))
    check("claim order matches source", [row["claimId"] for row in queue] == [row["claimId"] for row in source_records])
    check("fingerprints match source", [row["recordFingerprint"] for row in queue] == [row["recordFingerprint"] for row in source_records])
    check("unit metadata matches source", all(
        q["unitLabel"] == s["unitLabel"] and q["unitOrder"] == s["unitOrder"] and q["paragraphIndex"] == s["paragraphIndex"]
        for q, s in zip(queue, source_records)
    ))
    check("claim types match source", [row["claimType"] for row in queue] == [row["claimType"] for row in source_records])
    check("epistemic classes match source", [row["epistemicClass"] for row in queue] == [row["epistemicClass"] for row in source_records])
    check("dispositions allowed", {row["structuralDisposition"] for row in queue} == {"review-as-is", "split-before-review", "rewrite-before-review"})
    check("disposition map exact", all(EXPECTED_DISPOSITIONS[row["claimId"]] == row["structuralDisposition"] for row in queue))
    check("observed disposition counts", Counter(row["structuralDisposition"] for row in queue) == Counter({
        "review-as-is": 14, "split-before-review": 10, "rewrite-before-review": 7
    }))
    check("queue rationales present", all(bool(row["structuralRationale"].strip()) for row in queue))

    check("template schema", templates_document["schema"] == "axm-asoiaf-human-review-transaction-templates/1")
    check("template allowed actions", templates_document["allowedActions"] == ALLOWED_ACTIONS)
    check("template ordinals", [row["sourceOrdinal"] for row in templates] == list(range(1, 32)))
    check("templates bind queue ids", [row["queueId"] for row in templates] == [f"agot-opening-gate-v1:{i:03d}" for i in range(1, 32)])
    check("templates bind claims", [row["claimId"] for row in templates] == [row["claimId"] for row in queue])
    check("templates bind fingerprints", [row["sourceRecordFingerprint"] for row in templates] == [row["recordFingerprint"] for row in queue])
    check("template actions null", all(row["action"] is None for row in templates))
    check("template reviewer metadata null", all(row["reviewer"] is None and row["reviewedAt"] is None and row["transactionId"] is None for row in templates))
    check("template evidence empty", all(row["evidenceLocators"] == [] for row in templates))
    check("template correction and relations empty", all(row["correctedSummary"] is None and row["splitChildren"] == [] and row["mergeTargets"] == [] for row in templates))
    check("template rationales null", all(row["rationale"] is None for row in templates))
    check("template executions false", all(row["executed"] is False for row in templates))
    check("template source hash required", all(row["sourceRecordHashMustMatch"] is True for row in templates))
    check("template review required", all(row["humanReviewRequired"] is True for row in templates))
    check("template authority none", all(row["canonEffect"] == "none" and row["graphEffect"] == "none" for row in templates))

    check("receipt expected checks", receipt["qualification"]["expectedVerifierChecks"] == 62)
    check("receipt counts match", receipt["counts"] == triage["counts"])
    check("inventory exact", inventory["fileCount"] == 7 and len(inventory["files"]) == 7)
    check("inventory files present", all((ROOT / row["path"]).is_file() for row in inventory["files"]))
    check("authority triage not review", triage["authorityBoundary"]["triageIsNotCanonReview"] is True)
    check("authority disposition not decision", triage["authorityBoundary"]["dispositionIsNotDecision"] is True)
    check("authority human transaction required", triage["authorityBoundary"]["humanTransactionRequired"] is True)
    check("authority no private payload", triage["authorityBoundary"]["privatePayloadPresent"] is False)
    check("authority no automatic effects", triage["authorityBoundary"]["automaticCanonEffect"] == "none" and triage["authorityBoundary"]["automaticGraphEffect"] == "none")

    if len(checks) != 62:
        raise AssertionError(f"verifier defect: expected 62 checks, executed {len(checks)}")

    result = {
        "schema": "axm-asoiaf-agot-opening-gate-triage-verification/1",
        "componentId": triage["componentId"],
        "passed": sum(1 for _, passed in checks if passed),
        "total": len(checks),
        "status": "PASS",
        "warningsAsErrors": os.environ.get("PYTHONWARNINGS") == "error",
        "counts": triage["counts"],
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "executedHumanTransactions": 0,
    }
    sys.stdout.write(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
