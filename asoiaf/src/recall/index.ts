import {
  buildCanonRecallEstateManifest,
  queryCanonRecallCandidates,
  validateCanonRecallEstate,
  type CanonRecallQuery,
} from "../../../src/canon/recall/index.js";
import {
  ASOIAF_CONVERSATION_SYNTHESIS_PACKETS,
  ASOIAF_MODEL_RECALL_PACKETS,
  ASOIAF_RECALL_ESTATE_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
} from "./registry.js";

export {
  ASOIAF_CONVERSATION_SYNTHESIS_PACKETS,
  ASOIAF_MODEL_RECALL_PACKETS,
  ASOIAF_RECALL_ESTATE_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
} from "./registry.js";

export const ASOIAF_MODEL_RECALL_MANIFEST = buildCanonRecallEstateManifest(
  ASOIAF_MODEL_RECALL_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
);

export const ASOIAF_MODEL_RECALL_FINDINGS = validateCanonRecallEstate(
  ASOIAF_MODEL_RECALL_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
);

export const ASOIAF_CONVERSATION_SYNTHESIS_MANIFEST =
  buildCanonRecallEstateManifest(
    ASOIAF_CONVERSATION_SYNTHESIS_PACKETS,
    ASOIAF_RECALL_SOURCE_HINTS,
  );

export const ASOIAF_CONVERSATION_SYNTHESIS_FINDINGS =
  validateCanonRecallEstate(
    ASOIAF_CONVERSATION_SYNTHESIS_PACKETS,
    ASOIAF_RECALL_SOURCE_HINTS,
  );

export const ASOIAF_RECALL_ESTATE_MANIFEST = buildCanonRecallEstateManifest(
  ASOIAF_RECALL_ESTATE_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
);

export const ASOIAF_RECALL_ESTATE_FINDINGS = validateCanonRecallEstate(
  ASOIAF_RECALL_ESTATE_PACKETS,
  ASOIAF_RECALL_SOURCE_HINTS,
);

export function queryAsoiafModelRecall(query: CanonRecallQuery) {
  return queryCanonRecallCandidates(ASOIAF_MODEL_RECALL_PACKETS, query);
}

export function queryAsoiafConversationSynthesis(query: CanonRecallQuery) {
  return queryCanonRecallCandidates(
    ASOIAF_CONVERSATION_SYNTHESIS_PACKETS,
    query,
  );
}

export function queryAsoiafRecallEstate(query: CanonRecallQuery) {
  return queryCanonRecallCandidates(ASOIAF_RECALL_ESTATE_PACKETS, query);
}
