---
kind: history
status: superseded
updated: 2026-07-13
---

> **PROVENANCE RECORD (D66).** The verbatim Claude-Design handoff that seeded the UI-cohesion program (byte-exact as delivered). SUPERSEDED by `../proposed/ui-cohesion-north-star.md` — the code-verified distillation that corrects this doc's wrong guesses and is the only buildable spec. Do not build from this file.

# OrbWeaver — UI Cohesion Handoff

**For:** the implementation agent (Fable) working in the OrbWeaver repo.
**Goal:** make Rail · List · Content · Context read as **one** frame. Fix hierarchy, alignment, button overload, and text density — without inventing anything. Everything below references primitives and tokens that already exist in `@orb/ui`.
**Governing law:** this doc is an amendment to the existing spec set, not a parallel one — `docs/architecture/core/UI-Architecture-and-Layout.md` (§1 cake · §2 `@orb/ui` one-home · §3 DTCG tokens · §4/§4b container model + the four responsive axes · §4a WCAG 2.2 AA baseline · §8 gate registry) and `UI-Theming-and-Content.md` §12.x (D44) win on any conflict. Every task below is written to stay inside those laws.

---

## 0. Ground rules (read first — these prevent drift)

1. **No new tokens; token EDITS go through DTCG.** Every color/space/size/radius must be an existing custom property from the generated `@theme` (`ui/src/styles/theme.css`). That file is **GENERATED from `ui/src/tokens/tokens.json`** (`pnpm --filter @orb/ui tokens:build`; freshness is test-enforced) — **never hand-edit `theme.css`**. Where a task below sanctions a token change (PP1/PP4/PP5), the edit is to `tokens.json` + regenerate. If you reach for a raw `oklch()`/`px`/`rem` literal in a feature, stop — there is already a token for it. The full set in play is in §6.
   1b. **Hand-written CSS rules are legal in exactly ONE file:** `client/src/features/app-shell/surfaces/shell.css` (the shell tier — the one sanctioned painter). Every other change is Tailwind token utilities inside a `variants.ts`/`tv()` skin or inline via the layout primitives. No new `.css` files, no additions to any other stylesheet.
2. **No new primitives or variants.** Use `Button`, `ListRow`, `Field`, `Tabs`, `Input`, `Text`, `Row`/`Stack`, `Badge`, `Avatar` as they exist. If a task seems to need a new `Button` intent or a new component, **flag it in the PR, do not add it silently.**
3. **Features compose, never paint.** No `className`/`style` on raw `<div>` in a feature. The shell tier (`shell.css` + `app-shell/`) is the only painter. This is existing law — keep it.
4. **The accent is rationed.** `--color-primary` (ember) is for **one** thing per surface: the single primary action or the single active indicator. DESIGN.md's "accent ≤10% of viewport" is the budget. Most of the fixes below are literally *removing* ember from places it shouldn't be.
5. **Each task is independent and has a "Done when".** Ship them as separate commits. Don't refactor beyond the task's scope.
6. **The appearance system is law.** OrbWeaver has a large user-tunable appearance surface (§2b). No task may hardcode away an axis (e.g. "actions show on hover" must respect the `messageActions` pref; "add a hairline" must respect `elevation=ramp` dropping hairlines). When a task touches a surface an axis styles, the fix goes in the SHARED base that all modes inherit — never a per-mode fork, and never by deleting a mode.

---

## 1. The six principles (the "vibe" — every task serves one of these)

**P1 — One chrome baseline.** Rail brand, List header, Content topbar, and Context header all occupy the **same** top band (`--dimension-chrome-row`), with the **same** hairline and the **same** inline padding. Right now the List panel has no header band, so its title floats above everyone else's baseline. Fix that and the four panes lock to one horizon.

**P2 — One primary per surface.** Each pane has at most one ember action. List owns **New**. Composer owns **Send**. Content header is view-only. Everything else is `secondary` (bordered) or `ghost` (muted). See the ownership map in §2.

**P3 — Hover-reveal density.** Per-row and per-message action clusters rest **hidden** (or as a single `⋯`) and appear on hover/`focus-within`. Kill every always-on icon row. The message row already has a hover-reveal mechanism (`lib/message-actions-reveal.ts`) — it's just not being used to actually hide them.

**P4 — Content ↔ Context binding.** The Context panel must read as "the detail of the thing in Content," not a generic drawer. Its header carries the **active entity's** avatar + name (not the word "Details"), it gets a 1px ember **top edge**, and its active tab indicator is ember. Empty states name the entity ("Pick a field on **JFC**…").

**P5 — Quiet metadata.** Token counts appear in exactly **one** place per surface. Timestamps are inline micro text (`--text-micro`, `--font-mono`, `--color-muted-foreground`) — **no pills, no clock icon.** Per-field helper sentences collapse to one intro line + a `?` tooltip.

