import { compareCodepoints } from "../../../src/runtime/determinism.js";
import { narrativeFingerprint } from "../../../src/runtime/fingerprint.js";
import {
  buildCanonReconciliationWorkOrder,
  type CanonReconciliationWorkOrder,
} from "../../../src/canon/reconcile/index.js";
import {
  ASOIAF_MODEL_RECALL_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
} from "../recall/index.js";

export const ASOIAF_MAIN_NOVEL_SOURCE_HINT_IDS = [
  "AGOT",
  "ACOK",
  "ASOS",
  "AFFC",
  "ADWD",
] as const;

function buildMainNovelWorkOrder(
  sourceHintId: (typeof ASOIAF_MAIN_NOVEL_SOURCE_HINT_IDS)[number],
): CanonReconciliationWorkOrder {
  return buildCanonReconciliationWorkOrder(
    ASOIAF_MODEL_RECALL_PACKETS,
    ASOIAF_RECALL_SOURCE_HINTS,
    {
      id: `asoiaf-${sourceHintId.toLowerCase()}-reconciliation-work-order-v1`,
      universeId: "asoiaf",
      sourceHintIds: [sourceHintId],
      contextDepth: 1,
    },
  );
}

export const ASOIAF_MAIN_NOVEL_RECONCILIATION_WORK_ORDERS =
  Object.fromEntries(
    ASOIAF_MAIN_NOVEL_SOURCE_HINT_IDS.map((sourceHintId) => [
      sourceHintId,
      buildMainNovelWorkOrder(sourceHintId),
    ]),
  ) as Record<
    (typeof ASOIAF_MAIN_NOVEL_SOURCE_HINT_IDS)[number],
    CanonReconciliationWorkOrder
  >;

export const ASOIAF_AGOT_RECONCILIATION_WORK_ORDER =
  ASOIAF_MAIN_NOVEL_RECONCILIATION_WORK_ORDERS.AGOT;

const floorCore = {
  format: "asoiaf-reconciliation-floor/1",
  universeId: "asoiaf",
  workOrders: Object.values(ASOIAF_MAIN_NOVEL_RECONCILIATION_WORK_ORDERS)
    .map((workOrder) => ({
      id: workOrder.id,
      sourceHintIds: workOrder.sourceHintIds,
      directCandidateCount: workOrder.directCandidateIds.length,
      contextCandidateCount: workOrder.contextCandidateIds.length,
      candidateCount: workOrder.candidateIds.length,
      clusterCount: workOrder.clusters.length,
      fingerprint: workOrder.workOrderFingerprint,
    }))
    .sort((left, right) => compareCodepoints(left.id, right.id)),
};

export const ASOIAF_RECONCILIATION_FLOOR_MANIFEST = {
  ...floorCore,
  fingerprint: narrativeFingerprint(floorCore),
};

export function getAsoiafMainNovelReconciliationWorkOrder(
  sourceHintId: (typeof ASOIAF_MAIN_NOVEL_SOURCE_HINT_IDS)[number],
): CanonReconciliationWorkOrder {
  return ASOIAF_MAIN_NOVEL_RECONCILIATION_WORK_ORDERS[sourceHintId];
}
