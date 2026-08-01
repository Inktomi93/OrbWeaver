---
kind: spec
status: active
updated: 2026-08-01
---

# HUD-HOME — the context panel IS the HUD (HUD-1)

**Status:** BUILT — H0 (`9923438e`) · H1 (`bf50477d`, side-eye `66cdf997`, doc amendments `1390d6e5`) ·
H2+H3 (`bda7ae4b`); H4 close-out is this pass (the §8 arms are LIVE and probe-proven, the §5.2 amendments
are applied — the ledger D-entry + the workboard close remain the orchestrator's). The stage table (§9)
carries the per-stage receipts. Owner-ruled 2026-08-01
(`docs/retro-workboard.md` §THE QUEUE item 3): *"the pre-HUD chrome seams in the CONTEXT panel get
YEETED — the context panel (where the rpg game lives in lite mode) IS the HUD's home."* Owner steer
mid-draft, same day: *"maybe just making our current context panel the HUD honestly"* — so the primary
arm is **the panel wholesale becomes the HUD when a game is active**, not a HUD region renting a still-
generic panel (§3.5 records the rejected shape).
**Scope:** the CONTEXT-panel composition seam only — `packages/client/src/lib/registry-contracts.ts`,
`features/app-shell/components/{panel-chrome,section-context-host,context-tabs-panel}.tsx`,
`features/app-shell/surfaces/shell.css` (the `.ctx-tab-strip` block + the context-band rules),
`features/rpg/**` (the HUD composition), and the CT/gate surfaces that pin them. **Out of scope:** shell
geometry (the four-region anatomy, panel width/closability/overlay — D62 is untouched), the rpg data
planes, chat CONTENT, and every non-CONTEXT surface.
**Evidence:** the 2026-08-01 stickler visual audit
(`docs/reviews/stickler/2026-08-01-visual-blech-audit.md` §F6 — four rendered legibility defects + the
seam diagnosis at lines 121–134) · full-file code recon of the panel host chain (§2) · the CP-4 blueprint
(`docs/architecture/Context-Panel-Program.md` §4) · the panel-redesign mock set
(`docs/design/mocks/panel-redesign/DESIGN.md`).
**Sibling specs (written aware of each other):** `docs/design/density-pass-spec.md` (S3 covers these exact
surfaces — coordination is §9.1) · `docs/design/tracked-field-unification.md` (TRK stages 1+2 SHIPPED;
they rebuilt the tab BODIES, this spec rebuilds the CHROME around them) · `docs/design/sse-multiplex-spec.md`
(no file overlap).

---

## 1. Motivation — say it honestly

**The bracket is not a bad tab design; it is a HUD renting a details-panel's chrome slots.** That is the
audit's own diagnosis (F6, review lines 121–127) and the code agrees: every seam the takeover uses today
was carved BEFORE a HUD was planned to own the pane — the always-present `.shell-panel-header` band (D66
A1, one chrome-row horizon for a LABEL), the generic `.ctx-tab-strip` with its container-query label
reveal (CP-2, sized for 3–5 word labels), and the pinned-edge panel chrome. The HUD then bent each of
them: the band grew a `height: auto` exception to fit a two-line waystone (`shell.css:321-327`), the strip
grew count-6/7 thresholds that can never fire in the shell (`shell.css:426-439`), and the tab def grew a
`header` field so a CONTRIBUTOR could reach a slot it does not own (`registry-contracts.ts:64`,
`resolveContextTabs` override at `:141`).

**What the rent costs, in rendered defects** (F6, all four measured on a real game chat):

1. one selection spread across two strips ~870px apart with no echo — the game strip reads as a dead icon
   toolbar;
2. the game strip is icon-only at the panel's ONE real width, permanently — the "compressed form" is the
   only form;
3. the meta strip reads as an action bar, not as more tabs of the same panel;
4. a ~400px dead zone under a short scene body, while the band burns ~140px on a dial and one line of
   "No ambient set".

Each of those is a symptom of the same cause: **nobody owns the vertical composition.** The band is the
shell's, the strips are the shell's, the bodies are the features', and the arrangement between them is an
accident of three specs. A single owner can make selection legible across its own strips, spend its own
vertical budget, and speak one grammar — none of which is expressible from inside a rented slot.

**The value, stated plainly:** this is a SEAM change that deletes code. The HUD stops asking the generic
panel for exceptions; the generic panel goes back to being generic (and gets simpler — the bracket branch,
two of its seven threshold blocks, and one contract field all die).

**The cost, stated up front:** a second composition of tab chrome exists in the tree (the generic
`ContextTabsPanel` for six sections + non-game chats, and the HUD's own for game chats). That is a real
duplication and the honest reason to keep the seam small: the HUD receives ALREADY-RESOLVED tab nodes as
data and re-renders their strip; it does not re-implement resolution, selection storage, `when`-gating,
badges, or the PHASE-disabled treatment. The shared parts stay shared; only the ARRANGEMENT forks.

---

## 2. Current state — what the HUD rents today (recon 2026-08-01)

| seam | code | what it is | who it was built for |
| - | - | - | - |
| the band | `panel-chrome.tsx:39` (`<header className="shell-panel-header">`), mounted `app-shell.tsx:235` | ALWAYS renders, both panels, one chrome-row horizon (D66 A1) | a LABEL ("Details") / the LIST title+count (N2) |
| the band's growth exception | `shell.css:321-333` | context-side only: `height:auto` + `min-height` + `align-items:stretch` + the 2px ember inset edge | added FOR the takeover's two-line banner |
| the band contribution channel | `registry-contracts.ts:64` (`ContextTabDef.header`), resolved `:141` | a contributor tab may supply the band; first `when`-passing header wins | added FOR rpg (`rpg-context-section.tsx:116-127`) |
| the two strips | `context-tabs-panel.tsx:80` (top) + `:92` (bottom), gated by `hasBracket` `:62` | one `Tabs` root, two `TabsList`s, one selection | the CP-4 bracket (§4.2) |
| the strip skin + label reveal | `shell.css:345-439` | `.ctx-tab-strip` container query; per-count reveal thresholds 1–7 | CP-2 (3–5 word labels); rows 6/7 exist ONLY for the bracket and can never fire (panel caps at 30rem) |
| the viewport rule | `context-tabs-panel.tsx:88` (`min-h-0 flex-1 overflow-y-auto`) | the active panel always fills the height | a scroll-a-list details pane — this line IS F6 defect 4 |
| the strip assignment | `registry-contracts.ts:23,41` (`ContextTabStrip`, `ContextTabDef.strip`) | `"game" \| "meta"` per tab | the bracket |

**The panel's real width:** `--dimension-panel-context: clamp(17rem, 30vw, 30rem)` (`tokens.json:348-351`)
— 480px from a 1600px viewport up, 384px at 1280px, 272px floor. The label-reveal thresholds start at
28rem for 4 tabs and 49rem for 7 (`shell.css:408,433`), so **the game strip is icon-only at every width
the shell ever gives it.** F6 defect 2 is arithmetic, not taste.

**The tabs in play on a game chat** (correcting the brief's "This chat / Preview / Options / Members" —
`Options` is the CHARACTERS section's tab, not chat's):

- GAME strip (`rpg-context-section.tsx:105-205`): `rpg.status` · `rpg.inventory` · `rpg.scene` ·
  `rpg.quests` · `rpg.journal` · `rpg.map` (PHASE-locked, `disabledReason`) — 5 live + 1 locked.
- META strip: `members` (APPLICABILITY-gated), `settings` ("This chat"), `preview` (host) —
  `chats-section.tsx:45-82` — plus `rpg.game` ("Game", crown, host — `rpg-context-section.tsx:182-205`),
  which is rpg's own contribution wearing `strip:"meta"`.

**What already works and must survive** (the audit's "one strength", plus the machinery):

- state-vs-administration IS a real split, and admin stays reachable mid-scroll;
- the `contextTab` `#state` seam (selection continuity across chat switches — CP-4 §4.1), the
  `defaultTab` landing (`context-tabs-panel.tsx:68`), the `when`/`badge`/`disabledReason` resolve
  (`registry-contracts.ts:126-142`), and the one-directional contributor flow (rpg never imports chat;
  the door assembles — lockdown §6c).

---

## 3. The contract — the panel IS the HUD

### 3.1 The claim (the one new idea)

**A contributor may CLAIM the whole CONTEXT pane for a state.** When the claim holds, the context panel
renders nothing of its own: no `.shell-panel-header` band, no `.ctx-tab-strip`, no bracket. The claimant
returns ONE node that composes the entire pane — its own band, its own strips, its own viewport, in its
own order — and the shell hands it everything it would otherwise have rendered itself.

The shell's remaining job for a claimed panel is exactly the panel MECHANICS it already owns and the HUD
never touches: the `.shell-panel` aside, `data-panel-mode` (docked / overlay / collapsed), the width
track, the landmark + label, the scrim, the close affordance (`contextToggleChrome`). **D62 is untouched
— the takeover is panel CONTENT** (Context-Panel-Program §4.10), and that stays literally true; what
changes is that "content" now starts at the panel's top edge instead of below a rented band.

### 3.2 The shape (home: `packages/client/src/lib/registry-contracts.ts`, tier 4)

```ts
/** What the shell hands a claimant: everything it would have rendered itself, already resolved. */
export interface ContextRegionView {
  /** ALL resolved tabs — host's own then contributors, `when`-filtered, declared order, `S` applied
   *  (the SAME `ResolvedContextTab[]` `ContextTabsPanel` consumes: id · label · icon · node · strip ·
   *  badge · disabledReason · defaultTab). The claimant renders their strips; it never re-resolves. */
  readonly tabs: readonly ResolvedContextTab[];
  /** The resolved selection (stored `contextTab` if still visible, else the `defaultTab` flag, else the
   *  declared-order first) and the pre-bound writer — the ONE selection seam, unchanged. */
  readonly activeTab: string | null;
  readonly selectTab: (id: string) => void;
  /** The host's strip-trail actions, already state-bound (chat's draft add-member popover today). */
  readonly actions?: ReactNode;
}

/** A contributor's claim on the whole pane. `S` is the host section's projection — contravariant only,
 *  exactly like `ContextTabDef` (§6b's variance proof holds unchanged). */
export interface ContextRegionDef<S> {
  readonly id: string;
  /** APPLICABILITY — the same class of gate as a tab's `when` (game-ness, read cache-first). */
  readonly claims: (state: S) => boolean;
  /** The whole pane. Receives ONLY the shell view — the claimant's own domain state comes from its own
   *  hooks inside its own components, so `S` never crosses into the render. */
  readonly render: (view: ContextRegionView) => ReactNode;
}
```

Wiring, all inside existing machinery:

- `ContextTabsSpec<S>` gains `regions?: ContributorRegistry<ContextRegionDef<S>>` — the same door-assembled
  contributor channel the tabs use (lockdown §6c). rpg exports `rpgHudRegion`; `main.tsx` assembles it;
  chat's `defineContextTabs` receives it blind.
- `resolveContextTabs` (`registry-contracts.ts:126`) gains one line: the FIRST claiming region wins, and
  the result carries `region?: (view: ContextRegionView) => ReactNode` on `ResolvedContextTabs`. Duplicate
  claims at one state are not a runtime coin-flip — see the single-claimant gate arm (§8, arm 6).
- `SectionContextHost` (`section-context-host.tsx:66-72`): `resolved.region` present ⇒ render the region
  (with the view assembled by the shared selection hook, §3.4); absent ⇒ today's `ContextTabsPanel`, byte-
  identical.
- `SectionContextHeader` (`:50-60`) returns `null` when a region is claimed, and `PanelChrome` renders NO
  `<header>` element for a null header on the CONTEXT side (§3.6 — the D66 A1 amendment, owner decision 3).

### 3.3 When there is NO game — the generic panel, preserved verbatim

This is the strongest argument for keeping any genericity, so state it head-on: **six of the seven
sections and every non-game chat have no claimant, and for them nothing changes at all.**

- `chats` without a game pointer: band = the neutral "Details" chrome, one top strip (`Members` ·
  `This chat` · `Preview`), one scrolling body — exactly today's render, exactly today's code path.
- `characters` / `presets` / `corpus` / `analytics`: unchanged `defineContextTabs` sections.
- `worldInfo`: unchanged `kind:"single"`. `refinery`: unchanged `kind:"none"`.
- Draft chats never claim (games exist only on committed chats — CP-4 §4.1).

The regression floor is mechanical and must be asserted, not assumed: **with zero claimants the rendered
panel is unchanged** (§10 CT 1). The bracket branch is deleted, so the no-claim path gets SIMPLER, never
different.

### 3.4 The switching seam

- **Enter:** the active chat's cached `getChat` carries an engaged rpg pointer — the existing
  `isGameChat` predicate (`rpg-context-section.tsx:57-65`, a cache-first cross-domain read per lockdown
  §12). `claims` reuses it verbatim; no new state, no new query, no toggle. `createGame` committing
  invalidates the query ⇒ the panel re-resolves ⇒ the HUD appears on the next render, same as a chat
  switch.
- **Exit:** non-game chat, disengaged pointer (`isRpgEngaged` false), or section change ⇒ `claims` false
  ⇒ the generic panel returns. No animation, no ceremony (CP-4 §4.1 — a game is content, not an event).
- **Selection continuity is unchanged:** the HUD reads `activeTab` and calls `selectTab`; the store
  (`contextTab`) and the namespaced ids (`rpg.*` vs `members`/`settings`/`preview`) are untouched, so
  game→normal→game round-trips resolve exactly as they do today.
- **The resolution rule moves to ONE home** so both compositions cannot drift: extract the
  stored→`defaultTab`→first logic (`context-tabs-panel.tsx:64-69`) into a named hook consumed by
  `ContextRegionHost` and `ContextTabsPanel` both. A second copy of that rule is the drift this repo
  keeps re-learning.
- **Mount identity:** the `key={activeSection}` remount discipline on both mount sites
  (`app-shell.tsx:235,239`) is unchanged; the region is rendered inside the same `key`ed subtree, and the
  claimant's own hooks live inside its own components (rules-of-hooks holds by construction).

### 3.5 The considered-and-rejected shape: a HUD REGION inside a still-generic panel

The first draft of this program had the HUD claim a REGION between the band and the strips — the panel
keeps rendering its band and its meta strip, the HUD owns the middle. **Rejected**, per the owner steer
and on the merits:

- it preserves every F6 cause: the band is still sized by the shell, the meta strip is still the shell's
  grammar, and the HUD still cannot spend the vertical budget it does not own;
- it needs MORE contract surface, not less (a region slot plus the surviving `header` channel plus the
  strip assignment), so nothing gets deleted;
- the seam cost is nearly identical — both shapes are "a contributor claim resolved at
  `resolveContextTabs`". Given equal mechanism cost, take the one that lets the HUD fix the defects.

Kept as the fallback ONLY if owner decision 3 (band suspension) is refused: with the band mandatory, the
region shape is what remains.

### 3.6 What the HUD may NOT do (the fences)

Naming them is the point — a claimant with no fences is a second shell.

1. **No panel mechanics.** Width, docked/overlay/collapsed, the close control, the scrim, the landmark
   label stay the shell's (D62). The HUD renders inside the aside; it never reads or writes
   `panelOverrides`/`openOverlayPanel`.
2. **No CSS.** Features touch zero CSS (lockdown §4). The HUD composes `@orb/ui` primitives + token
   utilities; anything genuinely structural goes to `shell.css` (the ONE feature-tier CSS file, and it is
   app-shell-tier work — flag it, do not smuggle it). The `.ctx-tab-strip` grid is replaceable by
   `grid-flow-col auto-cols-fr` utilities, so this is not expected to bite; if it does, STOP and report.
3. **No second selection store.** `contextTab` via the handed `selectTab`; no local mirror.
4. **No re-resolution.** It renders the handed `ResolvedContextTab.node`s; it never calls `body(state)`,
   never re-runs `when`, never invents a tab the resolve did not hand it.
5. **No cross-feature import.** rpg still imports zero of chat; the door assembles (lockdown §6c).
6. **No a11y regression.** Two labelled tab groups, arrow-key roving focus per group, the viewport
   `aria-labelledby` the active tab, decoration `aria-hidden` with the TEXT as the datum (CP-4 §4.9 + the
   tracker-kit a11y model). The HUD inherits these as REQUIREMENTS, not as leftovers of the primitive it
   stopped using.
   **AMENDED 2026-08-01 (H1 side-eye, P1-3 + P1-4).** Two corrections the built HUD forced:
   (a) the `aria-labelledby` association must be written EXPLICITLY — Base UI resolves a panel's label
   within ONE list, and two rails off one `Tabs` root left the active tabpanel unnamed;
   (b) the PHASE-locked tab is **NOT `aria-disabled`**. The locked Map OPENS onto the body that states when
   the feature arrives (RV-7), so announcing "unavailable" over a control that both Enter and a click
   activate was two stories in one cell. It wears a LOCK glyph + the reason on `title` (the accessible
   DESCRIPTION beside its `aria-label`), and mouse, keyboard and AT all get the same answer. `disabled` is
   still banned; a genuinely inert tab would have to hide its teaching body, which owner review asked for.

---

## 4. The meta tabs under HUD ownership (the fold — owner decision 1)

**The lean, spelled out:** the four meta tabs do not move, do not hide, and do not change owners — they
fold into the HUD's grammar as its **administration voice**. They keep their definitions
(`chats-section.tsx:45-82` for members/settings/preview, `rpg-context-section.tsx:182` for the crown Game
tab), their ids, their `when` gates, their bodies. What changes is who draws their strip and in what
voice.

**Where they live:** an ADMIN RAIL owned by the HUD, still below the viewport (the audit's one strength —
admin stays reachable mid-scroll — is a rendered fact worth keeping), rendered from the handed tabs
filtered by `strip === "meta"`.

**What grammar they speak** (four-voice, `density-pass-spec.md` §2.3 lines 93–96, and the mock color
grammar `panel-redesign/DESIGN.md` §3):

| element | voice / token | why |
| - | - | - |
| the rail's own name | `kicker` — caps micro + hairline, "CHAT" | states that the rail is a second TAB group, not an action bar (F6 defect 3) |
| a cell's caption | `label` voice, always visible (never icon-only — §7.2) | "This chat" reading as a word is what makes it a tab |
| active cell | ember `--color-primary` tint + inward 2px edge | the ONE active treatment, identical in both strips (CP-4 §4.6) |
| host-only cells (`preview`, `rpg.game`) | crown gold `--color-highlight` glyph at rest | "host-only reads without a label" (DESIGN.md §6 P3) |
| the non-owning strip | recedes: muted glyphs, no resting surface fill | half of the F6 defect-1 fix |

**How the state-vs-admin split is preserved** — it is preserved by CONTRAST, which is exactly what the
current render lacks:

- position: state above the viewport, administration below (the OSRS bracket IA, CP-4 §4.0, unchanged);
- weight: the game strip carries the ember/track vocabulary and sits under the band it belongs to; the
  admin rail is quieter by construction (kicker + label voices, no game color);
- naming: two labelled groups ("Game" / "Chat"), announced, with the rail's kicker making the label
  visible and not merely accessible.

**What the fold BUYS that renting could not:** the HUD can echo the selection across the split (the band
names the active tab; the non-owning strip recedes), because one component knows both strips' state. That
is F6 defect 1, fixed structurally rather than by adding a breadcrumb to a slot nobody owns.

**Explicitly NOT proposed:** burying admin behind a "chat" meta-tab (CP-4 §4.1 argued this down — the
tabs you reach for mid-game to mute a character or fix an override must not be one level deeper), moving
them to the topbar, or dropping any of them.

---

## 5. What gets deleted, and the law that must be amended

### 5.1 Deletions (all in the SAME commit as the HUD landing — no half-migration)

| deleted | file:line | why it dies |
| - | - | - |
| `ContextTabDef.header` + the `contributedHeader` override | `registry-contracts.ts:64`, `:141` | a contributor reaching into a slot it does not own; the HUD owns the band now. Deleting the FIELD is the enforcement — `rpg-context-section.tsx:122-127` stops compiling |
| `ContextTabStrip` + `ContextTabDef.strip` + `ResolvedContextTab.strip` | `registry-contracts.ts:23,41,75` | strip assignment is the HUD's arrangement, not the shell's vocabulary. **Retained if decision 5 keeps rail membership declarative** — see §12 |
| the bracket branch | `context-tabs-panel.tsx:60-62,80,92` + `ContextTabStrip`'s `edge` prop + `TAB_EDGE_CLASSES` `:143-146` | the generic panel goes back to ONE strip |
| the count-6/7 reveal thresholds | `shell.css:426-439` | authored for the bracket; never fire at any shell width |
| the context-band growth exception | `shell.css:321-333` (`height:auto`, `min-height`, `align-items:stretch`, the ember inset) | the band no longer exists on a claimed panel; on an unclaimed one it is a one-line label again. **The 2px ember inset edge MOVES into the HUD's own band** (content↔context binding survives — it just gets painted by its owner) |
| the always-render band, context side | `panel-chrome.tsx:39` | becomes conditional: a null header on the CONTEXT panel renders no `<header>` |

Everything else in `context-tabs-panel.tsx` (the badge, the disabled treatment, `scrollIntoView`,
container-responsive labels for counts 1–5) stays — it serves the six generic sections.

### 5.2 The amendment (draft text; the D-entry is the orchestrator's to mint)

**`docs/architecture/Context-Panel-Program.md` §4.2 + §4.11** — supersede, do not silently rot. Draft
replacement for §4.2's opening and §4.11 items 1–5:

> **§4.2 (AMENDED 2026-08-0X, HUD-1).** The bracket anatomy below describes the HUD's OWN composition,
> not a set of shell slots it occupies. When a chat carries an engaged game the rpg feature CLAIMS the
> whole CONTEXT pane (`ContextRegionDef`, `client-architecture-lockdown.md` §6c): the shell renders the
> `.shell-panel` mechanics and hands the claimant the resolved tabs + selection; the claimant renders the
> band, both strips, and the viewport itself. The `.shell-panel-header` band, `.ctx-tab-strip`, and the
> two-strip branch of `ContextTabsPanel` are NOT used by the takeover — §4.11's registry deltas 1, 2, 3
> and 5 are RETIRED (they described the rented seams). The IA rulings survive unchanged: state above /
> administration below, ONE selection across both strips, icon density, the single swapped viewport, the
> locked-but-visible tab, and orbs as glanceable vitals.

**`docs/architecture/core/client-architecture-lockdown.md`** — three edits:

> **§6b (ADD).** `ContextDefinition` gains no arm; `ResolvedContextTabs` gains `region?:
> (view: ContextRegionView) => ReactNode`, supplied by the FIRST claiming `ContextRegionDef` in the
> door-assembled `regions` contributor registry. `S` stays contravariant-only: `claims` consumes `S`,
> `render` consumes the non-generic shell view, so the erasure proof of §6b is unchanged.
>
> **§6c (ADD).** A third contributor arm beside context-tabs and surface-anchors: **region claims**. One
> claimant may own a host's whole CONTEXT pane for a state it declares. Assembled at the door like every
> other contributor; the host consumes it blind.
>
> **§4 / D66 A1 (AMEND).** "The `.shell-panel-header` band ALWAYS renders" holds for the LIST panel and
> for an UNCLAIMED context panel. A CLAIMED context panel renders no band: the claimant owns the pane's
> top edge, including the 2px ember content↔context binding edge, which it must paint.

**`docs/design/density-pass-spec.md` §6 S3** — one line: S3's context-panel row runs AFTER HUD-1 lands
(§9.1).

---

## 6. The F6 defects → their structural fixes

| # | defect (as rendered) | structural fix | why it was impossible before |
| - | - | - | - |
| 1 | selection invisible across a ~870px gap; game strip reads as a dead toolbar | ONE component owns both strips: the non-owning strip recedes (muted glyphs, no resting fill) and the band's kicker line names the active tab ("GAME · STATUS" / "CHAT · THIS CHAT") | neither strip's renderer knew about the other's ownership state; the band belonged to a third party |
| 2 | icon-only at every real width — six ambiguous glyphs | the HUD strip drops the container-query reveal entirely: every cell is glyph + always-visible caption (kicker voice), sized by `auto-cols-fr` across the panel width | the shared `.ctx-tab-strip` thresholds are global to every section; the game strip could not opt out without forking the CSS |
| 3 | the meta strip reads as buttons, not tabs | the admin rail gets tab grammar: a "CHAT" kicker, the shared active treatment, label-voice captions, crown-gold host cells (§4) | the strip's skin is one shell-wide rule; a per-strip voice is a per-owner decision |
| 4 | ~400px dead zone under a short body while the band burns ~140px | the HUD's own vertical budget: the viewport flows to CONTENT height and shrinks only when it must (§7.1), and the band compresses when ambient is unset (§7.3) | `min-h-0 flex-1` (`context-tabs-panel.tsx:88`) is the generic panel's law for every section; the band's height is `shell.css`'s |

---

## 7. Layout law for the HUD's own composition

Deliberately thin — the shapes below are the ones that FIX a measured defect. Taste-level values are
flagged to §12 rather than pre-decided, and every one of them is verified by a computed-value assertion
(§10), never by an authored class string.

### 7.1 The vertical budget (the dead-zone rule)

The pane is a flex column: band (`flex-none`) → game strip (`flex-none`) → viewport → admin rail
(`flex-none`).

**The viewport is `flex: 0 1 auto` + `min-h-0` + `overflow-y-auto`, NOT `flex-1`.** That single change is
the dead-zone fix and it preserves the strength the audit named:

- short body ⇒ the viewport takes its natural height and the admin rail rides up directly beneath it (no
  dead zone between content and admin);
- tall body ⇒ the viewport shrinks to the available space, scrolls internally, and the rail is pinned at
  the bottom exactly as today (admin stays reachable mid-scroll).

**AMENDED 2026-08-01 (H1 side-eye, P1-2 — decision 6, answered on the real screenshots).** The rail is
PINNED to the pane's bottom edge (a stable Fitts target), and the residual span between the body and it is
a GROUND element that absorbs exactly what is left. Bare background read as truncation, not as a floor, and
a rail floating ~400px up the pane read as a bug. The ground carries a treatment, not content — the surface
tint gathering toward the foot, `aria-hidden`, nothing to read; the "do NOT invent filler content" rule
stands. On a tall body the ground measures ZERO, so the rail does not move between the two states.

**Budget rule:** at the 30rem × 900px docked reference, band + both strips ≤ 30% of the pane height, so
the viewport always owns the majority of the panel. Asserted as a RATIO in CT, never as px.

### 7.2 Strip form

- Every cell: glyph + caption, always both. The caption is the accessible name AND visible (this deletes
  the "compressed form is the permanent form" defect); `title` stays for the PHASE-locked reason only.
  **AMENDED 2026-08-01 (H1 side-eye, P0-1):** a stacked cell is a `@orb/ui` TabsTab `layout="stacked"`, not
  a call-site `h-auto` — a custom-token height is opaque to tailwind-merge, so the sealed `h-control-sm`
  won on stylesheet order and CRUSHED the cell's children (a 6px glyph over a 5px sliver of the word). The
  conformance test measures the rendered boxes; a class-string assertion stayed green through the defect.
- Cells fill the row as equal columns (`grid-flow-col auto-cols-fr`) — the bracket reads as a solid frame,
  the 2026-07-28 owner ruling that `shell.css:348-357` records, carried over verbatim.
- Hit target ≥ 32px fine / ≥ 44px coarse (CP-4 §4.7, unchanged).
- Arithmetic check at the 17rem floor: 7 cells × ~38px = ~266px — fits; at 480px each cell is ~68px, wide
  enough for a 6-character kicker caption. If a caption cannot fit at the floor, the FLOOR wins and the
  caption truncates — the full name stays the cell's `aria-label`, never a nameless glyph. (AMENDED
  2026-08-01: the truncation understudy is `aria-label`, NOT `title` — the bullet above reserves `title`
  for the lock reason, and a hover tooltip on all six live cells was noise the side-eye called.)

### 7.3 The band (waystone) and its compressed form

- The band is the HUD's, and it paints the 2px ember top edge itself (the content↔context binding that
  `shell.css:322` renders today).
- **Ambient-set:** the current composite (waystone + location + when-line + cues row + orb/coin row) —
  it is the signature element and the mock set's centerpiece; it is not the problem.
- **Ambient-unset** (no location, no clock, no weather — the "No ambient set" state F6 measured): the band
  collapses to a slim single row — the stone one step SMALLER, the unset copy on one line, cues + orbs
  inline beside it. Mechanism: `Waystone` gains a `compact` boolean that steps the size mapping down one
  step at every container step (`packages/ui/src/charts/meter/variants.ts:178` stays the ONE sizing home —
  the caller passes a flag, never a size className; the F16 two-homes lesson is not re-broken).
- The band's LAST line is the selection echo (§6 defect 1) — kicker voice, `aria-hidden` (the tab strip
  already announces selection; the echo is a visual aid, not a second announcement).

