# Card Atlas

**Archetype: the hub browser — the flagship.** A product-sized plugin: external APIs, a multi-stage page,
canon writes with provenance. Start here if your idea is "browse something out there and bring it home".

Search Character Tavern and RisuRealm without leaving the app, read a card on a proper detail page, and
SUMMON it into your library — search → grid → preview → import, dedupe-aware and provenance-stamped.

## Copy me

```bash
cp -r packages/server/src/entry/boot/seed-assets/plugins/card-atlas /tmp/my-plugin
# change `id` and `name` in manifest.json, edit main.js, then pack and install:
pnpm plugin:pack card-atlas ./out
```

## The manifest

```json
"capabilities": ["storage.kv", "ui.surface", "net.fetch", "character.ingest", "character.card_state"],
"netHosts": ["character-tavern.com", "realm.risuai.net"]
```

`netHosts` is the SSRF allowlist AND the consent artifact: the grant screen shows exactly these hosts, and
adding one later is WIDENED REACH — the upgrade lands disabled pending re-consent, by design. `character.ingest`
is a canon write into the installer's OWN library (owner-scoped by construction); `character.card_state` is
the per-card provenance stamp.

## The page — how a big surface stays one file

One `ui.page` registration, one `masterDetail`, one action router (`runAtlasAction`) with one small function
per verb. The BROWSE stage: a `searchBar` (the hub picker rides in its collapsed `filters`) over a BOUND grid
(`tilesFrom` — twelve results are twelve tiles, three are three) and one status line every failure folds
into. The DETAIL stage is where a person decides, so it gets the design: name, provenance rows, the
description at reading width (`markdown`), one summon button. `active: {$state:"stage"}` makes navigation
ordinary published state — leave the Extensions section and come back, and you are where you were.

## The sources — one object per hub

Each hub is one `SOURCES` entry with the same three verbs: `search(q)` → rows, `detail(result)` → display
fields + the raw payload, `fetchCard(result, raw)` → the canonical card object `character.ingest` accepts.
Adding a hub is adding one object (plus its host to `netHosts`).

* **Character Tavern** — a clean JSON search (`/api/search/cards`) and a detail endpoint whose `card` carries
  the full definition under `definition_*` keys. It serves no card FILE, so `fetchCard` RESHAPES those keys
  into the canonical `{data:{…}}` — with a FIXED field order, because deterministic bytes are what make a
  re-summon dedupe (byte-identical → `created: false`) instead of minting a twin.
* **RisuRealm** — search rides its app's SvelteKit `/__data.json` route, whose payload is devalue-FLATTENED
  (a shared value pool addressed by integer pointers); `unflattenDevalue` is the memoized pointer-chase that
  hydrates it. Download rides the DOCUMENTED `json-v3` API and ingests as-is (the import funnel reads V2 and
  V3 alike).

Every response is UNTRUSTED DATA: parsed defensively, malformed rows dropped (one bad hit must not blank a
page), every failure a status-line sentence. `net.fetch` itself is host-performed — allowlisted, 5 s / 1 MiB
bounded, SSRF-guarded — so none of that defense is about the transport; it is about the shapes.

## Provenance — two planes, two jobs

On summon: `character.ingest(card)` → `{characterId, created}`; then `setCardData(characterId, {source, ref,
importedAtMs})` stamps the origin onto the card itself, under this plugin's own reserved
`data.extensions.plugin_card-atlas` key — PORTABLE (survives export→import), unforgeable (the host stamps the
namespace from the manifest slug), readable by this plugin alone. The private `storage.kv` `owned:` index is
the fast lookup that badges results "in your library"; the card stamp is the durable truth. Fast plane for
lookups, portable plane for facts.

Also note `lastResults`, a plain module variable: a resident guest lives from activation to disable, so a
browse session is honestly MODULE state — gone on respawn, which is right for a session and wrong for the
owned-index (which is why THAT is storage). Choose the plane by the data's lifetime.

## Honest gaps

* **No remote cover art.** A tile/image cover is an asset in the installer's own CAS — a URL is unspellable
  (the exfil wall) and `net.fetch` returns text, not bytes. The grid is title-forward with placeholder
  covers; the art arrives when you summon the card and the character's own avatar pipeline takes over.
* **SFW by default.** Character Tavern rows are post-filtered on their `isNSFW` flag; the realm search omits
  its nsfw param. A copy that wants otherwise owns that decision explicitly.
* **Hub APIs drift.** Both wire shapes were verified live on 2026-08-28; both decoders degrade to "no
  results" + a log line on drift rather than crashing. A very asset-heavy realm card can exceed the 1 MiB
  response cap — the summon says so instead of importing half a card.
* **Realm search is single-page** (its route returns one whole result set); Tavern paging exists upstream but
  this example keeps one page per search — paging is an `actionId` away if your copy wants it.
