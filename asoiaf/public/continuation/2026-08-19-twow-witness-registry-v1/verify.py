#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import warnings
from pathlib import Path
from typing import Any

warnings.simplefilter("error")
ROOT = Path(__file__).resolve().parent


def load_json(name: str) -> Any:
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def load_ndjson(name: str) -> list[dict[str, Any]]:
    return [json.loads(line) for line in (ROOT / name).read_text(encoding="utf-8").splitlines() if line.strip()]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


registry = load_json("REGISTRY.json")
chapters = load_ndjson("CHAPTERS.ndjson")
events = load_ndjson("EVENTS.ndjson")
sources = load_ndjson("SOURCES.ndjson")
relations = load_ndjson("RELATIONS.ndjson")
holds = load_ndjson("ACQUISITION_HOLDS.ndjson")

checks: list[str] = []

def passed(name: str, condition: bool) -> None:
    require(condition, name)
    checks.append(name)

passed("schema and component identity", registry["schema"] == "axm-asoiaf-twow-witness-registry/1" and registry["componentId"] == "asoiaf-twow-witness-registry-v1")
passed("exact registry counts", registry["counts"] == {"chapters": 11, "releaseEvents": 16, "sourceRoutes": 17, "versionAndProvenanceRelations": 47, "acquisitionHolds": 14, "automaticCanonPromotions": 0})
passed("physical record counts", (len(chapters), len(events), len(sources), len(relations), len(holds)) == (11, 16, 17, 47, 14))

id_sets = {
    "chapters": {x["chapterId"] for x in chapters},
    "events": {x["eventId"] for x in events},
    "sources": {x["sourceId"] for x in sources},
    "relations": {x["relationId"] for x in relations},
    "holds": {x["holdId"] for x in holds},
}
passed("identifier uniqueness", all(len(ids) == expected for ids, expected in zip(id_sets.values(), (11, 16, 17, 47, 14))))
passed("event chapter references", all(e["chapterId"] in id_sets["chapters"] for e in events))
passed("event source references", all(e["sourceId"] in id_sets["sources"] for e in events))
passed("chapter first-event references", all(c["firstPublicEventId"] in id_sets["events"] for c in chapters))
passed("hold target references", all(target in id_sets["events"] for h in holds for target in h["targetObjectIds"]))

all_objects = set().union(*id_sets.values(), {registry["componentId"]})
passed("relation references", all(r["fromObjectId"] in all_objects and r["toObjectId"] in all_objects for r in relations))
passed("authority fields", all(x["canonEffect"] == "none" and x["graphEffect"] == "none" for group in (chapters, events, sources, relations, holds) for x in group))
passed("zero automatic promotion", registry["authorityBoundary"]["automaticCanonPromotions"] == 0 and registry["authorityBoundary"]["automaticCanonEffect"] == "none" and registry["authorityBoundary"]["automaticGraphEffect"] == "none")
passed("parent archive identity retained", registry["parent"]["archiveBytes"] == 18639 and registry["parent"]["archiveSha256"] == "ac93ef471f05beb7e4ac1469baba4baca2d1550b246eb3b33ab50035c79333d0")
passed("parent non-impersonation", registry["parent"]["exactArchiveMaterialized"] is False and registry["parent"]["sealedArchiveBytesRecovered"] is False and registry["parent"]["derivativeClaimsExactParentIdentity"] is False and registry["parent"]["derivativeClaimsParentByteReproduction"] is False)
passed("no prose or transcript payload", registry["scope"] == {"description": registry["scope"]["description"], "chapterTextPresent": False, "eventTranscriptPresent": False, "attendeeReconstructionPresent": False, "sourcePageMirrorPresent": False} and all(s["contentCaptured"] is False for s in sources))
passed("mutable preview standing", all(c["mutable"] is True for c in chapters) and registry["authorityBoundary"]["releasedFutureMaterialStanding"] == "mutable-witness-specific-nonfinal")

chapter_by_id = {c["chapterId"]: c for c in chapters}
passed("same-POV chapter separation", chapter_by_id["twow:tyrion-i"]["ordinalWithinPov"] == 1 and chapter_by_id["twow:tyrion-ii"]["ordinalWithinPov"] == 2 and chapter_by_id["twow:arianne-i"]["ordinalWithinPov"] == 1 and chapter_by_id["twow:arianne-ii"]["ordinalWithinPov"] == 2 and chapter_by_id["twow:barristan-i"]["ordinalWithinPov"] == 1 and chapter_by_id["twow:barristan-ii"]["ordinalWithinPov"] == 2)

event_by_id = {e["eventId"]: e for e in events}
passed("TIFF event and route dates separated", event_by_id["event:victarion-tiff-2012-03-12"]["date"] == "2012-03-12" and event_by_id["event:victarion-tiff-2012-03-12"]["publicRouteDate"] == "2012-03-17")
passed("MisCon event range and report date separated", all(event_by_id[eid]["date"] == "2012-05-25/2012-05-28" and event_by_id[eid]["publicRouteDate"] == "2012-06-03" for eid in ("event:victarion-miscon-2012", "event:tyrion-i-miscon-2012")))
passed("relation law", sum(r["relationType"] == "event-witnesses-chapter" for r in relations) == 16 and sum(r["relationType"] == "event-supported-by-source" for r in relations) == 16 and len(relations) == 47)
passed("process control present", any(r["relationType"] == "governs-preview-mutation-standing" and r["fromObjectId"] == "source:grrm-process-2020" for r in relations))
passed("holds fail closed", all(h["status"] == "unacquired-exact-witness" and h["substitutionAllowed"] is False and h["transcriptImpersonationAllowed"] is False for h in holds))

for name in ("CHAPTERS.ndjson", "EVENTS.ndjson", "SOURCES.ndjson", "RELATIONS.ndjson", "ACQUISITION_HOLDS.ndjson"):
    for row in load_ndjson(name):
        require(isinstance(row.get("recordFingerprint"), str) and row["recordFingerprint"].startswith("sha256:"), f"missing fingerprint in {name}")
checks.append("record fingerprints present")

ledger_lines = [line for line in (ROOT / "SHA256SUMS").read_text(encoding="utf-8").splitlines() if line.strip()]
for line in ledger_lines:
    digest, rel = line.split("  ", 1)
    require((ROOT / rel).is_file(), f"missing ledger file {rel}")
    require(sha256_file(ROOT / rel) == digest, f"digest mismatch {rel}")
checks.append("internal checksum ledger")

print(json.dumps({"status": "PASS", "checks": len(checks), "componentId": registry["componentId"], "counts": registry["counts"]}, sort_keys=True))
