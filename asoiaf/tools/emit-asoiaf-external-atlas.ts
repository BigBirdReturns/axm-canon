import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ASOIAF_EXTERNAL_ATLAS_FINDINGS,
  ASOIAF_EXTERNAL_ATLAS_MANIFEST,
  ASOIAF_EXTERNAL_ATLAS_SOURCES,
  ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS,
  ASOIAF_EXTERNAL_PROVENANCE_LINEAGE,
} from "../src/external/index.js";

const outputPath = resolve(
  process.argv[2] ?? "asoiaf-external-source-atlas-receipt.json",
);
mkdirSync(dirname(outputPath), { recursive: true });

const receipt = {
  format: "axm-asoiaf-external-atlas-qualification-receipt/1",
  manifest: ASOIAF_EXTERNAL_ATLAS_MANIFEST,
  sourceSummary: ASOIAF_EXTERNAL_ATLAS_SOURCES.map((source) => ({
    id: source.id,
    sourcePlane: source.sourcePlane,
    authorityClass: source.authorityClass,
    rightsMode: source.rightsMode,
    harvestMode: source.harvestPolicy.mode,
    verificationStatus: source.verificationStatus,
  })),
  workOrderSummary: ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS.map((workOrder) => ({
    id: workOrder.id,
    sourceId: workOrder.sourceId,
    candidateCount: workOrder.candidateIds.length,
    laneCount: workOrder.laneIds.length,
    fingerprint: workOrder.workOrderFingerprint,
  })),
  provenanceLineage: ASOIAF_EXTERNAL_PROVENANCE_LINEAGE,
  findings: ASOIAF_EXTERNAL_ATLAS_FINDINGS,
};

writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(outputPath);
