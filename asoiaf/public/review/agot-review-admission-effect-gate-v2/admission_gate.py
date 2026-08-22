#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, tempfile
from pathlib import Path
from typing import Any, Iterable
COMPONENT='asoiaf-agot-review-admission-effect-gate-v2'
ACTIONS={'confirm','correct','split','merge','reject','defer'}
FORBIDDEN={'sourcetext','paragraphtext','displayedsource','sourceexcerpt','privateparagraph','booktext','copyrightedtext'}
class Refusal(RuntimeError):
    def __init__(self,status,detail):super().__init__(detail);self.status=status;self.detail=detail
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':')).encode()
def digest(v):return hashlib.sha256(canonical(v)).hexdigest()
def file_digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p):return json.loads(Path(p).read_text())
def norm(s):return str(s).casefold().replace('_','').replace('-','')
def walk(v)->Iterable[str]:
    if isinstance(v,dict):
        for k,c in v.items():yield norm(k);yield from walk(c)
    elif isinstance(v,list):
        for c in v:yield from walk(c)
def reject_source(*values):
    if any(FORBIDDEN.intersection(walk(v)) for v in values):raise Refusal('REFUSE_SOURCE_TEXT_FIELD','source-text-bearing field')
def self_digest(v,field):
    c=dict(v);observed=c.pop(field,None)
    if observed!=digest(c):raise Refusal('REFUSE_AUTHORIZATION',field)
def named(v,label):
    value=' '.join(str(v or '').split())
    if len(value)<3 or value.casefold() in {'actor','human','user','test','reviewer'}:raise Refusal('REFUSE_AUTHORIZATION',label)
    return value
def first(v,*names):
    for n in names:
        if v.get(n) is not None:return v[n]
    return None
def parse_sums(p):
    rows={}
    for line in Path(p).read_text().splitlines():
        if not line.strip():continue
        parts=line.split();
        if len(parts)<2 or len(parts[0])!=64:raise Refusal('REFUSE_CHAIN_CHECKSUM','row')
        rows[parts[-1]]=parts[0]
    return rows
def verify_chain(root):
    root=Path(root);names=['transaction-candidate.json','projection-plan.json','CHAIN_RECEIPT.json','CHAIN.SHA256SUMS']
    if any(not (root/n).is_file() for n in names):raise Refusal('REFUSE_CHAIN_OBJECT_MISSING','missing')
    sums=parse_sums(root/'CHAIN.SHA256SUMS')
    for n in names[:3]:
        if sums.get(n)!=file_digest(root/n):raise Refusal('REFUSE_CHAIN_CHECKSUM',n)
    c,p,r=[load(root/n) for n in names[:3]];reject_source(c,p,r)
    if c.get('status')!='PASS_TRANSACTION_CANDIDATE_SEALED_PENDING_REPOSITORY_ADMISSION' or p.get('status')!='PASS_PROJECTION_PLAN_SEALED_NO_EFFECT_EXECUTED' or not str(r.get('status','')).startswith('PASS_'):raise Refusal('REFUSE_CHAIN_STANDING','standing')
    if c.get('transactionExecuted') is not False or c.get('repositoryAdmissionRequired') is not True or p.get('effectAuthorized') is not False:raise Refusal('REFUSE_CHAIN_STANDING','boundary')
    cid=str(first(c,'candidateId','transactionCandidateId','id') or '');pid=str(first(p,'candidateId','transactionCandidateId','id') or '');action=str(first(c,'action','reviewAction') or '');paction=str(first(p,'action','reviewAction') or '')
    if not cid or cid!=pid or action!=paction:raise Refusal('REFUSE_OBJECT_BINDING','candidate/action')
    if action not in ACTIONS:raise Refusal('REFUSE_ACTION_PAYLOAD','action')
    actors=set()
    for value in (c,p,r):
        for key in ('reviewer','stagingExecutor','plannerActor'):
            if isinstance(value.get(key),str):actors.add(value[key].casefold())
    return {'candidate':c,'plan':p,'receipt':r,'candidateId':cid,'action':action,'candidateSha256':file_digest(root/names[0]),'planSha256':file_digest(root/names[1]),'receiptSha256':file_digest(root/names[2]),'upstreamActors':actors}
