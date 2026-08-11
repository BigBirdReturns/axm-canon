import type {
  AsoiafExternalAccessKind,
  AsoiafExternalAuthorityClass,
  AsoiafExternalContentClass,
  AsoiafExternalContinuity,
  AsoiafExternalHarvestMode,
  AsoiafExternalRightsMode,
  AsoiafExternalRole,
  AsoiafExternalSource,
  AsoiafExternalSourcePlane,
  AsoiafExternalVerificationStatus,
} from "./types.js";
import { ASOIAF_EXTERNAL_SOURCE_FORMAT } from "./types.js";

interface SourceSeed {
  id: string;
  label: string;
  uri: string;
  plane: AsoiafExternalSourcePlane;
  authority: AsoiafExternalAuthorityClass;
  continuities: AsoiafExternalContinuity[];
  roles: AsoiafExternalRole[];
  content: AsoiafExternalContentClass[];
  access: AsoiafExternalAccessKind;
  machineReadable?: boolean;
  credential?: "none" | "user-copy" | "session" | "api-key";
  harvest?: AsoiafExternalHarvestMode;
  rights?: AsoiafExternalRightsMode;
  verification?: AsoiafExternalVerificationStatus;
  hints?: string[];
  strengths?: string[];
  cautions?: string[];
  retainRawBody?: boolean;
  excerptMaxChars?: number;
  refreshDays?: number | null;
}

function buildSource(seed: SourceSeed): AsoiafExternalSource {
  const local = seed.access === "local-file";
  const rights = seed.rights ?? (local ? "user-controlled-private" : "publisher-copyright");
  const harvest = seed.harvest ?? (local ? "local-private-only" : "metadata-only");
  return {
    format: ASOIAF_EXTERNAL_SOURCE_FORMAT,
    id: seed.id,
    label: seed.label,
    canonicalUri: seed.uri,
    sourcePlane: seed.plane,
    authorityClass: seed.authority,
    continuityIds: seed.continuities,
    roles: seed.roles,
    contentClasses: seed.content,
    accessMethods: [
      {
        kind: seed.access,
        uri: seed.uri,
        machineReadable: seed.machineReadable ?? !["html", "search-ui", "video-channel"].includes(seed.access),
        credential: seed.credential ?? (local ? "user-copy" : "none"),
        notes: local
          ? "Holder-controlled bytes; retain only streaming digests and bounded locators."
          : "Resolve a durable source-record identifier before observation creation.",
      },
    ],
    harvestPolicy: {
      mode: harvest,
      robotsRespect: true,
      hostDelayMs: local ? 0 : 1_500,
      maxRequestsPerRun: local ? 1 : 20,
      maxResponseBytes: 8_000_000,
      retryCount: local ? 0 : 4,
      refreshDays: seed.refreshDays ?? (local ? null : 30),
      retainRawBody: seed.retainRawBody ?? false,
      excerptMaxChars: seed.excerptMaxChars ?? 0,
      requiresHumanReview: true,
    },
    rightsMode: rights,
    verificationStatus: seed.verification ?? "unverified",
    strengths: seed.strengths ?? ["Bounded source-specific routing and collection identity"],
    cautions: seed.cautions ?? ["Retrieval does not grant canonical standing"],
    coverageObservations: [],
    sourceHintRoutes: seed.hints ?? [],
    queryTemplates: ["{question}", "{entity}", "{date}"],
  };
}

const BOOKS: ReadonlyArray<{
  id: string;
  label: string;
  authority: AsoiafExternalAuthorityClass;
  continuity: AsoiafExternalContinuity;
  hint: string;
}> = [
  { id: "agot", label: "A Game of Thrones", authority: "primary-text", continuity: "book-main", hint: "AGOT" },
  { id: "acok", label: "A Clash of Kings", authority: "primary-text", continuity: "book-main", hint: "ACOK" },
  { id: "asos", label: "A Storm of Swords", authority: "primary-text", continuity: "book-main", hint: "ASOS" },
  { id: "affc", label: "A Feast for Crows", authority: "primary-text", continuity: "book-main", hint: "AFFC" },
  { id: "adwd", label: "A Dance with Dragons", authority: "primary-text", continuity: "book-main", hint: "ADWD" },
  { id: "dunk-egg", label: "Dunk and Egg collection", authority: "companion-text", continuity: "book-companion", hint: "D&E" },
  { id: "fire-blood", label: "Fire & Blood", authority: "companion-text", continuity: "book-companion", hint: "F&B" },
  { id: "twoiaf", label: "The World of Ice & Fire", authority: "companion-text", continuity: "book-companion", hint: "TWOIAF" },
  { id: "rise-dragon", label: "The Rise of the Dragon", authority: "companion-text", continuity: "book-companion", hint: "F&B" },
  { id: "lands-ice-fire", label: "The Lands of Ice and Fire", authority: "licensed-reference", continuity: "book-companion", hint: "TWOIAF" },
];

