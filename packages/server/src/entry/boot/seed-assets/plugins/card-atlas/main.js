// Card Atlas — the HUB-BROWSER flagship: the biggest seeded example, and the template for a real product-
// sized plugin. Search two community card hubs, browse REAL cover art, read a card on a proper detail page,
// and SUMMON it into your own library — search → art grid → preview → import, entirely inside the app.
//
// WHAT THIS ONE TEACHES that the smaller examples cannot:
//
//  * A FULL-PAGE, MULTI-STAGE SURFACE. One `ui.page` registration, one `masterDetail` arrangement, one
//    `onAction` router. The BROWSE stage is a BOUND grid (`tilesFrom` — the tile count is DATA, so twelve
//    results are twelve tiles and three are three); the DETAIL stage is where the decision happens, so it
//    gets the design: hero art, name, provenance, the summon decision above the fold, the description at
//    reading width. Stage navigation is ordinary published state (`active: {$state:"stage"}`), so leaving
//    the Extensions section and coming back lands you exactly where you were.
//
//  * REMOTE ART, THE SAFE WAY (`net.fetchAsset`). A rendered node can only ever name an asset in the
//    installer's OWN CAS — a URL is unspellable (the exfil wall). `net.fetchAsset(url)` is the door through
//    that wall that moves no wall: the HOST downloads the image (same `netHosts` allowlist, same SSRF guard,
//    same hourly budget as `net.fetch`), validates the BYTES (magic sniff, never the remote Content-Type),
//    stores them into the installer's CAS, and hands back a bare assetId. Publish that id in state and bind
//    it (`tilesFrom` covers, the detail `hero.assetFrom`) — the bytes never enter this realm.
//
//  * BUDGETING A SHARED EGRESS BELT. `net.fetch` and `net.fetchAsset` share ONE hourly budget (120/plugin),
//    and an art grid honestly spends ~25 calls per fresh search — so uncached art would starve SEARCH ITSELF
//    inside a session. The `art_cache` below (ONE kv key, LRU-trimmed, 24 h TTL) makes repeat searches cost
//    one call, and every art failure degrades to the placeholder tile, never a broken page. When you copy
//    this plugin, copy the budget thinking too.
//
//  * WORKING PAST THE SETTLEMENT WALL. An action handler has ~6 s of real time to settle; a search plus a
//    two-dozen-cover batch does not fit, and blowing the wall is a crash strike + a respawned session. So the
//    handler publishes the TEXT grid and returns, and the art batch rides a FLOATING promise the host pumps
//    between invocations (`scheduleArtLoad` — the same mechanism as the activation-time publish), guarded by
//    session identity so an older batch never overwrites a newer search. Long work floats; handlers answer.
//
//  * TALKING TO THE OUTSIDE WORLD PROPERLY. Fetches are host-performed, allowlisted to the hosts the
//    manifest declares, 5 s / 1 MiB bounded, SSRF-guarded — and every response here is treated as UNTRUSTED
//    DATA: parsed defensively, malformed rows dropped (never thrown), failures folded into the status line.
//    Each hub is ONE source object with the same verbs and ONE NORMALIZED row shape — which is why both hubs
//    render pixel-identically and adding a third is adding one object to `SOURCES`.
//
//  * A CANON WRITE WITH PROVENANCE — AND ART. Summon is PNG-FIRST: both hubs serve the card as a PNG whose
//    tEXt chunk embeds the definition, so `net.fetchAsset` + `character.ingestAsset` runs the same import
//    funnel a hand-uploaded card file takes and the character arrives WITH its avatar. Either PNG arm
//    failing (an over-cap file, a hub that licenses PNG downloads per-card, an ungranted capability) folds
//    to the JSON ingest path — art-less, exactly the pre-art behavior, never a crash. Then
//    `character.setCardData` stamps WHERE IT CAME FROM under this plugin's own reserved key (portable,
//    unforgeable), and the private `storage.kv` owned-index is the fast "in your library" lookup.
//
//  * RESIDENT SESSION STATE. `lastResults` below is a plain module variable: a resident guest lives from
//    activation to disable, so a browse session (which result was #3?) is honestly module state. It dies on
//    respawn — exactly right for a search session, and exactly wrong for the owned-index and the art cache,
//    which is why THOSE live in storage. Choose the plane by the data's lifetime, not by habit.

const host = orb.host(1);

/** Result-page size — what a browse SCREEN wants, well under the grid's 64-tile cap, and exactly the art
 *  budget one fresh search spends (see the header's budget note). */
