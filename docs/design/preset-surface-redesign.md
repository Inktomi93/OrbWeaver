---
kind: spec
status: draft
updated: 2026-08-02
---

# PRESET SURFACE REDESIGN — make the generation deck crunchy (PRESET-1)

**Status:** DESIGN SPEC — DRAFT, nothing here is built. Owner charge (2026-08-02, verbatim): the preset
content pane *"feels wrong and is organized wrong… when compared to SillyTavern's generation params and
presets and templates and fields are crunchy and it just does not feel good to use"* — he *"really truly
hates how it looks and feels"* and is separately *"still not set on presets being their own thing"*
(workboard §DISCUSSION PILE, CONFIG-RAIL RIFF). This spec answers the first charge concretely and states
how it composes with the second WITHOUT deciding it (§11).

**Scope:** `packages/client/src/features/preset/**` (the LIST pane, the CONTENT editor, the CONTEXT
model) + the small named gap-closes in `@orb/contracts/preset` / `domain/preset` (§10) + ONE new server
READ (§4.3). **Out of scope:** the generation funnel itself (capability doctrine, D68 clamps, quality
mapping — all correct and untouched), the preset DB shape, chat-side preset binding, PROSE-1 S2 default
editors (§6.4 states the seam), and the config-rail fork (§11 states composition only).

**Evidence:** full-file reads 2026-08-02 of every file in `features/preset/**` (all 44),
`contracts/src/preset/index.ts` (all 1621 lines) + `prose.ts`, `@orb/ui` slider/option-strip/setting-row/
number-field surfaces, and the ST reference at `~/inktomi-stack/SillyTavern` (`public/index.html`
range-block anatomy, `public/scripts/PromptManager.js` row anatomy). Law read IN FULL:
`density-pass-spec.md` (approved), `list-pane-projection-proposal.md` (§11/§12 ratified),
`hud-home-spec.md`, D115/D116/D117 ledger rows, the marinara mines + `parity-plus-program-spec.md`.
Rendered receipts: the dev stage (:5173) serves, but the snap stage is a GLOBAL port singleton with
side-eye lanes in flight (workboard §ORCHESTRATION GOTCHAS) — this pass deliberately did NOT seize it;
every claim below is grounded in full component-tree reads, and the build's own side-eye owns the
rendered verification.

**Mocks (authored with this spec — the owner rules from pixels):**
`docs/design/mocks/preset-redesign/params-deck.html` (the Params view + the CONTEXT readout) ·
`docs/design/mocks/preset-redesign/actions-and-sections.html` (the Actions view + the consolidated
section editor) · `docs/design/mocks/preset-redesign/list-pane.html` (the LIST projection). House mock
pattern per `docs/design/mocks/README.md` — drawings, not code; the token/primitive law applies to the
BUILD.

---

## 1. The diagnosis — what "crunchy" actually is, measured against both surfaces

ST's params surface has four properties, each with a source receipt:

1. **The datum is always visible and always typeable.** Every knob is a `.range-block`: a title, an
   `<input type="range">` AND an `<input type="number">` twin side by side
   (`SillyTavern/public/index.html:704-711`). You drag OR type; the number never disappears; there is
   no "enabled" state to pass through first.
2. **One column, zero navigation.** Every generation knob sits in one dense scrolling column inside one
   drawer. Reaching any knob = open drawer, scroll. No tabs, no sub-tabs, no disclosures for the core
   set.
3. **Numbers everywhere.** The prompt manager prints a per-prompt token count on every row
   (`PromptManager.js:1761`); totals are visible; a change is immediately quantified.
4. **What you set is what's sent.** ST has no capability funnel — the directness is partly an honesty
   deficit (it happily sends knobs the backend ignores), but it FEELS direct because the surface never
   interposes state between you and the value.

