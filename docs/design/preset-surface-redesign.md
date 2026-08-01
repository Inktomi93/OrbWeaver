---
kind: spec
status: approved (owner-ruled — D1-D7 as recommended; mock round 3 amendments folded)
updated: 2026-08-02
---

# PRESET SURFACE REDESIGN — make the generation deck crunchy (PRESET-1)

**Status:** APPROVED-TO-BUILD (owner, mock review round 3: D1-D7 ruled as recommended; the round-3 amendments — output/context KnobRow sliders, the depth/order split, the hover-hint rule — are folded in below). Nothing here is built yet; §13 is the build lanes' dispatch table. Owner charge (2026-08-02, verbatim): the preset
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
`docs/design/mocks/preset-redesign/params-deck.html` (the Params view + its CONTEXT readout) ·
`docs/design/mocks/preset-redesign/context-readouts.html` (all six per-view CONTEXT panels, §7) ·
`docs/design/mocks/preset-redesign/prompt-rack.html` (the rack itself, first-class — §5.1) ·
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
| F8 | **Schema knobs with NO editor anywhere** (structural sweep, this session): `params.stop` · `params.topA` (schema-supported at `index.ts:192` yet the ST importer drops `top_a` claiming *"no neo sampling vocab"*, `index.ts:1417-1420` — the two halves contradict) · `params.maxBudgetUsd` · `params.providerContextCompression` · `params.compaction.verbatimTail` (minted as "the missing 4th compaction knob", `index.ts:168-172`, then never given an editor) · `formatStrings.responseNudge`. Plus the MISSING SINGLE-PRESET DOOR (corrected from v1's "dead pair" reading — the reuse-seam law's check-both-ends): `domain/preset/verbs/{export,import}.ts` are the LIVE portability-bundle descriptor arms (`"preset"` is a `PORTABLE_KINDS` member, `contracts/portability/index.ts:15,41`; whole-profile bundles round-trip presets today) — what has NO door is sharing/receiving ONE preset file (the client import dialog is ST-only, `preset-import-dialog.tsx`; no single-export affordance exists). |
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
| `params.maxOutputTokens` / `maxContextTokens` / `verbosity` | Output leaf | Params ▸ OUTPUT — output/context as ghost-armed `KnobRow` SLIDERS (owner-ruled, mock round 3; §4 cluster 4); verbosity a select |
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

### 3.1 Editing the BUILT-IN preset — fork-once, as it reads in this editor

The built-in opens like any preset: the same five views, every knob ghosted at its effective value,
every section body ghosting its built-in default — the ghost-default treatment applies to the
built-in's sections IDENTICALLY (nothing is special-cased; the lock is a WRITE property, not a render
mode). The
sequence when the user edits (the landed `usePresetAutosave` machinery, spelled as UX):

1. **First-ever edit (no fork exists): the SILENT COW — unchanged.** The edit autosaves through the
   serialized chain; the server copy-on-writes and returns the fork's row ("Default (edited)") — the
   mint happens exactly once per session chain; no dialog, no interruption.
2. **Edit while the owner already holds ≥1 fork (owner-ruled; BUILD lane in flight): the CHOICE.**
   The save chain INTERCEPTS before the write — a confirm-shaped dialog: *"Your edits to Default live
   in <fork name>"* → **Keep editing it** (primary — retargets the session to that fork, the newest
   built-in-descended one, and the pending edit converges there) vs **Start a new fork** (a name
   input — mints with `forkedFrom` lineage; the non-unique name index deliberately permits N
   deliberate forks). The dialog is the standard confirm anatomy + one name field — landed primitives,
   not drawn (nothing novel to draw).
3. either way the editor RETARGETS in place: the header name flips to the target fork's, the LIST
   selects it, and the built-in row stays locked and unchanged;
4. activation follows when the built-in was the active pick (the landed retarget) — the header's
   ACTIVE chip appears, or the not-active **Activate** echo renders (§16 row 3b, the sanctioned
   editor-side half of activation);
5. every subsequent save patches the target fork; the `AutosaveStatus` chip is the only narration.

One-home note (the load-bearing half of the ruling): the interception is a ROUTING DECISION inside
the ONE save path (`usePresetAutosave`'s chain — the exact seam that owns the silent COW), never a
second write path; its two arms route to EXISTING homes (§16 row 32).

The built-in's LIST row: lock glyph, no Delete (landed), Export hidden (§16.1), its activate toggle =
the null pick.

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
4. **OUTPUT** — `maxOutputTokens` + `maxContextTokens` as `KnobRow` SLIDERS (owner-ruled, mock
   round 3): the SAME grammar as the sampling knobs — slider + the editable mono number twin, with the
   ghost/inherited arm carrying the placeholder-as-default semantics (ghost thumb at the effective
   value; provenance `2048 default` / `131072 window`). Ranges are capability-fed: output spans
   1..`capability.output.maxTokens.max`, context spans 1..`capability.context.window` — integer step 1
   with a range-sized `largeStep` for keyboard paging (the Base UI root passes all three through);
   precision entry is the twin's job, so a large range needs no log scale · `verbosity` · `stop`
   sequences as a chip-list editor (G2) · `maxBudgetUsd` per D6.
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
- **The integer-range arm** (output/context — owner-ruled, mock round 3): the same grammar at large
  ranges. Range from the capability, step 1, `largeStep` sized to the range (~1/64th, rounded to a
  power of two) for PageUp/PageDown; the twin accepts typed exact values, which is why 0..131072 needs
  no log scale.
- Ember budget (CD3): the explicit state uses foreground WEIGHT, not accent; accent stays reserved for
  focus and the pane's one primary. NOTE for the build: the shipped Slider indicator is `bg-primary`
  (`slider/variants.ts`) — the ghost variant must tone it down, and whether EXPLICIT rows keep the
  ember fill across a seven-row cluster is a side-eye taste call (D10-class), flagged not legislated.
- **The hover-hint rule (owner-ruled, mock round 3 — the [[hints→hover]] precedent generalized):** a
  row's VISIBLE text is the datum set — label, value, terse provenance (`default` · `← quality (deep)`
  · `clamped 1.2`). EXPLANATORY prose (what nucleus sampling is, what a provenance source means,
  bounds sentences, cluster teach lines) rides a hover hint — the landed `SettingRow.hint`
  info-glyph/`Tooltip` anatomy. Judgment boundaries: the DATUM never hides behind hover (the
  ghost-value rule), and decision-load-bearing lines (the clamp gloss, the staleness row, empty-state
  explainers) stay visible. Caveat: a DISABLED control cannot host the Tooltip wrap — its reason rides
  the native `title` (the base-ui aria-disabled precedent). The mocks mark tooltip-carried prose with
  a DOTTED UNDERLINE (the drawing convention for hover-carried explanation).

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

### 4.4 The freshness contract (owner-flagged: "we had a bitch of a time with the preview section")

The readouts and `preset.resolveEffective` are READS and MUST ride the invalidation system — a frozen
readout is the named prior failure class. The contract, in full:

- **Every preset WRITE invalidates the read set**: `preset.update` (every knob autosave, section edit,
  template edit), `preset.reset`, `preset.create` (create / duplicate / import), and the fork-once COW
  (a `preset.update` under the hood) each invalidate `preset.get`, `preset.list`, AND
  `preset.resolveEffective` — the effective profile re-resolves on save-settle, which is what makes
  "settle-live" TRUE rather than prose.
- **Activation invalidates**: the `seeds.defaultPresetId` patch invalidates the no-selection readout's
  read (it projects the ACTIVE preset) and `resolveEffective` where keyed by the active pick.
- **Capability/model changes invalidate**: the readout claims "resolved for <model>" — the same
  producer events that refetch `connection.resolveChatCapability` today (the settings/routing writes)
  must fan to `resolveEffective` and the capability card, or the provenance line lies after a model
  swap.
- **The landed `query-freshness-coverage` GATE is the wall**: `preset.resolveEffective` and every new
  readout query get classified in the freshness map at birth — the gate makes an unclassified (frozen)
  surface RED, so the build lane structurally cannot ship the prior failure class.
- **Router-sweep classification**: `preset.resolveEffective` is a new proc — it lands with its
  cross-tenant sweep row (PROBED: caller-scoped preset read) per the standing new-router rule.
- **The BINDING is a READ of chat state (§7.1, ruled)**: while bound, chat changes invalidate the
  bound readout/preview queries — turn commits + canon changes on the bound chat (the `chatsChanged`
  fan the preview read already rides) and a LAST-OPEN-CHAT handle change (bind target moved) each
  refetch; the `presetOverride` preview read is classified in the `query-freshness-coverage` gate at
  birth like every other read here.