const PAGE_SIZE = 24;
/** Display clamps. The markdown node's own cap is 2 KiB; staying under it keeps the belt quiet. */
const BLURB_MAX_CHARS = 1800;
const NAME_MAX_CHARS = 80;
/** The one status every fetch folds into — HTTP's own "OK" band. */
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;

// ── the art cache (ONE kv key — the 256-key budget already carries the owned-index) ───────────────────────
/** kv key holding `{ "<source>:<ref>": { a: assetId, t: fetchedAtMs }, … }` — every cover/hero this plugin
 *  has already pulled into the installer's CAS. Why it exists: the egress belt is SHARED with search (the
 *  header's budget note), so a repeat search must cost 1 call, not 25. Why the TTL: a scheduled assets-GC
 *  can reap fetched blobs (they are display-only, nothing durable references them), and an expired entry
 *  re-fetches — content-addressing makes that a cheap self-heal, so stale art never wedges. */
const ART_CACHE_KEY = "art_cache";
const ART_CACHE_MAX_ENTRIES = 300;
/** 24 hours. */
const ART_TTL_MS = 86_400_000;
/** The compact-count steps (`fmtCount`/`parseCount` speak one dialect for both hubs). */
const THOUSAND = 1000;
const MILLION = 1_000_000;

// ── the resident browse session ────────────────────────────────────────────────────────────────────────────
/** The last search's results, by tile index — `r0`…`rN` are the bound tiles' ids, and this array is what an
 *  `open_result` click resolves them against. Module state: alive for the resident's lifetime, gone on
 *  respawn, which is the honest lifetime of a browse session. */
let lastResults = [];
/** The result currently on the detail stage (the summon button's subject). */
let openResult = null;

// ── shared fetch/parse helpers (every response is untrusted data) ──────────────────────────────────────────

/** GET a JSON document. `null` for EVERY failure shape — non-2xx, a body that is not JSON, the host's own
 *  refusals (off-allowlist, the hourly egress floor, the 5 s deadline, the 1 MiB cap). The CALLER folds the
 *  failure into the status line; nothing here ever throws into a handler. */
