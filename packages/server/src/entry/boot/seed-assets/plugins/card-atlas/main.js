// Card Atlas — the HUB-BROWSER flagship: the biggest seeded example, and the template for a real product-
// sized plugin. Search SIX community card hubs, browse REAL cover art page by page, filter by tags, read a
// card on a proper detail page, and ADD it to your own library — search → art grid → filter → page →
// preview → import, entirely inside the app.
//
// WHAT THIS ONE TEACHES that the smaller examples cannot:
//
//  * A FULL-PAGE, MULTI-STAGE SURFACE. One `ui.page` registration, one `masterDetail` arrangement, one
//    `onAction` router. The BROWSE stage is a BOUND grid (`tilesFrom` — the tile count is DATA, so twelve
//    results are twelve tiles and three are three); the DETAIL stage is where the decision happens, so it
//    gets the design: hero art, name, provenance, tags, the add-to-library decision above the fold, the
//    description at reading width. Stage navigation is ordinary published state (`active: {$state:"stage"}`),
//    so leaving the Extensions section and coming back lands you exactly where you were.
//
//  * ONE SOURCE SEAM, MANY HUBS. Every hub is ONE object in `SOURCES` emitting the same normalized row and
//    declaring its own capability facts (`paging`, `rowTags`, `serverInclude`, `serverExclude`, `headers`) —
//    the session, the pager, the filters and the status line adapt to those FACTS and never special-case a
//    hub by name. Adding a hub is: one object here + its hosts in the manifest's `netHosts` (each host is a
//    consent line; widened reach lands the upgrade disabled pending re-consent, by design).
//
//  * REMOTE ART, THE SAFE WAY (`net.fetchAsset`). A rendered node can only ever name an asset in the
//    installer's OWN CAS — a URL is unspellable (the exfil wall). `net.fetchAsset(url)` is the door through
//    that wall that moves no wall: the HOST downloads the image (same `netHosts` allowlist, same SSRF guard),
//    validates the BYTES (magic sniff, never the remote Content-Type), stores them into the installer's CAS,
//    and hands back a bare assetId. Publish that id in state and bind it (`tilesFrom` covers, the detail
//    `hero.assetFrom`) — the bytes never enter this realm. Art rides its OWN hourly belt (1200/plugin),
//    split from `net.fetch`'s (360/plugin), so a page of covers can never starve search itself; the
//    `art_cache` below (ONE kv key, LRU-trimmed, 24 h TTL) is a SPEED cache — repeat pages paint instantly.
//
//  * PAGING WHAT THE PROVIDER GIVES YOU. The hubs page differently — server pages with a page count
//    (Character Tavern, Chub, AI Character Cards, CharaVault, Wyvern) vs ONE whole result set (RisuRealm:
//    ~60 rows; its route 500s on any page > 1, probed 2026-08-29) — and the person gets ONE page control
//    anyway: the session holds the provider-shaped truth (`pageRows` vs the whole held set) and
//    Previous/Next resolve against it. Normalize the CONTROL, not the provider.
//
//  * FILTERS THAT ARE HONEST ABOUT CAPABILITY. The hubs speak one tag vocabulary (genre words ARE tags
//    everywhere), but each publishes it differently: Chub filters include AND exclude server-side; Character
//    Tavern filters includes server-side while projecting no tags into its rows; the rest carry row tags the
//    plugin filters per page. So filters apply where the hub can answer, and the status line SAYS SO when
//    one can't (Tavern + exclude) rather than silently no-opping. A filter that pretends is worse than a
//    filter that explains.
//
//  * LIVE CONTROLS. The Hub and Sort selects carry an `actionId` — a pick re-runs the search immediately
//    (the select vocabulary's hub-v1.2 arm), so switching hubs or sort orders never sits inert behind a
//    second click on Search.
//
//  * WORKING PAST THE SETTLEMENT WALL. An action handler has ~6 s of real time to settle — and a community
//    hub can stream a response body SLOWER than that (measured: a realm search held its body past the wall;
//    that is a deadline kill, a crash strike, and a respawned session). So NO handler awaits the hubs: it
//    validates, publishes an honest status, and SCHEDULES a floating continuation the host pumps between
//    invocations (`runSearch`/`runPage`/`runOpen` — the same mechanism as the activation-time publish),
//    guarded by a session sequence so a superseded fetch never overwrites a newer page. Long work floats;
//    handlers answer. The one priced exception is `add_to_library` — its toasts ride the invocation's own
//    outcome, so it stays inline and accepts the (rare, honest, client-toasted) 500 on a slow hub.
//
//  * TALKING TO THE OUTSIDE WORLD PROPERLY. Fetches are host-performed, allowlisted to the hosts the
//    manifest declares, 5 s / size-capped, SSRF-guarded — and every response here is treated as UNTRUSTED
//    DATA: parsed defensively, malformed rows dropped (never thrown), failures folded into the status line.
//    Two hubs bot-filter a bare client UA (Chub, CharaVault) — a browser-shaped header pair is per-source
//    DATA, not a global.
//
//  * A CANON WRITE WITH PROVENANCE — AND ART. Add-to-library is PNG-FIRST where the hub serves the card as
//    a PNG (its tEXt chunk embeds the definition): `net.fetchAsset` + `character.ingestAsset` runs the same
//    import funnel a hand-uploaded card file takes and the character arrives WITH its avatar. A hub that
//    serves native card JSON instead (Wyvern, RisuRealm's json-v3) ingests that; a PNG-only hub whose PNG
//    arm fails answers an honest error toast. Then `character.setCardData` stamps WHERE IT CAME FROM under
//    this plugin's own reserved key (portable, unforgeable), and the private `storage.kv` owned-index is the
//    fast "in your library" lookup.
//
//  * RESIDENT SESSION STATE. `session` below is a plain module variable: a resident guest lives from
//    activation to disable, so a browse session (which page was I on?) is honestly module state. It dies on
//    respawn — exactly right for a search session, and exactly wrong for the owned-index and the art cache,
//    which is why THOSE live in storage. Choose the plane by the data's lifetime, not by habit.

const host = orb.host(1);

/** Rows per page where the plugin owns the size (held-set slicing, `first`/`limit` params). Character
 *  Tavern's server page is a fixed 30 (its `hitsPerPage` param is ignored) and Wyvern's a fixed 10 — a
 *  server-paged hub's own size wins; this is the harmonized ask everywhere the hub listens. */
const PAGE_SIZE = 30;
/** Display clamps. The markdown node's own cap is 2 KiB; the tag caps mirror the tile vocabulary's
 *  (8 tags/tile) and keep chip rows and the detail's joined line readable. */
const BLURB_MAX_CHARS = 1800;
const NAME_MAX_CHARS = 80;
const TAGS_PER_ROW_MAX = 8;
const TAG_MAX_CHARS = 32;
const FILTER_TAGS_MAX = 8;
const DETAIL_TAGS_MAX_CHARS = 200;
/** The one status every fetch folds into — HTTP's own "OK" band. */
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;

/** Two hubs (Chub, CharaVault) bot-filter a bare client UA with a 403/JSON refusal — the browser-shaped
 *  header pair is probe-recorded adapter DATA (the legacy adapters carried the same), sent only where a
 *  source declares it. */
const BROWSER_HEADERS = {
  // biome-ignore lint/style/useNamingConvention: HTTP header names are wire tokens, not our identifiers.
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  // biome-ignore lint/style/useNamingConvention: HTTP header names are wire tokens, not our identifiers.
  Accept: "application/json",
};

// ── the art cache (ONE kv key — the 256-key budget already carries the owned-index) ───────────────────────
/** kv key holding `{ "<source>:<ref>": { a: assetId, t: fetchedAtMs }, … }` — every cover/hero this plugin
 *  has already pulled into the installer's CAS. A SPEED cache: a repeat search or a page you flip back to
 *  paints its art instantly instead of re-downloading it. Why the TTL: a scheduled assets-GC can reap
 *  fetched blobs (they are display-only, nothing durable references them), and an expired entry re-fetches
 *  — content-addressing makes that a cheap self-heal, so stale art never wedges. */