### 7.4 Density tier + voices

The pane is INSTRUMENT tier (`density-pass-spec.md:121` — "CONTEXT panel viewport (rpg tabs, meta tabs)"),
so the HUD composes on the tier map's steps and the four-voice grammar (kicker / label / datum / gloss)
rather than picking sizes per call site. If density S1 (the `Surface`/`tiers.css`/`Text.voice` mechanism)
has landed, the HUD is built on it directly; if not, it uses today's primitives and S3 sweeps it (§9.1).

---

## 8. Enforcement — what makes a violation RED

A prose-only boundary is a wish (constitution §2.3). Each rule names its wall.

| rule | wall | tier |
| - | - | - |
| a contributor cannot supply the panel band | **tsc** — `ContextTabDef.header` is DELETED; `rpg-context-section.tsx:122` fails to compile until it moves into the HUD | compile-time |
| the shell cannot render a bracket | **tsc + deletion** — `strip`/`ContextTabStrip` gone from the resolved shape (or retained per decision 5), the branch deleted | compile-time |
| a region is minted only by the mint | `context-definition-shape` **arm 5**: an object literal carrying a `region:` function property, or a hand-rolled `ContextRegionDef` shape, outside `lib/registry-contracts.ts` is RED | lint-time (ts-morph) |
| **only the HUD writes its region** | `context-definition-shape` **arm 6**: at most ONE `defineContextRegion(` call site project-wide (`ctx.scope.kind === "project"`, zero baseline). Count-based, NOT path-keyed — a path allowlist dies silently on rename ([[path-keyed-gates-die-on-rename]]) | lint-time |
| no feature paints shell chrome | `context-definition-shape` **arm 7**: the literals `shell-panel-header` / `ctx-tab-strip` under `packages/client/src/features/**` outside `features/app-shell/**` are RED | lint-time |
| one region host | **arm 8**: `data-context-region` written anywhere but `features/app-shell/components/context-region-host.tsx` (the density A4 single-writer idiom, `density-pass-spec.md:218`) | lint-time |
| rpg still imports zero of chat | `client-features-no-cross` (LIVE) — unchanged | dep-cruiser |
| the HUD writes no CSS | `feature-css-files` (G14) + the ESLint compose-only keystone — unchanged | lint-time |
| the rendered geometry actually holds | the §10 computed-value CTs (`getComputedStyle` / `boundingBox` ratios) | test-time |

