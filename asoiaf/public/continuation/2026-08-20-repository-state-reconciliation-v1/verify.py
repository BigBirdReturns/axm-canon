#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPOSITORY = ROOT.parents[3]


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    admission = load(ROOT / "ADMISSION.json")
    state = load(ROOT / "STATE.json")
    supersession = load(ROOT / "SUPERSESSION.json")
    checks: list[str] = []

    require(admission["componentId"] == "asoiaf-repository-state-reconciliation-v1", "component identity")
    require(admission["standing"] == "repository-native-current-state-successor-materialized-historical-patch-held", "standing")
    checks.append("admission-identity")

    historical = admission["historicalPacket"]
    require(historical["bytes"] == 3596, "historical packet bytes")
    require(historical["sha256"] == "bd4b5f0d5fb46d9cc50e100f8911f7f066f8257c20056fc0928014576a47e533", "historical packet digest")
    require(historical["preparedAgainstCommit"] == "fec0ddc9a5697d465ac46e55b7e3cb7647221952", "historical base")
    require(historical["patchSha256"] == "34ddb453952805d99e51ed9638e84871bfa455b566272a05ab13916a096d1b28", "patch digest")
    require(historical["repositoryReplaySha256"] == "09dc60b62e0dcd935417dc71b2b9ac0a81d7f3243ea26def36270d2a657c7ac3", "replay digest")
    require(historical["materialized"] is False, "historical materialization")
    checks.append("historical-patch-identity")

    boundary = admission["authorityBoundary"]
    for key in (
        "historicalPacketMaterialized",
        "historicalPatchApplied",
        "historicalPatchReconstructed",
        "historicalPatchSubstituted",
        "historicalBaseRestored",
        "currentRepositoryRewrittenFromPatch",
        "privatePayloadPresent",
        "sourceTextPresent",
    ):
        require(boundary[key] is False, key)
    require(boundary["automaticCanonEffect"] == "none", "canon effect")
    require(boundary["automaticGraphEffect"] == "none", "graph effect")
    checks.append("authority-boundary")

    corpus = state["corpus"]
    require(corpus["editionIdentities"] == 6, "edition count")
    require(corpus["orderedSourceUnits"] == 458, "source units")
    require(corpus["narrativeUnits"] == 347, "narrative units")
    require(corpus["nonNarrativeUnits"] == 111, "non-narrative units")
    require(corpus["paragraphLocators"] == 45828, "paragraph locators")
    require(corpus["privatelyHeldSourceWords"] == 1882845, "source words")
    require(corpus["combinedReviewCandidates"] == 805, "review candidates")
    require(corpus["entityCandidates"] == 254, "entity candidates")
    require(corpus["openingGateRecords"] == 31, "opening gate")
    require(corpus["registeredExternalSourceIdentities"] == 219, "external sources")
    require(corpus["researchLanes"] == 45, "research lanes")
    require(corpus["privateSourcePayloadInGit"] is False, "private payload")
    require(corpus["publicSourceTextInGit"] is False, "public source text")
    checks.append("corpus-census")

    asoiaf_readme = (REPOSITORY / "asoiaf" / "README.md").read_text(encoding="utf-8")
    for phrase in (
        "6 edition identities",
        "458 ordered units",
        "45,828 paragraph locators",
        "805 combined candidates",
        "254 entity candidates",
        "31 source-attested AGOT opening records",
        "219 registered external source identities",
        "45 research lanes",
    ):
        require(phrase in asoiaf_readme, f"README census phrase: {phrase}")
    checks.append("repository-census-witness")

    successors = state["continuationSuccessors"]
    require(len(successors) == 7, "successor count")
    require(len({item["componentId"] for item in successors}) == 7, "successor identity uniqueness")
    for successor in successors:
        path = REPOSITORY / successor["repositoryPath"]
        require(path.is_dir(), f"missing successor path: {path}")
    checks.append("seven-successor-paths")

    expected_ids = {
        "asoiaf-twow-witness-registry-v1",
        "asoiaf-ssm-bounded-proposition-registry-v1",
        "asoiaf-multilingual-term-distinction-registry-v1",
        "asoiaf-multilingual-reception-route-atlas-v1",
        "asoiaf-public-source-descent-registry-v1",
        "asoiaf-v4-2-recovery-source-v1",
        "asoiaf-repository-state-reconciliation-v1",
    }
    require({item["componentId"] for item in successors} == expected_ids, "successor set")
    checks.append("successor-identity-set")

    stack_path = REPOSITORY / state["historicalPublicAdmissionStack"]["repositoryPath"] / "STACK.json"
    stack = load(stack_path)
    require(stack["counts"]["admittedSuccessors"] == 5, "historical stack count")
    require(stack["counts"]["remainingV3ComponentPayloadHolds"] == 2, "historical remaining holds")
    require(state["historicalPublicAdmissionStack"]["currentStateAuthority"] is False, "historical stack authority")
    require(state["historicalPublicAdmissionStack"]["retainedAsReceipt"] is True, "historical stack retention")
    checks.append("historical-stack-snapshot")

    recovery = load(
        REPOSITORY
        / "asoiaf/public/continuation/2026-08-20-v4-2-recovery-source-v1/ADMISSION.json"
    )
    require(recovery["currentExecution"]["status"] == "HOLD_EXACT_ARCHIVES_UNAVAILABLE", "recovery hold")
    require(recovery["currentExecution"]["integrationAuthorized"] is False, "recovery integration")
    require(recovery["v4_2Built"] is False and recovery["v4_2Claimed"] is False, "recovery v4.2 standing")
    checks.append("recovery-source-hold")

    wave = load(REPOSITORY / "asoiaf/public/continuation/2026-08-18-v3/ADMISSION.json")
    require(wave["qualification"]["componentCount"] == 7, "wave component count")
    require(wave["sourceArchive"]["payloadMaterializedInRepository"] is False, "wave materialization")
    require(all(component["payloadMaterialized"] is False for component in wave["components"]), "component predecessor flags")
    require(wave["qualification"]["automaticCanonPromotions"] == 0, "wave canon promotions")
    checks.append("wave-predecessor-boundary")

    predecessor_holds = state["sealedV3PredecessorHolds"]
    require(len(predecessor_holds) == 7, "predecessor hold count")
    require(len({item["componentId"] for item in predecessor_holds}) == 7, "predecessor hold uniqueness")
    require(all(item["materialized"] is False for item in predecessor_holds), "predecessor materialization")
    require(sum(item["bytes"] for item in predecessor_holds) == 138051, "predecessor aggregate byte count")
    checks.append("seven-predecessor-holds")

    expected_hold_digests = {
        "ac93ef471f05beb7e4ac1469baba4baca2d1550b246eb3b33ab50035c79333d0",
        "2adc9a9a0818a1885a180569ff80ef6eaec08af74c82c4ca075024bb2e5ebb01",
        "161a2cb7267b431cb47aaa469bec71bc15cc00cb0e5e94d3058e22806516cab9",
        "2d0659281fc1432ff86d7d9f07a69c600350dccddaf74354035ca67e218ac911",
        "db3a3c0073a742cf4bd6137e40fd3f7a403a74f415c015aecf68c1f0d052ed2e",
        "538410c5470f44e325952fe2c2b47142276be0670ca594361f3035500dd64a75",
        "bd4b5f0d5fb46d9cc50e100f8911f7f066f8257c20056fc0928014576a47e533",
    }
    require({item["sha256"] for item in predecessor_holds} == expected_hold_digests, "predecessor digests")
    checks.append("predecessor-digest-set")

    for item in predecessor_holds:
        require(not any(REPOSITORY.rglob(item["filename"])), f"predecessor file unexpectedly present: {item['filename']}")
    for item in state["externalHolds"].values():
        require(item["materialized"] is False, "external hold materialization")
        require(not any(REPOSITORY.rglob(item["filename"])), f"external file unexpectedly present: {item['filename']}")
    checks.append("exact-files-absent")

    require(supersession["decision"] == "do-not-apply-or-reconstruct-historical-patch", "supersession decision")
    mechanism = supersession["mechanism"]
    require(mechanism["exactPacketBytesAvailable"] is False, "packet availability")
    require(mechanism["exactPatchBytesAvailable"] is False, "patch availability")
    require(mechanism["historicalBaseIsCurrentMain"] is False, "historical base standing")
    require(mechanism["replacementDerivedFromCurrentRepositoryReceipts"] is True, "replacement derivation")
    require(mechanism["historicalPatchIntentSupersededOperationally"] is True, "operational supersession")
    require(mechanism["historicalPacketCustodySuperseded"] is False, "custody supersession")
    checks.append("supersession-mechanism")

    for source in supersession["currentReplacementSources"]:
        require((REPOSITORY / source).is_file(), f"replacement source missing: {source}")
    checks.append("replacement-source-surface")

    counts = admission["counts"]
    require(counts["repositoryNativeContinuationSuccessors"] == 7, "admission successor count")
    require(counts["sealedV3ComponentPredecessorHolds"] == 7, "admission predecessor count")
    require(counts["remainingV3FunctionalSuccessorGaps"] == 0, "functional successor gap")
    require(counts["automaticCanonPromotions"] == 0, "admission canon promotions")
    require(counts["automaticGraphMutations"] == 0, "admission graph mutations")
    checks.append("admission-counts")

    private = state["privateIntegration"]
    require(private["allExactInputsVerified"] is False, "private input verification")
    require(private["integrationAuthorized"] is False, "private integration authority")
    require(private["v4_2Built"] is False, "private build standing")
    require(private["v4_2Claimed"] is False, "private claim standing")
    require(admission["v4_2Built"] is False and admission["v4_2Claimed"] is False, "admission v4.2 standing")
    checks.append("private-integration-hold")

    review = state["reviewStanding"]
    require(review["automaticCanonPromotions"] == 0, "review canon promotions")
    require(review["automaticGraphMutations"] == 0, "review graph mutations")
    require(review["humanTransactionRequired"] is True, "human transaction")
    checks.append("review-authority")

    result = {
        "schema": "axm-asoiaf-repository-state-reconciliation-verification/1",
        "componentId": admission["componentId"],
        "status": "PASS",
        "checks": {"passed": len(checks), "total": len(checks)},
        "checkIds": checks,
        "repositoryNativeContinuationSuccessors": 7,
        "sealedV3ComponentPredecessorHolds": 7,
        "remainingV3FunctionalSuccessorGaps": 0,
        "automaticCanonPromotions": 0,
        "automaticGraphMutations": 0,
        "v4_2Built": False,
        "v4_2Claimed": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