**P6 — One field & row anatomy.** Every "editable field with a label" is the `Field` primitive. Every "entity in a list" is `ListRow`. Save/Set/Discard follow one model app-wide (§5).

---

## 2. Action-ownership map (the dedupe table)

The core complaint — "the same action lives in Content **and** Context **and** List." Assign each action exactly one home and delete the copies.

| Action | The ONE owner | Delete / demote from |
| - | - | - |
| Create (New chat / New character / New preset) | **List header**, single `primary` button | landing hero duplicate, any content-area "+" |
| Save / Discard changes | **Content header**, sticky right; autosave everywhere (badge, not button) — see §5 | per-field "Set" buttons, "Save preset" naming |
| Per-entity manage (Duplicate · Archive · Export · Convert · Delete) | **List-row `⋯`** (hover-revealed) | Content-header duplicate; keep **one** mirror in Context header `⋯` only if the row isn't visible |
| Message actions (edit · fork · hide · copy · delete) | **Message row**, hover cluster: `edit` + `fork` inline, rest under `⋯` | the always-on 5-icon strip |
| Member controls (mute · force-turn · kebab) | **Context → Members** rows, hover `⋯` | any duplication; topbar chip is entry-only |
| Members entry point | **Topbar member-count chip** → *opens* Context + selects Members tab (never a toggle) | — |
| Field detail (Description, Scenario…) | **Context → Field** tab (drill-in) | the per-row "Set" button becomes inline expand |
| Section actions (Duplicate · Move · Delete in preset Context) | **one `⋯`** in the section header | the three-button row at panel bottom |

**Done when:** for any action, there is exactly one clickable affordance on screen at a time (a hover `⋯` mirror in a menu is fine; a second always-visible button is not).

---

## 2b. The appearance system — axes every task must keep working

Source of truth: `contracts/settings` `AppearanceSettings` + `features/settings/surfaces/appearance-settings-surface.tsx` (the no-dead-toggles surface) + `features/chat/lib/message-row-variants.ts` (the 8-skin table). Inventory:

- **chatStyle (8 skins, one MessageRow):** `bubble` · `flat` (full-width, section-padded) · `document` (centered manuscript, `--color-prose-body`) · `echo` (character portrait bled into the bubble edge, feather = `--immersive-echo-feather`, text padding-right rides the SAME token — a reading-geometry contract) · `whisper` (3:1 banner `headerBand` above the text + speaker top stripe) · `hush` (flat + `--immersive-stripe-width` speaker stripe) · `ripple` (VN sticky 2:3 portrait welded into the bubble, `--immersive-ripple-portrait-width`) · `tide` (per-paragraph bubble trains). All skins are data in `MESSAGE_ROW_SKINS` — message-row\.tsx never branches on style.
- **Avatars:** `showInChatAvatars`, `avatarSize sm/md/lg`, `avatarShape round/square/rounded`, `avatarAspect square/portrait(2:3)`, `avatarRing none/accent`.
- **Surfaces:** `elevation flat/ramp/glow` (ramp lifts panels to `--color-surface-raised` and **drops region hairlines**; glow adds `--shadow-overlay`), `blurSurfaces` multi-select (panels/composer/messages/modals → glass: `backdrop-filter` + translucent `color-mix` fill), `blurStrength`, `surfaceTexture grain`, `enableThemeColorization` (retints `--color-border`/`--color-sidebar-border` from the accent).
- **Background image:** kind none/seeded/external · fit · `backgroundDim` (scrim) · `backgroundBlur`. With an image: `.shell-main` goes transparent in Chats, other sections get a `--color-card` reading backing, no-fill chat styles (flat/hush/document) back their name/action chrome with `chromeBacking` scrims — keep all of it.
- **Message chrome:** `messageActions hover/expanded` (a pref, not a constant — schema default `hover`), metadata toggles `showTimestamps` (default **true**) / `showMessageId/showModelIcon/showTokenCount/showLLMReasoningIcon` (default false), `autoFixMarkdown` (default false). `showGenerationTimer` is **schema-only and inert** (PD-130 — no timing data exists); do NOT wire a control for it.
- **Reading typography:** `readingLineHeight/LetterSpacing/ParagraphSpacing/NameScale/BodyScale`, `justifyBodyText` — root vars consumed by `[data-slot="message-bubble"]`. Defaults mirror `tokens.json` (lineHeight 1.55, paragraph 0.75rem, scales 1) so untouched sliders = zero visual change.
- **Sizing/motion:** `chatWidthPct` (30–100, default 60 → `--width-shell-content = clamp(680px, Xdvw, 100dvw)`, already consumed by the bubble-family `outer` and the composer column), `fontScale` (0.8–1.5), `reducedMotion`, `density comfortable/compact` (compact retunes the four spacing intent tokens — which is why every task must use spacing tokens, never px). Glass: `blurSurfaces` defaults `[]` (off); the quick-enable seed is `panels+composer+modals` (`DEFAULT_BLUR_SURFACES`) — `messages` is never default-on (the Reading-Surface rule). `blurStrength` 4–28, default 14. `backgroundDim` default 0.45.