**Extend `context-definition-shape.ts`, do not mint a new gate.** It is already the §6b/§6c wall (four
arms today), extending costs one file + fixtures, and a new gate costs four coupled sites
([[new-gate-four-coupled-sites]]). The Enforcement-Active-Gates row for it gets its arm list updated; the
gate count is unchanged.

**LIVE as of H1 (`bf50477d`), verified at H4.** All four arms are in `scripts/check/gates/context-definition-shape.ts`
with `mustFlag` fixtures at BOTH a shallow and a deep path and `mustPass` false-positive fixtures (the legal
single mint, the ONE region host, a COMMENT naming the chrome classes, app-shell painting them legally). The
doc rows are updated in `Core-Enforcement-Active-Gates.md` and `client-architecture-lockdown.md` §16 G3; the
gate count is unchanged (no new gate). H4 probe receipts: four planted violations (a hand-rolled
`{claims,render}`; a second `defineContextRegion(`; `className="ctx-tab-strip"` in `features/rpg/**`; a second
`data-context-region` writer) each turned the gate RED at the exact planted site, and the tree returned to
`single-pass: clean` on removal.

**Declared blind spot** (write it in the gate header): arms 5–8 read literal shapes. A claim assembled
through a variable, a re-export, or a computed property is invisible ([[gate-probe-literal-shapes]]) —
the CTs in §10 are the required second lens, not a nice-to-have.

