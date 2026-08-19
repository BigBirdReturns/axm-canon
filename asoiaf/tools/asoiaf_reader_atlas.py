#!/usr/bin/env python3
"""Build a self-contained public-safe ASOIAF source atlas."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Sequence

DATA_FILES = {
    "manifest": "PUBLIC_CORPUS_MANIFEST.json",
    "census": "CORPUS_CENSUS.json",
    "pov": "POV_CENSUS.json",
    "candidateSummary": "CANDIDATE_EVIDENCE_ROUTING_SUMMARY.json",
    "entitySummary": "ENTITY_CONCORDANCE_SUMMARY.json",
    "opening": "OPENING_GATE.json",
}
NDJSON_FILES = {
    "chapters": "CHAPTER_INDEX.ndjson",
    "nonNarrative": "NON_NARRATIVE_UNITS.ndjson",
    "candidates": "CANDIDATE_EVIDENCE_ROUTING.ndjson",
}


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def read_ndjson(path: Path) -> list[Any]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_data(root: Path) -> dict[str, Any]:
    data = {key: json.loads((root / name).read_text(encoding="utf-8")) for key, name in DATA_FILES.items()}
    data.update({key: read_ndjson(root / name) for key, name in NDJSON_FILES.items()})
    data["entities"] = json.loads((root / "ENTITY_CONCORDANCE.json").read_text(encoding="utf-8"))["records"]
    return data


def html_template(data_json: str, data_fingerprint: str) -> str:
    return r'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>AXM Canon · ASOIAF Source Atlas</title>
<style>
:root{--bg:#090b0f;--panel:#10141b;--panel2:#151b24;--line:#26303d;--text:#edf2f8;--muted:#9aa8b8;--accent:#d6b46a;--accent2:#88b7c9;--good:#79c99e;--warn:#e0b865;--hold:#d77f7f;--shadow:0 20px 60px rgba(0,0,0,.32)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 10% -10%,#1e2531 0,transparent 31rem),var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input,select{font:inherit}a{color:var(--accent2)}
.shell{display:grid;grid-template-columns:255px 1fr;min-height:100vh}.rail{position:sticky;top:0;height:100vh;padding:28px 20px;border-right:1px solid var(--line);background:rgba(9,11,15,.92);backdrop-filter:blur(16px);overflow:auto}.brand{font:700 18px/1.1 Georgia,serif;letter-spacing:.03em}.brand small{display:block;margin-top:8px;color:var(--muted);font:500 11px/1.4 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase}.rail nav{display:grid;gap:7px;margin-top:30px}.nav{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:1px solid transparent;border-radius:9px;color:var(--muted);background:transparent;text-align:left;cursor:pointer}.nav:hover,.nav.active{color:var(--text);background:var(--panel2);border-color:var(--line)}.rail-note{margin-top:28px;padding:13px;border:1px solid var(--line);border-radius:10px;color:var(--muted);font-size:12px}.rail-note strong{color:var(--good)}
main{min-width:0;padding:34px clamp(22px,4vw,64px) 80px}.hero{display:flex;justify-content:space-between;gap:30px;align-items:flex-end;padding-bottom:27px;border-bottom:1px solid var(--line)}h1{max-width:900px;margin:0;font:700 clamp(34px,6vw,76px)/.98 Georgia,serif;letter-spacing:-.045em}.kicker{margin-bottom:10px;color:var(--accent);font:700 11px/1.4 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase}.hero p{max-width:720px;margin:18px 0 0;color:var(--muted);font-size:17px}.privacy{flex:0 0 auto;padding:11px 13px;border:1px solid rgba(121,201,158,.35);border-radius:999px;color:var(--good);background:rgba(121,201,158,.08);font:700 11px/1 ui-monospace,monospace;letter-spacing:.04em}
.view{display:none}.view.active{display:block}.section-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin:42px 0 20px}.section-head h2{margin:0;font:700 30px/1.1 Georgia,serif}.section-head p{max-width:650px;margin:7px 0 0;color:var(--muted)}.grid{display:grid;gap:14px}.stats{grid-template-columns:repeat(auto-fit,minmax(175px,1fr))}.card{border:1px solid var(--line);border-radius:13px;background:linear-gradient(145deg,rgba(21,27,36,.9),rgba(13,17,23,.93));box-shadow:var(--shadow)}.stat{padding:18px}.stat b{display:block;font:700 28px/1 ui-monospace,monospace;color:var(--accent)}.stat span{display:block;margin-top:9px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.books{grid-template-columns:repeat(auto-fit,minmax(255px,1fr))}.book{padding:20px}.book h3{margin:0 0 7px;font:700 19px/1.2 Georgia,serif}.meta{color:var(--muted);font:12px/1.55 ui-monospace,monospace}.digest{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8c99a8}.bar{height:5px;margin-top:15px;border-radius:9px;background:#222b36;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}.toolbar input,.toolbar select{min-height:42px;padding:9px 12px;border:1px solid var(--line);border-radius:9px;color:var(--text);background:var(--panel)}.toolbar input{flex:1;min-width:230px}.toolbar select{min-width:170px}.count{align-self:center;color:var(--muted);font:12px ui-monospace,monospace}.list{display:grid;gap:10px}.row{padding:16px 18px}.row-head{display:flex;justify-content:space-between;gap:16px}.row h3{margin:0;font-size:15px}.row p{margin:9px 0 0;color:#c7d1dc}.badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.badge{display:inline-flex;padding:5px 7px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font:10px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.05em}.badge.good{color:var(--good);border-color:rgba(121,201,158,.35)}.badge.warn{color:var(--warn);border-color:rgba(224,184,101,.35)}.badge.hold{color:var(--hold);border-color:rgba(215,127,127,.35)}.locator{margin-top:11px;padding:10px 12px;border-left:2px solid var(--accent2);background:rgba(136,183,201,.05);color:var(--muted);font:11px/1.55 ui-monospace,monospace;overflow-wrap:anywhere}.locator b{color:var(--text)}details{margin-top:10px}summary{color:var(--accent2);cursor:pointer}.subrows{display:grid;gap:8px;margin-top:9px}.subrow{padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:rgba(0,0,0,.12)}
.chapter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.chapter{padding:14px}.chapter h3{margin:0;font:700 15px Georgia,serif}.chapter .n{float:right;color:var(--accent);font:11px ui-monospace,monospace}.entity-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.entity{padding:16px}.entity h3{margin:0}.entity strong{color:var(--accent);font-family:ui-monospace,monospace}.opening-group{margin:30px 0}.opening-group>h3{padding-bottom:8px;border-bottom:1px solid var(--line);font:700 22px Georgia,serif}.opening{padding:18px}.opening .summary{font-size:16px}.queue-row .label{font-weight:700}.queue-row .id{color:var(--muted);font:11px ui-monospace,monospace}.pagination{display:flex;justify-content:center;gap:10px;margin-top:20px}.pagination button{padding:9px 13px;border:1px solid var(--line);border-radius:8px;color:var(--text);background:var(--panel);cursor:pointer}.pagination button:disabled{opacity:.35}.custody{padding:22px}.custody pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#c7d1dc}.empty{padding:30px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);text-align:center}.footer{margin-top:60px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
@media(max-width:850px){.shell{display:block}.rail{position:relative;height:auto;border-right:0;border-bottom:1px solid var(--line)}.rail nav{grid-template-columns:repeat(3,1fr)}.nav{justify-content:center;font-size:12px}.hero{display:block}.privacy{display:inline-block;margin-top:18px}main{padding-top:26px}}
</style>
</head>
<body>
<div class="shell">
<aside class="rail">
  <div class="brand">AXM Canon<small>ASOIAF source atlas · corpus v1</small></div>
  <nav id="nav"></nav>
  <div class="rail-note"><strong>No source text in this file.</strong><br>All records are digests, locators, paraphrases, and review queues. Search excerpts remain in the private holder estate.</div>
</aside>
<main>
  <header class="hero">
    <div><div class="kicker">Exact editions · explicit standing · reversible review</div><h1>A Song of Ice and Fire, with the receipts left attached.</h1><p>The five main novels and three Dunk and Egg novellas are admitted under exact file custody. This reader exposes their structure, candidate evidence routes, entity attestations, and the first opening-gate draft without publishing the books.</p></div>
    <div class="privacy">SOURCE TEXT ABSENT</div>
  </header>
  <section id="view-overview" class="view active"></section>
  <section id="view-opening" class="view"></section>
  <section id="view-chapters" class="view"></section>
  <section id="view-entities" class="view"></section>
  <section id="view-queue" class="view"></section>
  <section id="view-custody" class="view"></section>
  <div class="footer">Dataset fingerprint: <span id="dataset-fingerprint"></span>. Canon promotions: 0. Every source-attested record remains reviewable.</div>
</main>
</div>
<script>const DATA=__DATA__;const DATA_FINGERPRINT="__FINGERPRINT__";</script>
<script>
const $=(s,r=document)=>r.querySelector(s);const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=n=>new Intl.NumberFormat().format(n||0);const short=v=>String(v||'').replace(/^sha256:/,'').slice(0,12)+'…';
const sourceTitle=id=>({"local-agot":"AGOT","local-acok":"ACOK","local-asos":"ASOS","local-affc":"AFFC","local-adwd":"ADWD","local-dunk-egg":"D&E"}[id]||id);
const navItems=[['overview','Overview'],['opening','Opening Gate'],['chapters','Chapters'],['entities','Entities'],['queue','Evidence Queue'],['custody','Custody']];
$('#nav').innerHTML=navItems.map(([id,label],i)=>`<button class="nav ${i?'':'active'}" data-view="${id}">${label}</button>`).join('');
function showView(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${id}`));$$('.nav').forEach(v=>v.classList.toggle('active',v.dataset.view===id));history.replaceState(null,'',`#${id}`);scrollTo({top:0,behavior:'smooth'});}$$('.nav').forEach(b=>b.onclick=()=>showView(b.dataset.view));
function sectionHead(title,desc,aside=''){return `<div class="section-head"><div><h2>${title}</h2><p>${desc}</p></div>${aside}</div>`}
function badge(text,kind=''){return `<span class="badge ${kind}">${escapeHtml(text)}</span>`}
function locator(m){if(!m)return'';return `<div class="locator"><b>${sourceTitle(m.sourceId)} · ${escapeHtml(m.unitLabel||'unit')} · ¶${m.paragraphIndex}</b><br>${escapeHtml(m.segmentId||'')}<br>${escapeHtml(m.textDigest||'')}<br>${escapeHtml(m.locator?.unit||'')}</div>`}
function renderOverview(){const m=DATA.manifest,c=DATA.census,s=DATA.candidateSummary,e=DATA.entitySummary;const max=Math.max(...m.editions.map(x=>x.wordCount));$('#view-overview').innerHTML=sectionHead('Corpus at a glance','The first production corpus is structurally complete and publicly inspectable without source payload.')+`<div class="grid stats">
${[[m.editionCount,'exact editions'],[m.narrativeUnitCount,'narrative units'],[m.paragraphLocatorCount,'paragraph locators'],[m.wordCount,'private corpus words'],[s.candidateCount,'candidate records'],[e.sourceAttestedCount,'source-attested entities']].map(([n,l])=>`<div class="card stat"><b>${fmt(n)}</b><span>${l}</span></div>`).join('')}</div>`+sectionHead('Editions','Each holder copy has a stable digest and independent edition identity.')+`<div class="grid books">${m.editions.map(x=>`<article class="card book"><h3>${escapeHtml(x.title)}</h3><div class="meta">${fmt(x.wordCount)} words · ${fmt(x.segmentCount)} paragraphs · ${fmt(x.unitCount)} units</div><div class="digest">${escapeHtml(x.sourceDigest)}</div><div class="bar"><i style="width:${Math.max(5,x.wordCount/max*100)}%"></i></div></article>`).join('')}</div>`+sectionHead('Review posture','Retrieval coverage is broad, but standing remains explicit.')+`<div class="card custody"><pre>${escapeHtml(JSON.stringify({candidateStatus:s.statusCounts,entityCandidates:e.entityCandidateCount,sourceAttestedEntities:e.sourceAttestedCount,promotionCount:0,humanReviewRequired:true},null,2))}</pre></div>`}
function renderOpening(){const groups=new Map();for(const r of DATA.opening.records){const key=`${r.unitOrder}:${r.unitLabel}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}$('#view-opening').innerHTML=sectionHead('Opening Gate','Thirty-one source-attested paraphrases bind the AGOT prologue and opening sequences to exact private paragraph custody. They are drafts, not silent canon promotions.')+[...groups.entries()].map(([key,rows])=>`<div class="opening-group"><h3>${escapeHtml(key.split(':').slice(1).join(':'))}</h3><div class="list">${rows.map(r=>`<article class="card opening"><div class="row-head"><div>${badge(r.claimType,'good')} ${badge(r.epistemicClass)}</div><span class="meta">¶${r.paragraphIndex}</span></div><p class="summary">${escapeHtml(r.summary)}</p><div class="badges">${r.candidateLinks.map(x=>badge(x)).join('')}</div>${locator(r)}</article>`).join('')}</div></div>`).join('')}
const chapterState={q:'',book:'all'};function renderChapters(){const books=[...new Set(DATA.chapters.map(x=>x.bookTitle))];const rows=DATA.chapters.filter(x=>(chapterState.book==='all'||x.bookTitle===chapterState.book)&&(`${x.displayLabel} ${x.bookTitle} ${x.sourceId}`.toLowerCase().includes(chapterState.q)));$('#view-chapters').innerHTML=sectionHead('Narrative units','Chapter and novella structure from exact edition spines. No prose is embedded.')+`<div class="toolbar"><input id="chapter-q" placeholder="Search chapters or books" value="${escapeHtml(chapterState.q)}"><select id="chapter-book"><option value="all">All books</option>${books.map(b=>`<option ${chapterState.book===b?'selected':''}>${escapeHtml(b)}</option>`).join('')}</select><span class="count">${fmt(rows.length)} shown</span></div><div class="chapter-grid">${rows.map(x=>`<article class="card chapter"><span class="n">${x.globalNarrativeOrder}</span><h3>${escapeHtml(x.displayLabel)}</h3><div class="meta">${escapeHtml(x.bookTitle)} · ${fmt(x.wordCount)} words · ${fmt(x.paragraphCount)} ¶</div><div class="digest">${escapeHtml(x.textDigest)}</div></article>`).join('')}</div>`;$('#chapter-q').oninput=e=>{chapterState.q=e.target.value.toLowerCase();renderChapters()};$('#chapter-book').onchange=e=>{chapterState.book=e.target.value;renderChapters()}}
const entityState={q:'',status:'all'};function renderEntities(){const rows=DATA.entities.filter(x=>(entityState.status==='all'||x.status===entityState.status)&&(`${x.label} ${x.entityId} ${x.entityKind}`.toLowerCase().includes(entityState.q))).sort((a,b)=>b.occurrenceCount-a.occurrenceCount||a.label.localeCompare(b.label));$('#view-entities').innerHTML=sectionHead('Entity concordance','Model-recall entities are checked against exact private text. Attestation proves occurrence, not interpretation or identity resolution.')+`<div class="toolbar"><input id="entity-q" placeholder="Search 254 entity candidates" value="${escapeHtml(entityState.q)}"><select id="entity-status"><option value="all">All standing</option>${['source-attested','not-found-in-ingested-sources','awaiting-uningested-source'].map(x=>`<option value="${x}" ${entityState.status===x?'selected':''}>${x}</option>`).join('')}</select><span class="count">${fmt(rows.length)} shown</span></div><div class="entity-grid">${rows.map(x=>`<article class="card entity"><div class="row-head"><h3>${escapeHtml(x.label)}</h3><strong>${fmt(x.occurrenceCount)}</strong></div><div class="badges">${badge(x.entityKind)}${badge(x.status,x.status==='source-attested'?'good':'hold')}</div>${x.sourceAttestations?.length?`<details><summary>${x.sourceAttestations.length} source attestations</summary><div class="subrows">${x.sourceAttestations.map(a=>`<div class="subrow"><b>${sourceTitle(a.sourceId)}</b> · ${fmt(a.occurrenceCount)} occurrences${locator(a)}</div>`).join('')}</div></details>`:''}</article>`).join('')}</div>`;$('#entity-q').oninput=e=>{entityState.q=e.target.value.toLowerCase();renderEntities()};$('#entity-status').onchange=e=>{entityState.status=e.target.value;renderEntities()}}
const queueState={q:'',status:'all',domain:'all',page:0,pageSize:50};function renderQueue(){const domains=[...new Set(DATA.candidates.map(x=>x.domain))].sort();const filtered=DATA.candidates.filter(x=>(queueState.status==='all'||x.status===queueState.status)&&(queueState.domain==='all'||x.domain===queueState.domain)&&(`${x.label} ${x.candidateId} ${x.packetId} ${x.kind}`.toLowerCase().includes(queueState.q)));const pages=Math.max(1,Math.ceil(filtered.length/queueState.pageSize));queueState.page=Math.min(queueState.page,pages-1);const rows=filtered.slice(queueState.page*queueState.pageSize,(queueState.page+1)*queueState.pageSize);$('#view-queue').innerHTML=sectionHead('Evidence queue','All 805 recall and conversation candidates are routed against the exact private corpus. Hits are leads, not confirmations.')+`<div class="toolbar"><input id="queue-q" placeholder="Search candidates" value="${escapeHtml(queueState.q)}"><select id="queue-status"><option value="all">All statuses</option>${Object.keys(DATA.candidateSummary.statusCounts).map(x=>`<option value="${x}" ${queueState.status===x?'selected':''}>${x}</option>`).join('')}</select><select id="queue-domain"><option value="all">All domains</option>${domains.map(x=>`<option value="${x}" ${queueState.domain===x?'selected':''}>${x}</option>`).join('')}</select><span class="count">${fmt(filtered.length)} candidates</span></div><div class="list">${rows.map(x=>`<article class="card row queue-row"><div class="row-head"><div><div class="label">${escapeHtml(x.label)}</div><div class="id">${escapeHtml(x.candidateId)}</div></div>${badge(x.status,x.status==='evidence-leads-found'?'good':x.status==='awaiting-uningested-source'?'warn':'hold')}</div><div class="badges">${badge(x.domain)}${badge(x.kind)}${badge(`${x.matchCount} leads`)}</div>${x.matches?.length?`<details><summary>Inspect top locators</summary><div class="subrows">${x.matches.slice(0,5).map(locator).join('')}</div></details>`:''}</article>`).join('')}</div><div class="pagination"><button id="prev" ${queueState.page===0?'disabled':''}>Previous</button><span class="count">Page ${queueState.page+1} / ${pages}</span><button id="next" ${queueState.page>=pages-1?'disabled':''}>Next</button></div>`;$('#queue-q').oninput=e=>{queueState.q=e.target.value.toLowerCase();queueState.page=0;renderQueue()};$('#queue-status').onchange=e=>{queueState.status=e.target.value;queueState.page=0;renderQueue()};$('#queue-domain').onchange=e=>{queueState.domain=e.target.value;queueState.page=0;renderQueue()};$('#prev').onclick=()=>{queueState.page--;renderQueue();scrollTo(0,260)};$('#next').onclick=()=>{queueState.page++;renderQueue();scrollTo(0,260)}}
function renderCustody(){const m=DATA.manifest;$('#view-custody').innerHTML=sectionHead('Custody and standing','The source boundary is part of the product, not a footnote.')+`<div class="card custody"><h3>Public object</h3><pre>${escapeHtml(JSON.stringify({format:m.format,generatedAt:m.generatedAt,sourcePayloadPresent:m.sourcePayloadPresent,sourceTextPresent:m.sourceTextPresent,sourceFilenameRetained:m.sourceFilenameRetained,sourcePathRetained:m.sourcePathRetained,manifestFingerprint:m.manifestFingerprint,openingGateFingerprint:DATA.opening.gateFingerprint,datasetFingerprint:DATA_FINGERPRINT},null,2))}</pre></div>`+`<div class="card custody" style="margin-top:14px"><h3>Standing law</h3><p>Edition digests establish custody of the supplied files. Paragraph digests and locators establish where a lead came from. Entity occurrence establishes textual attestation. None of those acts alone establishes the truth of an inference, resolves a contradiction, or grants canon standing. Promotion remains a named human reconciliation transaction.</p></div>`+`<div class="grid books" style="margin-top:14px">${m.editions.map(x=>`<article class="card book"><h3>${escapeHtml(x.title)}</h3><div class="meta">${escapeHtml(x.editionId)}<br>${escapeHtml(x.editionKey)}</div><div class="locator">source ${escapeHtml(x.sourceDigest)}<br>manifest ${escapeHtml(x.manifestFingerprint)}<br>private text retained: ${x.privateTextRetained}<br>repository source text: ${x.repositoryContainsSourceText}</div></article>`).join('')}</div>`}
renderOverview();renderOpening();renderChapters();renderEntities();renderQueue();renderCustody();$('#dataset-fingerprint').textContent=DATA_FINGERPRINT;showView(location.hash.slice(1)||'overview');
</script>
</body>
</html>'''.replace("__DATA__", data_json).replace("__FINGERPRINT__", data_fingerprint)


def build(public_root: Path, output: Path, receipt_path: Path, generated_at: str) -> dict[str, Any]:
    data = load_data(public_root)
    data_fingerprint = sha256_bytes(canonical(data))
    embedded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = html_template(embedded, data_fingerprint)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8", newline="\n")
    receipt = {
        "format": "axm-asoiaf-reader-atlas-receipt/1",
        "status": "PASS_PUBLIC_SAFE_READER_ATLAS",
        "generatedAt": generated_at,
        "output": output.name,
        "outputBytes": output.stat().st_size,
        "outputSha256": sha256_bytes(output.read_bytes()),
        "dataFingerprint": data_fingerprint,
        "counts": {
            "editions": data["manifest"]["editionCount"],
            "chapters": len(data["chapters"]),
            "nonNarrativeUnits": len(data["nonNarrative"]),
            "entities": len(data["entities"]),
            "candidates": len(data["candidates"]),
            "openingRecords": data["opening"]["recordCount"],
        },
        "sourcePayloadPresent": False,
        "sourceTextPresent": False,
        "promotionCount": 0,
        "graphEffect": "none",
        "canonEffect": "none",
    }
    receipt["receiptFingerprint"] = sha256_bytes(canonical(receipt))
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-root", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--at", required=True)
    args = parser.parse_args(argv)
    receipt = build(Path(args.public_root), Path(args.out), Path(args.receipt), args.at)
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