**Blanket rule:** any restyle lands in the shared base (`bubbleInner`/`bubbleOuter`, `MessageMetadataRow`, `.shell-panel-header`) so all 8 skins × 3 elevations × glass × bg-image inherit it. If a task seems to require touching one skin's special geometry (Echo's feather, Whisper's band, Ripple's weld, Tide's trains), stop — that geometry is tokenized and correct; the task is about the shared chrome around it.

---

## 2c. Theming-pipeline invariants (custom themes · derived colors · custom CSS · typography)

These systems make arbitrary user themes safe and legible. Every task must stay inside them.

**Derived colors (`ui/src/content/theme-scope/clamp.ts` — the render clamp; wire twin: `@orb/contracts/theme/override.ts`).** These are a **deliberate two-copy** (the cake forbids either importing the other); the pairing suite `tests/contracts/theme/pairing.suite.test.ts` pins them byte-identical (key sets, enums, the 7-font allowlist), and `isSafeColor` lives ONCE in `@orb/kit/safe-color`. A `ThemeOverride` has three consumers: the user theme entity, the **per-character theme column**, and `<ThemeScope>` — so per-character message theming rides the same clamp. A custom theme picks ONE base `background`; the entire neutral ramp (`--color-sidebar/surface-raised/card/popover/accent/sidebar-accent/secondary/muted`) derives via oklch relative-color L-deltas, and **every foreground/border/input fill is DERIVED, never picked** (contrast pivot flip — light surface → dark text; border = contrast tone at 0.14 alpha; input at 0.12). The emit surface is test-enforced (`THEME_SCOPE_EMIT_VARS` + the emit-surface test). Consequences:

- New chrome must reference the existing semantic tokens (`--color-sidebar-border`, `--color-accent`, `--color-muted`…) so a custom theme retints it. A hardcoded tone = a surface that stays Hearth-colored under a user theme (the exact class of bug the ramp exists to kill).
- Accent-tinted effects use `color-mix(… var(--color-primary) N%, transparent)` — `--color-primary` is themeable, so the tint tracks any accent (the list selected-bar, the context top edge, the rail active state all comply).
- Adding a token (PP1's `--color-info-foreground`, any kbd surface): if it's a fixed STATUS hue (info/success/warning), a static AA-verified pair is fine — mirror the existing success/warning pattern. If it's a neutral SURFACE, don't mint one — use a derived ramp member (`--color-muted`) so themes retint it. Never extend `clampThemeTokens`'s emit surface without also updating its emit-surface + pairing tests.
- Any user-pickable color input must go through the `color-field` primitive / `isSafeColor` (the §12.0 injection boundary). Never a raw text input for a color.

**Owner custom CSS (`app-shell/components/custom-theme-style.tsx`).** The owner's theme CSS injects UNLAYERED at the end of `<head>` and deliberately wins over everything; it targets shell class names and `data-slot` attributes. **Selector stability is therefore an API:** tasks must not rename or drop `data-slot` values (`message-bubble`, `message-row`, `message-attribution`, `composer`, `list-row-*`, `card-root`…) or shell classes (`.shell-panel`, `.shell-topbar`, `.shell-rail-button`…). When restructuring (e.g. the metadata row), keep the existing `data-slot` on the semantically-equivalent element. New chrome (the List header band) gets a proper shell class (e.g. `.shell-panel-header` — reuse, don't invent).

- `validateThemeCss` (`@orb/kit/css-validate`) guards injection — its exact posture: **REJECT** `position: fixed` and `position: sticky` (chrome-overlay containment breaks), **WARN** on `@import` (advisory). Theme CSS is capped at 65,536 chars (`THEME_CSS_MAX`). Don't weaken any of it; don't add rules that would break existing user CSS either.

**Typography seal (`ui/src/primitives/text/variants.ts`).** All text renders through `Text`/`Heading`: `size display/headline/title/body/label/code/micro` × `weight` × `tone` × `transform`. The scale is FLAT — **hierarchy is carried by weight, not by inventing sizes**. The micro-caps section-label voice is `size="micro" weight="semibold" transform="caps"`. Timestamps/counts: `size="micro"` + `font-mono` (the established chat-list pattern) — never a raw font-size. Reading typography vars (`--reading-*`) apply only to `[data-slot="message-bubble"]` — don't extend them to chrome.

