import type {
  AsoiafExternalAuthorityClass,
  AsoiafExternalContinuityPolicy,
  AsoiafExternalQueryLane,
  AsoiafExternalRole,
} from "./types.js";
import { ASOIAF_EXTERNAL_QUERY_LANE_FORMAT } from "./types.js";

interface LaneSeed {
  id: AsoiafExternalRole;
  label: string;
  aliases: string[];
  preferred: AsoiafExternalAuthorityClass[];
  supporting: AsoiafExternalAuthorityClass[];
  sources?: string[];
  continuity?: AsoiafExternalContinuityPolicy;
}

function lane(seed: LaneSeed): AsoiafExternalQueryLane {
  const allAuthorities = [...seed.preferred, ...seed.supporting];
  return {
    format: ASOIAF_EXTERNAL_QUERY_LANE_FORMAT,
    id: seed.id,
    label: seed.label,
    aliases: seed.aliases,
    preferredAuthorityClasses: seed.preferred,
    supportingAuthorityClasses: seed.supporting,
    preferredSourceIds: seed.sources ?? [],
    requiredRoles: [seed.id],
    continuityPolicy: seed.continuity ?? "separate-continuities",
    responsePolicy: {
      verbatimHandling: seed.id === "exact-quotation"
        ? "exact-local-locator"
        : "locate-only-no-mirror",
      attributionRequired: true,
      communityStanding: seed.preferred.includes("discussion-provenance")
        ? "provenance-only"
        : allAuthorities.some((authority) =>
            ["community-reference", "community-analysis", "discussion-provenance"].includes(authority),
          )
          ? "supporting-only"
          : "not-applicable",
      analogueStanding: allAuthorities.includes("scholarly-analogue")
        ? "constraint-only"
        : "not-applicable",
    },
  };
}

const PRIMARY: AsoiafExternalAuthorityClass[] = [
  "primary-text",
  "companion-text",
  "released-author-text",
];
const COMMUNITY: AsoiafExternalAuthorityClass[] = [
  "community-reference",
  "community-analysis",
  "discussion-provenance",
];
const REFERENCE: AsoiafExternalAuthorityClass[] = [
  "licensed-reference",
  "official-bibliography",
  "structured-dataset",
  "community-reference",
];
const ANALOGUE: AsoiafExternalAuthorityClass[] = [
  "scholarly-analogue",
  "archival-custody",
];