const LOCAL_SOURCES = BOOKS.map((book) =>
  buildSource({
    id: `local-${book.id}`,
    label: `User-held exact edition: ${book.label}`,
    uri: `local://asoiaf/${book.id}`,
    plane: "local-primary",
    authority: book.authority,
    continuities: [book.continuity],
    roles: ["exact-quotation", "entity-resolution", "chapter-analysis", "edition-resolution"],
    content: ["book-text"],
    access: "local-file",
    hints: [book.hint],
    verification: "manual-only",
    strengths: ["Exact edition custody", "Exact quotation and locator authority"],
    cautions: ["Payload, filename, and local path must never enter public Git"],
  }),
);

LOCAL_SOURCES.push(
  buildSource({
    id: "local-twow-samples",
    label: "User-held released The Winds of Winter sample packet",
    uri: "local://asoiaf/twow-samples",
    plane: "local-primary",
    authority: "released-author-text",
    continuities: ["released-future-book"],
    roles: ["exact-quotation", "author-intent", "publication-history", "endgame-closure"],
    content: ["sample-text"],
    access: "local-file",
    hints: ["TWOW-SAMPLE"],
    verification: "manual-only",
  }),
  buildSource({
    id: "local-got-subtitles",
    label: "User-held Game of Thrones subtitle and script locator pack",
    uri: "local://asoiaf/hbo-got-subtitles",
    plane: "local-primary",
    authority: "adaptation-canon",
    continuities: ["hbo-got"],
    roles: ["exact-quotation", "episode-dialogue", "adaptation-deltas", "actor-knowledge"],
    content: ["subtitle", "script"],
    access: "local-file",
    hints: ["HBO-GOT"],
    verification: "manual-only",
  }),
  buildSource({
    id: "local-hotd-subtitles",
    label: "User-held House of the Dragon subtitle and script locator pack",
    uri: "local://asoiaf/hbo-hotd-subtitles",
    plane: "local-primary",
    authority: "adaptation-canon",
    continuities: ["hbo-hotd"],
    roles: ["exact-quotation", "episode-dialogue", "adaptation-deltas", "hotd-endpoints"],
    content: ["subtitle", "script"],
    access: "local-file",
    hints: ["HBO-HOTD"],
    verification: "manual-only",
  }),
);

