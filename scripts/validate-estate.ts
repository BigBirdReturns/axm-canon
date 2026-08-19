import fs from "node:fs";
import path from "node:path";
import {
  ASOIAF_CONVERSATION_SYNTHESIS_FINDINGS,
  ASOIAF_CONVERSATION_SYNTHESIS_MANIFEST,
  ASOIAF_MODEL_RECALL_FINDINGS,
  ASOIAF_MODEL_RECALL_MANIFEST,
  ASOIAF_RECALL_ESTATE_FINDINGS,
  ASOIAF_RECALL_ESTATE_MANIFEST,
} from "../asoiaf/src/recall/index.js";
import {
  ASOIAF_EXTERNAL_ATLAS_FINDINGS,
  ASOIAF_EXTERNAL_ATLAS_LANES,
  ASOIAF_EXTERNAL_ATLAS_MANIFEST,
  ASOIAF_EXTERNAL_ATLAS_SOURCES,
  ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS,
} from "../asoiaf/src/external/index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errors(findings: readonly { severity: string }[]) {
  return findings.filter((finding) => finding.severity === "error");
}

assert(ASOIAF_MODEL_RECALL_MANIFEST.packetCount === 10, "model packet count drift");
assert(ASOIAF_MODEL_RECALL_MANIFEST.candidateCount === 726, "model candidate count drift");
assert(ASOIAF_CONVERSATION_SYNTHESIS_MANIFEST.packetCount === 5, "conversation packet count drift");
assert(ASOIAF_CONVERSATION_SYNTHESIS_MANIFEST.candidateCount === 79, "conversation candidate count drift");
assert(ASOIAF_RECALL_ESTATE_MANIFEST.packetCount === 15, "combined packet count drift");
assert(ASOIAF_RECALL_ESTATE_MANIFEST.candidateCount === 805, "combined candidate count drift");
assert(errors(ASOIAF_MODEL_RECALL_FINDINGS).length === 0, "model recall contains errors");
assert(errors(ASOIAF_CONVERSATION_SYNTHESIS_FINDINGS).length === 0, "conversation synthesis contains errors");
assert(errors(ASOIAF_RECALL_ESTATE_FINDINGS).length === 0, "combined recall estate contains errors");
assert(ASOIAF_EXTERNAL_ATLAS_SOURCES.length === 219, "source count drift");
assert(ASOIAF_EXTERNAL_ATLAS_LANES.length === 45, "lane count drift");
assert(ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS.length === 219, "harvest work-order count drift");
assert(ASOIAF_EXTERNAL_ATLAS_MANIFEST.sourceCount === 219, "atlas manifest source count drift");
assert(ASOIAF_EXTERNAL_ATLAS_MANIFEST.laneCount === 45, "atlas manifest lane count drift");
assert(errors(ASOIAF_EXTERNAL_ATLAS_FINDINGS).length === 0, "external atlas contains errors");

const admittedCorpusRoutes = ["local-agot", "local-acok", "local-asos", "local-affc", "local-adwd", "local-dunk-egg"] as const;
for (const sourceId of admittedCorpusRoutes) {
  assert(ASOIAF_EXTERNAL_ATLAS_SOURCES.some((source) => source.id === sourceId), `missing source ${sourceId}`);
  assert(ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS.some((order) => order.sourceId === sourceId), `missing work order ${sourceId}`);
}