The orbweaver preset editor, as built (every receipt from this session's full reads):

| # | defect | receipt |
| - | - | - |
| F1 | **Navigation depth.** Two stacked `Tabs` levels — 4 groups × 10 leaves (`preset-editor-surface.tsx:233-253`, `preset-nav.ts:19-55`). Reaching temperature: select preset → Generation → Sampling → flip its override Switch → drag. ST: scroll. | code |
| F2 | **The datum hides.** An unset knob renders the prose *"Using the model default."* with NO number (`params-panel.tsx:233-235`) — and the prose can be FALSE: the quality dial feeds sampling defaults (`QUALITY_SAMPLING`, `contracts/preset/index.ts:62-66`), so on `quality: deep` the "model default" temperature is actually 1.0 from the funnel. The one thing an instrument exists to show — the value — is absent exactly when you're deciding whether to override it. |
| F3 | **No typed entry.** `Slider.showValue` is display-only (`ui/primitives/slider/slider.tsx:21`); no numeric twin exists anywhere in the panel. Setting temperature to exactly 0.73 is a drag hunt. |
| F4 | **Fragmentation.** The Quality leaf is an entire tab holding ONE 3-option radio (`params-panel.tsx:73-97`). The "Templates" leaf holds ONLY inline-reasoning-parse — nothing template-shaped (`preset-structure-tabs.tsx:179-198`). `thinkingDisplay` — a reasoning knob — lives in the PROMPT tab's "Message delivery" collapsible (`preset-structure-tabs.tsx:145-149`), two groups away from the Reasoning tab. |
| F5 | **One object, three panes.** A section's body edits in the CENTER drill-in (`section-body-editor.tsx`), its placement/triggers/locks in the CONTEXT inspector (`preset-section-inspector.tsx:98-101`), its enable/reorder on the rack row. Editing one section is a three-geography trip. |
| F6 | **Form-voice monotony + box-in-box.** The guided-actions surface is 8 `rounded-card border bg-card` boxes in a grid (`guided-actions-section.tsx:122`) inside a CLOSED disclosure inside the Prompt tab; rack rows carry `rounded-card border` each (`section-row.tsx:109`) — the exact chrome class density D6/CD2 demotes. Zero kicker/datum voices anywhere in the feature (the library pane's one `voice="kicker"` excepted). |
| F7 | **Silent stored knobs.** A capability-absent knob renders ABSENT — correct doctrine (`capability-panel-model.ts:100-104`) — but a STORED explicit value on an unhonored knob (import, model swap) is then invisible in the editor AND dropped at the funnel (D68). Honest wire, lying editor: the preset carries a value no surface will ever show you. |
| F8 | **Schema knobs with NO editor anywhere** (structural sweep, this session): `params.stop` · `params.topA` (schema-supported at `index.ts:192` yet the ST importer drops `top_a` claiming *"no neo sampling vocab"*, `index.ts:1417-1420` — the two halves contradict) · `params.maxBudgetUsd` · `params.providerContextCompression` · `params.compaction.verbatimTail` (minted as "the missing 4th compaction knob", `index.ts:168-172`, then never given an editor) · `formatStrings.responseNudge`. Plus a DEAD DOOR PAIR: `preset.export` exists server-side (`domain/preset/verbs/export.ts`) with zero client consumers, and the orb-native `parsePresetFile` importer has no client door either (the import dialog is ST-only, `preset-import-dialog.tsx`). |
| F9 | **No effective truth.** The funnel (quality defaults → explicit knobs → capability clamp → engine floors) resolves server-side, correctly one-homed — and the editor never shows its output. You move a control and nothing tells you what the next turn will actually send. ST's directness is *what-you-set-is-what's-sent*; ours can't be that (the capability doctrine is right), so it must COMPENSATE by rendering the resolved result — today it doesn't, which is the deepest "does not feel good" cause. |
| F10 | **Activation is pane chrome, not a row affordance.** Making a preset active is a `Select` above the search box (`preset-library-surface.tsx:113-121`); the row's Active badge is passive by design (`preset-library-row.tsx:4`). Two UI locations for one one-of-N state, and the frequent act (activate what I just forked) is a dropdown trip. |

**What is GOOD and explicitly kept:** the assembly rack (zones, pivot, per-row ~tokens, drag — already
the crunchiest thing on the surface, and recently built) · capability-gated absent-never-disabled knob
rendering · the fork-once + retarget autosave chain (`use-preset-autosave.ts` — the ten-duplicates bug
is dead; this spec does not touch the save path) · blank-means-default with effective placeholders in
Output (`params-panel.tsx:374-405` — the one place the surface already tells the effective truth; §4
generalizes exactly this idiom) · the capability-gate copy that names its hidden knobs
(`params-panel.tsx:52-56`).

**The one-line diagnosis:** ST is crunchy because every value is a visible, grabbable NUMBER at depth
zero. Ours buries values behind navigation, override-switches, and prose — and where our architecture
is genuinely richer than ST's (the funnel), the surface hides the richness instead of instrumenting it.

## 2. The tier ruling — instrument islands inside a form editor

`density-pass-spec.md` §3.1 maps "entity editors (character / preset / world-info)" to **form** tier.
That stands for the editor SURFACE (header, section editors, dialogs). But the params deck and the
rack are read-mostly, many-data-per-cm², scan-then-tweak surfaces — the definition of **instrument**
(§3 top axis). The density law already sanctions exactly this nesting: *"a tracker readout inside a
settings pane"* is the legal reverse case (§3). Ruling this spec applies:

- The editor surface stays `form` tier.
- The **params deck** (§4), the **rack** (§5), the **actions list** (§6), and the **CONTEXT readout**
  (§7) are nested `<Surface tier="instrument">` islands.
- Four-voice assignment throughout: cluster names = `kicker` (caps micro + hairline, replacing every
  collapsible-title and boxed group) · knob names = `label` · every value/count/token = `datum`
  (mono, tabular) · provenance/explainers = `gloss`. No `rounded-card` boxes below the elevated tier
  (D6); rows separate by hairline + gap, never by border boxes (CD1/CD2).

Sequencing note: density S1 (the `Surface`/`tiers.css`/`Text.voice` mechanism) is LANDED and S2 merged;
this program builds directly on the tier machinery — no interim styling to sweep later.

## 3. The organization — five flat views, every schema field homed

The two-level tab tree (4 groups × 10 leaves) collapses to **five flat views**, one `Tabs` level, each
view one scrolling column of kicker-separated clusters. This AMENDS the north-star §6.2 regroup (owner
decision O3): §6.2 fixed leaf-sprawl by grouping; this fixes what grouping couldn't — the leaves
themselves were too small to be tabs.

| view | holds |
| - | - |
| **Params** | the whole generation deck: QUALITY · SAMPLING · REASONING · OUTPUT · CONTEXT · ADVANCED (§4) |
| **Prompt** | the rack + the consolidated section editor + the DELIVERY cluster (§5) |
| **Actions** | the 8 guided templates + the 3 nudge format strings (§6) |
| **Data** | variables (ChoiceBlocks) + user macros + the macro browser (§7-adjacent, mostly regroup) |
| **Transforms** | regex scripts · post-process · inline-reasoning parse (§8, pure regroup) |

**The exhaustive schema→home map** (every `PromptConfig` field; the completeness proof — a field with
no row here is a spec bug):

| field | today | new home |
| - | - | - |
| `sections[]` (order/enable) | Prompt▸Prompt rack | Prompt ▸ rack, kept (§5) |
| `sections[i]` body/role/inject/trigger/locks | CENTER drill + CONTEXT inspector (split) | the ONE consolidated section editor (§5.2) |
| `params.quality` | its own leaf tab | Params ▸ QUALITY strip (one row) |
| `params.temperature·topP·topK·minP·frequencyPenalty·presencePenalty·repetitionPenalty` | Sampling leaf, switch-gated sliders | Params ▸ SAMPLING KnobRows (§4.1) |
| `params.topA` | NO EDITOR (F8) | Params ▸ SAMPLING KnobRow, capability-gated (gap-close G1: add to `SAMPLING_KNOB_SPECS` + reconcile the importer's false "no vocab" drop) |
| `params.seed` | Sampling | Params ▸ SAMPLING (mono int row, capability-gated `sampling.seed`) |
| `params.stop` | NO EDITOR (F8) | Params ▸ OUTPUT — a chip-list editor (gap-close G2) |
| `params.logitBias` | Sampling ▸ Advanced JSON textarea | Params ▸ ADVANCED (unchanged mechanism) |
| `params.effort` / `thinkingBudgetTokens` | Reasoning leaf | Params ▸ REASONING |
| `params.thinkingDisplay` | Prompt ▸ Message delivery (F4) | Params ▸ REASONING (re-homed beside its axis) |
| `params.maxOutputTokens` / `maxContextTokens` / `verbosity` | Output leaf | Params ▸ OUTPUT (keeps the landed effective placeholders) |
| `params.maxBudgetUsd` | NO EDITOR (F8) | owner decision D6: editor in OUTPUT vs delete the field |
| `params.providerContextCompression` | NO EDITOR (F8) | Params ▸ CONTEXT (gap-close G3) |
| `params.compaction.{mode,thresholdPct,instructions}` | Context ▸ Compaction leaf | Params ▸ CONTEXT |
| `params.compaction.verbatimTail` | NO EDITOR (F8) | Params ▸ CONTEXT (gap-close G4) |
| `params.advanced.dynamicContext` / `parallelToolCalls` | Sampling ▸ Advanced | Params ▸ ADVANCED |
| `params.advanced.claudeEnv` | no editor (deliberate escape hatch) | stays editor-less; named in the ADVANCED gloss so it is a documented absence, not a mystery |
| `params.advanced.squashSystemMessages` / `roleHandling` | Prompt ▸ Message handling | Prompt ▸ DELIVERY cluster (they shape the wire the rack feeds — §5.3) |
| `customParameters` | invisible (server-only BYOK passthrough, `preset-editor-model.ts:6-8`) | owner decision D7: a read-only presence row in ADVANCED vs stay invisible |
| `namesBehavior` / `continuePostfix` | Prompt ▸ Message delivery | Prompt ▸ DELIVERY |
| `formatStrings.continueNudge` / `impersonateNudge` | Prompt ▸ Message delivery | Actions ▸ NUDGES (§6.2) |
| `formatStrings.responseNudge` | NO EDITOR (F8) | Actions ▸ NUDGES (gap-close G5) |
| `formatStrings.wiFormat` | the WI section body editor | stays there (it is that object's field) |
| `guidedActions.*` (8 kinds) | a collapsed grid of cards | Actions ▸ TEMPLATES (§6.1) |
| `variables[]` | Context ▸ Variables | Data |
| `userMacros[]` | Context ▸ Macros | Data |
| `regexScripts[]` | Transforms ▸ Regex | Transforms |
| `postProcess.*` | Transforms ▸ Post-process | Transforms |
| `reasoningParse.*` | Prompt-group ▸ "Templates" (F4 — a misnamed tab holding only this) | Transforms (it is a reply parse) |
| `schemaVersion` | invisible (correct) | invisible (correct — `mergeOnSubmit` re-anchors it) |

## 4. The Params deck — the centerpiece

One scrolling instrument column. Clusters in order, each a `kicker` + hairline (never a box, never a
closed disclosure except ADVANCED):

1. **QUALITY** — the dial as ONE row: a segmented strip (`ToggleGroup`, three cells, `Fast · Balanced ·
   Deep`, deselectable to unset) + a `gloss` line rendering the SERVER-RESOLVED mapping for the current
   pick ("deep → effort high · temp 1.0 — explicit knobs below override this"). The gloss reads from
   the effective resolver (§4.3), never a client re-derivation (`capability-panel-model.ts:196` already
   bans that drift).
2. **SAMPLING** — one `KnobRow` (§4.1) per capability-listed knob, in the existing spec order, `topA`
   added (G1) · the seed row (mono int input, capability-gated) · the **staleness row** (§4.2).
3. **REASONING** — the reasoning switch · effort select (model's real levels only) or budget KnobRow
   per the descriptor's mode · the adaptive note · `thinkingDisplay` (re-homed).
4. **OUTPUT** — `maxOutputTokens` + `maxContextTokens` (keep the landed effective placeholders +
   live caps line) · `verbosity` · `stop` sequences as a chip-list editor (G2) · `maxBudgetUsd` per D6.
5. **CONTEXT** — compaction mode/threshold/instructions (with the landed auto-mode honesty note) ·
   `verbatimTail` (G4, placeholder "8 (engine default)") · `providerContextCompression` (G3).
6. **ADVANCED** (the one collapsed disclosure — genuinely rare escape hatches) — logitBias JSON ·
   dynamicContext · parallelToolCalls · the customParameters presence row (D7) · a gloss naming
   `claudeEnv` as config-tier.

The capability gate keeps its landed shape: with no chat model resolved, SAMPLING/REASONING/OUTPUT
render the knob-naming connect note (the good F-copy at `params-panel.tsx:52-70`), QUALITY and
CONTEXT/ADVANCED render regardless.

### 4.1 The knob grammar — `KnobRow`

The anatomy (left → right, one ~32px instrument row):

```
[label·voice]  [———————●———————slider————]  [0.85]  [↺]
               provenance gloss (micro, under the track, only when non-obvious)
```

- **The value is a NUMBER FIELD, always.** Mono, tabular, right-aligned, EDITABLE (the ST
  counter-twin). Type or drag — both write the same field. This is the single biggest crunch lever.
- **Unset renders the EFFECTIVE value, ghosted.** No override switch, no "Using the model default"
  prose: the slider thumb sits at the resolved effective value (§4.3) with the ghost treatment
  (muted thumb + muted mono value), and the gloss names the source: `model default` · `← quality
  (deep)` · `clamped to 1.2 (model max)`. The datum is ALWAYS visible (F2 dead).
- **Touch promotes; clear demotes.** Dragging the slider or committing a typed value writes the
  explicit knob (full-weight thumb + value, gloss disappears or reads `explicit`). The trailing ↺
  (reset) clears back to inherit — visible only in the explicit state. Blank-means-default survives as
  the STORAGE semantic; the row grammar just stops hiding the default's value.
- **Bounds/step from the descriptor `Range`** exactly as today; a typed out-of-range value clamps on
  commit with a one-beat gloss ("clamped to 2.0").
- Ember budget (CD3): the explicit state uses foreground WEIGHT, not accent; accent stays reserved for
  focus and the pane's one primary.

### 4.2 The staleness row — stored-but-unhonored knobs (F7 dead)

Below the SAMPLING knobs, ONLY when non-empty: a quiet warning row enumerating every `params` knob that
carries a stored explicit value the CURRENT capability does not list —

> ⚠ Set but not honored by this model: `top_a 0.2` · `min_p 0.05` — [Clear] [Keep]

Derivation is client-side and mechanical: `storedKnobs ∖ capabilityKnobs` over the same
`SAMPLING_KNOB_SPECS` table the panel renders from (one vocabulary, two consumers — no new home).
"Keep" just dismisses for the session (the value legitimately waits for a model that honors it —
that's the D68 posture); "Clear" unsets the fields. This is the capability-staleness surface made
honest: today those values are invisible in both directions (F7).

### 4.3 The effective resolver — the ONE new server seam (owner decision D5)

The effective column/gloss must come from the REAL funnel, not a client mirror. Add ONE read:

- `preset.resolveEffective({ presetId })` → `{ field → { value, source } }` for the generation-knob
  surface, where `source ∈ explicit | quality | modelDefault | clamped | floor`.
- Home: `domain/preset` verb that composes the SAME funnel functions the turn pipeline uses (one home,
  two consumers — the EFF-3 effective-delivery precedent, and the exact pattern of
  `connection.resolveChatCapability` that the editor already consumes). No new resolution logic is
  written; the verb is a projection of existing resolution over the caller's chat-role capability.
- Freshness: refetch keyed on preset save-settle + `resolveChatCapability` (the autosave boundary
  already serializes saves, so "as-of last save" lags typed edits by one debounce — the
  `AutosaveStatus` chip already communicates settle; stated honestly, not faked live).
- Without D5 the ghost state degrades to what the Output tab does today (static placeholders from
  shared constants) — shippable but weaker; the quality-fed sampling defaults would stay invisible.

## 5. The Prompt view

### 5.1 The rack — kept, density-conformed

The rack survives as-is functionally (zones, pivot band, drag, per-row ~tokens, enable switches, the
missing-pivot callout). Visual conformance only: rows drop `rounded-card border` for the instrument
ListRow skin (hairline separation, `rounded-control`, selection = ember tint + left bar — already
half-true via `bg-primary/10`), the zone chips join the CONTEXT readout (§7), and the
Compose|Preview toolbar toggle DIES — preview moves whole to the CONTEXT readout (decision D2), so
compose is the center's only mode and the toolbar is just Add.

### 5.2 The consolidated section editor (F5 dead)

Clicking a rack row drills into ONE editor owning the WHOLE section, in this order: body (the landed
tri-state Default/Custom/Silent editor, unchanged) → delivery (name · role) → placement (zone +
inject depth/order) → triggers → override locks. The CONTEXT "Section" inspector tab is DELETED with
its bridge machinery (`preset-editor-bridge.ts`, `preset-section-inspector.tsx`,
`section-inspector-controls.tsx` move into the drill-in) — one object, one place. The
`onRevealSection` choreography and the `useSelectedPresetSectionId` store survive (selection is still
the drill key); what dies is the second geography.

### 5.3 The DELIVERY cluster

Below the rack, an open kicker cluster (not a closed collapsible — F6): `namesBehavior` ·
`continuePostfix` · adjacent-role merging with its floor annotation (landed) · squash system notes.
These are wire-shaping knobs for the rack's output; they stay with the rack.

## 6. The Actions view — guided templates + nudges (the "fields" half of the charge)

### 6.1 The templates list

The 8 `GUIDED_ACTION_KINDS` as instrument LIST rows (the rack grammar reused — one drill idiom for
both lists), replacing the 8-card grid-in-a-disclosure:

```
Response      steers your next reply            [system] [Default]   "{{input}}…"        ›
Impersonate   writes as you for one turn        [system] [Customized] "Write the next…"  ›
```

Row anatomy: kind (`label` voice) · fires-when `gloss` · role badge (only when non-system) ·
Default/Customized state chip · a one-line mono template preview (truncated; the ghosted default when
unset). Row click drills into the editor: role select + `MacroField` ghosting the factory default +
the landed missing-`{{input}}` lint + the assistant-prefill note. The impersonate row keeps its
`{{person}}` vocabulary chip. The `guided_instruction` marker cross-link chip survives at the top
(healthy/off/absent → selects the marker row in Prompt).

### 6.2 The NUDGES cluster (gap-close G5 included)

`continueNudge` · `impersonateNudge` · `responseNudge` as three more rows of the SAME anatomy (state
chip + preview + drill-in editor). The impersonate nudge's editor carries its measured-voice-lock gloss
(the IMP-1 probe note that already lives on its prose slot). `wiFormat` deliberately stays with the
WI marker's body editor — it frames entries, not actions.

### 6.3 Why templates leave the Prompt tab

They are not prompt STRUCTURE — they are per-action steering prose. Burying them two disclosures deep
(F6) is why the owner experiences "templates and fields" as absent. A top-level view named for what
the user is doing (configuring the ✨ actions) is the honest IA.

### 6.4 The PROSE-1 seam (stated, not designed)

The template/nudge DEFAULTS' bytes are PROSE-1 slots (`PRESET_PROSE_SLOTS`, contracts `prose.ts`) —
already the one home the schema defaults and the ghosts read. When PROSE-1 S2 lands host-editable
defaults, the ghosted "Default" text in every row follows automatically (same import), and the
Default/Customized chip semantics are unchanged (this surface edits per-PRESET overrides; S2 edits the
app-tier defaults elsewhere). No S2 editor is designed here.

## 7. The CONTEXT panel — from inspector to readout (decision D2)

With the inspector consolidated into the drill-in (§5.2), CONTEXT stops renting editing and becomes
the preset's INSTRUMENT: the glanceable answer to "what will this preset actually do", always beside
the editing hand. One tab, "Assembly" (the Usage tab folds in as a footer note until per-chat bindings
exist — its current body is two sentences of placeholder prose):

- **The effective profile** — the §4.3 read rendered as datum rows: `temp 1.0 ← quality` ·
  `effort high` · `out 2048 default` · `ctx 131072 window`, plus the capability provenance line
  ("resolved for <model> · chat role") and the staleness count when non-zero.
- **The budget** — the zone summary (SETUP n·~tok / POST n·~tok, moved from the center strip) + a
  per-section token bar list (the rack's ~tokens as a scannable profile; tracker-kit `TrackBar`
  anatomy, text-is-the-datum).
- **The preview** — the assembled-prompt preview (today's `AssemblyPreview`, relocated), block-click
  still selects the section in the center.

This is the panel earning its keep the HUD way: CONTENT = the hand, CONTEXT = the eye.

## 8. The Transforms + Data views

Pure regroups, no redesign: Transforms = regex scripts (unchanged CRUD) + post-process switches +
inline-reasoning parse (leaving the misnamed "Templates" leaf, F4). Data = variables + user macros
(the landed `EntryListEditor` + dialogs stand; rows conform to the instrument list skin in the same
sweep; the macro browser disclosure survives). ChoiceBlock PICKS remain chat-side (the MU pane) —
this surface authors definitions only.

## 9. The LIST pane — the projection grammar applied (F10 dead)

Per the ratified row-action grammar (`list-pane-projection-proposal.md` §12), with ONE amendment:

- **Row anatomy:** title · scent subtitle (edit stamp + kind — landed F5 behavior; the built-in keeps
  "Built-in default" + lock glyph) · trailing cluster.
- **The state toggle — inline ACTIVATE (amends §12.2's presets row, owner decision D1).** §12.2
  assigned presets no toggle ("no boolean row state") — but active-for-generation IS row state
  (one-of-N). `RowToggleAction` semantics with radio behavior: pressed = the active preset (amber,
  always visible — it carries the state the eye scans for); unpressed = revealed on hover/focus
  (coarse always); pressing activates THIS row (`seeds.defaultPresetId` patch — the landed mutation),
  which unpresses the previous one. The BUILT-IN row carries the same toggle (active ⇔
  `defaultPresetId === null`). Accessible name "Activate <name> for generation", `aria-pressed`;
  deactivation is activating another row, never a bare unpress.
- **The pane-level "Active for generation" Select DIES** — one affordance, on the row where the eye
  already is. The kebab gains an Activate item (N3 keyboard/discoverability parity).
- **Inline verb: Duplicate** (ratified §12.2 — the fork workflow's measured frequent verb) — cluster =
  toggle + verb + kebab, exactly the §12.3 cap.
- **Kebab:** Activate · Rename · Duplicate (mirror) · **Export** (gap-close G6 — wires the dead
  `preset.export` verb; the band's import gains the orb-native `parsePresetFile` arm beside ST) ·
  Delete (landed active-aware confirm copy).
- **Lineage — stated seam, not faked.** The workboard already queues the `forkedFrom` column
  ("Preset multi-tab fork idempotency"). Until it lands, lineage = the landed scent (stamp + kind);
  when it lands, the subtitle gains "forked from <name>" from the column. Nothing is derived from
  name-matching heuristics.
- The band (`PresetListHeader` — title/count/New/Import) is landed and stands.

## 10. Gap-close register (small, named, each independently landable)

| # | close | size |
| - | - | - |
| G1 | `topA` KnobRow (add to `SAMPLING_KNOB_SPECS`, capability-gated) + fix the ST importer's contradictory `top_a` drop (`index.ts:1417-1420` — map it like `minP`, non-default only) | S |
| G2 | `stop` sequences chip-list editor (OUTPUT) | S |
| G3 | `providerContextCompression` switch (CONTEXT) with per-backend honesty gloss | S |
| G4 | `compaction.verbatimTail` number row (CONTEXT), placeholder = engine floor | S |
| G5 | `responseNudge` row (Actions ▸ NUDGES) | S |
| G6 | Export door: kebab Export → `preset.export` download; import dialog gains the `orb.preset` arm (`parsePresetFile` — STRICT, loud errors, per its contract) | S |
| G7 | Editor header truth: the ACTIVE state chip + a quiet Activate affordance when not active, and the capability provenance chip ("for <model>") — the fork-once retarget's activation move becomes visible where you're editing | S |

Each pairs with `mergeOnSubmit`/`seedConfig` touches where a new bound path needs seeding — noted so
the build doesn't rediscover the D78 seeding rule per field.

## 11. Composition with the CONFIG-RAIL RIFF — stated, not decided

The owner is "still not set on presets being their own thing" and riffed a CONFIGURATION rail glyph
(collections of config objects — presets/tags/world-info/regex — sharing the library pattern, real
per-object editors, no popups). This design neither requires nor blocks any arm of that fork:

- **The LIST rows speak the one projection grammar** (§9) — a future mixed-kind CONFIGURATION list can
  host them unchanged; killing the pane-level activation Select (D1) removes the one piece of
  pane-scoped chrome that would have fought a mixed list.
- **The CONTENT editor is a self-contained per-object editor with zero popup dependencies** — exactly
  the riff's requirement — and decomposes into five per-view bodies a future host can mount (the
  SET-SEAMS portable-section posture; relocation = door-assembly edit, not migration).
- **The rail glyph is a registry entry** (`presets-section.tsx` is one `SectionDefinition`); merging
  presets under a CONFIGURATION glyph later is a section-registry/door edit that reuses every surface
  built here.
- The user-tier vs room-tier boundary the riff pins is untouched: this surface is user-tier config;
  room overrides stay chat-side (D116's one-door posture).

Rule-by-feel stays scheduled post-SET-SEAMS-seal, exactly as the workboard has it.

## 12. Enforcement — what makes a violation RED

| rule | wall | tier |
| - | - | - |
| every schema field has a home (the §3 map) | the knob-wire-coverage gate class already patrols dormant knobs; the build adds the preset editor to its reader arm (each §3 row is a covered path) | lint-time |
| KnobRow value = one field, two controls (slider + number never drift) | both bind the SAME form path; a CT asserts drag-then-read-number and type-then-read-slider converge | test-time |
| ghost state shows the EFFECTIVE value | CT with a stubbed `resolveEffective` → the rendered mono value equals the stubbed effective, not a hardcoded default | test-time |
| no client re-derivation of the funnel | `resolveEffective` is the ONLY effective source; a grep-able absence of `QUALITY_SAMPLING`/`QUALITY_EFFORT` imports in `features/preset` (they are funnel vocab) — review + the existing no-inline-union discipline | review |
| tabs stay one level | the two nested `Tabs` mounts die in the same commit (no half-migration) | review |
| section editing has one home | `preset-editor-bridge.ts` is DELETED — a re-import fails to resolve | compile-time |
| activation has one affordance | the pane Select is deleted in the same commit as the row toggle (old-beside-new is the banned half-migration) | review |
| density conformance | the landed density-tier gate arms (A1 radius, A2 box-in-box) — the guided-card and rack-row `rounded-card border` rows come OUT of the baseline in this sweep, shrink-only | lint-time |

## 13. Primitives inventory — the fugly-prevention list (per the §11 projection precedent)

Walked element-by-element against the mocks; verdicts against the REAL variants files read this
session. The anti-fugly law: a look no variant offers is a NEW VARIANT row, never a `className`
override.

| mock element | verdict | renders as / mint spec |
| - | - | - |
| the knob row | **NEW tier-2-candidate composite `KnobRow`** — ONE consumer today, so it homes feature-local (`features/preset/components/knob-row.tsx`) and promotes to `components/` when a second feature (rpg GM knobs, connections preview) adopts it (the R2 bar honored, not pre-paid) | `Row` + `Text voice="label"` + `Slider` + `NumberField` + reset ghost `Button size="icon"` + `Text voice="gloss"`. API: `{ label, description?, range, step, value: number \| undefined, effective: { value: number; source: EffectiveSource } \| undefined, onChange(next: number \| undefined) }` |
| slider ghost (inherited) state | **NEW `@orb/ui` Slider variant arm** — a `tone: "default" \| "ghost"` axis (muted thumb/track at rest) | `slider/variants.ts` — a variant row, never an opacity className at the call site (the tailwind-merge custom-token lesson) |
| the editable mono value twin | **NEW `NumberField` size/skin variant** `size="inline"` (compact, mono, tabular, right-aligned — the datum voice as an input) | `number-field/variants.ts`. NOTE the landed Base-UI reality: NumberField renders a TEXTBOX role, and the seal currently lacks aria-valuenow — the SET-SEAMS S2 sweep flag applies here too; CTs locate by role textbox |
| quality segmented strip | EXISTS | `ToggleGroup` + `Toggle` (single-select, deselectable) — the assembly-toolbar idiom; no mint |
| kicker cluster headers | EXISTS (density S1) | `Section` kicker rendering / `Text voice="kicker"` + hairline |
| staleness / callout row | EXISTS | the rack's missing-pivot warning-Row idiom (feature composition; no mint) |
| stop-sequence chip list | EXISTS | `Badge` chips + ghost × `Button size="icon"` + an `Input` add-row (the tag-chip anatomy; the density S1 `--spacing-tight` tokens) |
| actions/nudges rows | EXISTS | `ListRow` (title · subtitle · meta · actions) + `Badge` state chip + mono preview via `Text voice="datum"` — the projection-lane anatomy verbatim |
| template editor | EXISTS | `MacroField`/`MacroTextarea` with `placeholder` ghosting (landed) |
| rack rows (conformed) | EXISTS | `ListRow`-skin treatment of the landed `SectionRow` composition (drop the border boxes; keep the three tab stops) |
| activate row toggle | EXISTS | **`RowToggleAction`** (minted by the projection lane, `components/row-toggle-action.tsx`) — pressed=always/unpressed=revealed is its built posture; the one-of-N radio SEMANTIC is caller-side (activate-only, never bare unpress) |
| inline Duplicate + kebab | EXISTS | `LibraryRow` `inlineVerb` arm (landed) + `RowActionsMenu` |
| per-section token bars (readout) | EXISTS | tracker-kit `TrackBar`/meter anatomy (`@orb/ui` charts) — text is the datum, bars aria-hidden |
| effective-profile datum rows | EXISTS | `Row` + `Text voice="label"` / `voice="datum"` / `voice="gloss"` |
| band header | EXISTS | `ListPaneHeader` (landed) |

**Mint summary: zero new primitives; two variant rows (`Slider tone="ghost"`, `NumberField
size="inline"`); one feature-local composite (`KnobRow`).** Everything else is landed anatomy.

## 14. Build shape — stages, each independently shippable

| stage | lands | needs |
| - | - | - |
| **P0** | the two `@orb/ui` variant rows + `KnobRow` + the §4.3 `preset.resolveEffective` read (D5) | contracts/domain verb + ui variants |
| **P1** | the Params deck (replaces the Generation group's four leaves) + staleness row + G1-G4 | P0 |
| **P2** | the five-view flattening + Actions view (templates+nudges, G5) + Data/Transforms regroup | P1 (the deck is the biggest moved piece) |
| **P3** | Prompt consolidation: section editor absorbs the inspector; bridge deleted; CONTEXT becomes the readout (D2); toolbar preview toggle dies | P2 |
| **P4** | LIST projection: row activate toggle (D1), Select deleted, kebab Export + orb-native import arm (G6), header truth chip (G7) | independent of P1-P3 |
| **P5** | density-baseline shrink for the surface + the CT set (§12) + side-eye fix-all + close-out ledger row | all |

Every stage ends with its side-eye pass and ALL findings fixed ([[side-eye-fix-all-findings]]).
Verification recipes for the build (stage permitting): `pnpm snap --wide` on the presets section with
`--context-tab` per view; computed-value assertions per density §5.3, never authored classes.

## 15. Owner decisions — genuine forks ONLY, with recommendations

| # | decision | recommendation |
| - | - | - |
| **D1** | **Inline activate on rows** (amends the ratified §12.2 presets row: state toggle — → Activate; the pane Select dies) | **YES** — activation is the row's own one-of-N state; the frequent post-fork act lands where the eye is; the built-in row's toggle maps to the null pick. The Select was pane chrome a mixed config-list couldn't keep anyway (§11) |
| **D2** | **CONTEXT stops being an inspector and becomes the assembly READOUT**; section editing consolidates whole into the drill-in (the bridge + inspector die) | **YES** — F5 is a three-geography edit of one object; the readout gives the panel a real instrument job (effective profile · budget · preview). *Alternative if vetoed: keep the inspector and the readout shares the panel as a second tab — F5 survives* |
| **D3** | **Flatten 4 groups × 10 leaves → 5 flat views** (amends north-star §6.2's regroup) | **YES** — §6.2 grouped the sprawl; the leaves themselves were the defect (a tab per radio group). Five honest views, one nav level |
| **D4** | **Knob unset grammar: ghost-effective + touch-to-promote + reset** (replaces the override-switch-gates-slider row) | **ghost-effective** — the datum must always be visible (F2); the switch made "off" a hidden number. The storage semantic (blank-means-default) is unchanged; only the rendering stops hiding it |
| **D5** | **Build `preset.resolveEffective`** (the one new server read — the funnel projected for the editor) | **YES** — without it the ghost column falls back to static placeholders and the quality-fed defaults stay invisible (the F9 core). It is a projection of existing funnel code, not new resolution logic |
| **D6** | `maxBudgetUsd`: build its OUTPUT editor, or delete the field (NO-LEGACY allows it pre-launch) | **verify the wire first, then decide** — if the funnel/runners actually enforce a budget, build the editor (S); if it is a dead schema field, delete it. This spec does not fake either |
| **D7** | `customParameters`: read-only presence row + JSON view in ADVANCED, or stay invisible | **presence row** — an invisible stored blob that changes the wire (custom-byo) fails the no-silent-knobs bar; editing stays out (it is the server-side BYOK escape hatch by design) |

Everything else in this spec is design, not a fork: the five-view map (§3), the KnobRow anatomy
(§4.1), the staleness row (§4.2), the Actions list grammar (§6), the gap-close register (§10 — G6/G7
are wiring existing verbs/state, not policy), and the tier/voice assignments (§2) carry
recommendations inline and need only the D1-D5 ratifications to build.
