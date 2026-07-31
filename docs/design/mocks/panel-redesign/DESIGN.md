# The RPG Context Panel — redesign rationale

Design deliverable, 2026-07-27. Gallery: `index.html` (open that one file). Mockups are standalone
HTML, one per tab + the header band + a feature showcase, each with a desktop frame (the docked
CONTEXT column at its token width) and a mobile ~390px sheet frame. Sample world held constant
across every page — *The Rusted Lantern, day 3 · night · rain* — so the set reads as one instrument
panel, not fourteen ideas.

Law obeyed throughout: `Context-Panel-Program.md` §4 (the bracket anatomy — header band · top
game strip · one scrolling viewport · bottom meta strip; two strips, ONE selection), `UI-Architecture-
and-Layout.md` (container-driven responsiveness, CONTEXT is a fixed token column, D62 visual
grammar), `client-architecture-lockdown.md` §6b/§6c (everything here mounts via `defineContextTabs`
+ the contributor registry; the band rides the existing `header` slot), the motion guide (three
duration tokens, transitions over keyframes, reduced-motion = REMOVE), and the D71 token system —
**no new palette, no new type identity**. Every color in the mockups is a real Hearth `--color-*`
value copied from the generated `theme.css`, or a `color-mix()` over one (the sanctioned tint idiom).

Owner corrections honored: **Quests and Journal are live LITE tabs** (real data planes — snapshot
quests array; lineage-projected journal); only **Map** is PHASE-locked until MA-3. Top strip = 6 live
+ 1 locked in both modes.

---

## 1. The subject-driven POV

The subject: a dark-fantasy tabletop shell wearing an OSRS fixed-interface skeleton. The panel's
job is to be the **table** — the place the dice, the sheets, the map, and the GM screen live while
the story happens in CONTENT. So the vernacular is table-vernacular: *roster, sheet, pack, on
stage, wards, veiled, waystone, the story fills it*. Not dashboard-vernacular (no "overview," no
"metrics," no big-number cards).

What we take from OSRS (read off `osrs-fixed-interface.png`): the **bracket** (state above,
administration below), **grids over lists**, **icons over text**, **lit-state over chips**,
**orbs as glanceable vitals**, **locked tabs that stay visible**. What we refuse: stone bevels,
pixel fonts, texture cosplay — skin stays a theme concern (grimstone remains an optional seed
theme, per CP-doc §4.8).

## 2. The signature element — THE WAYSTONE

The owner's idea, spent boldly and only here: the composite circle in the header band, where OSRS
puts the world orb.

```
        ┌─ 24-hour DIAL ring — the day's phases as arcs:
        │  dawn (ember) → day (track-3 gold) → dusk (ember-violet) → night (track-2 blue)
        │  the ember MARKER sits at the current hour (noon top, midnight bottom)
   ◐    ├─ SKY disc — time-of-day gradient + live weather overlay
        │  (rain drifts · storm bolt · snow · fog bands · stars at night)
        └─ HORIZON silhouette + one ember-lit gable — "a place, seen from its sky"
```

- **Structure encodes truth.** The marker's *angle* is the time — "how deep in the night are we"
  is a glance, not a read. The arc segmentation is the day's real shape. The weather layer is the
  scene's real weather. Nothing on the circle is decoration-only except the horizon — and the
  horizon is the **minimap promise**: the waystone owns the SKY today; the Map tab owns the GROUND
  at MA-3 (its locked viewport shows the waystone enlarged over the fog-dimmed region map — one
  circle, two zoom levels; see `map.html`).
- **Satellites** (the OSRS data-orb idiom on our RingGauge geometry): up to three pool orbs — arc =
  value/max, mono value inside, label + `value/max` text beneath (text is the datum; rings
  aria-hidden — the tracker-kit a11y model). Low pools re-fill destructive red, never as the sole
  signal. **The wallet is a coin DISC, not a gauge** — a max-less quantity wearing an arc would be
  a lie of shape.
- **The cues row**: freshness (`as of last beat` under reliable extraction / `live` under cheap —
  the RpgGameView `extractionMode` fact, rendered honestly), the host-only **veiled count** (crown
  gold — doorway to Status → Veiled), and lite's read-only pill. One quiet row, three honest facts.
