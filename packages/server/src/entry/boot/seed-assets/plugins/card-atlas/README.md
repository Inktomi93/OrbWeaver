# Card Atlas

**Archetype: the hub browser — the flagship.** A product-sized plugin: external APIs, remote art done
safely, a multi-stage page, canon writes with provenance. Start here if your idea is "browse something
out there and bring it home".

Search Character Tavern and RisuRealm without leaving the app — real cover art in the grid, a proper
detail page with a hero, one sort dialect across both hubs — and SUMMON a card into your library with
its avatar riding along: search → art grid → preview → import, dedupe-aware and provenance-stamped.

## Copy me

```bash
cp -r packages/server/src/entry/boot/seed-assets/plugins/card-atlas /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack card-atlas ./out
```

## The manifest

```json
"capabilities": ["storage.kv", "ui.surface", "net.fetch", "net.fetch_asset", "character.ingest", "character.card_state"],
"netHosts": ["character-tavern.com", "ct-cards.storage.character-tavern.com", "realm.risuai.net", "sv.risuai.xyz"]
```

`netHosts` is the SSRF allowlist AND the consent artifact — matching is EXACT, so each hub's art CDN is
its own entry (the grant screen shows all four, and adding one later is WIDENED REACH: the upgrade lands
disabled pending re-consent, by design). `net.fetch_asset` is the art door: the host downloads an image
from an allowlisted host into YOUR OWN storage and hands back a bare assetId — no URL is ever spellable
in a rendered node, and no bytes ever enter the plugin. `character.ingest` is a canon write into the
installer's OWN library; `character.card_state` is the per-card provenance stamp.

## The page — how a big surface stays one file

One `ui.page` registration, one `masterDetail`, one action router (`runAtlasAction`) with one small
function per verb. The BROWSE stage: a `searchBar` over an always-visible Hub + Sort row (a two-source
switcher buried in a disclosure under-serves the primary browse decision), one status line every failure
folds into, and a BOUND grid (`tilesFrom` — twelve results are twelve tiles, three are three) whose
covers are real art. The DETAIL stage is where a person decides, so it gets the design: hero art, the
provenance rows, the summon decision above the fold, the description at reading width. `active:
{$state:"stage"}` makes navigation ordinary published state — leave the Extensions section and come
back, and you are where you were.

## The art plane — `net.fetchAsset` and the budget it lives on

Every cover is `net.fetchAsset(url)` → an assetId in the installer's CAS → published in state → bound by
`tilesFrom` covers and the detail stage's `hero.assetFrom`. Three disciplines make it a good citizen:

* **One shared budget.** `net.fetch` and `net.fetchAsset` draw on ONE hourly belt (120/plugin), and a
  fresh 24-tile search spends ~25 claims — so uncached art would starve search itself. The `art_cache`
  (ONE kv key, LRU-trimmed, 24 h TTL) makes repeat searches cost a single claim.
* **Two paints per search — and the second one FLOATS.** The action handler publishes the text grid the
  instant results land (with whatever covers the cache holds) and RETURNS: an invocation has ~6 s of
  real time to settle, and a search plus a 24-cover batch does not fit inside it. The cover batch rides
  a floating promise the host pumps between invocations, then republishes once — guarded by session
  identity so an older batch never overwrites a newer search. The status line speaks during the wait.
* **Placeholders, never breakage.** Any cover that fails (rate floor, the 1 MiB cap, a hub hiccup)
  degrades to the shape-matched placeholder tile with a log line. Ungranted `net.fetch_asset` degrades
  the whole plugin to the art-less browse it was before — feature-detect, never crash.

## The sources — one object per hub, ONE normalized row

Each hub is one `SOURCES` entry emitting the same normalized row `{source, ref, name, creator,
downloadsN, downloadsLabel, tokens, tagline, art}` — which is why both hubs render pixel-identically and
sort identically (sorting is plugin-side over `downloadsN`; Character Tavern ignores its own sort param,
probed 2026-08-29). Adding a hub is adding one object (plus its hosts to `netHosts`).