const ART_CACHE_KEY = "art_cache";
const ART_CACHE_MAX_ENTRIES = 300;
/** 24 hours. */
const ART_TTL_MS = 86_400_000;
/** The compact-count steps (`fmtCount`/`parseCount` speak one dialect for every hub). */
const THOUSAND = 1000;
const MILLION = 1_000_000;

// ── the resident browse session ────────────────────────────────────────────────────────────────────────────
/** The whole browse session, module state: what was searched (q/source/sort/filters — pager clicks page THIS,
 *  never a half-edited form), where we are (`page`/`totalPages`), the rows on the CURRENT page (`pageRows` —
 *  what `r0`…`rN` tile clicks resolve against), and — held-set hubs only — the ONE whole result set the route
 *  serves (`allRows`, filtered + sorted once; page flips slice it locally, no wire). Alive for the resident's
 *  lifetime, gone on respawn, which is the honest lifetime of a browse session. */
let session = null;
/** The result currently on the detail stage (the add-to-library button's subject). */
let openResult = null;

// ── shared fetch/parse helpers (every response is untrusted data) ──────────────────────────────────────────

/** GET a JSON document (per-source headers ride along where a hub bot-filters a bare UA). `null` for EVERY
 *  failure shape — non-2xx, a body that is not JSON, the host's own refusals (off-allowlist, the hourly
 *  egress floor, the 5 s deadline, the byte cap). The CALLER folds the failure into the status line; nothing
 *  here ever throws into a handler. */
async function getJson(url, headers) {
  try {
    const res = await host.net.fetch(url, headers === undefined ? undefined : { headers });
    if (res.status < HTTP_OK_MIN || res.status >= HTTP_OK_MAX) {
      host.log.info(`fetch ${res.status}: ${url}`);
      return null;
    }
    return JSON.parse(res.body);
  } catch (err) {
    host.log.warn(`fetch failed: ${String(err)}`);
    return null;
  }
}

const str = (v) => (typeof v === "string" && v.length > 0 ? v : undefined);
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/** Downloads arrive as a number (most hubs) or a compact string like "16.3k" (RisuRealm). ONE parser to a
 *  plain number, `-1` for unknowable — so sorting and display treat every hub identically. */
function parseCount(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(raw);
  }
  if (typeof raw === "string") {
    const m = /^([0-9]+(?:\.[0-9]+)?)([km]?)$/i.exec(raw.trim());
    if (m !== null) {
      const n = Number(m[1]);
      const suffix = m[2].toLowerCase();
      if (suffix === "k") {
        return Math.round(n * THOUSAND);
      }
      if (suffix === "m") {
        return Math.round(n * MILLION);
      }
      return Math.round(n);
    }
  }
  return -1;
}

/** ONE compact display formatter — "7406" and "26.9k" both render the same dialect. */
function fmtCount(n) {
  if (n < 0) {
    return "—";
  }
  const trim = (s) => (s.endsWith(".0") ? s.slice(0, -2) : s);
  if (n >= MILLION) {
    return `${trim((n / MILLION).toFixed(1))}m`;
  }
  if (n >= THOUSAND) {
    return `${trim((n / THOUSAND).toFixed(1))}k`;
  }
  return String(n);
}

/** ONE tag dialect for every hub (and for the filter inputs): lowercased, trimmed, deduped, clamped — so a
 *  row's chips and a person's typed filter words compare equal by construction. */
function normTags(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  for (const tag of raw) {
    if (out.length >= TAGS_PER_ROW_MAX) {
      break;
    }
    if (typeof tag !== "string") {
      continue;
    }
    const norm = tag.trim().toLowerCase().slice(0, TAG_MAX_CHARS);
    if (norm.length > 0 && !out.includes(norm)) {
      out.push(norm);
    }
  }
  return out;
}

/** A comma-separated filter field → the same normalized dialect (empty entries dropped, capped). */
function parseTagList(raw) {
  return normTags(String(raw ?? "").split(",")).slice(0, FILTER_TAGS_MAX);
}

/** Query-string builder for the GUEST REALM — QuickJS ships no `URLSearchParams` (measured live: a floated
 *  search died on the ReferenceError), so the param dialect is encodeURIComponent + join, nothing fancier. */
function qs(pairs) {
  return pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
}

/** Page count from a corpus total + a page size; 1 when the hub reports none. */
function pagesOf(total, perPage) {
  return typeof total === "number" && Number.isFinite(total) && total > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1;
}

// ── devalue un-flattening (RisuRealm's SvelteKit data route) ───────────────────────────────────────────────
// Realm's search rides its app's own `/__data.json` route, whose payload is devalue-FLATTENED: one shared
// value pool where every array element / object value is an integer POINTER into the pool (a value referenced
// twice is stored once). Hydrating is a memoized recursive pointer-chase; the negative indices are sentinels
// for the non-JSON primitives, and a `["Date", …]` tagged tuple is returned verbatim (no card field needs
// one). Carried from the app's own retired hub feature, re-verified against the live wire on 2026-08-29.

// devalue's negative-index sentinels for the non-JSON primitives (named: they are protocol identity).
const DEVALUE_UNDEFINED = -1;
const DEVALUE_NAN = -3;
const DEVALUE_POS_INF = -4;
const DEVALUE_NEG_INF = -5;
const DEVALUE_NEG_ZERO = -6;
const DEVALUE_SENTINELS = new Map([
  [DEVALUE_UNDEFINED, undefined],
  [DEVALUE_NAN, Number.NaN],
  [DEVALUE_POS_INF, Number.POSITIVE_INFINITY],
  [DEVALUE_NEG_INF, Number.NEGATIVE_INFINITY],
  [DEVALUE_NEG_ZERO, -0],
]);

/** Hydrate one pool slot already known to be an array/object; `recurse` chases its pointers. */
function hydrateSlot(seen, index, value, recurse) {
  if (Array.isArray(value)) {
    if (typeof value[0] === "string") {
      seen.set(index, value);
      return value; // A tagged tuple — hand back verbatim.
    }
    const arr = [];
    seen.set(index, arr);
    for (const ptr of value) {
      arr.push(recurse(ptr));
    }
    return arr;
  }
  const obj = {};
  seen.set(index, obj);
  for (const [k, v] of Object.entries(value)) {
    obj[k] = recurse(v);
  }
  return obj;
}

function unflattenDevalue(flat) {
  const seen = new Map();
  const hydrate = (index) => {
    if (typeof index !== "number") {
      return index;
    }
    if (index < 0) {
      return DEVALUE_SENTINELS.get(index);
    }
    if (index >= flat.length || seen.has(index)) {
      return seen.get(index); // Out-of-range chases resolve undefined, exactly like devalue's own holes.
    }
    const value = flat[index];
    if (Array.isArray(value) || isObj(value)) {
      return hydrateSlot(seen, index, value, hydrate);
    }
    seen.set(index, value);
    return value;
  };
  return hydrate(0);
}

/** Pull the LAST node carrying a `data` array out of the SvelteKit envelope and hydrate it. `null` on any
 *  shape drift — a hub redesign must degrade to "no results", never a crash. */
function decodeDataRoute(json) {
  if (!(isObj(json) && Array.isArray(json.nodes))) {
    return null;
  }
  for (let i = json.nodes.length - 1; i >= 0; i -= 1) {
    const node = json.nodes[i];
    if (isObj(node) && Array.isArray(node.data)) {
      const root = unflattenDevalue(node.data);
      return isObj(root) ? root : null;
    }
  }
  return null;
}