def payload(chain):
    action=chain['action'];c=chain['candidate'];p=chain['plan'];statement=str(first(p,'candidateStatement','statement','proposition') or first(c,'candidateStatement','statement','proposition') or '').strip()
    if action=='confirm':
        if not statement:raise Refusal('REFUSE_ACTION_PAYLOAD','statement')
        return {'statement':statement}
    if action=='correct':
        corrected=str(first(p,'correctedStatement','replacementStatement') or '').strip()
        if not corrected:raise Refusal('REFUSE_ACTION_PAYLOAD','corrected')
        return {'supersededStatement':statement or None,'correctedStatement':corrected}
    if action=='split':
        rows=[str(x).strip() for x in (first(p,'splitStatements','proposedStatements') or []) if str(x).strip()]
        if len(rows)<2:raise Refusal('REFUSE_ACTION_PAYLOAD','split')
        return {'supersededStatement':statement or None,'splitStatements':rows}
    if action=='merge':
        ids=[str(x).strip() for x in (first(p,'mergeCandidateIds','mergedCandidateIds') or []) if str(x).strip()];merged=str(first(p,'mergedStatement','mergeStatement') or '').strip()
        if not ids or not merged:raise Refusal('REFUSE_ACTION_PAYLOAD','merge')
        return {'mergeCandidateIds':ids,'mergedStatement':merged}
    return {('rejectedStatement' if action=='reject' else 'deferredStatement'):statement or None}
def ops(action,cid,data):
    if action=='confirm':return [{'op':'admit-proposition','candidateId':cid,'statement':data['statement']}]
    if action=='correct':return [{'op':'supersede-candidate','candidateId':cid},{'op':'admit-corrected-proposition','candidateId':cid,'statement':data['correctedStatement']}]
    if action=='split':return [{'op':'supersede-candidate','candidateId':cid}]+[{'op':'admit-split-proposition','candidateId':cid,'childIndex':i,'statement':s} for i,s in enumerate(data['splitStatements'],1)]
    if action=='merge':return [{'op':'supersede-candidates','candidateIds':[cid,*data['mergeCandidateIds']]},{'op':'admit-merged-proposition','candidateIds':[cid,*data['mergeCandidateIds']],'statement':data['mergedStatement']}]
    return [{'op':'record-rejection' if action=='reject' else 'record-deferred-hold','candidateId':cid}]
def atomic(path,data):
    path=Path(path)
    if path.exists():
        if path.read_bytes()==data:return
        raise Refusal('REFUSE_OUTPUT_DIVERGENCE',path.name)
    path.parent.mkdir(parents=True,exist_ok=True);fd,tmp=tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        try:os.unlink(tmp)
        except FileNotFoundError:pass
