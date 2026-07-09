# UI Polish Punchlist — layout · placement · hierarchy · polish

**Audit date:** 2026-07-05 (main @ f133379). **Status: COMMITTED program — ledger D62**
(`core/Core-Path-Registry-D62.md`); the D-ledger and the core `UI-*.md` law win on any conflict.
Tasks here slot into the `core/Core-BUILD-PLAN.md` Phase-6 lanes (L0–L6). Every task is a
VISUAL/LAYOUT task; the ONE sanctioned server touch in the whole program is J5's thin router
pass-through (see `ux-flow-revamp.md`).

**Companions:** [`ux-flow-revamp.md`](ux-flow-revamp.md) (UX/flow/IA redesign + NeoTavern parity map
+ build lanes — the punchlist's tasks slot into its lanes L0–L6) ·
[`design-enforcement.md`](design-enforcement.md) (how the bar gets locked in: law text, gates,
golden baselines, and rulings P1–P6 — ALL DECIDED 2026-07-05 under Nate's delegation; tasks below
cite them as settled).

> **Triage 2026-07-09 (dispatch board — `README.md` §0):** re-verified against code — the §0c
> reconciliation table below is ACCURATE; the program is LARGELY LANDED. Still open, and the ONLY
> dispatchable remainder: **UIP-404** (finish `SettingRow` row-grammar adoption across the settings
> panes) · **UIP-405** (account modal — deliberately blocked on auth #50) · §8's two slivers (the
> app-wide focus-ring audit; the streaming caret is VERIFY-LIVE, delegated to the markdown seal) ·
> §9's Presets/World-Info rail rows stay PENDING the presets-placement owner decision (build from
> `ux-flow-revamp.md` §3, not §9, when it settles). Do not re-execute a LANDED UIP.

## 0. How to work this list (read first, cold-read contract)

**The design spec is in-repo.** The Claude-Design mockup is a live React prototype at
`reference/design/neo-tavern/` — it is the POLISH target:

- `reference/design/neo-tavern/Neo-Tavern.html` + `nt-app.jsx` + `nt-ui.jsx` — the interactive
  mockup (chat "Manuscript" view, Corpus, Refinery, theme popover, ⌘K palette). Run it:
  `cd reference/design/neo-tavern && python3 -m http.server 4173` → open
  `http://localhost:4173/Neo-Tavern.html` (needs network for the unpkg React CDN).
- `reference/design/neo-tavern/shell.jsx` — the SHELL variants (Hearth desktop = rail + list +
  main + context; Loom = tabbed/IDE; Pocket = mobile bottom-tab). This is the LAYOUT-ANATOMY spec:
  `Rail`, `ListPanel`, `ContextPanel`, `Composer`, `Thread` show exactly what each region contains.
- `reference/design/neo-tavern/themes.css` — the CORRECTED token values (`.theme-hearth` block) and
  the component metrics (button heights, popover chrome, cmdk, corpus search pill).
- `reference/design/neo-tavern/nt-app.css` — app-layer metrics (btn 34px/28px, cmdk, theme popover,
  skeleton shimmer, streaming caret, typing dots).
- `reference/design/DESIGN.md` — the design-system doctrine (type scale, motion budget, elevation,
  the Weave restraint rule, the 8 component states).

**The COMPLETENESS reference** is NeoTavern at `reference/neo-tavern/` (the previous product).
Its shell registry `reference/neo-tavern/src/client/features/app-shell/registry/top-nav-registry.ts`
enumerates the surfaces a complete app exposes: Presets drawer · Connections · World info · Persona ·
Corpus hub · Settings (account+admin) · Characters drawer, plus chat surfaces (home landing, recent
chats, chat history, welcome hero, chat options menu, group create, message selection bar).

**Verify loop:** `bash scripts/dev/stack.sh start` once, then `pnpm snap <route> [flags]`
(headless screenshot + console/net report → `reports/snaps/<out>.png`). Useful idioms:
- `pnpm snap / --wide --out x` — 1920×1080 shot of the shell.
- `pnpm snap / --wide --click "[aria-label=Characters]" --out x` — interact before the shot.
- `pnpm snap / --viewport 390x844 --out x` — mobile.
- `pnpm snap / --text` — ARIA tree only, zero image tokens (cheapest check).
- Non-zero exit with `failed-req=N` still WROTE the PNG — read the RESULT line, not the exit code.

**Why snap diffs looked "the same" to the integration agent:** three of five rail sections render
the same generic `SectionPlaceholder` sparkle, all modals except Settings render the same
placeholder body, and the chat list renders skeletons forever on this dev DB (next paragraph) — most
routes genuinely look near-identical right now. Fix the placeholders' distinctiveness (§5, §6) and
snap comparisons become meaningful again.

**Dev-DB gotcha (blocks every populated screen):** the local `orbweaver.db` predates the
`characters.trust_html` column (commit f133379 regenerated `0000_baseline.sql` in place; the
migration journal already says "applied," so boot never adds the column). Every `chat.listChats` /
`character.list` read 500s, so lists sit on skeletons forever. Before doing visual work on populated
states, fix your local DB once:
`sqlite3 orbweaver.db "ALTER TABLE characters ADD COLUMN trust_html integer;"` (matches the shipped
baseline exactly), or rebuild from a fresh DB. This is a dev-box fix, not a repo change — but if the
regenerate-baseline-in-place workflow is going to continue, someone should ALSO ship a guard (boot
compares live schema against the baseline and fails loudly instead of 500ing per-query). Flag it to
Nate; do not silently invent a migration system.

