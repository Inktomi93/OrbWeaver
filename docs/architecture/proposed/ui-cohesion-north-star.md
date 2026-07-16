---
kind: program
status: active
updated: 2026-07-16
---

# UI Cohesion — North Star (ledger D66)

> **AS OF 2026-07-16 (end of the mechanism era):** §5 PP-lane ✅ · §4 chats lane N1–N5 ✅ (**the
> gate is MET**, lane verifier-certified) · the shell-chrome program ✅ CLOSED (D73/D74;
> `../history/shell-chrome-unification.md`) · the derive program ✅ CLOSED W1–W6 (gates 125→132,
> jscpd ratcheted 5%→2%; `../history/derive-modernization-audit.md`) · the theme pipeline ✅ (D71).
> **THE ONLY OPEN WORK IN THIS DOC IS §6 (the rollout, characters first) + §7 inside each stop**,
> plus the deferred live side-eye lane pass (blocked on tree-quiet/HMR) and O4 (server tier).
> Session lessons live in auto-memory; the queue below carries per-step landed records.

**THE one active UI work doc.** Every UI/UX task dispatched after 2026-07-13 builds from THIS file.
The prior program records (`ui-polish-punchlist.md`, `ux-flow-revamp.md`, `DESIGN-REVIEW-2026-07-01.md`)
are ARCHIVED to `../history/` — they are history, not law; do not quote them as authority. Their open
remainders are ported into §6 here. Unbuilt design sets are parked beside this doc — see `INDEX.md`
(`../proposed/README.md` has the map). **Precedence:** `Core-Laws-and-Precedents.md` (D-ledger,
D66 = this program) → the core `UI-*.md` law set + `../core/ui-package-design.md` +
`../core/motion-and-animation-guide.md` (promoted to core under D66; ui-package-design's §-numbers
stay stable) → this doc. On any conflict, the higher tier wins.

**Origin:** a 2026-07-13 Claude-Design review of the LIVE app (not mockups) found the four panes
don't read as one frame: no shared chrome baseline, ember (accent) on ~everything, always-on action
strips, triple-duplicated actions, token-count noise. Every visual complaint was verified real
against the running app (`reports/snaps/home|chat-thread|chat-context|character-editor*|preset-*.png`,
2026-07-13). Every code claim below was verified against source the same day — file anchors are real,
and where the design review guessed wrong, the correction is stated inline and marked **[CORRECTED]**.

**Strategy (Nate, 2026-07-13):** nail ONE rail entry end-to-end first — **Chats** — so every other
section copies a working example instead of re-interpreting prose. §4 is that lane. §5 (primitive
polish) is global and ships first. §6 is the rollout order for everything after.