const GRRM_ROWS: ReadonlyArray<[string, string, string, AsoiafExternalRole[], AsoiafExternalContentClass[], string[]]> = [
  ["home", "George R. R. Martin official site", "https://georgerrmartin.com/", ["author-intent", "publication-history", "literary-influences"], ["statement"], ["GRRM-STATEMENT"]],
  ["not-a-blog", "Not a Blog", "https://georgerrmartin.com/notablog/", ["author-intent", "publication-history", "endgame-closure"], ["statement"], ["GRRM-STATEMENT"]],
  ["not-a-blog-rss", "Not a Blog RSS feed", "https://georgerrmartin.com/notablog/feed/", ["author-intent", "publication-history", "archive-recovery"], ["statement", "search-index"], ["GRRM-STATEMENT"]],
  ["bibliography", "GRRM official bibliography", "https://georgerrmartin.com/bibliography/", ["publication-history", "edition-resolution", "international-reference"], ["bibliographic-record"], ["GRRM-STATEMENT"]],
  ["books", "GRRM official books index", "https://georgerrmartin.com/grrm/book/", ["publication-history", "edition-resolution", "literary-influences"], ["bibliographic-record"], ["GRRM-STATEMENT"]],
  ["samples", "GRRM official samples index", "https://georgerrmartin.com/excerpt/", ["exact-quotation", "publication-history", "endgame-closure"], ["sample-text"], ["TWOW-SAMPLE", "GRRM-STATEMENT"]],
  ["twow-samples", "GRRM released Winds of Winter samples", "https://georgerrmartin.com/excerpt/from-the-winds-of-winter/", ["exact-quotation", "author-intent", "endgame-closure"], ["sample-text"], ["TWOW-SAMPLE"]],
  ["asoiaf-category", "GRRM A Song of Ice and Fire category", "https://georgerrmartin.com/grrm/book-category/a-song-of-ice-and-fire/", ["publication-history", "author-intent", "edition-resolution"], ["bibliographic-record"], ["GRRM-STATEMENT"]],
  ["fire-and-blood", "GRRM Fire & Blood official page", "https://georgerrmartin.com/grrm/book/fire-and-blood/", ["dance-of-dragons", "publication-history", "author-intent"], ["bibliographic-record"], ["F&B", "GRRM-STATEMENT"]],
  ["dunk-and-egg", "GRRM Dunk and Egg official route", "https://georgerrmartin.com/grrm/book/a-knight-of-the-seven-kingdoms/", ["blackfyres", "publication-history", "author-intent"], ["bibliographic-record"], ["D&E", "GRRM-STATEMENT"]],
  ["world-of-ice-and-fire", "GRRM World of Ice & Fire official route", "https://georgerrmartin.com/grrm/book/the-world-of-ice-and-fire/", ["entity-resolution", "heraldry", "publication-history"], ["bibliographic-record"], ["TWOIAF", "GRRM-STATEMENT"]],
  ["rise-of-dragon", "GRRM Rise of the Dragon official route", "https://georgerrmartin.com/grrm/book/the-rise-of-the-dragon/", ["dance-of-dragons", "publication-history", "hotd-endpoints"], ["bibliographic-record"], ["F&B", "GRRM-STATEMENT"]],
  ["interviews", "GRRM official interview route", "https://georgerrmartin.com/about-george/", ["author-intent", "literary-influences", "endgame-closure"], ["interview"], ["GRRM-STATEMENT"]],
  ["events", "GRRM official events route", "https://georgerrmartin.com/appearances/", ["author-intent", "publication-history", "fandom-history"], ["statement"], ["GRRM-STATEMENT"]],
  ["statements", "GRRM public statement locator family", "https://georgerrmartin.com/?s=a+song+of+ice+and+fire", ["author-intent", "publication-history", "endgame-closure"], ["search-index"], ["GRRM-STATEMENT"]],
  ["livejournal-archive", "GRRM LiveJournal archive route", "https://grrm.livejournal.com/", ["author-intent", "fandom-history", "archive-recovery"], ["statement"], ["GRRM-STATEMENT"]],
  ["cushing-collection", "Texas A&M Cushing GRRM collection", "https://cushing.library.tamu.edu/collections/george-r-r-martin.html", ["archive-recovery", "publication-history", "author-intent"], ["finding-aid"], ["GRRM-STATEMENT"]],
  ["cushing-finding-aid", "Texas A&M Cushing GRRM finding-aid route", "https://archon.library.tamu.edu/?p=collections/controlcard&id=86", ["archive-recovery", "publication-history", "literary-influences"], ["finding-aid"], ["GRRM-STATEMENT"]],
];

const GRRM_SOURCES = GRRM_ROWS.map(([id, label, uri, roles, content, hints]) =>
  buildSource({
    id: `grrm-${id}`,
    label,
    uri,
    plane: id.startsWith("cushing") ? "archive" : "official-author",
    authority: id.startsWith("cushing")
      ? "archival-custody"
      : id === "bibliography" || id === "books"
        ? "official-bibliography"
        : id.includes("samples")
          ? "released-author-text"
          : "author-statement",
    continuities: id.includes("samples")
      ? ["released-future-book"]
      : id.startsWith("cushing")
        ? ["cross-continuity"]
        : ["author-statement"],
    roles,
    content,
    access: id === "not-a-blog-rss" ? "rss" : "html",
    harvest: id === "not-a-blog-rss" ? "metadata-and-bounded-excerpt" : "metadata-only",
    excerptMaxChars: id === "not-a-blog-rss" ? 500 : 0,
    hints,
    verification: ["home", "not-a-blog", "not-a-blog-rss"].includes(id) ? "verified-route" : "unverified",
  }),
);

