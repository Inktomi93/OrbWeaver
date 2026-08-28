// Card Atlas — the HUB-BROWSER flagship: the biggest seeded example, and the template for a real product-
// sized plugin. Search two community card hubs, read a card on a proper detail page, and SUMMON it into your
// own library — search → grid → preview → import, entirely inside the app.
//
// WHAT THIS ONE TEACHES that the smaller examples cannot:
//
//  * A FULL-PAGE, MULTI-STAGE SURFACE. One `ui.page` registration, one `masterDetail` arrangement, one
//    `onAction` router. The BROWSE stage is a BOUND grid (`tilesFrom` — the tile count is DATA, so twelve
//    results are twelve tiles and three are three); the DETAIL stage is where the decision happens, so it
//    gets the design: name, provenance, the description at reading width, one summon button. Stage
//    navigation is ordinary published state (`active: {$state:"stage"}`), so leaving the Extensions section
//    and coming back lands you exactly where you were.
//
//  * TALKING TO THE OUTSIDE WORLD PROPERLY. `net.fetch` is host-performed, allowlisted to the two hosts the
//    manifest declares, 5 s / 1 MiB bounded, SSRF-guarded — and every response here is treated as UNTRUSTED
//    DATA: parsed defensively, malformed rows dropped (never thrown), failures folded into the status line.
//    Each hub is ONE source object with the same three verbs (`search` / `detail` / `fetchCard`), so adding
//    a third hub is adding one object to `SOURCES`.
//
//  * A CANON WRITE WITH PROVENANCE. `character.ingest` files the card into YOUR library (owner-scoped by
//    construction; byte-identical re-imports dedupe via importHash — `created: false` tells you). Then
//    `character.setCardData` stamps WHERE IT CAME FROM onto the card itself, under this plugin's own
//    reserved `data.extensions.plugin_card-atlas` key — the stamp is PORTABLE (it survives export→import)
//    and no other plugin can read or forge it. The private `storage.kv` index of what you already own is the
//    fast lookup; the card stamp is the durable truth. Two state planes, two jobs.
//
//  * RESIDENT SESSION STATE. `lastResults` below is a plain module variable: a resident guest lives from
//    activation to disable, so a browse session (which result was #3?) is honestly module state. It dies on
//    respawn — which is EXACTLY right for a search session, and exactly wrong for the owned-index, which is
//    why THAT lives in storage. Choose the plane by the data's lifetime, not by habit.
//
// WHAT IT HONESTLY CANNOT DO (so you do not copy a mirage): remote COVER ART. An `image`/tile cover is an
// asset in the installer's own CAS — a URL is unspellable (the exfil wall), and `net.fetch` returns text,
// not bytes. So the browse grid is title-forward with placeholder covers, and the art arrives the moment
// you summon the card... into the room, where the character's own avatar pipeline owns it. A future
// bundle-assets phase may widen this; design against today's walls, not tomorrow's.

const host = orb.host(1);

/** Result-page size — what a browse SCREEN wants, well under the grid's 64-tile cap. */
const PAGE_SIZE = 24;
/** Display clamps. The markdown node's own cap is 2 KiB; staying under it keeps the belt quiet. */
const BLURB_MAX_CHARS = 1800;
const NAME_MAX_CHARS = 80;
/** The one status every fetch folds into — HTTP's own "OK" band. */
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;

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

/** RisuRealm reports downloads as a compact string ("16.3k"); Character Tavern as a number. One reader. */
function countLabel(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  return str(raw) ?? "?";
}

// ── devalue un-flattening (RisuRealm's SvelteKit data route) ───────────────────────────────────────────────
// Realm's search rides its app's own `/__data.json` route, whose payload is devalue-FLATTENED: one shared
// value pool where every array element / object value is an integer POINTER into the pool (a value referenced
// twice is stored once). Hydrating is a memoized recursive pointer-chase; the negative indices are sentinels
// for the non-JSON primitives, and a `["Date", …]` tagged tuple is returned verbatim (no card field needs
// one). Carried from the app's own retired hub feature, re-verified against the live wire on 2026-08-28.

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

