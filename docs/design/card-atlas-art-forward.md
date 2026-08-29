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
  **BUILD-TIME PREMISE CORRECTION (measured live, then redesigned): phase (3) must FLOAT.** The
  invocation SETTLEMENT WALL (`PLUGIN_INVOCATION_CPU_MS` 1000 + `HOST_FN_DEADLINE_MS` 5000,
  `sandbox.ts` header — in no doc the phase-1 read covered) bounds a whole action handler at ~6 s of
  real time; a realm search + 24 fresh covers blew it, which was a deadline kill + crash strike + a
  respawned session (observed: a stranded "Searching…" status and a fresh `ready` log line). The
  batch now rides a FLOATING promise the host's job pump advances between invocations (the
  activation-time `void publishBrowse("")` precedent; the `guest-job-pump-outside-the-interrupt-handler`
  memory), republish guarded by session identity (`lastResults === rows`). Same float for the detail
  hero upgrade; the summon arm stays IN-invocation (its toasts ride the round-trip outcome and its
  typical spend is ~2 s) and drops its post-summon detail refetch (the session's own blurb republishes).
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
