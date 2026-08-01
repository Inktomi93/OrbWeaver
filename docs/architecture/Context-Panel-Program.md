---
kind: spec
status: active
updated: 2026-07-25
---

# Context-Panel Program — consolidation → width → trackers → the rpg takeover

> **Owner-initiated 2026-07-25** ("I think this is the section I want to work on next"). Working spec
> for the CONTEXT column; the board is `docs/retro-workboard.md`, the law is
> `core/UI-Architecture-and-Layout.md` §4.1–4.3 (D62/D66) + `core/client-architecture-lockdown.md`
> §6b (`defineContextTabs` / `ContextTabsPanel`). This doc ADDS content to the pane and re-groups its
> tabs; it never changes the shell geometry (CONTEXT stays a fixed-width, closable, never-navigation
> side panel — the four-region anatomy is invariant; the takeover replaces ONLY the CONTEXT pane,
> never the three main panes; app settings stays a MODAL).
>
> **Sharpened 2026-07-25** (design pass): CP-1/CP-2 marked SHIPPED; CP-3 respecced as the shared
> tracker block kit; CP-4 expanded from a sketch into the buildable blueprint. Refreshed mockup:
> `docs/design/mocks/rpg-shell-mockup-v2.html` (v1 kept as the pre-sharpening record).

## 0. Why (receipts, 2026-07-25)

- **Underfill**: live widescreen check — the chat Members tab renders 3 rows (name · bare "50%" ·
  kebab) in a full-height column; the rest is void. The column does not earn its width.
- **Tab clip (side-eye P3)**: 5 tabs (Members · Overrides · Group · Preview · Injections) truncate at
  the default panel width with no overflow affordance; a 6th (Trackers) is already planned.
- **Duplication (§13 IA rule)**: the chat title + avatar cluster render in the topbar AND again in
  the panel header, 300px apart.
- **The owner's direction**: repurpose the column in rpg/rpg-lite as the OSRS right panel — reference
  image committed at `docs/design/mocks/osrs-fixed-interface.png`; lite mode is a steering posture
  over NORMAL chat (D101 lite tier; the guided-generations audit §5 convergence — one ChatInjection
  steering channel — `docs/reviews/stickler/2026-07-25-guided-generations-parity-audit.md`).

## 1. CP-1 — Tab consolidation — **SHIPPED**