// ── the sources — one object per hub, three verbs each ─────────────────────────────────────────────────────
// `search(q)` → result rows; `detail(result)` → the display fields; `fetchCard(result)` → the canonical card
// object `character.ingest` accepts. Adding a hub = adding an object here (and its host to the manifest's
// netHosts — which WIDENS REACH, so an upgrade doing that lands disabled pending re-consent, by design).

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
        out.push({
          source: "tavern",
          ref,
          name: name.slice(0, NAME_MAX_CHARS),
          creator: str(hit.author) ?? "unknown",
          downloads: countLabel(hit.downloads),
          tokens: typeof hit.totalTokens === "number" ? String(hit.totalTokens) : "?",
          tagline: str(hit.tagline) ?? "",
        });
      }
      return out;
    },
    async detail(result) {
      // The detail endpoint's `card` carries BOTH the listing prose and the full `definition_*` fields —
      // one fetch serves the preview and the import (cached on the open result).
      const path = result.ref
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
      const json = await getJson(`https://character-tavern.com/api/character/${path}`);
      const card = isObj(json) && isObj(json.card) ? json.card : null;
      if (card === null) {
        return null;
      }
      return {
        blurb: (str(card.description) ?? result.tagline ?? "").slice(0, BLURB_MAX_CHARS),
        raw: card,
      };
    },
    fetchCard(_result, raw) {
      // Character Tavern serves no card FILE — its detail payload carries the definition under foreign
      // `definition_*` keys, so the atlas RESHAPES them into the canonical `{data:{…}}` the import funnel
      // reads. Field order is FIXED and minimal: deterministic bytes ⇒ a re-summon dedupes by importHash
      // instead of minting a twin.
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
      put("creator", str(raw.author) ?? undefined);
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
        out.push({
          source: "realm",
          ref,
          name: name.slice(0, NAME_MAX_CHARS),
          creator: str(card.authorname) ?? "unknown",
          downloads: countLabel(card.download),
          tokens: "?", // realm rows carry no clean token count.
          tagline: "",
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
    async fetchCard(result) {
      // Realm's DOCUMENTED download API serves the card as native chara_card_v3 JSON — ingest takes it
      // as-is (`parseCardJson` reads V2 and V3 alike). An asset-heavy card can exceed the 1 MiB response
      // cap; the null fold below turns that into an honest sentence rather than a crash.
      const card = await getJson(`https://realm.risuai.net/api/v1/download/json-v3/${encodeURIComponent(result.ref)}`);
      return isObj(card) && !("error" in card) ? card : null;
    },
  },
};

// ── the owned-index (fast lookup) + the card stamp (durable provenance) ────────────────────────────────────
const ownedKey = (result) => `owned:${result.source}:${result.ref}`;

/** Summon one card: fetch → ingest → stamp → remember. Every arm answers a toast. */
async function summon(result, raw) {
  const card = await SOURCES[result.source].fetchCard(result, raw);
  if (card === null) {
    await host.ui.toast("error", `${SOURCES[result.source].label} wouldn't hand the card over — try again in a moment.`);
    return;
  }
  const { characterId, created } = await host.character.ingest(card);
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
  const owned = await Promise.all(lastResults.map((result) => host.storage.get(ownedKey(result))));
  await host.ui.setState("atlas_page", {
    stage: "browse",
    status,
    tiles: lastResults.map((result, i) => ({
      id: `r${i}`,
      title: result.name,
      subtitle: `${result.creator} · ${result.downloads}↓`,
      ...(owned[i] === null ? {} : { badge: "in your library" }),
    })),
    detail: {},
  });
}

async function publishDetail(result, blurb) {
  const ownedId = await host.storage.get(ownedKey(result));
  await host.ui.setState("atlas_page", {
    stage: "card",
    status: "",
    tiles: [],
    detail: {
      name: result.name,
      creator: result.creator,
      source: SOURCES[result.source].label,
      downloads: result.downloads,
      tokens: result.tokens,
      blurb: blurb || "(this card ships no description)",
      owned: ownedId === null ? "" : "Already in your library — summoning again just re-checks the bytes.",
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
                filters: [
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
          body: {
            kind: "stack",
            gap: "block",
            children: [
              {
                kind: "keyValue",
                rows: [
                  { key: "Creator", value: { $state: "detail.creator" } },
                  { key: "From", value: { $state: "detail.source" } },
                  { key: "Downloads", value: { $state: "detail.downloads" } },
                  { key: "Tokens", value: { $state: "detail.tokens" } },
                ],
              },
              { kind: "markdown", value: { $state: "detail.blurb" } },
              { kind: "text", voice: "gloss", value: { $state: "detail.owned" } },
              {
                kind: "row",
                gap: "field",
                children: [
                  { kind: "button", actionId: "back", label: "Back to results", variant: "outline" },
                  { kind: "button", actionId: "summon", label: "Summon to your library", variant: "neutral" },
                ],
              },
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

/** `search`: run the picked hub's search, remember the page, publish the tiles + an honest status line. */
async function searchAction(values) {
  const q = String(values.q ?? "").trim();
  if (q.length === 0) {
    await host.ui.toast("warn", "Type something to search for first.");
    return;
  }
  const sourceKey = values.source === "realm" ? "realm" : "tavern";
  const label = SOURCES[sourceKey].label;
  const results = await SOURCES[sourceKey].search(q);
  if (results === null) {
    await publishBrowse(`${label} didn't answer — try again in a moment.`);
    return;
  }
  lastResults = results.slice(0, PAGE_SIZE);
  openResult = null;
  await publishBrowse(lastResults.length === 0 ? `Nothing on ${label} for "${q}".` : `${lastResults.length} from ${label} for "${q}".`);
}

/** `open_result`: resolve the clicked tile against the resident session, fetch the detail, flip the stage. */
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
  openResult = { result, raw: detail.raw };
  await publishDetail(result, detail.blurb);
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
  const detail = await SOURCES[openResult.result.source].detail(openResult.result);
  await publishDetail(openResult.result, String(detail?.blurb ?? ""));
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
