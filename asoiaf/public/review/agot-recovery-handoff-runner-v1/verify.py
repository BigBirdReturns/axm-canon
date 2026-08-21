#!/usr/bin/env python3
from __future__ import annotations
import ast
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]

def main() -> int:
    checks=[]
    def check(cond,label):
        checks.append({"label":label,"passed":bool(cond)})
        if not cond: raise AssertionError(label)
    contract=json.loads((ROOT/'CONTRACT.json').read_text())
    source=(ROOT/'reconstruct_handoff.py').read_text()
    tree=ast.parse(source)
    check(contract['schema']=='axm-asoiaf-agot-recovery-handoff-runner-contract/1','contract schema')
    check(contract['sourceCarrier']['decodedBytes']==107565,'decoded bytes')
    check(contract['sourceCarrier']['decodedSha256']=='dd70c8c9d5de23db7014d8e4d89b73a52d24ecedc8986c4e42812e7820a390d9','decoded digest')
    check(contract['authorityBoundary']['privateSourceTextPresent'] is False,'no source text')
    check(contract['authorityBoundary']['privatePayloadPresent'] is False,'no private payload')
    check(contract['authorityBoundary']['automaticCanonPromotions']==0,'zero canon promotions')
    check(contract['authorityBoundary']['automaticGraphMutations']==0,'zero graph mutations')
    check('requests' not in {node.id for node in ast.walk(tree) if isinstance(node,ast.Name)},'no remote client')
    check('urllib' not in source,'no urllib')
    check('mode=ro' not in source,'runner does not open private database')
    env={**os.environ,'PYTHONWARNINGS':'error','PYTHONDONTWRITEBYTECODE':'1'}
    run=subprocess.run([sys.executable,str(ROOT/'reconstruct_handoff.py'),'verify','--repo-root',str(REPO)],capture_output=True,text=True,env=env)
    check(run.returncode==0,'live carrier verification')
    result=json.loads(run.stdout)
    check(result['status']=='PASS_EXACT_HANDOFF_RECONSTRUCTABLE','live exact standing')
    check(result['chunkCount']>0,'carrier chunks observed')
    check(result['expandedFileCount']==45,'expanded file census')
    with tempfile.TemporaryDirectory(prefix='axm-agot-runner-') as tmp:
        out=Path(tmp)/'handoff'
        extract=subprocess.run([sys.executable,str(ROOT/'reconstruct_handoff.py'),'extract','--repo-root',str(REPO),'--out',str(out)],capture_output=True,text=True,env=env)
        check(extract.returncode==0,'safe local extraction')
        check((out/'asoiaf-agot-recovery-to-review-handoff-v1'/'Run-Recovery-And-Resolve.cmd').is_file(),'inner launcher present')
        check((out/'LOCAL_EXTRACTION_RECEIPT.json').is_file(),'local receipt present')
        refused=subprocess.run([sys.executable,str(ROOT/'reconstruct_handoff.py'),'extract','--repo-root',str(REPO),'--out',str(out)],capture_output=True,text=True,env=env)
        check(refused.returncode==24,'nonempty output refused')
    expected=19
    check(len(checks)+1==expected,f'exact verifier count {expected}')
    print(json.dumps({
      'schema':'axm-asoiaf-agot-recovery-handoff-runner-verification/1',
      'componentId':'asoiaf-agot-recovery-handoff-runner-v1',
      'status':'PASS','passed':sum(row['passed'] for row in checks),'total':len(checks),
      'warningsAsErrors':os.environ.get('PYTHONWARNINGS')=='error',
      'privateSourceTextPresent':False,'privatePayloadPresent':False,
      'reviewTransactionsExecuted':0,'automaticCanonPromotions':0,'automaticGraphMutations':0
    },indent=2,sort_keys=True))
    return 0
if __name__=='__main__': raise SystemExit(main())