// ── the sources — one object per hub, ONE normalized row shape ─────────────────────────────────────────────
// `search({ q, include, exclude, sortKey, page })` → `{ rows, totalPages }` of NORMALIZED rows `{source, ref,
// name, creator, downloadsN, downloadsLabel, tokens, tagline, art, tags}` (`art` = the cover's remote URL,
// "" when the hub has none; `downloadsN` numeric — a hub's live popularity signal, -1 unknowable; `tags`
// normalized via `normTags` — genre words ARE tags on every hub). The CAPABILITY FACTS drive everything
// downstream: `paging` ("server" = real pages; "held-set" = one whole response the session slices),
// `rowTags` (rows carry tags ⇒ chips render and row-side filters can judge), `serverInclude`/`serverExclude`
// (the hub filters that side corpus-wide — row-side does not re-judge it), `headers` (the bot-filter
// workaround, per-source data). `detail(result)` → the display fields + the raw payload; `cardPngUrl` →
// the card-as-PNG download the PNG-first import rides (null = the hub serves none); `fetchCard` → the
// JSON fold (null = PNG is this hub's only card format).

/** Character Tavern's storage CDN (art + card PNGs) — a distinct allowlisted host, `<path>.png` addressed,
 *  resize variants via query params. Probe-verified 2026-08-29: the BARE png AND the resized variants both
 *  carry the embedded `chara` card chunk. */
const TAVERN_CDN = "https://ct-cards.storage.character-tavern.com";
/** RisuRealm's resource CDN — serves each card's cover by content hash (full-size, no resize variant — the
 *  host's 5 MiB asset cap admits them; the image guard judges bytes, not headers). */
const REALM_CDN = "https://sv.risuai.xyz";
/** Chub's avatar/card CDN — `avatars/<fullPath>/avatar.webp` (the light cover) and `chara_card_v2.png`
 *  (the full card, the PNG-first import + the hero upgrade). */
const CHUB_CDN = "https://avatars.charhub.io";
/** AI Character Cards serves BOTH its JSON API and its art from one host (rows carry a relative webp). */
const AICC_BASE = "https://api.aicharactercards.com";
/** CharaVault serves everything from its apex; a card's PNG doubles as its cover. */
const CHARAVAULT_BASE = "https://charavault.net";

/** A `author/slug`-style path, segment-encoded for a URL (slashes survive). */
const encPath = (p) =>
  p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

/** ONE Tavern hit → the normalized row; `null` drops it (malformed, or NSFW under the SFW seed posture —
 *  the search API has no server-side filter, so the per-row flag is honored here). */
function tavernRow(hit) {
  if (!isObj(hit) || hit.isNSFW === true) {
    return null;
  }
  const ref = str(hit.path);
  const name = str(hit.name);
  if (ref === undefined || name === undefined) {
    return null; // A malformed row is dropped, never fatal — one bad hit must not blank the page.
  }
  const downloadsN = parseCount(hit.downloads);
  return {
    source: "tavern",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(hit.author) ?? "unknown",
    downloadsN,
    downloadsLabel: `${fmtCount(downloadsN)}↓`,
    tokens: typeof hit.totalTokens === "number" ? String(hit.totalTokens) : "—",
    tagline: str(hit.tagline) ?? "",
    // The grid cover: the CDN's 320-wide variant (~85 KB) — a tile never needs the full card file.
    art: `${TAVERN_CDN}/${encPath(ref)}.png?width=320&quality=85&format=auto`,
    tags: [], // Tavern projects NO tags into any public JSON surface (probed 2026-08-29).
  };
}

/** ONE realm card → the normalized row (tags present on ~half the rows). */
function realmRow(card) {
  if (!isObj(card)) {
    return null;
  }
  const ref = str(card.id);
  const name = str(card.name);
  if (ref === undefined || name === undefined) {
    return null;
  }
  const downloadsN = parseCount(card.download);
  const img = str(card.img);
  return {
    source: "realm",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(card.authorname) ?? "unknown",
    downloadsN,
    downloadsLabel: `${fmtCount(downloadsN)}↓`,
    tokens: "—", // realm rows carry no clean token count.
    tagline: "",
    // The cover by content hash on realm's resource CDN — full-size already, so it doubles as the hero.
    art: img === undefined ? "" : `${REALM_CDN}/resource/${encodeURIComponent(img)}`,
    tags: normTags(card.tags),
  };
}

/** ONE chub node → the normalized row. Chub's live popularity signal is `starCount` (its `nDownloads` comes
 *  back null on today's wire — probed 2026-08-29), so stars fill the popularity slot with an honest ★ label. */
function chubRow(node) {
  if (!isObj(node) || node.nsfw_image === true) {
    return null;
  }
  const ref = str(node.fullPath);
  const name = str(node.name);
  if (ref === undefined || name === undefined) {
    return null;
  }
  const stars = typeof node.starCount === "number" && Number.isFinite(node.starCount) ? Math.round(node.starCount) : -1;
  return {
    source: "chub",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: ref.includes("/") ? ref.split("/")[0] : "unknown",
    downloadsN: stars,
    downloadsLabel: stars < 0 ? "—" : `${fmtCount(stars)}★`,
    tokens: typeof node.nTokens === "number" ? String(node.nTokens) : "—",
    tagline: str(node.tagline) ?? "",
    art: `${CHUB_CDN}/avatars/${encPath(ref)}/avatar.webp`,
    tags: normTags(node.topics),
  };
}

/** ONE wyvern result → the normalized row (no popularity signal on its public feed; known-NSFW markers are
 *  dropped under the SFW posture — the public approved feed reports `rating:"none"` otherwise). */
function wyvernRow(node) {
  if (!isObj(node)) {
    return null;
  }
  const rating = typeof node.rating === "string" ? node.rating.toLowerCase() : "";
  if (rating === "nsfw" || rating === "nsfl" || rating === "explicit" || rating === "adult" || rating === "mature") {
    return null;
  }
  const ref = str(node.id);
  const name = str(node.name);
  if (ref === undefined || name === undefined) {
    return null;
  }
  const art = str(node.avatar) ?? "";
  return {
    source: "wyvern",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: (isObj(node.creator) ? str(node.creator.displayName) : undefined) ?? "unknown",
    downloadsN: -1,
    downloadsLabel: "—",
    tokens: typeof node.token_count === "number" ? String(node.token_count) : "—",
    tagline: str(node.tagline) ?? "",
    art, // A full Cloudflare-Images URL on the allowlisted imagedelivery.net apex (~90 KB `public` variant).
    tags: normTags(node.tags ?? node.community_tags),
  };
}

/** ONE AICC card → the normalized row (tags arrive as `[{id, name}]` — the names are the vocabulary). */
function aiccRow(card) {
  if (!isObj(card) || card.isNsfw === true) {
    return null;
  }
  const name = str(card.title);
  if (typeof card.id !== "number" || name === undefined) {
    return null;
  }
  const downloadsN = parseCount(card.downloadCount);
  const image = str(card.imageUrl);
  return {
    source: "aicc",
    ref: String(card.id),
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(card.author) ?? "unknown",
    downloadsN,
    downloadsLabel: `${fmtCount(downloadsN)}↓`,
    tokens: typeof card.tokenCount === "number" ? String(card.tokenCount) : "—",
    tagline: str(card.excerpt) ?? "",
    art: image === undefined ? "" : `${AICC_BASE}${image.startsWith("/") ? "" : "/"}${image}`,
    tags: normTags(Array.isArray(card.tags) ? card.tags.map((t) => (isObj(t) ? t.name : undefined)) : []),
  };
}

/** ONE CharaVault result → the normalized row. Its cover IS the card PNG (no separate art endpoint) — heavy
 *  but honest; the host's asset cap folds an outsized one to the placeholder. */
