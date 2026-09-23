---
kind: design
status: active
updated: 2026-08-30
---

# Context bracket — the build design (#860 · #846 · #861 · #850-half)

The mock is the spec: `docs/design/mocks/context-bracket/DESIGN.md` (owner-ruled 2026-08-30). This file is
the build lane's design record — what the tree already has, what the mock's sentences resolve to in code,
the alternatives rejected, the premises the tree refuted, and the coupled sites. Lane `cb-ctx-bracket`.

## 1. What the tree already has (recon, 2026-08-30, worktree base `935d5a3e1`)

- The bracket column EXISTS, once, as rpg's whole-pane claim: `rpg-hud.tsx` (band → game rail → viewport
  `flex-initial` → ground → admin rail) + `rpg-hud-rail.tsx` (kicker + toolbar of `aria-current` cells,
  manual activation, `minmax(max-content,1fr)` tracks, the fold below `xs`, crown/badge/lock). The generic
  pane is a different renderer (`context-tabs-panel.tsx`: one `tablist "Detail"` at the HEAD, `tab`
  cells, `flex-1` panels, shell.css `.ctx-tab-strip`). The fork is exactly the two renderers.
- The ONE selection resolver is already shared (`use-context-tab-selection.ts`) and the region seam is
  already contract law (`registry-contracts.ts` `ContextRegionDef`/`defineContextRegion`, gate
  `context-definition-shape` arms 5-8, D119).
- **Premise kill #1 (#861):** "the admin rail's CHAT kicker dangles UNDER its cells" is false on today's
  tree. `rpg-hud-rail.tsx:229` renders the kicker `Row` BEFORE the cells `Row` (`:254`), no reverse/order
  class exists (`rg 'reverse|order-'` → 0 in both HUD files), and the live snap of main's RPG room
  (`reports/snaps/cbcb-live-rpg-status.png`, 1920×1080, Status tab) prints "CHAT" above Members · This
  chat · Preview · Game at the pane's foot. The bracket keeps kicker-above by construction; the DOM-order
  pin the brief asks for is therefore a FENCE (green-before), not a defect proof, and is labelled so.
- **Premise kill #2 (DESIGN.md "the stat-profile editor and HOST CONSOLE leave Status for Game"):**
  already true. `rpg-game-tab.tsx:390-396` mounts `RpgStatProfileEditor` + `TrackersEditor` + the host
  scalars inside the Game tab's `HostConsole`; `rpg-status-tab.tsx:121-143` renders the roster cards + the
  host-only Veiled ledger and nothing else. What Status DOES carry is the in-place VALUE editing on each
  roster card (status line · meter value/max · conditions) — that is the 2026-07-25 owner ruling ("every
  block is EDITABLE IN PLACE … display-only trackers are the corruption-trainer failure",
  Context-Panel-Program §3.2), and the mock's Status body is a display sketch, not a ruling against it.
  Nothing moves; the recorded ruling stands (fork stated in §6 with this default).
