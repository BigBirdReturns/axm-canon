import { describe, expect, it } from "vitest";
import {
  ASOIAF_EXTERNAL_ATLAS_FINDINGS,
  ASOIAF_EXTERNAL_ATLAS_LANES,
  ASOIAF_EXTERNAL_ATLAS_MANIFEST,
  ASOIAF_EXTERNAL_ATLAS_SOURCES,
  ASOIAF_EXTERNAL_AUTHORITY_CLASSES,
  ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS,
  asoiafExternalCreditRequired,
  buildAsoiafExternalAtlas,
  getAsoiafExternalSource,
  routeAsoiafExternalQuestion,
} from "../src/external/index.js";

describe("ASOIAF external source atlas", () => {
  it("materializes the declared source, lane, work-order, and candidate estate", () => {
    expect(ASOIAF_EXTERNAL_ATLAS_MANIFEST.sourceCount).toBe(219);
    expect(ASOIAF_EXTERNAL_ATLAS_MANIFEST.laneCount).toBe(45);
    expect(ASOIAF_EXTERNAL_ATLAS_MANIFEST.workOrderCount).toBe(219);
    expect(ASOIAF_EXTERNAL_ATLAS_MANIFEST.sourceLaneEdgeCount).toBe(510);
    expect(ASOIAF_EXTERNAL_ATLAS_MANIFEST.heldCandidateCount).toBe(805);
    expect(ASOIAF_EXTERNAL_ATLAS_MANIFEST.routedCandidateCount).toBe(805);
    expect(ASOIAF_EXTERNAL_AUTHORITY_CLASSES).toHaveLength(15);
    expect(ASOIAF_EXTERNAL_ATLAS_MANIFEST.atlasFingerprint).toMatch(
      /^fnv1a32:[a-f0-9]{8}$/,
    );
  });

  it("has no authority, rights, routing, or promotion-firewall errors", () => {
    expect(
      ASOIAF_EXTERNAL_ATLAS_FINDINGS.filter(
        (finding) => finding.severity === "error",
      ),
    ).toEqual([]);
  });

  it("is deterministic under source, lane, and nested-array reordering", () => {
    const rebuilt = buildAsoiafExternalAtlas(
      [...ASOIAF_EXTERNAL_ATLAS_SOURCES].reverse().map((source) => ({
        ...source,
        continuityIds: [...source.continuityIds].reverse(),
        roles: [...source.roles].reverse(),
        contentClasses: [...source.contentClasses].reverse(),
        accessMethods: [...source.accessMethods].reverse(),
        sourceHintRoutes: [...source.sourceHintRoutes].reverse(),
      })),
      [...ASOIAF_EXTERNAL_ATLAS_LANES].reverse().map((lane) => ({
        ...lane,
        aliases: [...lane.aliases].reverse(),
        preferredAuthorityClasses: [
          ...lane.preferredAuthorityClasses,
        ].reverse(),
        supportingAuthorityClasses: [
          ...lane.supportingAuthorityClasses,
        ].reverse(),
        preferredSourceIds: [...lane.preferredSourceIds].reverse(),
      })),
    );
    expect(rebuilt.manifest).toEqual(ASOIAF_EXTERNAL_ATLAS_MANIFEST);
    expect(rebuilt.workOrders).toEqual(ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS);
  });

  it("routes the Varys and R'hllor question across primary, community, and analogue planes", () => {
    const route = routeAsoiafExternalQuestion({
      text: "What do Varys, the voice in the flame, sacrifice, and R'hllor imply?",
      continuityIds: ["book-main", "historical-analogue"],
      limit: 20,
    });
    const sourceIds = route.sources.map((source) => source.sourceId);
    expect(route.laneIds).toContain("varys-rhllor");
    expect(sourceIds).toEqual(
      expect.arrayContaining([
        "local-acok",
        "local-adwd",
        "scholarly-sacred-texts",
        "community-lucifer-lightbringer",
      ]),
    );
    expect(
      route.responsePolicies.some(
        (policy) => policy.analogueStanding === "constraint-only",
      ),
    ).toBe(true);
  });

  it("routes Dance genealogy and fixed endpoints without blending book and adaptation continuity", () => {
    const route = routeAsoiafExternalQuestion({
      text: "For the hotd ending, who survives the Dance through the Hour of the Wolf?",
      laneIds: ["genealogy-parentage", "hotd-endpoints"],
      limit: 20,
    });
    const sourceIds = route.sources.map((source) => source.sourceId);
    expect(route.laneIds).toEqual(
      expect.arrayContaining(["genealogy-parentage", "hotd-endpoints"]),
    );
    expect(sourceIds).toEqual(
      expect.arrayContaining([
        "local-fire-blood",
        "local-rise-dragon",
        "local-hotd-subtitles",
        "hbo-hotd-series",
      ]),
    );
  });

  it("locates copyrighted quotations without creating a mirrored corpus", () => {
    const route = routeAsoiafExternalQuestion({
      text: "Give me the exact words and passage where the red wedding begins",
      continuityIds: ["book-main"],
    });
    expect(route.laneIds).toContain("exact-quotation");
    expect(route.responsePolicies).toContainEqual(
      expect.objectContaining({
        verbatimHandling: "exact-local-locator",
      }),
    );
    expect(
      ASOIAF_EXTERNAL_ATLAS_SOURCES.filter(
        (source) => source.rightsMode === "publisher-copyright",
      ).every((source) => source.harvestPolicy.retainRawBody === false),
    ).toBe(true);
  });

  it("keeps community utility separate from primary standing", () => {
    const community = ASOIAF_EXTERNAL_ATLAS_SOURCES.filter((source) =>
      [
        "community-reference",
        "community-analysis",
        "discussion",
      ].includes(source.sourcePlane),
    );
    expect(community.length).toBeGreaterThan(30);
    expect(
      community.every(
        (source) =>
          source.authorityClass !== "primary-text"
          && source.authorityClass !== "companion-text"
          && source.authorityClass !== "author-statement",
      ),
    ).toBe(true);
  });

  it("gives every registered source exactly one deterministic work order", () => {
    expect(
      new Set(
        ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS.map(
          (workOrder) => workOrder.sourceId,
        ),
      ).size,
    ).toBe(ASOIAF_EXTERNAL_ATLAS_SOURCES.length);
    expect(
      ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS.every(
        (workOrder) =>
          workOrder.promotionForbiddenUntil.includes(
            "claim-level-receipts-attached",
          )
          && workOrder.promotionForbiddenUntil.includes(
            "human-review-recorded",
          )
          && workOrder.promotionForbiddenUntil.includes(
            "reconciliation-transaction-passes",
          ),
      ),
    ).toBe(true);
  });

  it("retains full structured bodies only under explicit compatible rights", () => {
    const awoiaf = getAsoiafExternalSource("structured-awoiaf-api");
    expect(awoiaf).toBeDefined();
    expect(awoiaf?.rightsMode).toBe("cc-by-sa");
    expect(awoiaf?.harvestPolicy.retainRawBody).toBe(true);
    expect(awoiaf && asoiafExternalCreditRequired(awoiaf)).toBe(true);

    const reddit = getAsoiafExternalSource("discussion-reddit-asoiaf");
    expect(reddit?.rightsMode).toBe("link-only");
    expect(reddit?.harvestPolicy.retainRawBody).toBe(false);
    expect(reddit && asoiafExternalCreditRequired(reddit)).toBe(false);
  });
});
