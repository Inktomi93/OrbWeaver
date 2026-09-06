# Card Atlas

**Archetype: the hub browser — the flagship.** A product-sized plugin: external APIs, remote art done
safely, a multi-stage page, real pagination, honest filtering, canon writes with provenance. Start here
if your idea is "browse something out there and bring it home".

Search NINE community hubs — Character Tavern, RisuRealm, Chub, Wyvern, AI Character Cards, CharaVault,
BotBooru, Pygmalion, Datacat — without leaving the app: real cover art in the grid, each hub's OWN sort
menu, page through the results, filter by tags and content rating, a proper detail page with a hero and
the card's full stat sheet — and ADD a card to your library with its avatar riding along: search → art
grid → sort/filter → page → preview → import, dedupe-aware and provenance-stamped.

## Copy me

```bash
cp -r packages/showcase-plugins/bundles/card-atlas /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack card-atlas ./out
```

## The manifest

```json
"capabilities": ["storage.kv", "ui.surface", "net.fetch", "net.fetch_asset", "character.ingest", "character.card_state"],
"netHosts": ["character-tavern.com", "ct-cards.storage.character-tavern.com", "realm.risuai.net", "sv.risuai.xyz",
             "api.chub.ai", "avatars.charhub.io", "api.wyvern.chat", "imagedelivery.net",
             "api.aicharactercards.com", "charavault.net", "botbooru.com", "server.pygmalion.chat",
             "assets.pygmalion.chat", "datacat.run", "media.datacat.run", "ella.janitorai.com"]
```

`netHosts` is the SSRF allowlist AND the consent artifact — matching is EXACT, so each hub's art CDN is
its own entry (the grant screen shows all sixteen, and adding one later is WIDENED REACH: the upgrade
lands disabled pending re-consent, by design). `net.fetch_asset` is the art door: the host downloads an image
from an allowlisted host into YOUR OWN storage and hands back a bare assetId — no URL is ever spellable
in a rendered node, and no bytes ever enter the plugin. `character.ingest` is a canon write into the
installer's OWN library; `character.card_state` is the per-card provenance stamp.

## The page — how a big surface stays one file

One `ui.page` registration, one `masterDetail`, one action router (`runAtlasAction`) with one small
function per verb. The BROWSE stage: a `searchBar` whose collapsed disclosure holds the tag filters (the
long tail belongs in the disclosure; the Hub switcher does NOT — it sits always-visible with Sort and
the SFW toggle right below the query, and ALL THREE are LIVE via `actionId`: a pick or a flip re-runs
the search, never sits inert behind a second click), one status line every failure folds into, a BOUND
grid (`tilesFrom` — twelve results are twelve tiles, three are three) whose covers are real art and
whose tiles wear their tag chips, and a pager row. The grid's `loading` is BOUND too: because every
handler publishes before it floats its wire work (the settlement wall), a search or a page flip paints
the house shape-matched skeleton instead of leaving the previous query's tiles under a status line
saying a different query is running. The Sort select's OPTIONS ARE BOUND (`optionsFrom`):
each hub publishes exactly the orderings it honors, so the menu is per-hub truth, not a superset wish.
The DETAIL stage is where a person decides, so it gets the design: hero art, the BOUND stat sheet
(`rowsFrom` — provenance plus exactly the counters this hub returned), the add-to-library decision above
the fold, the description at reading width. `active: {$state:"stage"}` makes navigation ordinary
published state — leave the Extensions section and come back, and you are where you were.

## Sorting — mined menus, one comparator dialect

Every hub's sort menu is exactly what it provably honors (probed live 2026-08-29): Chub's six server
sorts (which need `asc=false` or they silently no-op — and which chub itself ignores under a text query,
so the plugin re-sorts the page in hand to keep the display promise), RisuRealm's `trending`/`downloads`
on its data route, AICC's three `orderBy`s, CharaVault's `newest`/`oldest`, BotBooru's
`downloads`/`favorites`/`views`, Pygmalion's `downloads`/`stars`/`views`/`created`, Datacat's
`chat_count`. Where rows carry a counter the hub won't sort by (Character Tavern's downloads and likes),
the ordering runs page-side — and Name A–Z runs page-side everywhere. One comparator map over the
normalized stat bag (`n`) serves every arm; rows missing a datum sort last, never as zero.

## The SFW filter — a per-person config, honestly plumbed