def render(v):return (json.dumps(v,indent=2,sort_keys=True)+'\n').encode()
def admit(args):
    chain=verify_chain(args.chain);a=load(args.admission_authorization);e=load(args.effect_authorization);reject_source(a,e)
    if a.get('schema')!='axm-asoiaf-repository-admission-authorization/1' or a.get('decision')!='admit':raise Refusal('REFUSE_AUTHORIZATION','admission')
    self_digest(a,'authorizationSha256')
    for field,expected in [('candidateSha256',chain['candidateSha256']),('projectionPlanSha256',chain['planSha256']),('chainReceiptSha256',chain['receiptSha256'])]:
        if a.get(field)!=expected:raise Refusal('REFUSE_AUTHORIZATION',field)
    aa=named(a.get('repositoryAdmissionActor'),'repositoryAdmissionActor')
    if aa.casefold() in chain['upstreamActors']:raise Refusal('REFUSE_ACTOR_COLLISION','admission')
    data=payload(chain);ledger={'schema':'axm-asoiaf-agot-review-transaction-ledger-entry/1','componentId':COMPONENT,'status':'PASS_TRANSACTION_ADMITTED_TO_LEDGER_PENDING_EFFECT_PACKET','transactionCandidateId':chain['candidateId'],'action':chain['action'],'payload':data,'repositoryAdmissionActor':aa,'bindings':{'candidateSha256':chain['candidateSha256'],'projectionPlanSha256':chain['planSha256'],'chainReceiptSha256':chain['receiptSha256'],'admissionAuthorizationSha256':a['authorizationSha256']},'transactionExecuted':False,'effectPacketRequired':True,'repositoryMutationExecuted':False,'canonMutationExecuted':False,'graphMutationExecuted':False,'privateSourceTextPresent':False,'privatePayloadPresent':False};ledger['ledgerEntrySha256']=digest(ledger)
    if e.get('schema')!='axm-asoiaf-effect-packet-authorization/1' or e.get('decision')!='authorize-packet' or e.get('authorizedScope')!='effect-packet-only':raise Refusal('REFUSE_AUTHORIZATION','effect')
    self_digest(e,'authorizationSha256')
    if e.get('ledgerEntrySha256')!=ledger['ledgerEntrySha256'] or e.get('projectionPlanSha256')!=chain['planSha256']:raise Refusal('REFUSE_AUTHORIZATION','effect binding')
    ea=named(e.get('effectPacketActor'),'effectPacketActor')
    if ea.casefold()==aa.casefold() or ea.casefold() in chain['upstreamActors']:raise Refusal('REFUSE_ACTOR_COLLISION','effect')
    packet={'schema':'axm-asoiaf-agot-repository-effect-packet/1','componentId':COMPONENT,'status':'PASS_REPOSITORY_EFFECT_PACKET_SEALED_PENDING_SEPARATE_PR','transactionCandidateId':chain['candidateId'],'action':chain['action'],'operations':ops(chain['action'],chain['candidateId'],data),'preconditions':{'targetBaseCommit':e.get('targetBaseCommit'),'targetStateFingerprint':e.get('targetStateFingerprint'),'ledgerEntrySha256':ledger['ledgerEntrySha256'],'projectionPlanSha256':chain['planSha256']},'effectPacketActor':ea,'effectAuthorizationSha256':e['authorizationSha256'],'pullRequestRequired':True,'separateRepositoryExecutorRequired':True,'repositoryMutationExecuted':False,'canonMutationExecuted':False,'graphMutationExecuted':False,'privateSourceTextPresent':False,'privatePayloadPresent':False};packet['effectPacketSha256']=digest(packet)
    receipt={'schema':'axm-asoiaf-agot-review-admission-effect-gate-receipt/2','componentId':COMPONENT,'status':'PASS_LEDGER_ADMISSION_AND_EFFECT_PACKET_SEALED_NO_EFFECT_EXECUTED','ledgerEntrySha256':ledger['ledgerEntrySha256'],'effectPacketSha256':packet['effectPacketSha256'],'repositoryMutationExecuted':False,'canonMutationExecuted':False,'graphMutationExecuted':False};receipt['receiptSha256']=digest(receipt)
    out=Path(args.out);atomic(out/'LEDGER_ENTRY.json',render(ledger));atomic(out/'REPOSITORY_EFFECT_PACKET.json',render(packet));atomic(out/'GATE_RECEIPT.json',render(receipt));return receipt
def fixture(root,action):
    root=Path(root);root.mkdir();c={'status':'PASS_TRANSACTION_CANDIDATE_SEALED_PENDING_REPOSITORY_ADMISSION','candidateId':f'fixture-{action}','action':action,'candidateStatement':'Invented proposition.','reviewer':'Alice Reviewer','stagingExecutor':'Bob Stager','transactionExecuted':False,'repositoryAdmissionRequired':True};p={'status':'PASS_PROJECTION_PLAN_SEALED_NO_EFFECT_EXECUTED','candidateId':f'fixture-{action}','action':action,'candidateStatement':'Invented proposition.','plannerActor':'Carol Planner','effectAuthorized':False}
    if action=='correct':p['correctedStatement']='Corrected invented proposition.'
    if action=='split':p['splitStatements']=['Invented one.','Invented two.']
    if action=='merge':p['mergeCandidateIds']=['fixture-other'];p['mergedStatement']='Merged invented proposition.'
    r={'status':'PASS_FIXTURE_CHAIN'}
    for n,v in [('transaction-candidate.json',c),('projection-plan.json',p),('CHAIN_RECEIPT.json',r)]:Path(root/n).write_text(json.dumps(v))
    Path(root/'CHAIN.SHA256SUMS').write_text('\n'.join(f'{file_digest(root/n)}  {n}' for n in ['transaction-candidate.json','projection-plan.json','CHAIN_RECEIPT.json'])+'\n')
