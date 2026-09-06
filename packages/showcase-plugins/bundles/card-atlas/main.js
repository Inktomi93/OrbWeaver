// Card Atlas — the HUB-BROWSER flagship: the biggest seeded example, and the template for a real product-
// sized plugin. Search NINE community card hubs, browse REAL cover art page by page, sort by each hub's OWN
// sort menu, filter by tags and content rating, read a card's full stat sheet on a proper detail page, and
// ADD it to your own library — search → art grid → sort/filter → page → preview → import, entirely inside
// the app.
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
//    declaring its own capability facts (`paging`, `rowTags`, `serverInclude`, `serverExclude`, `headers`,
//    `sortOptions`) — the session, the pager, the filters, the Sort menu and the status line adapt to those
//    FACTS and never special-case a hub by name. Adding a hub is: one object here + its hosts in the
//    manifest's `netHosts` (each host is a consent line; widened reach lands the upgrade disabled pending
//    re-consent, by design).
//
//  * SORTS AND STATS ARE MINED, NOT WISHED FOR. Every hub's sort menu is exactly the set of orderings it
//    provably honors (each probed live 2026-08-29 — chub needs `asc=false` or its sort silently no-ops;
//    botbooru's legacy "curated" sorts are dead; realm's data route DOES honor `sort=`), plus the
//    page-side orderings the rows themselves can answer (name, and a counter the hub returns per row but
//    won't sort by). The Sort select's OPTIONS ARE DATA (`optionsFrom` — the hub-v1.3 bound-select arm):
//    picking a hub republishes ITS menu, so the select never advertises an ordering the hub cannot answer.
//    Same law for the stat sheet: `n` on every normalized row holds exactly the counters the hub returned
//    (downloads/stars/likes/favorites/views/chats/messages/comments/rating/tokens/created/updated — each
//    hub a different subset), and the detail's keyValue is BOUND (`rowsFrom`) so it shows real numbers
//    only, never a page of "—".
//
//  * THE SFW FILTER IS A PER-PERSON CONFIG, HONESTLY PLUMBED. Default OFF = show everything (the owner's
//    posture: no gate, no blur); ON = filter server-side where a hub speaks a rating param (chub `nsfw`,
//    realm `nsfw`, botbooru `sfw_only`) and row-side where it only flags rows. Flagged rows wear an `nsfw`
//    chip and a Content stat row either way — filtering and labeling are separate honesty. The setting
//    persists in kv and SEEDS THE NEXT REGISTRATION: activation registers the default synchronously (the
//    page must exist the moment activation returns), then a floated boot continuation reads kv and
//    RE-registers when the remembered value differs (`ui.register` upserts by surface id) — so the switch
//    shows the truth after a respawn instead of quietly resetting.
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
//    (Character Tavern, Chub, AI Character Cards, CharaVault, Wyvern, BotBooru, Pygmalion, Datacat) vs ONE
//    whole result set (RisuRealm: ~60 rows; its route 500s on any page > 1, probed 2026-08-29) — and the
//    person gets ONE page control anyway: the session holds the provider-shaped truth (`pageRows` vs the
//    whole held set) and Previous/Next resolve against it. Normalize the CONTROL, not the provider.
//
//  * A HUB'S AUTH QUIRK IS ADAPTER DATA. Datacat's API wants an anonymous session token (one POST mint,
//    cached in kv, re-minted once on a 401/403); Pygmalion's connect-RPC wants a POST with a JSON message.
//    Both ride the same `host.net.fetch` the GET hubs use — the manifest allowlist and the SSRF wall do
//    not move for a verb or a header.
//
//  * FILTERS THAT ARE HONEST ABOUT CAPABILITY. The hubs speak one tag vocabulary (genre words ARE tags
//    everywhere), but each publishes it differently: Chub filters include AND exclude server-side; Character
//    Tavern filters includes server-side while projecting no tags into its rows; most of the rest carry row
//    tags the plugin filters per page; Pygmalion and Datacat publish no usable tags at all (pyg's include
//    param returns empty for common words and its rows carry none — probed 2026-08-29). So filters apply
//    where the hub can answer, and the status line SAYS SO when one can't rather than silently no-opping.
//    A filter that pretends is worse than a filter that explains.
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
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  // biome-ignore lint/style/useNamingConvention: HTTP header names are wire tokens, not our identifiers.
  Accept: "application/json",
};

/** BotBooru's browse JSON gates on this XHR header (without it the route returns the SPA HTML shell — the
 *  legacy adapter's probe, re-verified live 2026-08-29). Tuple-built: header names are wire tokens. */
const BOTBOORU_XHR_HEADERS = Object.fromEntries([
  ["X-Requested-With", "XMLHttpRequest"],
  ["Accept", "application/json"],
]);

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

// ── the SFW config (a per-person setting, not a per-search whim) ───────────────────────────────────────────
/** kv key holding "on"/"off" — the SFW filter's persisted state. Read at activation to SEED the toggle's
 *  registered value (the floated boot continuation), written whenever a search flips it. Default absent =
 *  OFF = show everything (the owner's no-gate posture, #800). */
const SFW_KEY = "sfw_mode";
/** The last SFW value this resident wrote — saves a kv write per search when nothing changed. */
let lastSfwWritten = null;

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

/** Fetch a JSON document (GET by default; an `init` carries per-source headers where a hub bot-filters a
 *  bare UA, or the POST body a connect-RPC hub wants). `null` for EVERY failure shape — non-2xx, a body
 *  that is not JSON, the host's own refusals (off-allowlist, the hourly egress floor, the 5 s deadline, the
 *  byte cap). The CALLER folds the failure into the status line; nothing here ever throws into a handler. */