**Composition law still applies to every task below:** features paint through `@orb/ui` primitives +
generated token utilities only (compose-only keystone); raw CSS/@media lives ONLY in the shell tier
(`packages/client/src/features/app-shell/surfaces/shell.css`) and in `@orb/ui` itself. Token changes
go through `packages/ui/src/tokens/tokens.json` → `pnpm --filter @orb/ui tokens:build` (theme.css is
GENERATED — never hand-edit). New primitives/variants belong in `packages/ui`, not in features.

**Ordering:** tasks are numbered in build order. P1 tokens (§1) land first — every later screenshot
comparison is against the corrected palette. Within a section, tasks are independent unless noted.

---

## 0b. Reconciliation — the build-state truth table (verified against code, 2026-07-09)

> The D62 lanes L0–L6 all LANDED (`Core-BUILD-PLAN.md` Phase-6 header carries the commits). **Do
> not re-execute a row marked LANDED — the code is now its doc.** This table is the ONE
> remaining-work picture for this program; the task prose below stays as the as-planned spec record.

| Task | State (2026-07-09) | Evidence / what remains |
|---|---|---|
| UIP-101 corrected Hearth palette | **LANDED** | `tokens.json` background `oklch(0.158 0.006 60)`, primary `oklch(0.72 0.175 52)`, `info` + `glow`/`shadow-overlay` tokens present |
| UIP-102 pointer-conditional density | **LANDED** | `tokens.json` `$extensions.orb.pointerFine` (control-sm 28px …) emitted under `@media (pointer: fine)` |
| UIP-103 micro-caps + mono voice | **LANDED** | `Text` `size="micro"` + `transform="caps"` (`text/variants.ts`); `--text-micro`/`--tracking-micro` tokens. The `SectionLabel`-primitive alternative was RULED OUT (Text variants only — ux-flow §4.3) |
| UIP-201 rail polish | **LANDED** | `rail-button.tsx`: tooltips on every button; active = `color-mix(primary 14%)`, not a slab |
| UIP-202 double title row | **LANDED** | `panel-chrome.tsx` drops the LIST text title; the route threads the identity header |
| UIP-203 topbar / ⌘K chip | **LANDED** | `@orb/ui` `kbd` primitive; `shell-topbar.tsx` renders the `<Kbd>⌘K</Kbd>` chip |
| UIP-204 context panel header | **LANDED** | `app-shell.tsx` `contextHeader?: ReactNode`, route-composed |
| UIP-205 document-scroll leak | **LANDED** | `shell.css` `overscroll-behavior: contain` on the scroll region |
| UIP-301 chat list rows | **LANDED** | `ListRow` + avatar + relative time (`chat-list-surface.tsx`) |
| UIP-302 New-chat → header `+` | **LANDED** | compact icon-button header row; the slab is gone |
| UIP-303 chat list search | **LANDED** | client-side filter + search `Input` in the list |
| UIP-304 thread column / prose | **LANDED** | `max-w-prose` centered column on document AND bubble (`message-row-variants.ts`) |
| UIP-305 hover-reveal actions | **LANDED** | `message-actions-reveal.ts` (dim → `group-hover`/focus reveal, `pointer-coarse` always-on) + the `messageActions` user pref |
| UIP-306 composer pill | **LANDED** | one rounded `focus-within` container, wand + speak-as inside, circular Send⇄Stop |
| UIP-307 cast bar + context tabs | **LANDED** | `TabsIndicator` skin; cast-bar `AddMemberPopover`; the raw `<button>Retry</button>` is gone |
| UIP-308 draft/empty welcome | **LANDED** | landing surface `EmptyState` + `WeaveGlyph anim` + action (the J1 landing subsumed the draft-void fix) |
| UIP-309 skeletons | **LANDED** | shape-matched rows + the `orb-skeleton-shimmer` sweep (reduced-motion static) |
| UIP-401 dialog chrome | **LANDED** | dialog `sm/md/lg/xl/full` variants, `bg-scrim backdrop-blur`, `--shadow-overlay` token |
| UIP-402 theme picker | **LANDED** | `features/settings/surfaces/theme-picker-surface.tsx` (real picker; placeholder gone) |
| UIP-403 ⌘K palette | **LANDED** | `features/chat/surfaces/command-palette-surface.tsx` |
| UIP-404 settings modal | **PARTIAL** | settings shell + USER/APP nav + Appearance pane LANDED, but the pane composes `Grid`/`Section`/`Stack` — the `SettingRow` row-grammar adoption is the OPEN remainder |
| UIP-405 account modal | **OPEN** | still `placeholder: true` (deliberate — blocked on the auth feature, task #50) |
| §5 distinct placeholders | **LANDED** | `section-placeholder-copy.ts` registry (distinct per-section copy, gate-paired) |
| §6 empty states + Weave | **LANDED** | `EmptyState` `action` + `decoration` slots; `WeaveGlyph` re-homed to `client/src/lib/` with `anim` |
| §7 mobile (bottom tabs, P3) | **LANDED** | `shell.css` bottom tab bar + `env(safe-area-inset-*)`; `index.html` `interactive-widget=resizes-content` |
| §8 micro-polish sweep | **PARTIAL** | LANDED: devtools FAB dev-gating, kbd chips, mono relative times. OPEN: `::selection` styling · thin themed scrollbars · the focus-ring audit · the streaming caret/typing-dots verification |
| §9 placement map | superseded / pending | `ux-flow-revamp.md` §3 is the richer, current map; §9's Presets/World-Info rail rows are **PENDING owner decision (presets→settings candidate)** — do not build from §9 |

---

## 1. Foundation — tokens (do FIRST; everything else is judged against this)

### UIP-101 · Adopt the corrected Hearth palette (P1)

`packages/ui/src/tokens/tokens.json` still carries the SEED palette from `reference/design/DESIGN.md`
(frontmatter says `seed: true — re-derive real tokens once code lands`; that re-derive never
happened). The mockup runs the CORRECTED palette (`reference/design/neo-tavern/themes.css`
`.theme-hearth`), whose whole point is written in `shell.jsx`'s PaletteBoard: *"Near-neutral charcoal
base (chroma ~0.006) so one glowing Ember reads as intentional. No more monochrome brown."* The app
currently reads muddy-brown because every neutral carries chroma 0.012–0.02 at hue 65.

Change (tokens.json → rebuild): retune the neutral ramp to chroma ≤0.009 at hue 60, deepen the
sidebar, and swap Ember to the richer value. Key values from the corrected block:

| token | current (seed) | corrected (mockup) |
|---|---|---|
| background | `oklch(0.175 0.012 65)` | `oklch(0.158 0.006 60)` |
| card | `oklch(0.205 0.012 65)` | `oklch(0.205 0.006 60)` |
| popover | `oklch(0.235 0.013 65)` | `oklch(0.245 0.007 60)` |
| secondary / muted | `0.255 0.012–0.014 65` | `oklch(0.255 0.006–0.007 60)` |
| accent | `oklch(0.285 0.02 65)` | `oklch(0.285 0.009 60)` |
| primary (Ember) | `oklch(0.76 0.145 66)` | `oklch(0.72 0.175 52)` |
| primary-foreground | `oklch(0.18 0.02 65)` | `oklch(0.19 0.03 50)` |
| ring | = primary | = new primary |
| border | `oklch(0.97 0.01 75 / 0.09)` | `oklch(0.99 0.005 60 / 0.08)` |
| input | `…/ 0.13` | `oklch(0.99 0.005 60 / 0.12)` |
| sidebar | `oklch(0.15 0.011 65)` | `oklch(0.132 0.006 60)` |
| sidebar-border | `…/ 0.08` | `oklch(0.99 0.005 60 / 0.07)` |
| foreground | `oklch(0.95 0.006 75)` | `oklch(0.955 0.004 75)` |
| muted-foreground | `oklch(0.71 0.013 68)` | `oklch(0.705 0.008 65)` |

Carry the same chroma-neutralization through the bubble tokens (`user-bubble`, `ai-bubble`,
`system-bubble` — keep their RELATIVE lightness steps) and `sidebar-accent`/`sidebar-foreground`.
Add the two tokens the mockup has that we lack: `--color-info: oklch(0.70 0.10 232)` and a `--glow`
shadow token (`0 0 0 1px <ember>/.4, 0 0 18px <ember>/.18`) for the ONE rationed glow moment
(DESIGN.md §5). Keep AA: muted-foreground on background must stay ≥4.5:1 — check before sealing.

Verify: `pnpm --filter @orb/ui tokens:build && pnpm snap / --wide --out tokens-after` — the app
should read neutral-charcoal with ember accents, not brown-on-brown.

### UIP-102 · Desktop control density (P1 — **RULED**, see design-enforcement.md §2)

Every control is 44–56px tall because `spacing.control-sm` (2.75rem) is pinned to the UNCONDITIONAL
≥44px touch floor (tokens.json `$description`, D43 §4b axis 3, gate `touch-target-floor`). The
mockup's desktop controls are 34px base / 28px sm (`nt-app.css .nt-btn`), and its list rows,
composer, and topbar all assume that scale — this single constant is most of why the app feels like
a stretched tablet UI on desktop.

**RULING (P1, decided 2026-07-05 under Nate's delegation): pointer-conditional floor.** The ≥44px
floor holds at `@media (pointer: coarse)`; fine pointers get `control-sm` 28px · `control-md` 34px
· `control-lg` 40px · icon 34px. Implement at the TOKEN layer only (coarse-first values + a
`pointer: fine` override block emitted alongside the theme — the §4b axis-3 sanctioned site);
features never branch. Same commit must: update the two `$description` strings in `tokens.json` and
re-scope the `touch-target-floor` gate to assert per-pointer (one coarse-emulated CT pass). The
D-ledger row (D62) + the §4b axis-3 law amendment already LANDED 2026-07-05.

Deliverable: desktop chat-list rows ≈56–64px total (avatar row, see UIP-301), buttons 34px, icon
buttons 34px, composer input ≈40px min-height. Touch targets on coarse pointers unchanged.

### UIP-103 · Type + micro-label voice (P2)

The mockup leans on two type devices the app never uses: (1) uppercase letterspaced micro-labels
(10.5px, weight 600, `letter-spacing .08em`) for section headers ("SCORES", "CRITICAL ISSUES",
cmdk group headers, panel titles), and (2) `Geist Mono` for data accents (scores `0.94`, token
counts, kbd chips, timestamps). Add to `@orb/ui`: a `Text` variant (`size="micro"` +
`transform="caps"` — ~~or a dedicated `SectionLabel` primitive~~ RULED OUT 2026-07-05: Text
variants only, no wrapper primitive, ux-flow §4.3) and use
the existing mono font token for data accents. Adopt in: panel-chrome headers, context-panel tab
labels, settings section headers, cmdk group headers, cast-bar label. This one primitive is the
single highest-leverage "looks designed" move after the palette.

---

## 2. Shell chrome (`packages/client/src/features/app-shell/`)

Reference anatomy: `shell.jsx` `ShellHearth` (rail → list panel → main → context panel) and the
audit snaps (`reports/snaps/audit-*.png`, regenerate per §0).

### UIP-201 · Rail polish (P2) — `components/rail.tsx`, `components/rail-button.tsx`, `shell.css`

Current: brand glyph crowds the top, active section is a filled orange square, footer stacks two
icons + avatar with the same cramped gap. Mockup rail (`shell.jsx Rail`, `themes.css .nt-rail*`):
- Brand: Weave glyph alone, comfortable block padding, muted-foreground color, NO active/hover box.
- **P1 is RULED** (design-enforcement.md §2 — pointer-conditional floor): the sub-44px sizes in
  this task are the FINE-pointer scale; they ship with (or after) UIP-102's token-layer change,
  never before it — until that lands the 44px floor is still what the gate asserts.
- Rail buttons: 36–40px, `radius-base`, default `--muted-foreground`; hover = `--sidebar-accent` bg +
  foreground; active = `color-mix(primary 14%, transparent)` bg + primary icon (NOT a solid primary
  slab). Tooltips (@orb/ui tooltip) with the section label on every button — they exist as
  aria-labels today but no visible tooltip.
- Footer order: spacer → theme → settings → 30px avatar; give the avatar `--spacing-row` top margin
  so it doesn't fuse with the settings icon. NOTE: this avatar is a BUTTON (opens the account
  modal) — per the P1 ruling it needs 30px visual inside a coarse-pointer ≥44px hit area (fine
  pointers: the visual box is the hit box).
- Focus: `focus-visible` ring 2px `--color-ring` offset 2 (never a filled state as focus).

### UIP-202 · Kill the double title row (P1 — worst single layout smell)

Every section currently shows its name THREE times in the top 50px: the list panel-chrome header
("Chats" + collapse icon), the topbar title ("Chats"), and (Characters) the list's own search
context. Mockup shows the section name ONCE.

Change: `PanelChrome` (`components/panel-chrome.tsx`) drops its text title for the LIST panel — the
list surface's own header (New-chat/search row, UIP-301) becomes the panel header content; keep the
collapse affordance but move it INTO that row (right-aligned icon button). The topbar keeps the
title ONLY when it has nothing better: for the Chats section the topbar should show the ACTIVE CHAT
identity (avatar + chat title + scene/participants chip — the mockup's `nt-topbar`), falling back to
the section name for a draft/none. `ShellTopbar` already accepts a `header` ReactNode — the route
(`routes/home-page.tsx`) composes the chat-identity header there; shell stays domain-agnostic.

### UIP-203 · Topbar affordance cleanup (P2) — `components/shell-topbar.tsx`

- The ⌘K trigger currently renders icon + "⌘K" text mid-bar and reads as two mystery glyphs
  (audit-home.png top right). Restyle as the mockup's jump chip (`.nt-ms-cmd`): a bordered pill,
  `kbd`-styled "⌘K" + "jump" label, muted until hover. Needs a small `Kbd` primitive at
  `packages/ui/src/primitives/kbd/` (mono 10.5px, `--accent` bg, 4px radius) — MUST live under
  `primitives/` (not `content/`) so the `ui-primitive-structure` gate + CT contract cover it. Also
  used by the cmdk footer (UIP-403).
- Focus-mode (Expand/Shrink) and panel toggles: fine as icons, but group order should be
  [list-toggle | title/identity] … [⌘K chip | focus | context-toggle], and all four icon buttons
  need tooltips.
- Height: 3rem is right; keep. Border-bottom stays `--color-border`.

### UIP-204 · Context (Details) panel header + placeholder (P2) — `panel-chrome.tsx`, `app-shell.tsx`

"Details" as a permanent right-panel title is filler. When a committed chat is active the panel
should be headed by the chat's subject (the mockup ContextPanel leads with the character hero
avatar + name + "seen in N threads" subline — our equivalent: chat title + participant avatars).
Concretely: give `AppShellProps` an optional `contextHeader` ReactNode (route-composed, like
`header`), falling back to "Details". The empty placeholder ("Select something to see its details
here.") is correct behavior but should use the Weave-styled empty state (UIP-601), not the sparkle.

### UIP-205 · Document-scroll leak (P2 bug) — reproduce, then fix at the shell tier

`pnpm snap / --wide --click "[aria-label='Start a new chat']" --out x` captures the page shifted
~56px left: the RAIL is scrolled out of the viewport and the context panel edge is clipped
(see audit-draft-chat.png / audit-command-modal.png). Something (focus scroll on click / Base UI
focus management) scrolls the DOCUMENT despite `.shell-grid{overflow:hidden}`. Fix in shell.css
(e.g. `html,body{overflow:hidden}` for the app root via `packages/client/src/styles/globals.css`,
or `overscroll-behavior` + `scroll-margin` on the offender) — find the actual scroller with
devtools first; do not guess. Every future snap depends on this being stable.

---

## 3. Chat surfaces (`packages/client/src/features/chat/`)

### UIP-301 · Chat list rows (P1) — `surfaces/chat-list-surface.tsx`

Current row = a Card holding title + participant names, no avatar, no timestamp, no unread/last
line; selected state is only `data-selected`/`aria-pressed` with (verify) barely-visible styling.
Mockup row (`shell.jsx ListPanel` + `themes.css .nt-convo*`): 34px avatar · name (semibold, truncate)
· last-message line (12px muted, truncate) · right-aligned relative time (11px muted). Active row =
`color-mix(primary 10-14%, transparent)` bg; hover = `--sidebar-accent`. Padding ~10px block, radius
`--radius-base`, gap `--spacing-row`.

Server gives `ChatSummary` — check what it carries; if `lastMessageAt`/preview text aren't on the
wire, do the VISUAL row now (avatar from first participant via `@orb/ui/avatar` initials; time from
`updatedAt` if present) and leave a one-line TODO citing the summary shape, don't invent a read.
Also: rows must render a body even when data is thin — "Untitled chat" + "No characters" is already
handled; keep it.

### UIP-302 · "New chat" button → list-header row (P1) — same file

The full-width primary slab dominates the panel (audit-home.png). Mockup pattern
(`ListPanel` header): a row with the panel title ("Chats", micro-caps per UIP-103) + a compact
ghost icon-button `+` (tooltip "New chat"; 28px visual — the fine-pointer `control-sm` from the
P1 ruling; the mockup's 26px is below even its own scale, don't copy it; rides UIP-102's tokens),
then the search field UNDER it. Demote the button to that
icon affordance; if a text button is kept for empty-state, put it in the EmptyState action slot
(UIP-601). This also resolves the panel-header duplication (UIP-202).

### UIP-303 · Chat list search (P2) — same file

Chats list has no search; Characters list does. Add the same deferred-value client-side filter over
the loaded summaries (title + participant names — `filterCharacters` in
`features/character/lib/filter-characters.ts` is the pattern to mirror, feature-locally). Input
styling per mockup `.nt-search`: pill-ish, `--color-input` bg, search icon, "Search the weave…"
placeholder voice.

### UIP-304 · Message thread column + prose polish (P1) —
`surfaces/message-list-surface.tsx`, `lib/message-row-variants.ts`, `components/message-content.tsx`

The transcript hugs the full content width. The mockup's chat (BOTH bubble-ish Hearth and the
Manuscript direction) caps the reading column and centers it: `.nt-ms-col` = `max-width: 680px`,
centered, generous block padding (28px top). Do this at the SKIN layer (`message-row-variants.ts`):
- `document`: already `items-center max-w-prose` — audit `max-w-prose` (Tailwind default 65ch —
  right), add the top/bottom breathing room via the list's existing `gapToken`/padding.
- `bubble`: bubbles should still live inside a centered ≤ ~48rem (`--container-cq-lg`) column, not
  span a 1920px viewport (user right / assistant left INSIDE that column).
- `flat`: full-width is the point, keep, but pad `px-section` not `px-block`.
Also verify the speaker-name treatment: mockup speaker label = 11px caps-ish primary-colored for
characters, muted for "You" (`.nt-speaker` / message `.nt-who`); ours is `size="label"` muted for
everyone — color the character name with the attribution ThemeScope accent (the tokens already
thread through `attribution.tokens`) so speakers are scannable. Narration/italic `*text*` renders
as `--color-narration` italic (verify `message-content.tsx` maps `em` to the narration token in
untrusted markdown; if not, add it to the markdown skin in `@orb/ui/markdown`).

### UIP-305 · Message actions row → hover-reveal (P1) — `components/message-actions-row.tsx`

Five always-visible buttons under EVERY message (Edit/Hide/Delete/Fork/Copy) is the single loudest
clutter source in a populated thread; the file's own header even says "a later appearance-pref task
may collapse this to hover/expanded chrome." That task is now: default the cluster to
opacity-0/pointer-events-none, reveal on row hover AND on `:focus-within` (keyboard parity — the
gate-relevant part), always-visible on touch/`pointer: coarse`. Buttons become icon-size ghost
(UIP-102 scale), `--muted-foreground` → foreground on hover, destructive stays destructive-on-hover
only. Group them right-aligned under the bubble edge like the mockup's quiet metadata voice, not a
full-width toolbar.

### UIP-306 · Composer (P1) — `components/composer.tsx`, `components/composer-wand.tsx`,
`components/speak-as-select.tsx`

Current: edge-to-edge footer Card; textarea with visible resize grabber; wand + speak-as sit
OUTSIDE the input box bottom-aligned; send is a filled orange square. Mockup
(`nt-app.jsx` ChatView composer + `shell.jsx Composer`): ONE rounded input container
(`--radius-card`+, `--color-input`/card bg, border) holding [textarea grows | attach/wand icon
buttons | circular send]. Spec:
- Wrap textarea + trailing icon cluster in one bordered rounded container; container gets the
  focus ring (`:focus-within`), textarea itself borderless/resize-none with auto-grow (rows=1,
  max ~8 rows then scroll).
- Wand + speak-as move INSIDE the container as leading/trailing ghost icon buttons, vertically
  CENTERED against a single-line input (not `align="end"` against the whole card).
- Send: circular (radius-full) primary icon button, disabled at 50% opacity; morphs to the Stop
  square in-place (already does — keep that slot stable so the container doesn't reflow).
- Column: same centered ≤48rem column as the thread (UIP-304) so input aligns with prose.
- Placeholder voice: draft = "Write the scene, or type a message…"; committed keeps the
  continue-eligible variant. (Mockup: "Write Wren's next beat, or narrate the scene…" — when the
  roster is known, use the lead character's first name.)

### UIP-307 · Cast bar + context tabs polish (P2) — `components/chat-cast-bar.tsx`,
`surfaces/chat-context-panel-surface.tsx`

Unverifiable in snaps until the DB fix (§0); code-level spec: cast bar avatars 24–28px overlapping
(-8px margin chain) + names as muted labels, container = one quiet strip (`--color-card` bg,
radius-card, `px-block py-field`) — glance chrome, not a toolbar. Context tabs (Overrides · Preview
· Injections · Roster): tab labels via UIP-103 micro-caps, `TabsIndicator` = 2px primary underline,
panel body padding `--spacing-block`, forms per UIP-501 field rhythm. The QueryBoundary fallback
currently renders a bare `<button>Retry</button>` (raw intrinsic inside a compose-only feature —
also just ugly): swap to `@orb/ui/button` ghost sm, same pattern as the other ErrorStates.

### UIP-308 · Draft/empty thread → real welcome (P1) — `surfaces/message-list-surface.tsx`
(`EmptyThread`), route composition in `routes/home-page.tsx`

"No messages yet." centered in a black void is the first thing a user sees (audit-home.png). Two
distinct states, both currently the same string:
- DRAFT (new chat, no character): this should TEACH the flow — Weave-glyph empty state (UIP-601),
  title "Start a new thread", description pointing at picking a character, and a real action button
  (go to Characters section: `setActiveSection("characters")` — the store action already exists).
  NeoTavern's `welcome-assistant-hero.tsx` / `new-chat-surface.tsx` are the completeness precedent.
- COMMITTED chat with zero messages: keep quiet — first-greeting affordance belongs to the
  greeting/generate-opening flow when that feature lands; a muted "The scene is unwritten." +
  composer focus is enough for now.

### UIP-309 · Loading skeletons — shape-match + shimmer (P3) — `chat-list-surface.tsx`
(`LoadingRows`), `message-list-surface.tsx` (`LoadingRows`), `@orb/ui/skeleton`

Chat-list skeletons are five full-width `h-control-lg` slabs — they don't match the row shape they
stand in for (and on this broken DB they ARE the UI). Shape-match: avatar circle + two text lines
per row, 5 rows. Thread skeleton: 3 message-shaped blocks (speaker line + 2 prose lines).
`DESIGN.md` wants the spider-silk shimmer: add the mockup's shimmer treatment
(`nt-app.css .nt-skel` — 90deg accent/muted gradient sweep, 1.3s) as the Skeleton primitive's
animation (respect `prefers-reduced-motion`).

---

## 4. Modals (`features/app-shell/lib/modal-slots.tsx`, `@orb/ui` dialog)

### UIP-401 · Shared dialog chrome (P2)

All modals render as one mid-grey rounded box, plain title row, no footer structure
(audit-settings-modal.png). Bring the dialog primitive to the mockup's popover grammar
(`.nt-cmdk` / `.nt-themepop`): `--color-popover` bg, 1px `--color-border`, `--radius-card`, real
shadow via a NEW `--shadow-overlay` token minted in `tokens.json` beside UIP-101's `--glow`
(target value ≈ the mockup's `0 24px 80px` black-at-50% — but as a raw literal it trips the LIVE
`no-color-literals` gate, so tokenize first), backdrop `--color-scrim` + `backdrop-blur(4px)`, enter
animation 160ms pop (opacity + 6px rise, reduced-motion fallback). Width discipline: sm 400 / md 560
/ lg 720 clamp variants instead of one free size. Header: title (Display scale) + ghost close;
body scrolls; optional footer row right-aligns actions.

### UIP-402 · Theme modal → theme PICKER (P2) — surface owned by `features/settings`, route-composed

Currently the placeholder ("Palette switching lands with the D44 theme editor"). Even before the
D44 editor exists, the mockup's `ThemePopover` (nt-app.jsx) is a shippable INTERACTION stopgap —
but the option SET is already law: UI-Theming §12.1 decides **Hearth (active) · Mocha · Light
(deferred)**, NOT the mockup's Catppuccin/Loom names ("Loom" is the CUT structural mode's name —
never reuse it for a palette). Ship the picker with Hearth active and Mocha/Light as
disabled-with-tooltip slots. Each option = swatch chip (bg + accent dot) + name + desc + check,
active = primary-14% row. WIRING: the surface lives in `features/settings`; the ROUTE composes it
into the modal via `AppShellProps.modals` (`home-page.tsx` `settings` slot is the live pattern) —
do NOT hardcode bodies into app-shell's `modal-slots.tsx` (see `ux-flow-revamp.md` J8). Do NOT
wire a fake toggle that no-ops silently.

### UIP-403 · ⌘K command palette (P2) — surface in `features/chat`, route-composed

Placeholder today. The mockup's `CommandPalette` (nt-app.jsx) is the exact spec and the app already
has the data + actions to honor it: sections "Threads" (chat.listChats → selectChat), "Go to" (rail
sections → setActiveSection), "Create" (New thread → the J2 picker). Anatomy: top-aligned (14vh),
560px, search input row + `esc` kbd; grouped list, selected = primary-14% bg + primary icon;
footer kbd hints (↑↓ / ↵ / esc). Compose over the `@orb/ui` `command` primitive (cmdk seal —
already built). WIRING + surface home: `ux-flow-revamp.md` J4 is authoritative
(`features/chat/surfaces/command-palette-surface.tsx`, route-composed via
`modals={{command: …}}`); ⌘K/topbar already open the slot.

### UIP-404 · Settings modal layout (P2) — `features/settings/…appearance-settings-surface`

Content exists but reads as a raw form dump: cramped section gaps, full-width selects, a lone
unlabeled-row toggle (audit-settings-modal.png). Restructure: every setting becomes a
`packages/ui/src/primitives/setting-row/` row (label + description left, control right, control
column ~200px), section headers per UIP-103 with `--spacing-section` separation and a hairline
divider, selects sized to content not 100%, the toggle in the same row grammar. Keep autosave
(the "Changes save automatically" line moves to a muted footnote under the title).

**End-state shape (Nate's call, 2026-07-05):** settings grows into a FULL-BLEED overlay with a
left category nav — USER (Account · Personas · Appearance · Chat behavior) / APP (Connections ·
Automation · System · Admin) — generation/preset config stays OUT (it's the Presets rail
section). Full spec + steps: `ux-flow-revamp.md` J11. This task's row-grammar work is the first
pane of that shell and carries over unchanged.

### UIP-405 · Account modal (P3) — surface route-composed into the `account` slot

Placeholder. Minimum honest content until auth (#50): avatar + display name + AUTH_MODE badge, and
the sign-out affordance disabled-with-reason. Same wiring rule as UIP-402/403: route composes the
body via `AppShellProps.modals`; `modal-slots.tsx` keeps only placeholder defaults. Low priority;
skip if #50 lands first.

---

## 5. Section placeholders — make unbuilt ≠ identical (P2)

`components/section-placeholder.tsx` renders the same sparkle + "isn't wired yet" for Corpus list,
Corpus content, Refinery, Analytics, and non-settings modals — five surfaces, one look
(audit-corpus.png ≡ audit-refinery.png ≡ audit-analytics.png). The mockup's Analytics view shows
the pattern for an honest-but-branded placeholder (`nt-app.jsx AnalyticsView`): animated Weave
glyph (72px), section title, one sentence of WHAT WILL LIVE HERE. Give each rail section its
placeholder copy + its own icon (rail-slots already has them): Corpus → "Search across every
thread, character, and scene — the web, searchable."; Refinery → "Score → rewrite → analyze a
character card without drifting from your original."; Analytics → "Charts over your corpus land
here — cast time, thread connections, drift." Description text belongs in the ROUTE/section config
(one map in `home-page.tsx` or alongside RAIL_SECTIONS), not hardcoded per-surface.

## 6. Empty states + the Weave (P2)

`DESIGN.md` §2: empty states are one of the Weave's THREE sanctioned homes; at most one Weave
moment per screen. There is a `weave-glyph.tsx` in app-shell (used by the rail brand?) — verify,
then: extend `@orb/ui/empty-state` with an optional decorative slot the client fills with
`<WeaveGlyph s={72} anim>` (silk-shimmer polygon per `shell.jsx WeaveGlyph` + `nt-silk-anim`), used
by UIP-308 (draft welcome), UIP-204 (details placeholder), §5 placeholders, and the character
library's no-results state. Keep the glyph mono/current-color so it re-themes for free. EmptyState
also needs an ACTION slot (primary or ghost button) — half these states teach a next step.

## 7. Pocket / mobile (P2 — one @media, all in `shell.css`)

> **RULING HISTORY:** §4.1 recorded mobile = TOP tab bar as Nate's earlier call; on 2026-07-05
> Nate delegated remaining decisions ("Discord as a guide") and ruling **P3
> (design-enforcement.md §2) re-decides it: BOTTOM tab bar** — thumb ergonomics + Discord mobile +
> the Pocket mockup all converge there. §4.1's `MOBILE:` line was AMENDED with the D62 fold
> (2026-07-05); desktop work proceeds regardless of when the mobile lane runs.

Current mobile (audit-mobile-home.png): the rail reflows to a TOP icon strip (the pre-P3 shape),
the default state opens the LIST sheet over CONTENT (you land on a menu, not a conversation), and
sheets have no visible dismiss affordance. Deliverable (structure only, one @media in
`shell.css`): rail strip moves to a BOTTOM tab bar — **Chats · Characters · Corpus · You** (You =
account/settings sheet; other sections reachable via ⌘K and the You sheet), 21px icons + 10px
labels, active = primary, `env(safe-area-inset-bottom)` padding; default mobile state = CONTENT
(list collapsed); sheets slide with a visible close affordance; verify
`interactive-widget=resizes-content` is set in `packages/client/index.html` and all four
`env(safe-area-inset-*)` are applied (§4b axis 4). Full mobile journey spec: `ux-flow-revamp.md`
J12. Anything deeper (per-section mobile layouts) is future feature work.

## 8. Micro-polish sweep (P3 — batchable into one lane)

- **Selection color:** `::selection { background: --color-primary; color: --color-primary-foreground }`
  (mockup nt-app.css) — `packages/ui/src/styles/globals.css`.
- **Scrollbars:** thin overlay scrollbars on the neutral ramp (DESIGN.md §6 "scrollbars … → the
  neutral ramp") — ui globals.
- **Focus rings:** audit that EVERY interactive in @orb/ui uses ring 2px offset 2 (`--color-ring`)
  and none rely on default outline or none.
- **Streaming chrome:** ghost row caret = 2px primary blinking block (`.nt-caret`), typing = three
  6px bobbing dots (`.nt-typing`) — `components/ghost-message-row.tsx`; reduced-motion: static.
- **kbd chips:** the `Kbd` primitive from UIP-203 reused in cmdk footer + any shortcut hint.
- **Relative times:** chat list / message timestamps in the mono accent voice (UIP-103); probe mode
  already freezes them for snaps (`lib/probe-mode.ts`).
- **Devtools bubble:** the TanStack devtools FAB sits over the send button in every snap
  (`main.tsx` mounts it in dev). Gate it behind a localStorage flag (default OFF in probe mode) or
  teach snap to `--mask` it by default — either way snaps stop shipping a palm tree.
- **Empty CSS check:** after any batch, run `pnpm snap / --wide` and read the `deadcss` field —
  it's the cheap regression net for typo'd token utilities.

## 9. NeoTavern-completeness placement map (layout homes, NOT build orders)

> **2026-07-09:** `ux-flow-revamp.md` §3 is the richer, current placement map — prefer it. The
> Presets/sampler and World-info RAIL-SECTION rows below are **PENDING owner decision
> (presets→settings candidate)** — do not build from them until the ledger settles it.

The features below have no client surface yet (`packages/client/src/features/<f>/` is a .gitkeep).
When each lands, its LAYOUT HOME is already decided by the shell grammar — record here so nothing
invents a new region:

| Feature (NeoTavern precedent) | Orbweaver home |
|---|---|
| Persona picker/editor (`persona` modal) | Rail-adjacent MODAL slot (add to `RAIL_ACTIONS` or account modal section) + composer speak-as already exists |
| Presets / sampler + prompt-manager (left drawer) | New rail SECTION (`rail-slots.ts` entry) — LIST = preset list, CONTENT = editor |
| Connections / credentials (`connections` modal) | Settings modal SECTION (settings-surface composition, like NeoTavern's settings absorbing account/admin) |
| World info | Rail SECTION (LIST = books, CONTENT = entry editor); per-chat activation lives in the chat CONTEXT panel as a tab |
| Corpus hub (search + insights + stats) | Already a rail section; content = the mockup `CorpusView` (search pill + results left / thread-web graph right) |
| Chat history / recent chats / similar chats | Chats LIST panel (history = the list; similar-chats = context-panel tab) |
| Group create / add-character | Modal from the Characters LIST + cast bar `+` affordance |
| Message selection bar (bulk ops) | A topbar TAKEOVER state above CONTENT (NeoTavern `message-selection-bar.tsx`) |
| User admin | Stays on `/admin` route (exists) — link from Settings when AUTH_MODE ≠ single-user |

---

## Appendix — audit evidence (regenerable)

- App snaps: `pnpm snap …` per §0 → `reports/snaps/audit-{home,characters,corpus,refinery,analytics,theme-modal,settings-modal,account-modal,command-modal,login,mobile-home,draft-chat}.png`
- Mockup snaps: serve `reference/design/neo-tavern/` (§0) and screenshot views `chat/corpus/refine/chart`,
  the ⌘K palette, and the theme popover at 1600×950.
- Login page (`routes/login-page.tsx`) is a bare "sign in / auth isn't wired yet" — intentionally out
  of scope until #50; leave it honest.