- The band replaces the flat circled-number "VIT/RES/SUP" row (which read as notification counts —
  the v2 mockup's own finding, now fully absorbed).
- A11y: the whole composite is `aria-hidden`; the band's text lines carry every datum.
- Motion: the rain/snow drift is the panel's ONE ambient animation, removed (not shortened) under
  reduced-motion. Everything else is state-transition motion on the standard tokens.

Everything around the waystone is deliberately quiet so it stays the one bold thing.

## 3. The color grammar (what makes 12 tabs + 5 features cohesive)

Four voices, rationed, held identically everywhere:

| Voice | Token | Means | Appears |
|---|---|---|---|
| **Ember** | `--color-primary` | the game's pulse | active tab, encounter block, current act, quest-bound dot, selection |
| **Crown gold** | `--color-highlight` | host-only truth | Game tab, veiled ledger, reveal-eye, Preview's veiled line |
| **Info blue** | `--color-info` | the story asking YOU | CYOA choice blocks (live + settled) |
| **Track ramp** | `--color-track-1..6` | data identity | each pool/meter keeps ONE color from GM-console definition → orb → bar → budget slice |

A new feature picks its voice and inherits the whole system — that sentence is the cohesion
mechanism, and it is why the parity-plus features look born here (see §6).

## 4. Per-tab IA — wireframe, biggest change, why

**The bracket (all tabs):**

```
[ band: WAYSTONE | location / day·time·weather / cues ]  ← the `header` slot
[ band: orb row — VIT ◔  RES ◔  SUP ◔  GOLD ◉        ]
[ TOP STRIP: ♥ 📜 🎒 🎭 ⚑ 📖 🗺(🔒)                    ]  ← game state
[ VIEWPORT — the active tab, the only scroll region     ]
[ BOTTOM STRIP: 👥 ⚙ 💉 👁(host) 👑(host)              ]  ← meta
```

### Status (`status.html`) — the roster's game-state lens
```
[ ENCOUNTER — round 2 | ▸Niko · Bandit×2 · Mara · You ]   (only when live)
ROSTER — 3 ────────────────────────────
[ ◙ Mara  ⚔ally           Warden ]
[   mood — resolute               ]
[   Vitality ▓▓▓▓▓▓░ 24/30        ]
[   winded                        ]
… per member …
VEILED — host only ────────────────────  (crown gold)
[ 👁̸  Sera claims she never touched the key — truth: she pocketed it · t41 ]
```
**Biggest change:** sparse name+bar list → portrait-led instrument cards (D44 portrait, relationship
badge ON the name line, mood, meters, condition chips) + the encounter banner + the veiled ledger.
**Why:** the roster IS the game state; identity (portrait) is what makes a glance land; the
encounter is badged here per the CP-doc ruling, never a transient tab.

### Sheet (`sheet.html`) — the viewer's sheet
```
[ You | Mara | Niko | JFC ]           ← member selector, self default
[ ◙ Mara · Warden        Level 3 · ⛁128 ]
ATTRIBUTES ── 3-up stat-cell grid (16/STR idiom, hint on title)
SKILLS ───── name · +bonus rows
POOLS ────── meter rows + "Add meter" (member-own row)
```
**Biggest change:** grid over list — six attributes in the space one used to take. Level (hand-only,
nullable → renders nothing when null) and the wallet chip live on the identity line. Freeform games
get the honest teaching state, doorway to Game.

### Inventory (`inventory.html`) — the pack
```
[ ⛁ 128 gold · shared purse — 31 on Mara ]   ← pinned currency line (Q6a slot)
PACK — 8 ── 5-col square grid: glyph, qty corner, name on title,
            quest-bound = ember dot, ONE dashed ghost socket
[ ⟲ last change — t43 · dart bagged ]
```
**Biggest change:** text list → the OSRS item grid. No encumbrance UI (not modeled): items + one
ghost socket, never a fake 28-slot pack.

### Scene (`scene.html`) — the NOW window
```
[ 📍 Location · Date · Time · Weather ]   ← ambient card, editable in place
ON STAGE — 2 ── cast cards: name · relationship · mood · cast-field
                meters (Corruption 70/100) · text chips (Trust, Debt)
GOALS ───────── goal lines + n/m clock segments
[ CHOICE ON THE TABLE — ①②③ ]            ← the CYOA echo (info blue)
[ widgets grouped by subjectName ]
JUST NOW ────── freshest beats + newborn immersive cards
```
**Biggest change:** the same ingredients the current tab strews as bare form fields become a
composed NOW window, and the choice block gives CYOA its in-the-moment home. Scene = window,
Journal = archive.

### Quests (`quests.html`) — live in lite AND full
```
[ ACT II — THE BONE KEY   ●I ─ ◉II ─ ○III ]  ← the plot spine (ember = now)
ACTIVE — 2 ── clock-ring cards (segments ARE the objectives) + checklist
DONE — 1 ──── dimmed, struck, wrap line ("wrapped at t28 — …")
```
**Biggest change:** quests get clocks and a spine. The segmented ring's segments are the
objectives — never a decorative dial. Campaign-scale plot progression homes HERE (moment-scale
choice is Scene's): one axis per tab.

### Journal (`journal.html`) — live in lite AND full
```
[ All | Wraps | Cards ]
DAY 3 — NIGHT ── beats · an archived immersive card (full chrome)
DAY 3 — DUSK ─── session-wrap card (ember left edge)
DAY 2 ────────── beats
```
**Biggest change:** grouping by in-world day (free-text fantasy calendars welcome) — a campaign
chronicle, not a flat log. Cards archive in the day they were born.

### Map (`map.html`) — the one PHASE-locked tab
Locked: visible, `aria-disabled`, lock glyph, reason on title ("Maps unlock with the map arc
(MA-3)") — the viewport shows the waystone enlarged over the region map at 14% opacity: the promise
visible, the gate honest. Preview (MA-3): edge-to-edge region map, known places pinned, you-are-here
= the ambient location in ember, roads dashed track-gold, unexplored fog labeled "the story clears
the fog."

### Members (`members.html`)
Roster ADMINISTRATION — portrait rows, host crown, per-character talkativeness slider (was a bare
"50%" text), humans slider-less, pending invites dim with revoke. Footer names the two-lens rule
(Status = game state, Members = admin — one roster, no party system).

### Settings (`settings.html`)
CP-1's consolidated body in takeover density: appearance overrides · group behavior · a new "This
game" group for display-only game knobs (dice cues, beat notifications) so display prefs never leak
into the GM console. Autosave status line, no Save buttons (D66 A4).

### Injections (`injections.html`)
The steering channel's authoring home, grouped by class (guides — persistent · notes —
depth-pinned), role/depth meta in mono. The cross-link card states the one-seam story: trackers ride
this channel, authored here, glanced in the game tabs.

### Preview (`preview.html`, host)
**Biggest change:** the context budget becomes a stacked bar whose slices are swatch-keyed to the
assembly section list — "where did my context go" is one glance. The serialized game-state block is
shown verbatim (mono), veiled line in crown gold: the panel and the prompt provably carry the same
numbers.

### Game (`game.html`, host — the crown tab)
The ONE game-admin home, crown-tinted: mode + session controls, stat-profile vocabulary, pool defs
carrying their track-ramp swatch (definition and display visibly one system), cast-field schemas,
relationship hints, the steering note, the delivery-model knob with its honest consequence line.
Lite = same body minus full-only arms + **Graduate to full** (the doorway every APPLICABILITY-
omitted arm points at).

## 5. Mobile (each page's right frame)

The same system collapsing, never a second design: the panel is the shell's full-width sheet
between topbar and tab bar. Deltas are container-driven only — the waystone drops 76→64px, stat
cells go 3-up→4-up and the item grid 5→6-up (`@container` width thresholds — the axis-1 rule; the
mock encodes them as the `.phone` scope), tabs grow to 48px hit height (≥44px coarse floor), the
strips gain room (labels may reveal per the CP-2 container thresholds). Reading order, grouping,
and color grammar are byte-identical.

## 6. The parity-plus features — where each lives and why (the core requirement)

Designed IN, with states, not slots:

- **Relationship + custom cast-fields (LANDED)** — the badge sits ON the name line of every Status
  roster card and Scene cast card (the steering loop reads it at a glance; five kinds keep the
  tracker-kit intent colors, `custom` is a neutral truncating chip). Cast-field schemas are
  *defined* in Game (text/meter + range) and *render* on Scene's cast cards as meters (track-ramp
  colored) or `label — value` chips. First-class: they occupy the card's second and third rows, not
  an overflow section.
- **Level + wallet (LANDED)** — Sheet's identity line (hand-only chip; null renders nothing) and
  the header's coin disc + Inventory's pinned currency line. One number, three zoom levels.
- **Deception `<lie>` / omniscience `<ofilter>` (P3)** — a three-part host-only surface, all crown
  gold so "host-only" reads without a label: (1) the **band count** ("2 veiled") — the standing
  indicator + doorway; (2) **Status → Veiled** — the standing-secrets ledger (claim · truth · class
  · origin turn · reveal-eye that posts the truth to the table); (3) the **per-message eye** in the
  transcript (features.html shows host vs member: members get clean prose — no eye, no seam,
  server-side strip). Status hosts the ledger because secrets are game-state about the roster —
  the same lens the tab already is.
- **Immersive HTML cards (P4)** — chrome designed once, used in three homes: born under Scene's
  "Just now," archived in Journal's day groups, showcased in features.html with the full lifecycle
  — forming (shimmer placeholder, render-on-complete per §12.7), formed-collapsed (title bar),
  expanded (sandbox-frame, theme-tokened — the mock poster uses only token colors), view-raw
  (§4.7), and the wire-collapse hider ("3 cards collapsed from the prompt — titles stay, bodies
  drop").
- **CYOA + plot (P5)** — two scales, two homes, one color: moment scale = Scene's info-blue
  "Choice on the table" block (numbered keyboard hints; a pick sends as your turn — the wand owns
  the send, the panel is the echo; the settled state records what was on the table); campaign
  scale = Quests' act rail (I · II · III, current act ember). Never both in one place.
- **The MAP arc** — §4's Map tab: locked today, the waystone as its seed, the preview committed.
- **Skills / more pools / more widgets** — Sheet's skill rows, the orb row, and Scene's
  subjectName-grouped widget sections all repeat their row/cell primitive; growth is append.

## 7. How the panel GROWS (the extensibility model)

Every growth move is a clean append, never a redesign:

- **Add a tab** → a `ContextTabDef` contributor (`strip: "game" | "meta"`), registered at the
  door — the bracket has arithmetic room (icon-mode ×7 ≈ 238px at the 17rem floor, CP-doc §4.10)
  and the strip mechanics (badge dot, PHASE-disable, crown tint) are per-def flags.
- **Add a data plane** (the quests/journal precedent) → the plane joins `RpgTrackerView`, its tab
  renders kit blocks, APPLICABILITY gating omits it where the mode lacks the plane, and the doorway
  rule names where it's authored (Game) — exactly how Quests/Journal graduated from full-only to
  lite-real without any visual change.
- **Add a gauge** → a new orb is an additive entry in the band's orb row (alert level, turn timer);
  gauges with a max are rings, max-less quantities are discs; the waystone never grows siblings.
- **Add a content class** (the immersive-card precedent) → give it the artifact chrome (title bar ·
  origin turn · view-raw · expand/collapse), a birth home in Scene's "Just now," and an archive
  home in Journal's day groups.
- **Add a feature voice** → pick one of the four colors (§3) or make the case for a fifth in the
  ledger; the mock set demonstrates the first four are enough for everything currently planned.
- **Add a theme** → nothing here changes: every surface rides intent tokens + the track ramp, so
  grimstone (or any seed json) restyles the takeover for free.

## 8. The anti-generic validation pass (what the plan changed)

Ran the "is any part the generic default?" pass against the first plan; four revisions:

1. **The wallet orb was a gauge** — the generic move (everything's a ring). A max-less number
   wearing an arc lies; it became a coin disc.
2. **Big-number stat cards** — the first Sheet sketch drifted toward label-under-number dashboard
   cards; corrected to the OSRS stat-cell (value over caps label, bordered, dense, hint on title).
3. **A "Secrets" tab** — the obvious slot-shaped answer for P3. Killed: a whole host-only tab is a
   ghost for members and a drama-leak; the ledger is a Status section + a band count instead.
4. **Uniform chip soup** — conditions, guides, cast fields, and relationships were all "chips" in
   the first pass; they now have four distinct anatomies (lit condition chip / gauge-glyph guide
   chip / label—value tracker chip / relationship badge) because they are four different truths.

## 9. The Chanel pass (what was removed)

- The **encounter tab** idea (already vetoed by the CP-doc; the banner suffices) and the Secrets
  tab (§8.3).
- **Per-orb labels inside the waystone** — the dial marker + sky already say time/weather; the band
  text is the datum. The circle carries zero text.
- **Timestamps on beats** (the kit's rule stands — beat lines are timestamp-less; only artifacts
  carry an origin-turn ref, because you'll want to find those again).
- **The second accent** — an early draft tinted each tab's viewport by its own hue; deleted. Four
  voices only.
- **Portrait rings/status halos** on roster portraits — the meters directly below already say it.
- **A decorative compass rose** on the Map preview — the pin + fog labels carry the meaning.

## 10. The quality floor

- **Keyboard**: every interactive element is a real `<button>` with `:focus-visible` ring
  (`--color-ring`, 2px offset); the locked Map tab stays `aria-disabled` (not `disabled`) so its
  reason is keyboard-reachable; strips are `role="tablist"` pairs ("Game"/"Chat") per §4.9.
- **Reduced motion**: the global floor zeroes all animation/transition (`prefers-reduced-motion`),
  which removes the waystone drift and the forming-card shimmer outright — REMOVE, not shorten.
- **A11y data model**: bars/rings/waystone `aria-hidden`; text is always the datum; orbs carry
  visually-hidden `label value/max`.
- **Touch**: mobile tab cells 48px; grid cells ≥44px at the mobile widths shown.
- **Contrast**: all text rides `--color-foreground`/`--color-muted-foreground` on token surfaces —
  the shipped AA-swept pairs.

## 11. Buildability map (mock → system)

> Round-2 note: table verified against the shipped kit (`packages/ui/src/charts/meter/` — Meter ·
> RingGauge · SegmentedClock · TrackBar; `packages/client/src/components/tracker-blocks/`). Icons
> build on **lucide-react ONLY**, consumed through the curated `@orb/ui/icons` seal
> (`packages/ui/src/primitives/icons/index.ts` — gate `icons-lucide-only` + dep-cruiser
> `ui-satellite-seals`; features never import `lucide-react` directly; Tabler is NOT in the dep
> tree — the mocks' inline `<g id="i-*">` glyphs are stand-ins, not a proposed icon set). See
> §12.5 for the glyph-resolution story.

| Mock element | Builds as |
|---|---|
| The waystone | a new kit-tier composite beside RingGauge (`charts/meter` family — pure SVG, data-viz allowlist), mounted in the `header` slot component |
| Orbs / coin | `RingGauge` (exists) + a `CoinFigure` sibling |
| Meter rows, stat cells, chips, cast cards, beats, ambient, goals | the shipped tracker-block kit (`components/tracker-blocks/`) — the mocks are its blocks, denser |
| Both strips + one selection | `ContextTabsPanel` + `ContextTabDef.strip` (CP-doc §4.11 registry deltas) |
| Veiled ledger / reveal-eye | host-gated Status section + a message-row affordance (PERMISSION-omit; member DOM never carries veiled content) |
| Artifact chrome | the §12.2 sandbox-frame seal + a title-bar wrapper component |
| Choice block | a kit block over Button/Badge; fires the same verb the wand fires |
| Item/stat grids | CSS grid over Card cells; container-query column counts |
| All colors | existing tokens + `color-mix` tints; zero new tokens (the track ramp already exists) |

---

## 12. Round 2 — buildability, data integrity, interaction

> Numbering note: bare `§N` references in §1–§11 above resolve to the UI-spec §-map
> (`UI-Architecture-and-Layout.md` header — e.g. the "§12.2 sandbox-frame seal" in §6 is
> UI-Theming-and-Content). THIS section is always cited with the `DESIGN.md §12.x` prefix (the
> mock asides do so).

Ground-truth pass, 2026-07-27. Sources read in full: `packages/db/src/schema/rpg.ts` (the 6-table
floor), `packages/contracts/src/rpg/{views,snapshot,ambient,config,actor,sheet,enums,profile,
inputs,mode,bus,pointer}.ts`, the shipped meter/tracker kits, and the UI doctrine. Everything below
either (a) changed a mock (noted), (b) changed a build decision, or (c) is an open item flagged for
the orchestrator. The mock world stays a FULL-mode game (`game.html` says so); every full-only
surface is now explicitly tagged so the lite trim is derivable, not guessed.

### 12.1 One home — the consolidations

Round 1 already repeats primitives well; these are the remaining one-offs that generalize:

1. **One arc/bar family, zero bespoke SVG.** The mocks hand-roll four ring variants (band orb,
   quest clock, coin disc, act dots). Build rule: band orb = `RingGauge`; quest objective ring =
   `SegmentedClock` (D58 — it already exists for exactly this); every bar = `TrackBar`; the coin
   disc = the ONE new sibling (`CoinFigure`). The act rail (if it survives §12.2.6) is a horizontal
   `SegmentedClock` variant, not a fifth anatomy.
2. **Track color is a derivation, not a datum.** No color is stored anywhere (verified: sheets/
   snapshots/config carry no color fields; `rpg_hud_widgets.accent` is a nullable string). ONE
   helper — `trackColor(ordinal)` → `--color-track-{1..6}`, assigned by stable ordinal in
   `poolDefs` order — feeds GM-console swatch, orb, bar, and budget slice. `widget.accent` is
   warded to that same vocabulary (a non-token accent string heals to null → ordinal color).
   This is the §3 "definition and display are one system" sentence made executable.
3. **Scope selector is one primitive.** Sheet/Inventory member pills and Journal filter pills are
   the same mini-tab row (`mselect` in the mocks) — one kit block, two semantics (actor-scope,
   filter-scope). Never two implementations.
4. **TurnRef is one primitive.** `t41`/`t43`/`t28` appear in the veiled ledger, inventory
   last-change, quest wrap, journal artifacts, choice echo. One chip component: mono, muted,
   click scrolls the transcript to the origin message. It renders ONLY where the data really
   carries a message/variant ref (see §12.2.8 — some mock uses were phantom).
5. **The doorway line is one primitive.** "Define attributes in Game →", "set them up in Game",
   the Injections cross-link card, the veiled-count → Status jump: one `DoorwayLine` block
   (muted sentence + link), used by every APPLICABILITY/authoring cross-reference.
6. **The unseen-delta dot is one mechanism.** Quest tab dot + per-quest dot = a client-side
   watermark keyed by **resolved snapshotId** per tab (not wall-clock — a swipe must recompute
   it, §12.4.4). One hook; any tab can opt in.
7. **Portrait fallback is one derivation.** The mocks hand-pick gradient hues per character. Build:
   initial-letter over a hue derived from `actorRefKey(ref)` hash → track ramp; cast NPCs first
   try the model-authored `emoji` field (it exists on `RpgPresentCharacter` and is otherwise
   dead weight in this design — use it).
8. **Scene "Goals" is a projection, not a second home.** The mock's Goals section re-renders the
   ACTIVE quests (same `RpgQuestView` rows, name + `n/m` from objectives). Stated rule: Quests tab
   is the quest plane's home; Scene shows a filtered echo (active only, compact row) built from
   the same primitive — one datum, two lenses, zero divergent state.
9. **Mock-local CSS conveniences become tokens/variants once.** `--ember-tint/--ember-line/
   --crown/--track-bg` are per-file custom props in the mocks; in build they live once (meter kit
   `variants.ts` already owns the track background; the tints are `color-mix` recipes in ONE
   shared variants module), never re-derived per component.

### 12.2 The data audit — what the schema actually has (and what it forced)

The panel's data surface is exactly: `RpgGameView` + `RpgTrackerView` + `listJournal` +
`getConfigView` (host) + `listCheckpoints`. Audit of every mock datum against it:

| Mock datum | Schema reality | Verdict |
| - | - | - |
| Band location/day/time/weather | `ambient` — ALL nullable (`clock`/`weather`/`calendarDate` null, `location` may be `""`) | ✓, but the waystone needs an **unset state** (§12.2.1) |
| Freshness cue | `extractionMode` on the member view | ✓ verbatim |
| Read-only pill | `trackersReadOnly` | ✓ |
| Orbs VIT/RES/SUP | `poolOrbs` (server-derived first-3) | ✓ |
| Coin disc "128" | `wallet` = ARRAY of named amounts per actor | changed — §12.2.2 |
| Status roster meters/conditions/class/level | `RpgActorView` (`hp` nullable, pools, conditions, `className`, `level` nullable) | ✓ |
| Status "mood — …" on roster | **no mood on actors** — mood lives on cast (`RpgPresentCharacter`) only | changed — §12.2.3 |
| Status relationship badges on roster | relationship lives on CAST rows only | changed — §12.2.3 |
| Encounter banner | no encounter plane (`MODE_POLICY.encounters` = full-only ENGINE; no tables yet) | tagged full-mode in mock |
| Veiled ledger / band count / reveal-eye | P3 — **no storage exists** (not in the 6 tables) | open item — §12.6 |
| Sheet attributes grid | `sheet.attributes` record over profile vocab; missing key = absent | ✓ + absent-key renders nothing |
| Sheet SKILLS rows "+3" | **no skills field in lite** (`RpgSheet` — full grafts it); `skillGoverning` has no per-actor values | tagged full-mode in mock |
| Sheet pools + Add meter | `poolDefs` per-actor, member-own add | ✓ |
| Inventory grid + qty | `RpgInventoryItem` (name, qty ≥1, description, location, type) | ✓ |
| Quest-bound ember dot | no quest link on items | changed — keys off the model-written `type` string (`type` matching /quest/), else absent |
| "Last change — t43 · dart bagged" | **no per-item provenance** in any view | changed — §12.2.8 |
| "shared purse" | no purse entity — per-actor wallets; total is a SUM | changed — copy is now "party total — N carried by X" |
| Scene ambient card | snapshot ambient | ✓ (each field nullable-honest) |
| Cast cards (mood, relationship, custom chip) | `RpgPresentCharacter` | ✓ |
| Cast-field meters (Corruption 70/100) | schema from `castFields`, VALUE from `customFields: Record<string,string>` — **values are strings** | ✓ with a parse ward: non-numeric meter value renders as the text chip (honest), never NaN |
| Choice block | P5 — no choice plane | ✓ tagged P5 |
| Quest cards + objective rings | `RpgQuestView` | ✓ (add the missing `failed` state: struck + destructive-tinted ring) |
| Act rail I·II·III | **no acts/plot plane anywhere** (not in snapshot, not in config) | changed — §12.2.6 |
| "Wrapped at t28" | quests carry no completion turn ref | changed — wrap line drops the TurnRef until the plane carries one |
| Journal beats/cards | `listJournal` rows (type/title/content/createdAt) | ✓ |
| Journal day-grouping "Day 3" | **no in-world-day on entries** — only real `createdAt`; ambient day is only the CURRENT snapshot's | changed — §12.2.5 |
| Session-wrap card | no `wrap` member in `RPG_JOURNAL_TYPES` (sessions = full engine) | tagged full-mode |
| Members talkativeness | chat-participant data (outside rpg) | ✓ out of scope |
| GM console pools "Vitality 30" | **poolDefs are PER-ACTOR sheet data** — there is no game-wide pool plane | changed — §12.2.7 |
| Relationship hint on "enemy" | `relationshipHints` glosses CUSTOM labels (per contract), not builtins | changed — mock row now glosses the custom `debtor` |
| Delivery-model knob + consequence line | `extractionMode` via `updateConfig` | ✓ |
| Preview sections/budget | assembly trace (exists) | ✓ |
| Checkpoints | table + 3 verbs exist (`list`/`create`/`restoreCheckpoint`) — **the redesign gave them NO home** | changed — §12.2.4 |

The numbered changes:

1. **Unset waystone state (new).** `clock` is born null (nullable-honesty — the doc's own §2.7
   argument). Null clock ⇒ no hour marker, neutral ring (all arcs at track-bg), plain dim sky;
   null weather ⇒ no overlay layer. The band text says "no ambient set — the story fills it"
   (already mocked in `header-band.html`'s last frame; the rule is now written). The signature
   element gets the same honesty as every meter.
2. **Wallet is plural.** `wallet: {name, amount}[]`. The coin disc shows the FIRST named amount
   (ordinal rule, §12.1.2 spirit); the Sheet chip and Inventory pinned line list every named
   amount ("128 gold · 3 favors"). One derivation (`primaryWallet(actor)`), three zoom levels.
3. **Status roster: `status` line, conditional badge.** The quiet line under the name is the
   actor's volatile `status` string (free text) — the word "mood" is reserved for Scene cast
   (where the field exists). The relationship badge renders on a roster card ONLY when that
   character also stands in the scene cast (join `characterId` → `presentCharacters`); absent
   otherwise — never a phantom "neutral". Mock labels updated.
4. **Checkpoints home = Journal "Marks".** A shipped feature had no surface. Ruling: checkpoints
   are bookmarks in the chronicle — Journal's scope row becomes `All | Marks | Wraps | Cards`
   (Marks = lite-real TODAY; Wraps = full; Cards = P4). A mark row: label · created date · the
   host-only "Restore" (clone-forward, `restoreCheckpoint`) + host "New mark" as the tab's
   primary when Marks is scoped. Members see the list (the verb is member-read), no restore.
5. **Journal day-grouping needs one additive column.** In-world day is NOT derivable from
   `rpg_journal`. Recommendation (flagged, needs owner/schema sign-off): stamp a nullable
   `world_day` text column at write time from the then-current snapshot's `calendarDate` ??
   `clock.day` ("Day 3") — additive, baseline-squashed (pre-launch DB law), heals to null.
   Null groups under a plain real-date header. Until it lands, the DESIGN renders real-date
   groups — the mock keeps the in-world grouping as the target state with the caveat in its notes.
6. **The act rail has no plane — demoted to P5-future.** It stays in the mocks as the P5
   target (annotated), but ships nothing until the plot plane exists. When P5 lands, its home
   is snapshot-resident (clone-forward like quests) — a small `plot: {act, title, acts}` object;
   the rail then renders real data. No client-invented acts, ever.
7. **GM-console "Pools" section = defaults-for-new-sheets, explicitly.** Pools live per-actor.
   The console section's real semantic is a template: it edits the DEFAULT `poolDefs` applied
   when a sheet row is first created (needs a small config field — `features.defaultPoolDefs`,
   additive, self-healing — flagged) and offers "apply to all" as an explicit bulk `patchSheet`
   fan-out with a confirm naming the N sheets it will touch. It never silently mass-edits.
8. **Provenance lines only where provenance exists.** Inventory's "last change — t43" has no
   backing datum (no per-item turn ref; snapshots know their `messageId` but views don't diff).
   The line is rebuilt on the honest arm: client-side ephemeral diff of the previous vs new
   tracker view on `snapshotPatched` ("dart ×1 added"), no TurnRef, cleared on reload. If the
   owner wants durable provenance it is a server-side snapshot diff — deferred.

### 12.3 The ward — how hand-typed input stays canon-safe

The panel is editable-in-place (owner-sacred) and autosaving (D66 A4 — no Save buttons). Every
editable datum follows ONE edit grammar; the ward has four tiers, ordered by preference:

**Tier 0 — illegal input is unenterable (structure beats validation).**
- Every closed vocab is a PICKER, never text: relationship kind (6-token enum), quest status,
  journal type, cast-field kind, time-of-day (the 6 `TIME_OF_DAY` labels — the panel NEVER
  exposes a raw hour field; the label→hour mapping is the contract's one home), extraction mode,
  widget type/position. An off-vocab enum value is unconstructable in the UI, exactly as it is
  unconstructable for the model under a schema-enforcing backend (§2.3 symmetry).
- Numbers are numeric fields (`inputmode`, integer-only keystroke filter, spinner arrows at
  coarse pointers). Free prose (location, status, names, flavor, item names) is warded only by
  trim + length caps — prose is canon, the panel does not lint fiction.

**Tier 1 — clamp-and-tell (recoverable slips).**
- Pool/HP/meter VALUE: clamped to `≥ 0` on commit. Note the schema deliberately allows
  `value > max` (no upper CHECK) — overfull is representable fiction (overheal, borrowed
  resolve); the panel ACCEPTS it and renders it honestly: bar capped at 100%, the `34/30` text
  in warning tone. Value is never silently truncated to max.
- MAX (`≥ 1` — the real zod/CHECK floor): lowering max below the current value drags the value
  down to the new max in the SAME commit, and the autosave microline states the consequence
  ("Vitality 24 → 20 — max lowered"). One gesture, visible consequence, re-editable.
- Attribute values: clamped into the profile's `range.{min,max}` with the same tell.
- Cast-field meter values: parsed from the string record; commit writes the normalized integer
  clamped to `[0, field.max]`.

**Tier 2 — inline refusal (unrecoverable without intent).**
Empty required names (pool, quest, attribute key), duplicate pool/field keys, a 13th attribute
(`RPG_PROFILE_MAX_ATTRIBUTES`), steering note > 500 (`RPG_STEERING_NOTE_MAX`), hint > 120: the
field stays in edit state with a one-line destructive-tone message under it; NOTHING is sent.
Capped text fields show a quiet counter from 80% full. A wire reject that slips through anyway
(server disagreement) rides the mutation's sticky-error path: the field reverts optimistically
and the standard error toast names the refusal — the panel never half-applies.

**Tier 3 — the merge-clear discipline (D108) as UI law.**
The inline editor emits PATH-SCOPED patches only — the touched path and nothing else. An
untouched field is OMITTED (no-op by contract); clearing is a deliberate, separate affordance
(the field's "Clear" in its edit popover) that sends explicit `null` on that path. `{}` is never
sent as a clear. Because a commit can only ever carry one path, a fat-finger's blast radius is
one field — structurally.

**The lock consequence is visible.** A committed hand edit auto-stamps `fieldLocks[path]`
(manual-edit-wins — `editSnapshot` writes it, tools honor it). The panel renders that state: a
small neutral pin glyph on the field, title "Pinned by hand — the story won't change this.
Release to let the model write it again", with a Release action that clears the lock path.
Without this, every hand edit silently creates a "why won't the model update this anymore?"
mystery. (Release rides the merge-clear grammar as a null on the lock path — the verb-side
contract for lock removal is flagged in §12.6.)

**Bad entry, summarized:** reject = red inline line + nothing sent; clamp = value snaps + the
microline says what happened; accept-with-warning = overfull rendered in warning tone. All three
keep the text-is-the-datum rule — no color-only signal.

### 12.4 How it's actually used — the four flows, walked

1. **Host edits between turns** (Scene: location typo). Click the value → inline input →
   Enter/blur commits → `editSnapshot {location}` → lock stamped → bus `snapshotPatched` →
   `EVENT_INVALIDATIONS` refetches the tracker view → every tab now shows the edit. The
   freshness cue does NOT change ("as of last beat" describes extraction lag, not hand truth).
   Optimistic render makes the loop feel instant; rollback restores on refusal.
2. **Member edits their own sheet.** Authz is affordance law: **a control that would refuse is
   never rendered** (PERMISSION-omit — the no-reduced-modes ruling's second class). Host sees
   edit affordances everywhere; a member sees them ONLY on their self card / self sheet row /
   self pack (`patchSheet` member-own-`user`-ref; `editSnapshot` member-own volatile). Everyone
   else's cards are plain text to them — no disabled inputs, no refusal toasts. Quests, journal
   edits, widgets, GM config: host-only verbs ⇒ zero member affordances (members still read).
   Sheet's "Add meter" renders on the self row only (already noted in the mock).
3. **The model writes.** Turn commits → (reliable) the state round runs after → flush writes the
   snapshot → `snapshotPatched`/`questChanged`/`journalChanged` → scoped invalidation → refetch →
   values transition on `--motion-base`. No persistent highlight except the §12.1.6 watermark
   dots; forming shimmer belongs to artifacts only. Under `cheap`, the same loop lands at commit
   time and the cue reads "live".
4. **A swipe re-resolves everything.** `variantSelected` (chat bus — the server writes nothing)
   → blanket tracker+journal invalidation → all tabs re-read the new variant's snapshot at once
   (swipe-consistent by construction). Two design consequences now stated: (a) watermark dots key
   on snapshotId, so a swipe recomputes "changed" honestly; (b) **the in-flight edit ward** — an
   open inline editor remembers the snapshotId it opened against; if the resolved snapshot
   changed before commit (swipe or model flush mid-edit), the draft is DROPPED with a toast
   ("the scene changed under you — edit again"), never committed onto a snapshot the editor
   wasn't looking at. Passive re-renders never clobber an open input's draft.

### 12.5 Glyphs for model-authored strings — the resolution story

The inventory grid, condition chips, weather layers, widget icons, and relationship badges all
need a visual for a string the model (or host) authored. The mocks' inline SVG set is a stand-in;
the codebase reality is **lucide-react, and only lucide**, reached exclusively through the curated
`@orb/ui/icons` seal (the ONE icon home — its header says "grow the set per consumer chunk";
`rpg-context-section.tsx` already imports `HeartPulse/ScrollText/Backpack/Drama` from it). The
resolver therefore imports from `@orb/ui/icons`, and its icon names are ADDED to that curated
export list — never a direct `lucide-react` import in a feature (dep-cruiser `ui-satellite-seals`),
never a new icon package. Every icon name cited below is a **verified export of the installed
lucide-react** (runtime-checked against `packages/ui/node_modules/lucide-react`, 2026-07-27).

**One resolver, pure data, one home.** A feature-lib module (`features/rpg/lib/glyphs.ts`):
`resolveGlyph(domain, raw) → LucideIcon` —

1. **Curated keyword map per domain.** Normalize (lowercase, strip punctuation), tokenize, match
   tokens against a hand-curated keyword table; most-specific (longest) token wins. Items:
   `key→KeyRound · dagger/blade/sword→Sword · potion/flask/vial/poultice→FlaskConical ·
   rope→Cable · ration/bread/food→Beef · oil/drop→Droplet · dart/needle/arrow→Crosshair ·
   torch/lantern→Flame(Lamp) · coin/purse→Coins · map/chart→Map · scroll/letter→Scroll ·
   book/tome→BookOpen · shield→Shield · armor→ShieldHalf · gem/jewel→Gem · herb→Leaf ·
   bone→Bone · skull→Skull` — ~60 fantasy-floor keywords, grown by append. Deterministic token
   matching ONLY — no fuzzy-distance dependency (deps law), no LLM call, testable as a table.
2. **Second chance on the taxonomy string.** Items carry a model-written `type` ("weapon",
   "consumable", "quest") — a smaller type→icon map catches what the name missed.
3. **A designed fallback, never a blank.** Per domain: items→`Package`, conditions→`Activity`,
   weather→`Cloud`. The fallback is a first-class member of the visual set; the NAME on
   title/hover stays the datum (a11y model: every glyph aria-hidden).
4. **Host override where a column already exists.** `rpg_hud_widgets.icon` (nullable text) IS the
   override slot: the widget editor writes a lucide name from a picker; the ward validates
   against the lucide export set, unknown heals to null → resolver path. Items get NO per-item
   override in v1 (the keyword map + fallback suffices; an override field would be an additive
   item-schema change later, not a bolt-on).
5. **Closed vocabs get exhaustive Records, not the resolver.** Relationship kinds (6, closed):
   `lover→Heart · friend→Star · ally→Handshake · neutral→Minus · enemy→Swords · custom→Tag` — a
   mapped `Record<RpgRelationshipKind, Icon>` (a new kind fails tsc). Widget types likewise
   (`meter→Gauge · counter→Hash · gauge→CircleGauge · badge→Award · text→Type`).
6. **Weather is the same problem** — `weather.type` is a FREE string, not an enum. The waystone's
   overlay layers key off the same resolver (rain/drizzle/storm/snow/fog/mist/clear/…); an
   unresolvable weather type renders NO overlay (the band text still says "ashfall" — text is the
   datum, the sky just stays plain). The Scene ambient line shares the map — one weather
   vocabulary home.
7. **Cast portraits**: the model already writes `emoji` per present character — first fallback
   before the initial-letter gradient (§12.1.7). A model-authored visual that costs nothing.

### 12.6 Open items flagged for the orchestrator

- **Veiled (P3) storage**: claim/truth/class/origin/revealed have no home in the 6 tables — the
  design is ready (three-part surface), the plane is not. Needs a schema decision at P3 time.
- **`rpg_journal.world_day`** (or equivalent ambient stamp at write): required for the designed
  in-world day grouping (§12.2.5). Additive nullable column, baseline-squashed.
- **`features.defaultPoolDefs`** (config, additive): required for the GM-console pool-template
  semantic (§12.2.7); until then the console section is APPLICABILITY-omitted and pools are
  authored on Sheet only.
- **Lock release verb path**: `fieldLocks` is written by `editSnapshot` (auto-lock); confirm the
  merge-clear grammar accepts an explicit null on a lock path as "release" — the §12.3 pin
  affordance depends on it.
- **Plot plane (P5)**: snapshot-resident `plot` object proposal (§12.2.6) when CYOA lands.
- **Widget position vocabulary mapping**: `banner|sidebar|footer` (legacy tuple) map to the new
  anatomy as banner→band orb row satellite, sidebar→Scene subjectName group, footer→Scene bottom
  group. No new position members needed; the tuple survives as-is.