async function getJson(url) {
  try {
    const res = await host.net.fetch(url);
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

/** Downloads arrive as a number (Character Tavern) or a compact string like "16.3k" (RisuRealm). ONE parser
 *  to a plain number, `-1` for unknowable — so sorting and display treat both hubs identically. */
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

/** ONE compact display formatter for both hubs — "7406" and "26.9k" both render the same dialect. */
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
// `search(q)` → NORMALIZED rows `{source, ref, name, creator, downloadsN, downloadsLabel, tokens, tagline,
// art}` (`art` = the cover's remote URL, "" when the hub has none; `downloadsN` numeric, -1 unknowable);
// `detail(result)` → the display fields + the raw payload; `cardPngUrl(result)` → the card-as-PNG download
// the PNG-first summon rides (null = the hub serves none); `fetchCard(result, raw)` → the JSON fold.
// Adding a hub = adding one object here (and its hosts to the manifest's netHosts — which WIDENS REACH, so
// an upgrade doing that lands disabled pending re-consent, by design).

/** Character Tavern's storage CDN (art + card PNGs) — a distinct allowlisted host, `<path>.png` addressed,
 *  resize variants via query params. Probe-verified 2026-08-29: the BARE png AND the resized variants both
 *  carry the embedded `chara` card chunk. */
const TAVERN_CDN = "https://ct-cards.storage.character-tavern.com";
/** RisuRealm's resource CDN — serves each card's cover by content hash (a JPEG with no Content-Type header;
 *  the host's image guard judges bytes, not headers). */
const REALM_CDN = "https://sv.risuai.xyz";

/** A tavern `author/slug` path, segment-encoded for a URL (slashes survive). */
const encPath = (p) =>
  p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

const SOURCES = {
  tavern: {
    label: "Character Tavern",
    async search(q) {
      const json = await getJson(`https://character-tavern.com/api/search/cards?q=${encodeURIComponent(q)}&page=1`);
      const hits = isObj(json) && Array.isArray(json.hits) ? json.hits : null;
      if (hits === null) {
        return null;
      }
      const out = [];
      for (const hit of hits) {
        // SFW seed posture: the search API has no server-side filter, so the per-row flag is honored here.
        if (!isObj(hit) || hit.isNSFW === true) {
          continue;
        }
        const ref = str(hit.path);
        const name = str(hit.name);
        if (ref === undefined || name === undefined) {
          continue; // A malformed row is dropped, never fatal — one bad hit must not blank the page.
        }
        const downloadsN = parseCount(hit.downloads);
        out.push({
          source: "tavern",
          ref,
          name: name.slice(0, NAME_MAX_CHARS),
          creator: str(hit.author) ?? "unknown",
          downloadsN,
          downloadsLabel: fmtCount(downloadsN),
          tokens: typeof hit.totalTokens === "number" ? String(hit.totalTokens) : "—",
          tagline: str(hit.tagline) ?? "",
          // The grid cover: the CDN's 320-wide variant (~85 KB) — a tile never needs the full card file.
          art: `${TAVERN_CDN}/${encPath(ref)}.png?width=320&quality=85&format=auto`,
        });
      }
      return out;
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
     *  summon imports definition + avatar in one funnel pass, byte-deterministic (re-summons dedupe). */
    cardPngUrl(result) {
      return `${TAVERN_CDN}/${encPath(result.ref)}.png`;
    },
    fetchCard(_result, raw) {
      // The JSON FOLD (no PNG grant, or an over-cap/refused file): the detail payload's foreign
      // `definition_*` keys RESHAPED into the canonical `{data:{…}}` the import funnel reads. Field order is
      // FIXED and minimal: deterministic bytes ⇒ a re-summon dedupes by importHash instead of minting a twin.
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
    async search(q) {
      // Single-page source: the data route returns one whole result set and honors no paging param.
      // NSFW stays off by default (no `nsfw` param) — the seed posture.
      const json = await getJson(`https://realm.risuai.net/__data.json?search=${encodeURIComponent(q)}`);
      const root = decodeDataRoute(json);
      const cards = root !== null && Array.isArray(root.cards) ? root.cards : null;
      if (cards === null) {
        return null;
      }
      const out = [];
      for (const card of cards) {
        if (!isObj(card)) {
          continue;
        }
        const ref = str(card.id);
        const name = str(card.name);
        if (ref === undefined || name === undefined) {
          continue;
        }
        const downloadsN = parseCount(card.download);
        const img = str(card.img);
        out.push({
          source: "realm",
          ref,
          name: name.slice(0, NAME_MAX_CHARS),
          creator: str(card.authorname) ?? "unknown",
          downloadsN,
          downloadsLabel: fmtCount(downloadsN),
          tokens: "—", // realm rows carry no clean token count.
          tagline: "",
          // The cover by content hash on realm's resource CDN — full-size already, so it doubles as the hero.
          art: img === undefined ? "" : `${REALM_CDN}/resource/${encodeURIComponent(img)}`,
        });
      }
      return out;
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
    /** Realm's documented png-v3 card download. Per-card licensing 403s it for many cards — the summon
     *  ladder folds those to the JSON path below. */
    cardPngUrl(result) {
      return `https://realm.risuai.net/api/v1/download/png-v3/${encodeURIComponent(result.ref)}`;
    },
    async fetchCard(result) {
      // The JSON FOLD: realm's documented download API serves the card as native chara_card_v3 JSON — ingest
      // takes it as-is (`parseCardJson` reads V2 and V3 alike). An asset-heavy card can exceed the 1 MiB
      // response cap; the null fold below turns that into an honest sentence rather than a crash.
      const card = await getJson(`https://realm.risuai.net/api/v1/download/json-v3/${encodeURIComponent(result.ref)}`);
      return isObj(card) && !("error" in card) ? card : null;
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
 *  concurrency; each call is one claim on the shared egress belt). A per-cover failure is a placeholder,
 *  never fatal; one summarizing log line reports the batch. Mutates + persists the cache; returns how many
 *  new covers landed. */
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
    host.log.warn(`art: ${misses.length - landed} of ${misses.length} covers didn't land (rate floor / size caps / hub hiccups) — placeholders stand in.`);
  }
  if (landed > 0) {
    await saveArtCache(cache);
  }
  return landed;
}

const artKey = (result) => `${result.source}:${result.ref}`;
const heroKey = (result) => `${result.source}:${result.ref}:hero`;

// ── the FLOATING art continuations (the settlement-wall discipline) ────────────────────────────────────────
// An action invocation is bounded by the host's SETTLEMENT WALL (~6 s of real time for the WHOLE handler),
// and a fresh 24-cover batch structurally cannot fit inside it — one slow hub plus two dozen downloads is a
// deadline kill, a crash strike, and a respawned session (measured live, 2026-08-29). So the HANDLER publishes
// the text grid and RETURNS, and the art batch rides a FLOATING promise the host's job pump advances between
// invocations (the same mechanism the activation-time `void publishBrowse("")` below already rides). Each
// republish is guarded by SESSION IDENTITY, so a newer search is never overwritten by an older batch's art.

/** Fetch the missing covers for `rows` after the current invocation settles, then republish ONCE. */
function scheduleArtLoad(rows, status) {
  if (!canFetchArt()) {
    return;
  }
  void (async () => {
    const cache = await loadArtCache();
    const landed = await fetchMissingArt(cache, rows, artKey, (row) => row.art);
    if (landed > 0 && lastResults === rows) {
      await publishBrowse(status);
    }
  })().catch((err) => host.log.warn(`art batch failed: ${String(err)}`));
}

/** Fetch the sharper hero variant (where the hub serves one) after the invocation settles, then republish the
 *  still-open detail in place. */
function scheduleHeroUpgrade(result, blurb) {
  const heroUrl = SOURCES[result.source].heroUrl(result);
  if (heroUrl === null || !canFetchArt()) {
    return;
  }
  void (async () => {
    const cache = await loadArtCache();
    const landed = await fetchMissingArt(cache, [result], heroKey, () => heroUrl);
    if (landed > 0 && openResult !== null && openResult.result === result) {
      await publishDetail(result, blurb);
    }
  })().catch((err) => host.log.warn(`hero upgrade failed: ${String(err)}`));
}

// ── the owned-index (fast lookup) + the card stamp (durable provenance) ────────────────────────────────────
const ownedKey = (result) => `owned:${result.source}:${result.ref}`;

/** The PNG-first summon arm: card file → installer CAS → the SAME import funnel a hand-uploaded PNG takes,
 *  so the character arrives WITH its embedded avatar. `null` on ANY failure (no grant, no PNG on this hub,
 *  an over-cap file, a per-card license 403) — the caller folds to the JSON path. */
async function summonViaPng(result) {
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
    host.log.info(`png summon folded to JSON (${artKey(result)}): ${String(err)}`);
    return null;
  }
}

/** Summon one card: PNG-first (definition + avatar in one pass), JSON fold; then stamp + remember. Every
 *  arm answers a toast. */
async function summon(result, raw) {
  let outcome = await summonViaPng(result);
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
    await host.ui.toast("success", `${result.name} joins your library.`);
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
  const owned = await Promise.all(lastResults.map((result) => host.storage.get(ownedKey(result))));
  await host.ui.setState("atlas_page", {
    stage: "browse",
    status,
    tiles: lastResults.map((result, i) => {
      const cover = cachedArt(cache, artKey(result));
      return {
        id: `r${i}`,
        title: result.name,
        subtitle: result.downloadsN < 0 ? result.creator : `${result.creator} · ${result.downloadsLabel}↓`,
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
  // paints art INSTANTLY from cache and upgrades in place (openAction fetches the variant lazily).
  const art = cachedArt(cache, heroKey(result)) ?? cachedArt(cache, artKey(result)) ?? "";
  await host.ui.setState("atlas_page", {
    stage: "card",
    status: "",
    tiles: [],
    detail: {
      name: result.name,
      creator: result.creator,
      source: SOURCES[result.source].label,
      downloads: result.downloadsLabel,
      tokens: result.tokens,
      blurb: blurb || "(this card ships no description)",
      owned: ownedId === null ? "" : "Already in your library — summoning again just re-checks the bytes.",
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
                placeholder: "a name, a vibe, a fandom…",
                actionId: "search",
              },
              // The two subordinate controls, ALWAYS VISIBLE beside each other — a two-source switcher
              // collapsed under a "Filters" disclosure under-served the primary browse decision. The query
              // keeps the prominent slot above; these read as its qualifiers.
              {
                kind: "row",
                gap: "field",
                children: [
                  {
                    kind: "select",
                    name: "source",
                    label: "Hub",
                    options: [
                      { value: "tavern", label: "Character Tavern" },
                      { value: "realm", label: "RisuRealm" },
                    ],
                    value: "tavern",
                  },
                  {
                    kind: "select",
                    name: "sort",
                    label: "Sort",
                    options: [
                      { value: "relevance", label: "Best match" },
                      { value: "downloads", label: "Most downloaded" },
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
                empty: "Search to begin — the atlas covers Character Tavern and RisuRealm.",
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
              // The DECISION CLUSTER sits above the fold: provenance, the owned line, the two actions —
              // then the reading material below them at reading width.
              {
                kind: "keyValue",
                rows: [
                  { key: "Creator", value: { $state: "detail.creator" } },
                  { key: "From", value: { $state: "detail.source" } },
                  { key: "Downloads", value: { $state: "detail.downloads" } },
                  { key: "Tokens", value: { $state: "detail.tokens" } },
                ],
              },
              { kind: "text", voice: "gloss", value: { $state: "detail.owned" } },
              {
                kind: "row",
                gap: "field",
                children: [
                  { kind: "button", actionId: "back", label: "Back to results", variant: "outline" },
                  { kind: "button", actionId: "summon", label: "Summon to your library", variant: "neutral" },
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

/** The sort the person picked, applied to the NORMALIZED rows — plugin-side on purpose, so both hubs sort
 *  identically (Character Tavern ignores its own sort param; probed 2026-08-29). */
function sortRows(rows, key) {
  if (key === "downloads") {
    return [...rows].sort((a, b) => b.downloadsN - a.downloadsN);
  }
  if (key === "name") {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
  }
  return rows; // relevance = the hub's own order.
}

/** `search`: run the picked hub's search, sort + clamp, publish the text grid INSTANTLY, then land the art
 *  and republish once. Two paints, one honest status line each. */
async function searchAction(values) {
  const q = String(values.q ?? "").trim();
  if (q.length === 0) {
    await host.ui.toast("warn", "Type something to search for first.");
    return;
  }
  const sourceKey = values.source === "realm" ? "realm" : "tavern";
  const sortKey = values.sort === "downloads" || values.sort === "name" ? values.sort : "relevance";
  const label = SOURCES[sourceKey].label;
  // Feedback BEFORE the wire (the vocabulary has no loading skeleton yet): the status line speaks, the
  // previous results stay put — content-preserving, never a blank flash.
  await publishBrowse(`Searching ${label} for "${q}"…`);
  const results = await SOURCES[sourceKey].search(q);
  if (results === null) {
    await publishBrowse(`${label} didn't answer — try again in a moment.`);
    return;
  }
  lastResults = sortRows(results, sortKey).slice(0, PAGE_SIZE);
  openResult = null;
  const status = lastResults.length === 0 ? `Nothing on ${label} for "${q}".` : `${lastResults.length} from ${label} for "${q}".`;
  // Paint 1: the text grid, plus whatever covers the cache already holds — instant, inside the invocation.
  await publishBrowse(status);
  // Paint 2: the cover batch FLOATS past the settlement wall (see the continuation's own header) and
  // republishes once when it lands.
  scheduleArtLoad(lastResults, status);
}

/** `open_result`: resolve the clicked tile against the resident session, fetch the detail, flip the stage —
 *  then lazily upgrade the hero to the sharper variant where the hub serves one. */
async function openAction(values) {
  const index = Number(String(values.tile ?? "").slice(1));
  const result = lastResults[index];
  if (result === undefined) {
    await publishBrowse("That result went stale — search again."); // A respawn between search and click.
    return;
  }
  const detail = await SOURCES[result.source].detail(result);
  if (detail === null) {
    await publishBrowse(`${SOURCES[result.source].label} wouldn't show that card — try another.`);
    return;
  }
  openResult = { result, raw: detail.raw, blurb: detail.blurb };
  await publishDetail(result, detail.blurb); // Instant: the hero rides the cached grid cover.
  scheduleHeroUpgrade(result, detail.blurb); // The in-place upgrade floats past the settlement wall.
}

/** `summon`: the canon write, feature-detected at USE, then the detail republished with its owned line. */
async function summonAction() {
  if (openResult === null) {
    await publishBrowse("");
    return;
  }
  if (!host.grants.includes("character.ingest")) {
    await host.ui.toast("warn", "Summoning needs the character.ingest capability granted (Settings → Plugins).");
    return;
  }
  await summon(openResult.result, openResult.raw);
  // Republish from the SESSION's own copy of the blurb rather than re-fetching the detail: the summon arm
  // already spends up to one slow fetch, and the settlement wall prices a second one out of the invocation.
  await publishDetail(openResult.result, openResult.blurb);
}

/** The action router — one verb per affordance, dispatched by id; `back` (and any unknown id) goes home. */
async function runAtlasAction(actionId, values) {
  if (actionId === "search") {
    await searchAction(values);
  } else if (actionId === "open_result") {
    await openAction(values);
  } else if (actionId === "summon") {
    await summonAction();
  } else {
    openResult = null;
    await publishBrowse("");
  }
}

host.log.info(`card atlas ready — ${Object.keys(SOURCES).length} hubs on the shelf (grants: ${host.grants.join(", ") || "none"})`);