- **The tested property**: an integration/CT pin drives a write → asserts the invalidation fired → the
  readout refetched (the settle-live loop, proven not narrated).

## 5. The Prompt view

### 5.0 THE TWO CONCEPTS, SORTED (owner escalation, round 4 — the conflation this kills)

The owner's read of the Actions mock as "the thing for presets" exposed a real presentation defect:
the mock set drew only DRILL-INS, never the rack itself, so the guided-template LIST read as the
section manager — and its (correct) lack of toggles/reorder/create read as a miss. The sort, written
as law:

- **A GUIDED TEMPLATE fires when a USER CLICKS A BUTTON** (steer / impersonate / continue / rewrite /
  opening / greeting studio). It is prose wrapping for a one-shot. Its field set (owner-refined,
  round 4b: *"depth and role and default/custom are valid for templates as well… wrap in like
  prefill"*): the template text (ghost-default), the delivery **role**, and the delivery **depth** —
  today's contract carries `prompt` + `role` only (`contracts/preset/index.ts:314-320`) with depth
  FIXED at 0 by the role comment; G10 grows the contract by an optional `depth` (absent = 0, the
  tail — byte-compatible with every stored blob), so the fixture becomes the default. PREFILL is
  CORRECTED per owner + ST source: assistant-role delivery is just an assistant-VOICED message —
  **prefill is a POSITION, not a role**: an assistant message at the PROMPT TAIL the model continues,
  and per-wire (ST receipt: the `continue_prefill` mode shifts the message-to-continue and prepends
  `assistant_prefill` ONLY when it is assistant-role AND the source is Claude —
  `SillyTavern/public/scripts/openai.js:1319-1331`; the setting is its own Claude-gated field,
  `:380,:490`). In our model the prefill-shaped CONFIGURATION is `role: assistant` + `depth: 0` with
  nothing after it — the delivery cluster MARKS that configuration ("tail prefill · normalized where
  the wire lacks it"); the role option label stays plain. Nudges (`formatStrings.*`) stay pure
  strings — text only.
- **A PROMPT SECTION is an ASSEMBLY ROW** — arrangement is its meaning. It owns the section-only
  vocabulary: enable, order-in-rack, zone, splice depth/order, triggers, role, override locks, and
  (literals) create/name/delete.

**The field×concept table — what lives where, and WHY:**

| field / capability | guided template (Actions) | prompt section (Prompt) | why |
| - | - | - | - |
| body text, ghost-default-when-empty (Default/Custom state) | YES (`prompt` — the state chip is the same derivation) | YES (literal content / marker framing) | both are authored prose; ONE ghost grammar + ONE state derivation (`guidedFooterState`, §5.2a) |
| `{{input}}` splice + lint | YES — the steer lands here | NO — the `guided_instruction` MARKER carries the resolved steer into the assembly | the steer exists only when a button fires |
| delivered-as role | YES (`role`) — assistant is a VOICE; the `assistant`+`depth 0` CONFIGURATION gets the "tail prefill" mark | YES — the same conditional mark at the tail | both deliver on the wire; ONE role vocabulary (`MESSAGE_ROLE_ITEMS`); prefill = position, per the §5.0 ST receipt |
| inject depth | **YES (owner, round 4b)** — `depth` joins the contract (G10; absent = 0/tail, the current behavior) | YES (Delivery, beside role — round-3 ruling) | both are in-chat delivery; ONE delivery-cluster grammar (role + depth side by side) serves BOTH drill-ins — the one-home rule made literal (§13 `DeliveryCluster`) |
| splice order | NO | YES (Placement) | within-depth tiebreak is assembly vocabulary |
| zone | NO | YES | zones are pivot-relative arrangement |
| triggers | **NO — the BUTTON is the trigger** | YES (normal / continue / swipe / …) | a guided template's firing condition is the user's click |
| enable / off | **NO — an action always resolves SOME template** (empty = the default rides; the fixed enum cannot be "off") | YES (rack toggle + drilled header echo) | turning Impersonate's template "off" would leave the button firing nothing |
| reorder | **NO — there is no order among button templates** | YES (drag + Move echo) | assembly order is meaning; a button set has none |
| create / delete / name | **NO — `GUIDED_ACTION_KINDS` is a fixed product enum** | literals: full CRUD; markers: no-delete (§5.2) | the action set is product surface; sections are user arrangement |
| override locks | NO | `main_prompt` / `post_history` only | card/room overrides target SECTIONS |

A mock or build giving the Actions view toggles, drag handles, or an Add affordance — or giving a
guided-template editor the ARRANGEMENT vocabulary (zone / splice order / triggers / locks) — is a
defect against this table (§16 row 31 pins the absence). Role, depth, and the Default/Custom ghost
state are the SHARED half, and they ship as shared pieces, never re-spelled per surface.

### 5.1 The rack — the section manager, drawn first-class (round-4 full redesign)

The rack IS the list you manage — the ST prompt-manager anatomy (owner screenshots: per-row enable
toggle, edit pencil, per-row token count, mandatory rows without delete), on our grammar. Mock:
`mocks/preset-redesign/prompt-rack.html` (the rack itself, first-class — the round-4 presentation fix).

**Row anatomy, left → right:** drag GRIP (`SortableList handle` — landed) · type glyph (literal /
templated / carrier) · NAME button (= SELECT, the inspect act — §5.2's split) with the subtitle scent ·
cue badges ONLY-WHEN-SET (splice `@depth·order` as a compact CUE — the fused form is legal as a
read-only badge; the EDITOR fields stay split per round 3 · triggers · lock · custom-body dot ·
non-system role) · the ~token estimate (mono, line-through when off) · the enable Switch (ABSENT on
the pivot) · the drill chevron/pencil (= EDIT). A disabled row dims whole; selection = ember tint +
left bar; zone accents stay (steel-blue setup / warm-amber post) with the pivot band as the horizon.

**Manage capabilities, each with its one home (§16):** per-row ON/OFF (row 18, + the drilled header
echo) · DRAG reorder with the keyboard path (dnd-kit keyboard sensors are in-house — the
sortable-keyboard-focus lesson applies: focus restores at DROP; the ⋯ Move-above/below item is the
sanctioned no-pointer/zone-jump echo, row 17) · CREATE + NAME (row 16: the Add menu mints — a literal
or any ABSENT marker — and AUTO-DRILLS into the editor where the NAME field is, so naming is part of
creating, one flow) · DELETE literals-only in the drill-in ⋯ (rows 20-21; markers never, §5.2).

ONE functional correction from the landed rack: the pivot band's enable Switch DIES
(`pivot-band.tsx:52-56` renders one today; under §5.2's structural rule the pivot can be neither
deleted, silenced, nor disabled — a disabled pivot is an assembly with nowhere to splice the
conversation, the exact state the missing-pivot warning exists to prevent). Visual conformance: rows drop `rounded-card border` for the instrument
ListRow skin (hairline separation, `rounded-control`), the zone chips join the CONTEXT readout (§7),
and the Compose|Preview toolbar toggle DIES — preview moves whole to the CONTEXT readout (decision
D2), so compose is the center's only mode and the toolbar is just **Add**.

### 5.2 The consolidated section editor (F5 dead)

**Select and drill are DISTINCT acts (ST-parity ruling, round 4).** A rack row CLICK selects — the
CONTEXT readout echoes (highlighted token bar, attribution, preview focus): that echo IS the inspect
affordance, our answer to ST's name-click inspect popout. The row's trailing chevron (or Enter on the
focused row) DRILLS into the editor. The two acts never conflate: v3's "clicking a rack row drills"
is superseded — click = inspect, chevron/Enter = edit.

The drill-in owns the WHOLE section, in this order: body (branching by KIND, below) → delivery (name ·
role · **inject depth** — owner-ruled, mock round 3, verbatim: *"depth goes near whatever role it goes
in as"*; depth is a DELIVERY property and sits beside the role it rides) → placement (zone · **order**,
the within-depth tiebreak — depth and order are SEPARATE fields, never the fused `@depth · order`
spelling) → triggers → override locks. The CONTEXT "Section" inspector tab is DELETED with its bridge
machinery (`preset-editor-bridge.ts`, `preset-section-inspector.tsx`, `section-inspector-controls.tsx`
move into the drill-in) — one object, one place. The `onRevealSection` choreography and the
`useSelectedPresetSectionId` store survive (selection is still the drill key); what dies is the second
geography.

**The STRUCTURAL SET — markers cannot be deleted (ST-parity ruling, round 4).** The contract's own
three-branch union IS the classification (`contracts/preset/index.ts:604-642`): `literal` sections are
USER-AUTHORED; `marker` sections — the ten TEMPLATED markers (`main_prompt` · `char_description` ·
`char_personality` · `scenario` · `dialogue_examples` · `post_history` · `persona` · `memory` ·
`compact_summary` · `guided_instruction`, `:560-571`) and the three PLAIN markers (`chat_history` ·
`world_info_before` · `world_info_after`, `:574`) — are STRUCTURAL. The rules:

- a MARKER's ⋯ menu carries NO Delete and NO Duplicate (omitted entirely, never disabled-Delete) —
  its ONE off-switch is the enable toggle (the tri-state's Silent arm is DEAD, below);
- a LITERAL keeps the full set (Duplicate · Move · Delete-behind-confirm);
- the PIVOT (`chat_history`) can be neither deleted, silenced (it has no template arm), NOR disabled
  (§5.1 — the enable switch dies), and never duplicated; duplicate pivots from imports keep the landed
  inert-warning-band treatment (debris display, not an affordance);
- the one-way door is DELIBERATE ST parity: the Add menu still offers ABSENT markers (an ST import can
  arrive marker-less), and a placed marker is thereafter disabled-not-deleted — exactly ST's
  fixed-marker-list behavior. Today's code allows deleting any section including the pivot (the
  inspector's Delete has no marker branch) — that is what this rule kills.

**§5.2a — THE TRI-STATE DIES (owner-ruled, round 4, verbatim: "Silent is just toggling the section
off, default is default, custom is if you have something — multiple concepts for the same thing and
doing it worse").** The Default/Custom/Silent segmented control was three-state vocabulary for what
two existing mechanisms already express, and it goes:

- **ONE textarea, ghost-when-empty**: empty = the built-in default rides (ghosted in the field, the
  Actions templates' landed grammar — `guidedFooterState`'s "empty IS the ghosted default" semantic,
  cited as the precedent this aligns to); typed = custom; **reset = clear the field** (§16 row 24 —
  one reset grammar across sections AND templates). The empty-default markers (`main_prompt`,
  `post_history`) ghost their explainer line instead of bare nothing.
- **OFF is solely the ENABLE mechanism.** The rack row's Switch stays the primary home; the drill-in
  HEADER gains an enable Switch as a SANCTIONED ECHO (§16 row 18 amended): while drilled, the rack —
  the primary home — is off-screen, and an editor silently editing a disabled section would hide the
  one state that makes every field moot. Both bind the SAME `sections[i].enabled` form path (one
  writer by construction).
- **The stored `""` arm is RETIRED (gap-close G8):** the contract's "Empty = render nothing"
  (`contracts/preset/index.ts:631`) becomes unrepresentable from the editor; a v4→v5 lift maps a
  stored `template: ""` → `{ template: undefined, enabled: false }` (Silent's stored form becomes the
  enable mechanism it always was — NO-LEGACY, one-time, the lift chain exists for exactly this), and
  the assembler's empty-template arm is deleted in the same change.

**The BODY branches by KIND (owner ST-screenshot ruling: carriers are source-attributed, never
editable, never blank).** The schema branch is the authority — plain markers carry NO `template` field
(`:615-622`), which IS the carrier distinction; no new flag is invented:

| kind | body slot renders |
| - | - |
| `literal` (authored) | the MacroField body editor (unchanged) |
| TEMPLATED marker | ONE textarea for the FRAMING template, ghosting the built-in default when empty (§5.2a — the tri-state is DEAD) + a SOURCE line naming where the substance flows from ("Substance: the character card's Description" / "the persona" / "chat memory") — the template frames carrier content, it is not the content |
| PLAIN marker (pure carrier) | a SOURCE-ATTRIBUTION panel, never a textarea, never blank: the source domain + the expected shape + a nav link — `world_info_before/after`: "Content comes from World info — manage in World info ↗" plus the `formatStrings.wiFormat` ENTRY-WRAPPER field beneath it (clearly labeled as framing each entry — a format string, not the body; the landed shared-wrapper editor keeps its home) · `chat_history`: "Content is the conversation itself" (no fields) |

The nav link is a sanctioned cross-SECTION navigation echo (§16 row 30) riding the standing rail
store writers.

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

**This list is a FIXED PRODUCT ENUM, not a manageable collection (§5.0):** no toggles, no drag
handles, no Add — `GUIDED_ACTION_KINDS` + the nudges are the exhaustive set, and every row always
resolves (empty = the default rides). The manageable list lives in Prompt (§5.1); a manage affordance
appearing here is the §5.0 conflation rebuilt. The drill-in's HONEST field set (owner-refined, round
4b): the template textarea (ghost-default) + the DELIVERY CLUSTER — role beside depth (G10; blank =
0, the tail) — the SAME cluster grammar the section drill-in uses (one home, §13 `DeliveryCluster`;
one role vocabulary via `MESSAGE_ROLE_ITEMS`). The cluster renders the **"tail prefill"** mark ONLY
for the `assistant` + `depth 0` configuration (prefill is a position, not a role — the §5.0 ST
receipt), with the per-wire normalization gloss.
Zone / splice order / triggers / locks are ARRANGEMENT vocabulary and never render here (the button
is the trigger). Nudge editors are text-only (a `formatStrings` slot has no role or depth).

Row anatomy: kind (`label` voice) · fires-when `gloss` · role badge (only when non-system) ·
Default/Customized state chip · a one-line mono template preview (truncated; the ghosted default when
unset). The SAME select/drill split as the rack (§5.2): row click SELECTS — the Actions readout
echoes the resolved preview (§7) — and the chevron/Enter drills into the editor: role select +
`MacroField` ghosting the factory default + the landed missing-`{{input}}` lint + the
assistant-prefill note. The impersonate row keeps its
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

### 6.5 The ST TEMPLATE CENSUS — every ST slot mapped to its ONE home (owner-supplied list, round 4b)

The owner's parity requirement: *"we need to make sure we have the same templates along with our
own"* — and his round-4c direction: *stop inventing semantics; pull the actual ST fields from
source.* Done — every claim below is receipted from the local checkout
(`SillyTavern/public/scripts/openai.js`). **The source-derived law: EVERY ST utility template is a
TEXT-ONLY setting** (plain strings in `oai_settings` — the settings map `:363-381`, defaults
`:425-436`); none carries a role/depth/position FIELD — role and position are FIXED at each
consumption site (system everywhere except `send_if_empty`, which lands as a USER message). Our
`role` + `depth` on guided actions is therefore a DELIBERATE EXCESS over ST (owner-ruled, round 4b),
recorded against the receipt, and the census verdicts stand on the evidence:

| ST template | ST field set + consumption (receipts) | our ONE home | verdict |
| - | - | - | - |
| Impersonation prompt | text-only (`:104,:364`); a SYSTEM prompt, id `impersonate`, in the unordered system set (`:1370,:1381`); ST's separate `assistant_impersonation` prefill is Claude-gated (`:381,:491`) | TWO jobs, one home each: `formatStrings.impersonateNudge` (the standing voice-lock — the measured IMP-1 instrument) + `guidedActions.impersonate` (the `{{input}}` wrap when you STEER an impersonation) | **EXISTS** — ST's single slot is honestly two jobs here; the census notes the split so nobody "unifies" the pair into drift |
| World Info format (`{0}` wrapper) | text-only (`:106`); `formatWorldInfo` string-format wrapper (`:788-800`) feeding the fixed system WI markers (`:1375-1376`) | `formatStrings.wiFormat` (`{{entry}}`) | **EXISTS** |
| Scenario format | text-only (`:113`); substituted into the system `scenario` marker's content (`:1367,:1378`) | the `scenario` MARKER's template (`DEFAULT_MARKER_TEMPLATES.scenario` = `{{scenario}}`) | **EXISTS** — a section template, deliberately NOT a second formatString (one home) |
| Personality format | text-only (`:112`); same shape (`:1368,:1377`) | the `char_personality` MARKER's template | **EXISTS** (same shape) |
| Group Nudge prompt | text-only (`:114`); a SYSTEM prompt, id `groupNudge` (`:1369,:1382`), budget-reserved beside history and SUPPRESSED for impersonate (`:897-901`) | room-owned, NOT preset-owned — the recorded importer ruling (`DROPPABLE_FIELDS`: "group nudge is room-owned"); the multi-character reply-forcing machinery is the chat domain's arbitration | **DELIBERATELY ELSEWHERE** — named, not missing |
| New Chat / New Group Chat | text-only (`:107-108`); one of the two picked by group-ness → a SYSTEM message `newMainChat` reserved at history population (`:892-894`) | no home — ST emits a history-start boundary marker; our assembly emits none (and our rooms have no chat/group split, so ONE slot covers both) | **ADD (G9)**: `formatStrings.newChatMarker`, blank-by-default (= today's behavior); the assembler emits it at history start when set |
| New Example Chat | text-only (`:109`); a SYSTEM message `newChat` inserted per example block (`:1107`) | the `dialogue_examples` MARKER's template — it already frames EACH example block (the contract's own doc: "One example dialogue block, rendered inside the dialogue-examples marker") | **EXISTS** — ST's separator IS our per-block wrapper |
| Continue nudge | text with `{{lastChatMessage}}` extended substitution (`:110,:910`); a SYSTEM prompt spliced with the continued message — GATED by `!continue_prefill` (`:905-925`): ST's continue has TWO modes, nudge vs tail-prefill; ours rides the nudge shape (a continue-prefill mode is a named doorway, not designed) | `formatStrings.continueNudge` | **EXISTS** |
| Replace empty message | text, default empty (`:363,:425`); a USER message `emptyUserMessageReplacement` inserted into chatHistory ONLY when the last message is assistant-role (`:928-932`) | none — and DELIBERATELY: in ST an empty send needs placeholder text; here the empty-composer act IS the first-class **Continue** action (its nudge is the slot) | **DELIBERATE ABSENCE** — recorded so it reads as mapped, not missed; revisit only if a real empty-send flow ever lands |

Census rule: a future ST-parity sweep starts HERE, not at the ST list — each row names where the job
lives, so a "missing template" claim must first beat the mapping.

## 7. The CONTEXT panel — a per-view readout, never decoration (decision D2, amended per owner steer 2026-08-01)

With the inspector consolidated into the drill-in (§5.2), CONTEXT stops renting editing and becomes
the preset's INSTRUMENT — and it PROJECTS BY VIEW: what the eye needs depends on which hand is
active. Owner steer (2026-08-01, verbatim): *"context actually needs to be useful"* — so every
element below names the decision it informs; an element that informs no decision does not ship. The
v1 draft's single static Assembly readout is SUPERSEDED by this table.

**Mechanics — three pins:**

- **The active view becomes section state.** The editor's view selection moves from local `Tabs`
  state into the preset selection store (`presetEditorView`, beside `useSelectedPresetSectionId`).
  The ONE writer is the editor's tab strip; CONTEXT projects from the same read and NEVER sets the
  view (the `contextTab`-seam pattern — a projection, not a second navigation surface).
- **CONTEXT reads SAVED truth only** — the `preset.get` row + `preset.resolveEffective` (§4.3) + the
  capability read. The form bridge does NOT return (§5.2's deletion stands): autosave-everywhere
  means saved lags typed edits by one debounce, the `AutosaveStatus` chip already narrates settle,
  and a pure-query CONTEXT needs no cross-region form machinery. Every readout is server-derived;
  "settle-live" is stated, never faked keystroke-live.
- **CONTEXT is read-only + navigation-only.** Its only interactive elements are the sanctioned
  selection ECHOES (§16 rows 14/19) — every one writes through the ONE selection store action. Zero
  mutation affordances live in the panel; that is a §16 standing invariant.
- **Prose previews NEVER fake a resolution (owner-flagged hazard).** The preset editor is
  chat-independent — identity macros have no referent here, and identity-macro resolution is
  CHAT-OWNED (Ruling B: domains THREAD values, never re-derive). The split rides the macro REGISTRY's
  own `requires` metadata (the landed preview-engine concept — no new classification): a macro with no
  chat requirement preview-resolves (a user macro expands structurally; a ChoiceBlock renders its
  declared default labeled `default pick`); an identity / chat-scoped macro (`{{char}}` `{{user}}`
  `{{persona}}` `{{memory}}` `{{compact_summary}}` the rpg set, and fire-time inputs like
  `{{person}}`/`{{input}}`) renders AS ITS TOKEN with a distinct mark + a "resolves in chat" gloss.
  The preview's value is the assembled SHAPE with runtime tokens marked — never a fabricated
  resolution. Applies to EVERY prose preview: the Actions resolved preview, the Prompt assembled
  preview, and any future readout.

**The per-view table** (mock: `mocks/preset-redesign/context-readouts.html` — all six panels; the
Params panel also appears in `params-deck.html` beside its CONTENT view):

| CONTENT view | CONTEXT shows | the decision each element informs |
| - | - | - |
| **no selection** (LIST browsing, no editor open) | the ACTIVE preset's effective profile — its name + the §4.3 datum rows + the capability line | "is what generation will use RIGHT NOW what I want — do I need to open, fork, or activate anything before my next turn?" It is the §4.3 read pointed at the active pick — zero new machinery, and the pane is useful before a row is ever clicked |
| **Params** | the effective profile (every resolved knob + provenance) · the CAPABILITY card (model · window · output cap · the honored-knob list) · the quality-mapping line · the staleness COUNT | which knob to touch next (effective vs intent) · why a knob is absent or clamps (capability — today you cannot see WHY the panel shows only some sliders) · whether to trust the dial or go explicit (mapping) · whether stored intent is dead weight (staleness — the Keep/Clear AFFORDANCE stays in the deck, §4.2; the count is a pointer only) |
| **Prompt** | the zone budget (SETUP/POST counts + ~tokens) · per-section token bars, the SELECTED section highlighted — **this selection echo IS the inspect view** (ST name-click parity: click a row to inspect here, chevron to edit) · a selected CARRIER's SOURCE ATTRIBUTION + expected shape (chat-free facts only — the source domain, a library-level count where one exists chat-free; never fake rows) · pivot-health echo · the assembled preview on demand (block-click selects the section) | what to trim or disable when the system block bloats (bars) · what a carrier IS and where to manage it (attribution) · where a section actually lands (preview) · the structural fix when the pivot is missing/duplicated (health) |
| **Actions** | the DELIVERY PATH: the `guided_instruction` marker's health (healthy/off/absent) + its zone/position/depth in the current arrangement, with the section-select echo · the SELECTED action row's RESOLVED preview (the template with runtime tokens MARKED and only chat-independent macros resolved — the honesty pin above) | "will my customized template actually land, and where in the prompt?" — the §6 cross-link promoted from a chip you must notice to a standing readout · "what does the model actually receive when I fire this action?" (the resolved preview) |
| **Data** | per-variable / per-macro REFERENCE COUNTS within this preset — which sections, templates, nudges, and macro bodies mention `{{name}}` (each reference is a section-select echo) · an unreferenced marker | "is this safe to rename or delete, and where do I look first?" — scoped honestly: a zero count reads "no references in THIS preset", never "dead" (chat-time consumers outside the preset are not claimed). The scan is a pure client derivation over the saved config — no new server read |
| **Transforms** | the PIPELINE readout, two lanes in execution order: prompt-side (regex script counts per `REGEX_PLACEMENTS` slot, on/off) · reply-side (native reasoning → `reasoningParse` fallback → AI-output/display regex → each post-process step, on/off) | "why did the reply change / which stage do I edit?" — the ORDER is the datum; today it lives only in engine file headers |

**Materialization honesty (owner ST-screenshot ruling, round 4 — the boundary stated so no lane
invents fake rows):** ST's inspect popout shows a marker's ACTUAL expanded rows
(`chatHistory-1/assistant/944tok…`) because ST's prompt manager lives INSIDE a chat. Our preset editor
is chat-independent, so: (1) editor-side, a selected carrier's readout shows ATTRIBUTION + expected
shape only — and the assembled preview is honest by construction: `preview-model.ts:1-4` is *"Display
only — macros are tokenized, never resolved; nothing here touches live chat data"* — a pure projection
over the preset's own `sections`, plain markers contributing their one-line hint (`:95`), never
materialized rows; (2) the REAL materialization view (actual spliced rows, per-row token costs) is the
CHAT-side surface — the landed PREV/assembly machinery already renders the true per-turn context
against a live room. The binding to that reality is RULED (owner, 08-02 — §7.1):
the readouts AUTO-BIND to the last-open chat, named + dismissible; the boundary above is the UNBOUND
arm's posture — attribution editor-side, materialization chat-side, nothing faked — and it survives
as the dismissed/no-recent-chat fallback.

### 7.1 The NAME-CLICK INSPECT — RULED (owner, 08-02): auto-bind to the last-open chat

The ST reference, stated exactly (owner screenshots): clicking a marker's NAME opens an Inspect panel
("Prompt List — the list of prompts associated with this marker") showing the marker's ACTUAL
materialized rows — `chatHistory-1 / assistant / 944 tokens`, `chatHistory-2 / user / 167`, … — each
with an expander. ST can do this because its manager lives INSIDE a chat, and the workflow the
screenshots capture is MID-PLAY preset tuning — which is also this owner's actual workflow. Four arms,
weighed without anchoring on the current design:

- **(a) select → CONTEXT echo (the current design).** Honest verdict: NOT equivalent. The echo shows
  ONE aggregate ~token estimate per section, and for a CARRIER that estimate is measured over the
  TEMPLATE text — near zero — while the real cost (the whole conversation; the active WI set) is
  precisely what a tuner wants. (a) is an ARRANGEMENT instrument, not a materialization instrument. It
  stays correct as the unbound floor; calling it "the inspect" oversold it.
- **(b) a dedicated editor-side inspect surface per marker.** Where would honest data come from?
  Nowhere chat-free: WI offers only library-level counts (the ACTIVE set is chat-scoped by the
  junctions), `chat_history`/`memory` have literally nothing. (b) either fakes rows (banned) or
  quietly becomes (c). Rejected as its own arm.
- **(c) an OPT-IN INSPECTION BINDING to the user's active chat.** The observation with teeth: there is
  ONE global active preset and, mid-play, always a live chat. A binding chip on the readout
  ("Inspecting against: <chat> · unbind") makes the readout REAL — materialized per-marker rows with
  true roles + true token counts (ST's exact panel, with honest data), AND identity macros resolve for
  real, because the CHAT resolves them (Ruling B is SATISFIED, not violated: chat-side resolution,
  editor-side display). One binding kills BOTH §7 honesty compromises. Mechanics: ONE server read —
  the landed chat-side PREV/assembly preview seam grows a `presetOverride` param (assemble THIS chat
  as if THIS preset were active); the chat Preview tab and the bound preset readout project the SAME
  read (one home, two projections — the §16 posture). Costs, named: (i) read-only chat coupling in the
  preset editor — the config-rail boundary survives because the binding never WRITES chat state and
  the editor's writes stay chat-independent; (ii) freshness — the bound readout rides `chatsChanged` +
  turn commits (two new §4.4 rows); (iii) `presetOverride` is new surface on the preview seam (small
  but real: previewing a NON-active preset against a room); (iv) the unbound state stays first-class
  (no live chat ⇒ the (a) floor + attribution — never a broken pane).
- **(d) materialization stays chat-side only, nav link from the editor.** Zero coupling, maximal
  honesty — and it preserves a pane-hop loop (edit → jump to the chat Preview tab → look → jump back)
  through the exact workflow the ST inspect exists to de-friction.

**THE RULING (owner, 08-02 — arm (c) as refined):** the editor's readouts/preview **AUTO-BIND to the
LAST-OPEN CHAT** — the active-chat handle that survives section switches (the proven nav-round-trip
property: the composed CT pinned that navigation round-trips keep the handle; only a page RELOAD
drops it by design, which lands you in the unbound arm honestly). The binding is **NAMED AND
DISMISSIBLE** in the readout header — "inspecting against: <chat name> ✕". Dismissing, or having no
recent chat, falls back to the HONEST TOKEN VIEW (the chat-free arm above, exactly as designed —
never a broken pane). While bound, materialized rows + identity macros resolve through the ONE
`presetOverride` preview read. **The binding control is ONE control with two states** (§16 row 33):
bound → the ✕ dismisses; dismissed → the same header slot renders a quiet "Inspect against <chat>"
re-bind chip (judgment call, stated: requiring a section round-trip to undo one click is a trap — the
chip is the same control's other face, not a second home). The weighing above stands as the rationale
record; (d) stays true regardless — the chat Preview tab keeps its own view of the same read.
Sequenced AFTER P0–P5; the build lands the `presetOverride` seam + the §4.4 binding freshness rows.

**Where the honest answer is "the same readout," said per-view:** no view duplicates another
wholesale. Prompt and Actions share the arrangement SOURCE (both project `sections` — one derivation,
two projections), and the no-selection state IS the Params readout pointed at the active preset
(stated above, not hidden). The v1 draft showed budget + preview beside the Params hand — decoration
half the time; they belong to the Prompt hand and moved there.

The Usage placeholder (two sentences of prose today) folds into a footer note until per-chat
bindings exist. This is the panel earning its keep the HUD way: CONTENT = the hand, CONTEXT = the
eye — one eye per hand.

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
- **Kebab:** Activate · Rename · Duplicate (mirror) · **Export** (gap-close G6 — the thin
  single-preset arm over the live portability serde; hidden on the built-in row, matching the bundle's
  own exclusion) ·
  Delete (landed active-aware confirm copy).
- **Lineage — stated seam, not faked. LANDED** (`presets.forked_from` self-FK; `PresetSummary.forkedFrom`
  carries the ID, `ChatSummary.parentChatId`-style). The subtitle now reads
  "\[kind ·] forked from &lt;name&gt; · edited &lt;stamp&gt;", with the source NAME resolved by the surface
  from the rows it already holds — a source it cannot see (a PACKAGED template is never in the readable
  list) prints no lineage at all. Nothing is derived from name-matching heuristics. The same column is the
  copy-on-write CONVERGENCE key: a second COW of the built-in retargets the owner's existing fork instead
  of minting "Default (edited) 2" (residual + why it is not a UNIQUE index: `domain/preset/verbs/update.ts`).
- **The fork CHOICE — LANDED** (owner ruling). Convergence is right only while the owner has nothing to
  forget: the FIRST edit of the built-in still COWs silently, but once they already have a fork the editor
  asks BEFORE the write — "keep editing &lt;fork&gt;" (the primary; the convergence pick, named) or "start a
  new fork" (a name step, pre-filled "&lt;source&gt; fork N"). The write is PARKED on the answer at the one
  place a built-in edit enters the mutation path (`use-preset-autosave.ts`); the server takes the answer as
  an explicit `fork` intent (`{mode:"converge"|"new"}` — absent stays the back-compat + race backstop, and
  N forks per source are legal because `(owner_id, forked_from)` is deliberately NON-unique).
- The band (`PresetListHeader` — title/count/New/Import) is landed and stands.

## 10. Gap-close register (small, named, each independently landable)

| # | close | size |
| - | - | - |
| G1 | `topA` KnobRow (add to `SAMPLING_KNOB_SPECS`, capability-gated) + fix the ST importer's contradictory `top_a` drop (`index.ts:1417-1420` — map it like `minP`, non-default only) | S |
| G2 | `stop` sequences chip-list editor (OUTPUT) | S |
| G3 | `providerContextCompression` switch (CONTEXT) with per-backend honesty gloss | S |
| G4 | `compaction.verbatimTail` number row (CONTEXT), placeholder = engine floor | S |
| G5 | `responseNudge` row (Actions ▸ NUDGES) | S |
| G6 | The SINGLE-preset door, as THIN ARMS over the live portability seam (owner-corrected — never a parallel path): **export** = client-side `buildPresetFile(name, config)` from the cached `preset.get` row → download (the contract fn IS the bundle arm's serde — one home, `verbs/export.ts:15`; the affordance hides on the built-in row, matching the bundle's own system-default exclusion, `export.ts:1-3`); **import** = a thin `preset.importFile` proc DELEGATING to the existing `ImportPreset` verb, surfaced as the orb arm of the ONE band dialog — bundle semantics by construction: idempotent on `(ownerId, name)`, same-named preset MERGED in place else created under kind `roleplay`, `presetsChanged` emitted (`verbs/import.ts:2-4,40-76` — cited, reused, not re-derived); the dialog states the merge semantic | S |
| G10 | `guidedActions.<kind>.depth` (owner, round 4b): optional int 0..MAX_INJECTION_DEPTH on `guidedActionConfigSchema`; absent = 0 (the tail — byte-compatible, today's fixed behavior becomes the default); edited via the SHARED DeliveryCluster | S |
| G9 | `formatStrings.newChatMarker` (census §6.5): blank-by-default history-start boundary; one slot serves chat + group (no split exists here); assembler emits only when non-blank | S |
| G8 | The tri-state retirement lift (§5.2a): v4→v5 config lift mapping `template: ""` → `{template: undefined, enabled: false}`; the assembler's empty-template arm + the contract's "Empty = render nothing" clause deleted with it | S |
| G7 | Editor header truth: the ACTIVE state chip + a quiet Activate affordance when not active (a §16 row-3 sanctioned echo — same mutation as the row toggle), and the capability provenance chip ("for <model>") — the fork-once retarget's activation move becomes visible where you're editing | S |

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
| one home per affordance | the §16 audit table is the standing review artifact — its enforcement column names the per-row wall (shared writers, deleted twins, compile-time bridge death) | review |
| CONTEXT is read-only + navigation-only | §16 invariant (i): context bodies carry zero mutation hooks; selection echoes ride the one store writer | review + CT |
| readout freshness (§4.4) | the landed `query-freshness-coverage` gate — `preset.resolveEffective` + every readout query classified at birth; an unclassified surface is RED | lint-time + the write→refetch int pin |
| new proc sweep | `preset.resolveEffective` + `preset.importFile` land with their cross-tenant sweep rows (PROBED — caller-scoped) | test-time |
| single-preset portability = the bundle seam | the import door DELEGATES to the one `ImportPreset` verb; the export door serializes via the one `buildPresetFile` — a second serde or collision rule is the banned parallel path | review |
| density conformance | the landed density-tier gate arms (A1 radius, A2 box-in-box) — the guided-card and rack-row `rounded-card border` rows come OUT of the baseline in this sweep, shrink-only | lint-time |

## 13. Primitives inventory — the DEFINITIVE build-input table (re-verified post-approval + round-3 amendments)

> **Status: the build lanes dispatch FROM this table.** D1–D7 are APPROVED as recommended; the table
> below was re-verified against the ACTUAL `@orb/ui` seal this session (every verdict cites the
> surface read, not an assumption), and re-run against the round-3 amendments (output/context KnobRow
> sliders · the depth/order split · the hover-hint rule). Verdict vocabulary: **EXISTS** (compose
> as-is) · **VARIANT-ROW** (a new variant arm on an existing primitive — never a `className`
> override, the anti-fugly law) · **COMPOSITE** (feature-local or client-shared composition, no
> `@orb/ui` change) · **MINT** (a NEW primitive — none survived verification, stated per row where
> it was checked).

| piece | verdict | receipt + build note |
| - | - | - |
| the slider control, INCLUDING large integer ranges (output 1..32768, context 1..131072) | **EXISTS** | `slider/slider.tsx:15` — the Base UI `SliderRootProps` pass-through carries `min`/`max`/`step`/`largeStep`; a large range is props, and precision entry belongs to the twin, so no log-scale machinery. NOT a mint |
| slider ghost/inherited tone | **VARIANT-ROW** | `slider/variants.ts` has NO tone axis today, and the indicator is hardcoded `bg-primary` — add `tone: "default" \| "ghost"` dimming track-fill + thumb + indicator. Flag for the build: whether EXPLICIT rows keep the ember fill across a 7-row cluster is a CD3/D10-class side-eye call |
| the editable numeric twin | **VARIANT-ROW** | `number-field/` EXISTS (Base UI; textbox role by design, bounds as accessible DESCRIPTION — `number-field.tsx:19-26`; placeholder-as-default built in; drag-to-scrub bonus). Today's skin is full-width + touch-target steppers + centered text (`variants.ts`) — add `size="inline"`: stepper-less compact group, mono tabular right-aligned ~9ch, scrub + bounds-description retained. CTs locate by textbox (the landed Base UI reality) |
| `DeliveryCluster` (role select + depth field, side by side — round-3 arrangement) | **COMPOSITE** (feature-local) | ONE grammar serving BOTH drill-ins (section §5.2 + template §6.1 — the owner's one-home charge made literal); role items from the shared `MESSAGE_ROLE_ITEMS`, depth via `NumberField size="inline"`; the conditional "tail prefill" mark (assistant + depth-0 only — §5.0) renders in ONE place |
| `KnobRow` (label · slider · twin · reset · provenance) | **COMPOSITE** (feature-local) | `features/preset/components/knob-row.tsx` — Row + Field + Slider(tone) + NumberField(inline) + ghost reset Button + Text voices. ONE consumer today; promotes to `components/` when a second feature (rpg GM knobs, connections preview) adopts it — the R2 bar honored, not pre-paid |
| the quality segmented strip | **EXISTS** | `ToggleGroup`/`Toggle` (single-select, deselectable — the assembly-toolbar idiom); `option-strip` is the listbox-flavored alternative if the descriptions return |
| kicker cluster headers | **EXISTS** | `Section.kicker` (landed — `layout/section.tsx:17,45-49`) + `Text voice="kicker"` (density S1) |
| hover hints (the round-3 rule) | **EXISTS** | `primitives/tooltip/` + the landed `SettingRow.hint` info-glyph anatomy (`setting-row.tsx` imports Tooltip + Info). Disabled controls: native `title`, never a Tooltip wrap (the base-ui aria-disabled precedent). The dotted-underline is a DRAWING convention; the build renders the info-glyph/underline through the tooltip primitive |
| the staleness / callout row | **COMPOSITE** | the rack's missing-pivot warning-Row idiom — feature composition, no seal change |
| the stop-sequence chip list | **COMPOSITE** | Badge chips + ghost × icon Button + an add `Input` (the tag-chip anatomy on `--spacing-tight`); no chip-input primitive exists in the seal and none is needed — verified against the full primitives listing |
| seed · threshold · verbatim-tail · DEPTH · ORDER fields | **EXISTS** | `Field` + `NumberField size="inline"` (the same twin skin — one variant serves the deck rows AND the section editor's split depth/order fields) |
| the depth-beside-role delivery cluster | **EXISTS** | pure `Grid`/`Field` composition (round-3 relocation is layout, not primitive work) |
| actions / nudges list rows | **EXISTS** | `ListRow` (title · subtitle · meta · actions) + `Badge` state chip + `Text voice="datum"` preview — the projection-lane anatomy verbatim |
| template / nudge editors | **EXISTS** | `MacroField`/`MacroTextarea` with `placeholder` ghosting (landed) |
| the resolved-template block (`{{input}}` marked) | **EXISTS + VARIANT-ROW** | `highlighted-text/` is the renderer (char-range `<mark>` runs on the `highlight` token — `highlighted-text.tsx:8-19`) — checked as a mint candidate, it is not one. Its root is BODY-voice prose (`variants.ts`); add `skin="code"` (mono micro, muted) for the Actions readout |
| the pipeline step list (Transforms readout) | **COMPOSITE** | Stack/Row + Text voices + status glyphs — checked for a stepper/timeline primitive: none exists and none is needed (a static ordered read, not an interactive control) |
| budget bars (Prompt readout) | **EXISTS** + COMPOSITE row | `charts/meter/track-bar.tsx` — the decorative rail (aria-hidden, text-is-the-datum); the bar ROW (name · TrackBar · mono tokens, click-to-select) is a feature composition |
| effective-profile datum rows | **EXISTS** | Row + `Text voice="label"/"datum"/"gloss"` |
| the assembled preview | **EXISTS** | today's `AssemblyPreview`, relocated to the Prompt readout |
| rack rows (density conformance) | **EXISTS** | ListRow-skin treatment of the landed `SectionRow` composition (drop the border boxes; keep the three tab stops) |
| the activate row toggle | **EXISTS** | `components/row-toggle-action.tsx` (minted by the projection lane); the one-of-N radio SEMANTIC is caller-side (activate-only, never bare unpress) |
| inline Duplicate + kebab | **EXISTS** | `LibraryRow.inlineVerb` (landed) + `RowActionsMenu` |
| the band header | **EXISTS** | `components/list-pane-header.tsx` (landed) |
| variables / user-macro CRUD | **EXISTS** | `EntryListEditor` + the shared dialogs (landed) |
| **MINT (new primitive)** | **NONE** | every candidate was checked against the seal this session — slider (exists), numeric twin (exists), chip input (composition), resolved-template renderer (`HighlightedText` exists), pipeline list (composition), tooltip (exists). The build needs ZERO new primitives |

**Build-material summary: zero primitive MINTS · three VARIANT-ROWS (`Slider tone="ghost"` ·
`NumberField size="inline"` · `HighlightedText skin="code"`) · one feature-local COMPOSITE
(`KnobRow`) · the rest is landed anatomy.** Each variant row ships with its §13.7/§13.8-bar CT
(token assertions via the generated map; the twin's textbox-role location pin).

## 14. Build shape — stages, each independently shippable

| stage | lands | needs |
| - | - | - |
| **P0** | the three `@orb/ui` variant rows (§13: Slider ghost · NumberField inline · HighlightedText code) + `KnobRow` + the §4.3 `preset.resolveEffective` read (D5) | contracts/domain verb + ui variants |
| **P1** | the Params deck (replaces the Generation group's four leaves) + staleness row + G1-G4 | P0 |
| **P2** | the five-view flattening + Actions view (templates+nudges, G5) + Data/Transforms regroup | P1 (the deck is the biggest moved piece) |
| **P3** | Prompt consolidation: section editor absorbs the inspector; bridge deleted; CONTEXT becomes the per-view readout (§7, D2 — the `presetEditorView` store seam lands here); toolbar preview toggle dies | P2 |
| **P4** | LIST projection: row activate toggle (D1), Select deleted, kebab Export + orb-native import arm (G6), header truth chip (G7) | independent of P1-P3 |
| **P5** | density-baseline shrink for the surface + the CT set (§12) + side-eye fix-all + close-out ledger row | all |

Every stage ends with its side-eye pass and ALL findings fixed ([[side-eye-fix-all-findings]]).
Verification recipes for the build (stage permitting): `pnpm snap --wide` on the presets section with
`--context-tab` per view; computed-value assertions per density §5.3, never authored classes.

### 14.1 Build requirements (owner-flagged — build-shaping, not taste)

1. **THE FORM FACTORY IS MANDATORY.** Every editor surface — the knob deck (slider + twin), the
   section drill-in, the template/nudge editors, the Data dialogs — rides the house autosave boundary
   (`createAutosaveEntityForm`, the landed D78 `PresetForm`): fields bind form paths through it,
   structural array ops ride the store driver, saves ride the serialized fork-once chain. NO bespoke
   form state, NO hand-rolled form classes (the AppearanceForm disease SET-SEAMS killed). The KnobRow
   twin-convergence CT runs THROUGH the boundary, not around it.
2. **Freshness is the §4.4 contract** — the `query-freshness-coverage` gate classifies every new read
   at birth; the write→invalidate→refetch pin ships with P0 (the resolver) and P3 (the readouts).
3. **Prose previews obey the §7 macro-honesty pin** — `requires`-gated resolution, tokens never faked
   (Ruling B: identity resolution is chat-owned).
4. **Portability reuses the bundle seam** (§16.1) — the single-preset arms are thin; any divergence
   from the bundle's serde or collision semantics is a defect.

## 15. Owner decisions — genuine forks ONLY, with recommendations

> **D1–D7 RULED AS RECOMMENDED (owner, mock review round 3); D8 RULED (owner, 08-02 — §7.1's
> refined arm c).** Nothing remains open; the table stands as the rationale record.

| # | decision | recommendation |
| - | - | - |
| **D1** | **Inline activate on rows** (amends the ratified §12.2 presets row: state toggle — → Activate; the pane Select dies) | **YES** — activation is the row's own one-of-N state; the frequent post-fork act lands where the eye is; the built-in row's toggle maps to the null pick. The Select was pane chrome a mixed config-list couldn't keep anyway (§11) |
| **D2** | **CONTEXT stops being an inspector and becomes the PER-VIEW readout (§7)**; section editing consolidates whole into the drill-in (the bridge + inspector die) | **YES** — F5 is a three-geography edit of one object; the readout gives the panel a real instrument job, one eye per hand (§7's table). *Alternative if vetoed: keep the inspector and the readout shares the panel as a second tab — F5 survives* |
| **D3** | **Flatten 4 groups × 10 leaves → 5 flat views** (amends north-star §6.2's regroup) | **YES** — §6.2 grouped the sprawl; the leaves themselves were the defect (a tab per radio group). Five honest views, one nav level |
| **D4** | **Knob unset grammar: ghost-effective + touch-to-promote + reset** (replaces the override-switch-gates-slider row) | **ghost-effective** — the datum must always be visible (F2); the switch made "off" a hidden number. The storage semantic (blank-means-default) is unchanged; only the rendering stops hiding it |
| **D5** | **Build `preset.resolveEffective`** (the one new server read — the funnel projected for the editor) | **YES** — without it the ghost column falls back to static placeholders and the quality-fed defaults stay invisible (the F9 core). It is a projection of existing funnel code, not new resolution logic |
| **D6** | `maxBudgetUsd`: build its OUTPUT editor, or delete the field (NO-LEGACY allows it pre-launch) | **verify the wire first, then decide** — if the funnel/runners actually enforce a budget, build the editor (S); if it is a dead schema field, delete it. This spec does not fake either |
| **D7** | `customParameters`: read-only presence row + JSON view in ADVANCED, or stay invisible | **presence row** — an invisible stored blob that changes the wire (custom-byo) fails the no-silent-knobs bar; editing stays out (it is the server-side BYOK escape hatch by design) |

| **D8** | **The inspect binding — RULED (owner, 08-02):** auto-bind to the LAST-OPEN chat, named + dismissible in the readout header; unbound/no-recent falls to the honest token view; one `presetOverride` preview read | landed as §7.1's ruled state; post-core build with the §4.4 binding freshness rows + §16 row 33 |

Everything else in this spec is design, not a fork: the five-view map (§3), the KnobRow anatomy
(§4.1), the staleness row (§4.2), the Actions list grammar (§6), the gap-close register (§10 — G6/G7
are wiring existing verbs/state, not policy), and the tier/voice assignments (§2) carry
recommendations inline and need only the D1-D5 ratifications to build.
## 16. The one-home audit — every affordance, its ONE home, echoes justified (owner-required, 2026-08-01)

Owner steer (verbatim): *"actions and things only have one home so it also needs to audit that."*
The rule this table enforces: every action has exactly ONE primary home; an echo exists only with a
named justification; any other duplication is a design defect and was fixed in the design, not
recorded. The mocks were swept against this table both directions — one drawing bug was found and
fixed (the v1 section-editor drawing omitted the ⋯ menu that homes Duplicate / Move / Delete), and
the v1 params-deck CONTEXT drawing carried Prompt-view elements (budget + preview), re-homed per §7.

| # | action | ONE primary home | sanctioned echoes (each justified) | enforcement |
| - | - | - | - | - |
| 1 | create preset | LIST band **New** (the pane's one primary) | the empty-state "New preset" action — an empty pane may not dead-end ([[empty-states-are-load-bearing]], the landed rule) | both call the one `useCreatePreset`; review |
| 2 | import (ST + orb-native) | LIST band ghost icon → the import dialog | none | — |
| 3 | activate for generation | the row toggle (§9, `RowToggleAction`, one-of-N) | (a) row kebab "Activate" — keyboard/discoverability parity, the ratified §12.2 mirror rule; (b) the editor-header Activate (G7), rendered ONLY in the not-active state — the fork-once retarget changes activation UNDER the editor, and the LIST can be a closed sheet on mobile; a status chip naming an actionable state must act | the pane-level Select is DELETED in the same commit (the half-migration ban); all three paths call the ONE `setDefault` mutation — review + CT |
| 4 | open a preset (edit) | the row body click | ⌘K (the global palette — an app-wide echo outside this surface's budget) | — |
| 5 | duplicate preset | the inline row verb (ratified §12.2 — the measured frequent verb) | row kebab mirror (the §12.2 grammar's own parity rule) | CT: both fire the same create-with-config |
| 6 | rename preset | row kebab → dialog | none — the editor header SHOWS the name, never edits it | — |
| 7 | export preset | row kebab (G6) | none | — |
| 8 | delete preset | row kebab → confirm | none (destructive is kebab-only, §12.2) | — |
| 9 | search presets | the pane search input | none | — |
| 10 | switch editor view | the ONE tab strip | none — CONTEXT projects the view, never sets it (§7) | `presetEditorView` has ONE writer (the store-door discipline); review |
| 11 | set quality | the QUALITY segmented strip | none | — |
| 12 | set a knob explicit | the KnobRow — slider + number twin are TWO MODALITIES of one control bound to ONE field, not two homes | none | CT: drag-then-read-number and type-then-read-slider converge (§12) |
| 13 | reset a knob to inherit | the KnobRow ↺ | none (staleness Clear is a DIFFERENT action — it bulk-clears unhonored knobs only) | — |
| 14 | staleness keep / clear | the deck's staleness row (§4.2) | none — the CONTEXT staleness COUNT is a pointer, deliberately not an affordance (§7 read-only invariant) | review: zero mutation hooks in context bodies |
| 15 | edit output / context / compaction / advanced fields | each field's one deck row (§3 map) | none | the §3 exhaustive map — a field in two clusters is a spec bug |
| 16 | add a section + NAME it | the rack toolbar **Add** menu — mints (a literal, or any ABSENT marker) and AUTO-DRILLS into the editor where the NAME field lives (naming is part of creating, one flow) | the missing-pivot callout's "Add chat history" — a warning carries its own remedy (the landed rack pattern) | both call the one `makeSection` push |
| 17 | reorder sections | rack drag (the handle; dnd-kit KEYBOARD sensors are the same home's no-pointer path — the sortable-keyboard-focus lesson applies: focus restores at DROP) | the drill-in ⋯ "Move above/below" — a ZONE flip (cross the pivot) is a semantic move distinct from positional drag | both go through `moveFieldValues`; review |
| 18 | enable / disable a section | the rack row Switch (the PIVOT carries none — it cannot be disabled, §5.2) | the drill-in HEADER Switch (§5.2a — while drilled the primary home is off-screen, and editing a disabled section with no visible state hides the fact that makes every field moot; both bind the ONE `sections[i].enabled` form path) | the pivot band's landed Switch is deleted (`pivot-band.tsx:52-56`); CT: both switches converge on one field |
| 19 | select a section (= INSPECT — the readout echo is the inspect view, §5.2/ST parity) vs DRILL to edit — TWO DISTINCT ACTS: row click selects; the row chevron / Enter drills | click = the row body; drill = the trailing chevron | select echoes: (a) CONTEXT preview block-click; (b) CONTEXT per-section bar click; (c) the Actions-view delivery-path echo; (d) Data-view reference clicks (§7) | EVERY selection write goes through the one `selectPresetSection` store action — a second writer is the store-door wall; a CT pins that row-click does NOT mount the drill-in |
| 20 | edit a section whole (body · delivery [name · role · depth] · placement [zone · order] · triggers · locks) | the consolidated drill-in (§5.2) | none — the CONTEXT inspector is DELETED | compile-time: `preset-editor-bridge.ts` is gone; a re-import fails to resolve |
| 21 | duplicate / delete a section (LITERALS ONLY — §5.2 structural rule) · move-to-zone (any non-pivot) | the drill-in ⋯ menu (delete behind confirm) | none — a MARKER's menu OMITS Duplicate + Delete entirely (never disabled-Delete); the pivot's menu offers nothing | CT: a marker's menu renders no Delete/Duplicate items |
| 22 | back to rack | the drill-in back button | none (Esc stays overlay-only — the house Esc rule) | — |
| 23 | edit a guided template / nudge (role · template) | its Actions row drill-in (chevron/Enter — click is SELECT, echoing the resolved preview, the §5.2 split) | none | — |
| 24 | reset a template / a SECTION BODY to Default | CLEAR the field — empty IS the ghosted default (the landed `guidedFooterState` semantic, now the ONE grammar for Actions templates AND section bodies, §5.2a) | none | the state chip renders the semantic; CT |
| 25 | variable / user-macro CRUD | the Data view's `EntryListEditor` + its dialog | none | — |
| 26 | regex CRUD · post-process switches · reasoning-parse fields | their Transforms editors | none | — |
| 27 | reset preset to starter | the editor-header kebab → confirm | none | — |
| 28 | retry a failed save | the `AutosaveStatus` chip | none | — |
| 29 | show the assembled preview | the Prompt-view CONTEXT (on-demand) | none — the center Compose\|Preview toggle is DELETED (§5.1) | the toggle dies in the same commit; review |
| 30 | navigate to a carrier's SOURCE domain (the §5.2 attribution link — "manage in World info ↗") | the carrier body-slot attribution panel + its readout twin | none beyond the pair itself (the drill-in panel and the readout attribution are the same link, one target) | rides the standing rail store writers (`setActiveSection` — the cross-section action pattern); never a route fork |
| 31 | manage the guided-template SET (add / remove / reorder / toggle a template) | **NO HOME EXISTS, BY DESIGN** (§5.0: `GUIDED_ACTION_KINDS` is a fixed product enum; every action always resolves) | none — an affordance for this appearing ANYWHERE is the §5.0 conflation as a defect | mock + review: the Actions view renders no grips/switches/Add; the audit pins the ABSENCE |
| 32 | the COW-moment fork CHOICE (§3.1 step 2 — editing the built-in while ≥1 fork exists; owner-ruled, build in flight) | the interception dialog AT the one save path (`usePresetAutosave`'s chain — the seam that owns the silent COW; a routing decision inside the ONE write path) | its two arms are ROUTERS to existing homes, never new ones: **Keep editing <fork>** = the landed RETARGET semantics (session moves; the pending edit converges); **Start a new fork** = the DUPLICATE home's create-with-config + the `forkedFrom` stamp | review: no second write path exists; the dialog renders only from the save chain's built-in-with-existing-fork branch; CT: both arms land the pending edit exactly once |
| 33 | the inspect BINDING control (§7.1, ruled): dismiss / re-bind | the readout HEADER — ONE control, two states: bound → "inspecting against: <chat> ✕" (the ✕ dismisses); dismissed → the same slot's quiet "Inspect against <chat>" re-bind chip | none — opening a chat and returning re-derives the bind target (the same last-open-chat read), which is a data change, not a second control | a readout-local VIEW state, never a mutation (the read-only invariant holds); CT: dismiss falls back to the token view, the chip re-binds |

**Invariants the table pins:** (i) CONTEXT is read-only + navigation-only — its only interactions
are the #19 selection echoes and the #29 reveal; (ii) every echo pair shares ONE mutation/store
writer, never a second code path; (iii) destructive actions each live in exactly one confirm-gated
menu. The audit is a STANDING review artifact: a new affordance lands with its row here, or it does
not land.
### 16.1 The preset LIFECYCLE — CRUD + portability, complete (owner-required)

Every lifecycle operation, its server path, its ONE door (consistent with the audit above), and its
semantics — the portability rows REUSE the live bundle seam (owner-corrected: `"preset"` is a
`PORTABLE_KINDS` member and whole-profile bundles round-trip presets today; the single-preset door is
a THIN ARM over the same descriptor, never a parallel path):

| op | server path | door (audit row) | semantics |
| - | - | - | - |
| create | `preset.create` | band **New** (#1) | starter config; selected after create |
| rename | `preset.update` (name) | row kebab dialog (#6) | names are NOT unique — the fork workflow mints same-name rows by design; the scent subtitle + qualifier machinery disambiguates |
| duplicate | `preset.get` + `preset.create(config)` | inline row verb (#5) | "Copy of <name>"; selected after |
| fork (COW) | `preset.update` against the system default | implicit — editing the built-in; with ≥1 existing fork, the §3.1 CHOICE dialog intercepts at the same save path (row 32) | first-ever: silent COW mints "Default (edited)" once per session chain; thereafter: Keep-editing (retarget + converge) vs named new fork; `forkedFrom` stamps lineage (LANDED — the §9 column); activation retargets when the built-in was the pick |
| activate | `settings` seeds patch (`defaultPresetId`) | row toggle (#3, + its two sanctioned echoes) | one-of-N; the built-in row = the null pick |
| delete | `preset.remove` | row kebab confirm (#8) | deleting the ACTIVE preset clears the pointer first (landed); the built-in cannot be deleted |
| ST import | client-side `importStChatCompletionPreset` → `preset.create` | the ONE band import dialog (#2) | landed: browser-side parse, dropped-fields summary, selected after |
| orb import (G6, NEW door) | a thin `preset.importFile` proc → the EXISTING `ImportPreset` verb (`verbs/import.ts`) | the SAME band dialog — format sniffed by `schemaKind` | BUNDLE semantics by construction (cited from the verb): STRICT parse with loud per-file error; idempotent on `(ownerId, name)` — a same-named preset is MERGED in place, else created (kind `roleplay`); lift-walk from the file's schemaVersion; `presetsChanged` emitted (the §4.4 freshness ride). The dialog states the merge semantic before commit |
| orb export (G6, NEW door) | client-side `buildPresetFile(name, config)` from the cached row | row kebab **Export** (#7) | the SAME serde bytes as the bundle arm (`buildPresetFile` is the one home both read); download named by the slug idiom; HIDDEN on the built-in row (the bundle excludes the system default — it re-seeds on the target box) |
| whole-profile bundle | the portability core iterating the descriptors | the settings export/import surface (out of this program's scope) | UNTOUCHED — the single-preset arms above add zero divergence: same serde, same import verb, same collision rule |
