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

const primaryNovelRoutes = ["local-agot", "local-acok", "local-asos", "local-affc", "local-adwd"] as const;
for (const sourceId of primaryNovelRoutes) {
  assert(ASOIAF_EXTERNAL_ATLAS_SOURCES.some((source) => source.id === sourceId), `missing source ${sourceId}`);
  assert(ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS.some((order) => order.sourceId === sourceId), `missing work order ${sourceId}`);
}

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
  primaryNovelRoutes,
}, null, 2)}\n`);