---

## 9. Migration — stages, each independently shippable

| stage | lands | ships green as | verified by |
| - | - | - | - |
| **H0** LANDED `9923438e` | the seam, vacuous: `ContextRegionDef` + `defineContextRegion` + `ContextRegionView` + `ResolvedContextTabs.region` + `ContextRegionHost` + the extracted shared selection hook. `main.tsx` assembles an EMPTY-but-typed `regions` registry (the M8 precedent, lockdown §6c) | zero visual delta anywhere | unit (resolve) + CT with a FAKE claimant + the no-claimant regression CT |
| **H1** LANDED `bf50477d` (+ side-eye `66cdf997`) | the HUD claims: rpg mints `rpgHudRegion` composing band + game strip + viewport + admin rail from the handed tabs. SAME commit: every §5.1 deletion, the band suppression, the §7.1 viewport rule | the takeover renders from its own composition; generic panel simplified | CT (region + no-region) · snap geometry probes · side-eye |
| **H2** LANDED `bda7ae4b` | the voice pass: admin-rail tab grammar + kicker, host-only crown treatment, non-owning-strip recede, band selection echo (F6 defects 1 + 3) | polish-only, no seam change | snap `--contrast`/`--map` · side-eye (authority — every finding fixed before close, [[side-eye-fix-all-findings]]) |
| **H3** LANDED `bda7ae4b` | the band's compressed form (`Waystone compact`) + the vertical-budget CT (F6 defect 4's second half) | polish-only | computed-value CT (band ratio) · snap on an ambient-less game |
| **H4** | close-out: the §8 gate arms LIVE with fixtures (arms 5–8 landed with H1, `bf50477d`; probe-proven at H4 — planted violation ⇒ RED at the exact site ⇒ removed ⇒ clean), the §5.2 amendments applied to CP-doc + lockdown + density-spec, workboard HUD-HOME closed, ledger D-entry (orchestrator) | — | `check-gates.int` + `gate-conformance.int` green · `pnpm check` on a quiesced tree (orchestrator) |