function episodeSources(
  prefix: "got" | "hotd",
  seasonCounts: readonly number[],
): AsoiafExternalSource[] {
  const hotd = prefix === "hotd";
  return seasonCounts.flatMap((count, seasonIndex) =>
    Array.from({ length: count }, (_, episodeIndex) => {
      const season = String(seasonIndex + 1).padStart(2, "0");
      const episode = String(episodeIndex + 1).padStart(2, "0");
      const code = `s${season}e${episode}`;
      return buildSource({
        id: `hbo-${prefix}-${code}`,
        label: `${hotd ? "House of the Dragon" : "Game of Thrones"} ${code.toUpperCase()}`,
        uri: `urn:hbo:${prefix}:${code}`,
        plane: "official-adaptation",
        authority: "adaptation-canon",
        continuities: [hotd ? "hbo-hotd" : "hbo-got"],
        roles: hotd
          ? ["episode-dialogue", "hotd-endpoints"]
          : ["episode-dialogue", "adaptation-deltas"],
        content: ["episode"],
        access: "html",
        machineReadable: false,
        hints: [hotd ? "HBO-HOTD" : "HBO-GOT"],
        verification: "verified-route",
        refreshDays: 180,
      });
    }),
  );
}

const EPISODE_SOURCES = [
  ...episodeSources("got", [10, 10, 10, 10, 10, 10, 7, 6]),
  ...episodeSources("hotd", [10, 8]),
];

const HBO_ROWS: ReadonlyArray<[string, string, string, AsoiafExternalRole[], AsoiafExternalContinuity, string]> = [
  ["got-series", "HBO Game of Thrones official series page", "https://www.hbo.com/game-of-thrones", ["adaptation-deltas", "episode-dialogue", "production-intent"], "hbo-got", "HBO-GOT"],
  ["got-episode-guide", "HBO Game of Thrones episode guide", "https://www.hbo.com/game-of-thrones/episodes", ["chronology", "episode-dialogue", "adaptation-deltas"], "hbo-got", "HBO-GOT"],
  ["got-viewers-guide", "HBO Game of Thrones viewer's guide", "https://viewers-guide.hbo.com/game-of-thrones", ["entity-resolution", "maps", "genealogy-parentage"], "hbo-got", "HBO-GOT"],
  ["got-inside", "HBO Game of Thrones Inside the Episode route", "https://www.hbo.com/game-of-thrones", ["production-intent", "adaptation-deltas", "actor-knowledge"], "production-testimony", "PRODUCTION-TESTIMONY"],
  ["got-production", "HBO Game of Thrones production testimony route", "https://press.wbd.com/us/property/game-thrones", ["production-intent", "publication-history", "adaptation-deltas"], "production-testimony", "PRODUCTION-TESTIMONY"],
  ["hotd-series", "HBO House of the Dragon official series page", "https://www.hbo.com/house-of-the-dragon", ["hotd-endpoints", "episode-dialogue", "adaptation-deltas"], "hbo-hotd", "HBO-HOTD"],
  ["hotd-episode-guide", "HBO House of the Dragon episode guide", "https://www.hbo.com/house-of-the-dragon/episodes", ["chronology", "episode-dialogue", "hotd-endpoints"], "hbo-hotd", "HBO-HOTD"],
  ["hotd-podcast", "Official Game of Thrones Podcast: House of the Dragon", "https://www.hbo.com/house-of-the-dragon/podcast", ["production-intent", "adaptation-deltas", "hotd-endpoints"], "production-testimony", "PRODUCTION-TESTIMONY"],
  ["hotd-inside", "HBO House of the Dragon Inside the Episode route", "https://www.hbo.com/house-of-the-dragon", ["production-intent", "adaptation-deltas", "actor-knowledge"], "production-testimony", "PRODUCTION-TESTIMONY"],
  ["pressroom", "Warner Bros. Discovery ASOIAF pressroom", "https://press.wbd.com/", ["production-intent", "publication-history", "international-reference"], "production-testimony", "PRODUCTION-TESTIMONY"],
];

const HBO_SOURCES = HBO_ROWS.map(([id, label, uri, roles, continuity, hint]) =>
  buildSource({
    id: `hbo-${id}`,
    label,
    uri,
    plane: "official-adaptation",
    authority: continuity === "production-testimony" ? "production-testimony" : "adaptation-canon",
    continuities: [continuity],
    roles,
    content: id === "hotd-podcast" ? ["podcast"] : ["production-feature"],
    access: id === "hotd-podcast" ? "podcast-feed" : "html",
    hints: [hint],
    verification: "verified-route",
  }),
);

