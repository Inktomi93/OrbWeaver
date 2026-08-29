---
kind: design
status: active
updated: 2026-08-29
---

# Card Atlas art-forward — the flagship hub polish (design + build record)

Lane `card-atlas-hub-polish` (forge). The owner's charge, verbatim: "load images by default, each hub
looks the same from source to source, sorting/search display properly provider to provider, actually
visually appealing, info in the right places." Inputs: the stickler investigation
(`docs/reviews/stickler/2026-08-29-plugin-visual-capability.md` — findings F1–F5, the populate recipe)
and the #798 enabler (`72dbcc9e5`: `net.fetchAsset(url)→{assetId}` through the SSRF wall + image guard
into the installer's CAS; `character.ingestAsset(assetId)` through the PNG import funnel; the bindable
`assetFrom` detail hero). Base: `e4d017fd8`.

## §1 Verified premises (all re-derived this session; the tree moves daily)

| Premise | Receipt |
| - | - |
| #798 landed whole: membrane `fetchAsset` (same `admitEgress` belt, image-guard, sniffed mime), `character.ingestAsset`, hero `assetFrom` + exactly-one-of belt, `net.fetch_asset` capability | `membrane.ts:1559-1592` · `contracts/plugin/manifest.ts:87-97` · `contracts/plugin/ui.ts:521-533,781-787` · `automation-plugin.ts:706-716` |
| Character Tavern art: `https://ct-cards.storage.character-tavern.com/<path>.png` (+ resize params `?width=320&quality=85&format=auto`) — the BARE png AND the 320w resize both carry the embedded `chara` tEXt chunk (643,404 B / 84,325 B, PNG magic, chunk at offset 62) | live curl 2026-08-29; corroborated by the legacy adapter (`legacy-main:packages/server/src/infra/network/hubs/chartavern.ts:17-24,271-278` — the `check-main-for-the-original-consumer` move) |
| RisuRealm art: `https://sv.risuai.xyz/resource/<img-hash>` — JPEG bytes, NO Content-Type header (84,496 B, JPEG magic); search rows carry `img`; `png-v3` download exists but 403s per-card by license ("not allowed … in this format") | live curl 2026-08-29; legacy `risurealm.ts:6-7,23-26,320-326` |
| `netHosts` matching is EXACT (suffix only for a leading-dot entry) — subdomains are NOT covered, so both art hosts must be declared | `egress.ts:478-490` |
| The image guard sniffs magic bytes (png/jpeg/webp/gif/avif), 1 MiB cap via `PLUGIN_NET_MAX_BYTES`, 8192px/40M-pixel caps | `image-guard.ts:32-67` · `kit/image-sniff:138` |
| `fetchAsset` shares ONE hourly egress belt with `net.fetch`: `PLUGIN_EGRESS_PER_HOUR = 120` | `rate-floor.ts:42` · `membrane.ts:1577-1579` |
| Plugin kv: ≤256 keys, ≤64 KiB/value | `host-v1.d.ts:565` |
| Tavern's `sort` query param is IGNORED (identical order with/without) — provider-side sort is not available | live curl A/B 2026-08-29 |
| Fetched assets (`kind:"generated"`) are referenced by NO asset-ref registry column → a scheduled `assets-gc` reaps them after 1h grace (dropped row ⇒ the id dies) | `asset-refs.ts:38-71` · `collect-garbage.ts` · `workload-contributions.ts:68-80` |
| Seeded examples land installed/disabled/ungranted ONCE (latch) — an installed copy never picks up seed-source edits; the live path is the `upgrade` verb (higher version, widened reach ⇒ disabled + pending re-consent ⇒ `setGrant` ⇒ enable) | `seed-example-plugins.ts:19-27,80-95` · `verbs/upgrade.ts` header |
| The doubled "Card Atlas · Card Atlas" title is ALREADY fixed (`showTitle = title !== pluginName`) — do not re-fix | `plugin-surface-shell.tsx:49-55` |
| The house reading measure is `--reading-measure: 75ch`, applied as `max-w-(--reading-measure)` (feature precedent: databank/imagery/refinery) | `theme.css:134` · `text/variants.ts:79` |
| Gallery is CURATED (`add-to-gallery`) — fetched covers do NOT pollute it | `list-gallery.ts` header |

Memory lessons consulted (by filename): `check-main-for-the-original-consumer`,
`isolated-snap-stage-boots-empty-db`, `empty-states-are-load-bearing`, `mockup-first-build-loop`,
`doc-catalog-pending-tier-refused-by-ratchet`, `doc-catalog-born-reviewed-and-reattest-dance`,
`min-content-vs-truncating-flex` (the 390px controls-row hazard), plus the path-scoped
`browser-and-instruments` rule.

## §2 The architecture

### 2a Guest side (`card-atlas/main.js`) — the art plane

- **Normalized row** (both sources emit the identical shape; the whole cross-provider consistency
  story lives at this seam): `{ source, ref, name, creator, downloadsN, downloadsLabel, tokens,
  tagline, art }` — `downloadsN` numeric (realm's compact "26.9k" parsed; unknown = -1),
  `downloadsLabel` from ONE formatter (compact `7.4k` for both providers), `tokens` "—" when unknown,
  `art` = the provider's cover URL (tavern 320w resize; realm `sv.risuai.xyz/resource/<img>`; "" when
  absent). Both grids/details render from this ONE shape, so the two hubs are pixel-identical by
  construction.
- **Two-phase publish** per search: (1) status `Searching <hub> for "q"…` published immediately
  (old tiles retained — content-preserving feedback, the loading-vocabulary workaround); (2) rows
  normalized → sorted → clamped to 24 → published with whatever covers the art cache already holds
  (instant text grid); (3) missing covers fetched in PARALLEL, cache updated, ONE final republish.
  Per-cover failure ⇒ placeholder + one summarizing log line, never a blank page.
  **BUILD-TIME PREMISE CORRECTION (measured live, twice, then redesigned): ALL hub awaits must
  FLOAT.** The invocation SETTLEMENT WALL (`PLUGIN_INVOCATION_CPU_MS` 1000 + `HOST_FN_DEADLINE_MS`
  5000, `sandbox.ts` header — in no doc the phase-1 read covered) bounds a whole action handler at
  ~6 s of real time. Round 1: a realm search + 24 fresh covers blew it (deadline kill + crash strike +
  respawned session — a stranded "Searching…" status and a fresh `ready` log line); the batch was
  floated. Round 2 refuted the residual premise too: the hub's response BODY itself can stream past
  the wall (the host-fn deadline bounds connect+headers+redirects, not the body read — stage receipt:
  `invocation ended — it did not settle within its 6000ms wall`, durationMs 6009, `port.ts:309`). So
  handlers now ONLY validate + publish an honest status ("Searching…"/"Opening…") + schedule
  `runSearch`/`runOpen` — floating continuations the host's job pump advances between invocations
  (the activation-time `void publishBrowse("")` precedent; the
  `guest-job-pump-outside-the-interrupt-handler` memory) — guarded by a session SEQUENCE (`sessionSeq`,
  bumped by search/open/back) so a superseded fetch never overwrites a newer page. The summon arm
  stays IN-invocation (its toasts ride the round-trip outcome; a pathologically slow hub 500s the
  mutation, which the client toasts honestly — priced) and drops its post-summon detail refetch.