Default OFF = show everything (no gate, no blur). ON: the hubs that speak a rating param get it
server-side (Chub's `nsfw` include-switch, RisuRealm's `nsfw` opt-in, BotBooru's `sfw_only`); the hubs
that only FLAG rows are filtered row-side (`isNSFW`/`isNsfw`/`nsfw`/Wyvern's rating markers/BotBooru's
Meta tags — the flag is also a belt on the server-filtered hubs). Pygmalion's public catalog is
SFW-curated by the hub itself, so the toggle has nothing to do there. Labeling is SEPARATE honesty:
a flagged row wears an `nsfw` chip and a "Content" stat row whether or not the filter is on. The
setting persists in `storage.kv` and seeds the toggle's registered value at the next activation —
the switch shows the truth after a respawn instead of quietly resetting.

## Paging — normalize the CONTROL, not the provider

The hubs page differently and the person gets ONE Previous/Next control anyway. Eight hubs serve real
server pages (Character Tavern's fixed 30 + `totalPages`; Chub's `first=`/`page=` + `count`; Wyvern's
fixed 10 + `totalPages`; AI Character Cards' `limit`/`skip` + `pagination.total`; CharaVault's
`limit`/`offset` + `total`; BotBooru's `page`/`limit` + `total`; Pygmalion's 0-based `page`/`pageSize` +
`totalItems`; Datacat's `limit`/`offset` + `totalCount`), so Next is one more fetch with the same query
and filters. RisuRealm
serves ONE whole result set (~60 rows; its route 500s on any `page` > 1), so the session holds the set
— filtered and sorted once — and page flips slice it locally, no wire at all. The session (`session` in
`main.js`) is where that provider difference lives and dies; the handlers and the pager row never know
which shape they are paging.

## Filtering — one tag dialect, honest about capability

Genre words ARE tags on every hub (none has a separate genre field), so the filter surface is two
comma-separated fields: include (every tag must match) and exclude (any tag hides a card). One
normalizer (`normTags`) lowercases both the rows' tags and the person's typed words, so they compare
equal by construction. Where each applies is a PROVIDER FACT each source object DECLARES
(`rowTags`/`serverInclude`/`serverExclude`), not a UI choice:

* **Chub** filters include AND exclude server-side (`topics=`/`excludetopics=` — the only hub with a
  native exclude) and its rows carry tags for the chips.
* **Character Tavern** publishes NO per-row tags on any public JSON surface, but honors a server-side
  `tags=a,b` AND-filter → includes apply server-side (whole-corpus, filtered page counts), excludes
  CANNOT apply — and the status line says so instead of silently no-opping. Its tiles carry no chips
  and its detail's Tags row reads "—", because pretending would be worse.
* **RisuRealm, Wyvern, AI Character Cards, CharaVault, BotBooru** publish per-row tags → include AND
  exclude apply plugin-side (over the whole held set for RisuRealm; per fetched page for the
  server-paged four), and chips render on tiles and the detail. (BotBooru's legacy `tags=` param is
  dead on today's wire — row-side is the honest arm.)
* **Pygmalion and Datacat** publish NO usable tags (pyg's include param returns empty for common words
  and its rows carry none; datacat's tags live only on the detail payload) → tag filters cannot judge
  there, and the status line says so instead of silently no-opping.

## The art plane — `net.fetchAsset` on its own belt

Every cover is `net.fetchAsset(url)` → an assetId in the installer's CAS → published in state → bound by
`tilesFrom` covers and the detail stage's `hero.assetFrom`. Three disciplines make it a good citizen:

* **Art rides its own belt.** `net.fetchAsset` has its own hourly floor (1200/plugin), split from
  `net.fetch`'s (360/plugin) — so a page of ~30 covers can never starve search, and paging through a
  whole catalog stays free of budget arithmetic. The `art_cache` (ONE kv key, LRU-trimmed, 24 h TTL) is
  a SPEED cache: a page you flip back to paints instantly instead of re-downloading.
* **Handlers answer; the wire FLOATS.** An action invocation has ~6 s of real time to settle, and a
  community hub can stream a body slower than that (measured live) — so no handler awaits the hubs.
  Search, page and open validate, publish an honest status ("Searching…", "Fetching page 2…"), and
  schedule a floating continuation the host pumps between invocations: fetch → text grid → cover batch
  → one republish, each publish guarded by a session sequence so a superseded fetch never overwrites a
  newer page. Add-to-library is the one priced exception (its toasts ride the invocation's own outcome).
* **Placeholders, never breakage.** Any cover that fails (the 5 MiB asset cap, a hub hiccup) degrades to the
  shape-matched placeholder tile with a log line. Ungranted `net.fetch_asset` degrades the whole plugin
  to the art-less browse it was before — feature-detect, never crash.

## The sources — one object per hub, ONE normalized row

Each hub is one `SOURCES` entry emitting the same normalized row `{source, ref, name, creator, pop, n,
nsfw, tagline, art, tags}` — `pop` its best live popularity label, `n` the mined stat bag (each hub a
different honest subset), `nsfw` a tri-state content flag — which is why all nine render
pixel-identically, sort through one comparator dialect, and filter through one tag dialect. Each entry
also DECLARES its capability facts (`paging`, `rowTags`, `serverInclude`, `serverExclude`, `headers`,
`sortOptions`) so the session, the Sort menu and the status line adapt without special-casing hub
names. **Adding a hub is adding one object here plus its hosts to `netHosts`** — nothing else changes;
that seam is the design.

* **Character Tavern** — a clean JSON search (`/api/search/cards?query=&tags=&page=` — the `query`
  param spelling matters: the older `q=` silently returns the unfiltered firehose) and a detail
  endpoint whose `card` carries the full definition under `definition_*` keys. Art rides the storage
  CDN: the 320-wide variant covers the grid, the 640-wide one upgrades the hero lazily, and the BARE
  png embeds the full card in its `chara` chunk — the PNG-first import.
* **RisuRealm** — search rides its app's SvelteKit `/__data.json` route, whose payload is
  devalue-FLATTENED (a shared value pool addressed by integer pointers); `unflattenDevalue` is the
  memoized pointer-chase that hydrates it. Covers come off the resource CDN by content hash
  (full-size ~2-3 MB JPEGs, no Content-Type header — the host's image guard judges magic bytes and its
  5 MiB asset cap admits them). Downloads ride the documented `png-v3`/`json-v3` APIs.
* **Chub** — `api.chub.ai/search` with the widest filter surface in the scene (native include AND
  exclude, server sort). Bot-filters a bare client UA, so its source declares the browser header pair.
  Covers are the light `avatar.webp`; the full `chara_card_v2.png` is both the hero upgrade and the
  PNG-first import. Its live popularity signal is `starCount` (`nDownloads` comes back null on
  today's wire) — the ★ label says so.
* **Wyvern** — the cleanest API (`exploreSearch/characters`, no auth, no quirks); rows carry tags and
  a full Cloudflare-Images cover URL (`imagedelivery.net` apex). Its by-id payload IS native V2 card
  JSON, so the detail fetch doubles as the import body. No popularity signal on the public feed.
* **AI Character Cards** — curated and low-volume; `limit`/`skip` paging, `orderBy=downloadCount`
  server sort, per-card `isNsfw` honored in the mapper. Rows carry a relative webp cover on the API
  host; the native V2 PNG at `/download` is both the hero upgrade and the import.
* **CharaVault** — the 95K-card aggregator (mirrors chub/janitor content — the import-side byte dedupe
  matters most here). Bot-filters a bare UA (same header pair as chub). Its card PNG doubles as its
  cover — heavy but honest; an outsized one folds to the placeholder.
* **BotBooru** — the booru-model archive: its browse JSON gates on an `X-Requested-With:
  XMLHttpRequest` header (without it you get the SPA shell), rows carry the widest counter set
  (downloads/favorites/views/comments/tokens) plus CATEGORIZED tags (the machine-housekeeping "Auto"
  category stays off the chips), and its rating IS a tag (`sfw`/`nsfw`/`nsfl`). No JSON detail route
  exists — the detail is the downloaded native-V2 card body itself, which then doubles as the JSON
  import fold; `/download/png/{id}` is the PNG-first arm and the cover (no thumbnail variant exists).
* **Pygmalion** — a connect-RPC service (`POST CharacterSearch`/`Character` with a JSON message; page
  is 0-based). The public catalog is SFW-curated and answers UNAUTHENTICATED with rich counters
  (downloads/stars/views/chats) — the legacy-era "every path 404s" verdict is dead. The detail's
  `personality` (persona + greeting) is the JSON import fold; avatars ride `assets.pygmalion.chat`.
  No card file, no usable tag vocabulary.
* **Datacat** — the working JanitorAI mirror ("liberator"): mint an anonymous session token once
  (`POST /api/liberator/identify`, cached in kv, re-minted on a 401), then browse `recent-public` with
  the token header. Rows carry chat/message/favorite counters and a real `isNsfw` flag; covers ride
  its variant CDN (`media.datacat.run` — thumb for tiles, card for the hero). The card download route
  sits behind a Turnstile wall, so the import fold reads the detail's recovered `chara_card_v2_json`
  (or the recovered fields) — a DEGRADED row (profile recovered, definition not) answers an honest
  error toast.

Every response is UNTRUSTED DATA: parsed defensively, malformed rows dropped (one bad hit must not blank
a page), every failure a status-line sentence. The fetches themselves are host-performed — allowlisted,
5 s deadline, size-capped (1 MiB text / 5 MiB art), SSRF-guarded — so none of that defense is about the
transport; it is about the shapes.

## Add to library — PNG-first, so the art arrives with the character

`addViaPng`: `net.fetchAsset(card png)` → `character.ingestAsset(assetId)` — the SAME import funnel a
hand-uploaded card file takes, so the embedded definition AND avatar land in one deterministic pass
(byte-identical re-adds dedupe via importHash; `created: false` tells you). Where a hub serves card
JSON instead, the fold rides `character.ingest`: Character Tavern's `definition_*` reshape (fixed field
order — deterministic bytes are what make the dedupe hold), RisuRealm's native `json-v3`, Wyvern's
native-V2 detail payload, BotBooru's downloaded card body, Pygmalion's `personality` reshape, Datacat's
recovered `chara_card_v2_json`. A PNG-ONLY hub (Chub, AI Character Cards, CharaVault) whose PNG arm
fails answers an honest error toast — never a lossy fabricated card.

Then provenance, two planes, two jobs: `setCardData(characterId, {source, ref, importedAtMs})` stamps
the origin onto the card itself under this plugin's own reserved `data.extensions.plugin_card-atlas` key
— PORTABLE (survives export→import), unforgeable (the host stamps the namespace from the manifest slug),
readable by this plugin alone. The private `storage.kv` `owned:` index is the fast lookup that badges
results "in your library"; the card stamp is the durable truth.

Also note `session`, a plain module variable: a resident guest lives from activation to disable, so a
browse session (query, filters, which page) is honestly MODULE state — gone on respawn, which is right
for a session and wrong for the owned-index and the art cache (which is why THOSE are storage). Choose
the plane by the data's lifetime.

## Honest gaps

* **Character Tavern publishes no per-row tags** — so no tag chips on its tiles, "—" on its detail, and
  exclude-filters can't apply there (include works, server-side). If the hub ever projects tags into
  its search hits, `tavernRow` + `rowTags: true` is the whole fix.
* **RisuRealm's deep corpus is unreachable** — one response is the whole set its route will give
  (~60 rows; `page` > 1 500s server-side). Paging slices what exists.
* **Server-paged hubs sort the page in hand where no server sort exists** (Character Tavern's
  downloads/likes, Name A–Z everywhere) — and Chub keeps relevance order under a text query no matter
  what `sort=` says, so its page is re-sorted in hand too. RisuRealm sorts its whole held set. The
  menu only ever offers what one of those two mechanisms can honestly deliver.
* **A card added before the art era re-adds as a twin.** The PNG path and the old JSON path produce
  different bytes, so importHash cannot connect them. One-time edge across the upgrade.
* **PNG downloads are per-card on RisuRealm.** Many realm cards license `json-v3` only (the `png-v3`
  arm 403s); those import art-less via the JSON fold. A PNG bigger than the 5 MiB asset cap folds the
  same way (or, on a PNG-only hub, answers the honest toast).
* **The SFW filter is only as good as the hub's own flags.** Where a hub neither speaks a rating param
  nor flags rows consistently, an unflagged NSFW card passes the filter — the filter honors what the
  hub says, it cannot out-know it. Pygmalion needs an account token for its NSFW catalog
  (`includeSensitive` is auth-gated), which a seeded example does not carry — its rows are the hub's
  own SFW curation either way.
* **Datacat is a scrape-mirror.** It surfaces JanitorAI's catalog through its own recovery pipeline —
  DEGRADED rows recovered a profile but not the definition (those answer an honest toast at
  add-to-library), its card download route is Turnstile-walled (never used), and its `nsfw=` param is
  ignored (the row flag is judged instead).
* **JanitorAI itself is NOT wired.** It has no public API; the jannyai mirror route needs scraped
  search tokens through a third-party CORS proxy — a pattern this codebase gate-bans. Datacat is the
  janitor catalog through a real API; that is the honest arm.
* **Row-tag filters on server-paged hubs filter the fetched page**, so a filtered page can show fewer
  than a full page while Next still advances — the status line's count is the honest one.
* **Hub APIs drift.** Every wired hub's search shape, sort menu, rating plumbing and art host was
  probed live on 2026-08-29 — and three had ALREADY drifted since the legacy adapters (`q=` →
  `query=`, chub's `nDownloads` gone null and its sorts needing `asc=false`, botbooru's `tags=` and
  curated sorts dead) while one had come back from the dead (pygmalion answers today). Every decoder
  degrades to "no results" + a log line on drift rather than crashing.