const PUBLISHER_ROWS: ReadonlyArray<[string, string, string[]]> = [
  ["agot", "Publisher edition route: A Game of Thrones", ["AGOT"]],
  ["acok", "Publisher edition route: A Clash of Kings", ["ACOK"]],
  ["asos", "Publisher edition route: A Storm of Swords", ["ASOS"]],
  ["affc", "Publisher edition route: A Feast for Crows", ["AFFC"]],
  ["adwd", "Publisher edition route: A Dance with Dragons", ["ADWD"]],
  ["knight-seven", "Publisher edition route: A Knight of the Seven Kingdoms", ["D&E"]],
  ["fire-blood", "Publisher edition route: Fire & Blood", ["F&B"]],
  ["twoiaf", "Publisher edition route: The World of Ice & Fire", ["TWOIAF"]],
  ["rise-dragon", "Publisher edition route: The Rise of the Dragon", ["F&B"]],
  ["lands", "Publisher edition route: The Lands of Ice and Fire", ["TWOIAF"]],
  ["bantam-series", "Bantam ASOIAF series catalog", []],
  ["harper-series", "HarperCollins international ASOIAF catalog", []],
  ["audiobooks", "Official audiobook edition catalog", []],
  ["isbn-editions", "Publisher ISBN and edition resolution route", []],
  ["licensed-maps", "Licensed map and illustrated-edition catalog", ["TWOIAF"]],
];

const PUBLISHER_SOURCES = PUBLISHER_ROWS.map(([id, label, hints]) =>
  buildSource({
    id: `publisher-${id}`,
    label,
    uri: `urn:publisher:asoiaf:${id}`,
    plane: "publisher-reference",
    authority: "licensed-reference",
    continuities: ["cross-continuity"],
    roles: ["edition-resolution", "publication-history"],
    content: ["bibliographic-record"],
    access: "search-ui",
    machineReadable: false,
    hints,
  }),
);

const STRUCTURED_ROWS: ReadonlyArray<[string, string, string, AsoiafExternalAccessKind, AsoiafExternalRole[], AsoiafExternalRightsMode]> = [
  ["awoiaf-api", "A Wiki of Ice and Fire MediaWiki API", "https://awoiaf.westeros.org/api.php", "mediawiki-api", ["entity-resolution", "genealogy-parentage", "dataset-validation"], "cc-by-sa"],
  ["awoiaf-category-api", "A Wiki of Ice and Fire category traversal", "urn:awoiaf:api:categories", "mediawiki-api", ["entity-resolution", "networks", "dataset-validation"], "cc-by-sa"],
  ["awoiaf-search-api", "A Wiki of Ice and Fire search API", "urn:awoiaf:api:search", "mediawiki-api", ["exact-quotation", "entity-resolution", "chapter-analysis"], "cc-by-sa"],
  ["awoiaf-dumps", "A Wiki of Ice and Fire database dump route", "urn:awoiaf:database-dumps", "dataset-download", ["dataset-validation", "networks", "archive-recovery"], "cc-by-sa"],
  ["search-ice-fire", "A Search of Ice and Fire", "https://asearchoficeandfire.com/", "search-ui", ["exact-quotation", "chapter-analysis", "actor-knowledge"], "link-only"],
  ["timeline-ice-fire", "A Timeline of Ice and Fire", "https://atimelineoficeandfire.github.io/", "html", ["chronology", "actor-knowledge", "dataset-validation"], "unknown-review-required"],
  ["quartermaester", "Quartermaester map", "https://quartermaester.info/", "html", ["maps", "geography-travel", "chronology"], "unknown-review-required"],
  ["tower-chapters", "Tower of the Hand chapter index", "https://towerofthehand.com/books/", "html", ["chapter-analysis", "chronology", "entity-resolution"], "publisher-copyright"],
  ["tower-characters", "Tower of the Hand character index", "https://towerofthehand.com/reference/k/", "html", ["entity-resolution", "actor-knowledge", "networks"], "publisher-copyright"],
  ["atlas-ice-fire", "Atlas of Ice and Fire map index", "https://atlasoficeandfireblog.wordpress.com/", "html", ["maps", "geography-travel", "military-logistics"], "publisher-copyright"],
  ["westeros-map", "Westeros.org map and heraldry routes", "https://www.westeros.org/Citadel/", "html", ["maps", "heraldry", "genealogy-parentage"], "publisher-copyright"],
  ["wikidata", "Wikidata SPARQL endpoint", "https://query.wikidata.org/sparql", "rest-api", ["entity-resolution", "publication-history", "dataset-validation"], "cc0"],
  ["openlibrary-api", "Open Library API", "https://openlibrary.org/developers/api", "rest-api", ["edition-resolution", "publication-history", "dataset-validation"], "cc0"],
  ["google-books-api", "Google Books API", "https://www.googleapis.com/books/v1/volumes", "rest-api", ["edition-resolution", "publication-history", "international-reference"], "unknown-review-required"],
  ["internet-archive-search", "Internet Archive advanced search API", "https://archive.org/advancedsearch.php", "archive-api", ["archive-recovery", "publication-history", "fandom-history"], "unknown-review-required"],
  ["loc-api", "Library of Congress API", "https://www.loc.gov/apis/", "rest-api", ["edition-resolution", "publication-history", "archive-recovery"], "public-domain"],
  ["crossref-api", "Crossref works API", "https://api.crossref.org/works", "rest-api", ["publication-history", "historical-analogue", "dataset-validation"], "cc0"],
  ["tmdb-api", "The Movie Database API", "https://developer.themoviedb.org/reference/intro/getting-started", "rest-api", ["episode-dialogue", "publication-history", "dataset-validation"], "unknown-review-required"],
  ["tvmaze-api", "TVmaze API", "https://www.tvmaze.com/api", "rest-api", ["chronology", "publication-history", "dataset-validation"], "unknown-review-required"],
  ["github-datasets", "GitHub ASOIAF structured-dataset discovery", "https://github.com/search?q=asoiaf+dataset&type=repositories", "search-ui", ["dataset-validation", "networks", "genealogy-parentage"], "unknown-review-required"],
];

