import { compareCodepoints } from "../../../src/runtime/determinism.js";
import { ASOIAF_RECALL_SOURCE_HINTS } from "../recall/index.js";
import { ASOIAF_EXTERNAL_PROVENANCE_LINEAGE } from "./lineage.js";
import type {
  AsoiafExternalAtlasManifest,
  AsoiafExternalFinding,
  AsoiafExternalHarvestWorkOrder,
  AsoiafExternalQueryLane,
  AsoiafExternalSource,
} from "./types.js";

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort(compareCodepoints);
}

export function validateAsoiafExternalAtlas(input: {
  sources: readonly AsoiafExternalSource[];
  lanes: readonly AsoiafExternalQueryLane[];
  workOrders: readonly AsoiafExternalHarvestWorkOrder[];
  manifest: AsoiafExternalAtlasManifest;
}): AsoiafExternalFinding[] {
  const findings: AsoiafExternalFinding[] = [];
  const sourceIds = new Set(input.sources.map((source) => source.id));
  const laneIds = new Set(input.lanes.map((lane) => lane.id));
  const hintIds = new Set(ASOIAF_RECALL_SOURCE_HINTS.map((hint) => hint.id));
  const add = (
    code: string,
    severity: AsoiafExternalFinding["severity"],
    subjectId: string,
    detail: string,
  ) => findings.push({ code, severity, subjectId, detail });

  for (const id of duplicates(input.sources.map((source) => source.id))) {
    add("duplicate-source-id", "error", id, "External source IDs must be unique.");
  }
  for (const uri of duplicates(input.sources.map((source) => source.canonicalUri))) {
    add(
      "shared-canonical-route",
      "warning",
      uri,
      "Several bounded source identities share a landing route and require a source-specific durable record identifier.",
    );
  }
  for (const id of duplicates(input.lanes.map((lane) => lane.id))) {
    add("duplicate-lane-id", "error", id, "Question-routing lane IDs must be unique.");
  }
  for (const id of duplicates(input.workOrders.map((workOrder) => workOrder.id))) {
    add("duplicate-work-order-id", "error", id, "Harvest work-order IDs must be unique.");
  }

  for (const source of input.sources) {
    if (!source.accessMethods.length) {
      add("source-without-access-method", "error", source.id, "Every source requires a bounded access method.");
    }
    if (!source.roles.length) {
      add("source-without-routing-role", "error", source.id, "Every source requires at least one routing role.");
    }
    for (const hintId of source.sourceHintRoutes) {
      if (!hintIds.has(hintId)) {
        add("unknown-source-hint-route", "error", source.id, `Unknown recall source hint ${hintId}.`);
      }
    }

    const local = source.sourcePlane === "local-primary";
    if (local && source.harvestPolicy.mode !== "local-private-only") {
      add("local-source-public-harvest", "error", source.id, "User-held bytes must remain local-private-only.");
    }
    if (local && source.rightsMode !== "user-controlled-private") {
      add("local-source-rights-mismatch", "error", source.id, "User-held editions require private holder custody.");
    }
    if (
      source.harvestPolicy.retainRawBody
      && !["cc0", "cc-by", "cc-by-sa", "public-domain"].includes(source.rightsMode)
    ) {
      add(
        "raw-body-without-compatible-rights",
        "error",
        source.id,
        "Raw public bodies require an explicit compatible license or public-domain determination.",
      );
    }
    if (
      source.harvestPolicy.mode === "route-only-no-mirror"
      && (source.harvestPolicy.retainRawBody || source.harvestPolicy.excerptMaxChars > 0)
    ) {
      add("route-only-retention", "error", source.id, "Route-only sources cannot retain bodies or excerpts.");
    }
    if (!local && source.harvestPolicy.hostDelayMs < 1_500) {
      add("host-delay-below-undercast-floor", "error", source.id, "Network collection inherits the 1,500 ms UnderCast floor.");
    }
    if (!source.harvestPolicy.robotsRespect) {
      add("robots-policy-disabled", "error", source.id, "Every network work order must respect robots policy.");
    }
  }

  for (const lane of input.lanes) {
    for (const sourceId of lane.preferredSourceIds) {
      if (!sourceIds.has(sourceId)) {
        add("lane-preferred-source-missing", "error", lane.id, `Preferred source ${sourceId} does not exist.`);
      }
    }
    if (
      !input.sources.some(
        (source) => source.roles.includes(lane.id) || lane.preferredSourceIds.includes(source.id),
      )
    ) {
      add("lane-without-source", "error", lane.id, "Every lane requires at least one eligible source.");
    }
    if (
      lane.id === "exact-quotation"
      && lane.responsePolicy.verbatimHandling !== "exact-local-locator"
    ) {
      add("quotation-policy-can-mirror", "error", lane.id, "Exact quotation must resolve through local locators.");
    }

    const allAuthorities = [
      ...lane.preferredAuthorityClasses,
      ...lane.supportingAuthorityClasses,
    ];
    const hasCommunity = allAuthorities.some((authority) =>
      ["community-reference", "community-analysis", "discussion-provenance"].includes(authority),
    );
    if (
      lane.preferredAuthorityClasses.includes("discussion-provenance")
      && lane.responsePolicy.communityStanding !== "provenance-only"
    ) {
      add("discussion-standing-too-high", "error", lane.id, "Discussion may establish provenance, not fictional events.");
    } else if (
      hasCommunity
      && lane.responsePolicy.communityStanding === "not-applicable"
    ) {
      add("community-standing-missing", "error", lane.id, "Community use must disclose supporting or provenance-only standing.");
    }
    if (
      allAuthorities.includes("scholarly-analogue")
      && lane.responsePolicy.analogueStanding !== "constraint-only"
    ) {
      add("analogue-standing-too-high", "error", lane.id, "Scholarly analogues constrain hypotheses and do not create canon.");
    }
  }

  const workOrdersBySource = new Map(
    input.workOrders.map((workOrder) => [workOrder.sourceId, workOrder]),
  );
  for (const source of input.sources) {
    const workOrder = workOrdersBySource.get(source.id);
    if (!workOrder) {
      add("source-without-work-order", "error", source.id, "Every registered source requires one deterministic work order.");
      continue;
    }
    for (const laneId of workOrder.laneIds) {
      if (!laneIds.has(laneId)) {
        add("work-order-unknown-lane", "error", workOrder.id, `Unknown lane ${laneId}.`);
      }
    }
    for (const required of [
      "claim-level-receipts-attached",
      "human-review-recorded",
      "reconciliation-transaction-passes",
    ]) {
      if (!workOrder.promotionForbiddenUntil.includes(required)) {
        add("promotion-firewall-incomplete", "error", workOrder.id, `Missing promotion condition ${required}.`);
      }
    }
  }
  for (const workOrder of input.workOrders) {
    if (!sourceIds.has(workOrder.sourceId)) {
      add("orphan-work-order", "error", workOrder.id, `Unknown source ${workOrder.sourceId}.`);
    }
  }

  if (input.manifest.sourceCount !== input.sources.length) {
    add("manifest-source-count-drift", "error", input.manifest.atlasFingerprint, "Manifest source count drifted.");
  }
  if (input.manifest.laneCount !== input.lanes.length) {
    add("manifest-lane-count-drift", "error", input.manifest.atlasFingerprint, "Manifest lane count drifted.");
  }
  if (input.manifest.workOrderCount !== input.workOrders.length) {
    add("manifest-work-order-count-drift", "error", input.manifest.atlasFingerprint, "Manifest work-order count drifted.");
  }
  if (input.manifest.routedCandidateCount !== input.manifest.heldCandidateCount) {
    add(
      "held-candidate-routing-gap",
      "error",
      input.manifest.atlasFingerprint,
      `${input.manifest.heldCandidateCount - input.manifest.routedCandidateCount} held candidates lack an external-source route.`,
    );
  }
  if (input.manifest.authorityClasses.length !== 15) {
    add("authority-class-count-drift", "error", input.manifest.atlasFingerprint, "The authority matrix must retain fifteen classes.");
  }

  const policy = ASOIAF_EXTERNAL_PROVENANCE_LINEAGE.defaultCollectionPolicy;
  if (
    policy.hostDelayMs !== 1_500
    || policy.concurrency !== 1
    || policy.graphEffect !== "none"
    || policy.canonEffect !== "none"
  ) {
    add(
      "provenance-lineage-drift",
      "error",
      "asoiaf-external-provenance-lineage",
      "Clifford Number and UnderCast collection invariants have drifted.",
    );
  }

  return findings.sort(
    (left, right) =>
      compareCodepoints(left.severity, right.severity)
      || compareCodepoints(left.code, right.code)
      || compareCodepoints(left.subjectId, right.subjectId),
  );
}
