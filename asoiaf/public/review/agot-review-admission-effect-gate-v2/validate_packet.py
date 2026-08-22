#!/usr/bin/env python3
import argparse,hashlib,json
from pathlib import Path
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':')).encode()
def main():
 p=argparse.ArgumentParser();p.add_argument('--ledger',required=True);p.add_argument('--packet',required=True);a=p.parse_args();e=[]
 try:
  l=json.loads(Path(a.ledger).read_text());q=json.loads(Path(a.packet).read_text())
  if l.get('status')!='PASS_TRANSACTION_ADMITTED_TO_LEDGER_PENDING_EFFECT_PACKET':e.append('ledger')
  if q.get('status')!='PASS_REPOSITORY_EFFECT_PACKET_SEALED_PENDING_SEPARATE_PR':e.append('packet')
  for v,f in [(l,'ledgerEntrySha256'),(q,'effectPacketSha256')]:
   c=dict(v);o=c.pop(f,None)
   if o!=hashlib.sha256(canonical(c)).hexdigest():e.append(f)
  if l.get('transactionCandidateId')!=q.get('transactionCandidateId') or l.get('action')!=q.get('action'):e.append('binding')
  if q.get('preconditions',{}).get('ledgerEntrySha256')!=l.get('ledgerEntrySha256'):e.append('precondition')
  for v in (l,q):
   for f in ('repositoryMutationExecuted','canonMutationExecuted','graphMutationExecuted','privateSourceTextPresent','privatePayloadPresent'):
    if v.get(f) is not False:e.append(f)
 except Exception as x:e.append(str(x))
 r={'schema':'axm-asoiaf-agot-review-admission-effect-packet-validation/2','status':'PASS_VALID_FOR_SEPARATE_REPOSITORY_EXECUTOR' if not e else 'REFUSE_INVALID_PACKET','passed':not e,'errors':e};print(json.dumps(r,indent=2,sort_keys=True));return 0 if not e else 3
if __name__=='__main__':raise SystemExit(main())
