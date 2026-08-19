#!/usr/bin/env python3
"""Project private local-edition structure into public-safe corpus ledgers."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
from typing import Any, Sequence

RANGES={"local-agot":(6,78),"local-acok":(7,76),"local-asos":(7,88),"local-affc":(7,52),"local-adwd":(5,77),"local-dunk-egg":(2,4)}
BOOK_ORDER=["local-agot","local-acok","local-asos","local-affc","local-adwd","local-dunk-egg"]
TITLES={"local-agot":"A Game of Thrones","local-acok":"A Clash of Kings","local-asos":"A Storm of Swords","local-affc":"A Feast for Crows","local-adwd":"A Dance with Dragons","local-dunk-egg":"Tales of Dunk and Egg"}

def canonical(value: Any)->bytes:return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
def fingerprint(value: Any)->str:return "sha256:"+hashlib.sha256(canonical(value)).hexdigest()
def read_ndjson(path:Path)->list[dict[str,Any]]:return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
def write_json(path:Path,value:Any)->None:path.write_text(json.dumps(value,indent=2,ensure_ascii=False,sort_keys=True)+"\n",encoding="utf-8")

def heading_for(source:str,unit:dict[str,Any],text:str)->str:
    if source=="local-asos":
        parts=[p.strip() for p in text.split("\n\n") if p.strip()]
        if len(parts)>=2:return parts[1].title() if parts[1] not in {"PROLOGUE","EPILOGUE"} else parts[1].title()
    heading=unit["label"].strip()
    return heading.title() if heading.isupper() and len(heading)<80 else heading

def build(root:Path,out:Path,generated_at:str)->dict[str,Any]:
    out.mkdir(parents=True,exist_ok=True)
    by_source={}
    for edition_root in (root/"local-editions").iterdir():
        if edition_root.is_dir():
            manifest=json.loads((edition_root/"edition-manifest.json").read_text(encoding="utf-8"));by_source[manifest["sourceId"]]=(edition_root,manifest)
    missing=[source for source in BOOK_ORDER if source not in by_source]
    if missing:raise RuntimeError(f"missing edition sources: {missing}")
    editions=[];chapters=[];non_narrative=[];pov_counts={};global_order=0
    for source in BOOK_ORDER:
        edition_root,manifest=by_source[source];units=read_ndjson(edition_root/"units.ndjson")
        private_index=json.loads((edition_root/"private-text-index.json").read_text(encoding="utf-8"));private_map={row["unitId"]:row for row in private_index["entries"]}
        private_metadata=manifest.get("metadata") or {}
        publisher=str(private_metadata.get("publisher") or "")
        provenance=(
            "holder-supplied-converted-edition"
            if source=="local-adwd" and "epub bud" in publisher.casefold()
            else "holder-supplied-collection-weak-bibliographic-metadata"
            if source=="local-dunk-egg" and not publisher
            else "holder-supplied-publisher-identified-edition"
            if publisher
            else "holder-supplied-edition"
        )
        editions.append({"sourceId":manifest["sourceId"],"title":TITLES[source],"editionId":manifest["editionId"],"editionKey":manifest["editionKey"],"continuityId":manifest["continuityId"],"sourceDigest":manifest["sourceDigest"],"sourceBytes":manifest["sourceBytes"],"manifestFingerprint":manifest["manifestFingerprint"],"unitCount":manifest["unitCount"],"segmentCount":manifest["segmentCount"],"charCount":manifest["charCount"],"wordCount":manifest["wordCount"],"metadata":{"title":private_metadata.get("title"),"language":private_metadata.get("language"),"publisher":private_metadata.get("publisher"),"identifierCount":len(private_metadata.get("identifiers") or []),"identifierDigests":["sha256:"+hashlib.sha256(str(value).encode("utf-8")).hexdigest() for value in private_metadata.get("identifiers") or []]},"provenanceClass":provenance,"sourcePathRetained":False,"sourceFilenameRetained":False,"privateTextRetained":True,"repositoryContainsSourceText":False})
        lo,hi=RANGES[source];occurrence={};chapter_order=0
        for unit in units:
            common={"sourceId":source,"editionKey":manifest["editionKey"],"continuityId":manifest["continuityId"],"unitId":unit["unitId"],"unitOrder":unit["order"],"label":unit["label"],"wordCount":unit["wordCount"],"charCount":unit["charCount"],"paragraphCount":unit["paragraphCount"],"textDigest":unit["textDigest"],"locator":unit["locator"],"graphEffect":"none","canonEffect":"none"}
            if lo<=unit["order"]<=hi:
                private_path=edition_root/private_map[unit["unitId"]]["relativeUri"];text=private_path.read_text(encoding="utf-8")
                if "sha256:"+hashlib.sha256(text.encode()).hexdigest()!=unit["textDigest"]:raise RuntimeError(f"unit digest drift {unit['unitId']}")
                heading=heading_for(source,unit,text);occurrence[heading]=occurrence.get(heading,0)+1;chapter_order+=1;global_order+=1
                row={**common,"kind":"novella" if source=="local-dunk-egg" else "narrative-unit","bookTitle":TITLES[source],"chapterOrder":chapter_order,"globalNarrativeOrder":global_order,"heading":heading,"headingOccurrence":occurrence[heading],"displayLabel":heading if heading in {"Prologue","Epilogue"} or source=="local-dunk-egg" else f"{heading} {occurrence[heading]}"}
                chapters.append(row);pov_counts.setdefault(source,{}).setdefault(heading,0);pov_counts[source][heading]+=1
            else:non_narrative.append({**common,"kind":"front-or-back-matter","bookTitle":TITLES[source]})
    manifest={"format":"axm-asoiaf-public-corpus-manifest/1","generatedAt":generated_at,"editions":editions,"editionCount":len(editions),"narrativeUnitCount":len(chapters),"nonNarrativeUnitCount":len(non_narrative),"paragraphLocatorCount":sum(e["segmentCount"] for e in editions),"wordCount":sum(e["wordCount"] for e in editions),"characterCount":sum(e["charCount"] for e in editions),"sourcePayloadPresent":False,"sourceTextPresent":False,"sourcePathRetained":False,"sourceFilenameRetained":False,"graphEffect":"none","canonEffect":"none"};manifest["manifestFingerprint"]=fingerprint(manifest)
    write_json(out/"PUBLIC_CORPUS_MANIFEST.json",manifest)
    for name,rows in (("CHAPTER_INDEX.ndjson",chapters),("NON_NARRATIVE_UNITS.ndjson",non_narrative)):
        (out/name).write_text("".join(json.dumps(row,ensure_ascii=False,sort_keys=True)+"\n" for row in rows),encoding="utf-8")
    pov={"format":"axm-asoiaf-pov-census/1","generatedAt":generated_at,"bySource":pov_counts,"totals":{heading:sum(values.get(heading,0) for values in pov_counts.values()) for heading in sorted({heading for values in pov_counts.values() for heading in values})},"graphEffect":"none","canonEffect":"none"};pov["fingerprint"]=fingerprint(pov);write_json(out/"POV_CENSUS.json",pov)
    census={"format":"axm-asoiaf-corpus-census/1","generatedAt":generated_at,"books":[{"sourceId":e["sourceId"],"title":e["title"],"sourceDigest":e["sourceDigest"],"narrativeUnits":sum(1 for row in chapters if row["sourceId"]==e["sourceId"]),"frontBackUnits":sum(1 for row in non_narrative if row["sourceId"]==e["sourceId"]),"paragraphs":e["segmentCount"],"words":e["wordCount"],"characters":e["charCount"]} for e in editions],"totals":{"editions":len(editions),"narrativeUnits":len(chapters),"frontBackUnits":len(non_narrative),"paragraphs":sum(e["segmentCount"] for e in editions),"words":sum(e["wordCount"] for e in editions),"characters":sum(e["charCount"] for e in editions)},"sourceTextPresent":False};census["fingerprint"]=fingerprint(census);write_json(out/"CORPUS_CENSUS.json",census)
    return census

def main(argv:Sequence[str]|None=None)->int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--root",required=True);p.add_argument("--out",required=True);p.add_argument("--at",required=True);a=p.parse_args(argv)
    print(json.dumps(build(Path(a.root),Path(a.out),a.at),indent=2,sort_keys=True));return 0
if __name__=="__main__":raise SystemExit(main())