def self_test():
    checks=[]
    def check(v,l):checks.append((l,bool(v)));assert v,l
    with tempfile.TemporaryDirectory() as t:
        base=Path(t)
        for action in sorted(ACTIONS):
            case=base/action;fixture(case,action);chain=verify_chain(case);a={'schema':'axm-asoiaf-repository-admission-authorization/1','decision':'admit','repositoryAdmissionActor':'Dana Admission','candidateSha256':chain['candidateSha256'],'projectionPlanSha256':chain['planSha256'],'chainReceiptSha256':chain['receiptSha256']};a['authorizationSha256']=digest(a);data=payload(chain);ledger={'schema':'axm-asoiaf-agot-review-transaction-ledger-entry/1','componentId':COMPONENT,'status':'PASS_TRANSACTION_ADMITTED_TO_LEDGER_PENDING_EFFECT_PACKET','transactionCandidateId':chain['candidateId'],'action':action,'payload':data,'repositoryAdmissionActor':'Dana Admission','bindings':{'candidateSha256':chain['candidateSha256'],'projectionPlanSha256':chain['planSha256'],'chainReceiptSha256':chain['receiptSha256'],'admissionAuthorizationSha256':a['authorizationSha256']},'transactionExecuted':False,'effectPacketRequired':True,'repositoryMutationExecuted':False,'canonMutationExecuted':False,'graphMutationExecuted':False,'privateSourceTextPresent':False,'privatePayloadPresent':False};ledger['ledgerEntrySha256']=digest(ledger);e={'schema':'axm-asoiaf-effect-packet-authorization/1','decision':'authorize-packet','effectPacketActor':'Erin Effect','ledgerEntrySha256':ledger['ledgerEntrySha256'],'projectionPlanSha256':chain['planSha256'],'targetBaseCommit':'base','targetStateFingerprint':'state','authorizedScope':'effect-packet-only'};e['authorizationSha256']=digest(e);Path(case/'a.json').write_text(json.dumps(a));Path(case/'e.json').write_text(json.dumps(e));args=argparse.Namespace(chain=str(case),admission_authorization=str(case/'a.json'),effect_authorization=str(case/'e.json'),out=str(case/'out'));result=admit(args);check(result['status'].startswith('PASS_'),action)
        check(len(checks)==6,'six actions')
        bad=base/'bad';fixture(bad,'confirm');c=load(bad/'transaction-candidate.json');c['sourceText']='forbidden';Path(bad/'transaction-candidate.json').write_text(json.dumps(c));Path(bad/'CHAIN.SHA256SUMS').write_text('\n'.join(f'{file_digest(bad/n)}  {n}' for n in ['transaction-candidate.json','projection-plan.json','CHAIN_RECEIPT.json'])+'\n')
        try:verify_chain(bad);check(False,'source refusal')
        except Refusal as x:check(x.status=='REFUSE_SOURCE_TEXT_FIELD','source refusal')
        collision=base/'collision';fixture(collision,'confirm');chain=verify_chain(collision);a={'schema':'axm-asoiaf-repository-admission-authorization/1','decision':'admit','repositoryAdmissionActor':'Alice Reviewer','candidateSha256':chain['candidateSha256'],'projectionPlanSha256':chain['planSha256'],'chainReceiptSha256':chain['receiptSha256']};a['authorizationSha256']=digest(a);Path(collision/'a.json').write_text(json.dumps(a));Path(collision/'e.json').write_text('{}')
        try:admit(argparse.Namespace(chain=str(collision),admission_authorization=str(collision/'a.json'),effect_authorization=str(collision/'e.json'),out=str(collision/'out')));check(False,'actor refusal')
        except Refusal as x:check(x.status=='REFUSE_ACTOR_COLLISION','actor refusal')
    check(len(checks)==9,'check census')
    return {'schema':'axm-asoiaf-agot-review-admission-effect-gate-self-test/2','componentId':COMPONENT,'status':'PASS','passed':len(checks),'total':len(checks),'failed':0,'fixtureSourceTextOnly':True,'realPrivateSourceUsed':False,'realTransactionsAdmitted':0,'realEffectPacketsSealed':0,'repositoryMutationsExecuted':0,'automaticCanonPromotions':0,'automaticGraphMutations':0}
def main():
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True);a=sub.add_parser('admit');a.add_argument('--chain',required=True);a.add_argument('--admission-authorization',required=True);a.add_argument('--effect-authorization',required=True);a.add_argument('--out',required=True);sub.add_parser('self-test');args=p.parse_args()
    try:result=self_test() if args.command=='self-test' else admit(args);code=0
    except Refusal as x:result={'schema':'axm-asoiaf-agot-review-admission-effect-gate-refusal/2','componentId':COMPONENT,'status':x.status,'detail':x.detail,'repositoryMutationExecuted':False,'canonMutationExecuted':False,'graphMutationExecuted':False};code=3
    print(json.dumps(result,indent=2,sort_keys=True));return code
if __name__=='__main__':raise SystemExit(main())
