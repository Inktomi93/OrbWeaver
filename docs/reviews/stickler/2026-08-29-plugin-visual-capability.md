---
kind: review
status: active
updated: 2026-08-29
---

# stickler — Plugin visual capability: can plugins (esp. the card-atlas hub) look genuinely GOOD? (2026-08-29)

Frontier investigation, not a diff review. Charge: do the app's visual styles apply to plugin
surfaces; is the card-atlas flagship using the visual vocabulary; is the closed node vocabulary rich
enough for a great-looking hub; what should be ADDED (each with its security tradeoff); and how do we
render the hub POPULATED for a real visual pass. Every claim below is tree-verified or
pixel-verified this session; receipts are `path:line` or a named screenshot under `reports/snaps/`.

**Headline result: the populated Card Atlas grid was RENDERED LIVE for the first time this session**
(the "hubs time out / geo-block" premise is dead — Character Tavern answered 200 in 0.229s from this
box; the app-side round-trip was 577ms). Receipts: `reports/snaps/atlas-grid-populated.png` (24-result
browse grid) and `reports/snaps/atlas-detail-populated.png` (detail stage). The prior side-eye failure
(`docs/reviews/side-eye/2026-08-29-plugin-automation.md:177-180`) was two driver traps, not the
network — the recipe is §5.

**The one-paragraph verdict.** The declarative plugin plane is architecturally excellent at looking
house — a node surface IS house components under the live cascade, so theme/density/a11y/focus are
free and the rendered atlas page proves it. The bones of the hub (container-query tile grid, reserved
aspect boxes, hover scale, skeletons, masterDetail, searchBar) are genuinely good. But the flagship
**does not yet fuck**, and the reason is one structural wall, not authoring laziness: **there is no
path for external image bytes to become a CAS asset**, so an art-medium browser renders a wall of
identical empty placeholder boxes — the purged hub's failure 1 ("the genre's primary signal was
absent") resurrected in a different costume — and the summoned character lands with no avatar either.
One new host-side capability (`net.fetchAsset` → installer CAS, §4 item 1) turns the flagship
art-forward without moving any security wall the vocabulary holds.

---

## §1 Do the app's visual styles/tokens/theme actually apply to plugin surfaces?

### Node-based (static + scripted tiers): YES, by construction — verified in source and pixels

- The ONE renderer maps every closed node kind to sealed `@orb/ui` primitives; a plugin composes
  house components as data and never touches DOM/CSS
  (`packages/client/src/features/plugin/components/plugin-surface-renderer.tsx:1-9`, the design's
  §4.7 claim at `docs/design/plugin-ui-plane.md:530-537`). Rendered receipt: the live atlas page
  (`atlas-grid-populated.png`) is fully house — fonts, dark-theme colors, focus ring on the input,
  house Button/Input/Collapsible, the container-query grid.
- Theme flips, custom themes, and density need zero plugin-side machinery — the surface sits under
  the live cascade like any first-party feature. `snap --theme/--appearance` would exercise them
  identically (not separately driven; the mechanism is the cascade itself, there is no plugin-side
  token channel to go stale).

**The real gaps are VOCABULARY REACH, not token reach** — a node surface gets the full cascade
*through the primitives it can name*, and the nameable slice is deliberately narrow:

| Axis | Reachable slice | Receipt |
| - | - | - |
| layout gaps | 5 tokens (`tight/field/row/block/section`) | `packages/contracts/src/plugin/ui.ts:64` |
| text voices | 3 (`body/gloss/label`) of the house's \~12; headings only via `section` kicker + the detail stage's focal title | `ui.ts:70` · `plugin-browse-nodes.tsx:119,129` |
| badge intents | 5, `primary` excluded (S1 law) | `ui.ts:75` |
| button weights | 2 (`neutral/outline`), both render non-primary | `ui.ts:80` · `plugin-leaf-nodes.tsx:310` |
| icons | NONE — no icon node exists | `PLUGIN_NODE_KINDS`, `ui.ts:101-122` |
| accent/primary color | unreachable anywhere | deliberate (S1), `ui.ts:74-81` |
| measure/width | never spellable — and the promised reading measure is NOT implemented (finding F2) | §2 |
| full-bleed | impossible — the page shell pads the body `p-block` | `plugin-surface-shell.tsx:72` |
| loading states | no skeleton/loading vocabulary exists (finding in §3) | — |

