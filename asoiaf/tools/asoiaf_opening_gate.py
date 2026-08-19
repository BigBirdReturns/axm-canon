#!/usr/bin/env python3
"""Compile the first public-safe, source-attested AGOT opening ledger.

The operator validates exact private segment custody and emits paraphrased draft
records only. It never copies source text into the public output and grants no
canon or graph authority. Human review is still required for promotion.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Sequence

FORMAT = "axm-asoiaf-opening-gate/1"
RECORD_FORMAT = "axm-asoiaf-source-attested-draft/1"

CLAIMS: list[dict[str, Any]] = [
    {
        "claimId": "agot-opening-gared-night-watch-tenure",
        "summary": "Gared has served in the Night's Watch for forty years and displays fear beneath wounded pride.",
        "claimType": "actor-background",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:0e5f3e037983ac3fec361ce13ba335e8",
        "candidateLinks": ["recall-knowledge-night-watch-others-fragmented"],
    },
    {
        "claimId": "agot-opening-will-poacher-scout",
        "summary": "Will entered the Night's Watch after being caught poaching, and his woodland stealth became an institutional asset.",
        "claimType": "actor-background",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:84f206354d278ca104523e26d0e8652b",
        "candidateLinks": ["recall-event-others-prologue"],
    },
    {
        "claimId": "agot-opening-waymar-reanimation",
        "summary": "After his death beyond the Wall, Waymar Royce rises and stands over Will.",
        "claimType": "magic-event",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:333a51efbae518c68fd721d6645f2a8c",
        "candidateLinks": ["recall-event-others-prologue", "recall-magic-rule-wight-reanimation"],
    },
    {
        "claimId": "agot-opening-bran-first-execution",
        "summary": "Seven-year-old Bran attends an execution for the first time during the ninth year of summer.",
        "claimType": "event",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:304b86e8b2a9260774c3f7c4fb5f144e",
        "candidateLinks": ["recall-entity-bran-stark"],
    },
    {
        "claimId": "agot-opening-jon-instructs-bran",
        "summary": "Jon Snow tells Bran to control his pony and not look away from their father's execution.",
        "claimType": "relationship-action",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:f80e6d16d9537db3514c887f0b0042ca",
        "candidateLinks": ["recall-entity-jon-snow", "recall-entity-bran-stark"],
    },
    {
        "claimId": "agot-opening-eddard-courage-lesson",
        "summary": "Eddard teaches Bran that courage exists only when fear is present.",
        "claimType": "ethical-teaching",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:51055733e2046c922b491c6661e455f1",
        "candidateLinks": ["recall-entity-eddard-stark", "recall-entity-bran-stark"],
    },
    {
        "claimId": "agot-opening-stark-execution-law",
        "summary": "Eddard describes the Stark rule that the person who passes a death sentence should perform the execution and hear the condemned person's final words.",
        "claimType": "institutional-practice",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:0533a233f1cd9cf0dfa799421ca888dc",
        "candidateLinks": ["recall-entity-eddard-stark", "recall-entity-house-stark"],
    },
    {
        "claimId": "agot-opening-five-direwolf-pups",
        "summary": "The initial direwolf litter contains five pups, three male and two female.",
        "claimType": "material-observation",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:193703eb72dd637e8425ed75e1127a8d",
        "candidateLinks": ["recall-material-state-direwolf-diaspora"],
    },
    {
        "claimId": "agot-opening-sixth-white-pup",
        "summary": "A sixth direwolf pup is white, red-eyed, and the only member of the litter whose eyes are already open.",
        "claimType": "material-observation",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:50775f1b6a240ac5ebe6d172f9c9ab91",
        "candidateLinks": ["recall-material-state-direwolf-diaspora", "recall-entity-ghost"],
    },
    {
        "claimId": "agot-opening-catelyn-faith",
        "summary": "Catelyn's religious formation is in the Faith of the Seven, while a godswood functions differently in her inherited Tully practice.",
        "claimType": "religious-practice",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:983071c98d21de2b21dc99713127ba1a",
        "candidateLinks": ["recall-entity-catelyn-stark", "recall-entity-faith-of-the-seven", "recall-entity-old-gods"],
    },
    {
        "claimId": "agot-opening-jon-arryn-death",
        "summary": "Catelyn informs Eddard that Jon Arryn has died.",
        "claimType": "reported-event",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:4c1fe91d3a24df2f3154e9becaa0cf70",
        "candidateLinks": ["recall-entity-jon-arryn", "recall-event-royal-visit-winterfell"],
    },
    {
        "claimId": "agot-opening-king-rides-winterfell",
        "summary": "The royal message states that the king is traveling to Winterfell to seek out Eddard.",
        "claimType": "movement",
        "epistemicClass": "reported-message",
        "segment": "asoiaf-local-segment:28f3bd5853faebf2ef9cfb4af244f4d8",
        "candidateLinks": ["recall-event-royal-visit-winterfell", "recall-entity-winterfell", "recall-entity-robert-baratheon"],
    },
    {
        "claimId": "agot-opening-catelyn-omen-reading",
        "summary": "Catelyn treats the dead direwolf and broken antler as an ominous sign, while recognizing that Eddard rejects such readings.",
        "claimType": "actor-belief",
        "epistemicClass": "narrative-report-of-belief",
        "segment": "asoiaf-local-segment:2f0ee899f924ace6f9203e8eb04c55dc",
        "candidateLinks": ["recall-entity-catelyn-stark", "recall-material-state-direwolf-diaspora"],
    },
    {
        "claimId": "agot-opening-viserys-ten-thousand-dothraki",
        "summary": "Viserys imagines that ten thousand Dothraki riders would be sufficient to conquer the Seven Kingdoms and assumes broad domestic support.",
        "claimType": "actor-plan",
        "epistemicClass": "direct-character-belief",
        "segment": "asoiaf-local-segment:d0465d2efa029fa6ce034f21e8527d52",
        "candidateLinks": ["recall-entity-viserys-targaryen", "recall-proposition-viserys-designated-heir", "recall-entity-dothraki"],
    },
    {
        "claimId": "agot-opening-daenerys-red-door-memory",
        "summary": "Daenerys remembers a Braavosi house with a red door and lemon tree as a lost childhood refuge that ended after Willem Darry's death.",
        "claimType": "actor-memory",
        "epistemicClass": "narrative-memory",
        "segment": "asoiaf-local-segment:c910092b46ec2fa3a7cd1892f4c0890a",
        "candidateLinks": ["recall-entity-daenerys-targaryen"],
    },
    {
        "claimId": "agot-opening-viserys-beggar-king",
        "summary": "As support and money disappear in exile, people in Pentos refer to Viserys as the beggar king.",
        "claimType": "social-standing",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:6d1e4c70de9b855103d04e1996fd7caf",
        "candidateLinks": ["recall-entity-viserys-targaryen", "recall-proposition-viserys-designated-heir"],
    },
    {
        "claimId": "agot-opening-royal-party-scale",
        "summary": "Robert's arriving royal party is approximately three hundred strong and includes bannermen, knights, sworn swords, and freeriders.",
        "claimType": "material-state",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:36e3ae7a61a358afb1800cd2c0f0c4b4",
        "candidateLinks": ["recall-event-royal-visit-winterfell", "recall-entity-robert-baratheon"],
    },
    {
        "claimId": "agot-opening-robert-as-king",
        "summary": "Eddard's private friendship with Robert is subordinated to Robert's public status as king when the party enters Winterfell.",
        "claimType": "office-and-relationship",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:5df7844b4eee900a7059409548d3fc3e",
        "candidateLinks": ["recall-entity-eddard-stark", "recall-entity-robert-baratheon", "recall-entity-winterfell"],
    },
    {
        "claimId": "agot-opening-tyrion-stigma-parallel",
        "summary": "Tyrion frames dwarfism and bastardy as parallel forms of paternal rejection when speaking with Jon Snow.",
        "claimType": "social-analysis",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:c158a2d06aa5795d36b3e2d8678e2355",
        "candidateLinks": ["recall-entity-tyrion-lannister", "recall-entity-jon-snow", "recall-proposition-jon-public-parentage"],
    },
    {
        "claimId": "agot-opening-arya-crooked-stitches",
        "summary": "Arya's needlework is presented as visibly poor by the standards of her lesson.",
        "claimType": "skill-state",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:0f354d95ec33cae46872e0d48120122d",
        "candidateLinks": ["recall-entity-arya-stark", "recall-function-arya-identity"],
    },
    {
        "claimId": "agot-opening-arya-rejects-needlework",
        "summary": "Arya explicitly rejects needlework and the fairness of the role expectations surrounding it.",
        "claimType": "actor-preference",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:49e91f91273e6e54822c092b797c84ae",
        "candidateLinks": ["recall-entity-arya-stark", "recall-function-arya-identity"],
    },
    {
        "claimId": "agot-opening-bran-climbing-habit",
        "summary": "Bran's familiarity with Winterfell's rooftops and lifelong climbing habit are established before his fall.",
        "claimType": "capability-state",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:cea3752a0674b674bfb08d8dd71a27a1",
        "candidateLinks": ["recall-entity-bran-stark", "recall-entity-winterfell", "recall-event-bran-fall"],
    },
    {
        "claimId": "agot-opening-bran-witnesses-queen",
        "summary": "Bran observes a naked man and woman together and recognizes the woman as the queen.",
        "claimType": "knowledge-acquisition",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:8713aa8a23cde85af0d0c2019ecb3f9b",
        "candidateLinks": ["recall-knowledge-bran-incest", "recall-knowledge-jaime-incest", "recall-knowledge-cersei-incest"],
    },
    {
        "claimId": "agot-opening-jaime-pushes-bran",
        "summary": "After Bran is discovered at the window, Jaime pushes him from the tower.",
        "claimType": "event",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:5eedd47115e16158ef2156e956afa0b6",
        "candidateLinks": ["recall-event-bran-fall", "recall-knowledge-bran-incest"],
    },
    {
        "claimId": "agot-opening-tyrion-season-study",
        "summary": "Tyrion spends the night reading an old maester's study of the changing seasons.",
        "claimType": "actor-activity",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:8bdaaedf74a037420655acc26c84d38e",
        "candidateLinks": ["recall-entity-tyrion-lannister"],
    },
    {
        "claimId": "agot-opening-joffrey-rejects-bran-obligation",
        "summary": "Joffrey dismisses Bran's condition and refuses the courtesy expected of him toward the Stark household.",
        "claimType": "actor-attitude",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:2df53e33a9b54559328a064e8d10340e",
        "candidateLinks": ["recall-entity-joffrey-baratheon", "recall-entity-bran-stark"],
    },
    {
        "claimId": "agot-opening-tyrion-disciplines-joffrey",
        "summary": "Tyrion responds to Joffrey's refusal by striking him across the face.",
        "claimType": "event",
        "epistemicClass": "narrative-observation",
        "segment": "asoiaf-local-segment:932abf22b1d17c2801ec25ed40f08844",
        "candidateLinks": ["recall-entity-tyrion-lannister", "recall-entity-joffrey-baratheon"],
    },
    {
        "claimId": "agot-opening-catelyn-excludes-jon",
        "summary": "At Bran's bedside, Catelyn directly tells Jon Snow that he is not wanted there.",
        "claimType": "relationship-state",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:4522dcdabc681a98917d0beb9e2fcb7c",
        "candidateLinks": ["recall-entity-catelyn-stark", "recall-entity-jon-snow", "recall-proposition-jon-public-parentage"],
    },
    {
        "claimId": "agot-opening-jon-claims-bran-brother",
        "summary": "Jon asserts that Bran is his brother despite Catelyn's effort to exclude him.",
        "claimType": "relationship-claim",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:617354f918ef21beb16ed2a77421b645",
        "candidateLinks": ["recall-entity-jon-snow", "recall-entity-bran-stark", "recall-proposition-jon-public-parentage"],
    },
    {
        "claimId": "agot-opening-catelyn-wishes-jon-harmed",
        "summary": "In grief at Bran's bedside, Catelyn tells Jon that he should have been the injured child.",
        "claimType": "relationship-event",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:162492a95f72e238e9fb7eed3944326c",
        "candidateLinks": ["recall-entity-catelyn-stark", "recall-entity-jon-snow", "recall-event-bran-fall"],
    },
    {
        "claimId": "agot-opening-robert-invokes-lyanna",
        "summary": "During conflict over Targaryen honor, Robert invokes Lyanna and directs Eddard back toward the crypt and their shared history.",
        "claimType": "political-memory",
        "epistemicClass": "direct-character-statement",
        "segment": "asoiaf-local-segment:c504ef0123a785ba05e32f85e8d6aa53",
        "candidateLinks": ["recall-entity-robert-baratheon", "recall-entity-eddard-stark", "recall-entity-lyanna-stark", "recall-event-roberts-rebellion"],
    },
]


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def fingerprint(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonical(value)).hexdigest()


def load_rows(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def compile_opening_gate(root: Path, generated_at: str) -> dict[str, Any]:
    manifests = [
        json.loads(path.read_text(encoding="utf-8"))
        for path in (root / "local-editions").glob("*/edition-manifest.json")
    ]
    manifest = next((row for row in manifests if row["sourceId"] == "local-agot"), None)
    if manifest is None:
        raise RuntimeError("local-agot edition is not present")
    edition_root = root / "local-editions" / manifest["editionKey"]
    units = {row["unitId"]: row for row in load_rows(edition_root / "units.ndjson")}
    segments = {row["segmentId"]: row for row in load_rows(edition_root / "segments.ndjson")}
    records = []
    for definition in CLAIMS:
        segment = segments.get(definition["segment"])
        if segment is None:
            raise RuntimeError(f"opening claim lost segment {definition['segment']}")
        unit = units.get(segment["unitId"])
        if unit is None:
            raise RuntimeError(f"opening claim lost unit {segment['unitId']}")
        record = {
            "format": RECORD_FORMAT,
            "claimId": definition["claimId"],
            "summary": definition["summary"],
            "claimType": definition["claimType"],
            "epistemicClass": definition["epistemicClass"],
            "continuityId": manifest["continuityId"],
            "sourceId": manifest["sourceId"],
            "editionId": manifest["editionId"],
            "editionKey": manifest["editionKey"],
            "sourceDigest": manifest["sourceDigest"],
            "manifestFingerprint": manifest["manifestFingerprint"],
            "unitId": unit["unitId"],
            "unitOrder": unit["order"],
            "unitLabel": unit["label"],
            "paragraphIndex": segment["paragraphIndex"],
            "segmentId": segment["segmentId"],
            "textDigest": segment["textDigest"],
            "locator": segment["locator"],
            "candidateLinks": definition["candidateLinks"],
            "standing": "source-attested-assistant-normalized-draft",
            "humanReviewRequired": True,
            "sourceTextPresent": False,
            "graphEffect": "none",
            "canonEffect": "none",
        }
        record["recordFingerprint"] = fingerprint(record)
        records.append(record)
    gate = {
        "format": FORMAT,
        "generatedAt": generated_at,
        "title": "A Game of Thrones: Opening Gate",
        "description": "A first exact-locator, public-safe draft layer spanning the prologue through the opening Winterfell and exile sequences.",
        "sourceId": manifest["sourceId"],
        "editionKey": manifest["editionKey"],
        "sourceDigest": manifest["sourceDigest"],
        "recordCount": len(records),
        "records": records,
        "promotionCount": 0,
        "humanReviewRequired": True,
        "sourceTextPresent": False,
        "graphEffect": "none",
        "canonEffect": "none",
    }
    gate["gateFingerprint"] = fingerprint(gate)
    return gate


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--at", required=True)
    args = parser.parse_args(argv)
    result = compile_opening_gate(Path(args.root).resolve(), args.at)
    output = Path(args.out).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "PASS_OPENING_GATE_DRAFT",
        "recordCount": result["recordCount"],
        "gateFingerprint": result["gateFingerprint"],
        "sourceTextPresent": False,
        "promotionCount": 0,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