function charavaultRow(row) {
  if (!isObj(row) || row.nsfw === true) {
    return null;
  }
  const folder = str(row.folder);
  const file = str(row.file);
  const name = str(row.name);
  if (folder === undefined || file === undefined || name === undefined) {
    return null;
  }
  const ref = `${folder}/${file}`;
  return {
    source: "charavault",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(row.creator) ?? "unknown",
    downloadsN: -1, // no download signal on a row (only sparse ratings).
    downloadsLabel: "—",
    tokens: typeof row.token_count === "number" ? String(row.token_count) : "—",
    tagline: str(row.description_preview) ?? "",
    art: `${CHARAVAULT_BASE}/api/cards/download/${encPath(ref)}`,
    tags: normTags(row.tags),
  };
}

/** Collect normalized rows through one mapper, dropping nulls — every hub's search tail. */
function mapRows(items, mapper) {
  const rows = [];
  for (const item of items) {
    const row = mapper(item);
    if (row !== null) {
      rows.push(row);
    }
  }
  return rows;
}

const SOURCES = {
  tavern: {
    label: "Character Tavern",
    paging: "server",
    rowTags: false,
    serverInclude: true,
    serverExclude: false,
    async search({ q, include, page }) {
      // The live param grammar, probed 2026-08-29: `query=` is the text search (the older `q=` is DEAD — it
      // returns the unfiltered firehose), `tags=a,b` is a server-side AND filter over the hub's own tag
      // index (rows never carry the tags back — see `rowTags`), `page=` is real (30 hits fixed, `totalPages`
      // in every response). No sort, exclude or genre params exist (all probed ignored).
      const params = [
        ["query", q],
        ["page", String(page)],
      ];
      if (include.length > 0) {
        params.push(["tags", include.join(",")]);
      }
      const json = await getJson(`https://character-tavern.com/api/search/cards?${qs(params)}`);
      const hits = isObj(json) && Array.isArray(json.hits) ? json.hits : null;
      if (hits === null) {
        return null;
      }
      const totalPages = isObj(json) && typeof json.totalPages === "number" && json.totalPages > 0 ? Math.round(json.totalPages) : 1;
      return { rows: mapRows(hits, tavernRow), totalPages };
    },
    async detail(result) {
      // The detail endpoint's `card` carries BOTH the listing prose and the full `definition_*` fields —
      // one fetch serves the preview and the import fold (cached on the open result).
      const json = await getJson(`https://character-tavern.com/api/character/${encPath(result.ref)}`);
      const card = isObj(json) && isObj(json.card) ? json.card : null;
      if (card === null) {
        return null;
      }
      return {
        blurb: (str(card.description) ?? result.tagline ?? "").slice(0, BLURB_MAX_CHARS),
        raw: card,
      };
    },
    /** The detail hero's sharper variant (640-wide) — fetched lazily when a card opens, cached like a cover. */
    heroUrl(result) {
      return `${TAVERN_CDN}/${encPath(result.ref)}.png?width=640&quality=60&format=auto`;
    },
    /** The card AS A FILE: the bare CDN png embeds the full definition in its `chara` chunk, so the PNG-first
     *  import lands definition + avatar in one funnel pass, byte-deterministic (re-adds dedupe). */
    cardPngUrl(result) {
      return `${TAVERN_CDN}/${encPath(result.ref)}.png`;
    },
    fetchCard(_result, raw) {
      // The JSON FOLD (no PNG grant, or an over-cap/refused file): the detail payload's foreign
      // `definition_*` keys RESHAPED into the canonical `{data:{…}}` the import funnel reads. Field order is
      // FIXED and minimal: deterministic bytes ⇒ a re-add dedupes by importHash instead of minting a twin.
      const data = { name: str(raw.name) ?? "unnamed" };
      const put = (key, value) => {
        if (typeof value === "string" && value.length > 0) {
          data[key] = value;
        }
      };
      put("description", raw.definition_character_description);
      put("personality", raw.definition_personality);
      put("scenario", raw.definition_scenario);
      put("first_mes", raw.definition_first_message);
      put("mes_example", raw.definition_example_messages);
      put("system_prompt", raw.definition_system_prompt);
      put("post_history_instructions", raw.definition_post_history_prompt);
      put("creator", str(raw.author));
      return Promise.resolve({ data });
    },
  },
  realm: {
    label: "RisuRealm",
    paging: "held-set",
    rowTags: true,
    serverInclude: false,
    serverExclude: false,
    async search({ q }) {
      // Held-set source: the data route returns ONE whole result set (~60 rows) and 500s on any `page` > 1
      // (probed 2026-08-29) — the session pages it locally. NSFW stays off by default (no `nsfw` param) —
      // the seed posture. Include/exclude filtering happens row-side over the held set.
      const json = await getJson(`https://realm.risuai.net/__data.json?search=${encodeURIComponent(q)}`);
      const root = decodeDataRoute(json);
      const cards = root !== null && Array.isArray(root.cards) ? root.cards : null;
      if (cards === null) {
        return null;
      }
      return { rows: mapRows(cards, realmRow), totalPages: 1 }; // the session re-derives pages after filter+slice.
    },
    async detail(result) {
      const json = await getJson(`https://realm.risuai.net/character/${encodeURIComponent(result.ref)}/__data.json`);
      const root = decodeDataRoute(json);
      const card = root !== null && isObj(root.card) ? root.card : null;
      if (card === null) {
        return null;
      }
      return { blurb: (str(card.desc) ?? "").slice(0, BLURB_MAX_CHARS), raw: card };
    },
    /** Realm covers are served full-size — the grid asset IS the hero; no sharper variant to fetch. */
    heroUrl(_result) {
      return null;
    },
    /** Realm's documented png-v3 card download. Per-card licensing 403s it for many cards — the import
     *  ladder folds those to the JSON path below. */
    cardPngUrl(result) {
      return `https://realm.risuai.net/api/v1/download/png-v3/${encodeURIComponent(result.ref)}`;
    },
    async fetchCard(result) {
      // The JSON FOLD: realm's documented download API serves the card as native chara_card_v3 JSON — ingest
      // takes it as-is (`parseCardJson` reads V2 and V3 alike). An asset-heavy card can exceed the response
      // cap; the null fold below turns that into an honest sentence rather than a crash.
      const card = await getJson(`https://realm.risuai.net/api/v1/download/json-v3/${encodeURIComponent(result.ref)}`);
      return isObj(card) && !("error" in card) ? card : null;
    },
  },
  chub: {
    label: "Chub",
    paging: "server",
    rowTags: true,
    serverInclude: true,
    serverExclude: true,
    headers: BROWSER_HEADERS,
    async search({ q, include, exclude, sortKey, page }) {
      // Chub is the FULL-capability hub: native include (`topics=`) AND exclude (`excludetopics=`) — the only
      // hub with a server exclude — plus a server sort. `first=30` harmonizes its page size with the roster;
      // `nsfw=false` is the SFW seed posture. (The legacy geo-block note did not reproduce — probed 200 from
      // this box 2026-08-29.)
      const params = [
        ["search", q],
        ["namespace", "characters"],
        ["first", String(PAGE_SIZE)],
        ["page", String(page)],
        ["nsfw", "false"],
        ["sort", sortKey === "downloads" ? "star_count" : "default"],
      ];
      if (include.length > 0) {
        params.push(["topics", include.join(",")]);
      }
      if (exclude.length > 0) {
        params.push(["excludetopics", exclude.join(",")]);
      }
      const json = await getJson(`https://api.chub.ai/search?${qs(params)}`, BROWSER_HEADERS);
      const body = isObj(json) && isObj(json.data) ? json.data : json;
      const nodes = isObj(body) && Array.isArray(body.nodes) ? body.nodes : null;
      if (nodes === null) {
        return null;
      }
      const total = isObj(body) && typeof body.count === "number" ? body.count : undefined;
      return { rows: mapRows(nodes, chubRow), totalPages: pagesOf(total, PAGE_SIZE) };
    },
    async detail(result) {
      const json = await getJson(`https://api.chub.ai/api/characters/${encPath(result.ref)}?full=true`, BROWSER_HEADERS);
      const node = isObj(json) && isObj(json.node) ? json.node : null;
      if (node === null) {
        return null;
      }
      return { blurb: (str(node.description) ?? str(node.tagline) ?? "").slice(0, BLURB_MAX_CHARS), raw: node };
    },
    /** The full card PNG doubles as the sharper hero (the grid cover is the light avatar.webp). */
    heroUrl(result) {
      return `${CHUB_CDN}/avatars/${encPath(result.ref)}/chara_card_v2.png`;
    },
    cardPngUrl(result) {
      return `${CHUB_CDN}/avatars/${encPath(result.ref)}/chara_card_v2.png`;
    },
    /** PNG is chub's only card format (the legacy adapter shipped `format:"png"`, no JSON arm) — a failed
     *  PNG arm answers the honest error toast rather than a lossy fabricated card. */
    fetchCard(_result, _raw) {
      return Promise.resolve(null);
    },
  },
  wyvern: {
    label: "Wyvern",
    paging: "server",
    rowTags: true,
    serverInclude: false,
    serverExclude: false,
    async search({ q, page }) {
      // The cleanest hub: `exploreSearch/characters?search=&page=` (no auth, no quirk headers). Its own page
      // size is 10 and `totalPages` arrives in the response (probed 2026-08-29). No tag/sort/nsfw params —
      // filters apply row-side per page; the public approved feed carries no usable rating.
      const json = await getJson(`https://api.wyvern.chat/exploreSearch/characters?search=${encodeURIComponent(q)}&page=${String(page)}`);
      const results = isObj(json) && Array.isArray(json.results) ? json.results : null;
      if (results === null) {
        return null;
      }
      const totalPages = isObj(json) && typeof json.totalPages === "number" && json.totalPages > 0 ? Math.round(json.totalPages) : 1;
      return { rows: mapRows(results, wyvernRow), totalPages };
    },
    async detail(result) {
      // The by-id route returns the character NODE directly — and it is NATIVE V2 card JSON (first_mes/
      // mes_example/… at the root), so this one payload serves the preview AND the import fold.
      const json = await getJson(`https://api.wyvern.chat/characters/${encodeURIComponent(result.ref)}`);
      if (!isObj(json)) {
        return null;
      }
      return { blurb: (str(json.description) ?? str(json.tagline) ?? "").slice(0, BLURB_MAX_CHARS), raw: json };
    },
    heroUrl(_result) {
      return null; // the row's Cloudflare-Images URL is already the full cover.
    },
    cardPngUrl(_result) {
      return null; // wyvern serves no card PNG — the JSON fold below is the import path.
    },
    /** Wyvern's card IS the detail payload (native V2 at the root) — ingest takes it as-is. */
    fetchCard(_result, raw) {
      return Promise.resolve(isObj(raw) ? raw : null);
    },
  },
  aicc: {
    label: "AI Character Cards",
    paging: "server",
    rowTags: true,
    serverInclude: false,
    serverExclude: false,
    async search({ q, sortKey, page }) {
      // Curated, low-volume: `?search=&limit=&skip=&orderBy=` (orderBy honors downloadCount — verified by the
      // legacy probe; relevance otherwise). No tag params — filters apply row-side per page. Per-card `isNsfw`
      // is honored in the row mapper (SFW posture).
      const params = [
        ["search", q],
        ["limit", String(PAGE_SIZE)],
        ["skip", String((page - 1) * PAGE_SIZE)],
      ];
      if (sortKey === "downloads") {
        params.push(["orderBy", "downloadCount"]);
      }
      const json = await getJson(`${AICC_BASE}/api/cards?${qs(params)}`);
      const data = isObj(json) && Array.isArray(json.data) ? json.data : null;
      if (data === null) {
        return null;
      }
      const total = isObj(json) && isObj(json.pagination) && typeof json.pagination.total === "number" ? json.pagination.total : undefined;
      return { rows: mapRows(data, aiccRow), totalPages: pagesOf(total, PAGE_SIZE) };
    },
    async detail(result) {
      // The by-id route returns the card object directly; `description` is the long listing prose.
      const json = await getJson(`${AICC_BASE}/api/cards/${encodeURIComponent(result.ref)}`);
      if (!isObj(json)) {
        return null;
      }
      return { blurb: (str(json.description) ?? str(json.excerpt) ?? result.tagline ?? "").slice(0, BLURB_MAX_CHARS), raw: json };
    },
    /** The native V2 card PNG doubles as the sharper hero (the grid cover is the light webp). */
    heroUrl(result) {
      return `${AICC_BASE}/api/cards/${encodeURIComponent(result.ref)}/download`;
    },
    cardPngUrl(result) {
      return `${AICC_BASE}/api/cards/${encodeURIComponent(result.ref)}/download`;
    },
    /** PNG is AICC's only card format (native V2 PNG download; the listing JSON is metadata, not the card). */
    fetchCard(_result, _raw) {
      return Promise.resolve(null);
    },
  },
  charavault: {
    label: "CharaVault",
    paging: "server",
    rowTags: true,
    serverInclude: false,
    serverExclude: false,
    headers: BROWSER_HEADERS,
    async search({ q, page }) {
      // The 95K-card aggregator: `?q=&limit=&offset=` (+ the browser-UA pair — it bot-filters a bare client
      // UA). No tag/sort params — filters apply row-side per page; per-card `nsfw` is honored in the mapper.
      // Mirrors chub/janitor content, so the import-side byte dedupe matters here most.
      const params = [
        ["q", q],
        ["limit", String(PAGE_SIZE)],
        ["offset", String((page - 1) * PAGE_SIZE)],
      ];
      const json = await getJson(`${CHARAVAULT_BASE}/api/cards?${qs(params)}`, BROWSER_HEADERS);
      const results = isObj(json) && Array.isArray(json.results) ? json.results : null;
      if (results === null) {
        return null;
      }
      const total = isObj(json) && typeof json.total === "number" ? json.total : undefined;
      return { rows: mapRows(results, charavaultRow), totalPages: pagesOf(total, PAGE_SIZE) };
    },
    detail(result) {
      // No separate detail endpoint is needed: the search row already carries the description preview (and
      // the full definition lives in the card PNG the import rides). The preview is the honest blurb.
      return Promise.resolve({ blurb: (result.tagline || "(this card ships no description preview)").slice(0, BLURB_MAX_CHARS), raw: null });
    },
    heroUrl(_result) {
      return null; // the cover IS the card PNG already.
    },
    cardPngUrl(result) {
      return `${CHARAVAULT_BASE}/api/cards/download/${encPath(result.ref)}`;
    },
    /** PNG is CharaVault's only card format. */
    fetchCard(_result, _raw) {
      return Promise.resolve(null);
    },
  },
};

