#!/usr/bin/env python3
from pathlib import Path
import json, sqlite3, re, hashlib, collections
import argparse
parser=argparse.ArgumentParser(description='Route all recall candidates against the private SQLite corpus')
parser.add_argument('--repo',required=True);parser.add_argument('--private-root',required=True);parser.add_argument('--public-root',required=True);parser.add_argument('--database');parser.add_argument('--at',required=True)
args=parser.parse_args()
REPO=Path(args.repo).resolve();PRIVATE=Path(args.private_root).resolve();PUBLIC=Path(args.public_root).resolve();PUBLIC.mkdir(parents=True,exist_ok=True)
DB=Path(args.database).resolve() if args.database else PRIVATE/'private-research'/'ASOIAF-PRIVATE-CORPUS.sqlite3'
SRCMAP={'AGOT':'local-agot','ACOK':'local-acok','ASOS':'local-asos','AFFC':'local-affc','ADWD':'local-adwd','D&E':'local-dunk-egg','DUNK-EGG':'local-dunk-egg'}
STOP={'the','a','an','of','and','or','is','are','to','in','as','for','with','from','by','after','before','be','becoming','not','model','recall','conversation','book','show','mechanism','function','state','rule','question','decision','endpoint','event','relation','knowledge','claim','legal','holds','requires','preserves','binds','remains','becomes'}

