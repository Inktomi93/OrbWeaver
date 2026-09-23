---
kind: design
status: active
updated: 2026-09-01
---

# #885 QueryBoundary.reserveKey + #884 collapsible touch-floor defaults — design

> Lane cb-reserve-floor (forge). #885 is the design-risk lead: ONE reservation seam for every
> suspending surface; a wrong shape forces a re-migration of every keyed mount. #884 is the sibling:
> the collapsible size-default inversion + the vertical-pitch arm. Contracts:
> the 2026-08-30 orchestrator-handoff research §2 C2/C3/C4; issues #885/#884.

## 0. Premise re-verification (measured on this tree, 2026-09-01)

The issue says "129 QueryBoundary mounts across 92 files reserve by a literal `count`". Re-derived
(`ast-grep run -p '<QueryBoundary $$$A>$$$B</QueryBoundary>' -l tsx`, scanned 663 files; `-l ts` = 0):
**133 mounts / 95 files** (96 in `packages/client/src` across 85 files, 37 in `tests/client`). The
"literal count" clause is stale as a description of the population: only **25 mounts render
`SkeletonRows` directly in `fallback`** (22 in src), of which 15 carry a numeric-literal `count` and 6
more a same-file const count. The dominant fallback is a bare `<Text>Loading…</Text>` line (63 src
mounts) — those under-reserve too (the This-chat Injections 89→920px is `InjectionsSkeleton`-class),
but keying them is a per-surface product decision (each gains a clipped fixed-height loading box with
no CT pinning it), not the mechanical sweep the issue priced. Consequence: the SEAM serves every
fallback species; the GATE and the fix-at-landing keying cover the `SkeletonRows` class; the rest is
the counted tail (§5).

## 1. #885 — the seam

### 1.1 Chosen shape

`QueryBoundaryProps` gains two props (`packages/client/src/components/query-boundary.tsx`):

- `reserveKey?: string` — the surface-box id (`surface-box-store` vocabulary). Presence opts the
  boundary into measure-then-remember: the fallback is wrapped in the remembered box and the settled
  child is measured back into the store.
- `reserveBlock?: number` — an optional declared first-boot px box (the home-tile
  `skeletonBlock` / rpg-band estimate tier). Meaningful only with `reserveKey`.