// ── the art plane (fetchAsset + the ONE-key cache) ─────────────────────────────────────────────────────────

/** Can this install fetch remote art at all? Feature-detected at USE (the grant is the user's call) — with
 *  the grant absent every arm below degrades to the placeholder-tile pre-art behavior, never a crash. */
const canFetchArt = () => host.grants.includes("net.fetch_asset");

/** Read the art cache — defensively (the value is our own, but an older version's shape must not wedge an
 *  upgrade). Returns a plain mutable map object. */
async function loadArtCache() {
  try {
    const raw = await host.storage.get(ART_CACHE_KEY);
    if (raw === null) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return isObj(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Persist the cache, LRU-trimmed by fetch time so it can never crowd the 64 KiB value cap. */
async function saveArtCache(cache) {
  const entries = Object.entries(cache).filter(([, v]) => isObj(v) && typeof v.a === "string" && typeof v.t === "number");
  entries.sort((a, b) => b[1].t - a[1].t);
  await host.storage.set(ART_CACHE_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, ART_CACHE_MAX_ENTRIES))));
}

/** A cache entry's assetId, iff present and fresh. */
function cachedArt(cache, key) {
  const entry = cache[key];
  if (!(isObj(entry) && typeof entry.a === "string" && typeof entry.t === "number")) {
    return;
  }
  if (host.clock.nowEpochMs() - entry.t >= ART_TTL_MS) {
    return; // Expired — a re-fetch is the cheap self-heal (see ART_TTL_MS).
  }
  return entry.a;
}