const STRUCTURED_SOURCES = STRUCTURED_ROWS.map(([id, label, uri, access, roles, rights]) =>
  buildSource({
    id: `structured-${id}`,
    label,
    uri,
    plane: id === "github-datasets" ? "discovery" : "structured-tool",
    authority: id === "github-datasets" ? "discovery-only" : "structured-dataset",
    continuities: ["cross-continuity"],
    roles,
    content: access === "dataset-download" ? ["dataset"] : ["search-index"],
    access,
    rights,
    harvest: ["cc0", "cc-by", "cc-by-sa"].includes(rights)
      ? "structured-cache-with-attribution"
      : access === "search-ui"
        ? "route-only-no-mirror"
        : "metadata-only",
    retainRawBody: ["cc0", "cc-by", "cc-by-sa"].includes(rights),
    verification: uri.startsWith("https://") ? "verified-route" : "unverified",
  }),
);

const COMMUNITY_ROWS: ReadonlyArray<[string, string, string, AsoiafExternalRole[]]> = [
  ["awoiaf", "A Wiki of Ice and Fire", "https://awoiaf.westeros.org/", ["entity-resolution", "community-consensus"]],
  ["tower", "Tower of the Hand", "https://towerofthehand.com/", ["chapter-analysis", "community-consensus"]],
  ["westeros", "Westeros.org Citadel", "https://www.westeros.org/Citadel/", ["entity-resolution", "fandom-history"]],
  ["history-westeros", "History of Westeros", "https://historyofwesteros.com/", ["historical-analogue", "community-consensus"]],
  ["radio-westeros", "Radio Westeros", "https://radiowesteros.com/", ["chapter-analysis", "theory-provenance"]],
  ["notacast", "Not A Cast", "https://notacastasoiaf.podbean.com/", ["chapter-analysis", "theory-provenance"]],
  ["girls-gone-canon", "Girls Gone Canon", "https://girlsgonecanon.podbean.com/", ["chapter-analysis", "gender-kinship"]],
  ["learned-hands", "Learned Hands", "https://learnedhands.podbean.com/", ["law-governance", "community-consensus"]],
  ["race-iron-throne", "A Race for the Iron Throne", "https://racefortheironthrone.wordpress.com/", ["economics-smallfolk", "chapter-analysis"]],
  ["poorquentyn", "PoorQuentyn archive", "https://poorquentyn.com/", ["chapter-analysis", "theory-provenance"]],
  ["bryndenbfish", "BryndenBFish analysis archive", "https://warsandpoliticsoficeandfire.wordpress.com/", ["military-logistics", "theory-provenance"]],
  ["wars-politics", "Wars and Politics of Ice and Fire", "https://warsandpoliticsoficeandfire.wordpress.com/", ["military-logistics", "law-governance"]],
  ["alt-shift-x", "Alt Shift X", "https://www.youtube.com/@AltShiftX", ["community-consensus", "adaptation-deltas"]],
  ["glidus", "Glidus", "https://www.youtube.com/@Glidus", ["adaptation-deltas", "community-consensus"]],
  ["in-deep-geek", "In Deep Geek", "https://www.youtube.com/@InDeepGeek", ["theory-provenance", "community-consensus"]],
  ["joe-magician", "Joe Magician", "https://www.youtube.com/@JoeMagician", ["theory-provenance", "literary-influences"]],
  ["quinns-ideas", "Quinn's Ideas", "https://www.youtube.com/@QuinnsIdeas", ["others-long-night", "theory-provenance"]],
  ["lucifer-lightbringer", "Lucifer Means Lightbringer archive", "https://lucifermeanslightbringer.com/", ["religious-analogue", "theory-provenance"]],
  ["david-lightbringer", "David Lightbringer", "https://www.youtube.com/@DavidLightbringer", ["religious-analogue", "theory-provenance"]],
  ["storm-spoilers", "A Storm of Spoilers", "https://stormofspoilers.com/", ["adaptation-deltas", "fandom-history"]],
];