---

## 3. Per-file task list

> Paths are relative to `client/src` unless prefixed with `ui/src`. Where I name a surface I didn't open, locate it under the feature's `surfaces/` dir.

### 3.1 Chrome baseline — `features/app-shell/`

**Files:** `surfaces/shell.css`, `components/panel-chrome.tsx`, `components/shell-topbar.tsx`, `components/rail.tsx`

- Give the **List** panel a real header band. `PanelChrome` currently renders **no** header for `panel="list"` (the surface owns its own title inside the scroll body). Change: `PanelChrome` always renders a `--dimension-chrome-row`-tall `.shell-panel-header` with a bottom hairline (`--color-sidebar-border`), and the list surface's title/action move **into** that band (see 3.2).
- Rail brand: put the `WeaveGlyph` in a `--dimension-chrome-row`-tall top cell with the same bottom hairline, so it sits on the shared baseline instead of floating with `padding-block`.
- Confirm topbar, context header, list header, rail brand all use `height: var(--dimension-chrome-row)` and `padding-inline: var(--spacing-block)`. One horizon.
- **Elevation + glass compatibility:** the new list header band must join the existing elevation rules — `elevation=ramp` drops panel hairlines (`.shell-grid[data-elevation="ramp"] .shell-panel-header { border-block-end: none }` already exists; the band must be styled by that same rule, not a new border it misses). Add **no opaque background** to the band — glass panels (`data-blur-panels`) rely on the panel's translucent fill showing through.
- **Done when:** a horizontal guide at the bottom of the top band crosses all four pane headers with zero vertical drift — in `elevation=flat` AND `ramp`, with and without glass panels.

### 3.2 Content topbar — one control cluster — `components/shell-topbar.tsx`

- Group order stays `[list-toggle · identity] … [view controls]` but **all right-side controls become one uniform ghost icon cluster** at `size="icon"`, `intent="ghost"`: search, focus, context-toggle. The `⌘K jump` chip stays as the one bordered `secondary` element. Add a thin `--color-border` divider (`1px`, `height: 20px`) between the jump chip and the toggles so it reads as two intentional groups, not scatter.
- The stray identity-row `⋯` (chat options) moves to the **end** of the cluster as the single overflow — it is not mid-header.
- **Member-count chip** (`chat-header.tsx`): on click, **always** `setContextTab("members")` then open Context (`setPanelMode("context","docked")`). Remove the toggle/collapse branch — the chip only ever opens. Collapse is the context header's own control.
- **Done when:** the topbar has exactly two visual groups (identity left, controls right); no control sits between them.

### 3.3 Chats LIST — `features/chat/surfaces/chat-list-surface.tsx` + `ui/src/primitives/list-row/`

- Move the "CHATS" micro-caps title + count into the new `PanelChrome` header band (3.1). The **only** action in that band is the `primary` **New** button (`Button intent="primary" size="sm"` with `Plus`). Remove the ghost `+`.
- Search field sits in its own row directly under the header, full width, `--spacing-block` inset.
- **Kill the horizontal scrollbar.** It's caused by a row child that doesn't shrink — long chat titles (`e2e-multitab-1783892616781`) force overflow. Ensure `ListRow` title has `min-w-0` + `truncate` (it does in `variants.ts`) and that **no** ancestor sets an intrinsic min-width; the panel body must be `overflow-x: hidden`. Verify against the longest title.
- Row density: selected row uses a **left ember bar** (`2px`, `--color-primary`) + `--color-primary/10` tint instead of the flat `--color-accent` fill, so selection ties to the ember system. Relative time is `--text-micro` `--font-mono` `--color-muted-foreground`, no border. Row `⋯` (rename/star/archive/delete) is **hover/focus-within revealed**, not always on.
- **Done when:** no horizontal scroll at any title length; one ember element (New) in the whole panel; selected row reads via the left bar.

### 3.4 Message row — `features/chat/components/message-row.tsx`, `message-actions-row.tsx`, `message-metadata-row.tsx`

This is the highest-impact fix — it repeats on every turn. **It must hold across all 8 chatStyles (§2b) — make the changes in the shared pieces, never per-skin.**