**DE-ROT 2026-07-15:** the client lockdown (M0–M11, promoted to core law —
`../core/client-architecture-lockdown.md`) and shell-chrome slice 1 landed AFTER this doc's 2026-07-13
verification. Dead anchors are re-pointed and superseded bullets marked **[RE-ANCHORED]**/**[SUPERSEDED]**
in place below; every correction re-verified against source 2026-07-15. The chrome MECHANISM
(registry/zones/widgets) is now LAW in `../core/UI-Architecture-and-Layout.md` §4.x (standing rulings
D73/D74; the program record is [`shell-chrome-unification.md`](../history/shell-chrome-unification.md),
history not law); this doc owns the PAINT (bands, ember budget, density, anatomy).

**Sequencing (the game plan, updated 2026-07-16 — verified-open work only; the lockdown itself is
CLOSED). Three programs, ONE ordered queue:** this doc's lanes (paint), shell-chrome §E (mechanism),
and the derive-modernization program ([`derive-modernization-audit.md`](../history/derive-modernization-audit.md)
— mint → migrate → SEAL; gates G24–G29 + a G4 arm) interleave as follows:

1. **UI-polish wave: PP1–PP5 (§5) + derive-W2 (ui skin-fragment tier) + gate G25** — ONE ui-package
   wave, zero collisions with anything below; ship first. **SHIPPED 2026-07-16** (commits
   `98a66524`..`89985c61`; PP5 minted `spacing.checkbox` per the §13.9 display-size family; PP3
   finding: popup ITEMS never bore focus rings — toast was the real popover-toned consumer).
2. **Derive-W3 (plumbing mints + G26–G28)** — ✅ 2026-07-16 (registry contexts, drill stores, bound
   fields, form-factory base all minted + sealed; §E-1 absorbed the `SECTION_GROUPS` double-spell).
3. **Shell-chrome §E steps 1–3** — ✅ 2026-07-16 (full vocab mint · `assembleChrome` behavior union ·
   rail single-DOM cutover; the twins + `RailTabButton` + `rail-slots.ts` are dead).
4. **N1–N5** (§4) — ✅ ALL FIVE 2026-07-16; **THE GATE IS MET — the §6 rollout may start.** One
   baseline live-measured at zero drift (flat/ramp ± glass); list band + ember selection; the
   message row de-noised (8-skin geometry suite re-verified); context identity header + ember edge
   via the §6b-posture header channel; the ember census found ONE stray across 56 Buttons (inline
   edit-Save, demoted); every applicable §9 line passed with live evidence; lane-wide verifier +
   side-eye passes ran at the gate.
5. **Shell-chrome §E steps 5–7** (You-sheet projection + mobile persona · `railFoot` kill · vocab/law)
   — **✅ ALL DONE 2026-07-16.** steps 5+6 (mobile persona switching shipped; `railFoot` + `AppShellProps`
   dead; placement `avatar` retired); step 7 (vocab tightened to `rail.end`/`topbar.trail`/`surface`/
   `mobile-tab`; the settings `account` pane deleted — §6's superseded Account item; `modal-registry-completeness`
   surface-reachability + `no-parallel-section-map` chrome arms landed, `shell-no-chrome-props` dropped-permanent;
   `UI-Architecture-and-Layout.md` §4.x updated). **The shell-chrome program is CLOSED.**
6. **Derive-W1 (FormDialog rollup + G24)** — ✅ 2026-07-16 (all 22 Dialog-root importers resolved:
   16 migrated, 6 allowlisted with citations; `FormDialog`/`TagPickerDialog`/`RelationManagerSection`
   minted; gate count 130). The §6 pre-gate is satisfied.
7. **§6 rollout** (characters → presets → sections → remainders), §7 autosave inside each lane —
   **← NEXT; the remaining mass of the program.** Steps 1–6 are all ✅: the mechanism era and the
   chats template are done; what remains of the north star IS this rollout (plus the derive-W4/5/6
   tail below). The characters stop also mints the character-detail contributor registry (the one
   named seam gap, seam-coverage table).

Independent items: **derive-W4/W5/W6 — ✅ ALL LANDED 2026-07-16** (G29 + the G4 arm live; the four
orphan seals carry `PREBUILT[for:…]` markers; PD-143 records the two honest deferrals; the jscpd
ratchet fired). Still open: **O4** — buddy-bus `defineBusChannel` adoption (server tier; lockdown
§18) · the **deferred side-eye lane pass** (run when the tree is quiet — live browsing reboots HMR
under an active session) + its two receipts (40px avatar upload preview · toast focus ring).

---

## 0. Ground rules (prevent drift — read before any task)

1. **No new tokens; token EDITS go through DTCG.** Every color/space/size/radius is an existing
   custom property from the generated `@theme` (`ui/src/styles/theme.css`). That file is GENERATED
   from `ui/src/tokens/tokens.json` (`pnpm --filter @orb/ui tokens:build`; freshness test-enforced) —
   **never hand-edit `theme.css`**. Where a task sanctions a token change (PP1/PP4/PP5), the edit is
   `tokens.json` + regenerate. Raw `oklch()`/`px`/`rem` literals in a feature = stop, there is a token.
2. **Hand-written CSS is legal in exactly ONE file:** `client/src/features/app-shell/surfaces/shell.css`
   (the shell tier, the one sanctioned painter). Everything else is Tailwind token utilities inside a
   `variants.ts`/`tv()` skin or inline via the layout primitives. No new `.css` files. (This is the
   FEATURE-tier rule; the reconciled whole-repo CSS-homes table — including the styles-tier hand-written
   files — is `client-architecture-lockdown.md` §4. `settings-shell.css` dissolved at M6.3.)
3. **No new primitives or variants** beyond what a task explicitly sanctions (PP1's badge `tone` is
   sanctioned). A task that seems to need a new `Button` intent or component: flag it, don't add it.
4. **Features compose, never paint.** No `className`/`style` on raw `<div>` in a feature (existing law).
5. **The accent is rationed.** `--color-primary` (ember) gets ONE job per surface: the single primary
   action or the single active indicator. Most tasks below are literally REMOVING ember.
6. **The appearance system is law** (§2b). No task may hardcode away an axis. A fix on a surface an
   axis styles goes in the SHARED base all modes inherit — never a per-mode fork, never by deleting a mode.
7. **Selector stability is an API** (§2c). Owner custom CSS targets `data-slot` values and shell class
   names. No task may rename or drop an existing `data-slot` or `.shell-*` class; restructures keep the
   slot on the semantically-equivalent element.
8. **Each task = one commit, with its Done-when verified live** (`pnpm snap` — see §9) before moving on.
9. **`Button` defaults to `intent="primary"`** (`ui/src/primitives/button/variants.ts`
   `defaultVariants`). Every ember audit and every new call site must account for BARE `<Button>`
   rendering ember — sweep with ast-grep for `<Button $$$>` and check the intent prop, not a text grep
   for `intent="primary"`.

## 0b. Client onboarding primer (read once, per builder — pointers, not restatement)

- **Gates first, by NAME.** Skim the gate names in `../core/Core-Enforcement-Active-Gates.md`
  (they're self-explanatory: `no-array-literal-querykey`, `form-factory-for-multifield`,
  `touch-target-floor`…) BEFORE building — a name tells you a rule exists; read the gate file only
  when you're about to trip it. Never re-derive conventions the battery already enforces.
- **State — the split criterion is durability-per-PERSON, not "server-ish":** anything that must
  survive across tabs/devices for a person (prefs, entity data, anything another session should see)
  is SERVER state — TanStack Query + the settings namespaces (bus-driven freshness,
  `staleTime: Infinity`). Only per-DEVICE transient concerns (selection, panel modes,
  drafts-in-progress, scroll/stream state) live in the gated Zustand stores in `client/src/state/`
  (minted via the three factory doors — `createGatedStore` / `createEntityDraftStore` /
  `createPersistedStore`, never bare `create()`). If losing it on another device would surprise the
  user, it does not belong in a store. Editors go through the form factories
  (`createAutosaveEntityForm` — D66 A4). Full map: `../core/UI-Primitives-and-Reuse.md` §13.2
  (a surface not using its primitive is the review flag).
- **Feature anatomy:** `features/<name>/{index.ts (the ONLY front door) · surfaces/ (routed panes) ·
  anchors/ (portal/dialog mounts) · components/ · hooks/ · lib/}`. Cross-FEATURE reads go through
  `trpc.*`, never another feature's internals (dep-cruiser enforces; type-only shapes exempt).
  Distinct + sanctioned: crossing shell REGIONS within ONE feature (Content ↔ Context share no
  React ancestor below the route) uses that feature's editor-bridge
  (`features/<x>/lib/*-editor-bridge.ts` — the surface publishes the live form handle, the same
  feature's inspector subscribes). Verified within-feature-only today; it is NOT a cross-feature
  read — don't "fix" it, and don't imitate it ACROSS features.
- **Tooling card:** `pnpm ast <verb>` (symbol-true search — refs/callers/importers/jsx/orphans; bare
  prints usage; prefer over grep) · `pnpm snap <route>` (headless screenshot + console/net report +
  `--text` ARIA mode; the verify loop, §9) · `pnpm knip` (dead exports/deps) · `pnpm check`
  (the full static gate battery).

---

## 1. The six principles (every task serves one)

- **P1 — One chrome baseline.** Rail brand, List header, Content topbar, Context header occupy the
  SAME top band (`--dimension-chrome-row`, 3rem) with the same hairline and inline padding. One horizon.
- **P2 — One primary per surface.** List owns **New**. Composer owns **Send**. Content header is
  view-only. Everything else `secondary`/`ghost`. (Dialogs are their own surface: one primary confirm
  per dialog is correct.)
- **P3 — Hover-reveal density.** Per-row and per-message action clusters rest hidden (or as one `⋯`)
  and appear on hover/`focus-within`; coarse pointers see them always (`pointer-coarse:opacity-100`).
- **P4 — Content ↔ Context binding.** The Context panel reads as "the detail of the thing in Content":
  active entity's avatar + name in its header, 1px ember top edge, ember active-tab indicator, empty
  states that name the entity.
- **P5 — Quiet metadata.** Token counts appear in exactly ONE place per surface. Timestamps are inline
  micro text (`--text-micro` `--font-mono` `--color-muted-foreground`) — no pills, no clock icon.
- **P6 — One field & row anatomy.** Editable-field-with-label = `Field` primitive. Entity-in-a-list =
  `ListRow`. One save model app-wide (§7: autosave everywhere).

---

## 2. Action-ownership map (the dedupe table)

Each action gets exactly ONE home; delete the copies. A hover-`⋯` MENU mirror is fine; a second
always-visible button is not.

| Action | The ONE owner | Delete / demote from |
|---|---|---|
| Create (New chat / character / preset) | List header band, single `primary` button | any content-area "+" (the chat landing hero is ALREADY one primary via a mutually-exclusive ternary — see N5's [CORRECTED]; confirm, don't demote) |
| Save / Discard | NOWHERE — autosave everywhere (§7); status text replaces buttons | `character-editor-surface.tsx` Discard/Save pair, `preset-editor-surface.tsx:187` Save preset (in the SaveBar block), per-field Set |
| Per-entity manage (Duplicate · Archive · Export · Delete) | List-row `⋯` (hover-revealed) | Content-header duplicates; one Context-header `⋯` mirror allowed only when the row isn't visible |
| Message actions (edit · fork · hide · copy · delete) | Message row hover cluster: `edit` + `fork` inline, rest under `⋯` | the always-on 5-icon strip |
| Member controls (mute · force-turn · kebab) | Context → Members rows, hover `⋯` | any duplication; topbar chip is entry-only |
| Members entry | Topbar member-count chip → always OPENS Context on Members tab (never toggles) | the collapse branch in `chat-header.tsx`'s `toggleMembersPanel` |
| Field detail (Description, Scenario…) | Context → Field tab (drill-in) | per-row `Set` button → inline expand / drill-in |
| Section actions (preset Context) | one `⋯` in the Section header | the bottom `Duplicate · Move below · Delete` button row |

---

## 2b. The appearance system — axes every task must keep working

Source of truth: `contracts/settings` `AppearanceSettings` + `features/settings/surfaces/`
`appearance-settings-surface.tsx` + `features/chat/lib/message-row-variants.ts` (the 8-skin table).

- **chatStyle (8 skins, one MessageRow):** `bubble` · `flat` · `document` · `echo` (feather =
  `--immersive-echo-feather`) · `whisper` (3:1 `headerBand`) · `hush` (`--immersive-stripe-width`) ·
  `ripple` (`--immersive-ripple-portrait-width`) · `tide` (per-paragraph trains). All skins are data
  in `MESSAGE_ROW_SKINS`; `message-row.tsx` never branches on style.
- **Avatars:** `showInChatAvatars`, `avatarSize sm/md/lg`, `avatarShape`, `avatarAspect square/portrait`,
  `avatarRing none/accent`.
- **Surfaces:** `elevation flat/ramp/glow` (ramp lifts panels to `--color-surface-raised` and DROPS
  region hairlines — `.shell-grid[data-elevation="ramp"] .shell-panel-header { border-block-end: none }`
  already exists at `shell.css:85`, so new chrome styled via `.shell-panel-header` inherits it for
  free), `blurSurfaces` multi-select (glass), `blurStrength`, `surfaceTexture`, `enableThemeColorization`.
- **Background image:** kind/fit/`backgroundDim`/`backgroundBlur`; with an image the no-fill chat
  styles back their chrome with `chromeBacking` scrims — keep all of it.
- **Message chrome:** `messageActions hover/expanded` (a PREF, schema default `hover`), metadata
  toggles `showTimestamps` (default true) / `showMessageId/showModelIcon/showTokenCount/`
  `showLLMReasoningIcon` (default false), `autoFixMarkdown`. `showGenerationTimer` is schema-only and
  inert (PD-130) — do NOT wire a control.
- **Reading typography:** `--reading-*` root vars consumed only by `[data-slot="message-bubble"]` —
  never extend them to chrome.
- **Sizing/motion:** `chatWidthPct` → `--width-shell-content` (consumed by `bubbleOuter`
  `message-row-variants.ts:74` AND the composer `composer.tsx:179,194` — verified shared),
  `fontScale`, `reducedMotion`, `density comfortable/compact` (compact retunes the spacing intent
  tokens — use spacing tokens, never px).
- **Glass defaults (the Reading-Surface rule):** `blurSurfaces` defaults `[]` (off); the
  quick-enable seed is panels+composer+modals (`DEFAULT_BLUR_SURFACES`) — **`messages` is NEVER
  default-on** (prose never frosts by default). `blurStrength` 4–28, default 14; `backgroundDim`
  default 0.45. Reading-typography defaults mirror `tokens.json` (untouched sliders = zero visual
  change) — don't re-derive them.

**Blanket rule:** restyles land in the shared base (`bubbleInner`/`bubbleOuter`,
`MessageMetadataRow`, `.shell-panel-header`) so 8 skins × 3 elevations × glass × bg-image inherit.
Skin-specific geometry (echo feather, whisper band, ripple weld, tide trains) is tokenized and
correct — a task touching it is off the rails.

## 2c. Theming-pipeline invariants

- **Derived colors** (`ui/src/content/theme-scope/clamp.ts` render clamp; wire twin
  `@orb/contracts/theme/override.ts`; deliberate two-copy pinned byte-identical by
  `tests/contracts/theme/pairing.suite.test.ts`). A custom theme picks ONE base `background`; the
  neutral ramp derives; every foreground/border/input fill is DERIVED. Consequences: new chrome
  references semantic tokens so themes retint it; accent tints via
  `color-mix(in oklab, var(--color-primary) N%, transparent)`; fixed STATUS hues (info/success/
  warning/destructive/highlight) are ONE static token with `light-dark()` polarity arms (D71 —
  AA-swept per palette by `palette-contrast`; the clamp derives `color-scheme` from the picked
  background, so never hand-flip a scheme), neutral SURFACES must reuse a derived ramp member; never extend
  `clampThemeTokens`'s emit surface without its emit-surface + pairing tests; user color input goes
  through `color-field`/`isSafeColor`.
- **Owner custom CSS** (`app-shell/components/custom-theme-style.tsx`) injects unlayered and wins —
  `data-slot` values and `.shell-*` class names are API (rule 0.7). `validateThemeCss` posture
  (REJECT fixed/sticky, WARN @import, cap per the contracts schema's `THEME_CSS_MAX`) must not weaken.
- **Typography seal** (`ui/src/primitives/text/variants.ts`): flat scale, hierarchy by WEIGHT.
  Micro-caps section voice = `size="micro" weight="semibold" transform="caps"`. Timestamps/counts =
  `size="micro"` + `font-mono` — never a raw font-size.

---

## 3. D66 amendments — what this program consciously changes

The current UI is the LANDED D62 output; these pain points are what D62's rulings produced. D66
amends the following (recorded in `Core-Path-Registry.md`; grep the id for the decision record):

| # | Old ruling (D62) | New ruling (D66) | Why |
|---|---|---|---|
| A1 | UIP-202: LIST panel renders NO header band (list surface owns its title; "kill the triple title") | LIST panel gets a real `.shell-panel-header` band on the shared `--dimension-chrome-row` baseline; the surface's title/action move INTO it. The triple-title fix is PRESERVED — the band replaces the surface's own title row, never adds to it | The missing band breaks the P1 baseline: the List title floats above everyone else's horizon (verified: `home.png`) |
| A2 | UIP-302: New-chat demoted to a compact GHOST `+` icon | The list-header **New** is the panel's ONE `primary` button (`size="sm"`, `Plus` + label) | P2: the list OWNS create; a ghost `+` next to an ember hero duplicate inverted the hierarchy (verified: landing hero is ember, list `+` is ghost) |
| A3 | §B.1 dim-at-rest: action clusters rest at `opacity-40`, never hidden (`message-actions-reveal.ts`) | Rest state is HIDDEN (`opacity-0 pointer-events-none`), revealed on hover/`focus-within`; `pointer-coarse:opacity-100` STAYS; `messageActions=expanded` pref shows the collapsed cluster always | Dim-at-rest still renders 5 icons per turn × every turn = the dominant noise source (verified: `chat-thread.png`). The Wave-1 "opacity-0 in-flow starves a flex sibling" P0 was re-checked: the cluster keeps its box (opacity changes no layout) and the name-row has measured positive slack (`message-row.ct.tsx` geometry CT), so the hazard that ruling guarded is absent |
| A4 | Button-gated saves: character `Discard/Save` + `DirtyPill`, preset `Save preset` via `save-bar` | AUTOSAVE EVERYWHERE (§7). The `save-bar` primitive and `DirtyPill` lose their consumers — leave the primitives in place this program (removal is a separate decision), delete only the call sites | Three save models on three editors; chat overrides already autosave (`chat-context-panel-surface.tsx` precedent) |

Everything else in D62 (region law §4.2/§4.3, P1–P6 intent rulings, control-height pointer model,
focus-ring cluster, micro-caps voice) stands unchanged.

---

## 4. THE NORTH-STAR LANE — Chats, end to end — **✅ SHIPPED IN FULL 2026-07-16 (N1–N5; the gate is met)**

> Files relative to `packages/client/src`, `ui/` = `packages/ui/src`. Every anchor verified 2026-07-13.

### N1 · Chrome baseline — `features/app-shell/` — ✅ (four headers at y=48, zero drift, flat/ramp ± glass)
Files: `surfaces/shell.css`, `components/panel-chrome.tsx`, `components/shell-topbar.tsx`,
`components/rail.tsx`, `features/chat/components/chat-header.tsx`.

- `PanelChrome` (still header-optional, LIST passes none — re-verified 2026-07-15; its header comment
  now documents the shell-chrome toggle ownership, not UIP-202): always render a
  `--dimension-chrome-row`-tall `.shell-panel-header` with a `--color-sidebar-border` bottom hairline
  for BOTH panels. The list surface's title/action move into that band (N2). Update the component's
  header comment to cite D66 A1.
- Rail brand: `WeaveGlyph` in a chrome-row-tall top cell, same bottom hairline, same baseline.
  **Sequencing:** rides the shell-chrome §E-3 single-DOM rail cutover — build it there or after,
  never on the current twin-DOM `rail.tsx`.
- Confirm all four headers: `height: var(--dimension-chrome-row)`; `padding-inline: var(--spacing-block)`.
- Elevation/glass compat: style the band ONLY via `.shell-panel-header` (the `ramp` border-drop rule
  at `shell.css:85` then covers it); NO opaque background (glass panels need the translucent fill).
- Topbar cluster — **[MECHANISM SHIPPED 2026-07-15, SKIN OPEN]**: the trail is now a registry render
  of `topbar.trail` chrome widgets (shell-chrome slice 1; the doubled detail-panel close is gone).
  N1's remaining topbar work is the SKIN, applied to the widget bodies: one uniform ghost icon cluster
  (`size="icon"` `intent="ghost"`); the `⌘K jump` chip stays the one bordered element with a 1px×20px
  `--color-border` divider between chip and toggles; the identity-row `⋯` (chat options) moves to the
  END of the cluster.
- Member-count chip (`chat-header.tsx` `toggleMembersPanel` — collapse branch re-verified live
  2026-07-15): remove the collapse branch — the chip always `setContextTab("members")` +
  `setPanelMode("context","docked")`. Collapse belongs to the context header's own control.
- **Done when:** a horizontal guide at the band bottom crosses rail brand, list header, topbar, and
  context header with zero drift — in `elevation=flat` AND `ramp`, with and without glass panels; the
  topbar reads as exactly two groups.

### N2 · Chats list — ✅ (band + ONE ember New; overflow root-caused IN the primitive — see the corrected bullet; ember selection retints)
- "CHATS" micro-caps title + count into the N1 band; the band's only action is
  `Button intent="primary" size="sm"` **New** with `Plus` (A2). The current ghost `+`
  (`[aria-label="Start a new chat"]` header instance) is replaced; the two `intent="primary"`
  EmptyState News in the same file are fine as-is (empty state = its own surface).
- Search row directly under the band, full width, `--spacing-block` inset. Row/group gaps come
  from the layout primitives' defaults — never override them per-surface.
- **Horizontal scrollbar — RESOLVED at build (2026-07-16), and the [CORRECTED] hypothesis was
  itself corrected by live measurement:** the overflowing box WAS the primitive — list-row's `body`
  slot had `min-width: auto`, so its automatic minimum resolved to the title's full nowrap
  min-content (750px vs a 265px panel); the `min-w-24` content floor cannot enable truncation (a
  floor only RAISES min-content). An ancestor `overflow-x: hidden` would have clipped the kebab
  off-screen (measured past the viewport). Fix: `min-w-0` restored on `body` — root-caused, not
  blind-patched; kebab in-frame, title ellipsizes, scrollWidth==clientWidth.
- Row polish: selected row = 2px left ember bar + `color-mix(in oklab, var(--color-primary) 10%,
  transparent)` tint replacing the flat `--color-accent` fill; relative time already mono/micro and
  hover-revealed in `list-row/variants.ts:40` — keep; row `⋯` (`[aria-label="Chat actions"]`) becomes
  hover/`focus-within`-revealed with `pointer-coarse` always-on.
- **Done when:** no horizontal scroll at any title length; ONE ember element in the panel (New);
  selection reads via the left bar; a custom light theme retints the tint (it rides `--color-primary`).

### N3 · Message row — ✅ (rest = name · inline time · fit bubble, ZERO always-on icons; `edit fork ⋯` on hover/focus; keyboard reveal verifier-proven)
**✅ SHIPPED.** Highest-impact fix; repeats every turn. All changes landed in the SHARED pieces — all 8 skins inherit (geometry CT suite re-verified).

- **Actions collapse (A3), respecting `messageActions`:** strip becomes `edit` + `fork` inline +
  `hide · copy · delete` under `⋯` in BOTH pref modes. `hover` (default): rest =
  `opacity-0 pointer-events-none`, reveal on `group-hover`/`group-focus-within`,
  `pointer-coarse:opacity-100` stays. `expanded`: the 3-item cluster always visible. Implement in
  `messageActionsRevealClass()` (ONE home — `GreetingActionsRow` inherits); update its §B.1 header
  comment to cite D66 A3. Keyboard: `⋯` menu keeps every action reachable at rest. Keep the existing
  fork glyph. Keep `MESSAGE_ACTION_ICON_CLASS` (glass legibility).
- **Quiet metadata (P5), respecting toggles:** in `message-metadata-row.tsx`, replace the
  `Badge`+`Clock`/`Cpu`/`Coins`/`Hash` pills with inline micro text (`Text size="micro"` +
  `font-mono` + muted), `·`-separated; timestamp preferably beside the speaker name in the name row.
  KEEP the existing `data-slot="message-metadata-*"` attributes on the equivalent elements (rule 0.7)
  and the render-nothing-when-empty behavior. PD-130 stays untouched.
- **Content-sized bubbles — bubble family only:** `message-row-variants.ts:77-79` `bubbleInner` gains
  `w-fit` (→ `w-fit max-w-prose rounded-card px-block py-row`). Verified consumers: exactly the five skins whose `inner: bubbleInner` (bubble/echo/whisper/ripple/tide — cite by SKIN NAME, the line numbers rot); flat/document/hush use `flatInner`/inline — untouched. Verify
  a short Whisper message still shows a sane 3:1 band and echo's feather padding contract holds.
- **Reading column:** verified already shared — `bubbleOuter` (`:74-76`) and composer
  (`composer.tsx:179,194`) both `mx-auto max-w-(--width-shell-content)`. No work; just don't break it.
- **Done when:** in `bubble` at rest a turn = name · inline time · fit-content bubble; hover reveals
  `edit fork ⋯`; `expanded` pref shows the 3-cluster always; a two-word reply hugs its text; all 8
  skins render their signature geometry (§9 matrix); a resting viewport shows ZERO always-on action icons.

### N4 · Chat Context — ✅ (identity header via the §6b-posture `header` slot beside `actions`; ember top edge retints; Overrides = ONE helper line + ? hints)

**[RE-ANCHORED 2026-07-15]** lockdown M3 DELETED `chat-context-panel-surface.tsx` +
`draft-context-panel-surface.tsx`. Chat context is now `CHAT_CONTEXT_TABS` minted via
`defineContextTabs` (`chats-section.tsx`), rendered by the blind `SectionContextHost` → the
generalized `ContextTabsPanel`. M3 also deleted the never-fed `contextHeader` channel ("no capability
for an absent consumer") — the identity header below IS that consumer now, so N4 re-introduces the
channel DEFINITION-OWNED per the lockdown §6b posture (a resolved `header` slot beside `actions`,
supplied through the mint / `ContextDefinition` arms), NEVER a route-fed prop or a shell-side
per-section switch. That channel shape is N4's ONE design decision; G3 (mint-only) and G2
(no-parallel-map) apply to it. The rest of N4 is paint.

- **Identity header (P4):** context header shows the active chat's avatar + title (reuse the
  `chat-header.tsx` cluster at `size="sm"`), not the current static "Details" `Text` in
  `app-shell.tsx`'s context `PanelChrome`.
- **Ember top edge:** one `shell.css` rule on `.shell-panel-header` scoped
  `[data-panel-side="context"]`: `box-shadow: inset 0 2px 0 color-mix(in oklab, var(--color-primary)
  55%, transparent)` — inset shadow, not border (identical over glass; unaffected by ramp's border drop).
- **Tabs:** list fills the panel (`flex-1` tabs), active indicator `--color-primary` (verify —
  looked correct in `chat-context.png`).
- **De-densify Overrides:** per-field helper sentences (now the field `description`s in
  `room-overrides-form.tsx`) collapse to ONE intro line at tab top (muted chip + `info` glyph:
  "Empty fields inherit from the character or preset. Saved automatically.") + a `?` Tooltip per
  field label. `Depth` (`authorsNoteDepth`) + `Role` (`authorsNoteRole`) share one row. Every
  field = `Field` primitive.
- **Done when:** Overrides has one helper line total; header names the chat; the ember edge renders
  over glass and under a light custom theme.

### N5 · Chats ember sweep + landing — ✅ (census: 56 Buttons, ONE stray demoted; every applicable §9 line passed live)
- Sweep `features/chat/**` with ast-grep for `<Button $$$>` (rule 0.9): survivors = list-header New,
  composer Send (`composer.tsx:256`), one primary per DIALOG. The landing hero is ALREADY one primary (a mutually-exclusive ternary — `:96` empty-library / `:101` New chat) and the browse affordance (`All characters →`, `:128`) is already `ghost` — N5's landing work is confirming the ember count, not demoting anything, `message-edit-textarea.tsx:117` save (inline editor → `secondary`),
  any others found.
- **Done when:** a full-viewport Chats screenshot shows ember on ≤1 button + the active nav/tab
  indicator + selection bar; §9 checklist passes end-to-end for the Chats section. **This is the
  north-star gate: N1–N5 all verified → other sections may start.**

---

## 5. Primitive polish PP1–PP5 — **✅ ALL SHIPPED 2026-07-16** (with derive-W2; PP5 minted `spacing.checkbox`)

> **This lane and derive-W2 are ONE ui-package wave** (Sequencing step 1): the skin-fragment tier +
> gate G25 (`derive-modernization-audit.md` §W2) ships alongside PP1–PP5 — fragments first or
> interleaved, each still its own commit. Same territory, one dispatch.

- **PP1 · Badge `soft` tone + real `info`** — `ui/primitives/badge/variants.ts` + `tokens.json`.
  Add `color.info-foreground` (AA ≥4.5:1 pair for the existing unused `color.info`; per D71 it
  ships as a `light-dark()` pair — mirror the success/warning arms; the per-palette
  `palette-contrast` sweep will enforce both polarities) + regenerate. **[CORRECTED]** the
  variants file's "there is no info color token" comment is STALE — `color.info` exists, unused; fix
  the comment. Add `tone: solid|soft` (soft = `color-mix` 15% tint + `text-<intent>` + optional 30%
  border) for every intent; point `info` at `bg-info text-info-foreground` / soft pair. Migrate
  hand-rolled status chips (Host, filter chips, member roles) to `Badge tone="soft"`. Info is a fixed
  status hue — do NOT add it to `clampThemeTokens` (§2c).
- **PP2 · Un-overload `--color-accent`** — `kbd/variants.ts` moves `bg-accent` → `bg-muted` (derived
  ramp member, themes retint). `info` stops borrowing accent via PP1. Done when `bg-accent` greps to
  hover/interaction states only.
- **PP3 · Focus-ring offset per surface** — `ui/src/lib/focus-ring.ts` hardcodes
  `ring-offset-background` (verified). Add `FOCUS_RING_ON_SIDEBAR` / `FOCUS_RING_ON_POPOVER`
  fragments; adopt in rail/panel and menu/select/popover/combobox item skins. Inside GLASS surfaces
  prefer the existing `FOCUS_RING_INSET` over any solid offset. Done when a focused menu item shows
  no mismatched moat (snap `--contrast`/pixel check).
- **PP4 · Avatar ramp re-space** — `tokens.json` `spacing.avatar-sm/md/lg` 24/30/34px (verified) →
  `1.5/2/2.5rem` (24/32/40), `hero` stays 4rem. Variant keys unchanged; `avatarSize` pref mapping
  unchanged; `avatarAspect=portrait` derives from the same height token (verify md/lg portrait
  chips); Ripple's `--immersive-ripple-portrait-width` is independent — untouched. Sanity-check
  message-row (`md`) and identity-header (`sm`) call sites.
- **PP5 · Checkbox off the group-gap token** — `checkbox/variants.ts` box is `size-section`
  (verified; `--spacing-section` = 24px group gap). **[CORRECTED — naming]:** tokens.json
  `spacing.control-sm/md/lg` are the COARSE 44/48/56px values (D62 pointer-conditional model:
  fine-pointer 32/34/40 is a conditional retune) — an 18px `control-xs` inside that ramp would break
  the convention. Either mint `spacing.checkbox` (single-purpose, honest) or wire a proper
  pointer-conditional `control-xs` pair — decide at build, flag in the PR. The `::before`
  `size-touch-target` hit area is untouchable (≥44px coarse floor).

---

## 6. Rollout after the north star (in order) + ported remainders

> **Pre-gate: ✅ SATISFIED 2026-07-16** — derive-W1 (FormDialog + G24) landed; the rollout repaints
> already-migrated dialogs. **This § is the open work.** Build order below; each stop follows the
> chats-lane pattern (N1 band mechanics exist app-wide already — `PanelChrome` renders the band for
> every section; each stop fills it, applies P2 ownership + §7 autosave, and runs its §9 lines).
> The characters stop ALSO mints the character-detail contributor registry (the one named seam gap).

1. **Characters** — content header autosave status (§7) replacing Discard/Save
   (`character-editor-surface.tsx:175-213`, incl. the dirty-primary ternary at `:204`); token counts
   to ONE header readout (`787 total · 637 permanent` pattern), per-field `~N` chips deleted (exact
   counts live in Context → Field detail); the five ember `Set` rows (VOICE/EXTRAS/ADVANCED,
   `character-facet-editor.tsx`) become empty=`ghost` "Add…" / filled=preview+drill-in; suggested-tag
   chips group under one "Suggested" label and `Suggest tags` / `Manage tags` are `ghost`; the
   opening-message card keeps `+ Add opening` / `Edit` as `ghost` and `Back` is `ghost` with a
   leading chevron, top-LEFT (not bottom); Context Field empty state names the entity ("Pick a field
   on **JFC**…"). **[CORRECTED]** the Options color swatches ALREADY use `field.ColorField` with
   labels (`character-appearance-tab.tsx:240-258`) — verify rendered labels are visible, else a
   sizing fix only, not a rebuild.
2. **Presets** — 10 tabs (`lib/preset-nav.ts` `PRESET_EDITOR_TABS` typed tuple) → 4 groups:
   **Generation** (Quality·Sampling·Reasoning·Output) · **Prompt** (Prompt·Templates) · **Context**
   (Compaction·Variables) · **Transforms** (Post-process·Regex); old tabs become sub-navigation
   inside each, content moves UNCHANGED (regroup, not rewrite). `Save preset` → autosave (§7).
   Section detail's bottom `Duplicate · Move below · Delete` row → one `⋯` in the Section header;
   `Every generation` stays the only ember toggle in the detail. Rack-row ember budget: revisit the
   per-row ember toggles + `custom` pill + `POST` pill against P2 during the lane (they were the
   worst single-viewport ember count: ~15).
3. **World Info / Corpus / Refinery / Analytics / Settings** — apply the north-star pattern
   (N1 band + P2 ownership + §7 autosave) per section. (Refinery is a DECLARED-PLANNED section —
   its stop applies when it's built, not before.)
4. **Ported open remainders — THE one UI to-do board** (every open UI item from the archived
   D62-era records, each CODE-VERIFIED 2026-07-13; the history docs are closed — nothing UI-shaped
   is tracked anywhere but here):
   - **UIP-404 — `SettingRow` row-grammar adoption.** OPEN, verified: `SettingRow` renders in only
     3 files; the appearance pane still composes `Grid`/`Section`/`Stack`. The persona settings
     pane already adopted it — use it as the pattern. Fold into the Settings stop of the rollout.
   - **Streaming caret + typing dots.** OPEN, verified: `ghost-message-row.tsx` has neither the
     2px primary caret nor the typing dots today. Verify-live what streaming actually shows, then
     build the missing chrome (respecting `reducedMotion`). Fold into the N3/N4 chat lane.
   - **Account — [SUPERSEDED 2026-07-15 by the shell-chrome §B ruling: You ⊃ Identity ⊃ Account;
     RESOLVED 2026-07-16].** The declared-planned settings `account` pane is DELETED (shell-chrome §E-7 —
     file + front-door export + door registration + `SETTINGS_CATEGORY_IDS` member gone). Account stays the
     leaf MODAL (`auth/lib/account-modal.tsx` → `auth/surfaces/account-surface.tsx`, placement `surface`),
     reached from inside the Identity widget. Auth #50 completion targets the modal body. Do not build a pane.
   - **@orb/ui chart-module registration — `Scatter` + `Heatmap`/`VisualMap`.** OPEN (2026-07-13):
     the ECharts seal (`packages/ui/src/charts/chart/echarts-setup.ts`) registers Bar/Line only.
     Two shipped surfaces are capped by it: the Corpus Map is an inert SVG scatter (click-through is
     belt-blocked on raw SVG — needs a real `Scatter` primitive) and Analytics decomposes the 7×24
     activity matrix into histogram+bar-list (a true heatmap needs `HeatmapChart`+`VisualMapComponent`).
     One ui-package task unlocks both; the consuming client code is already shaped for it.
   - **Chat-scoped discovery drills — `discovery.swipeHotspots` + `discovery.similarChats`.** OPEN,
     verified: both server verbs are routed + tested but take a `chatId` (a chat's most-re-rolled
     assistant slots; "more like THIS chat"), so they belong to a FUTURE per-chat drill, NOT the
     owner-wide Corpus section — the Corpus coverage pass (2026-07) deliberately left them
     unconsumed rather than forcing a chat concern into the corpus surfaces. Fold into the Chat lane
     when a chat-analytics drill is scheduled (the same select/scope wiring the corpus dossier uses).
   - **Chat-behavior settings pane.** OPEN, re-verified 2026-07-15: registers honestly as
     `body: {placeholder: true}` (`features/settings/lib/chat-behavior-pane.tsx` — the M6 pane
     registry replaced `settings-nav.ts`'s `built:false` flag). Fold into the Settings stop of the
     rollout alongside UIP-404. (Automation is likewise `{placeholder: true}` but is feature-scope,
     not cohesion.)
   - **Autosave micro-status on settings panes.** OPEN, re-verified 2026-07-15: §7 specifies a live
     `Saved / Saving… / Save failed — retry` status, but no pane renders it — every pane shows only
     the static "Changes save automatically" caption (`settings/surfaces/appearance-settings-surface.tsx`,
     `settings/surfaces/regex-settings-surface.tsx`, and post-M6
     `credentials/surfaces/connections-settings-surface.tsx`). The autosave WRITE path exists; the
     user-facing status affordance does not. App-wide A4 gap — needs its own pass (one shared status
     primitive fed by the section mutation state, replacing the static caption). Fold into the
     Settings stop of the rollout alongside UIP-404.
   - **Devtools FAB in snaps.** RESOLVED (2026-07-13): `main.tsx` now also checks `isProbeMode()`
     (`orb:probe-mode`) before rendering `DevTools`, so `pnpm snap --probe` captures no longer show
     the FAB.
   - **RESOLVED, no work (recorded so nobody re-opens; Opus-verified 2026-07-13):** the
     presets/world-info rail sections are BUILT (the placement question is settled — D66 keeps
     Presets in the rail, Connections in Settings); J11's Personas + Connections panes are BUILT;
     J5's four chat-lifecycle tRPC procedures are ROUTED (`routers/chat.ts`); the focus-ring audit
     is PP3; — DESIGN-REVIEW-2026-07-01's findings were all
     applied; every design-enforcement item is BUILT or DROPPED-by-ruling (no-CI model, D62); the
     full punchlist §0c table and ux-flow J-table re-verified with zero FALSE-DONE.
   - **RESOLVED — client composite consolidation (jscpd tsx clone-audit lane, landed 2026-07-13):**
     the cohesion composites are built + adopted at every cloned site — `RowActionsMenu`
     (⋯-menu → items → ConfirmDialog-wired destructive; 9 sites, incl. migrating 6 hand-rolled
     `AlertDialog` deletes onto the sanctioned C1 `ConfirmDialog`), `LibraryRow` +
     `LibrarySurfaceShell`/`LibraryListLayout` (preset + world-info libraries), `CharacterPicker`
     (add-member popover + new-chat picker), `EntryListEditor` (preset regex + variables tabs),
     `createFormHandleBridge` (character + preset editor bridges, `resolve*` gates kept),
     `ThemeColorFields`/`assignThemeColorFields` in `#lib` (character + settings theme models), the
     settings `WorkloadFormDialog`/`WorkloadSubmitButton` scaffold + the `useBoundField` bound-field
     wrapper, and preset-nav re-adopting the ONE `#lib/message-role-labels` map. All behavior-preserving
     (only visible change: the admin-user + theme-row `⋯` text triggers standardized to the
     `MoreHorizontal` glyph). `jscpd.json` now lists `tsx` (it was blind to the whole client);
     client tsx duplication 4.30%→3.15%.
   - **RESOLVED — Settings→Regex pane (2026-07-13):** the D53 owner-global tier got its editor. Root-fixed
     rather than worked around: `regexScripts` became a real `USER_SETTINGS_SECTIONS` member (`regex.scripts`,
     schema v2→v3 lift, one-shot migration), so the pane autosaves through the same section path as every
     sibling; `EntryListEditor`'s 3rd consumer; ONE shared `RegexEditorDialog` now serves preset + settings.
   - **RESOLVED — the Corpus section (2026-07-13, closes J10):** built at `features/discovery/`
     (`corpus` stays the section label). Full four-region anatomy, omnibox (typeahead + Text lexical
     target + the J10 per-chat evidence preview), browse (sort/tag axes), home (catalog/insights/keyword
     explorer), dossier (+ Similar art, askCard), CONTEXT tabs Archetypes/Map/Similarity/Compare/Visuals.
     Every discovery-router procedure has a consumer except the two board-routed chat-scoped drills.
   - **RESOLVED — the Analytics section (2026-07-13):** built at `features/stats/`. All 12 stats-router
     procedures consumed — leaderboard LIST → per-character drill, overview/wrapped dashboard CONTENT,
     Models/Time/Personas CONTEXT tabs, charts-family throughout (bar-list/histogram/stat-figure/meter).
   - **RESOLVED — Backup & Restore folder import (2026-07-14):** the import dropzone now also takes a
     whole unzipped folder (a `webkitdirectory` `FolderPicker` primitive + `POST /api/import/tree`, no
     client-side zip dep). The ingest is an INGEST TRUST BOUNDARY: every browser-supplied relative path is
     sanitized fail-closed (reject absolute / `..` / backslash / NUL / empty-`.` segments) then
     resolve-prefix-checked against a fresh unique staging dir; per-file (64 MiB), total (256 MiB), and
     count (50k) caps; a rejected path fails the WHOLE upload (no partial staging). A layout sniff routes
     an ST profile tree → the `import-st` workload (widened with an optional staged-dir override) and an
     orb backup tree → the `import-bundle` workload (`source: "dir"`, consuming a `stageDirectory`
     `StagedArchive` through the same `importStagedArchive` seam the extracted zip uses); an
     ambiguous/unrecognized tree is a typed reject. Both arms ride the existing `BundleWorkloadTracker`
     progress UX; the workload owns the staged-tree cleanup. v1 is pick-button only — the `FileDropzone`
     primitive doesn't traverse a dropped folder (`webkitGetAsEntry`).

---

## 7. The save model — AUTOSAVE EVERYWHERE (decided)

No manual Save/Set/Discard button on any editor. The chat-overrides autosave
(`features/chat/components/room-overrides-form.tsx` + `injections-manager.tsx`, "Changes save
automatically" — re-anchored 2026-07-15, the M3-deleted surface's bodies moved here) is the precedent;
extend the same debounced-mutation pattern to characters and presets (client-side wiring on the
existing `character.update`/`preset.update` mutations — NO server change; if a lane appears to need
one, STOP and raise it). Every editor shows one identical status where its Save button was:
`Text size="micro" tone="muted"` — `Saved` / `Saving…` / `Save failed — retry` (retry = affordance,
not silent). Destructive/irreversible actions keep their confirms via the tier-2 `ConfirmDialog`
(raw `@orb/ui/alert-dialog` in features is G7-RED since M5). The orphaned `save-bar` primitive +
`form.DirtyPill`/`form.SubmitButton` helpers stay in the package this program (D66 A4) — deleting
them is a follow-up decision once no consumer remains.

**TRAP (caught live 2026-07-13): `createAutosaveEntityForm`'s `onChange` listener fires only on
scalar field `handleChange` — NOT on form-level array structural mutations (`pushFieldValue` /
`removeFieldValue`).** An autosave pane that CRUDs an array field must explicitly flush
(`form.handleSubmit()`) after add/remove or the mutation silently never persists (the regex pane
shipped with exactly this bug; removal was equally dead). Any future array-field autosave consumer:
flush explicitly, and CT the add AND remove persistence paths.

---

## 8. Token cheat-sheet (verified against `tokens.json` 2026-07-13)

**Surfaces:** `--color-background` · `--color-sidebar` · `--color-card` · `--color-surface-raised` ·
`--color-popover`. **Text:** `--color-foreground` · `--color-muted-foreground` · `--color-dialogue` ·
`--color-narration` · `--color-speaker` (=primary). **Accent:** `--color-primary` +
`-foreground`; tints via `color-mix(in oklab, var(--color-primary) 10–14%, transparent)`.
**Status:** `--color-success/-foreground` · `--color-warning/-foreground` · `--color-info`
(+ `-foreground` NEW in PP1) · `--color-destructive/-foreground` — all `light-dark()` polarity
pairs (D71); the active arm follows `color-scheme`, never a per-theme re-author. **Lines:** `--color-border` ·
`--color-sidebar-border`. **Bubbles:** `--color-user-bubble` · `--color-ai-bubble` (+foregrounds).
**Space:** `--spacing-field` .375rem · `--spacing-row` .5 · `--spacing-block` .75 ·
`--spacing-section` 1.5 · `--spacing-gutter` 2. **Radius:** `--radius-control` .375 ·
`--radius-base` .5 · `--radius-card` .625. **Dimensions:** `--dimension-rail` 3.5rem ·
`--dimension-chrome-row` 3rem · `--dimension-panel` clamp(16rem,22vw,22rem) ·
`--width-shell-content`. **Type:** `--text-display/headline/title/body/label/micro`; `--font-sans` /
`--font-mono`. **Control heights:** `--spacing-control-sm/md/lg` = COARSE 44/48/56px in tokens.json;
fine-pointer 32/34/40 is the D62 conditional retune — never read the JSON values as the fine sizes.
**Button intents (unchanged):** `primary` (ember fill + shadow-cta) · `secondary` (1px border,
transparent) · `ghost` (muted) · `destructive`. Bare `<Button>` = primary (rule 0.9).

---

## 9. Acceptance checklist (run per lane; the whole list gates N5)

- [ ] Four pane headers on one `--dimension-chrome-row` baseline (flat AND ramp, ± glass).
- [ ] Exactly one ember button per surface; nav/tab active + selection bar are the only other ember.
- [ ] No action visible in two places at once (hover-`⋯` menu mirror excepted).
- [ ] Message turn at rest = name · inline time · fit-content bubble; hover = `edit fork ⋯`;
      `messageActions=expanded` shows the 3-cluster always; coarse pointer shows it always.
- [ ] No horizontal scrollbar in any List at any title length.
- [ ] Token counts once per surface; timestamps have no pills/icons; metadata `data-slot`s preserved.
- [ ] Context header carries the active entity + ember top edge; empty states name the entity.
- [ ] Every field = `Field`; every list item = `ListRow`; no editor has Save/Set/Discard — one
      `Saved/Saving…` status each, same position.
- [ ] Presets: exactly 4 primary tabs; section actions = one `⋯`.
- [ ] No raw color/size literals in features; token changes = `tokens.json` diff + regenerated
      `theme.css` only; new hand-CSS only in `shell.css`.
- [ ] `info` badge blue + distinct from `neutral`; `soft` tone exists; no hand-rolled pills;
      `bg-accent` only on hover/interaction; focus ring shows no offset moat in popovers.
- [ ] Avatar sm/md/lg visually distinct; checkbox ~18px, decoupled from `--spacing-section`,
      touch-target intact.
- [ ] **Appearance matrix:** 8 chatStyles hold signature geometry; elevations flat/ramp/glow hold the
      baseline; glass frosts; bg-image keeps legible scrimmed chrome; every metadata toggle +
      `messageActions` mode functions; `density=compact` + `chatWidthPct` cascade.
- [ ] **Custom-theme smoke:** a LIGHT theme retints all new chrome (band, selection tint, ember edge,
      badges, kbd) with derived foregrounds flipping — nothing stays Hearth-colored.
- [ ] **Custom-CSS stability:** zero removed `data-slot=` values / `.shell-*` class names in the diff.

**Verify loop:** `pnpm stack start` once, then `pnpm snap` per change. Established idioms for this
program: `pnpm snap / --out x` (default 1280×800) · `--wide` · `--text`/`--aria` first (cheapest) ·
`--jsclick "[data-slot=list-row-body]"` to open the first chat (virtualized rows need jsclick) ·
`--click "[aria-label='Characters']"` etc. for rail nav · `--eval` for scrolling inner containers +
computed-style probes · `--contrast <sel>` for AA checks · `--map` fresh after every interaction ·
`--probe --baseline`/`--diff` for before/after SSIM on a surface being restyled. Snap exits non-zero
on any contrast FAIL / page error / failed request — read the RESULT line.

---

*Scope guard: a task that seems to need a new primitive, a new Button intent, a new token beyond
PP1/PP4/PP5, or a server/data-model change — STOP and raise it in the PR. Do not invent.*