### Iframe (`frame` tier): the injection is TWO color tokens + one font — a frame cannot look house

- The whole injected set is `--sandbox-bg` = `color.card`, `--sandbox-fg` = `color.card-foreground`,
  plus the sans font-family list
  (`packages/ui/src/content/sandbox-frame/use-sandbox-theme.ts:17-22`); the kit base body rule
  consumes exactly those (`packages/kit/src/card-frame/index.ts:383`). The showcase doc states the
  same fact (`docs/design/plugin-showcase-set.md:49`).
- What a frame plugin CANNOT resolve: accent, border, muted/muted-foreground, the semantic ramp,
  radius, spacing scale, density, the mono font, elevation. Dark/light flips DO recolor live (the
  `createLiveTokenStore` re-resolve, `use-sandbox-theme.ts:45`) but only through those two values.
  `pocket-arcade` is themed by exactly this and it is the ceiling of what a frame can match today.
- This is a null-origin physics cost (the design prices it, `plugin-ui-plane.md:104-111`), but the
  SLICE injected is a choice — widening it is §4 item 9.

---

## §2 Findings (defects confirmed this session, ranked)

### F1 — P2 · The flagship is art-free END TO END, and its own docs claim otherwise

- `packages/server/src/entry/boot/seed-assets/plugins/card-atlas/main.js:34-36` and its
  `README.md:72-74` state: *"the art arrives the moment you summon the card... into the room, where
  the character's own avatar pipeline owns it."* **Refuted on the tree.** Card Atlas ingests card
  JSON only (`main.js:222-292`); the plugin ingest op passes the JSON to the import funnel
  (`entry/compose/automation-plugin.ts:758`), and the funnel stores an avatar ONLY from card PNG
  bytes — `packages/server/src/domain/import/verbs/import-character.ts:158`:
  `const avatarAssetId = png ? await ctx.storeAsset(...) : null`. A JSON ingest ⇒ `avatarAssetId:
  null`. So the browse grid has placeholder covers (pixel receipt: `atlas-grid-populated.png`, 24
  identical empty boxes), the detail stage has no hero, AND the summoned character has no avatar.
- Failure scenario: a user summons a card expecting the promised art hand-off and gets an art-less
  character; a plugin author copies the flagship believing the pipeline exists.
- Fix is two-part: repair the two doc lines now (they are teaching material), and build §4 item 1
  (the real fix).

### F2 — P3 · The detail stage's promised "reading-width column" does not exist — the decision surface renders as a full-width text sheet