- **The art cache is ONE kv key** (`art_cache`: `{ "<source>:<ref>": { a, t } }`, trimmed oldest-first
  at 300 entries, 24h TTL). Why: the 256-key budget already carries the `owned:` index (per-key would
  starve it); the egress belt is 120/hr SHARED with search — an uncached hub burns 25 calls/search
  (~4 fresh searches/hour before ART STARVES SEARCH), so repeats must be free; the 24h TTL bounds the
  breakage window after an `assets-gc` pass reaps fetched covers (§4 gap).
- **Detail hero**: `publishDetail` gains `detail.art` (assetId, "" when none); the `card` stage gains
  `hero: { assetFrom: { $state: "detail.art" }, alt: "Card cover art" }`. The hero paints INSTANTLY
  from the tile's cached cover; Character Tavern then upgrades to the 640w resize (one cached egress
  call, republished when it lands — progressive, never blocking). Realm's resource jpeg is already
  full-size, no upgrade leg.
- **Summon-with-art (F1, made TRUE rather than re-worded)**: PNG-FIRST ladder, grant-gated on
  `net.fetch_asset`. Tavern: `fetchAsset(bare card png)` → `character.ingestAsset` — the bare PNG
  carries the full `chara` chunk, so the character arrives with definition AND avatar in one funnel
  pass, byte-deterministic (re-summon dedupes, `created:false`). Realm: `fetchAsset(png-v3)` →
  `ingestAsset`; the per-card 403 folds to the existing `json-v3` JSON path. Any PNG-arm failure
  (>1 MiB, guard reject, no grant) folds to the existing JSON path for that source — the pre-#798
  behavior exactly. Known era-edge, accepted: a card summoned via JSON before this upgrade re-summons
  as a PNG twin (different bytes, different importHash); cross-format dedupe is not expressible.
- **Sorting (plugin-side, both providers identically)**: a `sort` select (`relevance` = provider
  order · `downloads` desc by `downloadsN` · `name` asc), applied in the search handler before the
  clamp — so "most downloaded" takes the top 24 of the fetched page. Provider-side sort was REFUTED
  (Tavern ignores the param); plugin-side is consistent by construction.
- **Controls layout ("the source picker hides under Filters")**: the searchBar drops its `filters`
  disclosure entirely; a `row` of two always-visible selects — `Hub` (Character Tavern / RisuRealm)
  and `Sort` — sits directly beneath it. The query keeps the prominent slot (the §4.5b hierarchy);
  the two subordinate controls are visible, not buried. 390px is the risk width (`min-content` on two
  Select triggers) — measured in the render pass; the fallback arm is stacking the two selects.
- **Detail info order** ("info in the right places"): hero → name (stage title, focal) → provenance
  `keyValue` (Creator / From / Downloads / Tokens) → owned line → the Back/Summon row → the blurb at
  reading width. The decision cluster sits above the fold; the reading material below it.
- Grant posture unchanged: everything feature-detects (`host.grants.includes`) — ungranted
  `net.fetch_asset` reproduces today's placeholder behavior exactly, no crash, no dead page.

### 2b Renderer side (`plugin-browse-nodes.tsx`) — F2 + F4

- **F2 (reading measure)**: the `MasterDetail` DETAIL arm wraps hero + title + body in
  `max-w-(--reading-measure)` (the house token, the feature-precedented spelling). One wrap fixes the
  150ch blurb AND the ~890px keyValue scan gap. The browse arm stays full-width (a grid wants it).
- **F4 (grid empty state)**: `SurfaceGrid`'s empty branch renders the house `EmptyState`
  (icon = `Images`, title = the plugin's own `empty` line ?? "Nothing here yet.", `measure="default"`,
  `titleAs="p"`) instead of one bare gloss line. The plugin's teaching text is unchanged — only its
  frame is promoted to the house pattern (`empty-states-are-load-bearing`).
- **F5 (doc truth)**: `ui.ts:92-93` and the `plugin-browse-nodes.tsx` header comment claim "the house
  `prose` measure on the text primitives themselves" — reworded to name the REAL mechanism (the
  renderer caps the detail column at `--reading-measure`), which the F2 fix makes true.
- **F3 (primary CTA) is NOT taken** — a recorded-law input change (S1 one-primary), priced by the
  stickler as §4 item 5, owner's call. Summon keeps `neutral`→secondary vs Back's `outline`.

### 2c Manifest + docs

- `manifest.json`: capabilities + `net.fetch_asset`; netHosts + `ct-cards.storage.character-tavern.com`
  + `sv.risuai.xyz` (exact hosts, never a leading-dot wildcard: the narrowest reach that works);
  version `1.0.0` → `1.1.0` (the upgrade verb refuses non-higher versions).
  Widened reach ⇒ the upgrade lands disabled pending re-consent, BY DESIGN — the consent screen now
  names the art hosts and the CAS-write capability.
- `main.js` header ("WHAT IT HONESTLY CANNOT DO") and `README.md` ("Honest gaps") rewritten: the
  no-remote-art wall FELL with #798 — they now teach the fetchAsset pattern, the shared egress
  budget arithmetic (why the cache exists), and the PNG-first summon ladder. F1's lying claim
  ("the art arrives the moment you summon") becomes the literal truth.

## §3 Rejected alternatives (the design's other arms, and why not)

1. **Correct the F1 copy instead of building the pipeline** — the mechanism now exists (#798); a doc
   that apologizes for a wall that fell is worse than using the door. Rejected.
2. **Provider-side sorting** — refuted by probe (Tavern ignores `sort`); would also make the two hubs
   sort DIFFERENTLY, the exact inconsistency the owner named. Rejected for plugin-side sort.
3. **Sort as instant-action buttons** — immediate feedback but no active-state affordance in the
   vocabulary (buttons cannot show "pressed"), and three more controls at equal weight is the §4.5b
   flat-stack failure. Rejected for a select that applies at search time.
4. **Keep the hub picker in the searchBar `filters` disclosure** — the status quo the owner called
   out; a two-source switcher collapsed under "Filters" under-serves the primary browse decision.
   Rejected for the always-visible row.
5. **Per-cover republish (24 `setState`s)** vs two-phase — each publish is a bus poke + full repaint;
   24 per search is churn with no UX gain over one text-first paint + one art paint. Rejected.
6. **Per-URL kv cache keys** — collides with the ≤256-key budget the `owned:` index already spends.
   One-key JSON map with LRU trim. Rejected per-key.
7. **No art cache (refetch every search)** — the belt arithmetic kills it: 120/hr ÷ 25/search ≈ 4
   fresh searches, then ART STARVES SEARCH ITSELF (shared belt). Rejected; cache is load-bearing.
8. **Full-resolution PNGs as grid covers** — ~640 KB × 24 per search (latency + CAS growth) for
   tiles rendered ~200px wide; the 320w resize is 8× lighter and keeps the chara chunk anyway.
   Rejected; full PNG only at summon (where its bytes ARE the product).
9. **Always-fetch a dedicated 640w hero before painting the detail stage** — blocks the decision
   surface on egress. Rejected for instant-cached-cover + progressive upgrade (Tavern only).
10. **Build the #799 loading-skeleton/tabs/icon vocabulary** — explicitly out of lane (separate
    issue); the status-line two-phase publish is the inside-vocabulary workaround. Refused.