Mechanics (all lifted from `home-tile.tsx`'s `TileFallback`/`TileBody`, which this REPLACES):

- Fallback path: `ReservedFallback` reads `useSurfaceBox(reserveKey)`;
  `box = measured ?? reserveBlock ?? null`. With a box it renders a `Stack` with
  `blockSize:{box}px; overflow:clip`, `data-tile-reserved={round(box)}`,
  `data-tile-reserve-source={"measured"|"declared"}` (the exact attribute vocabulary the existing CTs
  and the #837 sentinel contract pin — kept verbatim, "tile" and all, so no asserting probe changes).
- Fill: when the fallback element IS `<SkeletonRows>` (React element-type check) with a numeric
  `count` and shape `line`/default, it is cloned with
  `count = skeletonRowCountFor(box, declaredCount)`; the literal count survives as the first-boot
  guess and the no-box fill. `avatar-row`/`datum` shapes and non-SkeletonRows fallbacks reserve the
  box unfilled-resized (declared limit: `skeleton-row-metrics.ts` inverts only the `line` pitch — its
  own header rules `datum` out).
- Settle path: `MeasuredSettle` wraps children in a `Stack` and calls
  `rememberSurfaceBox(reserveKey, rect.height)` in an effect on EVERY commit (the rpg-band shape, not
  TileBody's mount-only: strictly fresher memory; `WRITE_EPSILON_PX` already swallows churn).
- No `reserveKey` ⇒ byte-identical behavior to today (no wrappers mounted).

Both existing consumers migrate onto the seam and their bespoke copies are DELETED in the same commit
(no old-beside-new): `home-tile.tsx` (`TileFallback`/`TileBody`/`reserveStyle` → `reserveKey={tile.id}
reserveBlock={tile.skeletonBlock}` + `fallback={<SkeletonRows count={tile.skeletonRows ?? 3} />}`) and
`rpg-hud-band.tsx` (`RpgHudBandReservation`/`RpgHudBandBody` → `reserveKey={RPG_HUD_BAND_BOX}
reserveBlock={RPG_HUD_BAND_FIRST_OPEN_PX} fallback={null}`). The band's attribute vocabulary changes
(`data-band-reserve-source="estimate"` → `data-tile-reserve-source="declared"`, its
`data-slot="rpg-hud-band-reservation"` goes) — the ONE asserting CT
(`tests/client/features/rpg/lib/rpg-context-section.ct.tsx:4335-4349`) is re-pinned in the same
commit (shared-read sweep; grep found no other asserter of either spelling).

### 1.2 Rejected alternatives

- **Render-prop fallback** `fallback: (rows: number|null) => ReactNode`: forces edits at all 133
  mounts (not additive), destroys the literal `count` the gate keys on, and makes the 108
  non-SkeletonRows mounts pay signature churn for a feature they don't use.
- **Structured `skeleton={{count, shape}}` prop** replacing `fallback` for keyed mounts: two fallback
  channels on one boundary; the boundary would own SkeletonRows' prop surface (a coupling
  `skeleton-rows.tsx` doesn't invite), and custom-skeleton surfaces (Injections/Rules/Corpus) could
  never key.
- **Leave home-tile/rpg-band bespoke** beside the new seam: two homes for one mechanism is the exact
  rot §0.1.5 bans, and `home-tile-contracts.ts:113` already promises "one reservation" in prose.
- **`display:contents` measuring wrapper** (no extra box): `getBoundingClientRect()` on a
  `display:contents` element returns an empty rect — unmeasurable by construction. The `Stack`
  wrapper is the shipped precedent (TileBody), and it is opt-in per keyed mount, so its layout effect
  is reviewed site-by-site in the keying sweep (§1.4).

### 1.3 Design questions the brief assigns

- **SSR/first-paint**: no SSR (Vite SPA). `createPersistedStore` rides sync `localStorage` through
  zustand `persist` — the first commit already carries the box (`home-tile.tsx` header, unchanged
  premise). With no document, `skeletonRowCountFor` returns its fallback count by contract.
- **Key collisions**: a `reserveKey` is a per-mount surface identity in the store's single flat
  namespace (shared with home-tile ids like `chat.recents` — deliberate: home tiles ARE keyed mounts
  now). Two mounts sharing a key would share a box silently, and the mechanical-sweep failure mode is
  copy-paste; the gate's duplicate arm (§1.5 arm B) REDs a repeated literal key. A deliberately
  shared surface routes through ONE exported const (invisible to the literal census — the honest
  escape, one mint).
- **Staleness / legitimate size change**: unchanged store semantics — a stale entry mis-reserves by
  the delta for one paint and self-heals on the same settle (`rememberSurfaceBox` every commit);
  `MAX_REMEMBERED_PX` caps runaway measurements; no TTL is added (a measurement cache, not a
  preference — `surface-box-store.ts` header).
- **Store growth**: bounded by the number of keyed mounts (~150 numeric entries ≈ a few KB of
  localStorage); orphan keys are inert by recorded ruling (the #258 header) and sanitized rows drop
  non-finite/out-of-range values on rehydrate.

### 1.4 Keying tranche (fix-at-landing set)

All 22 src `SkeletonRows`-fallback mounts EXCEPT `components/character-picker.tsx:115` (its count is
prop-driven — a generic picker mounted under several owners; one key would collide across them, so it
needs a caller-supplied key pass-through: counted tail). Keys are dotted surface ids minted per mount
(`<feature>.<surface>.<section>`), enumerated in the sweep table in the lane report. Each keyed site
gets a wrapper-geometry sanity check (the settled child gains one `Stack` ancestor — flex/grid parent
interactions reviewed per site).

### 1.5 The gate: `query-boundary-reservation` (new, `tooling/src/verify/gates/`)

- **Arm A (the ratchet):** a `QueryBoundary` JSX element in `packages/client/src/**` whose `fallback`
  is `<SkeletonRows … count={N} …/>` where N is a numeric literal or a same-file const resolving to
  one, with NO `reserveKey` attr ⇒ RED — unless the line immediately above the element's opening line
  carries `// @first-boot-only: <reason>` (or the `{/* … */}` spelling) for a boundary that genuinely
  never re-mounts. Marker grammar is the house colon form (`marker:\s*\S`, GATE-AUTHORING §4.3) — the
  brief's `@first-boot-only(<reason>)` parens spelling is deviated from deliberately; §L.8 receipt in
  the report.
- **Arm B (duplicate keys):** a literal `reserveKey` value repeated across scanned mounts ⇒ RED at
  both sites (copy-paste keying is the sweep's failure mode).
- **Arm C (marker two-sidedness):** a `@first-boot-only` marker adjacent to no guarded violation ⇒
  stale RED; a marker with no reason ⇒ malformed RED.
- **Arm D (blindness tripwire):** `components/query-boundary.tsx` no longer spelling `reserveKey`, or
  `data/skeleton-rows.tsx` gone ⇒ the vocabulary rotted, RED (§4.6).
- Declared limits (each with a mustPass row): dynamic counts (props/calls/ternaries) pass; a
  SkeletonRows reached through a wrapper component is invisible; `tests/` is scope, not exemption.
- Posture: comments-INTENDED for the marker arm (says so in the header); the structural arms are
  pure-AST.
- Six-case real-tree probe per doctrine; conformance `mustFlag`/`mustPass` per arm; coupled sites 2-4
  (check-gates fixture, Core-Enforcement row, gate count).

### 1.6 Test plan (#885)

- `tests/client/components/query-boundary.ct.tsx` + `tests/client/data/_ct-stories.tsx` grow the reservation pins (real
  `createPersistedStore` mint — the #837 hazard; no store doubles):
  1. **Seed→boot→reserve (the #837 sentinel at the boundary tier):** seed a box + a sentinel key via
     the real store, mount a `trpcHold`-parked boundary, assert `[data-tile-reserved]` equals the
     seed, the skeleton fill count equals `skeletonRowCountFor(seed, literal)`, and the sentinel key
     still present in the persisted blob (write-through, not reset-and-rebuilt).
  2. **Settle→remember:** release the hold, assert the store carries the settled height (read back
     through a story-rendered probe of `__readSurfaceBoxForTest`).
  3. **No key ⇒ no wrapper** (the unkeyed 108 mounts' contract): `[data-tile-reserved]` count 0.
     Red-first: pins 1/3 run against `git show HEAD:` query-boundary.tsx (no `reserveKey` prop — red).
- Existing floors re-run: `tests/client/features/home/components/home-tile.ct.tsx`,
  `tests/client/features/home/surfaces/home-surface.ct.tsx` (behavior-parity — must stay green
  unmodified), `tests/client/features/rpg/lib/rpg-context-section.ct.tsx` (re-pinned band arm),
  `tests/client/data/skeleton-rows.ct.tsx`, settings-context-tab CTs (the keyed tranche's home).
- Gate suites: `check-gates.int` fixture + `gate-conformance.int` + planted real-tree probe.

## 2. #884 — collapsible default inversion (C2) + the pitch arm (C3)

### 2.1 C2 chosen shape

`packages/ui/src/primitives/collapsible/variants.ts`: the `size` axis becomes
`control` (base, `min-h-control-sm` — pointer-conditional 44px coarse / 32px fine) and `text`
(the renamed `inline` arm, `{}`). `defaultVariants.size = "control"`. `collapsible.tsx` prop type
`size?: "text" | "control"` — every `size="inline"` spelling breaks at tsc, which IS the sweep
driver. A `size="text"` mount owes a line-adjacent `// @sub-floor-ok: <reason>` marker (colon
grammar, same deviation note as §1.5).

Enforcer: existing `ui-size-via-variant` (sizes stay variant axes) + a NEW gate
`sub-floor-disclosure`: `size="text"` on a `CollapsibleTrigger` in `packages/{client,ui}/src`
without the adjacent marker ⇒ RED; stale/malformed marker arms; blindness tripwire on
`collapsible/variants.ts` still declaring the `text`/`control` keys. Same six-case probe shape.

Rejected: folding the marker arm into `no-floorless-control-in-wrap` (its subject is Button's
overflowing-pseudo sizes inside `flex-wrap`; a trigger with NO pseudo at all — the
`DISCLOSURE_TOUCH_FLOOR_AT_COARSE` header's measured fact — is a different defect class and would
dilute both messages); a `JUDGMENT_DEFERRED`-style table instead of a marker (the brief mandates the
marker; a table also re-centralizes a per-site judgment the site's own line should carry).

### 2.2 C2 mount sweep (every existing mount re-derives its arm)

35 trigger mounts censused (`ast-grep`, packages+tests). Non-test, by disposition:

| Mount | Today | Decision |
| - | - | - |
| 12 × `size="control"` sites (app-shell background, rule-row, injections-manager, room-overrides, settings-context-tab, config-content, home-surface, plugin×3, params-limits, appearance) | control | prop kept (now = base; no behavior change) |
| `character-provenance-section.tsx:85` | default(inline) | take the inversion → control (a row of its own) |
| `assembly-preview-diagnostics.tsx:37` | default | → control |
| `assembly-preview-panel.tsx:170,216` | default | → control (each trigger IS the row) |
| `reasoning-block.tsx:101` | default | → control ("the row you click" — its own comment) |
| `user-macros-tab.tsx:79` | default | → control |
| `turn-tool-calls-disclosure.tsx:75` | default + `DISCLOSURE_TOUCH_FLOOR_AT_COARSE` | `size="text"` + marker + KEEP the fragment — the recorded ruling ("fine is untouched — a 16px line in a dense transcript footer") survives; its input did not change |
| `workload-row.tsx:217` | default | → control (an error-strip disclosure is still the thing you tap) |
| `suggestion-card-mount.tsx:72` | `inline` | → control (a lone full-width disclosure under the card) |
| `rpg-beat-row.tsx:151` | `inline` + `render={<Button size="inline">}` | `size="text"` + marker — Base UI `render` MERGES the trigger class onto the Button, so a control default would graft `min-h-control-sm` onto a deliberately compact inline Button that already carries its own `::after` floor |
| `character-categorized-list.tsx:70` (`render={<Button size="sm">}`) | default | → control default is a no-op (Button `sm` = `h-control-sm` — merge is idempotent); prop untouched |
| `immersive-card.tsx:161` (`render={<Button size="icon">}`) | default | verify icon box ≥ control-sm at build; expected no-op, else `size="text"` + marker |
| `series-row.tsx` (ui-internal) | read at build | derive like the rest |
| test stories (collapsible.ct, series-row\.ct, chat `_ct-stories`) | default | follow the arm their pins assert; collapsible.ct re-pins the default box red-first |

CT re-pin (red-first): `tests/ui/primitives/collapsible/collapsible.ct.tsx` grows the default-box pin
— computed `min-height` = 32px fine / 44px coarse (`hasTouch` arm per
`ct-mobile-repro-needs-coarse-and-the-real-affordance-set`) and `size="text"` = no floor; run against
`git show HEAD:` variants to prove red. Behavior-changed client mounts named above re-run their
feature CTs; geometry claims at both ends of the width range (range matrix, not a point).

### 2.3 C3 chosen shape

- `layout/variants.ts` `stackVariants` gains `rows: { control: "*:min-h-control-sm" }` (+
  `stack.tsx` prop) — one token floors every direct row at the pointer-conditional control floor,
  the "honest fix" the issue names.
- New arm on `no-floorless-control-in-wrap` (the VERTICAL-PITCH arm beside the founding wrap arm): a
  `Stack` whose direct children resolve to ≥2 rows each containing a floorless-size Button —
  counting a `.map`-produced child as 2, and resolving ONE level of same-file component indirection
  (tag → same-file function → its returned JSX) — is RED unless the Stack carries `rows="control"`
  or every counted row's own className carries a floor
  (`min-h-touch-target` / `min-h-control-*` / `pointer-coarse:min-h-*`). Every gap token in the GAP
  vocabulary is sub-floor at coarse (max = `gutter`, far under 44px — receipt in the gate header), so
  the gap attr is not read; the header declares this and the tripwire re-derivation duty if a ≥floor
  gap token is ever minted.
- mustFlag: the `rpg-stat-profile-editor.tsx` founding shape spelled same-file (Stack `gap="field"`
  mapping a same-file row component whose body holds a floorless Button). Declared limits (mustPass
  rows): cross-file row components (TrackerValue/HintEditor — the live #850 site's actual shape) are
  invisible; `Row`'s horizontal pitch is the width-floor axis and stays out (the wrap arm owns
  wrapping runs); className-via-variable (LIMIT-1 class).
- Fix-at-landing: whatever the arm reds live gets `rows="control"` (+ its CT re-pin) in this lane.

### 2.4 Rejected alternatives (C3)

- **Whole-subtree Button counting without the direct-child row partition**: flags a single row whose
  TWO buttons sit side by side (a Row cluster inside one row — width, not pitch) — false-positive
  factory.
- **Type-checker-driven cross-file resolution** (resolve TrackerValue into #components): a gate must
  ride the shared walk, and chasing imports makes the verdict depend on files outside `scanRoot` —
  the declared-limit + fixture route is the house pattern (`no-floorless-control-in-wrap` LIMIT
  already declares wrapper-tag blindness).
- **`rows` variant on the touch-target token instead of `control-sm`**: `touch-target` is 44/28 (a
  HIT floor); `control-sm` is 44/32 (the CONTROL box every sibling floor rides — `collapsible`
  `control`, TabsTab, toolbar). Rows are controls; the control token is the vocabulary match, and it
  also clears design-audit's 24px fine floor that #850 measured against.

## 3. Sequencing, floors, forks

- **Two stacked commits, #885 then #884** (the brief's option A): disjoint file sets except this doc,
  independent revert/review, and the gate coupled-site edits (`Core-Enforcement` row + count) merge
  textually cleanly when stacked. Never amended.
- Floors (scoped): per-package `pnpm typecheck` (owns `tests/**/*.ct.tsx`) · `typecheck:graph`
  (tests/ changed) · `pnpm test:ct` on the CT files named in §1.6/§2.2 (one at a time, --workers=2)
  · `pnpm test:scoped tests/tooling/check-gates.int.test.ts tests/tooling/gate-conformance.int.test.ts
  tests/client/data/skeleton-row-metrics.test.ts --maxWorkers=4` · scoped biome via `pnpm exec` ·
  `pnpm check:structure` read from `reports/check-structure.json` (worktree) · planted real-tree
  probes for both new gates + the new arm · scoped `pnpm check:docs` for this file.
- **Forks held with stated defaults** (none owner-sacred; report carries them): (a) marker grammar
  colon-vs-parens — default colon (house law §4.3 beats the brief's spelling); (b) the counted tail
  (§0) — default: gate covers the SkeletonRows class only, Text/custom-skeleton mounts reported as
  an enumerated follow-up; (c) `data-tile-reserved` kept as the cross-surface attribute name —
  default keep (issue-pinned, three asserting files).

## 4. Memory lessons consulted (by filename)

`entity-draft-store-dual-consumers` · `sentinel-key-proves-a-destructive-reset` ·
`zustand-persist-reset-writes-through` · `reload-resistant-staleness-is-durable-local` ·
`ct-width-budget-needs-the-real-control` · `reserved-invisible-slot-defeats-an-edge-alignment` ·
`touch-floor-is-an-unbudgeted-width-tax` · `ct-mobile-repro-needs-coarse-and-the-real-affordance-set` ·
`presence-ratchet-waiver-vs-real-ct` · `doc-catalog-born-reviewed-and-reattest-dance` ·
`doc-catalog-receipts-are-the-authored-source` · `gate-authoring-hub` (via GATE-AUTHORING.md full
read) · `ct-persist-read-races-rehydrate` (via index).

## 5. The counted tail (explicit, not silent)

Unkeyed after this lane, by fallback species (src mounts): `Text` loading lines **63**, custom
skeletons (`InjectionsSkeleton`, `RulesSkeleton`, `CorpusHomeSkeleton`, `RecentThreadsLoading`,
`Skeleton`, `WebSpinner`) **6**, `character-picker.tsx` prop-driven SkeletonRows **1**, misc
(`null`/composite fallbacks) **3**. Each needs a per-surface judgment (does a remembered clipped box
improve its loading paint?) and its own CT attention — follow-up rows, enumerable any time via the §0
census command. The gate's declared scope makes this tail visible as a limit, not silent debt.
