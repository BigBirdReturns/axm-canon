#!/usr/bin/env python3
from pathlib import Path
import json,sqlite3,re,hashlib,collections
import argparse
parser=argparse.ArgumentParser(description='Build public-safe entity concordance')
parser.add_argument('--repo',required=True);parser.add_argument('--private-root',required=True);parser.add_argument('--public-root',required=True);parser.add_argument('--database');parser.add_argument('--at',required=True)
args=parser.parse_args()
REPO=Path(args.repo).resolve();PRIVATE=Path(args.private_root).resolve();PUBLIC=Path(args.public_root).resolve();PUBLIC.mkdir(parents=True,exist_ok=True)
DB=Path(args.database).resolve() if args.database else PRIVATE/'private-research'/'ASOIAF-PRIVATE-CORPUS.sqlite3'
SRCMAP={'AGOT':'local-agot','ACOK':'local-acok','ASOS':'local-asos','AFFC':'local-affc','ADWD':'local-adwd','D&E':'local-dunk-egg'}
entities=[]
for p in (REPO/'asoiaf/src/recall/data').glob('*.json'):
 j=json.load(open(p))
 if isinstance(j,dict): entities += [c for c in j.get('candidates',[]) if c.get('kind')=='entity']

def terms(s): return re.findall(r"[\w’']+",s.replace('-',' '),re.UNICODE)
def phrase(s): return '"'+' '.join(t.replace('"','') for t in terms(s))+'"'
def digest(v): return 'sha256:'+hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
con=sqlite3.connect(DB); con.row_factory=sqlite3.Row
public=[]; private=[]; matched=0; source_counts=collections.Counter()
for c in sorted(entities,key=lambda x:x['id']):
    source_ids=sorted({SRCMAP[h] for h in c.get('sourceHints',[]) if h in SRCMAP})
    aliases=[]
    for x in [c.get('label',''),*(c.get('reconciliationKeys') or [])]:
        if not isinstance(x,str):continue
        x=x.replace('-',' ').strip()
        if len(terms(x)) and x.lower() not in {a.lower() for a in aliases}: aliases.append(x)
    aliases=aliases[:4]
    by_source=[]; private_by_source=[]; total=0
    for source in source_ids:
        best=None; count=0; used=None
        for alias in aliases:
            q=phrase(alias)
            try:
                count=con.execute("select count(*) from documents_fts join documents d on d.rowid=documents_fts.rowid where documents_fts match ? and d.source_id=?",(q,source)).fetchone()[0]
            except sqlite3.OperationalError: count=0
            if count:
                used=alias
                best=con.execute("""select d.document_id,d.edition_key,d.unit_id,d.unit_label,d.unit_order,d.segment_id,d.paragraph_index,d.text_digest,d.locator_json,
                       snippet(documents_fts,0,'⟦','⟧',' … ',32) snip from documents_fts join documents d on d.rowid=documents_fts.rowid
                       where documents_fts match ? and d.source_id=? order by d.unit_order,d.paragraph_index limit 1""",(q,source)).fetchone()
                break
        if count and best:
            total+=count; source_counts[source]+=1
            loc=json.loads(best['locator_json'])
            row={'sourceId':source,'occurrenceCount':count,'matchedAlias':used,'firstDocumentId':best['document_id'],'editionKey':best['edition_key'],'unitId':best['unit_id'],'unitLabel':best['unit_label'],'unitOrder':best['unit_order'],'segmentId':best['segment_id'],'paragraphIndex':best['paragraph_index'],'textDigest':best['text_digest'],'locator':loc}
            by_source.append(row)
            private_by_source.append({**row,'boundedSnippet':best['snip'],'snippetDigest':'sha256:'+hashlib.sha256(best['snip'].encode()).hexdigest()})
    status='source-attested' if total else ('awaiting-uningested-source' if not source_ids else 'not-found-in-ingested-sources')
    if total: matched+=1
    base={'format':'axm-asoiaf-entity-concordance-record/1','candidateId':c['id'],'entityId':c['normalized'].get('entityId'),'label':c['label'],'entityKind':c['normalized'].get('entityKind'),'status':status,'sourceIds':source_ids,'occurrenceCount':total,'candidateAuthority':'model-recall','promotionStatus':'draft-awaiting-human-review','graphEffect':'none','canonEffect':'none'}
    pub={**base,'sourceAttestations':by_source}; pub['fingerprint']=digest(pub); public.append(pub)
    priv={**base,'sourceAttestations':private_by_source,'repositoryEligible':False}; priv['fingerprint']=digest(priv); private.append(priv)
con.close()
(PUBLIC/'ENTITY_CONCORDANCE.json').write_text(json.dumps({'format':'axm-asoiaf-entity-concordance/1','generatedAt':args.at,'entityCandidateCount':len(entities),'sourceAttestedCount':matched,'records':public,'sourceTextPresent':False,'promotionCount':0,'graphEffect':'none','canonEffect':'none'},indent=2,ensure_ascii=False,sort_keys=True)+'\n')
(PRIVATE/'private-research'/'ENTITY-CONCORDANCE-PRIVATE.json').write_text(json.dumps({'format':'axm-asoiaf-entity-concordance-private/1','generatedAt':args.at,'entityCandidateCount':len(entities),'sourceAttestedCount':matched,'records':private,'repositoryEligible':False},indent=2,ensure_ascii=False,sort_keys=True)+'\n')
summary={'format':'axm-asoiaf-entity-concordance-summary/1','generatedAt':args.at,'entityCandidateCount':len(entities),'sourceAttestedCount':matched,'notAttestedCount':len(entities)-matched,'attestedCandidateCountsBySource':dict(source_counts),'promotionCount':0,'humanReviewRequired':True,'sourceTextPresent':False}
summary['fingerprint']=digest(summary); (PUBLIC/'ENTITY_CONCORDANCE_SUMMARY.json').write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n')
print(json.dumps(summary,indent=2))