11. **A leading-dot `netHosts` wildcard (`.character-tavern.com`)** — wider than needed; exact hosts
    keep the consent artifact narrow. Rejected.
12. **Owned-guard early-return on summon** (skip re-ingest when the kv `owned:` key exists) — breaks
    the deleted-character re-summon self-heal the byte-dedupe path provides today. Rejected;
    `owned:` stays badge/copy-only.

## §4 Found gaps filed for follow-up (not this lane)

- **GC reaps plugin-fetched art** (P3): no `ASSET_REFS` column covers `kind:"generated"` assets
  referenced only from plugin kv/published state; a scheduled `assets-gc` reclaims live covers after
  the 1h grace. Durable fix is server-side (a plugin-fetched-asset ref registry, or a plugin-state
  sweep feeding the live set) — db/assets/plugin junction, its own design. This lane's mitigation:
  the 24h cache TTL bounds the breakage window and a refetch self-heals.
- **The egress belt was priced for text** (owner fork, stated default): an art hub honestly spends
  ~25 calls/search; at `PLUGIN_EGRESS_PER_HOUR=120` a heavy first session hits the cliff at search
  ~5 and search itself starts failing behind the art spend. Default shipped: live within 120 (cache +
  honest degrade + log). The alternative — a separate, higher `fetchAsset` belt or a bump — is a
  security-posture change (exfil-rate ceiling) and is the owner's call.