H2 and H3 are strictly polish over H1's structure — either can slip a day without leaving a half-built
seam. H1 is not partially shippable (a claimant landing while the rented seams survive is exactly the
"old map beside the new" the constitution bans).

### 9.1 Coordination with density S3 (same surfaces)

`density-pass-spec.md:275` puts S3 on "CONTEXT panel surfaces (rpg tabs, meta tabs)", precondition
"AFTER Tracker stage 2 rebuilds them". **TRK stages 1+2 have shipped**
(`docs/design/tracked-field-unification.md` status line, stage 2 `98ee6da2`), so S3 is unblocked today —
and would land straight into a surface HUD-1 is about to re-compose.

**Ruling this spec proposes:** density **S0 + S1 + S2 first** (they are token/primitive/mechanism work
and touch no context surface), then **HUD-1 H0–H3 built ON the tier map and voices**, then **S3 becomes a
thin conformance sweep + side-eye** rather than a restyle. Rationale: HUD-1 rewrites the very elements S3
would touch, and S1's `Text.voice`/`Section.kicker`/`Surface` are precisely the primitives §4 and §7 ask
the HUD to speak. The alternative (HUD-1 first on today's primitives, S3 sweeps after) also works and is
recorded as owner decision 8; what is NOT acceptable is running S3's context row and H1 concurrently on
the same files ([[concurrent-main-lanes-gate-thrash]]).

### 9.2 Verification recipes (snap, per stage)

The panel needs a model-populated game, not seeded data ([[seeded-data-never-verification]]). Base recipe
([[snap-rpg-panel-recipe]]):

```bash
pnpm snap --dirty --wide --open-chat "<a real game chat>" \
  --click '[aria-label="Show detail panel"]' --context-tab rpg.scene --out hud-scene
# the ambient-less case (H3):  --context-tab rpg.status on a game with no ambient set
# the admin fold (H2):         --context-tab settings   (the rail's own active state)
# the no-claim regression:     --open-chat "<a non-game chat>" --context-tab settings
# geometry (H1/H3), computed — never authored:
pnpm snap --base http://localhost:5273 --eval '(document.querySelector("[data-context-region]").getBoundingClientRect().height)'
```

Every stage ends with a `side-eye` pass against `docs/design/mocks/panel-redesign/` and all findings fixed
before the stage closes.

---

## 10. Test plan

**Unit (`tests/client/lib/registry-contracts.test.ts`, extend):**

1. no claimant ⇒ `resolved.region` is `undefined` and `tabs`/`actions` are byte-identical to today
   (the regression floor for six sections);
2. one claiming region ⇒ `region` present, and `tabs` STILL carries the full resolved set (the HUD is
   handed everything — a region must never suppress resolution);
3. a non-claiming region contributor ⇒ ignored;
4. two contributors both claiming ⇒ FIRST wins deterministically (documented, and gate arm 6 makes the
   case unbuildable);
5. the duplicate-tab-id throw is unchanged with regions present.

**CT (`tests/client/features/app-shell/components/`):**

6. `context-region-host.ct.tsx` — a FAKE claimant renders; it receives the resolved tabs; clicking a
   rendered cell calls `selectTab` and the STORE changes ([[assert-the-mutation-fired]] — assert the seam
   fired, not a UI reaction); `activeTab` reflects a stored value, then the `defaultTab` flag, then first.
7. `context-tabs-panel.ct.tsx` (existing) — with no claimant, ONE strip, no bracket, `aria-label="Detail"`
   (the pre-HUD contract, now permanent for generic sections).
8. **computed geometry** (done ≠ rendered): the admin rail's `bottom` equals the region's `bottom` on a
   SHORT body AND on a TALL one (pinned, no layout jump between them) and the viewport scrolls; the band's
   ember edge sits at the pane's row 0, full-bleed; a stacked cell's box holds glyph over caption (the
   children measured against their own line-box/aspect — a crushed cell does not overflow); band + strips
   ≤ 30% of region height. All ratios/relations against resolved token values, never hardcoded px.
9. a11y: two tab groups with their labels ("Game state" / "Chat" — the game rail's name may not collide
   with the admin rail's crown "Game" TAB), arrow-key roving focus inside each, the active tabpanel named
   by its cell (`aria-labelledby`), the PHASE-locked Map cell reachable and activatable from BOTH mouse and
   keyboard with its reason on `title`, decoration `aria-hidden`.
10. `rpg-context-section.ct.tsx` (existing) — updated for the deleted `header` contribution; the band's
    content is asserted through the HUD region instead.

**Gate fixtures:** `mustFlag` for each new arm (a second `defineContextRegion` call site; a hand-rolled
region literal; a feature file carrying `shell-panel-header`; a second `data-context-region` writer) and
`mustPass` for the legal one, with `at:` paths at both a shallow and a deep path
([[gate-scanroot-vs-getfilepath-path-format]]).

**Not run in-lane:** whole-tree `pnpm check` / the full battery — orchestrator's, on a quiesced tree.

---

## 11. Homes — the file map

| file | change |
| - | - |
| `packages/client/src/lib/registry-contracts.ts` | ADD `ContextRegionView` / `ContextRegionDef` / `defineContextRegion` / `ResolvedContextTabs.region` + the resolve line; DELETE `ContextTabDef.header`, `contributedHeader`, `ContextTabStrip`/`strip` (per decision 5) |
| `packages/client/src/features/app-shell/components/context-region-host.tsx` | NEW — assembles `ContextRegionView`, writes `data-context-region`, renders the claimant |
| `.../app-shell/components/section-context-host.tsx` | route to the region when claimed; `SectionContextHeader` returns null then |
| `.../app-shell/components/context-tabs-panel.tsx` | DELETE the bracket branch + `edge`/`TAB_EDGE_CLASSES`; extract the active-tab resolution into the shared hook |
| `.../app-shell/components/panel-chrome.tsx` | the CONTEXT band becomes conditional on a non-null header |
| `.../app-shell/surfaces/shell.css` | DELETE the count-6/7 thresholds + the context-band growth exception |
| `packages/client/src/features/rpg/lib/rpg-hud-region.tsx` | NEW — the claim + the composition |
| `packages/client/src/features/rpg/components/rpg-hud-*.tsx` | NEW — band host (moves out of `rpg-header-band.tsx`'s contribution shape), game strip, admin rail |
| `packages/client/src/features/rpg/lib/rpg-context-section.tsx` | tabs keep their defs; the `header` contribution + `strip` flags leave |
| `packages/ui/src/charts/meter/variants.ts` (+ `waystone.tsx`) | `compact` arm on the one sizing home (H3) |
| `packages/client/src/main.tsx` | assemble the `regions` contributor registry (the door — G8) |
| `scripts/check/gates/context-definition-shape.ts` | arms 5–8 + fixtures |
| `docs/architecture/Context-Panel-Program.md` · `.../client-architecture-lockdown.md` · `docs/design/density-pass-spec.md` | the §5.2 amendments |

---

## 12. Owner decisions — flagged, with recommendations

> Nothing below is decided. 1 is the ratification the whole spec hangs on; 2–3 are the genuine
> architecture forks; 4–10 are shape/taste calls that only need a yes/no.

1. **Ratify the fold: the meta tabs live INSIDE the HUD as its administration voice** (§4) — same defs,
   same ids, same position (below the viewport), new grammar (kicker + label voices, crown-gold host
   cells, shared active treatment).
   **Recommendation: YES.** It keeps the audit's one confirmed strength (state-vs-admin is real; admin
   stays reachable mid-scroll), it is the only shape that lets the selection echo across the split, and
   it moves zero functionality. *Alternatives if vetoed: (a) admin stays a shell-rendered strip below the
   HUD — F6 defect 3 survives; (b) admin moves behind one "Chat" door — CP-4 §4.1 argued this down.*

2. **The claim is over the WHOLE pane, not a region inside it** (§3.1 vs §3.5) — the owner's own steer,
   recorded here as a decision because it is the load-bearing fork.
   **Recommendation: whole pane.** Equal mechanism cost, and only this arm can fix all four F6 defects.

3. **Suspend D66 A1 (the always-present band) for a CLAIMED context panel** (§5.2) — the HUD paints the
   pane's top edge, including the 2px ember content↔context binding.
   **Recommendation: suspend.** The context band already broke the shared horizon to fit the takeover
   (`shell.css:321-327`); this makes the exception honest and gives it an owner. *If refused, the whole
   program falls back to the region-inside-panel shape (§3.5) and F6 defect 4 is only half-fixable.*

4. **Does the HUD render the admin tab BODIES in the same viewport?**
   **Recommendation: yes — one viewport, all tabs.** The handed `node` renders in the same scroll region;
   nothing about a body changes. *Alternative: admin bodies open in a sheet/overlay above the HUD — more
   chrome, a second dismissal model, and it re-buries the mid-game fixes.*

5. **Keep `ContextTabDef.strip` as a declarative rail-membership flag, or let the HUD decide membership
   by id?**
   **Recommendation: KEEP `strip`** (rename its doc to "rail membership", not "bracket assignment") —
   membership is a property of the tab's job, chat's own tabs stay `"meta"` without knowing a HUD exists,
   and an id-prefix rule (`rpg.*` ⇒ game) would break the moment a non-rpg contributor ships a state tab.

6. **The space below the admin rail on a short body** (§7.1): leave it as empty panel ground, or fill it?
   **Recommendation: leave it empty.** Filler is invented content; the honest read is "the game has
   little state right now". Revisit with real screenshots after H1.

7. **Ambient-less band: compressed stone, or no stone?** (§7.3)
   **Recommendation: compressed stone.** The unset stone teaches (it is the promise of what fills in), and
   `Waystone compact` keeps ONE sizing home. *Alternative: drop the stone entirely when unset — cheaper,
   but the band then looks unbuilt ([[empty-states-are-load-bearing]]).*

8. **Sequencing vs the density pass** (§9.1): density S0–S2 → HUD-1 → S3-as-conformance
   (**recommended**), or HUD-1 first on today's primitives with S3 sweeping after.
   **Recommendation: density mechanism first.** The HUD wants `Text.voice`/`Section.kicker`/the tier map
   the moment it is composed; building it twice is the only cost of the other order.

9. **Do the six generic sections keep the container-query label reveal at counts 1–5?** (§5.1 deletes
   only 6/7.)
   **Recommendation: keep.** They have 2–4 tabs, the mobile full-width sheet does reveal words, and it is
   working code with no defect against it.

10. **Amendment weight** (§5.2): CP-4 §4.2 SUPERSEDED wholesale, or amended in place with the IA rulings
    preserved?
    **Recommendation: amended in place.** The IA (state above / admin below, one selection, icon density,
    locked-visible tab, orbs) is what the mocks and the build both still obey; only the SEAM claims are
    wrong. *The D-entry itself is the orchestrator's to mint.*