const COMMUNITY_SOURCES = COMMUNITY_ROWS.map(([id, label, uri, roles], index) =>
  buildSource({
    id: `community-${id}`,
    label,
    uri,
    plane: index < 3 ? "community-reference" : "community-analysis",
    authority: index < 3 ? "community-reference" : "community-analysis",
    continuities: ["analysis"],
    roles,
    content: uri.includes("youtube.com") ? ["video"] : uri.includes("podbean") ? ["podcast"] : ["reference-article"],
    access: uri.includes("youtube.com") ? "video-channel" : uri.includes("podbean") ? "podcast-feed" : "html",
    harvest: "route-only-no-mirror",
    rights: "link-only",
  }),
);

const DISCUSSION_ROWS: ReadonlyArray<[string, string, string, AsoiafExternalRole[]]> = [
  ["westeros-forums", "Westeros.org forums", "https://asoiaf.westeros.org/", ["theory-provenance", "fandom-history"]],
  ["reddit-asoiaf", "Reddit r/asoiaf", "https://www.reddit.com/r/asoiaf/", ["community-consensus", "theory-provenance"]],
  ["reddit-pureasoiaf", "Reddit r/pureasoiaf", "https://www.reddit.com/r/pureasoiaf/", ["community-consensus", "theory-provenance"]],
  ["reddit-hotd", "Reddit r/HouseOfTheDragon", "https://www.reddit.com/r/HouseOfTheDragon/", ["community-consensus", "adaptation-deltas"]],
  ["reddit-search", "Reddit public search route", "https://www.reddit.com/search/", ["theory-provenance", "fandom-history"]],
  ["stackexchange", "Science Fiction & Fantasy Stack Exchange ASOIAF route", "https://scifi.stackexchange.com/questions/tagged/a-song-of-ice-and-fire", ["community-consensus", "entity-resolution"]],
  ["goodreads", "Goodreads ASOIAF discussions", "https://www.goodreads.com/series/43790-a-song-of-ice-and-fire", ["fandom-history", "community-consensus"]],
  ["tumblr", "Tumblr ASOIAF tag route", "https://www.tumblr.com/tagged/asoiaf", ["fandom-history", "theory-provenance"]],
  ["bluesky", "Bluesky ASOIAF search route", "https://bsky.app/search?q=asoiaf", ["fandom-history", "community-consensus"]],
  ["youtube-search", "YouTube ASOIAF search route", "https://www.youtube.com/results?search_query=asoiaf", ["theory-provenance", "fandom-history"]],
  ["podcast-index", "Podcast Index ASOIAF discovery", "https://podcastindex.org/search?q=asoiaf", ["theory-provenance", "fandom-history"]],
  ["tvtropes", "TV Tropes ASOIAF route", "https://tvtropes.org/pmwiki/pmwiki.php/Literature/ASongOfIceAndFire", ["literary-influences", "community-consensus"]],
];

const DISCUSSION_SOURCES = DISCUSSION_ROWS.map(([id, label, uri, roles]) =>
  buildSource({
    id: `discussion-${id}`,
    label,
    uri,
    plane: "discussion",
    authority: "discussion-provenance",
    continuities: ["analysis"],
    roles,
    content: ["forum-thread"],
    access: uri.includes("search") ? "social-search" : "html",
    harvest: "route-only-no-mirror",
    rights: "link-only",
  }),
);