const LANE_SEEDS: LaneSeed[] = [
  { id: "exact-quotation", label: "Exact quotation and locator", aliases: ["quote", "exact words", "passage", "line"], preferred: PRIMARY, supporting: ["adaptation-canon", "structured-dataset"], sources: ["local-agot", "local-acok", "local-asos", "local-affc", "local-adwd", "local-twow-samples", "local-got-subtitles", "local-hotd-subtitles"], continuity: "same-continuity-required" },
  { id: "entity-resolution", label: "Entity resolution", aliases: ["who is", "what is", "identity", "alias"], preferred: ["primary-text", "companion-text", "community-reference"], supporting: REFERENCE, sources: ["local-twoiaf", "structured-awoiaf-api", "community-awoiaf"] },
  { id: "genealogy-parentage", label: "Genealogy and parentage", aliases: ["parent", "mother", "father", "child", "family tree"], preferred: ["primary-text", "companion-text"], supporting: ["structured-dataset", "community-reference"], sources: ["local-fire-blood", "local-twoiaf", "hbo-got-viewers-guide", "structured-awoiaf-api"] },
  { id: "succession-legitimacy", label: "Succession and legitimacy", aliases: ["heir", "succession", "legitimate", "claim"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["local-fire-blood", "local-twoiaf", "scholarly-fordham"] },
  { id: "chronology", label: "Chronology", aliases: ["when", "timeline", "before", "after", "sequence"], preferred: ["primary-text", "companion-text", "adaptation-canon"], supporting: ["structured-dataset", "community-reference"], sources: ["structured-timeline-ice-fire", "structured-quartermaester", "hbo-got-episode-guide", "hbo-hotd-episode-guide"] },
  { id: "geography-travel", label: "Geography and travel", aliases: ["where", "distance", "travel time", "route", "location"], preferred: ["primary-text", "companion-text", "licensed-reference"], supporting: ["structured-dataset", "community-analysis"], sources: ["local-lands-ice-fire", "structured-quartermaester", "structured-atlas-ice-fire"] },
  { id: "dragons", label: "Dragons", aliases: ["dragon", "dragonrider", "hatching", "bond"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["local-fire-blood", "local-rise-dragon", "community-awoiaf"] },
  { id: "magic-world-physics", label: "Magic and world physics", aliases: ["magic", "physics", "mechanism", "weirwood", "resurrection"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["local-adwd", "local-twoiaf", "community-in-deep-geek"] },
  { id: "religion-sacrifice", label: "Religion and sacrifice", aliases: ["religion", "sacrifice", "ritual", "blood magic"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["local-acok", "local-adwd", "scholarly-sacred-texts"] },
  { id: "varys-rhllor", label: "Varys and R'hllor", aliases: ["varys", "r'hllor", "rhllor", "voice in the flame", "castration"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["local-acok", "local-adwd", "scholarly-sacred-texts", "community-lucifer-lightbringer"] },
  { id: "prophecy", label: "Prophecy", aliases: ["prophecy", "dream", "vision", "valonqar"], preferred: ["primary-text", "companion-text"], supporting: ["community-analysis", "scholarly-analogue"], sources: ["local-acok", "local-affc", "local-adwd"] },
  { id: "actor-knowledge", label: "Actor knowledge and belief", aliases: ["knows", "believes", "learns", "secret"], preferred: ["primary-text", "adaptation-canon"], supporting: ["structured-dataset", "community-analysis"], sources: ["structured-search-ice-fire", "local-got-subtitles", "local-hotd-subtitles"] },
  { id: "military-logistics", label: "Military logistics", aliases: ["army", "supply", "siege", "fleet", "march"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["structured-atlas-ice-fire", "community-bryndenbfish", "community-wars-politics"] },
  { id: "economics-smallfolk", label: "Economics and smallfolk", aliases: ["smallfolk", "tax", "price", "trade", "economy"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["community-race-iron-throne", "scholarly-british-history"] },
  { id: "law-governance", label: "Law and governance", aliases: ["law", "court", "office", "governance", "trial"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["community-learned-hands", "scholarly-fordham", "scholarly-stanford"] },
  { id: "dance-of-dragons", label: "Dance of the Dragons", aliases: ["dance", "greens", "blacks", "dragonseed", "tumbleton"], preferred: ["companion-text", "primary-text"], supporting: ["adaptation-canon", "community-analysis"], sources: ["local-fire-blood", "local-rise-dragon", "hbo-hotd-series"] },
  { id: "blackfyres", label: "Blackfyres", aliases: ["blackfyre", "bittersteel", "golden company", "young griff"], preferred: ["primary-text", "companion-text"], supporting: ["community-analysis", "author-statement"], sources: ["local-dunk-egg", "local-adwd", "grrm-dunk-and-egg"] },
  { id: "others-long-night", label: "Others and the Long Night", aliases: ["others", "white walkers", "long night", "winter"], preferred: ["primary-text", "companion-text"], supporting: ["adaptation-canon", "scholarly-analogue", "community-analysis"], sources: ["local-agot", "local-adwd", "scholarly-noaa", "community-quinns-ideas"] },
  { id: "language", label: "Languages and naming", aliases: ["language", "dothraki", "valyrian", "translation"], preferred: ["primary-text", "companion-text", "production-testimony"], supporting: ["community-reference", "structured-dataset"], sources: ["local-twoiaf", "community-awoiaf"] },
  { id: "author-intent", label: "Author intent", aliases: ["martin said", "grrm said", "author intent", "planned"], preferred: ["author-statement"], supporting: ["archival-custody", "official-bibliography"], sources: ["grrm-not-a-blog", "grrm-not-a-blog-rss", "grrm-interviews", "grrm-cushing-collection"], continuity: "cross-continuity-explicit" },
  { id: "production-intent", label: "Production intent", aliases: ["showrunner", "director", "writer said", "behind the scenes"], preferred: ["production-testimony"], supporting: ["adaptation-canon", "archival-custody"], sources: ["hbo-got-inside", "hbo-hotd-podcast", "hbo-hotd-inside", "hbo-pressroom"], continuity: "same-continuity-required" },
  { id: "adaptation-deltas", label: "Adaptation deltas", aliases: ["show vs book", "changed", "adaptation", "cut character"], preferred: ["primary-text", "adaptation-canon"], supporting: ["production-testimony", "community-analysis"], sources: ["local-got-subtitles", "local-hotd-subtitles", "hbo-got-series", "hbo-hotd-series"] },
  { id: "episode-dialogue", label: "Episode dialogue", aliases: ["episode line", "dialogue", "subtitle", "script"], preferred: ["adaptation-canon"], supporting: ["production-testimony", "structured-dataset"], sources: ["local-got-subtitles", "local-hotd-subtitles"], continuity: "same-continuity-required" },
  { id: "historical-analogue", label: "Historical analogues", aliases: ["historical analogue", "medieval", "roman", "byzantine"], preferred: ["scholarly-analogue"], supporting: ["community-analysis", "archival-custody"], sources: ["scholarly-perseus", "scholarly-fordham", "scholarly-british-history"], continuity: "analogue-only" },
  { id: "religious-analogue", label: "Religious analogues", aliases: ["religious analogue", "myth", "cybele", "zoroastrian"], preferred: ["scholarly-analogue"], supporting: ["community-analysis", "primary-text"], sources: ["scholarly-sacred-texts", "scholarly-iranica", "community-lucifer-lightbringer"], continuity: "analogue-only" },
  { id: "scientific-analogue", label: "Scientific analogues", aliases: ["scientific analogue", "climate", "biology", "ecology"], preferred: ["scholarly-analogue", "structured-dataset"], supporting: ["community-analysis"], sources: ["scholarly-fao", "scholarly-noaa", "scholarly-google-scholar"], continuity: "analogue-only" },
  { id: "community-consensus", label: "Community consensus", aliases: ["fandom thinks", "consensus", "common interpretation"], preferred: ["community-reference", "community-analysis", "discussion-provenance"], supporting: ["structured-dataset"], sources: ["community-awoiaf", "discussion-reddit-asoiaf", "discussion-westeros-forums"], continuity: "cross-continuity-explicit" },
  { id: "theory-provenance", label: "Theory provenance", aliases: ["who proposed", "origin of theory", "first posted"], preferred: ["discussion-provenance", "community-analysis"], supporting: ["archival-custody"], sources: ["discussion-westeros-forums", "discussion-reddit-asoiaf", "archive-wayback"], continuity: "cross-continuity-explicit" },
  { id: "chapter-analysis", label: "Chapter analysis", aliases: ["chapter", "pov", "close reading", "scene analysis"], preferred: ["primary-text"], supporting: ["community-analysis", "structured-dataset"], sources: ["structured-tower-chapters", "community-notacast", "community-race-iron-throne"] },
  { id: "publication-history", label: "Publication history", aliases: ["published", "release date", "manuscript", "publication"], preferred: ["official-bibliography", "licensed-reference", "archival-custody"], supporting: ["structured-dataset", "author-statement"], sources: ["grrm-bibliography", "publisher-bantam-series", "archive-isfdb", "archive-worldcat"] },
  { id: "edition-resolution", label: "Edition resolution", aliases: ["isbn", "edition", "page number", "hardcover", "paperback"], preferred: ["licensed-reference", "official-bibliography", "archival-custody"], supporting: ["structured-dataset"], sources: ["publisher-isbn-editions", "structured-openlibrary-api", "archive-worldcat"] },
  { id: "maps", label: "Maps", aliases: ["map", "border", "route map", "political map"], preferred: ["licensed-reference", "companion-text", "structured-dataset"], supporting: ["community-analysis"], sources: ["local-lands-ice-fire", "structured-quartermaester", "structured-atlas-ice-fire"] },
  { id: "networks", label: "Social and institutional networks", aliases: ["network", "allies", "relationships", "faction"], preferred: ["primary-text", "structured-dataset"], supporting: ["community-reference", "community-analysis"], sources: ["structured-awoiaf-category-api", "structured-westeros-map", "structured-github-datasets"] },
  { id: "fandom-history", label: "Fandom history", aliases: ["fandom history", "old forum", "community history", "reaction"], preferred: ["discussion-provenance", "archival-custody"], supporting: ["community-analysis"], sources: ["archive-wayback", "archive-fanlore", "discussion-westeros-forums"] },
  { id: "endgame-closure", label: "Endgame closure", aliases: ["ending", "endgame", "final ruler", "how it ends", "closure"], preferred: ["primary-text", "released-author-text", "author-statement"], supporting: ["adaptation-canon", "community-analysis"], sources: ["local-adwd", "local-twow-samples", "grrm-not-a-blog", "hbo-got-s08e06"] },
  { id: "hotd-endpoints", label: "House of the Dragon endpoints", aliases: ["hotd ending", "dance endpoint", "who survives", "hour of the wolf", "aegon iii"], preferred: ["companion-text", "adaptation-canon"], supporting: ["production-testimony", "community-analysis"], sources: ["local-fire-blood", "local-rise-dragon", "local-hotd-subtitles", "hbo-hotd-series"] },
  { id: "heraldry", label: "Heraldry", aliases: ["sigil", "banner", "coat of arms", "house words"], preferred: ["companion-text", "licensed-reference"], supporting: ["community-reference", "structured-dataset"], sources: ["local-twoiaf", "local-lands-ice-fire", "structured-westeros-map"] },
  { id: "food-agriculture", label: "Food and agriculture", aliases: ["food", "harvest", "crop", "agriculture", "winter stores"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["scholarly-fao", "community-race-iron-throne"] },
  { id: "medicine-disease", label: "Medicine and disease", aliases: ["disease", "medicine", "wound", "plague", "greyscale"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["local-adwd", "community-awoiaf"] },
  { id: "gender-kinship", label: "Gender and kinship", aliases: ["gender", "marriage", "kinship", "inheritance by women"], preferred: ["primary-text", "companion-text"], supporting: ["scholarly-analogue", "community-analysis"], sources: ["local-fire-blood", "community-girls-gone-canon", "scholarly-fordham"] },
  { id: "death-status", label: "Death and survival status", aliases: ["dead", "alive", "survives", "fate", "missing"], preferred: ["primary-text", "companion-text", "adaptation-canon"], supporting: ["community-reference", "structured-dataset"], sources: ["community-awoiaf", "structured-search-ice-fire"] },
  { id: "literary-influences", label: "Literary influences", aliases: ["influence", "inspired by", "tolkien", "allusion"], preferred: ["author-statement", "scholarly-analogue"], supporting: ["community-analysis", "archival-custody"], sources: ["grrm-interviews", "scholarly-jstor", "archive-isfdb"] },
  { id: "dataset-validation", label: "Dataset validation", aliases: ["validate dataset", "schema", "duplicate", "data quality"], preferred: ["structured-dataset"], supporting: ["community-reference", "archival-custody"], sources: ["structured-awoiaf-api", "structured-wikidata", "structured-openlibrary-api"] },
  { id: "archive-recovery", label: "Archive recovery", aliases: ["archive", "deleted", "old page", "dead link", "wayback"], preferred: ["archival-custody"], supporting: ["structured-dataset", "discussion-provenance"], sources: ["archive-wayback", "structured-internet-archive-search", "grrm-cushing-finding-aid"] },
  { id: "international-reference", label: "International reference", aliases: ["translation", "international edition", "foreign title", "territory"], preferred: ["licensed-reference", "official-bibliography", "archival-custody"], supporting: ["structured-dataset", "community-reference"], sources: ["publisher-harper-series", "archive-worldcat", "archive-british-library"] },
];

export const ASOIAF_EXTERNAL_QUERY_LANES: AsoiafExternalQueryLane[] =
  LANE_SEEDS.map(lane);