- **Actions collapse — respecting the `messageActions` pref.** The strip becomes **`edit` + `fork` inline, `hide · copy · delete` folded into `⋯`** — in BOTH pref modes. `hover` (default): the cluster rests at `opacity: 0` / `pointer-events: none` and reveals on row hover/`focus-within` (extend `message-actions-reveal.ts`, which today only dims). `expanded`: the collapsed cluster (edit · fork · ⋯) stays visible — the pref controls reveal, not the 5-wide strip. Keep the fork glyph the row already imports — don't change icons. Keyboard: the `⋯` menu keeps every action reachable when hidden at rest.
- **Quiet metadata — respecting the toggles.** `showTimestamps` et al stay functional; what changes is the rendering in `message-metadata-row.tsx`: kill the pill + clock icon; each enabled chip renders as inline micro text (`--text-micro`, `--font-mono`, `--color-muted-foreground`), timestamp preferably beside the speaker name in the name row. Same treatment for id/model/token chips — plain quiet text, separated by `·`.
- **Content-sized bubbles — bubble family only.** In `message-row-variants.ts`, change the SHARED `bubbleInner` (used by bubble/echo/whisper/ripple/tide) to hug content: `w-fit` + `max-w-prose` (keep the existing `rounded-card px-block py-row`). Do **not** touch `flat`/`document`/`hush` — full-width / manuscript is their design. Preserve untouched: Echo's inline `padding-right: var(--immersive-echo-feather)` contract, Whisper's `headerBand` (a `w-fit` bubble is fine — the band's 3:1 `aspect-ratio` derives from bubble width; verify a short Whisper message still shows a sane band), Ripple's welded portrait row, Tide's per-paragraph trains, and the `chromeBacking` scrims.
- **Reading column — verify, don't rebuild.** `bubbleOuter` already caps rows at `max-w-(--width-shell-content)` (the `chatWidthPct` pref). Verify the composer shares the same column (`mx-auto max-w-(--width-shell-content)`) so bubbles and input align; fix the composer if not.
- **Done when:** in `bubble` style at rest a turn shows name · time · fit-content bubble; hover reveals `edit fork ⋯`; `messageActions=expanded` shows the same 3-item cluster always; a two-word reply hugs its text; **and** flat/document/hush/echo/whisper/ripple/tide each still render their signature geometry (smoke-check all 8).

### 3.5 Chat CONTEXT — `features/chat/surfaces/chat-context-panel-surface.tsx` + `components/context-tabs-panel.tsx` + `panel-chrome.tsx`

- **Identity header (P4).** Context header shows the active chat's avatar + title (reuse the `chat-header.tsx` cluster at `size="sm"`), not the literal "Details". Add a `1px` ember top edge to the context `PanelChrome` header — a rule in **`shell.css`** (the one legal hand-CSS file), on the existing `.shell-panel-header` scoped to `[data-panel-side="context"]`: `box-shadow: inset 0 2px 0 color-mix(in oklab, var(--color-primary) 55%, transparent)` — an inset shadow, not a border, so it renders identically over a glass (translucent) panel and is unaffected by `elevation=ramp`'s border-dropping rules.
- **Equal-width tabs, ember indicator.** The `Tabs` list fills the panel; the active `TabsIndicator` uses `--color-primary`. (Already close — verify the indicator color and that tabs are `flex-1`.)
- **De-densify Overrides.** Remove the per-field helper sentence. Replace with: **one** intro line at the top of the tab (in a muted `--color-*/0.03` chip with an `info` glyph: "Empty fields inherit from the character or preset. Saved automatically.") and a `?` help affordance (Tooltip) beside each field label. `Depth` + `Role` share one row.
- **Done when:** the Overrides tab has one helper line total; each field is label + control (+ optional `?`), no paragraph.

### 3.6 Character editor — `features/character/surfaces/*` + `components/*`

**Content:**

- **Save model (P6, §5 — autosave, decided).** Replace the floating `Discard changes` / `Save` pair in the content header with a single quiet **autosave status** (`Text size="micro" tone="muted"`: "Saved" / "Saving…" / "Save failed — retry"). No Save button, no Discard button.
- **Token counts → one place.** Right now: `787 total · 637 permanent`, `~1 tokens` (name), `~244`/`~80`/`~49`/`~264`/`~0` per field, `961 characters ~244 tokens`. Keep **one** budget readout in the content header (`787 total · 637 permanent`) and **remove** every per-field `~N` chip; move exact counts into the Context → Field detail only.
- **Field rows → `Field` primitive, no per-row "Set" button.** The VOICE/EXTRAS/ADVANCED rows currently each have an orange `Set` button (5+ ember buttons stacked). A field is either empty (muted "Add…" affordance, `ghost`) or filled (shows a preview + edits inline / drills into Context → Field). Ember disappears from this list entirely.
- **Tags row.** The AI-suggested chips (`coding ✓ ✕`, sparkle icon) are fine but heavy at 4-wide. Group under one "Suggested" label; accept/dismiss stay per-chip. `Suggest tags` / `Manage tags` are `ghost`.
- **Opening message card** keeps `+ Add opening` / `Edit` as `ghost`; `Back` is `ghost` with a leading chevron, top-left, not bottom.

**Context (Field / Links / Options):**

- **Field empty state (P4):** name the entity — "Pick a field on **JFC** to inspect." Not "Pick a field from the…".
- **Options → color swatches.** The unlabeled square swatches (Background/Accent/Border/Speaker/Dialogue/Narration/Body) need visible labels + current value; use the existing `color-field` primitive (`ui/src/primitives/color-field`) rather than bare squares.
- **Done when:** the character editor content has **zero** ember except (optionally) one save/primary; every field is a `Field`; token noise appears once.

### 3.7 Presets editor — `features/preset/surfaces/*`

- **Tab overload → 4 groups (decided).** Collapse the 10 tabs into these **four** top-level tabs, with the old tabs as sub-navigation (segmented control or left sub-list) inside each:
  - **Generation** ← Quality · Sampling · Reasoning · Output
  - **Prompt** ← Prompt · Templates
  - **Context** ← Compaction · Variables
  - **Transforms** ← Post-process · Regex
    Do not invent new tab names beyond these four. Every original tab's content moves under its group unchanged — this is a re-grouping, not a rewrite.
- **Save model → autosave (decided).** `Save preset` is **removed**. Presets autosave like everything else (§5): show a `Saved / Saving…` micro status where the button was. No manual Save button anywhere.
- **Context → Section actions.** The bottom `Duplicate · Move below · Delete` button row (with a red Delete) folds into a single `⋯` in the Section header. The `Every generation` toggle stays; make sure it's the only ember-on toggle.
- **Done when:** exactly 4 primary tabs; no Save button (autosave status instead); section actions are one `⋯`.

### 3.8 Button accent audit — `ui/src/primitives/button/variants.ts` (no change) + all feature call sites

- Grep for `intent="primary"`. Every hit must be a genuine single-primary-per-surface. Demote the rest to `secondary` (bordered) or `ghost` (muted). Expected survivors: List **New**, Composer **Send**, and at most one Save per editor.
- **Done when:** a full-screen screenshot of any section shows ember on ≤1 button + the active nav/tab indicator.

---

## 4. Alignment & spacing specifics

- **Shared header height:** `--dimension-chrome-row` on all four pane headers.
- **Pane inner gutter:** `padding-inline: var(--spacing-block)` (0.75rem) everywhere; row gap `var(--spacing-row)` (0.5rem); group gap `var(--spacing-section)` (1.5rem).
- **List rows:** `min-h-control-md`, `px-row py-field` (already in `list-row/variants.ts` — just make sure consumers don't override).
- **Reading column:** consume `--width-shell-content` (shell root already sets it) for the thread + composer; center with `margin-inline: auto`.
- **Density:** ship **comfortable** (default tokens). `data-density="compact"` already exists in `shell.css` if wanted later — don't build a parallel path.

---

## 5. The Save/Set model — AUTOSAVE EVERYWHERE (decided)

Right now there are three models: character `Discard/Save`, preset `Save preset`, per-field `Set`. **The decision is: autosave everywhere.** There is no manual Save button on any editor.

- The app already autosaves chat overrides — extend that to characters and presets.
- Every editor (character, preset, and any future one) shows a single **autosave status** where a Save button used to be: `Text size="micro" tone="muted"` reading `Saved` / `Saving…` / `Save failed — retry` on error.
- **Remove** `Save`, `Save preset`, `Discard changes`, and every per-field `Set` button. Per-field `Set` becomes inline edit / drill-in (§3.6). This removes \~6 ember buttons per editor.
- Destructive/irreversible actions (Delete, Convert to persona) still confirm via the existing `AlertDialog` — autosave does not apply to those.

**Done when:** no editor has a Save/Set/Discard button; each shows one identical `Saved/Saving…` status in the same position; ember is gone from the field list.

---

## 6. Token cheat-sheet (use these exact names — generated into `ui/src/styles/theme.css` from `ui/src/tokens/tokens.json`; the JSON is the only editable source)

**Surfaces:** `--color-background` (content), `--color-sidebar` (rail + panels), `--color-card` (raised/bubble), `--color-surface-raised`, `--color-popover` (menus).
**Text:** `--color-foreground`, `--color-muted-foreground` (secondary/meta), `--color-dialogue`, `--color-narration`, `--color-speaker` (speaker name = ember).
**Accent (rationed):** `--color-primary` + `--color-primary-foreground`. Tints: `color-mix(in oklab, var(--color-primary) 10-14%, transparent)`.
**Lines:** `--color-border` (content), `--color-sidebar-border` (rail/panels).
**Bubbles:** `--color-user-bubble`, `--color-ai-bubble`.
**Space:** `--spacing-field` .375 · `--spacing-row` .5 · `--spacing-block` .75 · `--spacing-section` 1.5 · `--spacing-gutter` 2rem.
**Radius:** `--radius-control` .375 (buttons/inputs) · `--radius-base` .5 · `--radius-card` .625.
**Dimensions:** `--dimension-rail` 3.5rem · `--dimension-chrome-row` 3rem · `--dimension-panel` clamp(16rem,22vw,22rem) · `--width-shell-content`.
**Type:** `--text-display/headline/title/body/label/micro`; `--font-sans` (Geist) / `--font-mono` (Geist Mono). Timestamps/counts = `--text-micro` + `--font-mono` + `--color-muted-foreground`.
**Control heights:** `--spacing-control-sm/md/lg` (32/34/40 fine-pointer). `Button size` sm/md/lg/icon already maps to these.

**Button intents (existing, do not change):** `primary` (ember fill), `secondary` (1px `--color-border`, transparent, hover `--color-accent`), `ghost` (muted text, hover `--color-accent`), `destructive`.

---

## 6b. Primitive polish (the `@orb/ui` skins themselves)

These are fixes to the primitives, not the feature layer. They're low-risk and high-leverage — the whole app inherits them. Ship each as its own commit. Files are under `ui/src/primitives/`.

### PP1 — Badge: add a `soft` tone + fix `info` — `primitives/badge/variants.ts` + `ui/src/tokens/tokens.json`

The problem: every intent is a full-saturation solid fill, so status chips shout on the calm dark UI; and `info` renders as grey `bg-accent` (indistinguishable from `neutral`) because there's no `--color-info-foreground`, so the existing `--color-info` (blue) is unused. This is why the "Host" chip is hand-rolled instead of a `Badge`.

- Add `color.info-foreground` to `ui/src/tokens/tokens.json` and regenerate (`tokens:build`) — a dark readable pair for the `oklch(0.70 0.10 232)` blue; mirror the other `*-foreground` derivations, verify AA ≥4.5:1. Never hand-edit the generated `theme.css`. Info is a fixed status hue (not part of the custom-theme emit surface), so a static pair is correct — do NOT add it to `clampThemeTokens`.
- Add a `tone` variant to the badge: `solid` (today's fills, default) and `soft` (tinted: `bg-<intent>/15` or `color-mix(in oklab, var(--color-<intent>) 15%, transparent)` + `text-<intent>` + optional `1px` `<intent>/30` border). Every intent gets both tones.
- Point `info` at the real token pair (`bg-info text-info-foreground` for solid; `info/15 + text-info` for soft), not `bg-accent`.
- Migrate status chips (Host, filter chip, member roles) to `Badge intent=… tone="soft"`; delete the hand-rolled bordered chips.
- **Done when:** `info` is blue and distinct from `neutral`; a `soft` chip reads as a quiet tint; no feature hand-rolls a pill.

### PP2 — Un-overload `--color-accent` — `theme.css` + `primitives/kbd/variants.ts`, `primitives/badge/variants.ts`

`--color-accent` currently means three things at once: the hover surface (buttons/list-row/card/select-item — correct), the `kbd` chip background, and the badge `info` surface. Retuning hover intensity silently recolors kbd + info.

- Keep `--color-accent` for **interaction/hover only**.
- `kbd` chip: back it with `--color-muted` — a DERIVED neutral-ramp member, so custom themes retint it (§2c) — instead of `bg-accent`. Do not mint a new surface token for it.
- `info` badge: fixed by PP1 (uses `--color-info`), so it stops borrowing accent.
- **Done when:** grepping `bg-accent` returns only hover/interaction states, never a resting chip surface.

### PP3 — Focus-ring offset per surface — `lib/focus-ring.ts` (+ call sites on non-`background` surfaces)

`FOCUS_RING` hardcodes `ring-offset-background` (`--color-background`, 0.158). Rings on the rail/side panels (`--color-sidebar`, 0.132) and **inside** menus/selects/popovers (`--color-popover`, 0.245) then paint a mismatched-tone moat — most visibly a dark halo around a focused menu row (0.158 offset inside a 0.245 popup).

- Add `FOCUS_RING_ON_SIDEBAR` and `FOCUS_RING_ON_POPOVER` fragments (same cluster, `ring-offset-sidebar` / `ring-offset-popover`), and use them in the rail/panel and menu/select/popover/combobox item skins.
- **Glass caveat:** when `data-blur-panels` makes a panel translucent, ANY solid offset color is approximate. For elements inside glass surfaces prefer `FOCUS_RING_INSET` (already exists — no offset gap) over a solid offset; don't try to compute a translucent offset.
- Alternatively make the offset color inherit the local surface via a CSS var set on each surface root — flag which approach you take.
- **Done when:** a keyboard-focused menu/select item shows a clean ring with no darker gap ring against the popup.

### PP4 — Re-space the avatar size ramp — `primitives/avatar/variants.ts` + `ui/src/tokens/tokens.json`

`--spacing-avatar-sm/md/lg` = 24/30/34px is bunched (md→lg is 4px, then a 30px jump to `hero` 64px). md and lg are near-indistinguishable.

- Re-space to a differentiable ramp, e.g. `sm 24 · md 32 · lg 40 · hero 64` (`1.5 / 2 / 2.5 / 4rem`). Edit the `spacing.avatar-*` entries in `tokens.json` + regenerate; the variant keys don't change.
- These tokens back the user-facing `avatarSize` pref (sm/md/lg in appearance settings) — the pref mapping stays; users just get distinguishable sizes. `avatarAspect=portrait` derives width from the same height token (verify a portrait `md`/`lg` chip still looks right), and Ripple's welded portrait is INDEPENDENT (`--immersive-ripple-portrait-width`) — untouched.
- Sanity-check the message-row (`md`) and identity-header (`sm`) call sites still look right after the bump.
- **Done when:** the three non-hero sizes are visually distinct at a glance.

### PP5 — Checkbox off the control scale, not `spacing-section` — `primitives/checkbox/variants.ts` (+ `tokens.json` if a token is added)

The box uses `size-section` (`--spacing-section`, 24px) — a group-gap token as a control dimension, so it's chunky and resizes if section spacing is retuned.

- Size the box off a control-scale token (add e.g. `spacing.control-xs` ≈ `1.125rem`/18px to `tokens.json` + regenerate, or reuse an existing small dimension). Keep the `::before` `size-touch-target` hit area exactly as-is (the ≥44px coarse floor must not change).
- **Done when:** the checkbox is \~18px, and changing `--spacing-section` no longer resizes it.

> All five stay inside existing conventions (tv slots, `theme.css` tokens, the `FOCUS_RING` fragment pattern). PP1/PP2 touch the token file — if adding `--color-info-foreground` / a kbd surface token needs sign-off, flag it in the PR rather than guessing a value.

---

## 7. Acceptance checklist (run per section)

- [ ] All four pane headers land on one baseline (`--dimension-chrome-row`).
- [ ] Exactly one ember button visible per surface; nav/tab active state is the only other ember.
- [ ] No action appears in two places at once (hover `⋯` mirror excepted).
- [ ] Message turn at rest = name · inline time · fit-content bubble; hover = `edit fork ⋯`.
- [ ] No horizontal scrollbar in the List at any title length.
- [ ] Token counts appear once per surface; timestamps have no pills/icons.
- [ ] Context header shows the active entity's identity + ember top edge; empty states name the entity.
- [ ] Every field is the `Field` primitive; every list item is `ListRow`.
- [ ] No editor has a Save/Set/Discard button; each shows one identical `Saved/Saving…` status in the same position.
- [ ] Presets editor has exactly 4 primary tabs (Generation · Prompt · Context · Transforms).
- [ ] No raw color/size literals added in any feature file; only `theme.css` tokens.
- [ ] Token changes exist only as `tokens.json` diffs + a regenerated `theme.css` (no hand edits to the generated file); any new hand-written CSS rule lives in `shell.css` and nowhere else.
- [ ] `info` badge is blue (not grey); a `soft` badge tone exists and status chips use it; no hand-rolled pills.
- [ ] `bg-accent` appears only on hover/interaction states, never a resting chip surface.
- [ ] Keyboard focus on a menu/select item shows a clean ring with no mismatched offset moat.
- [ ] Avatar sm/md/lg are visually distinct; checkbox is \~18px and decoupled from `--spacing-section`.
- [ ] **Appearance matrix smoke-check:** all 8 chatStyles render their signature geometry (echo feather · whisper band · hush stripe · ripple weld · tide trains · flat/document full-width); `elevation` flat/ramp/glow all hold the shared baseline; glass panels/composer/messages/modals still frost; a background image still shows through Chats with legible scrimmed chrome; `messageActions=expanded` and every metadata toggle still function; `density=compact` and `chatWidthPct` still cascade.
- [ ] **Custom-theme smoke-check:** apply a LIGHT custom theme (light `background` + a dark accent) — every piece of new/changed chrome retints (list header band, selected-row tint, context top edge, badges, kbd) with derived foregrounds flipping dark; nothing stays Hearth-colored.
- [ ] **Custom-CSS stability:** every pre-existing `data-slot` value and shell class name still exists on the semantically-equivalent element (grep the diff for removed `data-slot=` / `.shell-*` names — must be zero).

---

*Scope guard: if any task appears to need a new primitive, a new `Button` intent, a new token, or a data-model change (e.g. changing the save model server-side), STOP and raise it in the PR rather than inventing it.*