Landed as specced (`chats-section.tsx` `CHAT_CONTEXT_TABS`): Overrides + Group merged into ONE
**Settings** tab (grouped sections on the settings-modal idiom); the strip is Members · Settings ·
(Preview, host) · Injections — 5 max post-Trackers, never 6. The former Group tab's host+group gate
moved DOWN to the "Group behavior" section (`showGroup` — §8.1 PERMISSION-omit at section
granularity). **Roster-size gating (owner ruling)**: group controls OMIT on a solo chat
(1 character + 1 human) — APPLICABILITY gating; the doorway is the topbar roster menu ("Members —
N" renders on EVERY chat; on solo it opens the compact roster menu with "Add a character"), so
solo→group stays reachable with one home. Panel-header identity de-dup landed too: the topbar owns
the avatar+title cluster; the CONTEXT band reduced to neutral chrome (`ChatContextHeader` deleted —
CP-4's scene banner is a NEW `header`-slot component, not a resurrection).

## 2. CP-2 — Width + the container-responsive strip — **SHIPPED**

- `--dimension-panel: clamp(17rem, 24vw, 26rem)` landed via the D71 seed (`theme.css:79`,
  `tokens/index.ts:80` — GENERATED homes, regenerate never hand-edit). D62 unchanged: CONTEXT is a
  fixed token column, not a width recipient.
- The tab strip landed **container-responsive** (`shell.css .ctx-tab-strip`, per-tab-count
  `@container` thresholds): word labels render only when the container fits EVERY current tab's
  label; otherwise icon + `title` + `aria-label` (the label stays the accessible name —
  `context-tabs-panel.tsx`). **Measured reality: at the 26rem max even 4 labels don't fit — the
  strip is icon-mode in the shell, always.** The OSRS icon strip is therefore not a future costume;
  it is the shipped default. CP-4 inherits this mechanism verbatim and merely adds tabs + a second
  strip row.

## 3. CP-3 — The tracker block kit + the Trackers tab (BUILD-GATED; design fixed here)

### 3.1 One block kit, three mounts — the anti-duplication ruling

The cohesion game plan (`docs/history/design/rpg-lite-and-full-cohesion-game-plan.md`) and D101 make trackers
ONE concept that surfaces at three escalation rungs. The rule: **one component family (the block
kit), mounted in different tab sets — never re-implemented per rung.**

| Chat shape | CONTEXT wears | Trigger (derived, never a user toggle) |
| - | - | - |
| normal chat, no steering data | the CP-1 standard strip (4–5 tabs) | default |
| normal chat + steering data (guides/trackers via the ONE ChatInjection seam) | standard strip **+ Trackers tab** (the reserved 5th slot) | ≥1 tracker-class injection exists |
| rpg-lite game | the CP-4 takeover, **lite trim** (§4.4) | `chats.metadata.rpg` pointer, `mode: "lite"` |
| full rpg game | the CP-4 takeover, **full roster** (§4.3) | `chats.metadata.rpg` pointer, `mode: "full"` |

When a chat IS a game, the Trackers tab is OMITTED — its blocks live inside the takeover's Status /
Scene tabs. One concept, one home per rung, never both at once.

**OWNER RULING (2026-07-25): there is NO party system — scrapped.** The ROSTER is the ONE
membership; the takeover's game-state tab is a LENS over roster participants (id `rpg.status`),
never a second membership with its own join/leave. No "join the party" language or doorways
anywhere; membership changes happen in Members (roster admin), period.

### 3.2 The block kit (visual anatomy — the OSRS stat-row idiom, tokenized)

Seven blocks, all `tabular-nums`, all label-carrying (a bare number failed the CP-1 cold read once
already — never again). **Every block is EDITABLE IN PLACE** (host everywhere; a member their own
row) — display-only trackers are the corruption-trainer failure (owner, 2026-07-25: lite died last
time because nobody could ENTER or SEED data mid-chat); entry is never a separate mode, and the
Game tab is merely the BULK editor, not the only door:

- **Meter row** (pools, per-member meters): `label · value/max` text line + a 6px track bar
  underneath. The bar is decorative (`aria-hidden`); the TEXT is the datum. Track colors ride the
  generated track ramp (§4.8), never color-alone meaning.
- **Stat cell** (attributes): compact grid cell — big value over small label (`16 / STR`), the
  profile hint as `title`. 2-up (lite trim) to 3-up (wide) grid — the OSRS skills-panel idiom.
- **Chip** (text trackers, guides, conditions): the existing pill idiom — `label — value`
  ("mood — wary"). Persistent-guide chips get a leading gauge glyph to distinguish them from
  conditions.
- **Cast card** (scene NPCs): name + mood line + customFields as chip rows.
- **Beat line** (recentEvents): timestamp-less one-liners, muted, newest first.
- **Ambient strip** (location · date · time-of-day · weather): one compact chip row, hand-editable,
  model-writable via `update_scene` (cohesion-plan delta: the tool arg gains ambient fields, the
  §4.3-gap pattern). MODE-AGNOSTIC DATA, not an engine — lite gets it in v1 (owner: "location,
  time of day, weather, date — all core things for lite"); the full-mode time/weather ENGINE stays
  a separate, later plane that merely WRITES these same fields.
- **Goal line** (objectives): free-text goal + optional `n/m` clock segment, done-strikethrough.
  Rides custom widgets (`source:"custom"`) — NO quest engine required. This is lite's quest
  tracker (owner: "we had no quest tracker or quest log" — never again); full's Quests tab renders
  the engine-backed version with the same visual block.

### 3.3 The Trackers tab (normal chat)

- **Id/icon**: `trackers` · lucide `Gauge`.
- **Content**: ambient strip (when set) → pool meters (meter rows) → goal lines → guide chips →
  free text-tracker chips, in that order.
- **Gating**: the tab renders when ≥1 tracker-class injection exists on the chat — APPLICABILITY
  omit. The doorway is the **Injections tab** (the authoring home; trackers ride the same
  ChatInjection channel — Injections = author, Trackers = glance; two lenses, one seam, and the
  doorway rule is satisfied without a permanently-empty tab). No tracker DATA exists in the tree
  today (rpg purged), so the whole tab is build-gated on the steering wave (D59 persistent guides).
- **No ghost tab**: an entirely unbuilt PROGRAM contributes nothing to the strip. PHASE
  disable-with-reason applies to a gap INSIDE a shipped surface (§4.3's Map tab); it does not mean
  every planned feature haunts the strip as a disabled stub.
- **States**: loading = 3 skeleton meter rows; error = the standard `QueryErrorState`; the empty
  state cannot occur (data-gated mount).

## 4. CP-4 — The OSRS takeover (rpg rebuild scope; the blueprint)

The committed visual references (all `git add -f`'d past the reports gitignore — cited records rule):

![The OSRS fixed-screen interface — the source anatomy](../design/mocks/osrs-fixed-interface.png)

![The CP-4 v1 mockup — pre-sharpening record](../design/mocks/rpg-shell-mockup.png)

(`docs/design/mocks/rpg-shell-mockup-v2.html` is the SHARPENED mockup reflecting this section —
render it for the current picture; v1 + its PNG are the pre-sharpening record.)

### 4.0 What the reference actually is (read from `osrs-fixed-interface.png`)

The OSRS fixed interface is: **two icon-only tab rows BRACKETING a single fixed-width viewport** —
top row = game state (combat, skills, quests, inventory, equipment, prayer, magic), bottom row =
meta/social (clan, account, settings, emotes, music); the active tab tints its cell; the viewport
swaps wholesale per tab; above it sits the minimap with **data orbs** (hp/prayer/run as ring gauges
with numbers). The load-bearing ideas we take: the bracket (state above / administration below),
icon-only density, the single swapped viewport, orbs as glanceable vitals, and locked tabs that
stay visible. What we do NOT take: bevelled stone chrome, pixel fonts, textures — skin is a theme
concern (§4.8).

### 4.1 Enter / exit (position: the takeover is APPLICABILITY, not a mode toggle)

The takeover is **not a state the user enters** — it is what the CONTEXT pane resolves to when the
active chat carries a game (`chats.metadata.rpg`, lite or full). Context-follows-content, same as
every section:

- **Enter**: open/select a game chat, or the moment `createGame` commits on the current chat. The
  pane content swaps like any chat switch — no ceremony, no takeover animation. (A game is content,
  not an event.)
- **Exit**: select a non-game chat, or the game row is gone. Draft chats never take over (games
  exist only on committed chats — drafts keep the draft tab set).
- **Closability unchanged**: the pane stays closable/overlay per D62. The takeover never earns an
  exemption from shell law.
- **Tab-selection continuity for free**: `contextTab` is the shared #state seam; game tab ids are
  namespaced (`rpg.status`, …) and the resolver already falls back to the first visible tab when the
  stored id is absent. Switch game→normal chat: falls back to Members. Switch back: `rpg.status` is
  still stored and resolves again. Zero new state.

**The standard tab set is SUBSUMED into the bottom strip — not hidden, not behind a meta-tab.**
Argued: Members/Settings/Injections/Preview are exactly the tabs someone reaches for mid-game to
fix something (mute a character, tweak overrides, adjust an injection); burying them one level deep
behind a "chat" meta-tab taxes the moment of need. OSRS itself answers this — its settings/social
tabs sit one click away in the bottom row, never in a submenu. The bottom strip IS the answer.

### 4.2 Anatomy (the bracket, bound to our seams)

```
[ .shell-panel-header band — the 2px ember inset edge (landed) stays ]
[ SCENE BANNER + POOL ORBS — the defineContextTabs `header` slot (exists today) ]
[ TOP STRIP — game-state tabs (rpg-contributed)          ] ─┐ one selection
[ VIEWPORT — the active tab's panel, scrolls internally  ]  ├ model across
[ BOTTOM STRIP — meta tabs (CP-1's set + Game/GM)        ] ─┘ both strips
```

**Two strips, ONE selection model** — the position on "their bracket vs our single strip": keep the
bracket. It is the signature of the idiom AND it encodes real IA (what you watch above; what you
administer below), and it solves arithmetic — up to 12 tabs cannot share one row at the 17rem
floor. Behavioral contract (implementation left to the builder against Base UI):

- Exactly ONE tab is selected across both strips; the viewport shows its panel. Selecting in one
  strip deselects in the other.
- Each strip is its own a11y group (`aria-label="Game"` / `aria-label="Chat"`), its own arrow-key
  roving-focus row, Home/End within the strip. Both drive the same `contextTab` seam.
- Both strips are `.ctx-tab-strip` containers (icon-mode by landed default; per-count thresholds
  extended to counts 6–7 in shell.css when built).
- The bottom strip renders ONLY when game-strip tabs resolved — standard chats keep today's single
  top strip untouched. The bracket exists only in takeover.

> **§4.2 (AMENDED 2026-08-01, HUD-1 H1).** The bracket anatomy below describes the HUD's OWN composition, not a set of shell slots it occupies. When a chat carries an ENGAGED game the rpg feature CLAIMS the whole CONTEXT pane (`ContextRegionDef`, `client-architecture-lockdown.md` §6b/§6c): the shell renders the `.shell-panel` mechanics and hands the claimant the resolved tabs + the one selection; the claimant renders the band, both rails, and the viewport itself. The `.shell-panel-header` band, `.ctx-tab-strip`, and the two-strip branch of `ContextTabsPanel` are NOT used by the takeover — the branch, the `edge` prop, the count-6/7 reveal thresholds and the band's growth exception are DELETED, and §4.11's registry deltas 1, 2, 3 and 5 are RETIRED (they described the rented seams). `ContextTabDef.strip` SURVIVES, re-read as RAIL MEMBERSHIP: a property of the tab's job, declared by its owner, which the GENERIC panel ignores. The IA rulings survive unchanged: state above / administration below, ONE selection across both rails, icon density, the single swapped viewport, the locked-but-visible tab, and orbs as glanceable vitals.

### 4.3 Tab roster — full rpg (top strip, 7 · bottom strip, ≤5)

**Top strip (game state):**

| # | Id | Label | Icon (lucide) | Gate | Content blocks (kit §3.2) | Empty state |
| - | - | - | - | - | - | - |
| 1 | `rpg.status` | Status | `HeartPulse` | always | ROSTER rows (the roster IS the membership — this tab is its game-state lens): **headshot portrait** (the @orb/ui media primitive, D44 — same avatar the roster shows everywhere) + name + className flavor + labeled pool meters + condition chips; **encounter block when live** (round counter, initiative order, turn marker) — the encounter surfaces HERE, badged, not as a transient 8th tab | "No pools defined yet — set them up in Game." (doorway: `rpg.game`) |
| 2 | `rpg.sheet` | Sheet | `ScrollText` | always | the VIEWER's sheet: attribute grid over the profile vocabulary (stat cells, hint on `title`), skills list, pool defs + "Add meter" (member-own row per the 07 §3.1 axis) | "No sheet yet — define attributes in Game." (doorway: `rpg.game`) |
| 3 | `rpg.inventory` | Inventory | `Backpack` | always | member selector (self default) + dense grid: 5-col square cells, qty in corner, item name on `title` — the OSRS inventory idiom. A **currency line** pinned above the grid once money is modeled (§6 Q6 — the "found out late" gotcha; the SLOT is reserved now either way). No capacity/encumbrance UI (not modeled — do not invent) | "Empty pack — the story fills it." |
| 4 | `rpg.scene` | Scene | `Drama` | always | **ambient strip** (location · date · time · weather — §3.2, hand-editable) → present-cast cards (name · mood · customFields) → **goal lines** (§3.2) → subjectName-grouped custom widgets → **last-3 beats strip** ("Just now"). Scene = NOW; Journal = the record — window vs archive, distinct jobs, honest near-dup accepted | "No one on stage yet." |
| 5 | `rpg.quests` | Quests | `Flag` | full only (lite: APPLICABILITY omit) | active quests + clocks (segmented rings, `n/m` text). Change-badged | "No quests yet — play on." |
| 6 | `rpg.journal` | Journal | `BookOpen` | full only (lite: APPLICABILITY omit) | the beats archive + session wraps | "The record starts when the story does." |
| 7 | `rpg.map` | Map | `Map` | full only; **PHASE disabled-with-reason until MA-3** | the region map | disabled tab: `aria-disabled` + `title` "Maps unlock with the map arc (MA-3)" — the OSRS locked-tab pattern, per the no-omissions law |

**Bottom strip (meta — CP-1's consolidated set + one game-admin home):**

| Id | Label | Icon | Gate | Content |
| - | - | - | - | - |
| `members` | Members | `Users` | CP-1 rules unchanged | roster ADMINISTRATION (add/remove/host/talkativeness) — Status is the roster's game-state lens, Members is its admin; two lenses on the SAME roster, distinct jobs (the top/bottom split IS that distinction) |
| `settings` | Settings | `Settings` | always | the shipped CP-1 body (Appearance overrides · Group behavior per gating) |
| `injections` | Injections | `Syringe` | always | the shipped manager (the steering channel's authoring home stays here in games too) |
| `preview` | Preview | `Eye` | PERMISSION omit (host) | assembly preview, unchanged |
| `rpg.game` | Game | `Crown` | PERMISSION omit (host) | mode-aware game admin, ONE home: **full** = GM console (scenes · widgets · session wrap · mode flip); **lite** = Stats & Trackers editor (profile rows, pool defs, widget CRUD) + steering note + "Graduate to full". This is also the lite→full DOORWAY the APPLICABILITY-omitted Quests/Journal/Map tabs point at — graduation is host-gated, so the doorway lives where the permission lives |

### 4.4 Tab roster — lite trim

Top strip: **Status · Sheet · Inventory · Scene** (4). Quests/Journal/Map are APPLICABILITY-omitted
(lite's MODE\_POLICY excludes those data planes — mode shape, not a phase; the doorway is
`rpg.game`'s graduation control). Bottom strip: identical to full (`rpg.game` body wears its lite
arm). Lite deltas inside the shared tabs:

- **Status**: pools ARE the meters (no hp unless defined as a pool — nullable combat slots per the
  cohesion plan §8); no encounter block ever.
- **Sheet**: attribute grid over the (often `freeform`) profile; no skills list.
- **Scene**: lite's centerpiece — **ambient strip + cast + customFields + goal lines + widgets +
  beats**; this is where the CP-3 Trackers blocks live once the chat is a game. Ambient and goals
  are IN lite v1 (they are scene DATA, not the full-mode time/weather/quest ENGINES — the owner's
  late-game gotcha list: location/date/time/weather + a goals ledger are core lite steering).
- **Read-only trackers arm** (non-tool model, honest-arms doctrine): a header pill
  "Trackers read-only" (`title`: "This model can't update trackers — they still steer the story;
  edit them by hand"). Derived per-turn, disappears when capability resolves. Never a silent
  degrade.

### 4.5 The header: scene banner + pool orbs (the `header` slot)

Mounts in the existing `ResolvedContextTabs.header` band slot — a NEW component, per the CP-1
de-dup note. Two lines max at the 17rem floor:

- **Line 1 — orientation** (BOTH modes): location ("The Rusted Lantern — Common Room") · `day 3 ·
  night · rain`, rendered from the AMBIENT STRIP data (§3.2 — scene data, mode-agnostic; the
  full-mode engine merely writes the same fields). Distinct job from the topbar's identity echo —
  topbar says WHICH chat, the banner says WHERE/WHEN in it. No ambient set → the row shrinks to
  orbs (+ lite's read-only pill when present).
- **Minimap allowance (MA-3, reserved NOW)**: the banner region is the future minimap's home — when
  the map arc lands, line 1 compresses to a caption strip under a square minimap viewport, orbs
  flanking it (the OSRS anatomy verbatim: minimap + orbs above the tab bracket). The reservation
  costs nothing today (the `header` slot already owns this band and the panel is fixed-width);
  nothing else may claim the band. Orb slots are likewise EXTENSIBLE — new orb kinds (run-energy
  analogues: alert level, turn timer) are additive entries in the same row, never a new surface.
- **Line 2 — pool orbs** (the OSRS data-orb slot): up to 3 ring-gauge orbs, 28px, value inside in
  `tabular-nums`, pool label as `title` + visually-hidden text. Full: hp orb first, then the first
  2 pool defs; lite: first 3 pool defs. Zero pools → no orb row. **Orbs are ring GAUGES (arc =
  value/max), never bare circled numbers** — v1's circled "7/4" read as notification counts.
  Overflow pools live in Status/Sheet; pinning beyond first-N is an open question (§6).

### 4.6 States (the full matrix)

- **Active tab**: the landed treatment — `data-active` ember tint + indicator; identical in both
  strips.
- **Hover**: existing hover surface; `title` reveals the name (landed icon-mode behavior).
- **Badge**: a 6px corner dot = "changed since you last viewed this tab" (per-tab lastSeen in
  \#state, session-scoped; set by the same bus events that invalidate the tab's queries). A COUNT
  badge only where a real count exists (pending GM proposals on `rpg.game`). Never rendered on the
  active tab. Badge is supplementary — the dot never carries sole meaning (the tab content states
  the change).
- **Disabled (PHASE)**: visible, `aria-disabled`, reduced opacity, mini lock glyph, reason on
  `title` (the \[base-ui-disabled-menuitem-title] pattern — never a tooltip wrap).
- **Loading**: per-tab skeletons in the block kit's own shapes (meter-row skeletons, grid-cell
  skeletons) — never a spinner-only void.
- **Error**: the standard `QueryBoundary`/`QueryErrorState` per tab body, as Injections does today.
- **Empty**: per-tab copy in §4.3's table — every empty state is an invitation or an explanation,
  never a blank viewport.

### 4.7 Density + typography ("game rail" without a costume)

- The takeover body runs the COMPACT spacing scale scoped to the panel (a `data-takeover` hook on
  the panel body mapping the four spacing intents to their compact values — same values as
  `data-density="compact"`, scoped): the game rail is always dense; the app density toggle keeps
  governing everything else.
- All values `font-variant-numeric: tabular-nums`. Section labels = the existing muted
  letter-spaced caps idiom. Body text stays the app scale — **no pixel font, no medieval display
  face**: the OSRS feel comes from structure (bracket, grid, orbs, stat rows), not cosplay.
- Meters 6px, grid cells square, tap targets ≥ 32px (strip tabs keep the landed hit-area).

### 4.8 Theming — the D71 route (position: skin is a THEME concern)

- **Structure is registry, skin is tokens** (unchanged ruling, now concrete): every takeover
  component consumes existing intent tokens (`--color-sidebar*`, `--color-card`, `--color-primary`,
  `--color-muted-foreground`, …). The takeover must read correctly under EVERY theme.
- **One token addition**, minted through the D71 pipeline (generated seed value-sets, light-dark()
  intents — new theme = add a json): a 6-step categorical **track ramp** (`--color-track-1..6`) for
  pool/meter/clock fills — pools are user-defined data and need stable categorical color; the ramp
  also serves future charts. Seeds ship derived defaults; any theme json may override. No other
  bespoke rpg color exists; meter meaning never rides color alone (§3.2).
- **The stone/parchment RS skin, if wanted, is an OPTIONAL seed THEME** ("grimstone" json — palette
  only, per D71; themes stay palettes, no texture assets). It restyles the whole app for those who
  want the vibe; the takeover neither requires nor special-cases it. (Ship/skip = owner call, §6.)

### 4.9 A11y (the icon-only strip, squared)

- Every tab: `aria-label` + `title` always (the landed never-nameless rule); the visible word is
  what disappears in icon-mode, not the name.
- Two strips = two labeled tab groups ("Game"/"Chat"), each its own arrow-key row; the viewport is
  `aria-labelledby` the active tab.
- Meters/orbs: the value TEXT is the accessible datum; bars/rings `aria-hidden`. Orbs carry
  visually-hidden `label value/max`.
- Disabled Map stays focusable-discoverable (`aria-disabled`, not `disabled`) so the unlock reason
  is reachable.
- Badges: the dot is `aria-hidden`; changed-ness is announced by the tab content, not the dot.

### 4.10 Small width + mobile

- 17rem floor: 7 icon tabs × \~34px = \~238px — fits with margin; icon-mode guarantees the strips
  never scroll in-shell. The safety `overflow-x-auto` (landed) stays for pathological hosts.
- Mobile (<48rem): the panel is already a full-width sheet between topbar and tab bar — the
  takeover rides it unchanged; strips gain room, labels may reveal per the container thresholds.
- Overlay/collapsed modes: unchanged; the takeover is panel CONTENT, invisible to panel mechanics.

### 4.11 Mechanism — the registry deltas (recorded now, built in the rpg rebuild)

All grafting rides the §6c contributor registry (`chatContextContributors`) — rpg never imports
chat. Seam deltas the takeover needs (design-recorded; the lockdown doc governs the how):

1. **RETIRED (§4.2 amendment, 2026-08-01, HUD-1 H1)** — `ContextTabDef` gains `strip?: "game" |
   "meta"` (default `"meta"`) — the bracket assignment. Described a rented seam; the takeover
   claims its own pane instead. `strip` itself survives as rail membership (§4.2).
2. **RETIRED (§4.2 amendment, 2026-08-01, HUD-1 H1)** — `ContextTabsPanel` renders a second strip
   below the panels when any resolved tab is `strip:"game"`; both strips share the one
   `contextTab` selection seam (§4.2 contract). Described a rented seam.
3. **RETIRED (§4.2 amendment, 2026-08-01, HUD-1 H1)** — the scene banner + orbs ride the EXISTING
   `header` slot (`ResolvedContextTabs.header`) — no new mount. Described a rented seam; the
   claimant paints its own band.
4. `ContextTabDef` gains `badge?: (s) => number | boolean | null` and
   `disabledReason?: (s) => string | null` (PHASE rendering per §4.6).
5. **RETIRED (§4.2 amendment, 2026-08-01, HUD-1 H1)** — shell.css `.ctx-tab-strip` gains count-6/7
   thresholds; the takeover density hook lands beside the existing `data-density` rule. Described
   a rented seam.
6. Game tab ids namespaced `rpg.*`; the meta set keeps CP-1's ids so selection state survives
   mode transitions.

Persona machinery is untouched throughout — the takeover renders state; persona pin mechanics are
owner-sacred and no takeover flow alters them.

## 5. Sequencing + laws

**CP-1 + CP-2: SHIPPED.** **CP-3** rides the steering/persistent-guides wave (D59) and ships the
§3.2 block kit as its deliverable — CP-4 consumes the kit, so CP-3's components are specced as
shared from birth. **CP-4** is the rpg rebuild's client centerpiece; this doc + the reference image

- mockup v2 are its inherited design intent.

Binding laws: `defineContextTabs` registry only (lockdown §6b) · CONTEXT never navigation, closable,
fixed width (D62 §4.2) · gating classes used precisely — PHASE = disable-with-reason (Map/MA-3),
PERMISSION = omit (Preview, Game/GM, group section), APPLICABILITY = omit + keep-the-doorway
(solo-roster group controls → topbar roster menu; lite's Quests/Journal/Map → `rpg.game`
graduation; Trackers tab → Injections authoring home) · one home per concept (tracker blocks: §3.1
rung table; game admin: `rpg.game`; the ONE roster: Members administers it, Status is its
game-state lens — no party system, per the §3.1 owner ruling) ·
tokens only; new tokens (the track ramp) ride the D71 pipeline; skins are themes.

## 6. Open questions (owner)

1. **Grimstone**: ship the optional stone/parchment seed THEME alongside the takeover, or leave the
   takeover on the user's theme only? (Structure works under all themes either way; the skin is
   pure appetite.)
2. **Orb pinning**: first-N-by-definition-order (zero UI, the spec's default) vs an explicit
   "pin to header" control on pool defs (more control, one more setting to own).
3. **Encounter surface** (full): the spec puts the live encounter block inside Status (stable
   roster, badged). The louder alternative is a transient encounter tab that exists only while an
   encounter runs. Status is the recorded position — veto if you want the drama.
4. **The track ramp**: mint `--color-track-1..6` through the D71 pipeline now (theme-controllable,
   also serves charts) vs derive fills at runtime from `--color-primary` hue rotation (zero new
   tokens, no per-theme control). The spec assumes the ramp.
5. **Injections in full games**: the spec keeps the Injections tab in the takeover's bottom strip
   for parity (steering authoring home everywhere). If full games should route ALL steering through
   the GM console instead, say so — that would drop the bottom strip to 4 for hosts.
6. **Money/currency**: NOT modeled anywhere in the cohesion plan (the owner's "found out late"
   gotcha). Options: (a) a first-class `currency` slot on `partyState[]` (named + amount,
   `update_inventory` writes it) — the spec's lean recommendation, and the Inventory tab reserves
   its pinned line either way; (b) currency as a pool ("Gold" meter — abuses value/max); (c) a
   plain inventory item ("120 gold coins" — works today, invisible to any future shop/cost
   mechanics). Pick (a) at rebuild time unless vetoed.