* **Character Tavern** — a clean JSON search (`/api/search/cards`) and a detail endpoint whose `card`
  carries the full definition under `definition_*` keys. Art rides the storage CDN
  (`ct-cards.storage.character-tavern.com/<path>.png` + resize params): the 320-wide variant covers the
  grid, the 640-wide one upgrades the hero lazily, and the BARE png embeds the full card in its `chara`
  chunk — which is what makes the PNG-first summon possible.
* **RisuRealm** — search rides its app's SvelteKit `/__data.json` route, whose payload is
  devalue-FLATTENED (a shared value pool addressed by integer pointers); `unflattenDevalue` is the
  memoized pointer-chase that hydrates it. Covers come off the resource CDN by content hash
  (`sv.risuai.xyz/resource/<img>` — the bytes carry no Content-Type header; the host's image guard
  judges magic bytes, not headers, so that is fine). Downloads ride the documented `png-v3`/`json-v3`
  APIs.

Every response is UNTRUSTED DATA: parsed defensively, malformed rows dropped (one bad hit must not blank
a page), every failure a status-line sentence. The fetches themselves are host-performed — allowlisted,
5 s / 1 MiB bounded, SSRF-guarded — so none of that defense is about the transport; it is about the
shapes.

## Summon — PNG-first, so the art arrives with the character

`summonViaPng`: `net.fetchAsset(card png)` → `character.ingestAsset(assetId)` — the SAME import funnel a
hand-uploaded card file takes, so the embedded definition AND avatar land in one deterministic pass
(byte-identical re-summons dedupe via importHash; `created: false` tells you). Any PNG-arm failure folds
to the JSON path: Character Tavern's `definition_*` reshape (fixed field order — deterministic bytes are
what make the dedupe hold), RisuRealm's native `json-v3` ingest. The fold is art-less but never fatal.

Then provenance, two planes, two jobs: `setCardData(characterId, {source, ref, importedAtMs})` stamps
the origin onto the card itself under this plugin's own reserved `data.extensions.plugin_card-atlas` key
— PORTABLE (survives export→import), unforgeable (the host stamps the namespace from the manifest slug),
readable by this plugin alone. The private `storage.kv` `owned:` index is the fast lookup that badges
results "in your library"; the card stamp is the durable truth.

Also note `lastResults`, a plain module variable: a resident guest lives from activation to disable, so
a browse session is honestly MODULE state — gone on respawn, which is right for a session and wrong for
the owned-index and the art cache (which is why THOSE are storage). Choose the plane by the data's
lifetime.

## Honest gaps

* **The art budget is finite.** ~4–5 fresh searches an hour exhaust the shared egress belt; after that,
  new covers wait for the next hour (cached ones keep rendering, search itself may briefly refuse). The
  cache makes normal browsing comfortable; a heavy discovery session will feel the ceiling.
* **A card summoned before the art era re-summons as a twin.** The PNG path and the old JSON path
  produce different bytes, so importHash cannot connect them. One-time edge across the upgrade.
* **PNG downloads are per-card on RisuRealm.** Many realm cards license `json-v3` only (the `png-v3`
  arm 403s); those summon art-less via the JSON fold. Character Tavern's PNG arm is universal but an
  asset-heavy card can exceed the 1 MiB cap — same fold.
* **SFW by default.** Character Tavern rows are post-filtered on their `isNSFW` flag; the realm search
  omits its nsfw param. A copy that wants otherwise owns that decision explicitly.
* **Hub APIs drift.** Both wire shapes (and both art CDNs) were verified live on 2026-08-29; both
  decoders degrade to "no results" + a log line on drift rather than crashing.
* **Realm search is single-page** (its route returns one whole result set); Tavern paging exists
  upstream but this example keeps one page per search — paging is an `actionId` away if your copy wants
  it. Sort applies when a search runs (a select is a form field; it rides the next round-trip).