def tokens(s):
    return [x.lower() for x in re.findall(r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?",s.replace('-',' ')) if len(x)>1 and x.lower() not in STOP]

def quote_phrase(s):
    ts=tokens(s)
    if not ts:return None
    return '"'+' '.join(t.replace('"','') for t in ts)+'"'

def id_phrase(s): return quote_phrase(s.replace('-',' '))

def candidate_query(c):
    kind=c.get('kind')
    label=c.get('label','')
    norm=c.get('normalized') or {}
    phrases=[]
    if kind=='entity':
        phrases=[quote_phrase(norm.get('displayName') or label)]
    elif kind=='relation':
        ids=[]
        for key in ('subjectId','objectId','childId','actorId','carrier'):
            v=norm.get(key)
            if isinstance(v,str): ids.append(v)
        for key in ('parentIds','participantIds'):
            v=norm.get(key)
            if isinstance(v,list): ids += [x for x in v if isinstance(x,str)]
        if len(ids)>=2:
            phrases=[id_phrase(x) for x in ids[:3]]
        else: phrases=[quote_phrase(label)]
    elif kind in {'event','endpoint','function','knowledge','state','proposition','decision','event-chain'}:
        # Prefer named keys, then concise label.
        keys=[]
        for k in c.get('reconciliationKeys',[]):
            if not isinstance(k,str) or k.startswith('recall-') or k.startswith('conversation-'): continue
            if len(tokens(k))>=1: keys.append(k)
        phrases=[id_phrase(x) for x in keys[:3]]
        if not phrases or sum(len(tokens(x or '')) for x in phrases)<2: phrases=[quote_phrase(label)]
    elif kind=='rule':
        keys=[k for k in c.get('reconciliationKeys',[]) if isinstance(k,str) and not k.startswith(('recall-','conversation-'))]
        phrases=[id_phrase(x) for x in keys[:2]] or [quote_phrase(label)]
    else:
        phrases=[quote_phrase(label)]
    phrases=[p for p in phrases if p]
    # Avoid over-constraining long analytical labels.
    if len(phrases)>1:
        return ' AND '.join(phrases[:3]), 'conjunctive'
    if phrases:
        p=phrases[0]
        # exact phrase first, suitable for most names/events
        return p,'phrase'
    ts=[]
    for k in c.get('reconciliationKeys',[]): ts += tokens(str(k))
    ts=list(dict.fromkeys(ts))[:5]
    return ' AND '.join(ts) if ts else None,'terms'

def fallback_query(c):
    vals=[]
    vals += tokens(c.get('label',''))
    for k in c.get('reconciliationKeys',[]): vals+=tokens(str(k))
    vals=list(dict.fromkeys(vals))
    # Prefer proper/specific terms, max six.
    vals=[v for v in vals if len(v)>=3][:6]
    return ' OR '.join(vals) if vals else None

def sha(v): return 'sha256:'+hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

packets=[]; candidates=[]
for p in sorted((REPO/'asoiaf/src/recall/data').glob('*.json')):
    j=json.load(open(p))
    if not isinstance(j,dict) or not j.get('candidates'): continue
    packets.append({'packetId':j['id'],'path':str(p.relative_to(REPO)),'candidateCount':len(j['candidates'])})
    for c in j['candidates']: candidates.append((j['id'],c))

con=sqlite3.connect(DB)
con.row_factory=sqlite3.Row
private_rows=[]; public_rows=[]; status=collections.Counter(); source_coverage=collections.Counter(); total_leads=0
for packet_id,c in candidates:
    source_ids=sorted({SRCMAP[h] for h in c.get('sourceHints',[]) if h in SRCMAP})
    q,mode=candidate_query(c)
    query_used=q
    rows=[]
    if source_ids and q:
        placeholders=','.join('?'*len(source_ids))
        sql=f'''SELECT d.document_id,d.source_id,d.edition_key,d.unit_id,d.unit_label,d.unit_order,d.segment_id,d.paragraph_index,d.text_digest,d.locator_json,
                bm25(documents_fts) AS rank,
                snippet(documents_fts,0,'⟦','⟧',' … ',42) AS snippet
                FROM documents_fts JOIN documents d ON d.rowid=documents_fts.rowid
                WHERE documents_fts MATCH ? AND d.source_id IN ({placeholders})
                ORDER BY rank,d.source_id,d.unit_order,d.paragraph_index LIMIT 5'''
        try: rows=con.execute(sql,[q,*source_ids]).fetchall()
        except sqlite3.OperationalError: rows=[]
        if not rows:
            fq=fallback_query(c)
            if fq:
                query_used=fq; mode='fallback-any'
                try: rows=con.execute(sql,[fq,*source_ids]).fetchall()
                except sqlite3.OperationalError: rows=[]
    if not source_ids:
        st='awaiting-uningested-source'
    elif rows:
        st='evidence-leads-found'
    else:
        st='no-lead-found'
    status[st]+=1
    for s in source_ids: source_coverage[s]+=1
    matches=[]; private_matches=[]
    for r in rows:
        loc=json.loads(r['locator_json'])
        m={'documentId':r['document_id'],'sourceId':r['source_id'],'editionKey':r['edition_key'],'unitId':r['unit_id'],'unitLabel':r['unit_label'],'unitOrder':r['unit_order'],'segmentId':r['segment_id'],'paragraphIndex':r['paragraph_index'],'textDigest':r['text_digest'],'locator':loc,'rank':round(float(r['rank']),8)}
        matches.append(m)
        private_matches.append({**m,'boundedSnippet':r['snippet'],'snippetDigest':'sha256:'+hashlib.sha256((r['snippet'] or '').encode()).hexdigest()})
    total_leads += len(matches)
    base={'format':'axm-asoiaf-candidate-evidence-route/1','packetId':packet_id,'candidateId':c['id'],'domain':c['domain'],'kind':c['kind'],'label':c['label'],'candidateAuthority':'model-recall-or-conversation-synthesis','status':st,'sourceIds':source_ids,'queryMode':mode,'queryDigest':'sha256:'+hashlib.sha256((query_used or '').encode()).hexdigest(),'matchCount':len(matches),'graphEffect':'none','canonEffect':'none','reviewRequired':True}
    pub={**base,'matches':matches}; pub['routeFingerprint']=sha(pub); public_rows.append(pub)
    priv={**base,'queryText':query_used,'matches':private_matches,'repositoryEligible':False}; priv['routeFingerprint']=sha(priv); private_rows.append(priv)

con.close()
with (PUBLIC/'CANDIDATE_EVIDENCE_ROUTING.ndjson').open('w',encoding='utf-8',newline='\n') as f:
    for r in public_rows:f.write(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n')
prdir=PRIVATE/'private-research'; prdir.mkdir(exist_ok=True)
with (prdir/'CANDIDATE-EVIDENCE-LEADS.ndjson').open('w',encoding='utf-8',newline='\n') as f:
    for r in private_rows:f.write(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n')
summary={'format':'axm-asoiaf-candidate-evidence-routing-summary/1','generatedAt':args.at,'candidateCount':len(candidates),'packetCount':len(packets),'leadCount':total_leads,'statusCounts':dict(status),'candidateCountsBySource':dict(source_coverage),'packets':packets,'sourceTextPresent':False,'candidatePromotionCount':0,'reviewRequired':True,'graphEffect':'none','canonEffect':'none'}
summary['fingerprint']=sha(summary)
(PUBLIC/'CANDIDATE_EVIDENCE_ROUTING_SUMMARY.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False,sort_keys=True)+'\n')
(prdir/'CANDIDATE-EVIDENCE-LEADS-SUMMARY.json').write_text(json.dumps({**summary,'repositoryEligible':False,'privateSnippetsPresent':True},indent=2,ensure_ascii=False,sort_keys=True)+'\n')
print(json.dumps(summary,indent=2))
