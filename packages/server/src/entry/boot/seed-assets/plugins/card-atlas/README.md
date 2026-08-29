# Card Atlas

**Archetype: the hub browser — the flagship.** A product-sized plugin: external APIs, remote art done
safely, a multi-stage page, real pagination, honest filtering, canon writes with provenance. Start here
if your idea is "browse something out there and bring it home".

Search SIX community hubs — Character Tavern, RisuRealm, Chub, Wyvern, AI Character Cards, CharaVault —
without leaving the app: real cover art in the grid, page through the results, filter by tags, a proper
detail page with a hero — and ADD a card to your library with its avatar riding along: search → art
grid → filter → page → preview → import, dedupe-aware and provenance-stamped.

## Copy me

```bash
cp -r packages/server/src/entry/boot/seed-assets/plugins/card-atlas /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack card-atlas ./out
```

## The manifest

```json
"capabilities": ["storage.kv", "ui.surface", "net.fetch", "net.fetch_asset", "character.ingest", "character.card_state"],
"netHosts": ["character-tavern.com", "ct-cards.storage.character-tavern.com", "realm.risuai.net", "sv.risuai.xyz",
             "api.chub.ai", "avatars.charhub.io", "api.wyvern.chat", "imagedelivery.net",
             "api.aicharactercards.com", "charavault.net"]
```

`netHosts` is the SSRF allowlist AND the consent artifact — matching is EXACT, so each hub's art CDN is
its own entry (the grant screen shows all ten, and adding one later is WIDENED REACH: the upgrade lands
disabled pending re-consent, by design). `net.fetch_asset` is the art door: the host downloads an image
from an allowlisted host into YOUR OWN storage and hands back a bare assetId — no URL is ever spellable
in a rendered node, and no bytes ever enter the plugin. `character.ingest` is a canon write into the
installer's OWN library; `character.card_state` is the per-card provenance stamp.

## The page — how a big surface stays one file

One `ui.page` registration, one `masterDetail`, one action router (`runAtlasAction`) with one small
function per verb. The BROWSE stage: a `searchBar` whose collapsed disclosure holds the tag filters (the
long tail belongs in the disclosure; the Hub switcher does NOT — it sits always-visible with Sort right
below the query, and BOTH are LIVE: a pick re-runs the search via the select's `actionId`, never sits
inert behind a second click), one status line every failure folds into, a BOUND grid (`tilesFrom` —
twelve results are twelve tiles, three are three) whose covers are real art and whose tiles wear their
tag chips, and a pager row. The DETAIL stage is where a person decides, so it gets the design: hero art,
the provenance rows (tags included), the add-to-library decision above the fold, the description at
reading width. `active: {$state:"stage"}` makes navigation ordinary published state — leave the
Extensions section and come back, and you are where you were.

## Paging — normalize the CONTROL, not the provider

The hubs page differently and the person gets ONE Previous/Next control anyway. Five hubs serve real
server pages (Character Tavern's fixed 30 + `totalPages`; Chub's `first=`/`page=` + `count`; Wyvern's
fixed 10 + `totalPages`; AI Character Cards' `limit`/`skip` + `pagination.total`; CharaVault's
`limit`/`offset` + `total`), so Next is one more fetch with the same query and filters. RisuRealm
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
* **RisuRealm, Wyvern, AI Character Cards, CharaVault** publish per-row tags → include AND exclude
  apply plugin-side (over the whole held set for RisuRealm; per fetched page for the server-paged
  three), and chips render on tiles and the detail.

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

Each hub is one `SOURCES` entry emitting the same normalized row `{source, ref, name, creator,
downloadsN, downloadsLabel, tokens, tagline, art, tags}` — which is why all six render
pixel-identically, sort identically (one plugin-side pass over `downloadsN`, plus a hub's own server
sort where it has one), and filter through one dialect. Each entry also DECLARES its capability facts
(`paging`, `rowTags`, `serverInclude`, `serverExclude`, `headers`) so the session and the status line
adapt without special-casing hub names. **Adding a hub is adding one object here plus its hosts to
`netHosts`** — nothing else changes; that seam is the design.

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
native-V2 detail payload. A PNG-ONLY hub (Chub, AI Character Cards, CharaVault) whose PNG arm fails
answers an honest error toast — never a lossy fabricated card.

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
* **Server-paged hubs sort the page in hand, not the corpus** — except where a server sort exists and
  is passed through (Chub's `star_count`, AICC's `downloadCount`). RisuRealm sorts its whole held set.
* **A card added before the art era re-adds as a twin.** The PNG path and the old JSON path produce
  different bytes, so importHash cannot connect them. One-time edge across the upgrade.
* **PNG downloads are per-card on RisuRealm.** Many realm cards license `json-v3` only (the `png-v3`
  arm 403s); those import art-less via the JSON fold. A PNG bigger than the 5 MiB asset cap folds the
  same way (or, on a PNG-only hub, answers the honest toast).
* **SFW by default.** Per-row content flags (`isNSFW`/`nsfw_image`/`isNsfw`/`nsfw`, Wyvern's rating
  markers) are honored in the row mappers; Chub gets `nsfw=false`; the realm search omits its nsfw
  param. A copy that wants otherwise owns that decision explicitly.
* **Row-tag filters on server-paged hubs filter the fetched page**, so a filtered page can show fewer
  than a full page while Next still advances — the status line's count is the honest one.
* **Hub APIs drift.** Every wired hub's search shape (and its art host) was probed live on 2026-08-29 —
  and one had ALREADY drifted since the legacy adapters (`q=` → `query=`, chub's `nDownloads` gone
  null); every decoder degrades to "no results" + a log line on drift rather than crashing.
* **The wider roster** (pygmalion, janitorai, datacat…) was never built anywhere — each needs its own
  probe campaign (endpoints, shapes, art hosts, quirks) before it can be one more `SOURCES` object.
  BotBooru has a built legacy adapter but its DEFAULT feed includes NSFW (rating derived from tags) —
  wiring it into a seeded SFW example is a content-posture call this copy does not make.