/** Fetch every listed row's cover that the cache does not hold — IN PARALLEL (the membrane admits the
 *  concurrency; each call claims the art belt, which is sized for exactly this). A per-cover failure is a
 *  placeholder, never fatal; one summarizing log line reports the batch. Mutates + persists the cache;
 *  returns how many new covers landed. */
async function fetchMissingArt(cache, rows, keyOf, urlOf) {
  const misses = rows.filter((row) => urlOf(row) !== "" && cachedArt(cache, keyOf(row)) === undefined);
  if (misses.length === 0 || !canFetchArt()) {
    return 0;
  }
  const settled = await Promise.all(
    misses.map(async (row) => {
      try {
        const { assetId } = await host.net.fetchAsset(urlOf(row));
        cache[keyOf(row)] = { a: assetId, t: host.clock.nowEpochMs() };
        return true;
      } catch (err) {
        host.log.info(`cover skipped (${keyOf(row)}): ${String(err)}`);
        return false;
      }
    }),
  );
  const landed = settled.filter(Boolean).length;
  if (landed < misses.length) {
    host.log.warn(`art: ${misses.length - landed} of ${misses.length} covers didn't land (size caps / hub hiccups) — placeholders stand in.`);
  }
  if (landed > 0) {
    await saveArtCache(cache);
  }
  return landed;
}

const artKey = (result) => `${result.source}:${result.ref}`;
const heroKey = (result) => `${result.source}:${result.ref}:hero`;

// ── filtering (ONE dialect, applied where the rows can answer) ─────────────────────────────────────────────

/** Row-side filter, honoring what the SERVER already judged: a server-filtered side is not re-judged here
 *  (dialect drift between our normalizer and the hub's index must not silently empty a server-filtered
 *  page), and a side the rows cannot answer (`rowTags: false`) passes — the status line carries the note. */
function matchesFilters(source, row, include, exclude) {
  const includeOk = source.serverInclude || !source.rowTags || include.every((tag) => row.tags.includes(tag));
  const excludeOk = source.serverExclude || !source.rowTags || !exclude.some((tag) => row.tags.includes(tag));
  return includeOk && excludeOk;
}

/** The status-line sentence for the active filters — so a filtered page SAYS it is filtered, including the
 *  one capability gap (a hub that publishes no row tags cannot exclude). */
function filterNote(source, include, exclude) {
  const parts = [];
  if (include.length > 0) {
    parts.push(`with ${include.join(", ")}`);
  }
  if (exclude.length > 0) {
    parts.push(source.serverExclude || source.rowTags ? `without ${exclude.join(", ")}` : `(excludes need published tags — ${source.label} has none)`);
  }
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
}

// ── the FLOATING wire continuations (the settlement-wall discipline) ───────────────────────────────────────
// An action invocation is bounded by the host's SETTLEMENT WALL (~6 s of real time for the WHOLE handler) —
// and a community hub can stream a response body SLOWER than that (measured live 2026-08-29: a realm search
// held its body past the wall; "invocation ended — it did not settle within its 6000ms wall", a crash strike,
// a respawned session). So NO handler awaits the hubs: it validates, publishes an honest status, SCHEDULES a
// floating continuation the host's job pump advances between invocations (the same mechanism as the
// activation-time `void publishBrowse("")` below), and returns in milliseconds. Every continuation's publish
// is guarded by a SESSION SEQUENCE so a superseded search/page/open never overwrites a newer one. The ONE
// priced exception is `add_to_library` (its toasts ride the invocation's own outcome — see its header).

/** The browse-session sequence: each search/page/open bumps it, and a continuation publishes only while it
 *  still owns the page. Module state, like the session it guards. */
let sessionSeq = 0;

/** Land one prepared page: publish the text grid instantly (with whatever covers the cache holds), then land
 *  the missing covers and republish ONCE. The shared tail of every search/page continuation. */
async function presentPage(seq, status) {
  await publishBrowse(status);
  if (!canFetchArt() || session === null) {
    return;
  }
  const cache = await loadArtCache();
  const landed = await fetchMissingArt(cache, session.pageRows, artKey, (row) => row.art);
  if (landed > 0 && seq === sessionSeq) {
    await publishBrowse(status);
  }
}

/** The page's status sentence: what's showing, from where, for what, under which filters. */
function pageStatus(source, q) {
  if (session === null) {
    return "";
  }
  const what = q.length === 0 ? `Browsing ${source.label}` : `${source.label} for "${q}"`;
  const note = filterNote(source, session.include, session.exclude);
  if (session.pageRows.length === 0) {
    return `Nothing from ${what}${note}.`;
  }
  return `${session.pageRows.length} from ${what}${note}.`;
}

/** Build the session a fresh search establishes, from what the hub answered. Held-set hubs (`allRows`):
 *  filter row-side, sort ONCE globally, hold the whole set — page flips slice it locally. Server-paged hubs:
 *  server-filtered sides arrive filtered; row-side judges the rest per page; sort within the page in hand. */
function buildSession(source, job, res) {
  const base = { q: job.q, sourceKey: job.sourceKey, sortKey: job.sortKey, include: job.include, exclude: job.exclude, page: 1 };
  const kept = sortRows(
    res.rows.filter((row) => matchesFilters(source, row, job.include, job.exclude)),
    job.sortKey,
  );
  if (source.paging === "held-set") {
    return { ...base, totalPages: Math.max(1, Math.ceil(kept.length / PAGE_SIZE)), allRows: kept, pageRows: kept.slice(0, PAGE_SIZE) };
  }
  return { ...base, totalPages: res.totalPages, allRows: null, pageRows: kept };
}

/** The floating SEARCH continuation: fetch → normalize → filter → sort → slice → publish → land covers.
 *  Every hub await lives HERE, past the settlement wall. */
async function runSearch(seq, job) {
  const source = SOURCES[job.sourceKey];
  const res = await source.search({ q: job.q, include: job.include, exclude: job.exclude, sortKey: job.sortKey, page: 1 });
  if (seq !== sessionSeq) {
    return; // Superseded — a newer search/page/open owns the page.
  }
  if (res === null) {
    await publishBrowse(`${source.label} didn't answer — try again in a moment.`);
    return;
  }
  openResult = null;
  session = buildSession(source, job, res);
  await presentPage(seq, pageStatus(source, job.q));
}

/** The floating PAGE continuation: same session, different page — a wire fetch for a server-paged hub, a
 *  local slice for a held-set one. */
async function runPage(seq) {
  if (session === null) {
    return;
  }
  const source = SOURCES[session.sourceKey];
  if (source.paging === "held-set") {
    session.pageRows = session.allRows.slice((session.page - 1) * PAGE_SIZE, session.page * PAGE_SIZE);
  } else {
    const res = await source.search({ q: session.q, include: session.include, exclude: session.exclude, sortKey: session.sortKey, page: session.page });
    if (seq !== sessionSeq) {
      return;
    }
    if (res === null) {
      await publishBrowse(`${source.label} didn't answer — try again in a moment.`);
      return;
    }
    session.totalPages = res.totalPages;
    session.pageRows = sortRows(
      res.rows.filter((row) => matchesFilters(source, row, session.include, session.exclude)),
      session.sortKey,
    );
  }
  openResult = null;
  await presentPage(seq, pageStatus(source, session.q));
}