- The "≤347px chrome pin" the brief cites was superseded on 2026-08-17: the live fence is the
  NON-VIEWPORT SPEND `≤ 401px` at 383×800 (`rpg-context-section.ct.tsx:2650-2660`, "#102: the HUD's
  NON-VIEWPORT SPEND is pinned"), which counts the column's seams. It is re-measured below.
- The mock's foot roster (Members · This chat · Preview · Activity · Game) is the LIVE roster for a host:
  `automation/lib/activity-context-tab.tsx` is registered at the door (`compose/authed-app.tsx:124`,
  `when: isHost`). It rendered under the dev toast in the live snap — present, not missing.
- `data-context-mode` is written on `.shell-grid` (`app-shell.tsx:235`) — the hook the topbar-yield
  rule (§3.6) keys on. The snap stage is held by the sibling worktree `agent-a493747f971863e7d`
  (`--stage-status`: "band in use"), so rendered receipts go through CT until it frees.

## 2. The chosen architecture — the claim shrinks to the band; the shell owns the column

**ONE column component, rendered by the shell for EVERY `kind:"tabs"` context pane:**
`features/app-shell/components/context-bracket.tsx` (`ContextBracket`) — HEAD band slot → TOP rail
(only when a `strip:"game"` tab resolved — applicability, §4.1) → VIEWPORT (`TabsPanel` per tab,
`role="region"` named by its cell, `flex-initial min-h-0 overflow-y-auto`) → GROUND (`flex-1`, the
residual) → FOOT rail (the `strip:"meta"` tabs, always). `features/app-shell/components/context-rail.tsx`
(`ContextRail` + `ContextCell`) is `rpg-hud-rail.tsx` moved into the shell tier and generalized; the cell
id derivation moves with it (`features/app-shell/lib/context-cell-id.ts`). `ContextTabsPanel` keeps its
name and export (every CT story imports it) and becomes the bracket host: it resolves the selection and
renders `<ContextBracket band=… railLabel=… view=…/>`. `ContextRegionHost` is deleted.

**The region claim becomes a HEAD-BAND claim.** `ContextRegionDef.render(view)` → `band: () => ReactNode`;
`resolveContextTabs` folds the FIRST claiming region's band into `ResolvedContextTabs.header`
(`header = claimingRegion?.band() ?? spec.header?.(state)`), and `ResolvedContextTabs.region` is gone. The
claimant no longer composes rails or a viewport — "one slot, three contents — never a second head"
(DESIGN.md) is now structural: there is no API through which a contributor could render a second rail. rpg
keeps ONE `defineContextRegion` call (`rpg-hud-region.tsx`, `band: () => <RpgHudBand />`); the box-memory
reservation and the instrument-tier `Surface` stay rpg's, wrapped around the band and around each game tab
BODY (`rpg-context-section.tsx` `gameTab`), never around the rails — the rails must render identically in
both rooms, which is the whole ruling.

**The rail model is universal (#112 everywhere):** `role="toolbar"` + `aria-label` per rail, cells are
native buttons carrying `aria-current="true"` when they hold the view, manual activation (arrows move
focus, Enter/Space selects), `region` panels named by their cell. The generic `tablist "Detail"` retires
with its `tab`/`aria-selected` model, its `.ctx-tab-strip` CSS, and its `aria-disabled` treatment of a
PHASE-locked tab: a locked cell wears the padlock and OPENS onto its reason in every pane (RV-7).

**Rail names.** The META rail is named by its section — `ContextTabsSpec.railLabel?: string` (the artifact
noun: "Chat"; "Character" lands with commit 2) with the section's `rail.label` as the fallback (applied by
`SectionContextHost`, the one place that holds both the definition and the resolve — Corpus/Analytics/
Refinery read as their own names). The GAME rail's name is a property of the closed strip vocabulary and
is homed beside it: `GAME_STRIP_LABEL = "Game state"` in `registry-contracts.ts` (the old `RAIL_NAME.game`).

**The kicker.** Sits ON TOP of its rail's cells in both rails (DOM order kicker → cells; the foot rail's
top hairline is its boundary with the ground, the kicker's own hairline is the rule between the word and
the cells — the mock's `.kick`). The rail that owns the selection is raised (`bg-sidebar-accent/40`, the
mock's `--raised`, the same fill the band wears) and prints "NAME · SELECTION"; the other recedes and prints
its bare name. The selection half is shown at EVERY pointer (the mock's 430 arms print "CHAT · MEMBERS"; the
2026-08-07 coarse drop was a judgment about the old echo's position, and the datum now sits 4px above the
cell it names). `HIDE_AT_COARSE` leaves the selection span.

**The cell.** `TabsTab layout="stacked"`: glyph + `voice="label"` caption (13px — the #102 readable floor
stands; the mock's 10.5px caption is NOT adopted, per the 2026-08-17 side-eye ruling that drove sub-11px
interactive text to zero), ember fill `bg-primary/15` + foreground ink when active, and the 2px primary bar
on the cell's BOTTOM edge in BOTH rails (the mock's `.cell.on::after{bottom}` — restated for the top rail
too; the fold arm's bar suppression stays). Locked: padlock + `opacity-60` + `aria-label "<name> — locked"`
and a `title` reason. Crown, badge, wrap and no-clip tracks are unchanged from the HUD rail.

**Phone cells ≥ 52px.** No 52px token exists (control-md 48 · control-lg 56 at coarse); the cell takes
`CONTEXT_CELL_FLOOR_AT_COARSE = "pointer-coarse:min-h-control-lg"` from `#components/pointer-variants.ts`
(the `CHIP_TOUCH_FLOOR_AT_COARSE` precedent) — 56px, the first token step at or above the mock's floor.

**The head band.** The bracket paints the band's box (`bg-sidebar-accent/40 px-block py-row`) and the
CONTENT is the section's `header` (or the claimant's band). The 2px ember content↔context binding rides
the bracket ROOT as an inset top shadow, painted by shell.css ONLY while the context pane is DOCKED —
the same rule + the same floating exception the generic `.shell-panel-header` carried (north-star N4/P4;
"the ember edge comes OFF a floating pane"). The shell's `.shell-panel-header` renders NOTHING for a
`tabs` context in every mode (the HUD's `:empty`-collapse, now universal; `single`/`none` contexts keep
the shell band). `.shell-panel-body` drops its padding for a bracketed pane (the `:has([data-context-region])`
rule re-keyed on `[data-context-bracket]`, the bracket root's single-writer probe attribute — gate arm 8
re-keyed with it); the viewport re-pays the padding.

