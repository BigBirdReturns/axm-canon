#!/usr/bin/env python3
"""Validate the committed public-safe ASOIAF corpus and reader boundary."""
from __future__ import annotations
import argparse, hashlib, json, re, sys
from pathlib import Path
from typing import Any, Iterable, Sequence

FORBIDDEN_KEYS={"text","snippet","boundedSnippet","queryText","sourcePath","sourceFilename","privateRelativeUri"}
FORBIDDEN_PATTERNS=[re.compile(r"(?:^|[\"'\s])/(?:mnt|tmp|home|Users|private)/",re.I),re.compile(r"(?:^|[\"'\s])[A-Za-z]:[\\/]")]

def canonical(v:Any)->bytes:return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
def digest(v:Any)->str:return "sha256:"+hashlib.sha256(canonical(v)).hexdigest()
def rows(path:Path)->Iterable[Any]:
    for line_no,line in enumerate(path.read_text(encoding="utf-8").splitlines(),1):
        if line.strip():
            try:yield json.loads(line)
            except Exception as exc:raise RuntimeError(f"invalid NDJSON {path}:{line_no}: {exc}") from exc

def walk(value:Any,path:str="$")->Iterable[tuple[str,Any]]:
    if isinstance(value,dict):
        for key,item in value.items():
            yield path+"."+key,item;yield from walk(item,path+"."+key)
    elif isinstance(value,list):
        for index,item in enumerate(value):yield from walk(item,f"{path}[{index}]")

def self_digest(value:dict[str,Any],field:str)->bool:
    candidate=dict(value);observed=candidate.pop(field,None);return observed==digest(candidate)

def validate(root:Path,reader:Path|None)->dict[str,Any]:
    errors=[]
    required=["PUBLIC_CORPUS_MANIFEST.json","CHAPTER_INDEX.ndjson","NON_NARRATIVE_UNITS.ndjson","POV_CENSUS.json","CORPUS_CENSUS.json","CANDIDATE_EVIDENCE_ROUTING.ndjson","CANDIDATE_EVIDENCE_ROUTING_SUMMARY.json","ENTITY_CONCORDANCE.json","ENTITY_CONCORDANCE_SUMMARY.json","OPENING_GATE.json"]
    for name in required:
        if not (root/name).exists():errors.append(f"missing {name}")
    if errors:return {"status":"HOLD","errors":errors,"passed":False}
    manifest=json.loads((root/required[0]).read_text());chapters=list(rows(root/required[1]));non=list(rows(root/required[2]));pov=json.loads((root/required[3]).read_text());census=json.loads((root/required[4]).read_text());routes=list(rows(root/required[5]));route_summary=json.loads((root/required[6]).read_text());entity=json.loads((root/required[7]).read_text());entity_summary=json.loads((root/required[8]).read_text());opening=json.loads((root/required[9]).read_text())
    if not self_digest(manifest,"manifestFingerprint"):errors.append("manifest fingerprint mismatch")
    if not self_digest(pov,"fingerprint"):errors.append("POV fingerprint mismatch")
    if not self_digest(census,"fingerprint"):errors.append("census fingerprint mismatch")
    if not self_digest(route_summary,"fingerprint"):errors.append("route-summary fingerprint mismatch")
    if not self_digest(entity_summary,"fingerprint"):errors.append("entity-summary fingerprint mismatch")
    if not self_digest(opening,"gateFingerprint"):errors.append("opening-gate fingerprint mismatch")
    expected={"editions":6,"chapters":347,"nonNarrative":111,"paragraphs":45828,"candidates":805,"entities":254,"opening":31}
    observed={"editions":manifest["editionCount"],"chapters":len(chapters),"nonNarrative":len(non),"paragraphs":manifest["paragraphLocatorCount"],"candidates":len(routes),"entities":len(entity["records"]),"opening":opening["recordCount"]}
    if observed!=expected:errors.append(f"count mismatch: {observed} != {expected}")
    values=[manifest,chapters,non,pov,census,routes,route_summary,entity,entity_summary,opening]
    for value in values:
        for item_path,item in walk(value):
            key=item_path.rsplit(".",1)[-1]
            if key in FORBIDDEN_KEYS and item not in (None,False,[],{}):errors.append(f"forbidden populated field {item_path}")
    for path in [root/name for name in required]:
        text=path.read_text(encoding="utf-8",errors="strict")
        for pattern in FORBIDDEN_PATTERNS:
            if pattern.search(text):errors.append(f"forbidden path or payload marker in {path.name}: {pattern.pattern}")
    if manifest.get("sourceTextPresent") is not False or manifest.get("sourcePayloadPresent") is not False:errors.append("manifest source boundary is not false")
    if any(row.get("reviewRequired") is not True or row.get("canonEffect")!="none" for row in routes):errors.append("candidate route standing drift")
    if any(row.get("promotionStatus")!="draft-awaiting-human-review" or row.get("canonEffect")!="none" for row in entity["records"]):errors.append("entity standing drift")
    if opening.get("promotionCount")!=0 or any(row.get("humanReviewRequired") is not True or row.get("sourceTextPresent") is not False for row in opening["records"]):errors.append("opening-gate standing drift")
    reader_digest=None
    if reader is not None:
        if not reader.exists():errors.append("reader missing")
        else:
            html=reader.read_text(encoding="utf-8");reader_digest="sha256:"+hashlib.sha256(html.encode()).hexdigest()
            if "SOURCE TEXT ABSENT" not in html or "const DATA=" not in html:errors.append("reader boundary or embedded data missing")
    return {"format":"axm-asoiaf-public-corpus-verification/1","status":"PASS" if not errors else "HOLD","counts":observed,"readerSha256":reader_digest,"errors":errors,"passed":not errors,"sourceTextPresent":False,"promotionCount":0,"graphEffect":"none","canonEffect":"none"}

def main(argv:Sequence[str]|None=None)->int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--root",required=True);p.add_argument("--reader");a=p.parse_args(argv)
    result=validate(Path(a.root),Path(a.reader) if a.reader else None);print(json.dumps(result,indent=2,sort_keys=True));return 0 if result["passed"] else 1
if __name__=="__main__":raise SystemExit(main())