/** The floating OPEN continuation: fetch the detail → flip the stage → lazily upgrade the hero where the hub
 *  serves a sharper variant. */
async function runOpen(seq, result) {
  const detail = await SOURCES[result.source].detail(result);
  if (seq !== sessionSeq) {
    return;
  }
  if (detail === null) {
    await publishBrowse(`${SOURCES[result.source].label} wouldn't show that card — try another.`);
    return;
  }
  openResult = { result, raw: detail.raw, blurb: detail.blurb };
  await publishDetail(result, detail.blurb); // Instant art: the hero rides the cached grid cover.
  const heroUrl = SOURCES[result.source].heroUrl(result);
  if (heroUrl === null || !canFetchArt()) {
    return;
  }
  const cache = await loadArtCache();
  const landed = await fetchMissingArt(cache, [result], heroKey, () => heroUrl);
  if (landed > 0 && seq === sessionSeq && openResult !== null && openResult.result === result) {
    await publishDetail(result, detail.blurb); // The in-place upgrade to the sharper hero.
  }
}

// ── the owned-index (fast lookup) + the card stamp (durable provenance) ────────────────────────────────────
const ownedKey = (result) => `owned:${result.source}:${result.ref}`;

/** The PNG-first import arm: card file → installer CAS → the SAME import funnel a hand-uploaded PNG takes,
 *  so the character arrives WITH its embedded avatar. `null` on ANY failure (no grant, no PNG on this hub,
 *  an over-cap file, a per-card license 403) — the caller folds to the JSON path. */
async function addViaPng(result) {
  if (!canFetchArt()) {
    return null;
  }
  const url = SOURCES[result.source].cardPngUrl(result);
  if (url === null) {
    return null;
  }
  try {
    const { assetId } = await host.net.fetchAsset(url);
    return await host.character.ingestAsset(assetId);
  } catch (err) {
    host.log.info(`png import folded to JSON (${artKey(result)}): ${String(err)}`);
    return null;
  }
}

/** Add one card to the library: PNG-first (definition + avatar in one pass), JSON fold where the hub serves
 *  card JSON; then stamp + remember. Every arm answers a toast. */
async function addToLibrary(result, raw) {
  let outcome = await addViaPng(result);
  if (outcome === null) {
    const card = await SOURCES[result.source].fetchCard(result, raw);
    if (card === null) {
      await host.ui.toast("error", `${SOURCES[result.source].label} wouldn't hand the card over — try again in a moment.`);
      return;
    }
    outcome = await host.character.ingest(card);
  }
  const { characterId, created } = outcome;
  if (!created) {
    await host.ui.toast("info", `${result.name} is already in your library (byte-identical — nothing was duplicated).`);
  } else {
    await host.ui.toast("success", `${result.name} is in your library.`);
  }
  // The PORTABLE stamp: this plugin's own reserved key on the card. Survives export→import; readable and
  // writable by card-atlas alone (the host stamps the namespace from the manifest slug — unforgeable).
  if (host.grants.includes("character.card_state")) {
    await host.character.setCardData(characterId, {
      source: SOURCES[result.source].label,
      ref: result.ref,
      importedAtMs: host.clock.nowEpochMs(),
    });
  }
  await host.storage.set(ownedKey(result), characterId);
}

// ── publishing (the page is a projection of the session) ───────────────────────────────────────────────────

async function publishBrowse(status) {
  const cache = await loadArtCache();
  const rows = session === null ? [] : session.pageRows;
  const owned = await Promise.all(rows.map((result) => host.storage.get(ownedKey(result))));
  await host.ui.setState("atlas_page", {
    stage: "browse",
    status,
    pageLabel: session === null || session.totalPages <= 1 ? "" : `Page ${session.page} of ${session.totalPages}`,
    tiles: rows.map((result, i) => {
      const cover = cachedArt(cache, artKey(result));
      return {
        id: `r${i}`,
        title: result.name,
        subtitle: result.downloadsN < 0 ? result.creator : `${result.creator} · ${result.downloadsLabel}`,
        ...(result.tags.length === 0 ? {} : { tags: result.tags }),
        ...(owned[i] === null ? {} : { badge: "in your library" }),
        ...(cover === undefined ? {} : { assetId: cover }),
      };
    }),
    detail: {},
  });
}

async function publishDetail(result, blurb) {
  const cache = await loadArtCache();
  const ownedId = await host.storage.get(ownedKey(result));
  // The hero: the sharper cached variant when one has landed, else the grid cover — so the decision surface
  // paints art INSTANTLY from cache and upgrades in place (the open continuation fetches the variant lazily).
  const art = cachedArt(cache, heroKey(result)) ?? cachedArt(cache, artKey(result)) ?? "";
  // The tags line comes from the NORMALIZED ROW (never the detail payload), so every hub answers uniformly —
  // "—" is the honest void where a hub publishes none (Character Tavern, probed 2026-08-29).
  const tagLine = result.tags.length === 0 ? "—" : result.tags.join(" · ").slice(0, DETAIL_TAGS_MAX_CHARS);
  await host.ui.setState("atlas_page", {
    stage: "card",
    status: "",
    pageLabel: "",
    tiles: [],
    detail: {
      name: result.name,
      creator: result.creator,
      source: SOURCES[result.source].label,
      downloads: result.downloadsLabel,
      tokens: result.tokens,
      tags: tagLine,
      blurb: blurb || "(this card ships no description)",
      owned: ownedId === null ? "" : "Already in your library — adding again just re-checks the bytes.",
      art,
    },
  });
}

// ── the page ───────────────────────────────────────────────────────────────────────────────────────────────
const canBrowse = host.grants.includes("ui.surface") && host.grants.includes("net.fetch") && host.grants.includes("storage.kv");
if (!canBrowse) {
  host.log.warn("card atlas is dormant: it needs ui.surface + net.fetch + storage.kv granted (Settings → Plugins)");
}