const SCHOLARLY_ROWS: ReadonlyArray<[string, string, string, AsoiafExternalRole[]]> = [
  ["perseus", "Perseus Digital Library", "https://www.perseus.tufts.edu/", ["historical-analogue", "religious-analogue"]],
  ["fordham", "Internet Medieval Sourcebook", "https://sourcebooks.fordham.edu/sbook.asp", ["historical-analogue", "law-governance"]],
  ["british-history", "British History Online", "https://www.british-history.ac.uk/", ["historical-analogue", "law-governance"]],
  ["jstor", "JSTOR search", "https://www.jstor.org/action/doBasicSearch", ["historical-analogue", "literary-influences"]],
  ["google-scholar", "Google Scholar", "https://scholar.google.com/", ["historical-analogue", "scientific-analogue"]],
  ["iranica", "Encyclopaedia Iranica", "https://iranicaonline.org/", ["historical-analogue", "religious-analogue"]],
  ["sacred-texts", "Internet Sacred Text Archive", "https://sacred-texts.com/", ["religious-analogue", "literary-influences"]],
  ["stanford", "Stanford Encyclopedia of Philosophy", "https://plato.stanford.edu/", ["religious-analogue", "law-governance"]],
  ["fao", "FAO agriculture and food systems data", "https://www.fao.org/faostat/", ["food-agriculture", "scientific-analogue"]],
  ["noaa", "NOAA paleoclimate data", "https://www.ncei.noaa.gov/products/paleoclimatology", ["scientific-analogue", "others-long-night"]],
];

const SCHOLARLY_SOURCES = SCHOLARLY_ROWS.map(([id, label, uri, roles]) =>
  buildSource({
    id: `scholarly-${id}`,
    label,
    uri,
    plane: "scholarly",
    authority: "scholarly-analogue",
    continuities: roles.includes("scientific-analogue") ? ["scientific-analogue"] : ["historical-analogue"],
    roles,
    content: ["scholarly-source"],
    access: "search-ui",
    machineReadable: false,
    rights: "unknown-review-required",
    verification: "verified-route",
  }),
);

const ARCHIVE_ROWS: ReadonlyArray<[string, string, string, AsoiafExternalRole[]]> = [
  ["wayback", "Internet Archive Wayback Machine CDX", "https://web.archive.org/cdx/", ["archive-recovery", "fandom-history"]],
  ["archive-items", "Internet Archive item catalog", "https://archive.org/advancedsearch.php", ["archive-recovery", "publication-history"]],
  ["worldcat", "WorldCat catalog", "https://search.worldcat.org/", ["edition-resolution", "international-reference"]],
  ["loc", "Library of Congress catalog", "https://www.loc.gov/books/", ["edition-resolution", "archive-recovery"]],
  ["british-library", "British Library catalog", "https://explore.bl.uk/", ["edition-resolution", "international-reference"]],
  ["hathitrust", "HathiTrust catalog", "https://catalog.hathitrust.org/", ["edition-resolution", "archive-recovery"]],
  ["openlibrary", "Open Library catalog", "https://openlibrary.org/", ["edition-resolution", "publication-history"]],
  ["isfdb", "Internet Speculative Fiction Database", "https://www.isfdb.org/", ["publication-history", "literary-influences"]],
  ["cushing-digital", "Cushing Library digital collections", "https://cushing.library.tamu.edu/", ["archive-recovery"]],
  ["fanlore", "Fanlore ASOIAF fandom-history route", "https://fanlore.org/wiki/A_Song_of_Ice_and_Fire", ["fandom-history"]],
];

const ARCHIVE_SOURCES = ARCHIVE_ROWS.map(([id, label, uri, roles]) =>
  buildSource({
    id: `archive-${id}`,
    label,
    uri,
    plane: "archive",
    authority: "archival-custody",
    continuities: ["cross-continuity"],
    roles,
    content: ["bibliographic-record", "finding-aid"],
    access: id === "wayback" || id === "archive-items" ? "archive-api" : "search-ui",
    machineReadable: id === "wayback" || id === "archive-items",
    rights: "unknown-review-required",
    verification: "verified-route",
  }),
);

export const ASOIAF_EXTERNAL_SOURCES: AsoiafExternalSource[] = [
  ...LOCAL_SOURCES,
  ...GRRM_SOURCES,
  ...EPISODE_SOURCES,
  ...HBO_SOURCES,
  ...PUBLISHER_SOURCES,
  ...STRUCTURED_SOURCES,
  ...COMMUNITY_SOURCES,
  ...DISCUSSION_SOURCES,
  ...SCHOLARLY_SOURCES,
  ...ARCHIVE_SOURCES,
];