- The contract promises it (`packages/contracts/src/plugin/ui.ts:90-93`: *"a hero slot above a
  READING-WIDTH prose column"*) and the renderer's comment claims the mechanism (*"the house `prose`
  measure on the text primitives themselves"*, `plugin-browse-nodes.tsx:90-93`) — but `prose` on
  `Text` is a SIZE/LEADING variant, not a measure
  (`packages/ui/src/primitives/text/variants.ts:158-160`), the `markdown` node renders with no
  measure wrap at all (`plugin-leaf-nodes.tsx:216-220`), and the detail arm is a bare `Stack`
  (`plugin-browse-nodes.tsx:124-132`). Pixel receipt: `atlas-detail-populated.png` — the blurb runs
  \~150 chars/line edge-to-edge, and the keyValue rows put label and value at opposite ends of an
  \~890px scan gap.
- Consequence: the exact §4.5b failure 2 the vocabulary was minted to close ("the decision surface
  got the least design") is only half-closed; at wide viewports the preview reads worse than the
  browse grid. Fix is renderer-side only (wrap the detail stage body in the house measure), zero
  vocabulary change.

### F3 — P3 · The decision surface's one primary action has no visual hierarchy

- "Summon to your library" renders `intent="secondary"` (the vocabulary clamps `button` to
  neutral/outline, `ui.ts:78-81`; the leaf maps neutral→secondary, `plugin-leaf-nodes.tsx:310`).
  Pixel receipt: `atlas-detail-populated.png` — Summon and "Back to results" carry near-equal visual
  weight. The S1 one-primary law this clamp cites was minted for the chat control band
  (`interaction-direction-spec.md:140-143` per the design doc); on a `page` anchor the page IS the
  plugin's whole surface and owns its own attention budget. Priced as §4 item 5 (owner call — it is
  a recorded-law input change, not a bug).

### F4 — P3 · A grid's empty state is a bare one-line gloss, not the house EmptyState

- `SurfaceGrid` renders `empty` as a single `Text voice="gloss"` line
  (`plugin-browse-nodes.tsx:50-56`), while the section's own empty states use the house
  `EmptyState` (icon + measure + action) one file over
  (`surfaces/extensions-page-surface.tsx:54-66`). Pixel receipt: `atlas-page.png` — the pre-search
  page is a form + one grey sentence above \~500px of void. The three-states law calls empty states
  load-bearing; the vocabulary's most browse-shaped node has the least designed one. Renderer-side
  fix, no vocabulary change.

### F5 — P4 · Doc-truth: the two comment lines claiming the unbuilt measure (part of F2)

- `ui.ts:92-93` and `plugin-browse-nodes.tsx:92-93` assert a mechanism the shelf does not have;
  whichever way F2 resolves, the prose and the pixels must agree.

Also relevant, found by the prior side-eye and NOT re-filed here: the "Card Atlas · Card Atlas"
doubled title and the zero-pages double empty state
(`docs/reviews/side-eye/2026-08-29-plugin-automation.md:92-110`).

---

## §3 Is the card-atlas hub using the visual vocabulary? Is the vocabulary rich enough?

### What card-atlas uses (it is a faithful, near-maximal consumer of what exists)

`masterDetail` (browse+detail, `main.js:372-444`) · `searchBar` with the hub picker in its collapsed
`filters` (`main.js:384-401`) · a BOUND grid (`tilesFrom` + `tileAction` + `aspect:"portrait"` + a
teaching `empty`, `main.js:404-409`) · status line as bound gloss text · `keyValue` provenance rows ·
`markdown` blurb · outline/neutral buttons · toasts on every summon arm (`main.js:300-322`) ·
published-state stage nav (`active:{$state:"stage"}`) — which I confirmed LIVE survives across three
separate browser contexts (the resident holds it; run receipts in the verification log). The only
expressible things it skips are minor: paging ("an `actionId` away", its own README:80-81), badge
nodes on the detail stage, `section` grouping.

### So the thinness is structural, and the verdict on "does it fuck" is NO — yet

`atlas-grid-populated.png`: clean typography, correct 4-column container-query grid, reserved
portrait boxes, "24 from Character Tavern for "elf knight"." — and **every single tile is the same
empty dark box with a small icon**, because no tile can carry a cover
(`MediaTileGrid`'s no-cover placeholder, `packages/ui/src/primitives/media-tile-grid/media-tile-grid.tsx:41-44`).
An art-medium browse surface with 0% art. The grid composite itself is good (hover scale
`variants.ts:40`, badge overlay, container-query columns `variants.ts:25`, shape-matched skeleton
`media-tile-grid.tsx:136-154`) — the bones are there; the medium is missing.

### REAL vocabulary limits (a beautiful hub wants these and cannot spell them)

1. **External image bytes → CAS. THE limit.** The `image`/tile source is an installer-CAS `assetId`
   only (`ui.ts:359-375`, the seam-11 wall); `net.fetch` returns TEXT (`host-v1.ts:490`); there is
   no CAS-write host fn (`manifest.ts:13-64` carries `assets.read` at :34, no write). Every
   external-media plugin — hubs, RSS-with-thumbnails, gallery scrapers — is structurally art-free.
2. **The detail hero is not bindable.** `PluginPageStage.hero` takes a DECLARED `assetId` only
   (`ui.ts:517`, schema `ui.ts:683`) — no `assetFrom` arm, unlike `image` (#774 ARM C). A
   data-driven detail page (the only kind a hub has) structurally cannot use the one slot designed
   for "the moment a person decides", even after limit 1 falls. Workaround (a bound `image` in the
   body) loses the hero treatment.
3. **No loading vocabulary.** `MediaTileGridSkeleton` exists on the shelf and nothing can spell it;
   during a search the results area sits stale/empty (the Search button's spinner is the only
   feedback, `plugin-browse-nodes.tsx:183`). The three-states law's LOADING state is unreachable.
4. **No icon node** (`PLUGIN_NODE_KINDS`, `ui.ts:101-122`) — no glyph vocabulary for stat rows,
   source markers, or affordance labels.
5. **No tabs/option-strip** — the hub picker lives collapsed under "Filters" (rendered receipt:
   `atlas-page.png`), which under-serves a two-source switcher; house `tabs`/`option-strip` exist on
   the shelf and are unreachable.
6. **No primary CTA** on any anchor (F3).
7. **No measure control** (F2 — half a renderer bug, half a missing guarantee).
8. Minor: no second meta line/stat row on grid tiles beyond `subtitle`+`badge`; no divider node; no
   avatar/status-chip nodes; charts/code/table shelf members unexposed (the design's §4.3 shelf rule
   anticipates exposures by demand).

Things that look like limits but are NOT: empty-state text (exists on `grid`), per-tile actions
(both arms exist), hover/focus affordances (MediaTileGrid carries them), aspect control (exists),
state-persistent navigation (exists and proven live), toasts/dialogs (host-mediated, exist).

---

## §4 What to ADD — prioritized, each with its security tradeoff

1. **P1 — `host.net.fetchAsset(url) → { assetId, mime }`: host-performed image download into the
   installer's CAS.** Bytes never enter the guest (no 1 MiB marshal issue); the download rides the
   SAME egress wall (`safeFetch` + manifest `netHosts` allowlist + the hourly floor) and the
   EXISTING remote-image guard — magic-byte sniff, never the remote Content-Type, dimension/pixel
   caps (`packages/server/src/infra/network/image-guard.ts:1-33`, already built for exactly this
   class). The vocabulary stays assetId-only: no URL is ever spellable in a node, so the exfil-pixel
   wall (`ui.ts:190` in the design table) holds unchanged. The sanctioned wiring shape is already
   recorded: widen `PluginBridge` so infra's ONE guarded fetch serves both callers
   (`host-v1.ts:721-728`'s own note). Tradeoffs, stated: (a) hostile image bytes enter the
   installer's CAS and are later served to their own browser — mitigated by the sniff+caps and the
   existing blob pipeline; (b) storage growth — add a per-plugin count/byte quota; (c) egress delta
   is ZERO (arbitrary GETs to the allowlisted hosts are already expressible via `net.fetch`, so no
   new exfil channel opens). Capability spelling: ride `net.fetch`'s grant (same hosts, same reach —
   the consent line already names the hosts) or mint `net.fetch_asset` beside it if the owner wants
   the ingress named separately.
   - **1b (companion): `character.ingestAsset(assetId)`** — ingest a fetched card PNG through the
     EXISTING PNG import funnel, which already stores the avatar from the same blob
     (`import-character.ts:158`, one-blob-two-roles). Closes F1's import half: summoned characters
     arrive WITH their art. Tradeoff: none beyond `character.ingest`'s existing consent — the PNG
     path is the funnel's oldest, most-belted arm.
2. **P2 — `assetFrom` on `PluginPageStage.hero`** (limit 2). Mirrors #774 ARM C exactly: format-gate
   at resolve, the same owner-scoped `resolveBlobRefs` read (foreign ⇒ no paint). Zero new security
   surface — the identical belt already guards `image.assetFrom`
   (`plugin-surface-renderer.tsx:15-20`).
3. **P2 — a `loading` bound-boolean on `grid`** rendering `MediaTileGridSkeleton` (shape- and
   aspect-matched, `media-tile-grid.tsx:136-154`). Pure display; no security cost; closes the
   LOADING third of the three-states law for the browse genre.
4. **P2 — implement the reading measure on the detail stage** (F2): renderer-side wrap of the
   `detail` arm's body (and the `markdown` leaf) in the house measure. No vocabulary change, no
   security surface; makes `ui.ts:92-93` true.
5. **P3 — admit `variant:"primary"` per-anchor at `page`/`dialog`** (F3), via a per-anchor belt in
   the exact `PLUGIN_FOOTER_NODE_KIND_ALLOWED` pattern (`ui.ts:223-247`) so the transcript/band
   anchors keep the clamp. Tradeoff: this is a deliberate input-change to the S1 one-primary law
   (owner call, "the ruling survives — its INPUT changed": the band's budget is untouched; a full
   page owns its own). Impersonation is unchanged — the button sits inside the no-opt-out
   attribution band (`plugin-surface-shell.tsx:53-67`).
6. **P3 — an `icon` node over a CURATED closed tuple of sealed icon names.** Compile-tier like every
   axis. The one real tradeoff: glyph impersonation — EXCLUDE the chrome-identity glyphs (the
   `Blocks` attribution glyph itself, lock/shield/consent iconography) from the tuple so a plugin
   cannot dress a fake consent row in the house's trust glyphs.
7. **P3 — `tabs`/`optionStrip` node** (house tabs / option-strip) for source switching and stage
   nav; item-count capped like `select`. No new security surface (pure display + the existing
   actionId round-trip).
8. **P3 — render `grid.empty` as the house `EmptyState`** (F4). Renderer-side, no vocabulary change.
9. **P4 — widen the sandbox token injection** to a curated slice (bg, fg, muted, muted-fg, accent,
   accent-fg, border, a radius value, the mono font), each `isSafeColor`-clamped at the frame
   boundary like today's two (`use-sandbox-theme.ts:27-37` — the record is already generic).
   Tradeoff: marginally more theme fingerprint inside an already-consented frame; near-zero. Frames
   go from "two-color costume" to house-adjacent.
10. **Later, by demand (the §4.3 shelf-exposure rule):** charts/code/diff/table/avatar/status-chip
    node exposures — each inherits its member's seal wholesale; none is needed for the hub.

**Where the line should move: only item 1 moves a wall, and it moves the INGRESS half only.** The
closed union, the assetId-only rule, the no-URL rule, the impersonation shell, and the frame's
isolation all stay exactly where they are. Everything else above is reach WITHIN the existing trust
model (new spellings of already-safe house primitives, or renderer-side fidelity).

---

## §5 Rendering the hub POPULATED — the recipe (proven this session)

### (a) LIVE, today, zero code — this now works

```
node tooling/src/snap/cli.ts --goto extensions --click 'text=Card Atlas' \
  --wait-for input --fill 'input=<query>' --key 'input=Enter' \
  --wait-for 'text=Character Tavern for'
# detail stage: append  --click '[data-slot="media-tile"]' --wait-for 'text=Back to results'
```

Proven: steps-failed=0, `plugin.invokeUiAction` 577ms, 24 tiles rendered
(`atlas-grid-populated.png`, `atlas-detail-populated.png`; run logs in the session scratchpad).
**The three driver traps that made every earlier attempt fail:**

1. `text=Search` resolves to the LABEL "Search the community hubs" first (document order) — the
   click lands on inert text. Submit with **Enter on the input** instead; the searchBar submits on
   Enter by design (`plugin-browse-nodes.tsx:169-176`).
2. A snap `--fill` selector **cannot contain `=`** (the parser splits on the first one) — use a bare
   `input` selector, not `input[placeholder*="…"]`.
3. The resident's published state SURVIVES across browser contexts (by design), so a later visit may
   open on the DETAIL stage with no search input on screen — `--click 'text=Back to results'` first,
   or expect it. (This is also a live confirmation of the §4.5b "browse context persists" claim.)
   The network premise: Character Tavern answered `200` in `0.229s` from this box
   (`curl …/api/search/cards?q=elf`, this session). The 08-29 side-eye timeout was transient or
   trap-induced; re-drive before assuming the hub is down.

### (b) DETERMINISTIC offline fixture — for a repeatable side-eye when the hubs actually are down

Pack a scratch `card-atlas-fixture` bundle: copy the plugin dir, replace `SOURCES` with canned
`search`/`detail`/`fetchCard` returning fixture rows, have activation publish a POPULATED browse
stage (so the grid is full ON OPEN, zero interaction), and drop `netHosts`/`net.fetch` from the
manifest (fewer grants). `pnpm plugin:pack <slug> ./out` (`package.json:36`), install through the
Add-a-plugin dropzone in the dev app. Zero repo changes; do NOT add it to `EXAMPLE_PLUGIN_SLUGS`
(`seed-example-plugins.ts:42-52` ships to every user). A localhost fixture SERVER is NOT viable —
the egress guard refuses private/loopback targets by design
(`infra/network/egress.ts:14-34`).

### (c) ART-FORWARD pixels before §4 item 1 lands — CT screenshot story

The CT machinery already stubs the whole chain: `routeTrpc` fakes `assets.resolveBlobRefs`
(`tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx:88-136`) and the
MediaTileGrid CT ships data-URL cover fixtures
(`tests/ui/primitives/media-tile-grid/media-tile-grid.fixtures.tsx:13`). Mount
`PluginSurfaceRenderer` with the atlas's own spec + a state of \~24 bound tiles, stub the blob refs
(and `page.route` the `/api/blob/*` urls to fixture PNGs), screenshot at desktop + narrow container.
That renders the INTENDED look — covers, badges, hover — and is the cheapest way to judge the target
aesthetic before the capability exists.

---

## Verified clean / verification log

- **Read in full:** `docs/design/plugin-ui-plane.md` (861 lines), `docs/design/plugin-showcase-set.md`,
  `contracts/plugin/ui.ts` (1260 lines), `plugin-surface-renderer.tsx`, `plugin-browse-nodes.tsx`,
  `plugin-leaf-nodes.tsx`, `plugin-frame.tsx`, `plugin-surface-shell.tsx`,
  `extensions-page-surface.tsx`, `use-sandbox-theme.ts`, `sandbox-frame/srcdoc.ts`,
  `media-tile-grid.tsx` + `variants.ts`, `card-atlas/main.js` (527 lines) + its README + the plugins
  seeder, `seed-example-plugins.ts`, the prior side-eye review. Targeted reads: `host-v1.ts` (fetch/
  assets/capability regions), `manifest.ts` capability tuple, `domain/plugin/contract/ops.ts`,
  `entry/compose/automation-plugin.ts` (ingest wiring), `import-character.ts` (avatar arm),
  `infra/network/egress.ts` + `image-guard.ts` headers, `text/variants.ts` (prose variant).
- **Rendered probes (this session):** 6 snap drives against live `:5173` (logs `snap-run1..6` in the
  session scratchpad); the populated grid + detail captured and preserved
  (`reports/snaps/atlas-grid-populated.png`, `atlas-detail-populated.png`); direct `curl` probe of
  the Character Tavern API (200 / 0.229s). Console: 0 errors / 0 page-errors on every run.
- **Verified clean along the way:** the renderer's two-belt untrusted-spec posture (client-side caps
  re-validation + depth guard + owner-scoped image resolve) matches its stated design; the
  `PLUGIN_ANCHOR_TIERS`/`PLUGIN_TIER_REGISTRAR` totality walls; the shell's no-opt-out attribution
  at panel/page/inline scales; the bound-tile resolve clamps (drop-malformed, count clamp, no
  foreign paint); `MediaTileGrid`'s interactivity fork and reserved-box discipline. No
  contrast/overflow defects were visible in the populated captures (a full side-eye battery on the
  populated surface is now unblocked and is the right next lens).
- **Not read:** the membrane/worker internals (`infra/plugin-host/*` beyond budget/marshal headers,
  `ui-guest-realm.ts`, `ui-guest.worker.ts`), the other seven seed plugins' main.js, the trpc router
  bodies, `entry/http/plugin-frame.ts` — none carries weight for the visual-capability questions;
  security posture claims about them are cited from the design docs/memory, not re-derived.
- **No `pnpm check` run:** no diff is under review and no source was modified; the gate battery has
  nothing of mine to judge. (The only writes: this report + screenshot copies under gitignored
  `reports/snaps/` + scratchpad logs.)
- **Unconfirmed, low priority:** the rendered detail blurb showed `**OG DESCRIPTION:**` as literal
  asterisks (`atlas-detail-populated.png`) — Streamdown-untrusted parsing strictness vs malformed
  hub text; not chased, cosmetic, hub-authored content.

## Memory-lesson candidates (for the orchestrator's store — I do not write memory)

- `card-atlas-live-drive-recipe` — *Populated card-atlas grid renders live; three snap traps:
  text=Search hits the label (submit via Enter), --fill selectors cannot contain '=', resident state
  can open the page on the detail stage.* Body: §5(a) verbatim + the 0.229s curl receipt; re-probe
  the hub API by curl before believing a timeout.
- `plugin-plane-has-no-image-ingress` — *Every external-media plugin is structurally art-free:
  net.fetch returns text, image nodes are installer-CAS-only, no CAS-write host fn exists — the fix
  shape is host-side fetchAsset→CAS via the existing image-guard + PluginBridge widening
  (host-v1.ts:721-728's own sanctioned note), never a URL arm in the vocabulary.*

## Issue summary (paste-ready)

Stickler frontier review of plugin visual capability (card-atlas flagship): **the declarative plane
applies the app's full visual system by construction (verified in source and live pixels) and the
hub's bones are good, but the flagship is art-free end to end** — no path exists for external image
bytes to become CAS assets (net.fetch is text-only, no CAS-write host fn), so the browse grid
renders 24 empty placeholder tiles and summoned characters land without avatars, while the plugin's
own README claims otherwise (refuted at `import-character.ts:158`). **The populated grid was
rendered live for the first time this session** — the "hubs unreachable" premise was two driver
traps, recipe in the report — receipts `reports/snaps/atlas-grid-populated.png` /
`atlas-detail-populated.png`. 5 confirmed findings (1×P2 doc-refuted art pipeline, 3×P3 rendered
fidelity: unimplemented reading measure, no primary CTA on pages, bare-gloss grid empty, plus a
doc-truth P4), and a 10-item prioritized additions list headed by P1 `net.fetchAsset`→CAS (+
`character.ingestAsset`) with security tradeoffs stated — only that item moves a wall, and only the
ingress half; the closed-union/no-URL/attribution walls all hold. Report:
`docs/reviews/stickler/2026-08-29-plugin-visual-capability.md`.
