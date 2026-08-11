export * from "./types.js";
export * from "./lineage.js";
export * from "./canonical.js";
export * from "./catalog.js";
export * from "./query-lanes.js";
export * from "./atlas.js";
export * from "./validate.js";
export * from "./reconciliation-packets.js";

import {
  ASOIAF_EXTERNAL_ATLAS_LANES,
  ASOIAF_EXTERNAL_ATLAS_MANIFEST,
  ASOIAF_EXTERNAL_ATLAS_SOURCES,
  ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS,
} from "./atlas.js";
import { validateAsoiafExternalAtlas } from "./validate.js";

export const ASOIAF_EXTERNAL_ATLAS_FINDINGS = validateAsoiafExternalAtlas({
  sources: ASOIAF_EXTERNAL_ATLAS_SOURCES,
  lanes: ASOIAF_EXTERNAL_ATLAS_LANES,
  workOrders: ASOIAF_EXTERNAL_HARVEST_WORK_ORDERS,
  manifest: ASOIAF_EXTERNAL_ATLAS_MANIFEST,
});