if (canBrowse) {
  host.ui.register({
    id: "atlas_page",
    anchor: "page",
    title: "Card Atlas",
    tier: "static",
    spec: {
      kind: "masterDetail",
      active: { $state: "stage" },
      stages: [
        {
          id: "browse",
          kind: "browse",
          title: "Find a character",
          body: {
            kind: "stack",
            gap: "block",
            children: [
              {
                kind: "searchBar",
                name: "q",
                label: "Search the community hubs",
                placeholder: "a name, a vibe, a fandom — or leave empty to browse",
                actionId: "search",
                // The tag filters are the searchBar's own long tail — disclosed, not stacked (the query and
                // the Hub/Sort pair keep the visible hierarchy). One comma-separated dialect, both fields.
                filtersLabel: "Tag filters",
                filters: [
                  { kind: "textField", name: "include_tags", label: "Include tags", placeholder: "fantasy, vampire — every one must match" },
                  { kind: "textField", name: "exclude_tags", label: "Exclude tags", placeholder: "horror, ai-art — any one hides a card" },
                ],
              },
              // The two subordinate controls, ALWAYS VISIBLE beside each other — a source switcher collapsed
              // under a disclosure under-served the primary browse decision. Both are LIVE (`actionId`):
              // picking a hub or a sort re-runs the search immediately, never sits inert behind Search.
              {
                kind: "row",
                gap: "field",
                children: [
                  {
                    kind: "select",
                    name: "source",
                    label: "Hub",
                    actionId: "search",
                    options: [
                      { value: "tavern", label: "Character Tavern" },
                      { value: "realm", label: "RisuRealm" },
                      { value: "chub", label: "Chub" },
                      { value: "wyvern", label: "Wyvern" },
                      { value: "aicc", label: "AI Character Cards" },
                      { value: "charavault", label: "CharaVault" },
                    ],
                    value: "tavern",
                  },
                  {
                    kind: "select",
                    name: "sort",
                    label: "Sort",
                    actionId: "search",
                    options: [
                      { value: "relevance", label: "Best match" },
                      { value: "downloads", label: "Most popular" },
                      { value: "name", label: "Name A–Z" },
                    ],
                    value: "relevance",
                  },
                ],
              },
              { kind: "text", voice: "gloss", value: { $state: "status" } },
              {
                kind: "grid",
                tilesFrom: { $state: "tiles" },
                tileAction: "open_result",
                aspect: "portrait",
                empty: "Search to begin — the atlas covers six community hubs.",
              },
              // The pager — one control for every hub, whatever shape the provider pages in (see the
              // header's paging note). Structural (the vocabulary has no conditional visibility), so the
              // handlers answer honestly at the edges instead of the buttons hiding.
              {
                kind: "row",
                gap: "field",
                children: [
                  { kind: "button", actionId: "prev_page", label: "Previous", variant: "outline" },
                  { kind: "text", voice: "gloss", value: { $state: "pageLabel" } },
                  { kind: "button", actionId: "next_page", label: "Next", variant: "outline" },
                ],
              },
            ],
          },
        },
        {
          id: "card",
          kind: "detail",
          title: { $state: "detail.name" },
          // The hero: bound to whatever cover the art plane has landed for the open card — the moment a
          // person decides deserves the art. An empty path paints nothing (never a broken frame).
          hero: { assetFrom: { $state: "detail.art" }, alt: "Card cover art" },
          body: {
            kind: "stack",
            gap: "block",
            children: [
              // The DECISION CLUSTER sits above the fold: provenance, tags, the owned line, the two actions —
              // then the reading material below them at reading width.
              {
                kind: "keyValue",
                rows: [
                  { key: "Creator", value: { $state: "detail.creator" } },
                  { key: "From", value: { $state: "detail.source" } },
                  { key: "Popularity", value: { $state: "detail.downloads" } },
                  { key: "Tokens", value: { $state: "detail.tokens" } },
                  { key: "Tags", value: { $state: "detail.tags" } },
                ],
              },
              { kind: "text", voice: "gloss", value: { $state: "detail.owned" } },
              {
                kind: "row",
                gap: "field",
                children: [
                  { kind: "button", actionId: "back", label: "Back to results", variant: "outline" },
                  { kind: "button", actionId: "add_to_library", label: "Add to library", variant: "neutral" },
                ],
              },
              { kind: "markdown", value: { $state: "detail.blurb" } },
            ],
          },
        },
      ],
    },
    onAction: async (a) => {
      try {
        await runAtlasAction(a.actionId, a.values);
      } catch (err) {
        // The router's belt: anything a source helper did not fold (they fold their own fetches) lands here
        // as a log + a toast, never a crash strike.
        host.log.warn(`atlas action failed: ${String(err)}`);
        await host.ui.toast("error", "That didn't take — see the plugin log.");
      }
    },
  });

  // Publish the browse stage ONCE at activation so the page renders on first open (a bound spec is withheld
  // until state lands; an empty atlas is a publishable, teaching state).
  void publishBrowse("").catch((err) => host.log.warn(`atlas publish failed: ${String(err)}`));
}

/** The sort the person picked, applied to the NORMALIZED rows — one dialect for every hub (a hub with a real
 *  server sort also passes it upstream in its own `search`, e.g. chub's `star_count`; this pass keeps the
 *  page order consistent regardless). Held-set hubs sort the WHOLE set (so paging respects it); server-paged
 *  hubs sort the page in hand. */
function sortRows(rows, key) {
  if (key === "downloads") {
    return [...rows].sort((a, b) => b.downloadsN - a.downloadsN);
  }
  if (key === "name") {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }
  return rows; // relevance = the hub's own order.
}

/** `search`: validate, speak, SCHEDULE — the wire work floats (see the continuations' header). The handler
 *  settles in milliseconds no matter how a hub behaves. An EMPTY query browses the hub's whole catalog
 *  (that is a real thing to want — page through what's out there), so nothing blocks on typing. Fired by the
 *  Search button, Enter in the query box, AND the live Hub/Sort selects. */
async function searchAction(values) {
  const q = String(values.q ?? "").trim();
  const sourceKey = typeof values.source === "string" && values.source in SOURCES ? values.source : "tavern";
  const sortKey = values.sort === "downloads" || values.sort === "name" ? values.sort : "relevance";
  const include = parseTagList(values.include_tags);
  const exclude = parseTagList(values.exclude_tags);
  const label = SOURCES[sourceKey].label;
  const seq = ++sessionSeq;
  // Feedback BEFORE the wire (the vocabulary has no loading skeleton yet): the status line speaks, the
  // previous results stay put — content-preserving, never a blank flash.
  await publishBrowse(q.length === 0 ? `Browsing ${label}…` : `Searching ${label} for "${q}"…`);
  void runSearch(seq, { sourceKey, sortKey, q, include, exclude }).catch((err) => host.log.warn(`search failed: ${String(err)}`));
}

/** `prev_page`/`next_page`: page the EXECUTED search (the session), never a half-edited form. Edge clicks
 *  answer in the status line — the pager is structural, so honesty lives in the handler. */
async function pageAction(delta) {
  if (session === null) {
    await publishBrowse("Search first — then page through the results.");
    return;
  }
  const target = session.page + delta;
  if (target < 1) {
    await publishBrowse("Already on the first page.");
    return;
  }
  if (target > session.totalPages) {
    await publishBrowse("That's the last page.");
    return;
  }
  session.page = target;
  const seq = ++sessionSeq;
  await publishBrowse(`Fetching page ${target}…`);
  void runPage(seq).catch((err) => host.log.warn(`page failed: ${String(err)}`));
}

/** `open_result`: resolve the clicked tile against the resident session, speak, SCHEDULE the detail fetch. */
async function openAction(values) {
  const index = Number(String(values.tile ?? "").slice(1));
  const result = session === null ? undefined : session.pageRows[index];
  if (result === undefined) {
    await publishBrowse("That result went stale — search again."); // A respawn between search and click.
    return;
  }
  const seq = ++sessionSeq;
  await publishBrowse(`Opening ${result.name}…`);
  void runOpen(seq, result).catch((err) => host.log.warn(`open failed: ${String(err)}`));
}

/** `add_to_library`: the canon write, feature-detected at USE, then the detail republished with its owned
 *  line. */
async function addAction() {
  if (openResult === null) {
    await publishBrowse("");
    return;
  }
  if (!host.grants.includes("character.ingest")) {
    await host.ui.toast("warn", "Adding to your library needs the character.ingest capability granted (Settings → Plugins).");
    return;
  }
  await addToLibrary(openResult.result, openResult.raw);
  // Republish from the SESSION's own copy of the blurb rather than re-fetching the detail: the add arm
  // already spends up to one slow fetch, and the settlement wall prices a second one out of the invocation.
  await publishDetail(openResult.result, openResult.blurb);
}

/** The action router — one verb per affordance, dispatched by id; `back` (and any unknown id) goes home. */
async function runAtlasAction(actionId, values) {
  if (actionId === "search") {
    await searchAction(values);
  } else if (actionId === "prev_page") {
    await pageAction(-1);
  } else if (actionId === "next_page") {
    await pageAction(1);
  } else if (actionId === "open_result") {
    await openAction(values);
  } else if (actionId === "add_to_library") {
    await addAction();
  } else {
    // `back` (and any unknown id) goes home — and BUMPS the session sequence, so an in-flight open/search
    // continuation from the stage a person just left can never flip them back to it.
    sessionSeq += 1;
    openResult = null;
    await publishBrowse(session === null ? "" : pageStatus(SOURCES[session.sourceKey], session.q));
  }
}

host.log.info(`card atlas ready — ${Object.keys(SOURCES).length} hubs on the shelf (grants: ${host.grants.join(", ") || "none"})`);