const publicCorpusManifestPath = path.resolve("asoiaf/public/corpus-v1/PUBLIC_CORPUS_MANIFEST.json");
const publicCorpusCensusPath = path.resolve("asoiaf/public/corpus-v1/CORPUS_CENSUS.json");
assert(fs.existsSync(publicCorpusManifestPath), "public corpus manifest missing");
assert(fs.existsSync(publicCorpusCensusPath), "public corpus census missing");
const publicCorpusManifest = JSON.parse(fs.readFileSync(publicCorpusManifestPath, "utf8")) as {
  editionCount: number;
  narrativeUnitCount: number;
  nonNarrativeUnitCount: number;
  paragraphLocatorCount: number;
  wordCount: number;
  sourcePayloadPresent: boolean;
  sourceTextPresent: boolean;
  sourcePathRetained: boolean;
  sourceFilenameRetained: boolean;
};
const publicCorpusCensus = JSON.parse(fs.readFileSync(publicCorpusCensusPath, "utf8")) as {
  totals: {
    editions: number;
    narrativeUnits: number;
    frontBackUnits: number;
    paragraphs: number;
    words: number;
  };
  sourceTextPresent: boolean;
};
assert(publicCorpusManifest.editionCount === 6, "public corpus edition count drift");
assert(publicCorpusManifest.narrativeUnitCount === 347, "public corpus narrative-unit count drift");
assert(publicCorpusManifest.nonNarrativeUnitCount === 111, "public corpus non-narrative count drift");
assert(publicCorpusManifest.paragraphLocatorCount === 45_828, "public corpus paragraph count drift");
assert(publicCorpusManifest.wordCount === 1_882_845, "public corpus word count drift");
assert(publicCorpusCensus.totals.editions === publicCorpusManifest.editionCount, "corpus census edition mismatch");
assert(publicCorpusCensus.totals.narrativeUnits === publicCorpusManifest.narrativeUnitCount, "corpus census narrative mismatch");
assert(publicCorpusCensus.totals.frontBackUnits === publicCorpusManifest.nonNarrativeUnitCount, "corpus census non-narrative mismatch");
assert(publicCorpusCensus.totals.paragraphs === publicCorpusManifest.paragraphLocatorCount, "corpus census paragraph mismatch");
assert(publicCorpusCensus.totals.words === publicCorpusManifest.wordCount, "corpus census word mismatch");
assert(!publicCorpusManifest.sourcePayloadPresent, "public corpus contains source payload");
assert(!publicCorpusManifest.sourceTextPresent, "public corpus contains source text");
assert(!publicCorpusManifest.sourcePathRetained, "public corpus retains source path");
assert(!publicCorpusManifest.sourceFilenameRetained, "public corpus retains source filename");
assert(!publicCorpusCensus.sourceTextPresent, "public census claims source text");

process.stdout.write(`${JSON.stringify({
  status: "pass",
  recall: {
    modelPackets: ASOIAF_MODEL_RECALL_MANIFEST.packetCount,
    modelCandidates: ASOIAF_MODEL_RECALL_MANIFEST.candidateCount,
    conversationPackets: ASOIAF_CONVERSATION_SYNTHESIS_MANIFEST.packetCount,
    conversationCandidates: ASOIAF_CONVERSATION_SYNTHESIS_MANIFEST.candidateCount,
    combinedPackets: ASOIAF_RECALL_ESTATE_MANIFEST.packetCount,
    combinedCandidates: ASOIAF_RECALL_ESTATE_MANIFEST.candidateCount,
  },
  atlas: {
    sources: ASOIAF_EXTERNAL_ATLAS_SOURCES.length,
    lanes: ASOIAF_EXTERNAL_ATLAS_LANES.length,
    workOrders: ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS.length,
    findings: ASOIAF_EXTERNAL_ATLAS_FINDINGS.length,
    errors: errors(ASOIAF_EXTERNAL_ATLAS_FINDINGS).length,
  },
  admittedCorpusRoutes,
  corpus: {
    editions: publicCorpusManifest.editionCount,
    narrativeUnits: publicCorpusManifest.narrativeUnitCount,
    nonNarrativeUnits: publicCorpusManifest.nonNarrativeUnitCount,
    paragraphLocators: publicCorpusManifest.paragraphLocatorCount,
    words: publicCorpusManifest.wordCount,
    sourcePayloadPresent: publicCorpusManifest.sourcePayloadPresent,
    sourceTextPresent: publicCorpusManifest.sourceTextPresent,
  },
}, null, 2)}\n`);