async function getJson(url, init) {
  try {
    const res = await host.net.fetch(url, init);
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

/** POST a JSON body (the connect-RPC / token-mint dialect) — the same failure fold as {@link getJson}. */
function postJson(url, body, headers) {
  return getJson(url, {
    method: "POST",
    // biome-ignore lint/style/useNamingConvention: an HTTP header name is a wire token.
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
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

/** A finite number, else `undefined` — the stat bag's "unknowable" (never -1 sentinels inside `n`). */
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** A content-rating tri-state: an explicit yes wins, an explicit no follows, silence stays `undefined`
 *  (the hub doesn't say — no Content row, no chip, and the SFW filter has nothing to judge). */
function triState(isTrue, isFalse) {
  if (isTrue) {
    return true;
  }
  return isFalse ? false : undefined;
}

/** A count that may arrive numeric or compact-string ("26.9k") → number, `undefined` unknowable. */
function cnt(v) {
  const parsed = parseCount(v);
  return parsed < 0 ? undefined : parsed;
}

/** Below this a numeric date is epoch-SECONDS (pygmalion's dialect), above it epoch-ms — the boundary is
 *  ~5138 AD in seconds and ~1973 in ms, so no real card date is ambiguous. */
const EPOCH_SECONDS_CEILING_MS = 100_000_000_000;

// ── the date engine (pure arithmetic — the sandbox has NO `Date`) ─────────────────────────────────────────
// The realm replaces `Date` / `Date.parse` / `Date.UTC` with THROWING stubs (the determinism law: a guest's
// only clock is `host.clock`), so a hub's ISO stamp has to be parsed here by hand. v1.3.1 called `Date.parse`
// for every ISO string — every hub whose rows carry one (chub, wyvern, aicc, botbooru, datacat) threw inside
// the floated search continuation, the `.catch` logged it, and the page sat on "Searching…" forever
// (#805). The grammar below is exactly the wire shapes the hubs send (receipts 2026-08-30):
// `YYYY-MM-DD[Tt ]HH:MM[:SS[.frac]][Z|±HH[:]MM]` and the bare `YYYY-MM-DD`; a missing zone reads as UTC
// (botbooru's naive stamps — the value feeds a YYYY-MM-DD display and a sort order, where hours of offset
// are immaterial); the fraction truncates to milliseconds. Anything else is the ABSENT datum (`undefined`,
// never a throw): a hub's format drift degrades one sort datum, never a search. Civil-date arithmetic is
// Howard Hinnant's days-from-civil / civil-from-days (proleptic Gregorian, 400-year eras).
const ISO_STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|z|[+-]\d{2}:?\d{2})?$/;
const MONTHS_PER_YEAR = 12;
const FEBRUARY = 2;
const MARCH = 3;
const MONTHS_AFTER_MARCH_WRAP = 10; // month-from-March indices 0..9 are Mar..Dec; 10, 11 wrap to Jan, Feb
const YEARS_PER_ERA = 400;
const DAYS_PER_ERA = 146_097;
const DAYS_PER_ERA_LESS_ONE = 146_096;
const DAYS_PER_CENTURY = 36_524;
const DAYS_PER_LEAP_CYCLE = 1460;
const LEAP_CYCLE_YEARS = 4;
const CENTURY_YEARS = 100;
const DAYS_PER_YEAR = 365;
const CIVIL_EPOCH_SHIFT = 719_468; // days from 0000-03-01 to 1970-01-01
const DAYS_PER_5_MONTHS = 153; // Hinnant's five-month cycle: every run of 5 months from March holds 153 days
const MONTHS_PER_CYCLE = 5;
const CYCLE_ROUNDING = 2;
const MS_PER_SECOND = THOUSAND;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MS_FRACTION_DIGITS = 3;
const ZONE_HOUR_DIGITS = 2;
const YEAR_DIGITS = 4;
const TWO_DIGITS = 2;
const LONG_MONTH_DAYS = 31;
const SHORT_MONTH_DAYS = 30;
const FEBRUARY_DAYS = 28; // +1 in a leap year (isLeapYear)
const DAYS_IN_MONTH = [
  LONG_MONTH_DAYS,
  FEBRUARY_DAYS,
  LONG_MONTH_DAYS,
  SHORT_MONTH_DAYS,
  LONG_MONTH_DAYS,
  SHORT_MONTH_DAYS,
  LONG_MONTH_DAYS,
  LONG_MONTH_DAYS,
  SHORT_MONTH_DAYS,
  LONG_MONTH_DAYS,
  SHORT_MONTH_DAYS,
  LONG_MONTH_DAYS,
];

/** Proleptic-Gregorian leap year. */
function isLeapYear(year) {
  return year % LEAP_CYCLE_YEARS === 0 && (year % CENTURY_YEARS !== 0 || year % YEARS_PER_ERA === 0);
}

/** Does `year-month-day` name a real civil date? (month 13, February 30 do not.) */
function isCivilDate(year, month, day) {
  if (month < 1 || month > MONTHS_PER_YEAR) {
    return false;
  }
  const monthDays = DAYS_IN_MONTH[month - 1] + (month === FEBRUARY && isLeapYear(year) ? 1 : 0);
  return day >= 1 && day <= monthDays;
}

/** Days since 1970-01-01 for a civil date (Hinnant's days_from_civil; the caller validated the date). */
function daysFromCivil(year, month, day) {
  const y = month <= FEBRUARY ? year - 1 : year;
  const era = Math.floor(y / YEARS_PER_ERA);
  const yoe = y - era * YEARS_PER_ERA;
  const mp = month > FEBRUARY ? month - MARCH : month + MONTHS_PER_YEAR - MARCH;
  const doy = Math.floor((DAYS_PER_5_MONTHS * mp + CYCLE_ROUNDING) / MONTHS_PER_CYCLE) + day - 1;
  const doe = yoe * DAYS_PER_YEAR + Math.floor(yoe / LEAP_CYCLE_YEARS) - Math.floor(yoe / CENTURY_YEARS) + doy;
  return era * DAYS_PER_ERA + doe - CIVIL_EPOCH_SHIFT;
}

/** The civil date for a day count since 1970-01-01 (Hinnant's civil_from_days). */
function civilFromDays(days) {
  const z = days + CIVIL_EPOCH_SHIFT;
  const era = Math.floor(z / DAYS_PER_ERA);
  const doe = z - era * DAYS_PER_ERA;
  const yoe = Math.floor(
    (doe - Math.floor(doe / DAYS_PER_LEAP_CYCLE) + Math.floor(doe / DAYS_PER_CENTURY) - Math.floor(doe / DAYS_PER_ERA_LESS_ONE)) / DAYS_PER_YEAR,
  );
  const doy = doe - (DAYS_PER_YEAR * yoe + Math.floor(yoe / LEAP_CYCLE_YEARS) - Math.floor(yoe / CENTURY_YEARS));
  const mp = Math.floor((MONTHS_PER_CYCLE * doy + CYCLE_ROUNDING) / DAYS_PER_5_MONTHS);
  const day = doy - Math.floor((DAYS_PER_5_MONTHS * mp + CYCLE_ROUNDING) / MONTHS_PER_CYCLE) + 1;
  const month = mp < MONTHS_AFTER_MARCH_WRAP ? mp + MARCH : mp - MONTHS_AFTER_MARCH_WRAP + 1;
  const year = yoe + era * YEARS_PER_ERA + (month <= FEBRUARY ? 1 : 0);
  return { year, month, day };
}

/** A stamp's zone suffix → the offset to SUBTRACT, ms (`Z`/absent = 0); `undefined` for an impossible offset. */
function zoneOffsetMs(zone) {
  if (zone === undefined || zone === "Z" || zone === "z") {
    return 0;
  }
  const sign = zone.startsWith("-") ? -1 : 1;
  const digits = zone.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, ZONE_HOUR_DIGITS));
  const minutes = Number(digits.slice(ZONE_HOUR_DIGITS));
  if (hours >= HOURS_PER_DAY || minutes >= MINUTES_PER_HOUR) {
    return;
  }
  return sign * (hours * MS_PER_HOUR + minutes * MS_PER_MINUTE);
}

/** The time-of-day groups of a stamp → ms past midnight; `undefined` for an impossible clock reading. */
function timeOfDayMs(hourText, minuteText, secondText, fractionText) {
  const hour = hourText === undefined ? 0 : Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (hour >= HOURS_PER_DAY || minute >= MINUTES_PER_HOUR || second >= MINUTES_PER_HOUR) {
    return;
  }
  const fraction = fractionText === undefined ? 0 : Number(fractionText.slice(0, MS_FRACTION_DIGITS).padEnd(MS_FRACTION_DIGITS, "0"));
  return hour * MS_PER_HOUR + minute * MS_PER_MINUTE + second * MS_PER_SECOND + fraction;
}

/** An ISO-shaped stamp (see the grammar above) → epoch ms, `undefined` when it does not parse or names a
 *  date/time/offset that does not exist (month 13, February 30, hour 24, zone +25:00). */
function parseIsoStamp(text) {
  const m = ISO_STAMP_RE.exec(text);
  if (m === null) {
    return;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isCivilDate(year, month, day)) {
    return;
  }
  const clock = timeOfDayMs(m[4], m[5], m[6], m[7]);
  const offset = zoneOffsetMs(m[8]);
  if (clock === undefined || offset === undefined) {
    return;
  }
  return daysFromCivil(year, month, day) * MS_PER_DAY + clock - offset;
}

/** An ISO string / epoch-seconds / epoch-ms date → epoch ms, `undefined` when absent/unparseable. */
function epochMs(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v > EPOCH_SECONDS_CEILING_MS ? Math.round(v) : Math.round(v * THOUSAND);
  }
  if (typeof v !== "string" || v.length === 0) {
    return;
  }
  if (/^\d+$/.test(v)) {
    return epochMs(Number(v));
  }
  return parseIsoStamp(v);
}

/** Epoch ms → the date the stat sheet shows (YYYY-MM-DD — a card's age, not a timestamp), in UTC. */
function fmtDate(ms) {
  const { year, month, day } = civilFromDays(Math.floor(ms / MS_PER_DAY));
  return `${String(year).padStart(YEAR_DIGITS, "0")}-${String(month).padStart(TWO_DIGITS, "0")}-${String(day).padStart(TWO_DIGITS, "0")}`;
}

// ── the sort vocabulary (per-hub MENUS over one comparator dialect) ────────────────────────────────────────
/** Every sort key's display label — ONE dialect, so "Most viewed" reads identically on every hub that can
 *  answer it. A hub's menu is a SUBSET (its `sortOptions`), assembled by {@link sortOpts}. */
const SORT_LABELS = {
  relevance: "Hub default",
  trending: "Trending",
  downloads: "Most downloaded",
  stars: "Most stars",
  likes: "Most liked",
  favorites: "Most favorited",
  views: "Most viewed",
  chats: "Most chats",
  rating: "Top rated",
  newest: "Newest",
  oldest: "Oldest",
  updated: "Recently updated",
  name: "Name A–Z",
};

/** Build one hub's sort menu from its honored keys (+ per-hub label overrides — a hub whose default order
 *  IS newest says so on the first entry instead of pretending "Hub default" is a distinct mode). */
function sortOpts(keys, overrides) {
  return keys.map((key) => ({ value: key, label: overrides?.[key] || SORT_LABELS[key] }));
}

/** Which normalized-row stat field each sort key reads (page-side / held-set-side ordering). `relevance`
 *  and `trending` are absent on purpose: they are PROVIDER orderings with no per-row datum to re-derive. */
const SORT_FIELD = {
  downloads: "downloads",
  stars: "stars",
  likes: "likes",
  favorites: "favorites",
  views: "views",
  chats: "chats",
  rating: "rating",
  newest: "created",
  oldest: "created",
  updated: "updated",
};

/** The stat sheet's row order + formatters — ONE list, so every hub's detail reads in the same order and
 *  dialect, showing ONLY the stats its rows actually carried (the `rowsFrom` honesty: no page of "—"). */
const STAT_ROWS = [
  ["downloads", "Downloads", fmtCount],
  ["stars", "Stars", fmtCount],
  ["likes", "Likes", fmtCount],
  ["favorites", "Favorites", fmtCount],
  ["views", "Views", fmtCount],
  ["chats", "Chats", fmtCount],
  ["messages", "Messages", fmtCount],
  ["comments", "Comments", fmtCount],
  ["rating", "Rating", (v) => `${Math.round(v * 10) / 10} / 5`],
  ["tokens", "Tokens", (v) => String(v)],
  ["created", "Created", fmtDate],
  ["updated", "Updated", fmtDate],
];

/** One row's display stat rows — the detail keyValue's bound data, plus the Content row where the hub
 *  flags content at all (true/false = a real answer; undefined = the hub doesn't say, so no row). */
function statRows(row) {
  const rows = [];
  for (const [field, label, fmt] of STAT_ROWS) {
    const value = row.n[field];
    if (value !== undefined) {
      rows.push({ key: label, value: fmt(value) });
    }
  }
  if (row.nsfw !== undefined) {
    rows.push({ key: "Content", value: row.nsfw ? "NSFW" : "SFW" });
  }
  return rows;
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
// `search({ q, include, exclude, sortKey, page, sfw })` → `{ rows, totalPages }` of NORMALIZED rows
// `{source, ref, name, creator, pop, n, nsfw, tagline, art, tags}` — `pop` is the tile's one popularity
// label (each hub's best live signal: ↓ downloads, ★ stars, ♥ likes, chats; "" when it has none); `n` is
// the MINED STAT BAG (downloads/stars/likes/favorites/views/chats/messages/comments/rating/tokens/created/
// updated — plain numbers, ABSENT = the hub doesn't say; it feeds both the sort comparators and the
// detail's stat sheet); `nsfw` is a tri-state content flag (true/false = the hub answered, undefined = it
// doesn't say); `art` = the cover's remote URL ("" when none); `tags` normalized via `normTags` — genre
// words ARE tags on every hub. The CAPABILITY FACTS drive everything downstream: `paging` ("server" = real
// pages; "held-set" = one whole response the session slices), `rowTags` (rows carry tags ⇒ chips render
// and row-side filters can judge), `serverInclude`/`serverExclude` (the hub filters that side corpus-wide —
// row-side does not re-judge it), `headers` (the bot-filter workaround, per-source data), `sortOptions`
// (the hub's OWN honored orderings — published as the Sort select's bound vocabulary). `detail(result)` →
// the display fields + the raw payload; `cardPngUrl` → the card-as-PNG download the PNG-first import rides
// (null = the hub serves none); `fetchCard` → the JSON fold (null = PNG is this hub's only card format).

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
/** BotBooru serves browse + art + card downloads from one apex (its browse JSON gates on an XHR header). */
const BOTBOORU_BASE = "https://botbooru.com";
/** Pygmalion's public connect-RPC service (POST + JSON message; art rides assets.pygmalion.chat). */
const PYG_API = "https://server.pygmalion.chat/galatea.v1.PublicCharacterService";
/** Datacat (the working JanitorAI mirror): REST API behind an anonymous session token. */
const DATACAT_BASE = "https://datacat.run";
/** Datacat's legacy avatar CDN (JanitorAI's own) — the fallback where a row carries no variant URLs. */
const DATACAT_AVATAR_BASE = "https://ella.janitorai.com/bot-avatars/";

/** A `author/slug`-style path, segment-encoded for a URL (slashes survive). */
const encPath = (p) =>
  p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

/** ONE Tavern hit → the normalized row. NSFW is a per-row FLAG here (the search API has no rating param) —
 *  kept and labeled; the SFW config drops it row-side when ON. */
function tavernRow(hit) {
  if (!isObj(hit)) {
    return null;
  }
  const ref = str(hit.path);
  const name = str(hit.name);
  if (ref === undefined || name === undefined) {
    return null; // A malformed row is dropped, never fatal — one bad hit must not blank the page.
  }
  const downloads = cnt(hit.downloads);
  return {
    source: "tavern",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(hit.author) ?? "unknown",
    pop: downloads === undefined ? "" : `${fmtCount(downloads)}↓`,
    n: { downloads, likes: num(hit.likes), messages: num(hit.messages), tokens: num(hit.totalTokens) },
    nsfw: hit.isNSFW === true,
    tagline: str(hit.tagline) ?? "",
    // The grid cover: the CDN's 320-wide variant (~85 KB) — a tile never needs the full card file.
    art: `${TAVERN_CDN}/${encPath(ref)}.png?width=320&quality=85&format=auto`,
    tags: [], // Tavern projects NO tags into any public JSON surface (probed 2026-08-29).
  };
}

/** ONE realm card → the normalized row (tags present on ~half the rows; the server's nsfw param filters, so
 *  a row that arrives does not self-identify — `nsfw` stays undefined). */
function realmRow(card) {
  if (!isObj(card)) {
    return null;
  }
  const ref = str(card.id);
  const name = str(card.name);
  if (ref === undefined || name === undefined) {
    return null;
  }
  const downloads = cnt(card.download);
  const img = str(card.img);
  return {
    source: "realm",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(card.authorname) ?? "unknown",
    pop: downloads === undefined ? "" : `${fmtCount(downloads)}↓`,
    // NO `created` here: realm's `date` field is not a recognizable epoch (a live drive rendered 1970
    // dates from it) — an unverifiable datum stays OFF the sheet rather than showing nonsense.
    n: { downloads },
    nsfw: undefined,
    tagline: "",
    // The cover by content hash on realm's resource CDN — full-size already, so it doubles as the hero.
    art: img === undefined ? "" : `${REALM_CDN}/resource/${encodeURIComponent(img)}`,
    tags: normTags(card.tags),
  };
}

/** ONE chub node → the normalized row. Chub's live popularity signal is `starCount` (its `nDownloads` comes
 *  back null on today's wire — probed 2026-08-29), so stars fill the popularity slot with an honest ★ label;
 *  the row also carries favorites/rating/chats/messages/dates — the fullest stat sheet in the roster. */
function chubRow(node) {
  if (!isObj(node)) {
    return null;
  }
  const ref = str(node.fullPath);
  const name = str(node.name);
  if (ref === undefined || name === undefined) {
    return null;
  }
  const stars = num(node.starCount);
  const ratingCount = num(node.ratingCount) ?? 0;
  return {
    source: "chub",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: ref.includes("/") ? ref.split("/")[0] : "unknown",
    pop: stars === undefined ? "" : `${fmtCount(stars)}★`,
    n: {
      stars,
      favorites: num(node.n_favorites),
      rating: ratingCount > 0 ? num(node.rating) : undefined, // 0-vote rating is "unrated", not "0 / 5".
      chats: num(node.nChats),
      messages: num(node.nMessages),
      tokens: num(node.nTokens),
      created: epochMs(node.createdAt),
      updated: epochMs(node.lastActivityAt),
    },
    nsfw: node.nsfw_image === true,
    tagline: str(node.tagline) ?? "",
    // Prefer the row's OWN avatar_url when it lives on the allowlisted CDN — the constructed path 404s
    // for a minority of cards (live-drive finding); fall back to the constructed spelling otherwise.
    art: str(node.avatar_url)?.startsWith(`${CHUB_CDN}/`) === true ? node.avatar_url : `${CHUB_CDN}/avatars/${encPath(ref)}/avatar.webp`,
    tags: normTags(node.topics),
  };
}

const WYVERN_NSFW_RATINGS = ["nsfw", "nsfl", "explicit", "adult", "mature", "x"];
const WYVERN_SFW_RATINGS = ["sfw", "safe", "everyone", "pg", "teen"];

/** ONE wyvern result → the normalized row. Its rating is a free string ("none" on most of the public
 *  approved feed ⇒ undefined — the hub doesn't say); the per-view statistics rows are minted fresh on read
 *  (probed: views=1 on an old card), so only tokens/likes/dates/messages are trusted onto the sheet. */
function wyvernRow(node) {
  if (!isObj(node)) {
    return null;
  }
  const ref = str(node.id);
  const name = str(node.name);
  if (ref === undefined || name === undefined) {
    return null;
  }
  const rating = typeof node.rating === "string" ? node.rating.toLowerCase() : "";
  const nsfw = triState(WYVERN_NSFW_RATINGS.includes(rating), WYVERN_SFW_RATINGS.includes(rating));
  const likes = num(node.likes);
  const stats = isObj(node.entity_statistics) ? node.entity_statistics : {};
  return {
    source: "wyvern",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: (isObj(node.creator) ? str(node.creator.displayName) : undefined) ?? "unknown",
    pop: likes === undefined || likes === 0 ? "" : `${fmtCount(likes)}♥`,
    n: { likes, messages: num(stats.total_messages), tokens: num(node.token_count), created: epochMs(node.created_at), updated: epochMs(node.updated_at) },
    nsfw,
    tagline: str(node.tagline) ?? "",
    art: str(node.avatar) ?? "", // A full Cloudflare-Images URL on the allowlisted imagedelivery.net apex.
    tags: normTags(node.tags ?? node.community_tags),
  };
}

/** ONE AICC card → the normalized row (tags arrive as `[{id, name}]` — the names are the vocabulary). */
function aiccRow(card) {
  if (!isObj(card)) {
    return null;
  }
  const name = str(card.title);
  if (typeof card.id !== "number" || name === undefined) {
    return null;
  }
  const downloads = cnt(card.downloadCount);
  const ratingCount = num(card.ratingCount) ?? 0;
  const image = str(card.imageUrl);
  return {
    source: "aicc",
    ref: String(card.id),
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(card.author) ?? "unknown",
    pop: downloads === undefined ? "" : `${fmtCount(downloads)}↓`,
    n: {
      downloads,
      rating: ratingCount > 0 ? num(card.ratingAvg) : undefined,
      tokens: num(card.tokenCount),
      created: epochMs(card.createdAt),
    },
    nsfw: card.isNsfw === true,
    tagline: str(card.excerpt) ?? "",
    art: image === undefined ? "" : `${AICC_BASE}${image.startsWith("/") ? "" : "/"}${image}`,
    tags: normTags(Array.isArray(card.tags) ? card.tags.map((t) => (isObj(t) ? t.name : undefined)) : []),
  };
}

/** ONE CharaVault result → the normalized row. Its cover IS the card PNG (no separate art endpoint) — heavy
 *  but honest; the host's asset cap folds an outsized one to the placeholder. */
function charavaultRow(row) {
  if (!isObj(row)) {
    return null;
  }
  const folder = str(row.folder);
  const file = str(row.file);
  const name = str(row.name);
  if (folder === undefined || file === undefined || name === undefined) {
    return null;
  }
  const ref = `${folder}/${file}`;
  const ratingCount = num(row.rating_count) ?? 0;
  return {
    source: "charavault",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(row.creator) ?? "unknown",
    pop: "", // no download/star counter on a row.
    n: { rating: ratingCount > 0 ? num(row.avg_rating) : undefined, comments: num(row.comment_count), tokens: num(row.token_count) },
    nsfw: row.nsfw === true,
    tagline: str(row.description_preview) ?? "",
    art: `${CHARAVAULT_BASE}/api/cards/download/${encPath(ref)}`,
    tags: normTags(row.tags),
  };
}

/** ONE BotBooru post → the normalized row. The rating derives from its Meta tags (sfw/nsfw/nsfl — the booru
 *  taxonomy); "Auto" category tags (origin_chub, tagme…) are machine housekeeping and stay off the chip row;
 *  the cover IS the card PNG (`/images/<filename>` — no thumbnail variant exists, probed 2026-08-29). */
function botbooruRow(post) {
  if (!isObj(post)) {
    return null;
  }
  if (typeof post.id !== "number") {
    return null;
  }
  const ref = String(post.id);
  const name = str(post.character_name) ?? str(post.meta_name) ?? ref;
  const rawTags = Array.isArray(post.tags) ? post.tags.filter(isObj) : [];
  const tagNames = rawTags.map((t) => (typeof t.name === "string" ? t.name.toLowerCase() : ""));
  const nsfw = triState(
    tagNames.some((t) => t === "nsfw" || t === "nsfl" || t === "explicit"),
    tagNames.some((t) => t === "sfw" || t === "safe"),
  );
  const downloads = num(post.downloads);
  const filename = str(post.filename);
  return {
    source: "botbooru",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: "unknown", // BotBooru exposes only a numeric uploader_id, never a creator name.
    pop: downloads === undefined ? "" : `${fmtCount(downloads)}↓`,
    n: {
      downloads,
      favorites: num(post.favorite_count),
      views: num(post.views),
      comments: num(post.comments_count),
      tokens: num(post.token_count),
      created: epochMs(post.created_at),
    },
    nsfw,
    tagline: str(post.tagline) ?? "",
    art: filename === undefined ? `${BOTBOORU_BASE}/download/png/${encodeURIComponent(ref)}` : `${BOTBOORU_BASE}/images/${encodeURIComponent(filename)}`,
    tags: normTags(rawTags.filter((t) => t.category !== "Auto").map((t) => t.name)),
  };
}

/** ONE Pygmalion character → the normalized row. The public API serves the SFW-curated catalog only
 *  (`includeSensitive` is auth-gated), so every row is honestly SFW; dates arrive as epoch-second strings. */
function pygmalionRow(c) {
  if (!isObj(c)) {
    return null;
  }
  const ref = str(c.id);
  const name = str(c.displayName);
  if (ref === undefined || name === undefined) {
    return null;
  }
  const downloads = num(c.downloads);
  return {
    source: "pygmalion",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: (isObj(c.owner) ? str(c.owner.displayName) : undefined) ?? "unknown",
    pop: downloads === undefined ? "" : `${fmtCount(downloads)}↓`,
    n: {
      downloads,
      stars: num(c.stars),
      views: num(c.views),
      chats: num(c.chatCount),
      tokens: num(c.personalityTokenCount),
      created: epochMs(c.createdAt),
      updated: epochMs(c.updatedAt),
    },
    nsfw: false, // the unauthenticated catalog is SFW-curated by the hub itself.
    tagline: str(c.description) ?? "",
    art: str(c.avatarUrl) ?? "", // a full URL on the allowlisted assets.pygmalion.chat apex.
    tags: [], // rows carry no tags (probed 2026-08-29).
  };
}

/** ONE Datacat character → the normalized row. The mirror's rows carry chat/message/favorite counters and a
 *  real `isNsfw` flag; covers ride its variant CDN (thumb for the tile, card for the hero — `heroArt`). */
function datacatRow(c) {
  if (!isObj(c)) {
    return null;
  }
  const ref = str(c.characterId);
  const name = str(c.name);
  if (ref === undefined || name === undefined) {
    return null;
  }
  const variants = isObj(c.avatarVariantUrls) ? c.avatarVariantUrls : {};
  const stats = isObj(c.stats) ? c.stats : {};
  const chats = num(stats.chat);
  const favorites = isObj(stats.favoritesCount) ? num(stats.favoritesCount.favoritesCount) : undefined;
  const fallbackAvatar = str(c.avatarDisplayUrl) ?? (str(c.avatar) === undefined ? "" : `${DATACAT_AVATAR_BASE}${encodeURIComponent(str(c.avatar))}`);
  return {
    source: "datacat",
    ref,
    name: name.slice(0, NAME_MAX_CHARS),
    creator: str(c.creatorName) ?? "unknown",
    pop: chats === undefined ? "" : `${fmtCount(chats)} chats`,
    n: {
      chats,
      messages: num(stats.message),
      favorites,
      tokens: num(c.totalTokens),
      created: epochMs(c.firstPublishedAt ?? c.createdAt),
    },
    nsfw: c.isNsfw === true,
    tagline: "",
    art: str(variants.thumb) ?? fallbackAvatar,
    heroArt: str(variants.card) ?? str(variants.original) ?? "",
    tags: [], // summary rows carry no tags (they exist only on the detail payload — probed 2026-08-29).
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
    // No server sort exists (three param spellings probed ignored, third era of refutation) — downloads and
    // likes ride the rows, so those orderings are page-side; the menu says only what can be answered.
    sortOptions: sortOpts(["relevance", "downloads", "likes", "name"]),
    async search({ q, include, page }) {
      // The live param grammar, probed 2026-08-29: `query=` is the text search (the older `q=` is DEAD — it
      // returns the unfiltered firehose), `tags=a,b` is a server-side AND filter over the hub's own tag
      // index (rows never carry the tags back — see `rowTags`), `page=` is real (30 hits fixed, `totalPages`
      // in every response). No sort, exclude, genre or rating params exist (all probed ignored) — the SFW
      // config judges the per-row `isNSFW` flag instead.
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
    // The data route DOES honor `sort=` (trending/downloads — probed 2026-08-29, distinct server-sorted
    // sets; the v1.2 "no realm sort" premise died). Include/exclude stay row-side over the held set.
    sortOptions: sortOpts(["relevance", "trending", "downloads", "name"]),
    async search({ q, sortKey, sfw }) {
      // Held-set source: the data route returns ONE whole result set (~60 rows) and 500s on any `page` > 1
      // (probed 2026-08-29) — the session pages it locally. The route's DEFAULT feed excludes NSFW;
      // `nsfw=true` opts it in — so the param rides exactly when the SFW filter is OFF (the show-all
      // default), and rows never self-identify (server-filtered ⇒ no per-row flag).
      const params = [["search", q]];
      if (sortKey === "trending") {
        params.push(["sort", "trending"]);
      } else if (sortKey === "downloads") {
        params.push(["sort", "downloads"]);
      }
      if (!sfw) {
        params.push(["nsfw", "true"]);
      }
      const json = await getJson(`https://realm.risuai.net/__data.json?${qs(params)}`);
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
    // The widest server sort menu in the roster — every arm probed monotonic on a query-less browse
    // 2026-08-29 WITH `asc=false` (without it the sort silently no-ops; and under a TEXT query chub keeps
    // relevance order regardless, which the page-side re-sort corrects). `download_count` is NOT offered:
    // it returns the star order (the downloads counter is dead on today's wire).
    sortOptions: sortOpts(["relevance", "trending", "stars", "favorites", "rating", "newest", "updated", "name"]),
    async search({ q, include, exclude, sortKey, page, sfw }) {
      // Chub is the FULL-capability hub: native include (`topics=`) AND exclude (`excludetopics=`), a server
      // sort, and a server rating toggle — its `nsfw` bool is an INCLUDE switch, so it rides `true` under
      // the show-all default and `false` when the SFW filter is ON. `first=30` harmonizes its page size
      // with the roster. (The legacy geo-block note did not reproduce — probed 200 from this box.)
      const sortParam = {
        trending: "trending_downloads",
        stars: "star_count",
        favorites: "n_favorites",
        rating: "rating",
        newest: "created_at",
        updated: "last_activity_at",
      };
      const params = [
        ["search", q],
        ["namespace", "characters"],
        ["first", String(PAGE_SIZE)],
        ["page", String(page)],
        ["nsfw", sfw ? "false" : "true"],
        ["sort", sortParam[sortKey] ?? "default"],
        ["asc", "false"],
      ];
      if (include.length > 0) {
        params.push(["topics", include.join(",")]);
      }
      if (exclude.length > 0) {
        params.push(["excludetopics", exclude.join(",")]);
      }
      const json = await getJson(`https://api.chub.ai/search?${qs(params)}`, { headers: BROWSER_HEADERS });
      const body = isObj(json) && isObj(json.data) ? json.data : json;
      const nodes = isObj(body) && Array.isArray(body.nodes) ? body.nodes : null;
      if (nodes === null) {
        return null;
      }
      const total = isObj(body) && typeof body.count === "number" ? body.count : undefined;
      return { rows: mapRows(nodes, chubRow), totalPages: pagesOf(total, PAGE_SIZE) };
    },
    async detail(result) {
      const json = await getJson(`https://api.chub.ai/api/characters/${encPath(result.ref)}?full=true`, { headers: BROWSER_HEADERS });
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
    // No server sort (re-probed ignored 2026-08-29) and no reliable per-row counters — name is the one
    // page-side ordering the rows can answer.
    sortOptions: sortOpts(["relevance", "name"]),
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
    // `orderBy` honors downloadCount, ratingAvg and createdAt (= its own default order) — each probed to a
    // distinct/monotonic set 2026-08-29. No tag params — filters apply row-side per page.
    sortOptions: sortOpts(["relevance", "downloads", "rating", "newest", "name"]),
    async search({ q, sortKey, page }) {
      // Curated, low-volume. No rating param — the per-card `isNsfw` flag is judged row-side by the SFW
      // config (and labeled either way).
      const orderBy = { downloads: "downloadCount", rating: "ratingAvg", newest: "createdAt" };
      const params = [
        ["search", q],
        ["limit", String(PAGE_SIZE)],
        ["skip", String((page - 1) * PAGE_SIZE)],
      ];
      if (orderBy[sortKey] !== undefined) {
        params.push(["orderBy", orderBy[sortKey]]);
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
    // `sort=newest` and `sort=oldest` are its two honored server sorts (probed distinct 2026-08-29;
    // rating/tokens spellings ignored). No tag params — filters apply row-side per page.
    sortOptions: sortOpts(["relevance", "newest", "oldest", "name"]),
    async search({ q, sortKey, page }) {
      // The 95K-card aggregator: `?q=&limit=&offset=` (+ the browser-UA pair — it bot-filters a bare client
      // UA). Per-card `nsfw` is judged row-side by the SFW config. Mirrors chub/janitor content, so the
      // import-side byte dedupe matters here most.
      const params = [
        ["q", q],
        ["limit", String(PAGE_SIZE)],
        ["offset", String((page - 1) * PAGE_SIZE)],
      ];
      if (sortKey === "newest" || sortKey === "oldest") {
        params.push(["sort", sortKey]);
      }
      const json = await getJson(`${CHARAVAULT_BASE}/api/cards?${qs(params)}`, { headers: BROWSER_HEADERS });
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
  botbooru: {
    label: "BotBooru",
    paging: "server",
    rowTags: true,
    serverInclude: false,
    serverExclude: false,
    headers: BOTBOORU_XHR_HEADERS,
    // Sorts probed 2026-08-29: the default feed IS newest; downloads/favorites/views each reorder. The
    // legacy adapter's `curated` sorts (top_rated/trending) are DEAD on today's wire (five spellings
    // probed ignored), and so is its `tags=` filter param — tag filters run row-side (rows carry tags).
    sortOptions: sortOpts(["relevance", "downloads", "favorites", "views", "name"], { relevance: "Newest (default)" }),
    async search({ q, sortKey, page, sfw }) {
      // The browse JSON gates on the XHR header (without it the route returns the SPA HTML shell). Its
      // default feed includes NSFW — `sfw_only=true` rides exactly when the SFW filter is ON.
      const sortParam = { downloads: "downloads", favorites: "favorites", views: "views" };
      const params = [
        ["q", q],
        ["page", String(page)],
        ["limit", String(PAGE_SIZE)],
      ];
      if (sortParam[sortKey] !== undefined) {
        params.push(["sort", sortParam[sortKey]]);
      }
      if (sfw) {
        params.push(["sfw_only", "true"]);
      }
      const json = await getJson(`${BOTBOORU_BASE}/posts/?${qs(params)}`, { headers: BOTBOORU_XHR_HEADERS });
      const posts = isObj(json) && Array.isArray(json.posts) ? json.posts : null;
      if (posts === null) {
        return null;
      }
      const total = isObj(json) && typeof json.total === "number" ? json.total : undefined;
      return { rows: mapRows(posts, botbooruRow), totalPages: pagesOf(total, PAGE_SIZE) };
    },
    async detail(result) {
      // BotBooru has NO JSON detail route (`/posts/{id}` returns the SPA shell) — the detail is the
      // DOWNLOADED card body itself (native chara_card_v2). A card past the 1 MiB wire cap folds to the
      // row's tagline — an honest thinner preview, never a crash; the PNG import arm still works.
      const card = await getJson(`${BOTBOORU_BASE}/download/json/${encodeURIComponent(result.ref)}`);
      const data = isObj(card) && isObj(card.data) ? card.data : null;
      if (data === null) {
        return { blurb: (result.tagline || "(the card body was too large to preview — Add to library still works)").slice(0, BLURB_MAX_CHARS), raw: null };
      }
      return { blurb: (str(data.description) ?? result.tagline ?? "").slice(0, BLURB_MAX_CHARS), raw: card };
    },
    heroUrl(_result) {
      return null; // the cover IS the full card PNG already.
    },
    cardPngUrl(result) {
      return `${BOTBOORU_BASE}/download/png/${encodeURIComponent(result.ref)}`;
    },
    /** The detail already fetched the native card JSON — ingest takes it as-is when the PNG arm folds. */
    fetchCard(_result, raw) {
      return Promise.resolve(isObj(raw) ? raw : null);
    },
  },
  pygmalion: {
    label: "Pygmalion",
    paging: "server",
    rowTags: false,
    serverInclude: false,
    serverExclude: false,
    // `orderBy` honors downloads/stars/views (distinct orders probed 2026-08-29) and `created` returns a
    // createdAt-monotonic feed — the legacy "every path 404s" verdict is DEAD, the service answers today.
    // Its `tagsNamesInclude` param exists but returns empty for common words (an opaque taxonomy) and rows
    // carry no tags, so tag filters are honestly not offered here.
    sortOptions: sortOpts(["relevance", "downloads", "stars", "views", "newest", "name"]),
    async search({ q, sortKey, page }) {
      // Connect-RPC: ONE POST with a JSON message; `page` is 0-based upstream. The unauthenticated service
      // serves the SFW-curated catalog only (`includeSensitive` is auth-gated — not a seeded plugin's
      // token to carry), so the SFW filter has nothing to do here.
      const orderBy = { downloads: "downloads", stars: "stars", views: "views", newest: "created" };
      const message = { query: q, orderDescending: true, pageSize: PAGE_SIZE, page: page - 1 };
      if (orderBy[sortKey] !== undefined) {
        message.orderBy = orderBy[sortKey];
      }
      const json = await postJson(`${PYG_API}/CharacterSearch`, message);
      const characters = isObj(json) && Array.isArray(json.characters) ? json.characters : null;
      if (characters === null) {
        return null;
      }
      const total = cnt(json.totalItems); // arrives as a STRING ("4452") — one parser, like every count.
      return { rows: mapRows(characters, pygmalionRow), totalPages: pagesOf(total, PAGE_SIZE) };
    },
    async detail(result) {
      // The Character RPC carries the DEFINITION (`personality: {name, persona, greeting}`) — the preview
      // and the JSON import fold in one payload.
      const json = await postJson(`${PYG_API}/Character`, { characterMetaId: result.ref });
      const character = isObj(json) && isObj(json.character) ? json.character : null;
      if (character === null) {
        return null;
      }
      return { blurb: (str(character.description) ?? result.tagline ?? "").slice(0, BLURB_MAX_CHARS), raw: character };
    },
    heroUrl(_result) {
      return null; // the row's avatarUrl is already the full asset.
    },
    cardPngUrl(_result) {
      return null; // pygmalion serves no card file — the JSON fold below is the import path.
    },
    /** Reshape the RPC's `personality` into the canonical card the import funnel reads. Field order is
     *  FIXED and minimal (deterministic bytes ⇒ re-adds dedupe by importHash). */
    fetchCard(result, raw) {
      if (!(isObj(raw) && isObj(raw.personality))) {
        return Promise.resolve(null);
      }
      const p = raw.personality;
      const data = { name: str(p.name) ?? result.name };
      if (str(raw.description) !== undefined) {
        data.description = raw.description;
      }
      if (str(p.persona) !== undefined) {
        data.personality = p.persona;
      }
      if (str(p.greeting) !== undefined) {
        data.first_mes = p.greeting;
      }
      if (result.creator !== "unknown") {
        data.creator = result.creator;
      }
      return Promise.resolve({ data });
    },
  },
  datacat: {
    label: "Datacat (JanitorAI mirror)",
    paging: "server",
    rowTags: false,
    serverInclude: false,
    serverExclude: false,
    // The default feed is newest-first; `sortBy=chat_count` reorders (probed 2026-08-29). Its `nsfw=`
    // param is IGNORED (probed: flagged rows still arrive) — the SFW filter judges the row flag instead.
    sortOptions: sortOpts(["relevance", "chats", "name"], { relevance: "Newest (default)" }),
    async search({ q, sortKey, page }) {
      const params = [
        ["limit", String(PAGE_SIZE)],
        ["offset", String((page - 1) * PAGE_SIZE)],
        ["summary", "1"],
        ["minTotalTokens", "0"],
      ];
      if (q.length > 0) {
        params.push(["search", q]);
      }
      if (sortKey === "chats") {
        params.push(["sortBy", "chat_count"]);
      }
      const json = await dcGet(`/api/characters/recent-public?${qs(params)}`);
      const characters = isObj(json) && Array.isArray(json.characters) ? json.characters : null;
      if (characters === null) {
        return null;
      }
      const total = isObj(json) && typeof json.totalCount === "number" ? json.totalCount : undefined;
      return { rows: mapRows(characters, datacatRow), totalPages: pagesOf(total, PAGE_SIZE) };
    },
    async detail(result) {
      const json = await dcGet(`/api/characters/${encodeURIComponent(result.ref)}`);
      const character = isObj(json) && isObj(json.character) ? json.character : null;
      if (character === null) {
        return null;
      }
      // Janitor descriptions arrive as HTML fragments; the markdown node escapes tags (untrusted tier),
      // so they would render as literal `<p>` noise — strip the tags, keep the words.
      const blurb = (str(character.description) ?? str(character.rawDescription) ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      return { blurb: blurb.slice(0, BLURB_MAX_CHARS), raw: character };
    },
    /** The sharper hero is the row's `card`/`original` variant URL (held on the normalized row — datacat's
     *  variant CDN has no deterministic per-ref path to rebuild it from). */
    heroUrl(result) {
      return typeof result.heroArt === "string" && result.heroArt.length > 0 ? result.heroArt : null;
    },
    cardPngUrl(_result) {
      return null; // the mirror's PNG download route sits behind a Turnstile wall (probed) — not reachable.
    },
    /** The detail carries `chara_card_v2_json` (the recovered card) — parse it when present; else build a
     *  minimal card from the recovered fields. A DEGRADED row (nothing recovered) answers null ⇒ the honest
     *  error toast: this mirror only recovered the profile, not the definition. */
    fetchCard(result, raw) {
      if (!isObj(raw)) {
        return Promise.resolve(null);
      }
      const cardJson = raw.chara_card_v2_json;
      if (typeof cardJson === "string" && cardJson.length > 0) {
        try {
          const parsed = JSON.parse(cardJson);
          if (isObj(parsed)) {
            return Promise.resolve(parsed);
          }
        } catch {
          // fall through to the field build below.
        }
      } else if (isObj(cardJson)) {
        return Promise.resolve(cardJson);
      }
      const data = { name: str(raw.name) ?? result.name };
      const put = (key, value) => {
        if (typeof value === "string" && value.length > 0) {
          data[key] = value;
        }
      };
      put("description", raw.description);
      put("personality", raw.personality);
      put("scenario", raw.scenario);
      put("first_mes", raw.first_message ?? raw.extracted_first_message);
      put("creator", str(raw.creator_name));
      return Promise.resolve(Object.keys(data).length > 1 ? { data } : null);
    },
  },
};

// ── the datacat session token (an anonymous mint, cached in kv, re-minted once on a 401/403) ───────────────
/** kv key holding the minted session token — reused across respawns; a stale one re-mints. */
const DC_TOKEN_KEY = "dc_token";
/** Module cache so a browse session pays the kv read once. */
let dcTokenCache = null;
/** HTTP statuses that mean "this token is done" — re-mint once, then give up honestly. */
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

/** Datacat's origin-identity header pair (probe-recorded adapter data). Tuple-built so HTTP header wire
 *  tokens never become lint-checked object-literal identifiers (the BOTBOORU_XHR_HEADERS pattern). */
const DC_ORIGIN_HEADERS = Object.fromEntries([
  ["Origin", DATACAT_BASE],
  ["Referer", `${DATACAT_BASE}/`],
]);

/** The full header set a tokened datacat call sends. */
function dcHeaders(token) {
  return Object.fromEntries([...Object.entries(BROWSER_HEADERS), ...Object.entries(DC_ORIGIN_HEADERS), ["X-Session-Token", token]]);
}

/** An epoch-ms count is 13 digits this century; the deviceToken borrows its last 11 for uniqueness. */
const EPOCH_MS_DIGITS = 13;
const DEVICE_TOKEN_TAIL_DIGITS = 11;

/** Mint an anonymous session (`liberator/identify`). The deviceToken only needs UUID SHAPE — the guest has
 *  no entropy source (by design), so it derives from the clock: unique enough for an anonymous mint. */
async function dcMint() {
  const ms = String(host.clock.nowEpochMs()).padStart(EPOCH_MS_DIGITS, "0");
  const deviceToken = `00000000-0000-4000-8000-a${ms.slice(-DEVICE_TOKEN_TAIL_DIGITS)}`;
  const json = await postJson(`${DATACAT_BASE}/api/liberator/identify`, { deviceToken }, { ...BROWSER_HEADERS, ...DC_ORIGIN_HEADERS });
  const token = isObj(json) ? str(json.sessionToken) : undefined;
  if (token === undefined) {
    return null;
  }
  dcTokenCache = token;
  await host.storage.set(DC_TOKEN_KEY, token);
  return token;
}

/** GET a datacat API path with the session token; ONE re-mint on a 401/403 (an expired anonymous session),
 *  then the standard null fold. Uses `host.net.fetch` directly — it needs the STATUS, which getJson folds. */
async function dcGet(path) {
  try {
    let token = dcTokenCache;
    if (token === null) {
      token = await host.storage.get(DC_TOKEN_KEY);
      dcTokenCache = token;
    }
    if (token === null) {
      token = await dcMint();
    }
    if (token === null) {
      return null;
    }
    let res = await host.net.fetch(`${DATACAT_BASE}${path}`, { headers: dcHeaders(token) });
    if (res.status === HTTP_UNAUTHORIZED || res.status === HTTP_FORBIDDEN) {
      token = await dcMint();
      if (token === null) {
        return null;
      }
      res = await host.net.fetch(`${DATACAT_BASE}${path}`, { headers: dcHeaders(token) });
    }
    if (res.status < HTTP_OK_MIN || res.status >= HTTP_OK_MAX) {
      host.log.info(`datacat ${res.status}: ${path}`);
      return null;
    }
    return JSON.parse(res.body);
  } catch (err) {
    host.log.warn(`datacat fetch failed: ${String(err)}`);
    return null;
  }
}

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

/** The guest's own parallelism ceiling. The membrane admits ≤32 concurrent host calls PER PLUGIN and
 *  THROWS on the 33rd — and that budget is shared across everything in flight: a floating cover batch
 *  from the last search plus the next action's own publish reads. An unbounded 30-wide batch measurably
 *  killed the next action mid-handler on the live stage ("too many concurrent host calls (>32)" — the
 *  drive receipt this constant exists for). 8 keeps two overlapping batches + incidentals well under. */
const GUEST_PARALLEL_MAX = 8;

/** Run `fn` over `items` at most {@link GUEST_PARALLEL_MAX} at a time, results in item order. `fn` must
 *  fold its own failures (both callers do) — a rejection here would abandon the remaining lanes. */
async function mapLimit(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(GUEST_PARALLEL_MAX, items.length) }, lane));
  return results;
}

/** Fetch every listed row's cover that the cache does not hold — in BOUNDED parallel waves (see
 *  {@link GUEST_PARALLEL_MAX}; each call claims the art belt). A per-cover failure is a placeholder,
 *  never fatal; one summarizing log line reports the batch. Mutates + persists the cache; returns how
 *  many new covers landed. */
async function fetchMissingArt(cache, rows, keyOf, urlOf) {
  const misses = rows.filter((row) => urlOf(row) !== "" && cachedArt(cache, keyOf(row)) === undefined);
  if (misses.length === 0 || !canFetchArt()) {
    return 0;
  }
  const settled = await mapLimit(misses, async (row) => {
    try {
      const { assetId } = await host.net.fetchAsset(urlOf(row));
      cache[keyOf(row)] = { a: assetId, t: host.clock.nowEpochMs() };
      return true;
    } catch (err) {
      host.log.info(`cover skipped (${keyOf(row)}): ${String(err)}`);
      return false;
    }
  });
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
 *  page), and a side the rows cannot answer (`rowTags: false`) passes — the status line carries the note.
 *  The SFW arm is a BELT even on server-filtered hubs: a flagged row that slips a server filter is still
 *  dropped (row flags and server params are independent honesty). `filters` is the job/session itself —
 *  both carry `include`/`exclude`/`sfw`. */
function matchesFilters(source, row, filters) {
  if (filters.sfw && row.nsfw === true) {
    return false;
  }
  const includeOk = source.serverInclude || !source.rowTags || filters.include.every((tag) => row.tags.includes(tag));
  const excludeOk = source.serverExclude || !source.rowTags || !filters.exclude.some((tag) => row.tags.includes(tag));
  return includeOk && excludeOk;
}

/** The status-line sentence for the active filters — so a filtered page SAYS it is filtered, including the
 *  capability gaps: a hub that neither filters server-side nor publishes row tags cannot judge EITHER side
 *  (Pygmalion, Datacat — one note covers both fields), and one that only lacks row tags cannot exclude
 *  (Character Tavern). A filter that silently no-ops is the failure these sentences exist to prevent. */
function filterNote(source, include, exclude) {
  if ((include.length > 0 || exclude.length > 0) && !(source.rowTags || source.serverInclude || source.serverExclude)) {
    return ` (tag filters need published tags — ${source.label} has none)`;
  }
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

/** The page's status sentence: what's showing, from where, for what, under which filters and ordering. */
function pageStatus(source, q) {
  if (session === null) {
    return "";
  }
  const what = q.length === 0 ? source.label : `${source.label} for "${q}"`;
  const note = filterNote(source, session.include, session.exclude);
  const sortNote = session.sortKey === "relevance" ? "" : ` · ${SORT_LABELS[session.sortKey].toLowerCase()}`;
  const sfwNote = session.sfw ? " · SFW only" : "";
  if (session.pageRows.length === 0) {
    return `Nothing from ${what}${note}${sfwNote}.`;
  }
  return `${session.pageRows.length} from ${what}${note}${sortNote}${sfwNote}.`;
}

/** Build the session a fresh search establishes, from what the hub answered. Held-set hubs (`allRows`):
 *  filter row-side, sort ONCE globally, hold the whole set — page flips slice it locally. Server-paged hubs:
 *  server-filtered sides arrive filtered; row-side judges the rest per page; sort within the page in hand. */
function buildSession(source, job, res) {
  const base = { q: job.q, sourceKey: job.sourceKey, sortKey: job.sortKey, include: job.include, exclude: job.exclude, sfw: job.sfw, page: 1 };
  const kept = sortRows(
    res.rows.filter((row) => matchesFilters(source, row, job)),
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
  const res = await source.search({ q: job.q, include: job.include, exclude: job.exclude, sortKey: job.sortKey, page: 1, sfw: job.sfw });
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
    const res = await source.search({
      q: session.q,
      include: session.include,
      exclude: session.exclude,
      sortKey: session.sortKey,
      page: session.page,
      sfw: session.sfw,
    });
    if (seq !== sessionSeq) {
      return;
    }
    if (res === null) {
      await publishBrowse(`${source.label} didn't answer — try again in a moment.`);
      return;
    }
    session.totalPages = res.totalPages;
    session.pageRows = sortRows(
      res.rows.filter((row) => matchesFilters(source, row, session)),
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

/** A toast the ADD PATH may not die on (#1698). `host.ui.toast` is rate-limited to one notice every
 *  `PLUGIN_TOAST_COOLDOWN_SECONDS` per plugin and REFUSES BY THROWING (the host's outbox is deliberate about
 *  that: a plugin over its floor should learn so). The add path used to `await` it mid-function, so a refused
 *  toast threw straight through `addToLibrary` — which silently skipped the provenance stamp AND the owned
 *  index below it, and stopped the caller from republishing the page at all. A second add inside ten seconds
 *  therefore changed nothing on screen and lost the card's provenance. The notice is BEST-EFFORT; the writes
 *  and the page are not. Logged rather than swallowed: the refusal is a real fact about this plugin's budget. */
async function say(level, message) {
  try {
    await host.ui.toast(level, message);
  } catch (err) {
    host.log.info(`toast refused (the page still states the outcome): ${String(err)}`);
  }
}

/** Add one card to the library: PNG-first (definition + avatar in one pass), JSON fold where the hub serves
 *  card JSON; then stamp + remember.
 *
 *  RETURNS THE OUTCOME, and that is the #1698 fix's other half. The detail page's owned line used to be read
 *  back out of the owned INDEX, which this function has just written — so the instant a first-ever import
 *  succeeded the page said "Already in your library", i.e. the one moment the surface exists for reported
 *  that nothing had happened. Ownership-at-rest and what-just-happened are two different facts; the caller
 *  now hands the second one to `publishDetail`. `"added"` / `"already"` / `null` (the hub refused). */
async function addToLibrary(result, raw) {
  let outcome = await addViaPng(result);
  if (outcome === null) {
    const card = await SOURCES[result.source].fetchCard(result, raw);
    if (card === null) {
      await say("error", `${SOURCES[result.source].label} wouldn't hand the card over — try again in a moment.`);
      return null;
    }
    outcome = await host.character.ingest(card);
  }
  const { characterId, created } = outcome;
  // THE WRITES COME FIRST. Everything below the ingest is what makes the import durable, and none of it may
  // hang off a notice that is allowed to refuse (see `say`).
  //
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
  if (created) {
    await say("success", `${result.name} is in your library.`);
    return "added";
  }
  await say("info", `${result.name} is already in your library (byte-identical — nothing was duplicated).`);
  return "already";
}

// ── publishing (the page is a projection of the session) ───────────────────────────────────────────────────

/** A tile's chip row: the row's tags, with `nsfw` PREPENDED where the hub flagged the row — labeling is
 *  separate honesty from filtering (a flagged card wears its flag whether or not the filter is on). */
function tileTags(result) {
  if (result.nsfw !== true) {
    return result.tags;
  }
  return ["nsfw", ...result.tags.filter((tag) => tag !== "nsfw")].slice(0, TAGS_PER_ROW_MAX);
}

/** Publish the browse page. `sourceKey` names WHICH hub's sort menu to publish — the picked hub during the
 *  immediate-feedback publish (its menu must swap the moment the select changes), the session's afterward,
 *  the default before any search. `loading` drives the grid's SKELETON (#799): true on the pre-wire publish
 *  of a search or a page flip, false on every settled one. */
async function publishBrowse(status, sourceKey, loading) {
  const cache = await loadArtCache();
  const rows = session === null ? [] : session.pageRows;
  // Bounded, and each read folds its own failure — the owned badge is decoration, never worth an action.
  const owned = await mapLimit(rows, (result) => host.storage.get(ownedKey(result)).catch(() => null));
  const menuKey = sourceKey ?? (session === null ? "tavern" : session.sourceKey);
  await host.ui.setState("atlas_page", {
    stage: "browse",
    status,
    loading: loading === true,
    sortOptions: SOURCES[menuKey].sortOptions,
    pageLabel: session === null || session.totalPages <= 1 ? "" : `Page ${session.page} of ${session.totalPages}`,
    tiles: rows.map((result, i) => {
      const cover = cachedArt(cache, artKey(result));
      const chips = tileTags(result);
      return {
        id: `r${i}`,
        title: result.name,
        subtitle: result.pop === "" ? result.creator : `${result.creator} · ${result.pop}`,
        ...(chips.length === 0 ? {} : { tags: chips }),
        ...(owned[i] === null ? {} : { badge: "in your library" }),
        ...(cover === undefined ? {} : { assetId: cover }),
      };
    }),
    detail: {},
  });
}

/** What the detail page's owned line says. At REST it reports ownership; right after an add it reports the
 *  ADD (#1698). The two were one string, and the standing-ownership wording ("Already in your library") is a
 *  lie about a card that has just this second been imported. */
const OUTCOME_LINE = {
  added: "Added to your library.",
  already: "Already in your library — nothing was duplicated.",
};

async function publishDetail(result, blurb, outcome) {
  const cache = await loadArtCache();
  const ownedId = await host.storage.get(ownedKey(result));
  // The hero: the sharper cached variant when one has landed, else the grid cover — so the decision surface
  // paints art INSTANTLY from cache and upgrades in place (the open continuation fetches the variant lazily).
  const art = cachedArt(cache, heroKey(result)) ?? cachedArt(cache, artKey(result)) ?? "";
  // The tags line comes from the NORMALIZED ROW (never the detail payload), so every hub answers uniformly —
  // "—" is the honest void where a hub publishes none (Character Tavern / Pygmalion / Datacat).
  const tagLine = result.tags.length === 0 ? "—" : result.tags.join(" · ").slice(0, DETAIL_TAGS_MAX_CHARS);
  // The stat sheet is BOUND DATA (`rowsFrom`): provenance first, then exactly the counters this hub's row
  // carried (statRows — a different subset per hub, no page of "—"), then the tag line.
  const stats = [
    { key: "Creator", value: result.creator },
    { key: "From", value: SOURCES[result.source].label },
    ...statRows(result),
    { key: "Tags", value: tagLine },
  ];
  await host.ui.setState("atlas_page", {
    stage: "card",
    status: "",
    sortOptions: SOURCES[result.source].sortOptions,
    pageLabel: "",
    tiles: [],
    detail: {
      name: result.name,
      stats,
      blurb: blurb || "(this card ships no description)",
      // The OUTCOME wins where there is one — this render is the answer to a button press, and the person is
      // owed what just happened rather than a standing property of the library. `undefined` (every publish
      // that is not an add's) falls back to the rest state.
      owned: OUTCOME_LINE[outcome] ?? (ownedId === null ? "" : "Already in your library — adding again just re-checks the bytes."),
      art,
    },
  });
}

// ── the page ───────────────────────────────────────────────────────────────────────────────────────────────
const canBrowse = host.grants.includes("ui.surface") && host.grants.includes("net.fetch") && host.grants.includes("storage.kv");
if (!canBrowse) {
  host.log.warn("card atlas is dormant: it needs ui.surface + net.fetch + storage.kv granted (Settings → Plugins)");
}

/** Register (or RE-register — `ui.register` upserts by surface id) the page. Called twice at most: once
 *  synchronously at activation with the default posture, and once from the boot continuation when the
 *  kv-persisted SFW setting says ON — a control that showed a default while the code filtered by the
 *  remembered value would be a lying switch, and a registration that ONLY floated raced the very next
 *  `listSurfaces` (measured in the seed int test). */
function registerAtlasPage(sfwOn) {
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
              // The three subordinate controls, ALWAYS VISIBLE beside each other — a source switcher
              // collapsed under a disclosure under-served the primary browse decision. All are LIVE
              // (`actionId`): picking a hub, a sort or flipping the SFW filter re-runs the search
              // immediately, never sits inert behind Search. The Sort menu is BOUND (`optionsFrom` — the
              // hub-v1.3 arm): each hub publishes ITS OWN honored orderings, so the select never advertises
              // a mode the hub cannot answer.
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
                      { value: "botbooru", label: "BotBooru" },
                      { value: "pygmalion", label: "Pygmalion" },
                      { value: "datacat", label: "Datacat (JanitorAI mirror)" },
                    ],
                    value: "tavern",
                  },
                  {
                    kind: "select",
                    name: "sort",
                    label: "Sort",
                    actionId: "search",
                    optionsFrom: { $state: "sortOptions" },
                    value: "relevance",
                  },
                  // The SFW config (#800): default OFF = show everything (no gate, no blur — the owner's
                  // posture); ON filters server-side where the hub speaks a rating param, row-side where it
                  // only flags. The registered `value` is the kv-persisted setting (see registerAtlasPage).
                  { kind: "toggle", name: "sfw", label: "SFW only", value: sfwOn, actionId: "search" },
                ],
              },
              { kind: "text", voice: "gloss", value: { $state: "status" } },
              {
                kind: "grid",
                tilesFrom: { $state: "tiles" },
                tileAction: "open_result",
                aspect: "portrait",
                empty: "Search to begin — the atlas covers nine community hubs.",
                // The LOADING third of the three-states law (#799). It is reachable at the static tier
                // because every handler here already publishes BEFORE it floats its wire work (the
                // settlement wall): that first publish sets this true, the continuation's sets it false.
                loading: { $state: "loading" },
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
              // The DECISION CLUSTER sits above the fold: the full mined stat sheet (BOUND rows — each hub
              // shows exactly the counters it returned, never a page of "—"), the owned line, the two
              // actions — then the reading material below them at reading width.
              { kind: "keyValue", rowsFrom: { $state: "detail.stats" } },
              { kind: "text", voice: "gloss", value: { $state: "detail.owned" } },
              {
                kind: "row",
                gap: "field",
                children: [
                  { kind: "button", actionId: "back", label: "Back to results", variant: "outline" },
                  // The page's ONE primary (#818). This detail stage IS the decision surface, and until the
                  // ruling admitted a per-anchor primary the decision and the way back carried equal weight
                  // (stickler 2026-08-29 F3). One claimant in the whole spec, so the renderer's
                  // first-in-document-order grant is unambiguous.
                  { kind: "button", actionId: "add_to_library", label: "Add to library", variant: "primary" },
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
}

if (canBrowse) {
  // Register SYNCHRONOUSLY at activation with the default posture (SFW off = show all) — the page must
  // exist the moment activation returns (a floated-only registration measurably races the very next
  // `listSurfaces`; the seed int test caught exactly that). Then the BOOT continuation (floated — the
  // activation-publish precedent) reads the persisted setting and RE-REGISTERS only when it differs:
  // `ui.register` upserts by surface id, so the revision replaces the row and the toggle shows the
  // remembered truth by the time a person opens the page. Finally publish the browse stage ONCE so the
  // page renders on first open (a bound spec is withheld until state lands; an empty atlas is a
  // publishable, teaching state).
  registerAtlasPage(false);
  void (async () => {
    let sfwOn = false;
    try {
      sfwOn = (await host.storage.get(SFW_KEY)) === "on";
    } catch (err) {
      host.log.info(`sfw setting read failed (defaulting to show-all): ${String(err)}`);
    }
    lastSfwWritten = sfwOn;
    if (sfwOn) {
      registerAtlasPage(true);
    }
    await publishBrowse("");
  })().catch((err) => host.log.warn(`atlas boot failed: ${String(err)}`));
}

/** The sort the person picked, applied to the NORMALIZED rows — one dialect for every hub (a hub with a
 *  real server sort also passes it upstream in its own `search`; this pass keeps the PAGE order consistent
 *  regardless — chub, for one, keeps relevance order under a text query no matter what `sort=` says).
 *  Held-set hubs sort the WHOLE set (so paging respects it); server-paged hubs sort the page in hand.
 *  Rows missing the datum sort LAST (an unknown is not a zero). `relevance`/`trending` have no per-row
 *  datum — the provider's order stands. */
function sortRows(rows, key) {
  if (key === "name") {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }
  const field = SORT_FIELD[key];
  if (field === undefined) {
    return rows;
  }
  const dir = key === "oldest" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a.n[field];
    const bv = b.n[field];
    if (av === undefined) {
      return bv === undefined ? 0 : 1;
    }
    if (bv === undefined) {
      return -1;
    }
    return (av - bv) * dir;
  });
}

/** `search`: validate, speak, SCHEDULE — the wire work floats (see the continuations' header). The handler
 *  settles in milliseconds no matter how a hub behaves. An EMPTY query browses the hub's whole catalog
 *  (that is a real thing to want — page through what's out there), so nothing blocks on typing. Fired by the
 *  Search button, Enter in the query box, AND the live Hub/Sort selects. */
async function searchAction(values) {
  const q = String(values.q ?? "").trim();
  const sourceKey = typeof values.source === "string" && values.source in SOURCES ? values.source : "tavern";
  const source = SOURCES[sourceKey];
  // The sort is validated against the PICKED hub's own menu — a hub switch can strand a value the new hub
  // doesn't offer (botbooru's "views" on tavern), which folds to the hub's default rather than pretending.
  const sortKey = source.sortOptions.some((o) => o.value === values.sort) ? values.sort : "relevance";
  const include = parseTagList(values.include_tags);
  const exclude = parseTagList(values.exclude_tags);
  const sfw = values.sfw === "true";
  // Persist the SFW setting when it changed — it is a per-person config, and the NEXT activation registers
  // the toggle with this remembered value (the boot continuation).
  if (sfw !== lastSfwWritten) {
    lastSfwWritten = sfw;
    void host.storage.set(SFW_KEY, sfw ? "on" : "off").catch((err) => host.log.info(`sfw setting write failed: ${String(err)}`));
  }
  const seq = ++sessionSeq;
  // Feedback BEFORE the wire: the status line speaks AND the grid goes to its skeleton (#799 — the ruling
  // that this publish must never blank the page SURVIVES, its input changed: the vocabulary now HAS a
  // shape- and aspect-matched skeleton, so the boxes stay reserved and nothing reflows. What the old
  // content-preserving arm actually did was show the PREVIOUS query's results under a status line saying a
  // different query was running, which is the state the three-states law calls neither). The picked hub's
  // sort menu rides this publish, so the Sort select swaps vocabularies the moment the Hub select changes.
  await publishBrowse(q.length === 0 ? `Browsing ${source.label}…` : `Searching ${source.label} for "${q}"…`, sourceKey, true);
  void runSearch(seq, { sourceKey, sortKey, q, include, exclude, sfw }).catch((err) => host.log.warn(`search failed: ${String(err)}`));
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
  // Same skeleton posture as a search (#799): a page flip replaces the grid's WHOLE content over a wire
  // fetch, so leaving the previous page's tiles under "Fetching page 3…" claimed results that were on
  // their way out. The edge-refusal publishes above stay settled — nothing is in flight for those.
  await publishBrowse(`Fetching page ${target}…`, undefined, true);
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
  const outcome = await addToLibrary(openResult.result, openResult.raw);
  // Republish from the SESSION's own copy of the blurb rather than re-fetching the detail: the add arm
  // already spends up to one slow fetch, and the settlement wall prices a second one out of the invocation.
  // The OUTCOME rides along so the page states what just happened (#1698) — `null` is the hub-refused arm,
  // which has already said its piece and leaves the rest state alone.
  await publishDetail(openResult.result, openResult.blurb, outcome ?? undefined);
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