**The chat band.** New `features/chat/components/chat-context-band.tsx`: the room's title (`deriveChatTitle`,
2-line clamp + `text-balance`, `title` attribute) over three chips — members (`Users` glyph + "N members",
opens the Members cell), memory (`ChatRecallIndicator`, relocated verbatim — its one home), and the
viewer's ACTIVE preset name (a chat carries NO preset binding — D58 rules that impossible; the chip names
the preset that governs generation for the viewer, read through the preset domain's active-preset query).
`ChatContextState` gains `title`; `useChatContextState` copies it from `getChat`. Supplied through the
existing `header` slot of chat's `defineContextTabs` — the slot CP-1 left empty "for CP-4's scene
banner", which it now carries by the mock's ruling.

**The topbar yields to the band (#846 by relocation).** When the CONTEXT pane is DOCKED the room's name IS
on screen in the band 300px away, so the topbar's wide identity sheds the title, the members chip and the
recall chip (`.shell-grid[data-context-mode="docked"] …`), keeping the avatar cluster as the row's anchor;
collapsed/overlay panes leave today's row untouched (the room stays named when the pane is closed — the
default for chats is `context: "collapsed"`). The held `f092a119f` 44rem shed is superseded and NOT taken;
its two facts ARE taken: the recall chip gets its own `.shell-chat-recall-chip` marker (it wore the roster
chip's class by accident) and the #846 CT seats the notifications bell before measuring the row.

## 3. Alternatives rejected

- **A. Keep two hosts, share the pieces** (`ContextTabsPanel` and `RpgHud` both render a shared bracket
  from `#components`; the claim keeps `render(view)`). Rejected: the claim would still wrap the RAILS in
  rpg's instrument-tier `Surface`, so the one rail would render at two densities — the fork re-enters
  through spacing. And "one slot, three contents — never a second head" would be a convention, not a shape.
- **B. Keep the region as a whole-pane claim and make the generic panel merely LOOK like it.** Rejected:
  two renderers is the defect (#845's measured fork); a look-alike drifts the day either is touched.
- **C. The band stays in the shell's `.shell-panel-header` (grow the chrome row).** Rejected: HUD-1 H1
  deleted that growth exception for exactly this content; rpg would still paint its band in the body → two
  geometries for one slot, and the mock's band is a variable-height artifact band, not a chrome row.
- **D. Foot rail as a real `tablist` in a normal room, toolbars only in a game room.** Rejected: the brief
  and DESIGN.md rule `aria-current` + the #112 arm on the foot rail in BOTH rooms; a role that flips on
  "am I the only rail" is the fork inside the shared component.
- **E. Remove the title from the topbar unconditionally.** Rejected: chats default to a COLLAPSED context
  pane, so the room would be nameless in the content region until the user opens the panel — the exact
  injury #846 describes, made permanent.
- **F. Kicker at 10.5px caption, mobile cells at exactly 52px, ember LEFT edge (the artboard's frame).**
  Not adopted: tokens only (DESIGN.md), the readable-floor ruling, and the top-edge binding ruling survive;
  the artboard's left rule is its frame.

## 4. Coupled sites (enumerated before building)

| Site | Change |
| - | - |
| `client/src/lib/registry-contracts.ts` | `ContextRegionDef.render`→`band`; `ResolvedContextTabs.region` folded into `header`; `ContextTabsSpec.railLabel?`; `ResolvedContextTabs.railLabel?`; `GAME_STRIP_LABEL`; header/JSDoc truth-repair |
| `client/src/lib/index.ts` | export `GAME_STRIP_LABEL` |
| `app-shell/components/context-bracket.tsx` · `context-rail.tsx` · `lib/context-cell-id.ts` | NEW (from `rpg-hud.tsx`/`rpg-hud-rail.tsx`/`rpg/lib/hud-cell-id.ts`) |
| `app-shell/components/context-tabs-panel.tsx` | the bracket host (strip + `.ctx-tab-strip` retire) |
| `app-shell/components/context-region-host.tsx` | DELETE |
| `app-shell/components/section-context-host.tsx` | `tabs` band → null; railLabel fallback |
| `app-shell/surfaces/shell.css` | delete `.ctx-tab-strip`; re-key the padding drop; bracket ember (docked only); topbar yield; `.shell-chat-recall-chip` in the 30rem shed |
| `rpg/components/rpg-hud.tsx` → `rpg-hud-band.tsx` · `rpg-hud-rail.tsx` DELETE · `rpg/lib/hud-cell-id.ts` DELETE · `rpg/lib/rpg-hud-region.tsx` · `rpg/lib/rpg-context-section.tsx` (instrument tier per body) | |
| `chat/components/chat-context-band.tsx` NEW · `chat/lib/chats-section.tsx` (`header`, `railLabel`) · `chat/hooks/use-chat-context-state.ts` (+`title`) · `chat/components/chat-header.tsx` (export the roster chip) · `chat/components/chat-recall-indicator.tsx` (class) | |
| `client/src/components/pointer-variants.ts` + `index.ts` | `RPG_RAIL_WRAP`→`CONTEXT_RAIL_WRAP`, `RPG_RAIL_WRAPPED_EDGE_BAR_OFF`→`CONTEXT_RAIL_WRAPPED_EDGE_BAR_OFF`, `CONTEXT_CELL_FLOOR_AT_COARSE` NEW |
| `tooling/src/verify/gates/context-definition-shape.ts` | arm 5 `{claims, band}`; arm 8 `data-context-bracket`; fixtures |
| `tooling/src/verify/gates/ui-size-via-variant.ts` · `no-pointer-variants-in-features.ts` | allowlist path re-point; FIX text |
| CTs: `app-shell/components/context-tabs-panel.ct.tsx` (rewritten) · `context-region-host.ct.tsx`→`context-bracket.ct.tsx` · `section-context-host.ct.tsx` · `app-shell/_ct-stories.tsx` · `app-shell/surfaces/app-shell.ct.tsx` (+the #846 pins) · `rpg/lib/rpg-context-section.ct.tsx` (slot names, #112 selectors, spend, selected state, coarse kicker) · `chat/lib/chats-section.ct.tsx` (38 `tab`→cell sites + the band pins) · `character/lib/characters-section.ct.tsx` + `character-chats-projection-shell.ct.tsx` (role only — source under `features/character` is fenced) · `tests/client/lib/registry-contracts.dom.test.ts` · e2e `support/chat-room.ts` + `group-chat.spec.ts` (role) | |
| `tests/support/browser/ct-data-providers.tsx` | no change (regions registry shape unchanged) |
| docs: `Context-Panel-Program.md` §4.1/§4.2 · `docs/adr/` (D119 absorbed + the new row) · `client-architecture-lockdown.md` §6b/§6c/§4-band clause · this file | |
| ledger: `tooling/src/verify/gates/caught-failure-ownership.population.json` | regen in-worktree (a CT file is renamed). The test-baseline manifest was the other half and is DELETED (#2217) |

## 5. Test plan

- **Red-first (run against the unmodified source):** (a) a normal room's pane has NO `tablist "Detail"`
  at its head and DOES have a `toolbar "Chat"` whose cells carry `aria-current` — red on main; (b) the
  foot rail's bottom edge equals the pane's bottom edge in a normal room (today the strip is at y≈0) — red;
  (c) #846: at 1280 dock+dock with the bell seated the topbar's wide title is HIDDEN (offsetParent null)
  and the chats band prints the whole title (no clamp overflow) — red; (d) the game rail's active cell
  carries the ember fill + 2px bar while a game tab holds the view — a FENCE, green-before (the treatment
  existed; #850's finding was measured while a meta tab held the view).
- **Fences (green-before, labelled):** kicker precedes its cells in DOM order (both rails); locked Map
  opens onto its reason with a padlock; coarse cells ≥ 52px; captions never clip.
- **Planted controls:** the DOM-order pin is proven failable by swapping the two rows in a scratch copy
  before trusting it; the topbar-yield pin asserts the bell is seated (premise) before reading the row.
- **Behavioral tier:** `pnpm test:ct tests/client/features/app-shell/components/context-tabs-panel.ct.tsx
  tests/client/features/app-shell/components/context-bracket.ct.tsx
  tests/client/features/app-shell/components/section-context-host.ct.tsx
  tests/client/features/app-shell/surfaces/app-shell.ct.tsx tests/client/features/rpg/lib/rpg-context-section.ct.tsx
  tests/client/features/chat/lib/chats-section.ct.tsx tests/client/features/chat/components/chat-header.ct.tsx
  tests/client/features/character/lib/characters-section.ct.tsx --workers=2` · `pnpm test:scoped
  tests/client/lib tests/client/features/app-shell tests/client/features/chat tests/client/features/rpg --maxWorkers=4` · the gate's conformance rows through `tests/tooling/check-gates.int.test.ts` (scoped to
  this gate) · `pnpm typecheck` (all runnable programs, including the root Node and browser-test worlds) · `check:structure` · depcruise.
- **Rendered:** `pnpm snap --isolated --ref <sha>` at 1280×800 dock+dock for Midnight Run and The Ashen
  Spire (Status · Game) + 430 coarse, beside the mock PNGs; `deadcss=0`; `design-audit` on both rooms
  desktop + mobile (the 28 sub-floor Game-tab targets are #850's other half — not regressed, not fixed).

## 6. Forks (escalated with a stated default; rulings recorded 2026-08-30)

1. **Topbar title: docked-conditional yield vs unconditional removal.** RULED: yield only while the
   context pane is docked; avatars stay (E in §3 is the cost of the other arm).
2. **Status in-place VALUE edits stay.** RULED: the 2026-07-25 in-place ruling stands; the mock's Status
   body is a display sketch; the definitions-in-Game ask was already true.
3. **A floating pane's dismiss.** RULED (the alt, reshaped): the 08-06 P2 "the close sits where the thing it
   closes is" stands and "provide the exits" is law on touch — the X rides INSIDE the head band's top-right
   corner (`size="icon"`, the 44px coarse floor), never a separate chrome row; `SectionContextHost` receives
   `dismissLabel`/`onDismiss` from `app-shell.tsx` in overlay mode only.
4. **Coarse cell floor = 56px** (`min-h-control-lg`, no 52px token). RULED.
5. **#861's real mechanism** (side-eye, live crops `reports/snaps/cbrs-861-foot-*.png`): the kicker was above
   its cells everywhere; what dangled was the RECEDED rail — no fill, no floor under its cells (their bottom
   edge WAS the viewport's), a kicker brighter (8.50:1) than the owning one's (4.97:1), cells folding 3+2 at
   1024×768. Built: the receded rail wears a quieter step of the same fill, its cell row pays a `row` floor,
   its kicker steps one alpha quieter while the owning kicker prints the foreground selection half, and only
   a six-cell rail folds (3+3); every other rail scrolls.
6. **Colour in `shell.css`** (owner, live): shell.css is GEOMETRY; the bracket's ember edge is painted on its
   own root from `border-primary/55` (the HUD band's own spelling), in every mode.
7. **Characters (commit 2):** the roster as built is SIX cells — Overview · Chats · Links · Look · History ·
   Trust (`features/character/lib/characters-section.tsx`, merged in cb-char-polish at `102d2d40a`); seat
   them in the chrome unchanged; DESIGN.md's five-tab table is corrected in that commit.

## 7. Pre-existing reds found in the lane's floor (not this lane's)

`tests/client/features/chat/lib/chats-section.ct.tsx` — "host sees the consolidated tabs", "HOST of a
group chat sees the Group behavior section", "host adds an injection", "host removes an injection": all four
assert a section BODY visible right after opening "This chat". #830 (`195085e2c`, 2026-08-30 05:59) made
every disclosure in that tab `CLOSED_BY_DEFAULT` (`settings-context-tab.tsx:150-151`,
`useChatContextSectionOpen`) and its `--stat` shows no change to this CT — the reds predate the bracket.
