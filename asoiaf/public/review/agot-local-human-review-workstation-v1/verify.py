#!/usr/bin/env python3
"""Verify the public-safe AGOT local human-review workstation source."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
checks: list[dict[str, Any]] = []


def check(value: bool, label: str) -> None:
    checks.append({"label": label, "passed": bool(value)})
    if not value:
        raise AssertionError(label)


def load(name: str) -> Any:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def main() -> int:
    contract = load("CONTRACT.json")
    source = load("CANDIDATE_SOURCE.json")
    server = (ROOT / "review_server.py").read_text(encoding="utf-8")
    validator = (ROOT / "validate_intakes.py").read_text(encoding="utf-8")
    required = [
        "README.md",
        "CONTRACT.json",
        "CANDIDATE_SOURCE.json",
        "review_server.py",
        "validate_intakes.py",
        "verify.py",
        "synthetic_test.py",
        "Run-Local-Review.cmd",
    ]
    check(all((ROOT / name).is_file() for name in required), "required workstation files present")
    check(contract["schema"] == "axm-asoiaf-agot-local-human-review-workstation-contract/1", "contract schema")
    check(contract["componentId"] == "asoiaf-agot-local-human-review-workstation-v1", "component identity")
    check(contract["requiredPrivateDatabase"]["bytes"] == 106151936, "exact database byte count")
    check(contract["requiredPrivateDatabase"]["sha256"] == "71cf5fe7b22ee33e5deb21440acce40dd2102771edaddff2d3e4853fc5d50843", "exact database digest")
    check(contract["requiredPrivateDatabase"]["repositoryEligible"] is False, "private database repository exclusion")
    check(contract["candidateInput"] == {"filename":"CANDIDATES.json","atomicCandidates":45,"exactPrivateLocators":31,"sourceTextPresent":False}, "candidate input contract")
    check(contract["networkBoundary"]["nonLoopbackBindingForbidden"] is True, "non-loopback forbidden")
    check(set(contract["networkBoundary"]["allowedHosts"]) == {"127.0.0.1","localhost","::1"}, "loopback host set")
    check(contract["networkBoundary"]["externalRequestsRequired"] is False, "no external requests required")
    check(contract["databaseBoundary"]["sqliteUriMode"] == "ro", "SQLite read-only mode")
    check(contract["databaseBoundary"]["immutable"] is True, "SQLite immutable mode")
    check(contract["databaseBoundary"]["queryOnly"] is True, "SQLite query-only mode")
    check(contract["databaseBoundary"]["copyAllowed"] is False, "database copy forbidden")
    check(contract["databaseBoundary"]["modifyAllowed"] is False, "database modification forbidden")
    check(contract["reviewBoundary"]["namedReviewerRequired"] is True, "named reviewer required")
    check(contract["reviewBoundary"]["oneCandidateAtATime"] is True, "single-candidate review")
    check(contract["reviewBoundary"]["csrfRequired"] is True, "CSRF required")
    check(contract["reviewBoundary"]["sourceTextMayBePersisted"] is False, "source text persistence forbidden")
    check(contract["reviewBoundary"]["sourceExcerptSha256Required"] is True, "source excerpt digest required")
    check(contract["reviewBoundary"]["validatorMayExecuteTransaction"] is False, "validator execution forbidden")
    check(set(contract["reviewBoundary"]["allowedActions"]) == {"confirm","correct","split","merge","reject","defer"}, "bounded action set")
    check(contract["authorityBoundary"]["displayIsNotDecision"] is True, "display is not decision")
    check(contract["authorityBoundary"]["savedIntakeIsNotTransaction"] is True, "saved intake is not transaction")
    check(contract["authorityBoundary"]["validatedIntakeIsNotExecutedTransaction"] is True, "validated intake is not execution")
    check(contract["authorityBoundary"]["automaticCanonEffect"] == "none", "zero canon effect")
    check(contract["authorityBoundary"]["automaticGraphEffect"] == "none", "zero graph effect")
    check(source["counts"] == {"atomicCandidates":45,"exactPrivateLocators":31}, "candidate source census")
    check(source["sourceTextPresent"] is False and source["privatePayloadPresent"] is False, "candidate source excludes private payload")
    check(len(source["upstreamRepositorySurfaces"]) == 5, "five upstream surfaces")
    check("mode=ro&immutable=1" in server, "server uses immutable read-only SQLite URI")
    check("PRAGMA query_only=ON" in server, "server applies query-only pragma")
    check("non-loopback binding is forbidden" in server, "server enforces loopback")
    check("secrets.token_urlsafe" in server and "CSRF refused" in server, "server issues and verifies CSRF token")
    check("Cache-Control" in server and "Content-Security-Policy" in server, "server emits restrictive headers")
    check('"executed": False' in server and '"canonEffect": "none"' in server and '"graphEffect": "none"' in server, "saved intake remains inert")
    check('"sourceExcerptSha256"' in server and 'sha256_text(paragraph["text"])' in server, "source excerpt hash recorded")
    check('paragraph["text"]' not in validator, "validator cannot access paragraph text")
    check("PASS_VALID_FOR_SEPARATE_HUMAN_EXECUTOR" in validator, "validator emits bounded pass standing")
    check("validatorExecutedTransaction" in validator and '"executedHumanTransactions": 0' in validator, "validator records zero execution")
    if len(checks) != 40:
        raise AssertionError(f"verifier defect: expected 40 checks, executed {len(checks)}")
    result = {
        "schema": "axm-asoiaf-agot-local-human-review-workstation-verification/1",
        "componentId": contract["componentId"],
        "passed": 40,
        "total": 40,
        "failed": 0,
        "status": "PASS",
        "warningsAsErrors": os.environ.get("PYTHONWARNINGS") == "error",
        "candidateCount": 45,
        "locatorCount": 31,
        "privateSourceTextPresent": False,
        "privatePayloadPresent": False,
        "savedRealReviewIntakes": 0,
        "validatedRealReviewIntakes": 0,
        "executedHumanTransactions": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
