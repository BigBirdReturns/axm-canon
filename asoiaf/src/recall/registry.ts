import type {
  CanonRecallPacket,
  CanonRecallSourceHint,
} from "../../../src/canon/recall/index.js";
import coreEntities from "./data/core-entities.json" with { type: "json" };
import lineageClaims from "./data/lineage-claims.json" with { type: "json" };
import chronologyGeography from "./data/chronology-geography.json" with { type: "json" };
import actorKnowledge from "./data/actor-knowledge.json" with { type: "json" };
import materialLogistics from "./data/material-logistics.json" with { type: "json" };
import magicPhysics from "./data/magic-physics.json" with { type: "json" };
import narrativeFunctions from "./data/narrative-functions.json" with { type: "json" };
import adaptationDeltas from "./data/adaptation-deltas.json" with { type: "json" };
import endgameCoordinates from "./data/endgame-coordinates.json" with { type: "json" };
import smallfolkSystems from "./data/smallfolk-systems.json" with { type: "json" };
import conversationDanceFamilyPolitics from "./data/conversation-dance-family-politics.json" with { type: "json" };
import conversationVarysFireReligion from "./data/conversation-varys-fire-religion.json" with { type: "json" };
import conversationDanceEndpointAdaptation from "./data/conversation-dance-endpoint-adaptation.json" with { type: "json" };
import conversationAsoiafEndgame from "./data/conversation-asoiaf-endgame.json" with { type: "json" };
import conversationMethod from "./data/conversation-method.json" with { type: "json" };
import sourceHints from "./data/source-hints.json" with { type: "json" };

export const ASOIAF_MODEL_RECALL_PACKETS = [
  coreEntities,
  lineageClaims,
  chronologyGeography,
  actorKnowledge,
  materialLogistics,
  magicPhysics,
  narrativeFunctions,
  adaptationDeltas,
  endgameCoordinates,
  smallfolkSystems,
] as unknown as CanonRecallPacket[];

export const ASOIAF_CONVERSATION_SYNTHESIS_PACKETS = [
  conversationDanceFamilyPolitics,
  conversationVarysFireReligion,
  conversationDanceEndpointAdaptation,
  conversationAsoiafEndgame,
  conversationMethod,
] as unknown as CanonRecallPacket[];

export const ASOIAF_RECALL_ESTATE_PACKETS = [
  ...ASOIAF_MODEL_RECALL_PACKETS,
  ...ASOIAF_CONVERSATION_SYNTHESIS_PACKETS,
];

export const ASOIAF_RECALL_SOURCE_HINTS =
  sourceHints as CanonRecallSourceHint[];