- **No loading vocabulary** (#799, known): during a fresh search the grid sits on the previous
  results with only the status line + button spinner as feedback; `MediaTileGridSkeleton` exists on
  the shelf and is unreachable from the vocabulary.

## §5 Coupled-site inventory (build fan-out)

1. `packages/server/src/entry/boot/seed-assets/plugins/card-atlas/main.js` — the bulk (art plane, sort, controls, summon ladder, header comment).
2. `…/card-atlas/manifest.json` — capability + 2 hosts + version 1.1.0.
3. `…/card-atlas/README.md` — F1 truth + the new teaching sections.
4. `packages/client/src/features/plugin/components/plugin-browse-nodes.tsx` — F2 measure wrap + F4 EmptyState + header-comment truth.
5. `packages/contracts/src/plugin/ui.ts` — F5 comment-only truth-repair (`:92-93`).
6. `tests/server/entry/boot/seed-example-plugins.int.test.ts` — atlas slice: grant/netHosts rows mirror the new manifest; spec-shape pins for the visible Hub/Sort selects; the no-network arms unchanged.
7. `tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx` — two new red-first pins: detail-stage computed max-width == resolved `--reading-measure`; grid empty renders `[data-slot="empty-state-root"]` with the plugin's teaching line.
8. `docs/design/card-atlas-art-forward.md` (this file) + its born-reviewed receipt in `docs/catalog/receipts/design.json` (the ratchet refuses a pending stub; the receipt commit is the standing two-commit dance).

Checked NOT coupled: no test asserts the empty-grid literal or the gloss shape (grepped `tests/` +
`packages/`); `plugin-surface-bindings` unchanged (no binding semantics move); `host-v1.d.ts` already
documents both #798 fns; the showcase-set design doc's atlas rows describe the sources, not the
no-art wall.

## §6 Test + verification plan

- **Red-first CT pins** (run against the UNMODIFIED renderer first — expect red — then fix):
  F2 measure pin (computed `max-width` of the detail column vs the resolved token, whole-value read,
  the `tests/client/styles/reading-measure.suite.ct.tsx` comparison mechanism); F4 EmptyState pin
  (slot present + teaching text). Planted-control posture: the F4 pin's selector is proven able to
  fail by its pre-fix red.
- **Behavioral floor**: `pnpm ct:scoped tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx --workers=2`
  · `pnpm test:scoped tests/server/entry/boot/seed-example-plugins.int.test.ts --maxWorkers=4`
  · per-package `pnpm typecheck` (owns the .ct.tsx) · `node scripts/ts7.cjs --noEmit -p tsconfig.json`
  (sees the int test) · scoped biome on touched files · scoped `pnpm check:docs`.
- **Live drive** (the int test is honest about its wire edge — the art arms are live-only): pack
  `card-atlas` 1.1.0 → `snap --isolated --ref <sha>` stage → upgrade through the REAL verb path
  (plugin row upload) → re-consent (the widened-reach screen naming the new hosts + capability) →
  enable → drive: Tavern search (REAL covers in the grid), Realm search (same card shape, real
  covers), detail stage (hero art), sort=downloads receipt (top tile's count ≥ the next), summon
  toast. Renders for the owner: populated grid + detail, desktop + ~390px, PER provider.
- **Snap traps carried from the stickler recipe**: submit search via Enter on the input
  (`text=Search` hits the label); `--fill` selectors cannot contain `=`; the resident's published
  stage survives contexts (may open on detail — Back first).

## §7 Hub v1.2 — pagination, tag filtering, tags-on-cards, plain names, the belt split (lane card-atlas-hub-v2)

Owner asks, verbatim summary: rename "Summon" → "Add to library" (no cute names); page through
results; genre + tag filtering, include AND exclude; tags/genre shown on cards + detail; fields
normalized so filter + display are universal between hubs; no budget limit — fix slowness, don't
degrade (#801, "no budget idgaf"). Base: `ff8ba2f7c` (v1.1.0).

### 7a Live provider probes (2026-08-29, all re-derived — two v1.1.0-era premises DIED)

| Premise | Receipt |
| - | - |
| **PREMISE KILL — Tavern's `q=` param is DEAD**: `q=vampire` and `q=` return byte-identical result sets (totalHits 4154, same first hits). The live query param is **`query=`** (`query=vampire` → 122 hits). v1.1.0's Tavern "search" has been silently returning the unfiltered firehose. | live curl A/B 2026-08-29 |
| Tavern **`tags=a,b` is a server-side AND filter** (the legacy adapter's 2026-07-17 "no tag param, verified ignored" is stale): `tags=elf`→74 · `tags=vampire`→56 · `tags=elf,vampire`→5 · combines with `query=` (`query=girl`→1567; `+tags=vampire`→23) | live curls 2026-08-29 |
| Tavern paging is real: `page=N` honored, `hitsPerPage` fixed 30 (param ignored), `totalPages`/`totalHits` in every response | p1/p2 curls, distinct hit sets |
| Tavern has **NO exclude** (`excludeTags=` ignored; `tags=-x` matches a literal tag) and **NO server sort** (`sort=downloads` ignored — v1.1.0 finding stands) and no `genre=` param | live curls 2026-08-29 |
| Tavern hits carry **NO `tags` field** (60 hits across 2 pages: zero), detail carries none, `attributesToRetrieve`/`facets` ignored, the card page's tag chips are client-rendered from a lazy chunk (SSR ships skeletons), the card `__data.json` carries layout only — **per-row tags are unreachable on every public JSON surface** | key dumps + page-HTML grep 2026-08-29 |
| Realm: one `__data.json?search=` response = **60 rows**, rows carry `tags` (28/60 non-empty); **`page=2` → Internal Server Error** (the route echoes `page: 1` but the backing query refuses ≠1) — paging realm = client-side slicing of the fetched set | node unflatten probe + p2 curl 2026-08-29 |
| **Neither provider has a distinct genre field** — "genre" words (fantasy, romance…) live IN the tag taxonomy on both. Genre filtering IS tag filtering; the ask's "genre + tags" folds to ONE normalized `tags` vocabulary. | key dumps both providers |

### 7b The architecture

- **The session object** (module state, honestly respawn-mortal like `lastResults` before it):
  `{ q, sourceKey, sortKey, include, exclude, page, totalPages, rows }` — `rows` is the CURRENT page's
  normalized rows for tavern, and the WHOLE fetched set for realm (so realm page flips are free).
  `sessionSeq` guarding is unchanged.
- **ONE page control, provider-shaped behind it**: a `row` beneath the grid — `button` "Previous" ·
  bound gloss `pageLabel` ("Page 2 of 139") · `button` "Next". Tavern: Next/Prev refetch server page
  N±1 (filters ride along, so `totalPages` is filter-aware). Realm: slice the held set 30/page
  (60-row set = 2 pages; include/exclude filter first, then slice, so its label is filter-aware too).
  Both hubs show ~30 tiles/page (tavern's natural page; the 24-clamp died with the budget framing).
  Out-of-range clicks fold to the status line ("That's the last page."). The pager row is STRUCTURAL
  (the vocabulary has no `when` predicate — deferred phase, ui.ts header), so it renders pre-search
  too; its buttons answer honestly ("Search first.").
- **The normalized row gains `tags: string[]`** (lowercased, trimmed, deduped, clamped) — realm: real
  row tags; tavern: `[]` always (7a). Display and filtering read ONLY this field, so a third hub that
  publishes tags gets chips + exclude for free.
- **Filtering, include AND exclude, comma-separated** (two `textField`s in the searchBar's `filters`
  disclosure, label "Tag filters" — the disclosure exists for exactly this long tail; Hub + Sort STAY
  always-visible, the §2a ruling survives, its input changed): include = every listed tag must match
  (AND — mirrors Tavern's server semantics); exclude = any listed tag drops the row. WHERE each
  applies: tavern include → the server `tags=` param (whole-corpus, page counts filter-aware); realm
  include+exclude → plugin-side over row tags; tavern exclude → **honestly unsupported** (no server
  param, no row tags to judge — the status line says so once per search rather than silently
  no-opping). Untagged realm rows: dropped by include (cannot match ALL), kept by exclude (nothing to
  match).
- **Tags on cards + detail**: the tile vocabulary gains `tags?: readonly string[]` (declared arm +
  bound arm + both schemas, count-capped) rendered by `MediaTileGrid` as a clipped single row of soft
  mini-badges under the subtitle; the detail's provenance `keyValue` gains a "Tags" row (joined "a ·
  b · c", clamped to the 200-char value cap, "—" when the hub publishes none). Detail tags come FROM
  THE NORMALIZED ROW (not the detail payload), so both hubs are uniform by construction.
- **The belt split (#801)**: `net.fetchAsset` leaves the shared belt for its own
  `PLUGIN_ASSET_EGRESS_PER_HOUR = 1200` floor (one per 3 s sustained ≈ 40 fresh uncached pages/hour;
  outbound channel = a GET URL to manifest-allowlisted hosts only — the D46 exfil pricing that set 120
  was about `net.fetch`'s POST-body channel, which keeps its own belt), and `PLUGIN_EGRESS_PER_HOUR`
  rises 120 → 360 (one per 10 s sustained — above any human search/page/detail cadence, still a
  visible ceiling on the POST-capable channel). Art can no longer starve search BY CONSTRUCTION (two
  belts), not by rationing. The art cache stays — as a SPEED cache (instant page flips, free repeats)
  — every "budget"/"starve" framing in main.js/README dies.
- **The rename**: "Summon" → "Add to library" in every user-visible string, plus the internal
  actionId/function names and the teaching prose (main.js header, README, manifest description,
  `host-v1.ts:355`'s comment). The chat domain's force-summon vocabulary is a DIFFERENT concept and
  is untouched (swept: all other "summon" hits are chat-domain or historical records).

### 7c Rejected alternatives

1. **Fetch-all-pages global sort for tavern** — 139 pages × 1 call to sort a corpus we show one page
   of. Sort stays per-page for tavern (and whole-set for realm, where the set is held). Rejected.
2. **Re-chunking tavern's 30-hit pages into 24-tile pages** — page arithmetic straddling provider
   pages (page 3 = hits 73-96 spans provider pages 3+4) for zero user value. The provider page IS the
   page. Rejected.
3. **Tags in the subtitle string** (zero vocabulary change) — two identical gloss lines, no visual
   "these are the filterable words" signal, and the owner asked for tags ON the cards. Rejected for
   the first-class tile slot.
4. **Select-based tag pickers** — `select` options are registration-static; the tag vocabulary is
   data (per-search, per-hub). Dynamic options are unspellable in the vocabulary. Comma-separated
   textFields. Rejected.
5. **Scraping the Tavern card page HTML for tags** — the chips are client-rendered (SSR ships
   skeletons; no per-card JSON endpoint found by probe), so it would be N speculative HTML fetches
   through the 1 MiB cap for a display nicety. Rejected; filed as the capability gap it is.
6. **Bumping only the shared belt** (no split) — every plugin's POST-capable `net.fetch` channel
   inherits the art-sized ceiling, and art + search still contend on one belt under load. The split
   keeps the D46 posture legible per-channel. Rejected.
7. **A `when` visibility predicate for the pager** — a real vocabulary phase the ui.ts header already
   prices as its own deferred work; not smuggled in for one row. Rejected here.

### 7d Coupled sites (v1.2 fan-out)

1. `…/card-atlas/main.js` — session/pager/filters/tags/rename/`query=` fix (the bulk).
2. `…/card-atlas/manifest.json` — version 1.2.0 + description rename (no new hosts/capabilities ⇒ NO re-consent this time).
3. `…/card-atlas/README.md` — rename, pagination/filter teaching, belt-split truth, honest-gaps rewrite.
4. `packages/contracts/src/plugin/ui.ts` — tile `tags` (2 interfaces + 2 schemas + count cap).
5. `packages/ui/src/primitives/media-tile-grid/` — `MediaTileItem.tags` + chip row + `tagRow` slot.
6. `packages/client/src/features/plugin/components/plugin-browse-nodes.tsx` — tile map carries `tags`.
7. `packages/server/src/domain/plugin/substrate/rate-floor.ts` — `PLUGIN_ASSET_EGRESS_PER_HOUR` + the 360 bump + comment truth-repair.
8. `packages/server/src/domain/plugin/contract/ops.ts` — `PluginBelts.assetEgress`.
9. `packages/server/src/domain/plugin/substrate/bridge.ts` + `packages/contracts/src/plugin/bridge.ts` — `admitAssetEgress`.
10. `packages/server/src/infra/plugin-host/membrane.ts` — fetchAsset claims the asset belt.
11. `packages/server/src/entry/compose/automation-plugin.ts` — mint the new floor.
12. `packages/server/src/domain/plugin/index.ts` — export the constant.
13. Mock bridges: `tests/server/infra/plugin-host/{membrane,port,escape.suite}.test.ts`, `tests/server/domain/plugin/substrate/{bridge,ui-host-dispatch}.test.ts`, `tests/server/domain/plugin/_support.ts` (belts bag + bridge literals — tsc-forced).
14. `tests/server/entry/boot/seed-example-plugins.int.test.ts` — the atlas slice: the `not.toContain('"filters"')` pin INVERTS (tag filters now live in the disclosure; the pin becomes "Hub/Sort selects are NOT inside filters"), pager/label pins.
15. `tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx` — red-first tile-tags pin.
16. `packages/contracts/src/plugin/host-v1.ts` — the `:355` "Summon" comment + the shared-belt copy near fetchAsset docs.
17. This file + its catalog receipt (re-attest).

### 7e Test plan

- **Red-first CT**: a bound grid whose state tiles carry `tags` renders the chips (fails against the
  pre-change renderer — the field is schema-stripped today, which IS the planted control).
- **Belt two-direction pins**: membrane test — `net.fetchAsset` claims the ASSET belt and NOT the
  fetch belt (both counters asserted, both directions); `net.fetch` still claims the fetch belt.
- **Int test**: atlas slice re-pinned to the v1.2 spec shapes (filters disclosure with the two tag
  fields, pager row, Hub/Sort still top-level), grant/netHosts rows unchanged.
- **Floors**: `pnpm ct:scoped tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx --workers=2` ·
  `pnpm test:scoped` on seed-example-plugins.int + membrane/port/escape/bridge/ui-host-dispatch/rate-floor +
  contracts ui.contract · per-package `pnpm typecheck` · `node scripts/ts7.cjs --noEmit -p tsconfig.json` ·
  scoped biome · scoped `pnpm check:docs`.
- **Live drive** (the wire arms are live-only): pack 1.2.0 → isolated stage → real upgrade path →
  per provider: populated grid WITH tag chips (realm) → page 2 → an active include+exclude filter
  changing the result set → detail with the Tags row → renders desktop + ~390px.

### 7f Gaps found, filed not fixed

- **Tavern per-row tags** (capability gap, reported to the orchestrator): filtering-include works
  server-side, but exclude + display are structurally unreachable until Character Tavern projects
  tags into a public JSON surface. The plugin says so honestly instead of no-opping.
- **Realm's deep corpus**: one response = 60 rows; rows beyond 60 for a query are unreachable
  (`page=2` 500s server-side). Client-side slicing pages what exists.
- **v1.1.0 shipped the dead `q=` param** — every Tavern search was unfiltered. Fixed here; flagged to
  the orchestrator because v1.1.0 sits on a branch awaiting owner render review.

## §8 Hub v1.3 — full sort/stat mining, the SFW config, the nine-hub roster (lane card-atlas-next-level)

Owner ask, verbatim summary: every sort mode + every stat variable each hub exposes, per-hub sort
vocabulary in the Sort select; a per-user SFW toggle (#800 — default OFF = show all, no gate/blur);
wire botbooru; attempt pygmalion/janitorai/datacat; richer detail. Base: `1be90fa94` (v1.2).

### 8a Live probes (2026-08-29, three batches, all saved to the lane scratchpad — TWO premise kills)

| Premise | Receipt |
| - | - |
| **PREMISE KILL — pygmalion is ALIVE.** The legacy "every server.pygmalion.chat connect-RPC path 404s" verdict (2026-07-18, `legacy-main:packages/contracts/src/hub/index.ts` header) is DEAD: unauthenticated `POST /galatea.v1.PublicCharacterService/CharacterSearch` returns 200 with `{totalItems:"4452", characters:[…]}`. Rows carry stars/views/downloads/chatCount/personalityTokenCount/createdAt/updatedAt/owner. `orderBy` honored for downloads·stars·views (distinct orders); created order is createdAt-monotonic-desc (verified on the data). `tagsNamesInclude:["fantasy"]`→0 hits (opaque taxonomy) and rows carry NO tags → tag filters not wired for pyg. Unauthenticated = SFW-curated only (`includeSensitive` needs a Bearer token — not a seeded plugin's to carry). Detail `POST /Character {characterMetaId}` carries `personality:{name,persona,greeting}` = the JSON import fold. Avatar `assets.pygmalion.chat` bare-GET 200 image/png (fetchAsset-compatible, no headers needed). | probe batch 1-3 |
| **PREMISE KILL — realm HAS server sort + an nsfw param.** v1.2 wired realm sort plugin-side only; live: `__data.json?search=&sort=downloads` and `sort=trending` return distinct server-sorted sets (30 rows), and `nsfw=true` returns a different (NSFW-inclusive) set. The legacy adapter carried exactly these (`risurealm.ts` SORT_PARAM + `nsfw=true` when not excluding). | batch 1 |
| Tavern: no server sort — `sort=downloads:desc`/`sortBy=`/`order=` all byte-identical (third era of refutation). Rows also carry `likes`, `messages`, `hasLorebook`, `contentWarnings` beyond v1.2's fields. | batch 1 |
| Chub: sorts REQUIRE `asc=false` (without it the order is not monotonic — v1.2's `star_count` wiring was silently relevance-ordered); with it: `star_count`·`n_favorites`·`rating`·`created_at`·`last_activity_at`·`trending_downloads` all verified monotonic/plausible on a query-less browse. With a TEXT query chub keeps relevance order regardless of `sort` (probed monotonicity refuted) — the plugin-side page re-sort makes the display promise true anyway. `download_count` returns the star_count order (nDownloads is dead on the wire) — not offered. `nsfw=true` works (5213 vs 559 hits). Rows carry rating/ratingCount/n_favorites/nChats/nMessages/forksCount/createdAt/lastActivityAt + `avatar_url`/`max_res_url`. | batches 1-3 |
| AICC `orderBy`: downloadCount ✓, ratingAvg ✓, createdAt ✓ (= the default, newest-first). Rows carry ratingAvg/ratingCount/aiScore/isAnimated/createdAt/language. | batch 1 |
| CharaVault: `sort=newest` ✓ and `sort=oldest` ✓ (distinct orders); `rating`/`tokens` refuted (ignored). Rows carry avg_rating/rating_count/comment_count/file_size/has_lorebook/indexed_at. | batch 2 |
| Wyvern: sort param ignored (re-confirmed); rows carry token_count/created_at/updated_at/likes + `entity_statistics.total_messages`; the stat rows look freshly minted on read (views=1 on an old card) so only tokens/dates/messages are displayed. | batches 1-2 |
| BotBooru (`botbooru.com`): browse JSON gates on `X-Requested-With: XMLHttpRequest` (legacy fact holds). `total`+`posts`; posts carry downloads/favorite_count/views/comments_count/token_count/created_at/fork_count/tags-with-categories. Sorts verified: default=latest, `downloads` ✓, `favorites` ✓, `views` ✓; `curated`+`curated_sort` REFUTED (same order — the legacy top_rated/trending arms are dead), `rating`/`top_rated`/`trending` direct spellings refuted too. `sfw_only=true` ✓ (3163 vs 3178). The legacy `tags=` param REFUTED (ignored); `q=` matches tags/text (`q=elf`→38) but `-tag` negation refuted → tag filters run ROW-SIDE (rows carry tags). NO thumbnail variant exists (`images/<filename>` = the full ~1 MB card PNG; `?width` ignored) — the cover IS the card PNG, the CharaVault precedent. Card: `/download/json/<id>` native chara_card_v2 (no XHR header needed); a >1 MiB card body folds to the row-preview detail honestly. | batches 1-3 |
| Datacat (`datacat.run` — the working JanitorAI mirror): `POST /api/liberator/identify {deviceToken:<uuid-shaped>}` mints an anonymous `sessionToken` (a FIXED uuid string works); browse `GET /api/characters/recent-public?limit=&offset=&summary=1&minTotalTokens=0&search=` with `X-Session-Token` ✓; `sortBy=chat_count` ✓ (distinct order); `nsfw=false` param REFUTED (rows still isNsfw:true) → SFW judges row-side via `isNsfw`. Rows carry stats.chat/stats.message/favoritesCount/totalTokens/isNsfw/creatorName/firstPublishedAt + `avatarVariantUrls` (thumb/card/original on `media.datacat.run`, bare-GET 200 webp 44 KB — fetchAsset-perfect) with `avatar` (an `ella.janitorai.com/bot-avatars/` path) as the legacy fallback. Detail `/api/characters/{id}` carries the definition fields (`chara_card_v2_json`, personality/scenario/first_message) — EMPTY on "DEGRADED"-recovery rows → the import fold answers an honest error there. **The `/download` route is Turnstile-walled** (`{turnstile, characterDownloadVerification}`) — not used. | batch 2-3 + marinara `bot-browser-datacat.routes.ts` |
| JanitorAI proper: no public API; the jannyai mirror is the scrape-token + corsproxy pattern legacy REJECTED and the `no-raw-egress` gate bans. Datacat IS the janitor mirror that works. NOT WIRED — recorded here + README. | legacy `02-domain-and-adapters.md` §4 |
| `net.fetch` honors POST + a string→string header map (Origin/Referer/X-Session-Token all pass); `fetchAsset` is HEADER-LESS by design — every wired art host was probed bare-GET. | `membrane.ts:1612-1630,1637` + probes |
| `ui.register` collects into LIVE sandbox state (`state.surfaces.push`; `listSurfaces` reads `resident.instance.surfaces` per call) — a registration from a floated continuation lands; the seed-int test's listSurfaces/getSurfaceState-right-after-enable pins prove the pump drains it in CI. | `sandbox.ts:267-279,341` · `verbs/list-surfaces.ts:52` · int test :786-815 |
| netHosts arithmetic: 10 + botbooru.com + server.pygmalion.chat + assets.pygmalion.chat + datacat.run + media.datacat.run + ella.janitorai.com = **16 = NET_HOSTS_MAX exactly** — no cap bump needed. | `manifest.ts:164` |

Memory lessons consulted: `guest-job-pump-outside-the-interrupt-handler`, `check-main-for-the-original-consumer`
(the marinara + legacy-adapter reads), `empty-states-are-load-bearing`, `isolated-snap-stage-boots-empty-db`,
`ct-test-gotchas-hub` posture via `.claude/rules/browser-and-instruments.md`.

### 8b The architecture

**Three vocabulary extensions, all the established ARM-C shape (declared XOR bound), each landing with
its first consumer (the atlas):**

1. **`select.optionsFrom`** — the bound options arm. Why: the owner asked for each hub's REAL sort
   vocabulary in the Sort select; select options are registration-static, and per-hub sort menus are
   data (cardinality + labels vary by hub) — the exact argument that ratified `tilesFrom`. `options`
   becomes optional; exactly-one-of belt at the spec root; `resolvePluginBoundSelectOptions` validates
   entries (`{value,label}` strings, malformed dropped, clamped to `PLUGIN_ROWS_MAX`) at resolve.
2. **`keyValue.rowsFrom`** — the bound rows arm. Why: the mined stats are per-hub sparse (wyvern has
   3, botbooru 7); a fixed superset of rows showing "—" for half is the info-in-the-wrong-places noise
   the owner named — bound rows show exactly what the hub answers. Same belt + `resolvePluginBoundKeyValueRows`.
3. **`toggle.actionId`** — the live-toggle arm (the select's v1.2 `actionId` shape, one control over):
   the SFW flip re-runs the search immediately, fresh value riding `extra`.

**The normalized row v3**: `{source, ref, name, creator, tagline, art, tags, nsfw, pop, n}` — `nsfw` a
tri-state (true/false/undefined = hub doesn't say), `pop` the tile's one popularity label (per-hub best
signal: ↓ downloads, ★ stars, 💬-free "chats" label for datacat), `n` a numeric stat bag
(`downloads/stars/likes/favorites/views/chats/messages/rating/tokens/created/updated`, absent =
unknowable) feeding BOTH the sort comparators and the detail's stat rows. `statRows(row)` is the ONE
formatter from `n` → ordered `[{key,value}]` display rows (dates YYYY-MM-DD, counts compact, rating
"4.2 / 5"), published as `detail.stats` and bound via `rowsFrom` — Creator/From/Content/Tags rows
folded in, so every hub's detail is uniform-by-construction and shows only real data.

**Per-hub sort vocabulary** (each hub's `sortOptions` published as state; the select binds
`optionsFrom: {$state:"sortOptions"}`; every list opens with `relevance` labeled per-hub — botbooru's
and datacat's say "Newest (default)" since that IS their default order): tavern
relevance·downloads·likes·name (page-side over row stats — the v1.2 posture); realm
relevance·trending·downloads (server)+name; chub relevance·trending·stars·favorites·rating·newest·
updated (server, always `asc=false`)+name; wyvern relevance·name; aicc relevance·downloads·rating·
newest (server)+name; charavault relevance·newest·oldest (server)+name; botbooru
newest(default)·downloads·favorites·views (server)+name; pygmalion relevance·downloads·stars·views·
newest (server)+name; datacat newest(default)·chats (server)+name. `sortRows` generalizes to one
comparator map over `n` (unknown-datum rows sort last; held-set sorts the whole set, server-paged the
page in hand — so the page's display order is always the promised one even where a hub ignores its
sort under a text query, the chub finding). An unknown/unsupported sortKey folds to relevance at
search time; the status line names the active sort.

**The SFW config (#800)**: a `toggle` (name `sfw`, label "SFW only", `actionId:"search"`) joins the
Hub/Sort row. Default OFF = show all (the owner-ruled posture inversion: every v1.2 row mapper that
DROPPED flagged rows now keeps + flags them). ON: chub `nsfw=false` · realm omits `nsfw=true` ·
botbooru `sfw_only=true` (server params); tavern/wyvern/aicc/charavault/datacat drop `nsfw===true`
rows row-side. OFF: chub `nsfw=true` · realm `nsfw=true` · botbooru default feed. Pygmalion is
SFW-curated regardless (honest no-op). Flagged rows get an `nsfw` chip prepended to their tag row and
a "Content: NSFW" stat row (explicit-SFW hubs get "Content: SFW"; silent hubs no row). The value
persists per-install in kv (`sfw_mode`) and seeds the NEXT registration.
**BUILD-TIME PREMISE REFUTATION (the pin worked):** the floated-only registration
(`load kv → register → publish` as one boot continuation) RACED the very next `listSurfaces` — the int
test's read right after enable returned `[]` (the pump does not reliably drain the boot chain before the
verb returns, even though the v1.2 activation PUBLISH always landed before the later `getSurfaceState`
read). Shipped mechanism instead: activation registers the DEFAULT posture synchronously (the page
exists the moment activation returns), and the floated boot continuation RE-registers only when the kv
value differs — carried by a small host change, **`ui.register` now UPSERTS by surface id**
(`sandbox.ts` `upsertSurface`: a re-registration REPLACES the row; previously it appended, so a
duplicate id would project twice through `listSurfaces` and the stale first row won every `find`). The
upsert is pinned in `tests/server/infra/plugin-host/port.test.ts` over the real Sandbox collect path
(replace + distinct-id append both asserted); rejected-alternative 5's "lying switch" is avoided because
the revision lands one pump beat after activation, orders of magnitude before a human opens the page.

**The three new sources** ride the existing seam untouched: botbooru (XHR header, row-side tag
filters, PNG-first import via `/download/png`, cover = the card PNG); pygmalion (POST search via
`net.fetch`'s POST arm, JSON fold from `personality`, no tag filters, no PNG); datacat (module-held +
kv-cached session token, one re-mint on 401/403, `search`+`sortBy=chat_count`, cover =
`avatarVariantUrls.thumb`, hero = `.card`, JSON fold from detail `chara_card_v2_json` →
personality/scenario/first_message → honest "this mirror only recovered the profile" error on
DEGRADED rows; the Turnstile-walled download route is not touched). JanitorAI proper: refused with
the receipt above. Manifest: 1.3.0, +6 hosts (= 16, at cap), capabilities unchanged — widened reach ⇒
re-consent, by design.

### 8c Rejected alternatives

1. **A static superset Sort select** (all ~10 keys, unsupported ones folding) — shows modes a hub
   cannot answer; the owner asked for per-hub real vocabulary. Rejected for `optionsFrom`.
2. **A fixed detail keyValue with "—" padding** — half-empty rows on sparse hubs is the exact
   "info in the right places" failure. Rejected for `rowsFrom`.
3. **SFW as a plugin `settings`-anchor surface** — a second surface + the same registration-seeding
   problem, and the control leaves the page it affects. Rejected for the in-row live toggle.
4. **SFW session-only (reset on respawn)** — a "per-user setting" that silently forgets is a soft
   lie. Rejected for kv-seeded registration (the floated-boot mechanism is already the publish path).
5. **Registering synchronously with a default-OFF toggle + kv authority at search time** — the UI
   would show OFF while filtering ON after a respawn (a lying control). Rejected.
6. **Wiring pygmalion/datacat tag filters** — pyg: include with a common word returns 0 (opaque
   taxonomy) and rows carry no tags; datacat: tags exist only on detail. A filter that mostly returns
   empty teaches distrust. Not wired; the status line says so where a person tries.
7. **Chub `download_count` sort** — returns the star order (the counter is dead on the wire); offering
   it would label stars as downloads. Rejected.
8. **BotBooru topRated/trending** (the legacy curated arms) — refuted live in five spellings. Not wired.
9. **JanitorAI via jannyai scrape-mirror** — the corsproxy/scraped-token pattern is gate-banned
   (`no-raw-egress`); datacat delivers the same catalog through a real API. Refused.
10. **A NET_HOSTS_MAX bump** — the roster lands at exactly 16; a speculative widening buys nothing.

### 8d Coupled sites (v1.3 fan-out)

1. `packages/contracts/src/plugin/ui.ts` — the three arms + schemas + XOR belts + the two resolvers + `ownBinding`-relevant docs.
2. `packages/client/src/features/plugin/lib/plugin-surface-bindings.ts` — `selectOptions`/`keyValueRows` collapse helpers + `ownBinding` counts the new bound arms.
3. `packages/client/src/features/plugin/components/plugin-leaf-nodes.tsx` — select uses resolved options; keyValue uses resolved rows; toggle fires its `actionId`.
4. `packages/server/src/entry/boot/seed-assets/plugins/host-v1.d.ts` — the guest-facing vocabulary mirror.
5. `packages/contracts/src/plugin/host-v1.ts` — doc-comment truth where it names the select/toggle arms.
6. `…/card-atlas/main.js` — row v3, stat mining, per-hub sortOptions, SFW, three new sources, sync-register + upsert-revision boot, header truth.
7. `…/card-atlas/manifest.json` — 1.3.0, +6 hosts, description.
8. `…/card-atlas/README.md` — roster/sort/stat/SFW teaching + honest gaps (janitor, pyg NSFW, datacat degraded rows, botbooru heavy covers).
9. `packages/server/src/infra/plugin-host/sandbox.ts` — the `upsertSurface` collect change (the SFW revision's carrier — see 8b's refutation record).
10. `tests/server/infra/plugin-host/port.test.ts` — the upsert pin over the real Sandbox collect path.
11. `tests/contracts/plugin/ui.contract.test.ts` — XOR belts both directions + resolver clamps/drops for both new arms + toggle actionId ident grammar.
12. `tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx` — red-first: bound select options render; bound keyValue rows render; toggle actionId round-trips with the fresh value.
13. `tests/server/entry/boot/seed-example-plugins.int.test.ts` — atlas slice: 16-host mirror, SFW-toggle + optionsFrom + rowsFrom spec pins, sortOptions in the activation publish, roster pins.
14. This file + its catalog receipt (re-attest).

Checked NOT coupled: `plugin-browse-nodes.tsx` (no browse-genre node changes), `media-tile-grid`
(tags slot unchanged), `pluginChildNodes` (no new child-bearing kind), the ui-guest realm (renders
through the same schema + leaves), `ui.test-d.ts` (no new kind), footer-allowed record (no new kind).

### 8e Test plan + verification

- **Red-first CT** (against the unmodified renderer): the bound-select and bound-keyValue pins fail
  today by construction — the registration schema refuses `optionsFrom`/`rowsFrom` (unknown key +
  missing required arm) so the story renders the safe fallback; that IS the planted control.
- **Floors**: `pnpm ct:scoped tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx --workers=2` ·
  `pnpm test:scoped tests/server/entry/boot/seed-example-plugins.int.test.ts tests/contracts/plugin/ui.contract.test.ts --maxWorkers=4` ·
  per-package `pnpm typecheck` (owns the .ct.tsx) · `node scripts/ts7.cjs --noEmit -p tsconfig.json` ·
  scoped biome · scoped `pnpm check:docs`.
- **Live drive** (the wire arms are live-only): pack 1.3.0 → `snap --isolated --ref <sha>` → the real
  upgrade verb → re-consent naming the six new hosts → enable → per hub: grid + a NON-DEFAULT sort
  receipt (top tile's stat ≥ the next) + the SFW toggle both states (a flagged hub's set shrinking) +
  a detail with the full stat rows → renders desktop + ~390px for the owner.

### 8f Live-drive record (2026-08-29 — what landed, what a HOST defect blocks, three defects found)

**Two drive tiers ran.** (1) An offline-realm harness (node, stubbed `orb.host`, REAL fetches) drove
the exact shipped `main.js` against all NINE live hubs end-to-end: per-hub default + one non-default
sort (orderings verified against the stat labels), SFW both states (chub 27 flagged tiles at OFF → 0
at ON; datacat 30 → 0 with the honest empty; realm's server param flipping the set), detail stat
sheets per hub, tag chips, dc-token mint + reuse (`dc_token` in kv), `sfw_mode` persistence. (2) The
REAL stage drive: pack → `plugin.upgrade` (wire receipt) → the widened-reach re-consent (6 checkboxes,
16 acknowledged hosts on the `setGrant` wire) → enable → drives.

**Stage-rendered receipts** (`reports/snaps/reports/l-hubX/` in the lane worktree — MOVE BEFORE
TEARDOWN): Character Tavern sorted grid (real covers, `· most downloaded.` status, monotonic 8.2k →
5.6k), RisuRealm sorted grid (812.1k → 533.8k, tag chips), Pygmalion full grid ("30 from Pygmalion.",
covers off `assets.pygmalion.chat`, its 6-entry sort menu open), BotBooru/Datacat/Chub sort-menu-open
receipts (each hub's EXACT mined vocabulary in the bound select, per-hub default labels), the SFW
toggle ON (`· SFW only.` status, live-toggle-fired search), the detail stage (hero + the bound stat
sheet: Downloads/Likes/Messages/Tokens/Content — the v1.3 mined rows), the empty page, and the full
desktop/mobile × light/dark matrix (the 3-control row wraps cleanly at mobile width).

**THE HOST DEFECT (filed for its own lane — plugin-host, P2):** on the live stage, a hub search whose
response body is LARGE (wyvern ~202 KB; chub@30-with-definitions; aicc@30-with-descriptions) PARKS
FOREVER after the fetch: the host side completes wholly (instrumented stage receipts: impl enter →
status 200 → body decoded → race resolved `alive=true` → `deferred` resolved → post-settle pump ran
4 jobs, `failed=false`, `hasPendingJob()=false` after) yet the guest continuation never resumes —
no throw, no `.catch`, no crash strike, no log. Small-bodied hubs (tavern 11 KB, realm 51 KB,
pygmalion ~12 KB) complete on the same resident. The 1.3.1 `mapLimit` commit closed the SEPARATE
`>32 concurrent host calls` kill (its own live receipt) but not this. Suspects recorded for the
follow-up: the shared-runtime interrupt handler vs per-context CPU windows (`installCpuGuard` is
per-context on ONE shared QuickJS runtime), and `executePendingJobs`' early-yield semantics. Probe
kit: the settle-chain instrumentation left in the STAGE COPY's `membrane.ts`/`cpu-guard.ts` (never
the tree), plus a 1.3.3 probe bundle with ring-bracketed `getJson`.

**Defect 2 (observability, filed):** post-invocation guest log lines are DESTROYED, not shown —
`runToSettlement` begins with `this.log.reset()`, so everything a floating continuation logged since
the last invocation is silently discarded before the drain. Every continuation-era `host.log.*` line
is structurally invisible in `plugin.getLog` — which is exactly where a floated search failure would
land. The ring must survive across invocations (drain-append instead of reset, or a resident-level
ring).

**Defect 3 (a11y, FIXED here):** the plugin row's enable Switch carried a STATIC
`aria-label="Turn <name> on"` regardless of state — an enabled plugin's switch announced as "Turn on"
(and measurably fooled the driving instrument into disabling a live plugin). The label now follows
state (`plugin-row.tsx`).

**Honest roster verdict at graduation:** all nine hubs verified end-to-end at the wire tier; on the
stage, tavern/realm/pygmalion verified fully rendered, chub/wyvern/aicc/botbooru/datacat verified
through registration/menus/immediate-publish with their searches blocked by the host defect above
(NOT by their adapters — the identical guest code completes against the identical live APIs in the
node harness). JanitorAI stays refused (no public API; the jannyai mirror is the gate-banned
scrape+corsproxy pattern; datacat IS the janitor catalog through a real API).

### 7g Mid-lane scope adds (owner + side-eye, relayed 2026-08-29 — all folded in)

- **LIVE Hub/Sort selects** (side-eye P2): the `select` vocabulary gains an optional `actionId`
  (the `searchBar.actionId` shape one control over — contracts + schema + the leaf renderer's
  change-fires-submit wiring, the fresh value riding the `extra` merge so the async React state write
  cannot race it). Both atlas selects fire `search` on pick.
- **Tile accessible name** (side-eye P3): the interactive `MediaTile` button carries an explicit
  comma-joined `aria-label` ("World RP, rickrocka · 7.4k↓") — content-derived naming ran title and
  subtitle together. Pinned at the primitive CT.
- **The 5 MiB asset byte cap** (`PLUGIN_ASSET_MAX_BYTES`, side-eye P3): RisuRealm serves full-size
  ~2.6 MB covers with NO resize variant (`?width=` ignored, probed; its own site ships the same bare
  URLs), so the 1 MiB guard was rejecting most realm art. The cap is the belt split's size sibling:
  fetchAsset bytes never enter the guest, so the marshalling result cap that prices
  `PLUGIN_NET_MAX_BYTES` does not apply; the image guard's dimension/pixel caps still hold the bomb
  wall.
- **THE ROSTER (owner: "handle ALL of them")** — the source seam went from 2 to 6 wired hubs, and the
  briefed premises were re-derived first: the brief said wyvern was "designed, never built" — FALSE,
  legacy built SEVEN adapters (chub, wyvern, chartavern, risurealm, botbooru, charavault, aicc; the
  `HUB_ADAPTERS` registry at `legacy-main:packages/server/src/infra/network/hubs/index.ts`). The
  brief said chub is geo-blocked from this box — DID NOT REPRODUCE (live 200 with the browser-UA
  pair, 2026-08-29). All four candidate hubs probed live and answered: **chub** (full server
  include+exclude+sort, row topics, avatar.webp covers, card PNG; `nDownloads` now null on the wire →
  `starCount` is the popularity signal, labeled ★), **wyvern** (clean API, row tags, Cloudflare-Images
  covers, native-V2 JSON detail that doubles as the import body), **aicc** (curated; limit/skip
  paging, `orderBy=downloadCount`, relative webp covers, native V2 PNG), **charavault** (95K
  aggregator; browser-UA quirk; its card PNG doubles as its cover — heavy but honest). SKIPPED with
  receipts: **botbooru** (built legacy adapter, but its DEFAULT feed includes NSFW with tag-derived
  ratings — wiring it into the seeded SFW example is an owner content-posture call);
  **pygmalion/janitorai/datacat** (never built anywhere — no adapter, no probe record; each needs its
  own probe campaign, priced as the follow-up). netHosts grew 4 → 10 (each hub host+CDN its own
  consent line; hub-host widening owner-authorized).
