---
kind: design
status: proposed
updated: 2026-08-08
---

# Refinery R3 — the schema-driven result renderer (crowning-feature design workshop)

> **Charge (owner, 2026-08-08):** design the renderer that makes CUSTOM payload schemas render as
> beautifully as the built-in fixed payload. Standing directive: *the built-in fixed payload is ONE
> INSTANCE of a general renderer, never the hardcoded shape*; floor = designed UI, never raw JSON.
> Scope expanded mid-workshop to the full crowning-feature review (contracts/db/kit inventory,
> package latitude, the OG test-suite steal ledger) plus two owner design directives: **field
> topology is not 1:1** and **output-budget preflight**. This doc recommends; it builds nothing.
>
> Method: whole-file reads of the OG formatter/schema corpus AND its test suite; whole-file reads of
> every refinery-load-bearing orb module (coverage in §13); a live probe of the lift/scrub/project
> chain (§4.1); every claim carries `path:line`. OG paths are relative to
> `/home/inktomi/inktomi-stack/development/neo-tavern/references/card-refinery/`.

---

## 0. Verdict + ranked recommendations

The renderer question is largely SOLVED by a structural fact nobody has yet written down: **orb's
custom schemas are confined to `LIFTABLE_JSON_SCHEMA` — a closed, finite node vocabulary — so a
TOTAL widget mapping exists by construction, and the raw-JSON floor the OG needed is
unreachable, not merely forbidden** (§2). The rest of this doc is the mapping (§3), the hint channel
that makes generated schemas camera-ready (§4), the graphs (§5), the version walk (§6), and the
pre-launch contract fixes the crowning-feature bar demands (§7–§9).

Ranked (P1 = fix before the next refinery lane lands anything on top):

| # | Finding / recommendation | Class | § |
| - | - | - | - |
| P1-A | **Emptying/merging/filling fields is UNREPRESENTABLE in the shipped rewrite contract** (`text: z.string().min(1)`) and empty selected fields are silently omitted from prompts — the owner's field-topology directive is blocked at three shipped seams | contract fix, pre-launch | §7 |
| P1-B | **A custom run's `{kind:"custom", schemaId}` provenance dereferences a MUTABLE row** — an append-only run log that cannot re-render or re-parse its own payloads after a schema edit. Embed the schema (or a version-pinned copy) in `payload_config` at SF0 | contract fix, pre-launch | §9.1 |
| P1-C | **`refinery_runs` cannot say what the R3 Runs-ledger mock promises** — no `durationMs`, and `promptTokens`/`outputTokens` are null-by-construction v1. One column + one usage-threading decision, cheap only while baseline squashes are cheap | db fix, pre-launch | §9.2 |
| P2-A | The hint channel: ONE reserved `x-orb-ui` keyword in the stored schema; ONE kit widening (lift ACCEPT-AND-IGNORE it — today it refuses, probe-receipted); hints provably never reach any wire | design + small kit edit | §4 |
| P2-B | The widget vocabulary: a total structure-keyed mapping with hint elevations; the built-in surface falls out as a derivation (proof table) | design | §3 |
| P2-C | Output-budget preflight (owner directive 2): resolved posture + selection arithmetic, both directions (input fit + output fit) | design | §8 |
| P2-D | The fixed-payload prose slots BAKE the fixed JSON shape into owner-sacred text — under a custom schema the system prompt teaches the WRONG shape. Make the shape restatement a spliced token before SF1 | contract fix, pre-SF1 | §9.3 |
| P3-A | Multi-axis "cool graphs": bar rows default, radar as a hint elevation — **zero new dependencies** (echarts is already the sealed chart layer; radar is a tree-shaken import + one new `@orb/ui/charts/radar` primitive) | design | §5 |
| P3-B | Character version walk: snapshots plane is complete (snapshot/list/restore verbs live); the run↔snapshot correlation gap closes with a label convention (no schema change, D28-invariant-clean); dock as a third CONTEXT tab (owner fork) | design | §6 |
| P3-C | OG test steal/adapt ledger: 6 real scars worth pinning in orb suites; 2 already pinned; the rest structurally killed | tests | §11 |
| — | Package additions: **none needed**. RJSF/JSONForms-class engines explicitly rejected; nothing to vendor | decision | §10 |

---

## 1. The OG's gymnastics — the failure class, with receipts

Everything below was read in full this session (`src/ui/formatter/{json-renderer,helpers,section-renderer}.ts`,
`src/domain/schema/{validate,generate}.ts`). The failure class in one sentence: **rendering by
sniffing DATA when the SCHEMA was sitting right there as the contract.**

| Gymnastic | Receipt | What went wrong |
| - | - | - |
| Score scale guessed from the VALUE: `max = data > 10 ? 100 : 10` | `json-renderer.ts:349-356`; the same guess again in `section-renderer.ts:48` and a third time in `formatInlineContent`'s regex-badge arm `section-renderer.ts:173-185` | The schema's own `minimum`/`maximum` go entirely unread — `renderNumber` (`json-renderer.ts:330-347`) consults `schema.title`/`description`/`format` but never a bound. A 0-5 rubric renders as `N/10`; a 12 renders as `12/100`. |
| `looksLikeScore` fires on ANY finite 0-10 number or ANY int 0-100 | `helpers.ts:58-72` | `count: 7` → a green `7/10` badge. Name-word sniffing (`score`, `level`, `quality`) doubles the false-positive surface. |
| Hero detection by NAME LIST | `helpers.ts:34-56` (`overallscore`, `total`, `rating`, …) | A custom schema spelling its headline `fitScore` gets no hero; a `total: 3` item-count gets one. |
| Card anatomy by STRING LENGTH of the data | `json-renderer.ts:194-208` — title = first string `< 100` chars, body = first string `≥ 50` chars, score = first number 0-100 | Same schema, different data → different layout. A 105-char title becomes a body; a short body becomes the title. |
| Array item schema inferred from `data[0]` | `json-renderer.ts:22-29` (`inferSchema`), `:138-140` | A heterogeneous or empty array mis-renders every element after the first. |
| Depth-8 raw-JSON floor | `json-renderer.ts:20,93-95` → `renderJson` `:374-382` | The escape hatch the owner's "never raw JSON" directive bans — needed there precisely because inference can fail. |
| Client-side re-implementation of provider schema law | `validate.ts` (637 lines policing Anthropic depth/anyOf/regex limits), `generate.ts:9-24` teaching wrapper formats in the prompt | Already ruled ACCIDENTAL by the port study (§2, E3) — dies to `liftJsonSchema`/`scrubWireSchema`/`runStructuredTurn`. |

The owner's framing ("some of the shenanigans \[were] because I was hand rolling shit… but there are
SCARS there") is exactly right: the *validator* half was environmental (no server, no wire
ownership); the *renderer* half was a genuine design error — the schema WAS passed into
`renderStructuredRoot(data, schema)` (`json-renderer.ts:42-45`) and then ignored at every decision
that mattered. Orb must not re-commit it with better tools.

## 2. The orb premise that dissolves the problem

Two shipped facts change the shape of the problem entirely:

1. **Every payload the renderer will ever see has a schema the renderer can trust.**
   Fixed payloads: the three zod contracts (`contracts/refinery/index.ts:214-260`), projectable via
   `projectJsonSchema` (`kit/json-schema/index.ts:55-59`). Custom payloads: a stored JSON Schema
   that the save belt has already forced through `liftJsonSchema` (NL design §4.2 — "a stored schema
   is liftable by invariant").
2. **The custom vocabulary is CLOSED and SMALL.** `LIFTABLE_JSON_SCHEMA` (`kit/json-schema/lift.ts:20-36`):
   types `object/array/string/number/integer/boolean`, `enum` (string members), `const`, a standalone
   `anyOf` union, per-type bounds — and NOTHING else, enforced conservative-or-refuse
   (`lift.ts:88-95`), depth-capped (`lift.ts:60`, tightened to \~8 at the refinery save belt, NL
   design §7).

Consequence: a renderer keyed on schema STRUCTURE can be **total** — a finite mapping with an arm
for every node kind and no "unknown" branch. The OG's depth-8 raw-JSON floor existed because
inference over open data can fail; here the input vocabulary is closed, so **the no-raw-JSON floor
is a THEOREM of the design, not an aspiration** — and the proof obligation is one exhaustiveness
check (`satisfies Record<LiftableNodeKind, …>`, §5.5 dispatch discipline) plus one property test
(§3.4).

## 3. Design question (a) — the widget vocabulary

### 3.1 The render plan

One pure derivation, one home:

```
buildRenderPlan(schema: StoredSchema): RenderPlan     // schema → widget tree, data-independent
<PayloadView plan={plan} payload={data} />            // walks plan + data together
```

- **Home:** `packages/client/src/features/refinery/lib/render-plan.ts` (pure, feature-tier lib —
  its only consumers are the assay panel, the schema editor's test preview, and the run viewer, all
  inside `features/refinery`). Promotion path if a second feature ever consumes custom-schema
  rendering (rpg?): the derivation is dependency-free and lifts to `@orb/kit` unchanged; the widgets
  are already `@orb/ui`. Do not pre-promote (one consumer today).
- The plan is derived from the SCHEMA ALONE (plus hints, §4) — never from the payload. The payload
  only fills values. That single rule is the structural negation of §1's whole failure class.
- For the FIXED payloads, the plan input is `projectJsonSchema(REFINERY_STAGE_PAYLOADS[stage])` with
  the built-in hint set (§3.3) — **the built-in surface is literally the general renderer applied to
  a hinted schema**, which is the owner's standing directive made mechanical.

### 3.2 The total mapping (hintless floor — structure only, NO name sniffing)

Every rule below keys on schema structure. Field NAMES are used for exactly one thing — the label
(`formatLabel`-style prettification is presentation, not semantics). The one deliberate exception is
noted at the end.

| Schema structure | Widget (all existing `@orb/ui` unless noted) | Notes |
| - | - | - |
| `number`/`integer` with BOTH `minimum` and `maximum` | **meter/gauge** — `charts/meter` + mono numeral `value/max`, scale from the schema's OWN bounds | The OG's `>10?100:10` guess dies here; a 0-5 rubric renders `N/5`. Word-primary: the printed numeral is the signal, the fill is the tint. |
| `number`/`integer` with one or no bound | **stat figure** (`charts/stat-figure` / formatted numeral) | No honest scale ⇒ no bar. Never guess one. |
| `string` with `enum` | **word chip** — the enum member VERBATIM, uppercase as authored, tinted by position only when the hint says so (§4) | Colourblind law: the word is primary. Hintless enums get neutral chips — tint semantics (good/bad) are a HINT, never inferred from member spelling. |
| `string`, `maxLength ≤ 200` or bounded short | inline value text | |
| `string`, long/unbounded (`maxLength > 200` or absent) | **prose block** (the gauge-summary paragraph treatment; markdown-lite via the house content pipeline, text-tier — never HTML) | |
| `boolean` | Yes/No word chip (word + icon, not color alone) | |
| `array<string>` | **bullet list** (the mock's `priorityImprovements` treatment) | |
| `array<number>` | value list; if items carry both bounds → compact **bar list** (`charts/bar-list`) with index labels | Rare shape; honest floor. |
| `array<object>` | **rows** (the assay `frow` pattern): per-row layout derived from the ITEM SCHEMA by these same rules — bounded number member → row score + bar; enum member → row chip; short strings → header line; long strings → accordion body (FORK A's accordion-one-open carries over) | The OG's per-datum length heuristics (`json-renderer.ts:194-208`) die: the row anatomy is fixed per schema, identical for every row. |
| `object` | **section** — header + recursive fields (the `cr-section` shape, done as `Section`/`Stack`) | Depth ≤ the save belt's cap (≈8), so nesting is bounded and the recursion total. |
| `anyOf` union | render the arm the VALUE parses as (the lifted zod already discriminates); label the arm when hinted | The lift guarantees ≥2 well-formed arms (`lift.ts:159-177`). |
| `const` | static labeled value | |
| **The generic floor** | labeled field rows inside sections — a designed definition list | Reached only by structures with no richer arm above; it is a DESIGNED state, and `renderJson` has no equivalent — there is no code path that prints raw JSON. |

**The one structural elevation (not name sniffing):** if the ROOT object has EXACTLY ONE
both-bounded numeric property, it renders as the hero gauge. This is a structure fact ("this schema
has one headline number"), not a name guess, and it makes most naive hand-authored score schemas
("rating 1-10, list of issues, summary" — the OG's own README example) camera-ready with zero hints.
Two or more bounded numbers ⇒ no hero unless hinted (that is the multi-axis case, §5).

**Empty/absent values are load-bearing states** (empty-states-are-load-bearing): an optional field
absent from the payload renders its labeled empty arm ("—", "none listed"), never collapses — the
OG's `(none)` / `(empty)` handling (`json-renderer.ts:129-135`, `:307-309`) got this right and it
carries over as designed UI.

### 3.3 Proof: the blessed built-in look is a derivation

The R3 mock set (`docs/design/mocks/refinery/surface.html`, read in full) against the mapping + the
built-in hint set:

| Mock element (blessed) | Derivation |
| - | - |
| Score gauge `6.8/10` + summary (`surface.html:352-358`) | `overallScore` = bounded number (1-10, `contracts/refinery/index.ts:217`) + hint `role:"hero"`; `summary` = long bounded string (`max 4000`, `:219`) → prose block docked to the hero |
| Per-field assay rows: name + bar + score, accordion critique (`surface.html:359-400`) | `fieldScores` = `array<object>` whose item schema has a bounded number (`score` 1-10) → row score+bar; three long strings (`strengths/weaknesses/suggestions`, `:200-202`) → accordion body; `field` enum + optional `greetingIndex` → row header + index chip |
| Priority improvements bullets (`:391-399`) | `array<string>` (`:218`) → bullet list |
| Verdict banner, word-primary REGRESSION (`:534-541`) | `verdict` enum (`:256`) + hint `role:"verdict"` with tint map — hintless it would be a neutral chip; the banner IS the hint elevation |
| Soul `4`/10 pill in the banner (`:540`) | `soulScore` bounded number + hint `role:"axis"` grouped with the verdict |
| Preserved / Lost / Gained three columns (`:542-548`) | three `array<string>` siblings → bullet columns; the good/bad/info column tints are hints |
| Runs-ledger warn line for `strippedKeys` (`:442`) | not schema-rendered — run metadata (§9.2) |

Nothing in the blessed look requires an arm the mapping lacks. The hint set for the three fixed
payloads ships as a constant beside the render plan (it IS the reference instance).

### 3.4 The tests the renderer owes

- **Totality:** the plan builder's node dispatch is a `Record<kind, …>` (tsc-forced) + a property
  test: for every schema accepted by `liftJsonSchema` (generator over the subset), `buildRenderPlan`
  yields a plan with zero `generic-floor`-of-unknown arms and the payload view renders without the
  fallback pretending. The OG corpus (§11.3) is the seed fixture set.
- **Derivation pin:** `buildRenderPlan(project(fixed score schema), BUILTIN_HINTS)` deep-equals the
  hand-blessed plan for the mock anatomy — the "built-in is one instance" directive as a test.
- **Scale honesty:** a 0-5 schema renders `/5` (the anti-`>10?100:10` pin, named for its OG scar).

## 4. Design question (b) — the hint channel

### 4.1 The mechanics, probed (receipts from THIS session's live probe)

Probe (`node --experimental-strip-types` over `@orb/kit/json-schema`, script in
`reports/stickler/scratch/stickler-hint-probe.ts`, output verbatim in session):

- **Q1 — the lift REFUSES a hint keyword today:** `liftJsonSchema` on a schema carrying
  `"x-orb-ui": {role:"hero"}` throws `unsupported JSON Schema construct "x-orb-ui" at #/properties/overallScore` — `rejectUnsupportedKeys` (`lift.ts:88-95`) allows only
  `common = ["type","description","enum","const"]` + per-type keys (`lift.ts:20-36`). Control:
  the same schema without the hint lifts clean (ZodObject).
- **Q2 — the wire scrub is NOT a hint filter:** `scrubWireSchema` passes `x-orb-ui` through
  **on all four modes** (`hosted-common`/`anthropic-format`/`guided-decoding`/`strict-compatible`) —
  the walk copies any key not in its enumerated strip/refuse sets (`wire-subset.ts:169-195`). So if
  a hint ever reached the raw wire tree it would ride to the endpoint (and xgrammar's strict
  validator would choke on it, the `guided-decoding` annotation precedent `wire-subset.ts:59`).
- **Q3 — the real wire chain is hint-free BY CONSTRUCTION:** the wire is
  `projectJsonSchema(liftJsonSchema(stored))` (NL design §4.1), and the projected node carries only
  `[type, minimum, maximum]` — hints never enter zod, so they can never be projected. **"Hints must
  strip from the wire" costs zero code — provided the lift IGNORES rather than REFUSES them.**

### 4.2 The design

- **Where hints live: IN the stored schema**, under ONE reserved key `x-orb-ui`, legal on any node.
  (`x-` prefixed custom annotations are the JSON-Schema-ecosystem convention; the orb namespace
  makes collision with any future vendor keyword implausible.)
- **The one kit edit:** `liftJsonSchema` ACCEPT-AND-IGNOREs exactly `x-orb-ui` (one member added to
  the allowed-key computation, or a documented pre-walk strip). Golden proof (the `lift.ts:19`
  discipline): `lift(hinted) ≡ lift(stripOrbUi(hinted))` — behavior-identical zod, hint-blind wire.
  This is the ONLY kit change the whole feature needs.
- **The hint vocabulary is CLOSED and zod-validated at the refinery save belt** (contracts tier,
  beside the NL design's other tightenings — validating render hints is a refinery concern, not
  kit's):

  ```
  renderHintSchema = z.object({
    role: z.enum(["hero", "verdict", "axis", "prose", "title", "score", "body", "badge"]).optional(),
    tone: z.record(z.string(), z.enum(["good", "warn", "bad", "info", "neutral"])).optional(), // enum member → tone word
    group: z.string().max(64).optional(),        // axes sharing a group render together (§5)
    label: z.string().max(120).optional(),       // display label override
    chart: z.enum(["bars", "radar"]).optional(), // §5 elevation, valid only on an axes group
  }).strict()
  ```

  Malformed hints REFUSE at save with construct+path (the lift's own error grammar); on READ a
  malformed hint heals to "no hint" (render by structure — the parse-seam posture), never a render
  failure. `tone` maps enum MEMBERS to tone words so the verdict banner's good/warn/bad tints are
  authored data, never inferred from spellings.
- **The generator emits hint-rich schemas by construction:** the `schema_forge` prose baseline (NL
  design §4.6) TEACHES `x-orb-ui` — "give the headline number `role:'hero'`; give a verdict enum
  `role:'verdict'` with a tone map; group related bounded numbers with `group`" — so the
  describe-in-English door yields camera-ready schemas without the author knowing hints exist. The
  editor's per-field "Display" row (role picker, tone map for enums) writes the same hints for hand
  authors. Hintless hand-authored schemas still render well by §3.2 alone — hints only ELEVATE.
- **Rejected alternative — out-of-band hints** (a `hints` column keyed by JSON pointer beside the
  schema): two artifacts to keep coherent (a field rename orphans pointers silently), two things to
  export/import, and the generator would have to emit a two-part payload. In-schema hints travel
  with the schema everywhere it goes and cost one lift widening. Rejected.

## 5. Design question (c) — multi-axis "cool graphs"

The owner's example — several axes scored independently — lands in the mapping as ≥2 both-bounded
numeric properties (or one `array<object>` of `{axis-ish enum/string, bounded number}` rows).

- **Default (hintless): per-axis meter rows** — the assay `frow` pattern (name · bar · numeral) is
  already the house's blessed multi-axis presentation and reads at every width. This is the floor
  and it is already good.
- **Hint elevation: RADAR** — `x-orb-ui: {group:"axes", chart:"radar"}` on the members (or the
  array), honored only when the shape earns it: **3–8 axes, ALL sharing the same schema-verified
  `minimum`/`maximum`**. Unequal scales or 2 axes fall back to bars (a 2-axis radar is a line;
  unequal-scale radar is a lie). Word-primary: the radar never replaces the numerals — it renders
  beside/above a compact axis-value list (the chart is the tint; the printed numbers are the words;
  a greyscale screenshot stays fully legible — the colourblind law applied to dataviz).
- **Instrument: the EXISTING echarts seal.** `echarts@^6.1` + `echarts-for-react` are already the
  repo's sealed chart layer (`pnpm-workspace.yaml:205-208` — "D52 … the charts/ analytics seal",
  tree-shaken imports only), wrapped by `packages/ui/src/charts/chart/` with reduced-motion, resize,
  aria, and theme-token colors handled once. Radar is one more tree-shaken import
  (`RadarChart` from `echarts/charts`) behind one new primitive `@orb/ui/charts/radar` following the
  `bar-list` shape (`charts/bar-list/*.tsx` read this session: option-builder + `LabeledChartFrame`
  - theme hook, \~120 LOC). **Zero new dependencies.**
- Restraint: no pies, no arc-gauge theater, no animated counters. The existing `meter`,
  `stat-figure`, `bar-list`, and the one new `radar` are the complete dataviz vocabulary for R3/R4.

## 6. Design question (d) — character versions as a first-class walk

### 6.1 Inventory (all live, receipts)

- `character_snapshots {id, characterId FK cascade, content: CharacterCard, label, createdAt}` —
  append-only, opaque, **NOTHING may FK it** (invariant stated in the schema header,
  `db/schema/character.ts:144-148`, columns `:149-169`).
- Verbs shipped + tRPC-wired: `snapshot` (labeled, `verbs/snapshot.ts:16-29`), `listSnapshots`,
  `restore` (which itself snapshots first — `PRE_RESTORE_LABEL`, `verbs/restore.ts:35`); client
  History tab exists (port study §3.3).
- The refinery already writes the timeline: `applyFields` snapshots with
  `APPLY_SNAPSHOT_LABEL = "auto: before refinery apply"` before its one canon write
  (`domain/refinery/verbs/apply-fields.ts:34,76`).
- Compare primitives sealed for exactly this: `@orb/ui/diff` `DiffView` (jsdiff `diff@^9`,
  `pnpm-workspace.yaml:183`) + `CompareBlocks` (whose Keep/Discard widening is already specced in
  the accept-ergonomics mock — see its "what the ruling costs the primitive" section; not
  re-derived here).

### 6.2 The correlation gap + the fix

"See which refinery run produced which version" has no first-class channel: snapshots carry only a
free-text `label` + `createdAt`; `refinery_runs` carries no snapshot reference — and an FK either
direction is BANNED by the D28 invariant (no inbound FK to snapshots; snapshots gate nothing).

**Recommendation (invariant-clean, zero DDL): a label convention.** `applyFields` labels its
snapshot `auto: before refinery apply · <sessionId>` (label is free text; the verb already threads
it). The version walk then classifies snapshots: refinery-produced (label prefix match + session id)
vs manual vs pre-restore. Session id, not run id, because apply operates on the session's latest
rewrite — and the apply RESULT (wire) can additionally carry the minted `snapshotId` for the
immediate "view the rollback point" affordance (the snapshot verb mints the id internally,
`snapshot.ts:24`; returning it is a result-shape addition, not schema). **Owner fork F-V1:** a
display-only `snapshot_id` text column on an apply-record instead — REC: no; the label convention
costs nothing and honors the invariant's spirit (snapshots stay un-referenced history).

### 6.3 The surface

- **Dock: a third CONTEXT tab — `Runs · Setup · Versions`.** This is a named DELTA against the
  ruled Runs+Setup pair (NL design §10.3): Versions is cross-run, cross-SESSION cargo about the
  character — exactly the CONTEXT charter ("the runs you are NOT looking at"), and the anti-echo
  test passes (CONTENT never lists snapshots). Rows: label-classified badge (Refinery / Manual /
  Pre-restore) · relative time · greeting-count/size delta chip; every row carries its action.
  **Owner fork F-V2 (alternative):** link out to the character section's existing History tab —
  cheaper, but it evicts the user mid-loop, and the owner's ask ("walk through and adjust… full
  control") is an in-loop walk. REC: the tab.
- **Walk + diff:** tapping a version loads a CONTENT compare view — `DiffView` per field between ANY
  two picked versions (default: selected vs live), the compare-instrument forks (C) already ruled in
  `surface.html`. Full card blobs ride the existing `listSnapshots` wire; at `TEXT_MAX` field caps
  (`contracts/character/index.ts:18`) worst-case payloads are large but bounded — paginate the LIST,
  fetch content per selected pair.
- **Restore:** the existing verb, verbatim — it is already reversible-by-construction (pre-restore
  snapshot). Restoring mid-session does NOT touch `original_card` (the anti-drift anchor is the
  session's pin, deliberately frozen); the surface must SAY that ("analyze still compares against
  the 14:02 pin") — the mock's anchor line (`surface.html:324`) already teaches the pin, extend it.
- Manual-rewrite arm (feedback gap 1, R3-scope): the WIP hand-edit area composes with the walk —
  hand-edit → analyze → (keep | walk back). No new machinery beyond the arm itself.

## 7. Owner directive 1 — field topology is not 1:1 (receipts + the fixes)

The directive: a rewrite may FILL an empty field, EMPTY a donor (consolidation), SPLIT one field
across several, MERGE several into one — all inside the belt-9 selection fence. Findings against the
shipped R0/R1 shapes:

**(a) EMPTYING is unrepresentable — contract.** `refineryRewriteFieldSchema.text =
z.string().min(1).max(REWRITE_TEXT_MAX)` with the R0 comment "min(1) — a rewrite never CLEARS a
field (clearing is authoring, not refining)" (`contracts/refinery/index.ts:225-230`). The owner's
directive overrides that ruling: consolidation REQUIRES clearing donors. **Fix (pre-launch, zero
DDL — payloads are JSON):** keep `min(1)` on `text` and add an explicit tagged arm instead of
letting `""` carry meaning: entry = `{field, greetingIndex?, text} | {field, greetingIndex?,
clear: true}`. An explicit `clear` survives the wire scrubs as structure (an empty-string sentinel
would be one more sniffable convention — the §1 disease), renders as an explicit "EMPTIED" block,
and `applyFields`' patch arm maps it to `null` (`updateCharacterSchema` already accepts null-clears,
`contracts/character/index.ts:162` "null clears a field") / greeting-slot REMOVAL (splice, not
`""`) / `depthPrompt: null`. Belt note: clear entries pass the SAME intersection (a steered "clear
systemPrompt" outside the selection dies at `not_selected`, `apply-fields.ts:141`).

**(b) FILL-empty is representable for text fields, dropped for the two structured ones — verb.**
`buildPatch` writes any chosen text field regardless of prior emptiness (`apply-fields.ts:182`) —
fill WORKS for the seven plain text fields. But: a greeting index `≥ liveGreetingCount` drops
(`greeting_index_invalid`, `:153-155`; `buildPatch` also skips it, `:171-175`) — **greeting ADD is
unrepresentable**; and `depthPrompt` on a card without a note drops (`not_applicable`, `:156-158`) —
defensible (the `{depth,role}` directive is authored config the model may not invent), keep, but the
UI copy must teach it. **Fix for greeting ADD:** an explicit append arm — selection gains an
"allow new greetings (max N)" flag; the payload's `greetingIndex` may then equal `liveGreetingCount`
(append-only, no sparse indexes); apply appends instead of dropping. Fork F-T1 (REC: yes — "split
one greeting into two" is squarely the owner's split case).

**(c) Empty selected fields are INVISIBLE to the model — substrate.** The prompt renders only
non-empty selected fields (`substrate/refine-prompt.ts:104` — `if (text !== null && text.length > 0)`), and `startSession` defaults selection to POPULATED fields (`refinery-r0.md:319`). So "scenario
is empty: a miss or a choice?" cannot happen — score never sees the absence, and a fill-empty
rewrite can only occur if the model VOLUNTEERS an entry for a field it was never shown (which then
legally passes the apply intersection — an incoherent seam: unpromptable but applicable). **Fix:**
render selected-but-empty fields as an explicit empty section (`## scenario\n(this field is
empty)`), teach the score system prompt to treat emptiness as scoreable ("an empty selected field:
score the OPPORTUNITY — what should live here?"), and let the selection editor include empty fields
(the mock already draws `systemPrompt · empty` as selectable, `apply-and-selection.html:149`; today
that selection silently does nothing). Score payload needs no change (`fieldScores` entries already
carry any selected field).

**(d) The accept grammar needs ADDED and EMPTIED block treatments — UI.** With (a)+(b), a round's
blocks classify as REPLACED (before/after pair — today's treatment), **ADDED** (no before side:
render a single "+ new" panel, NOT an empty-string left pane — an empty `before` reads as "was
blank", which for greeting-append is false), and **EMPTIED** (no after side: the before text with
the discard-strike treatment + an explicit "will be emptied" chip — the accept-ergonomics mock's
discarded-block visual grammar, reused for a different semantic, so the word chip must differ:
`Empties this field`, destructive-tinted, word-primary). Keep/Discard verbs apply unchanged (arm B
is block-shape-agnostic). `DiffView`/`CompareBlocks` need an absent-side arm — fold into the
already-owed CompareBlocks widening (accept-ergonomics mock, "needs widening ×2") as a third count:
`blocks[i].before?: string` / `after?: string` with at-least-one, rather than a second bespoke
instrument.

Also renderer-relevant: SPLIT/MERGE need no payload change beyond (a) — they are compositions
(fill + clear across fields in one round) — but the compare surface should GROUP a round's blocks so
a merge reads as one story ("description ← personality + scenario"), which is a render-plan concern:
a round-level summary strip (N replaced · N added · N emptied) above the blocks.

## 8. Owner directive 2 — output-budget preflight

The foundation is indeed already there; the design is arithmetic + one wire read:

- **Resolved output budget:** the engine already resolves per-stage sampling as
  `resolveSideGenSampling(SIDE_GEN_POSTURES[refine_*], ownerPresetParams)`
  (`kit/side-gen-posture/index.ts:45-54`; floors `contracts/preset/index.ts:158-165` — rewrite
  2048, score 768, analyze 512; the preset params rung ALWAYS applies, `:158-159`). Today that
  resolution happens inside the run. **Expose it read-only**: the session view (or a tiny
  `refinery.preflight` query) returns per-stage `{maxOutputTokens, temperature, model,
  contextTokens}` — resolved per call so a preset edit shows up immediately (the D126 mapped-Record
  discipline). `summarizerContextTokens` already rides `RoleClients`
  (`contracts/role-clients/index.ts:130-132`) for the input side.
- **Input fit (already mocked):** `estimateTokens` (`kit/tokens/index.ts:24-36`, QuadChars) over the
  assembled selection + prompt overhead vs `contextTokens` — the mock's `prompt ≈ 3 140 / 8 192 tok`
  line (`surface.html:404`). Keep.
- **Output fit (new):** expected output vs resolved `maxOutputTokens`, per stage:
  - **rewrite:** `Σ estimateTokens(selected field texts) × modeFactor + envelopeOverhead`, where
    `modeFactor` ≈ conservative 0.9 · balanced 1.2 · expansive 2.5 (the mode prose's own promises:
    "keep similar length" / "significantly expand", `contracts/refinery/prose.ts:120-151`) and
    `envelopeOverhead` ≈ 30 tokens + \~15/entry for the JSON wrapper. Add \~1.15 headroom for the
    fill-empty/split arms (§7) since new fields have no baseline. Advisory honesty: QuadChars is an
    estimate; the copy says "likely truncates", never a hard number (the kit header's own doctrine,
    `kit/tokens/index.ts:1-12`).
  - **score:** per-selected-target cost — `targets × ~140` (three ≤4000-char critique strings rarely
    run long, but 8 fields × full mode at 768 max IS a real truncation risk today — this warning
    will fire honestly on day one). **analyze:** near-fixed ≈ 400; warn only under 512-floor
    overrides.
  - Reasoning-wire caveat carried from the preset law: on reasoning models `max_completion_tokens`
    caps THINKING+TEXT together (`contracts/preset/index.ts:210-218`) — the warning copy gains "a
    thinking model spends this budget on reasoning too."
- **Surface:** the run bar's fit line becomes two-sided (`in ≈ 3 140 / 8 192 · out ≈ 2 600 /
  2 048 ⚠`); the warning row offers the two real exits — "raise max output" (opens the preset
  posture editor) / "narrow the selection" (opens scope) — the no-dead-readout law. Preflight is a
  WARN, never a block (the model may surprise us; truncation surfaces as the typed structured-output
  failure anyway, this just prevents the paid-for retry).

## 9. Contracts / db / kit inventory findings (the crowning-feature fixes)

From the three-package read (coverage §13). Ranked within-section; P1s repeated from §0.

1. **\[P1-B] Custom-run provenance must be SELF-CONTAINED.** The SF0 seam stores
   `{kind:"custom", schemaId}` (`contracts/refinery/index.ts:144-148`) against a mutable, deletable
   `refinery_schemas` row — but `refinery_runs` is append-only forever (`db/schema/refinery.ts:16-20`)
   and BOTH the read-seam re-parse (`REFINERY_STAGE_PAYLOADS` dispatch has no custom arm —
   `contracts/refinery/index.ts:263-271`) and the §3 renderer need the schema AS OF THE RUN. Edit a
   schema, and every prior run under it re-parses/renders wrong or not at all; delete it and they
   orphan. **Fix at SF0, before the first custom run ever lands:** the custom `payload_config` arm
   embeds the schema itself — `{kind:"custom", schemaId, schemaVersion, schema}` (≤ depth-8 subset
   objects are small; runs are per-user artifacts, dedupe is not worth a join) — and
   `refinery_schemas` gains a `version` counter bumped per update. Zero DDL on runs (JSON column);
   one column on the schemas table; baseline squash while it is cheap. The renderer then NEVER
   dereferences a live schema row for a historical run.
2. **\[P1-C] The Runs ledger's promised cargo has no columns.** The blessed CONTEXT mock renders
   `qwen3-32b · 4 210 in / 512 out · 6.1s` per run (`surface.html:418-441`) — but `prompt_tokens`/
   `output_tokens` are null v1 ("the summarize result carries no usage", `refinery-r0.md:381-383`;
   `SummarizeResult` DOES define a usage shape upstream — `contracts/providers/index.ts:49,71` — the
   thread-through just isn't wired for this caller) and **duration has no column at all** (schema
   read in full, `db/schema/refinery.ts:80-112`: `createdAt` only). **Fix now:** add
   `duration_ms integer` (cheap column, impossible to backfill later) and thread the summarize
   usage into the run row where the backend reports it (the columns already exist and are
   documented "absent when the backend reports none" — make that sentence true instead of
   "always absent").
3. **\[P2-D] The prose slots hard-bake the FIXED payload shape.** All four stage-SYSTEM baselines
   embed the fixed JSON shape verbatim and pin it via `requiredTokens`
   (`contracts/refinery/prose.ts:28-32,191,202,213,224`). Under a custom schema the system prompt
   would TEACH THE WRONG SHAPE and fight the wire's actual grammar. **Fix before SF1:** the shape
   restatement becomes a pre-substitution token — text carries `{{shape}}`, `requiredTokens: ["{{shape}}"]`, and the engine splices the ACTIVE schema's projected shape via the existing
   `spliceProseTokens` machinery (`contracts/prose-slot/index.ts:320-339`) — fixed and custom runs
   both get an honest restatement, and a user's prose override keeps working across schema switches.
   Baseline text change ⇒ version bumps (owner signs; prose is owner-sacred). Harmless to do now;
   mandatory before the custom arm runs.
4. **Field-topology contract set** — §7's fixes (clear arm · greeting-append arm · empty-section
   rendering) are contracts+substrate edits in the same pre-launch window; the clear arm touches
   `refineryRewriteFieldSchema`, the apply classify/patch arms, and the contract test's bounds pins.
5. **Hint channel kit widening** — §4.2's one-line lift edit + golden. The only `@orb/kit` change in
   the whole program.
6. **Read-seam custom-parse dispatch** — `REFINERY_STAGE_PAYLOADS`'s header claims to be the ONE
   dispatch home (`contracts/refinery/index.ts:265-267`); once the custom arm exists the honest
   contract is `payloadSchemaFor(stage, payloadConfig)` (fixed → the Record; custom → lift of the
   EMBEDDED schema per finding 1). Update the header's one-home sentence in the same change so the
   next amnesiac doesn't re-derive it.
7. **Verified adequate (no action, receipts):** D23-derived ownership + cascade chain
   (`db/schema/refinery.ts:6-10`); append-only run log + composite index serving
   latest-per-(session,stage) (`:106-110`); CHECK-constrained enums from the contracts tuples
   (`:38-41`); `strippedKeys` strip-and-itemize riding the run row (`:100-103`) with the mock's warn
   line consuming it; guidance capped at ONE contract home (`contracts/refinery/index.ts:134-138`);
   `refinerySignalsSchema` tightened + field-level heal ordering honored
   (`contracts/character/index.ts:63-76`); the twelve prose slots' macro-mode `"none"` belt-5
   posture (`prose.ts:14-17`); postures + `resolveSideGenSampling` two-rung ladder; `fetchOwned`
   deliberately NOT used for refinery (join-through-character per D23 — `db/src/kit/fetch-owned.ts`
   header names the single-owned class; refinery tables correctly aren't in it).

## 10. Package additions — the latitude, exercised

**Recommendation: ZERO new dependencies.** Per-candidate, with the house discipline:

| Candidate | Verdict | Why |
| - | - | - |
| Charting for radar/graphs | **use existing** `echarts@^6.1` + `echarts-for-react@^3.0.6` | Already the sealed analytics layer (`pnpm-workspace.yaml:205-208`, D52; `packages/ui/src/charts/chart/` wrapper handles motion/resize/aria/theming). Radar is a tree-shaken `echarts/charts` import — new primitive, not new package. |
| Diffing | **use existing** `diff@^9` (jsdiff) | Already backs the sealed `@orb/ui/diff` `DiffView`. |
| Schema-driven form/renderer engines (`@rjsf/*`, JSONForms, uniforms) | **REJECT** | They solve INPUT forms over open JSON Schema (widget registries, validation UX, ajv underneath — a large maintenance surface and a second schema interpreter beside zod, violating the D79 one-representation law). Our problem is DISPLAY over a closed \~10-kind subset: the total mapping is \~300-500 feature-tier LOC with exhaustiveness enforced by tsc. Hand-rolling is smaller than integrating. |
| JSON-Schema introspection libs (`json-schema-library`, ajv for traversal) | **REJECT** | The liftable subset needs a \~40-line typed walker; a general resolver ($ref, allOf merging, dialects) imports exactly the openness the lift exists to refuse. |
| Vendoring (the CEL-vendored-kit-seam test) | **not triggered** | CEL was vendored because a small pure engine needed surgical control inside kit. Nothing here has that profile: charts/diff are already deps; the render plan is first-party; the lift is first-party. |

## 11. The OG test suite — steal/adapt ledger

Whole-suite read (16 files, 6,746 lines — every file listed in §13). Classified per the owner's
three bins. The suite's headline value: **the test HEADERS name the bugs that actually happened** —
`state/pipeline-actions.test.ts:1-14` is a confession list ("KEY BUGS THESE TESTS PREVENT: iteration
staleness… result accumulation… state mutation"), and `data/settings.test.ts:414` preserves a scar
in a comment: *"useStructuredOutput is forcibly disabled in migration v2 for score/analyze stages"*
— structured output BROKE badly enough mid-life that a migration turned it off for two of three
stages. That is the strongest possible argument for orb's wire-subset/strict-knob machinery being
load-bearing rather than ceremony.

### (a) ST-environment artifacts orb structurally kills (covered, one line each)

- Observable store batching/subscription suite (`state/store.test.ts`, 635 lines) — React+zustand;
  the defect class is unrepresentable.
- IndexedDB session CRUD/index/migration (`data/sessions.test.ts` CRUD + `Storage Migration`) —
  SQLite FK-cascade + baseline squash; `tests/db/schema/refinery.int.test.ts` already pins cascade.
- Settings versioned-migration suite (`data/settings.test.ts` most arms) — contracts zod + read-seam
  heals.
- HTML-string component render/`cx`/api-status suite (`ui/components.test.ts`) — React + sealed
  primitives; connection readiness is domain truth (E9).
- Error-boundary utilities (`ui/error-boundary.test.ts`, 699 lines) — the section shell's React
  boundary; BUT see (c)-3 for the lesson it still teaches.
- V1/V2 field extraction fallbacks (`domain/fields.test.ts`) — serde normalizes at import; the card
  is a flat row.
- ZWSP escape/unescape round-trips (`shared/templates.test.ts:190-303`) — belt-5 by-construction
  (macro-mode `"none"`, `prose.ts:14-17`) + the substrate verbatim pin; the OG needed escaping
  because it COULDN'T not-run ST's engine.

### (b) REAL SCARS — the adapt list (orb suite → guard, sized)

| # | OG scar (receipt) | Orb status | Adapt action, sized |
| - | - | - | - |
| S1 | **Iteration staleness** — analyze must see THIS round's rewrite, never a stale one; three-iteration freshness sweep (`pipeline-actions.test.ts:232-388`) | `iterate.int.test.ts` covers one round + mid-round failure honesty (titles read this session: `:32,41,67`) — a MULTI-round freshness pin is absent | Add to `tests/server/domain/refinery/verbs/iterate.int.test.ts`: 3 iterate rounds with distinct scripted rewrite texts; assert each round's analyze PROMPT (via the summarize stub's captured input) contains that round's text and not the prior round's. \~40 LOC. |
| S2 | **Stage context threading** — rewrite sees score output; analyze sees original+rewrite; guidance included when present and ABSENT when empty (`domain/pipeline/prompt.test.ts:199-356`) | Anti-drift + guidance-presence pinned (`refine-prompt.test.ts:46,59-67`); the two NEGATIVE arms (no guidance section when empty; no score block when no score run) unverified this session | Two negative-space asserts in `substrate/refine-prompt.test.ts`. \~15 LOC. |
| S3 | **Structured-output regression by provider** — the settings-migration kill switch (`settings.test.ts:414`) | Orb's per-wire scrub + D126 knob + bounded retry are the structural answer — but nothing PINS that a custom schema survives every wire mode | When SF lands: a golden per `WIRE_SCHEMA_MODES` member — scrub(project(lift(fixture schema))) is accepted-shape for that wire (bounds stripped where documented, kept on guided-decoding). Lives beside the kit json-schema tests. \~60 LOC. |
| S4 | **Malformed-LLM-response taxonomy** — fences, truncation, trailing commas, comments, narrative, wrong-wrapper (`domain/schema.test.ts:240-305`) | `runStructuredTurn` owns extraction; its own suite covers fence/think tolerance (per its header contract) — the refinery-side `stage-parse.test.ts` covers null-drop + stripped-keys | Port the OG's malformed-reply FIXTURE STRINGS as extra cases into the structured-turn/stage-parse suites — they are a battle-tested corpus of real model misbehavior. \~30 LOC of fixtures. |
| S5 | **Preset/schema registry hygiene** — case-insensitive name uniqueness, duplicate-naming `(2)`-with-gaps, builtin-protection, deep-clone-on-duplicate (`data/registry.test.ts:531-664`, `shared/utils.test.ts:9-48`) | `refinery_schemas` CRUD (SF0) has none of this yet | Adopt as the SF0 verb-test bar: per-owner case-insensitive uniqueness; duplicate→fresh-row (no shared references); fixed arm undeletable-by-construction (not a row). \~80 LOC when SF0 lands. |
| S6 | **Score-in-prompt contract pins** — verdict spellings present in analyze prompt; score rubric words present (`data/defaults.test.ts:98-107,75-84`) | The shapes ride `requiredTokens` (`prose.ts:191-224`) and the prose baseline test asserts default-identity — but requiredTokens is WARN-tier for OVERRIDES; a host override dropping "REGRESSION" silently degrades the loop's stop condition | Accept as designed (warn-never-block is ruled) BUT add the §9.3 `{{shape}}` splice — after which the shape can never be edited away since it is engine-spliced. Covered by that fix's own test. |

### (c) Renderer-design lessons mined from the suite (shapes users actually authored)

1. **The empirical schema corpus is small, flat, and entirely inside the liftable subset** — the
   three builtin schemas (`data/settings/defaults.ts:239-370`: score = array\<object{enum-ish
   string, number, 3 strings}> + number + array<string> + string; quick-score = number + 2
   array<string> + string; analyze = 3 array<string> + number + string + enum + 2 array<string>)
   plus the test-fixture customs (`schema.test.ts:100-210`: nested object user{name, age}, enum
   status, array<string> items) and the settings-migration fixture's user persona ("My Waifu
   Scorer", a score-stage custom prompt+schema author — `settings.test.ts:341-424`). §3.2's mapping
   covers every one with no generic-floor hits; these become the seed fixtures for the totality
   property test (§3.4).
2. **Quick-score proves users WILL author structurally-different schemas for the same stage** (no
   `fieldScores`, top-level strengths/weaknesses arrays) — the well-known-core rule (NL design §4.3:
   custom score must include `overallScore`; custom analyze must include the verdict enum) is the
   right minimal invariant, and the renderer must make the NON-core majority of a custom payload
   first-class, not an afterthought under a hero.
3. **A renderer failure must degrade to a designed fallback, never take the surface down** — the
   OG's 699-line error-boundary suite is the scar of HTML-string rendering, but the surviving
   lesson is (b)+(§9.1): the render plan is derived from a schema that can be edited/absent, so the
   plan builder must be total over MALFORMED hints (heal-to-structure, §4.2) and the run viewer
   total over schema-absent runs (the §9.1 embed makes that state unrepresentable — the better fix
   than a boundary).

## 12. Design question (e) — R3 vs R4 sequencing

| Item | Home | Why |
| - | - | - |
| Widget vocabulary + render plan + fixed-payload hint set (§3) | **R3** | It IS the assay/analyze surface; the fixed payloads are the first instance. |
| Field-topology contract fixes (§7 a–c: clear arm, greeting-append, empty-section prompt) | **R3 (contracts/server pre-work, first lane)** | Pre-launch contract surgery; the R3 accept UI needs the block classes to exist. |
| Accept-grammar ADDED/EMPTIED treatments + CompareBlocks widening (§7d) | **R3** | Rides the already-owed arm-B widening. |
| Output-budget preflight (§8) | **R3** | One query + arithmetic; the mock's fit line grows a side. |
| Version walk: CONTEXT Versions tab + diff-any-two + restore + label convention (§6) | **R3** | Verbs all exist; owner named it first-class; the label convention must land in `applyFields` before real data accumulates. |
| Manual-rewrite arm (feedback gap 1) | **R3** | Already ruled R3-scope; composes with the version walk. |
| §9.1 schema-in-run-provenance + §9.2 `duration_ms`/usage threading + §9.3 `{{shape}}` splice | **R3-window (pre-launch), independent small lanes** | Each gets expensive after launch (append-only rows / un-backfillable column / prose version bump). |
| Custom-schema editor + NL panel + testSchema preview (SF2) rendering through the SAME render plan | **R3.5/SF** | The renderer ships first against fixed payloads; SF2 consumes it unchanged — that ordering PROVES the "built-in is one instance" directive. |
| Radar primitive + axes-group hint honoring (§5) | **R4** | Bars are the honest default; radar is elevation polish — and the batch-score sweep (R4) is what makes multi-card graphs interesting. |
| Batch score sweep, library sorts, dossier hookup (study I2/I3) | **R4** | Unchanged. |
| Lorebook refinement family, apply-as-copy, persona-substitution toggle (feedback gaps 2–4) | **R4+** | Unchanged. |

## 13. Coverage — what was read, how deep, and what was not

**OG extension (in full):** `ui/formatter/{json-renderer,helpers,section-renderer}.ts`;
`domain/schema/{validate,generate}.ts`; `data/settings/defaults.ts:230-379` (builtin schemas +
settings block); the ENTIRE test suite — `tests/{setup.ts →skim, shared/utils, shared/templates,
domain/schema, domain/fields, domain/pipeline/prompt, data/defaults, data/settings, data/registry,
data/sessions, state/store, state/popup-state, state/pipeline-actions, integration/pipeline,
ui/components, ui/error-boundary}` (setup.ts skimmed for fixtures only).

**Orb, in full this session:** `kit/src/json-schema/{index,lift,wire-subset}.ts`;
`kit/src/{ids,guided,side-gen-posture,tokens}/index.ts`; `contracts/src/refinery/{index,prose}.ts`;
`contracts/src/{character,role-clients,prose,prose-slot,portability}/index.ts`;
`contracts/src/preset/index.ts:60-219` (posture + params region) + posture greps;
`db/src/schema/refinery.ts`; `db/src/schema/character.ts:140-180` + header region;
`db/src/kit/{fetch-owned,parsers}.ts`; `domain/refinery/verbs/apply-fields.ts`;
`domain/character/verbs/snapshot.ts:10-35`; `substrate/refine-prompt.ts` (targeted greps +
line-cited hunks); the five mocks (four on main + `accept-ergonomics.html` from worktree
`agent-a6d841ff566b5edc8`, in full); `refinery-r0.md`, the port study, the NL→schema addendum, the
og-extension-feedback doc (in full); ui charts primitive headers (all 8 dirs); orb refinery test
inventory + targeted coverage greps (`refine-prompt.test.ts`, `iterate.int.test.ts` titles).

**Live probes this session:** the lift/scrub/project hint probe (§4.1, script at
`reports/stickler/scratch/stickler-hint-probe.ts`); dependency census
(`pnpm-workspace.yaml` catalog + ui/client package.json).

**NOT read in full (the owner's "packages in full" order, honestly bounded by context):**
`contracts/src` — the rpg family (extraction/prose/tracker/…, \~4k LOC; strippedKeys/salvage
consulted by grep receipt only), `chat/*`, `settings/index.ts` beyond the D126 hunk,
`connection`, `automation`, `imagery`, `world-info`, `plugin`, `providers` beyond the usage grep,
smaller namespaces; `db/src` — `client/index.ts`, `schema/{chat,rpg,embeddings,discovery,tag,
workloads,automation,world-info,stats,regex,databank,plugin,…}` (headers/sizes inventoried only);
`kit/src` — `content/index.ts` (header + outline only), the macro family (\~2.5k), `png-card-chunk`,
`image-sniff`, `regex`, `speaker-label`, `time`, `vector-math`, `cel`, and the small leaves.
Nothing in §0–§12 rests on an unread region: every load-bearing claim above carries its own
read/probe receipt. If a finding hides in the unread remainder it is OUTSIDE what this review can
certify — the not-covered list is exactly that boundary.

**Not run:** `pnpm check` / any battery (no diff under review — this is a design charge on a clean
tree; the gate battery certifies code, and none was written).

## 14. Unconfirmed suspicions (low priority, one line each)

- `SummarizeResult`'s usage shape (`contracts/providers/index.ts:49,71` grep hit) may or may not
  survive each backend's summarize runner — the §9.2 usage-threading fix needs a per-backend check
  I did not perform.
- The snapshot verb's minted id (`snapshot.ts:24`) may not currently be RETURNED to the caller —
  §6.2's result-carried `snapshotId` may need a result-shape widening; one read of
  `contract/service.ts` settles it at build time.
- The OG `tests/setup.ts` mock-ST harness may contain additional fixture cards worth seeding the
  renderer corpus — skimmed, not mined.
- Whether `refinery_schemas` rows should ride the portability bundle (NL design flagged the same
  question for prose overrides) — one lane, same answer for both, still open.

---

# PART II — owner rulings landed mid-workshop (these SUPERSEDE the matching Part-I sections)

Four rulings arrived while Part I was being written. Each is folded here as design, not
re-litigated; where a Part-I section said "candidate/fork", read it as RULED per below.

## 15. Emptying is RULED IN — the semantics, designed (supersedes §7a's "fix" sketch)

Owner, verbatim: *"why wouldn't they be able to empty personality? They can fill it therefore they
can empty it."* The R0 `min(1)` comment (`contracts/refinery/index.ts:225-230`) is overruled.
Consolidation is refining. Design:

### 15.1 Wire shape — an explicit `cleared` arm, not an empty string

```
refineryRewriteFieldSchema =
  { field, greetingIndex?, text: z.string().min(1).max(REWRITE_TEXT_MAX) }
| { field, greetingIndex?, cleared: z.literal(true) }
```

Why the tagged arm beats `""`:

- **Grammar honesty.** The payload projects to a wire grammar (`projectJsonSchema` → per-wire
  scrub). Dropping `min(1)` would silently change the projected `minLength` on every wire and make
  `""` a legal-but-ambiguous token (is it "clear" or "the model emitted nothing"?). An explicit
  `cleared: true` is a distinct, model-legible structure — small models handle "emit
  `{"field":"scenario","cleared":true}`" far better than a semantics-bearing empty string, and the
  guided-decoding grammar enforces the shape exactly.
- **Renderer honesty.** A `cleared` entry renders as a state, not as a zero-length diff (§15.4).
- **Anti-sniffing.** `""`-as-clear is one more data-sniffed convention — the §1 disease.
- Zod v4 note: spell it as a union of the two object arms (not a discriminated union on an
  optional key); the lift/scrub chain is untouched — this is a FIXED-payload contract, zod-native,
  never lifted.

The prose slots' rewrite shape restatement (`REWRITE_SHAPE`, `contracts/refinery/prose.ts:30`) and
the system texts gain the clear teaching ("to empty a field the guidance/consolidation calls for,
emit `cleared: true` instead of `text`") — version bumps, owner signs (§9.3's `{{shape}}` splice
makes this automatic once landed).

### 15.2 Greetings — clear means REMOVE THE ENTRY, and the verb owns index coherence

An empty-string greeting is a degenerate card state (a blank greeting offered in chat); the product
meaning of "empty greetings\[1]" is **remove the slot**. That makes index coherence the verb's
problem, because everything addresses greetings BY POSITION (`selection.greetingIndexes`
`contracts/refinery/index.ts:124-131`; score/rewrite `greetingIndex` entries; the apply belts
`apply-fields.ts:144-155`):

- Within one apply batch: compute every belt/classify decision against PRE-splice indexes (the
  indexes the whole session speaks), then perform removals in DESCENDING index order alongside the
  text replacements built on the pre-splice array — one pass over a copied array, deterministic.
- After the write, THE VERB REMAPS THE SESSION in the same transaction:
  `session.selection.greetingIndexes` drops removed indexes and shifts the survivors down
  (`[0,2,3]` minus a removal at 2 → `[0,2]`). Prior RUN payloads are append-only history and are
  NOT rewritten — they described the card as it stood, and the run viewer renders them against
  their round; only the LIVE-card belts (which already run against the live array) and the live
  selection need coherence.
- `greetings[0]` (the first message) removal: allowed only when another greeting exists to become
  `[0]` — a card with zero greetings is a worse authoring state than an empty field; refuse that
  one entry with a typed drop reason (`would_leave_no_greeting`) rather than writing it.

### 15.3 Per-field applicability — the card contract's own nullability, receipted

`updateCharacterSchema` (= `createCharacterSchema.partial().extend(…)`) accepts `null` to clear
`personality/scenario/greetings/exampleMessages/systemPrompt/postHistoryInstructions/creatorNotes/
depthPrompt` (`contracts/character/index.ts:173-193` — all `.nullable().optional()`; header law
":161-162 null clears a field") — clear maps to `null` for all of those. **The one asymmetry:
`description` is non-nullable on the write wire** (`:172` — `z.string().max(TEXT_MAX)`, no
`.nullable()`) even though the CARD schema allows `description: null` (`:113`). So clear(description)
must map to `""` today — a silent two-spellings-of-empty seam. **Recommendation (same pre-launch
window): harmonize — make `description` `.nullable().optional()` on the update path** so every
refinable field clears the same way; flag the in-flight card-face nullability work (per-composer
nullability) as the coupled lane — this is a one-line contract change plus its fixture sweep, and it
should be decided WITH that lane, not around it. Until then the apply arm special-cases
description→`""`. `depthPrompt` clear = `depthPrompt: null` (removes note AND directive — say so in
the block copy; the alternative, text-only-empty with a dangling `{depth,role}`, is the degenerate
state the existing `not_applicable` belt exists to avoid).

### 15.4 The accept UI — cleared is a STATE WORD, not an empty diff side

A cleared block renders: the BEFORE text (strike treatment) + an explicit after-side state panel —
the word **"Cleared"** (destructive-tinted chip, word-primary) + one line of consequence copy per
field class ("this greeting slot will be removed — later greetings shift up" / "the depth note and
its placement directive are removed"). Never an empty green pane. The Keep verb on a cleared block
carries distinct copy — **"Keep (empties field)"** — so consent is to the destruction, not to an
ambiguous diff.

### 15.5 Security posture, stated

An emptying write is a DESTRUCTIVE write reachable by a model-authored payload. The covering belts,
in order: (1) a `cleared` entry passes the SAME intersection as text entries — selection fence,
rewrite membership, live-card applicability (`apply-fields.ts:123-159`), so a steered "clear
systemPrompt" outside the session's scope dies at `not_selected` exactly like a steered rewrite;
(2) apply is never automatic (belt 10 / arm B) and a cleared block's Keep is an explicit press on a
block whose header SAYS it empties (§15.4's distinct copy — the consent is informed by
construction); (3) the auto-snapshot-before-apply makes every clear reversible (belt 13). That is
sufficient; no new belt class. One addition worth its cost: the apply RESULT itemizes clears
separately from replacements (`applied: [{field, kind: "replaced"|"cleared"|"added"}…]`) so the
outcome panel and the audit trail state destruction explicitly.

**Rank: P1-A (RULED, pre-launch)** — contracts union arm + apply classify/patch/remap arms + the
score/prompt empty-section fix (§7c) + UI treatments + contract-test bounds sweep. One lane.

## 16. Revert + step-back is first-class on ALL THREE AXES (upgrades §6)

Owner: the user must walk backward through (i) phases within a round, (ii) iterations across
rounds, (iii) card versions — and he flags he hasn't exercised the versions machinery much, so the
plane was audited (below).

### 16.1 Phase + iteration walk — the append-only log already IS the walker; add ONE verb knob

Every run of every phase of every round is an immutable row (`db/schema/refinery.ts:16-20,80-112`).
"Current per stage = latest per (session, stage)" is a READ convention, not storage — so stepping
back needs no pointer mutation and no row deletion (both would betray append-only honesty):

- **View-back (free):** the CONTEXT Runs tab already lists every run; tapping loads it into
  CONTENT's viewer (`revealContextPanelBesideContent` discipline, NL design §10.4). Iteration
  compare = DiffView over any two runs' payloads, client-side.
- **Operate-back (the one addition):** the consuming verbs take an OPTIONAL explicit run —
  `analyze {…, rewriteRunId?}` and `applyFields {…, rewriteRunId?}` default to latest
  (`latestRunRowOf`, `apply-fields.ts:44`) but accept any run of the right stage in the session
  (ownership rides the session join; a foreign/wrong-stage id is the leak-free NOT\_FOUND). That is
  the whole mechanism: "go back to round 1's rewrite" = analyze/apply AGAINST run N — the new
  analyze row is appended and provenance stays true. No `revert-run` copy rows, no mutable current
  pointer. The run view already carries `iteration` for the walker's labels.
- **Docking without anti-echo:** the Runs rows gain per-row ACTIONS (View · Use for apply ·
  Compare with…) — actions on row data, which the anti-echo rule permits (it bans restating
  CONTENT's headings/payloads, not affordances). The "in-force" marker when an explicit
  `rewriteRunId` is armed shows as a chip on the chosen row + one line in the CONTENT run bar
  ("applying round 1's rewrite") — stated once each side, different words, no echo.

### 16.2 The versions-plane audit (the owner asked; receipts)

| Capability the surface needs | Status | Receipt |
| - | - | - |
| List versions per character | LIVE | `list-snapshots.ts` verb; per-character index `db/schema/character.ts:163-168`; tRPC-wired (port study §3.3) |
| Diff any two | BUILDABLE CLIENT-SIDE | full `content` blobs on rows (`:159`); `DiffView` sealed for it |
| One-click restore, itself reversible | LIVE | `restore.ts` — pre-restore auto-snapshot (`:35`, `PRE_RESTORE_LABEL`) |
| Auto-version before every refinery apply | LIVE | `apply-fields.ts:34,76` |
| Provenance: which refinery run/session produced a version | **GAP** | label is free text `"auto: before refinery apply"` — no session/run linkage; FKs banned by the D28 invariant (`character.ts:146-148`) |
| Pagination / volume behavior of the list | **UNVERIFIED** | not read; a heavy refinery user mints a snapshot per apply — check `listSnapshots`' query bounds before R3 (one read) |

Pre-launch fixes: the §6.2 label convention (`auto: before refinery apply · <sessionId>`) lands in
`applyFields` NOW — it is free, and every apply before it ships is an unclassifiable timeline row
forever. The snapshot-id-in-result widening (§6.2) rides the same lane. The pagination check is a
one-read audit item for the R3 lane brief.

### 16.3 The tri-axis surface, composed

One walker, three lenses, all docking in the ruled anatomy: CONTEXT **Runs** = phases + iterations
(16.1); CONTEXT **Versions** (the §6.3 third tab, still an owner fork on placement) = card
versions with Restore/Compare; CONTENT = whatever the walker loaded, always labeled with WHERE in
the walk you are ("round 1 · rewrite · superseded" / "version of 14:02 · before apply"). The
back-walk never mutates until the user fires an explicit verb (analyze-against, apply, restore) —
walking is free, changing state is a press.

## 17. Save-as-new-character-copy — RULED IN (upgrades feedback-gap 3 from R4-candidate)

Design: one sibling verb, `applyAsCopy {sessionId, accepts, name?}` — the SAME intersection +
patch construction as `applyFields` (belts 9-11 verbatim; the accept set is the user's reviewed
Keep set), but the write arm forks: instead of snapshot+update on the live card, it creates a NEW
character. Ride the existing machinery:

- **Base = the LIVE card** (same base apply uses — the user reviewed diffs against it), with the
  accepted patch overlaid; the shipped `duplicate` verb (`domain/character/verbs/duplicate.ts`,
  exists — inventoried this session) is the chassis: mint fresh handle, carry what duplicate
  already carries, then overlay the patch. What duplicate carries (avatar asset ref? tags?
  attached books?) was NOT read this session — the build lane confirms and the copy semantics
  FOLLOW duplicate's existing rulings rather than minting new ones (one fork-copy law, not two).
- **Recommended carry decisions** (owner signs): avatar YES (same asset ref — it is the same
  character's face); tags YES (whatever duplicate does today); `refinery` signals on the copy:
  stamp FRESH from the session's latest score/analyze runs — they describe exactly the copy's
  content (unlike the handoff-clear precedent, where the signals described someone else's
  critique); name default `"<name> (refined)"`; session provenance: the session row stays anchored
  to the ORIGINAL character (its FK) — the copy carries no session linkage (a card is canon, not a
  pipeline artifact); the result returns the new characterId and the surface offers "Open the
  copy".
- **No snapshot needed** (nothing existing is written) — say so in the outcome copy, since the
  apply panel teaches snapshot-first and its absence here must not read as a miss.
- **Sequencing: R3.** It is committed scope, small (the patch builder + duplicate both exist), and
  it completes the end-of-session choice the surface must present anyway: **Apply to card ·
  Save as copy · Discard** — three verbs, one review.

## 18. Primitive-minting latitude, exercised (the mint list)

Owner: new primitives are fine. Recommended mints, each with contract + consumers + CT obligation
— and the ones deliberately NOT minted:

| Mint | Contract | Consumers | CT obligation |
| - | - | - | - |
| **CompareBlocks: review variant** (widening, not a fork): tri-state `decided: (boolean\|null)[]`, verb-pair slot replacing the hardcoded checkbox, bulk-row opt-out, **absent-side arm** (`before?`/`after?` at-least-one) with a state-word panel (Added / Cleared) | already specced in the accept-ergonomics mock ("needs widening ×2" — this adds the absent-side as count 3) | refinery compare (R3); any future review-then-commit surface (import conflict review is a plausible second) | CT: tri-state cycling, fail-closed undecided, absent-side rendering, greyscale-legibility story; retarget the existing `compare-blocks.ct.tsx` fixture (the only coupled site — census in the mock) |
| **`@orb/ui/charts/radar`** | the `bar-list` shape: option-builder + `LabeledChartFrame` + theme hook; props `{axes: {label, value, max}[], label}`; refuses <3 or >8 axes at the type/dev tier | refinery multi-axis (R4); analytics is a plausible second (per-model stat spiders) | CT: renders axis words + numerals (word-primary proof), reduced-motion, empty state |
| NOT minted: **VersionTimeline walker** | feature-tier composition (`ListRow` + chips) in `features/refinery` v1 | `rpg_checkpoints` is a REAL second-consumer candidate (`kit/ids` `:87` — checkpoints plane) — promote to a primitive WHEN that surface wants it, with both consumers' contracts on the table (the D44 bar: a primitive earns sealing by second consumer or by a11y/media complexity, and a list-of-rows has neither yet) | — |
| NOT minted: **VerdictBanner** | feature-tier: `Section` + tone tokens + the hint's tone map — no behavior, no a11y complexity | refinery only | covered by the payload-view CTs |

---

*Part II rulings change Part I's ranked table as follows: P1-A is RULED (owner override, §15), and
its lane now includes §15's full semantics; §6's version walk gains the §16 tri-axis upgrade and
the pagination audit item; §12's sequencing moves save-as-copy (§17) into R3; §10 gains the §18
mint table. Nothing else in Part I is superseded.*

## 19. SUPERSESSION MAP (mechanical — for the follow-up doc-hygiene lane)

This document is now the AUTHORITATIVE refinery R3/SF program doc. Review-tier docs are RECORDS —
never edited, they get a dated pointer banner at the very top. Design-tier docs get truth-repair
edits. Code comments get repaired in the SAME lane as their code change, never separately.

### 19.1 `docs/reviews/stickler/2026-08-08-card-refinery-port-study.md` — RECORD, banner only

- **Banner (insert as line 1):**
  `> **2026-08-08 — RECORD.** The live R3/SF program authority is`
  `> [refinery-schema-renderer.md](../../design/refinery-schema-renderer.md). Superseded here: the`
  `> §5.1 rewrite-payload sketch (no clear arm — see authority §15); gap-3 apply-as-copy timing`
  `> (now RULED R3 — authority §17). Everything else stands as the port-decision record.`
- LIVE (cite, don't copy): the essential/accidental matrix (§2), the E-class already-exceeded table,
  forks F1-F7 as originally signed, the security routing note.
- SUPERSEDED: §5.1's `rewritePayloadSchema: {fields:[{field,text}]}` sketch (→ authority §15.1
  union); the implicit apply-is-the-only-terminal assumption (→ §17 three-verb ending).

### 19.2 `docs/reviews/stickler/2026-08-08-card-refinery-nl-schema-design.md` — RECORD, banner only

- **Banner (insert as line 1):**
  `> **2026-08-08 — RECORD.** Renderer + hint design now lives in`
  `> [refinery-schema-renderer.md](../../design/refinery-schema-renderer.md) (its §3-§5 supersede`
  `> §4.7's renderer sketch; its §9.1 supersedes the bare {kind:"custom",schemaId} run-provenance`
  `> arm — runs must embed the schema; its §6.3/§16.3 adds a Versions CONTEXT tab as an owner-fork`
  `> DELTA to §10.3's Runs+Setup pair). The SF0-SF3 sequencing and the shell-conformance audit`
  `> (§10) otherwise stand.`
- LIVE: §2's machinery re-verification, §4.1-4.6 (representation/verbs/routing), §5's improvements,
  §10's shell audit + deltas 1-3.
- SUPERSEDED: §4.7's four-line widget list (→ authority §3.2 total mapping + §4 hints); the
  stage-config custom arm's schemaId-only provenance (→ authority §9.1); "the editor's bounds row"
  copy stands but gains the §8 output-fit sibling.

### 19.3 `docs/design/refinery-r0.md` — ACTIVE design doc, TRUTH-REPAIR EDITS

- §3 "Spec completions" bullet *"min(1) — a rewrite never CLEARS a field (clearing is authoring,
  not refining)"* → replace with a pointer: *"OVERRULED 2026-08-08 (owner): clearing IS refining —
  the cleared arm + greeting-removal semantics live in refinery-schema-renderer.md §15."*
- §9.2 verbs table, `applyFields` row → add: accepts may carry `cleared` entries; optional
  `rewriteRunId` (schema-renderer §16.1); sibling verb `applyAsCopy` (§17).
- §9.4 run-row bullet → add `durationMs` + the usage-threading decision (schema-renderer §9.2).
- §9.7 prose bullet → note the pending `{{shape}}` splice change (schema-renderer §9.3).
- No banner needed — the doc stays the R0/R1 build record; the edits are additive pointers.

### 19.4 `docs/design/refinery-og-extension-feedback.md` — ACTIVE, ONE-CELL EDIT

- Gap 3 (apply-as-copy): *"a small R4 candidate"* → *"RULED IN 2026-08-08 (owner) — R3 scope;
  design: refinery-schema-renderer.md §17."* Gaps 1/2/4 unchanged.

### 19.5 Mock note blocks — `docs/design/mocks/refinery/*.html`

- `surface.html` Frame 2 (checkbox accept grammar): ALREADY superseded by
  `accept-ergonomics.html`'s RULED banner — no further edit; but its FORK C/D notes stay live.
- `apply-and-selection.html` LAW note ("the six reasons are the closed `ApplyDropReason` axis"):
  append one sentence — *"Axis widens with the cleared/append arms (schema-renderer §15.2:
  `would_leave_no_greeting`) — the closed-axis discipline unchanged."*
- `accept-ergonomics.html`: the "needs widening ×2" primitive section gains count 3 (absent-side
  arm) — pointer to schema-renderer §18 row 1. (This file was on worktree
  `agent-a6d841ff566b5edc8` — merged (`5b34b48ff`); edit lands directly.)
- `empty-states.html` / `d62-deltas.html`: no stale claims found; no edit.

### 19.6 Code comments (repair IN the lane that changes the code, never a doc lane)

- `packages/contracts/src/refinery/index.ts:225-230` — the min(1)/"never CLEARS" comment: rewritten
  by the §15 contracts lane.
- `packages/contracts/src/refinery/index.ts:263-271` — `REFINERY_STAGE_PAYLOADS` "ONE home"
  sentence: amended by the §9.1/§9.6 custom-parse lane.
- `packages/contracts/src/refinery/prose.ts:28-32` shape constants + slot texts: the §9.3
  `{{shape}}` lane (version bumps, owner signs).
- `packages/db/src/schema/refinery.ts:97-99` promptTokens comment ("absent when the backend reports
  none"): made true by the §9.2 usage lane, which also adds `duration_ms`.

## 20. NO AS-YOU-GO CARD WRITES — verified, one declared tension (owner ruling)

Ruling: the session is a WORKSPACE; the live character is touched exactly once, at the terminal act.

**(a) Verification against the shipped verbs (receipts):**

- `startSession` / `updateSession` / `deleteSession` / reads — no card writes (session tables only).
- `runStage` / `iterate` — append run rows only, EXCEPT the F6 signal stamp:
  `stampRefinerySignals` fires on every SCORE run (`run-stage.ts:115` — stamps
  `characters.refinery.score`) and every ANALYZE run (`:129` — stamps `.analysis`); rewrite stamps
  nothing (`:99`). **This IS a mid-session write to a `characters` column.**
- `applyFields` — the one canon CONTENT write, snapshot-first (`apply-fields.ts:73-77`). Terminal.

**The tension, declared with both arms (owner fork F-W1):** the F6 stamp writes derived METADATA
(`refinery` signals — "derived, not authored", `contracts/character/index.ts:63-65`), never a card
CONTENT field, and the R4 batch-score sweep's entire purpose is stamping scores WITHOUT ever
applying — so a blanket "no card-row writes mid-session" would kill a designed feature.
**REC: declare the carve-out** — the ruling means *no authored-content writes* mid-session; signal
stamps are critique ABOUT the card and remain live-updating. **Alternative arm:** defer stamping to
the terminal act (apply/copy/abandon stamps the session's latest signals once) — cleaner under the
strictest reading, but it makes the two shipped client score readouts stale during exactly the
sessions that generate scores, and it forks the sweep's stamping path. If the owner picks the
carve-out, the surface must still TEACH it (below); if the strict arm, `run-stage.ts:115,129` move
into the terminal verbs — a small R1-amendment lane.

**(b) The surface teaches the workspace:** a persistent, quiet state line in the CONTENT band —
`Draft — the live card is untouched` (flipping to `Applied at 14:52 · snapshot taken` after the
terminal act) — plus the already-designed anchor line (the 14:02 pin). The apply/copy/discard
triad (§17) is the ONE place the wording turns from draft to write. If F-W1's carve-out wins, the
score readout's tooltip on the character surfaces says "updated by refinery scoring" so the one
live-updating number is explained, not mysterious.

## 21. THE GIT MODEL — adopted as the state semantics (owner's framing)

Mapping, then the two edges it forces us to design properly:

| Git | Refinery | Status |
| - | - | - |
| BASE ref | `original_card` (the session pin) | shipped (`db/schema/refinery.ts:57-58`) |
| working branch | the session | shipped |
| commit | a run row (append-only, immutable) | shipped (`:16-20`) |
| `git add -p` staging hunks | per-block Keep/Discard (arm B) | ruled |
| dirty tree | undecided blocks | designed (accept-ergonomics mock) |
| detached HEAD | viewing an old run (§16.1 view-back) | designed |
| checkout an earlier commit | operate-back via explicit `rewriteRunId` (§16.1) | designed |
| merge to main | `applyFields` (kept hunks → live card) | shipped + §15 |
| branch off instead of merging | `applyAsCopy` (§17) | ruled |
| reflog | the D28 snapshot plane | shipped (§16.2) |
| keep abandoned tails reachable | append-only ledger shows every run, superseded or not | shipped by construction |

**Edge 1 — commits need PARENT EDGES once step-back exists.** Git's model works because commits
name their parents. Our run rows are a timestamp-ordered list: "which rewrite did this analyze
judge?" is answerable only by "the latest at the time" — which BREAKS the moment §16.1's explicit
`rewriteRunId` lets an analyze target round 1 while round 2 exists. **Add `source_run_id` (nullable
text, no FK constraint needed beyond the session scope) to `refinery_runs` NOW** [OVERRULED: D24 —
shipped as a self-FK (`.references(() => refineryRuns.id, { onDelete: "set null" })`,
`packages/db/src/schema/refinery.ts`); boundaries are physics, so "no FK constraint needed" was
rejected] (the P1-C baseline-squash window): analyze rows record the rewrite they judged; rewrite rows record the
score/analyze context they consumed; the ledger can then draw the true DAG ("round 2 branched from
round 1's rewrite") instead of implying a straight line that step-back makes false. Iterating after
a step-back is then simply a new chain whose parent edge says so — git's answer, kept visible.

**Edge 2 — the live card changing UNDERNEATH the session is a MERGE CONFLICT, and it is
detectable.** The shipped belts check live-card applicability only structurally (greeting count,
depth-note presence — `apply-fields.ts:153-158`); a hand-edit to `description` mid-session is
silently overwritten by an accepted rewrite of it. The anchored original makes divergence
detectable in one comparison: for each accepted field, `live[field] !== originalCard[field]` ⇒ the
field moved since the pin. **Design: the conflict block.** At apply preflight (client-side — both
texts are already in hand), a diverged accepted field renders a three-pane conflict treatment —
BASE (the pin) · LIVE (what changed under you) · REWRITE (what you kept) — and its Keep press is
invalidated back to Undecided with distinct copy ("this field changed on the card since the session
started — re-confirm which version wins"). No auto-merge (we are not writing a text merger; the
user picks LIVE or REWRITE). Verb-side, the same comparison guards the race: `applyFields` re-runs
the divergence check and itemizes an un-reconfirmed diverged field as a typed drop
(`diverged_since_session` — one new `ApplyDropReason` member) rather than writing blind; a
reconfirmed accept carries an explicit `confirmDiverged: true` flag per entry. The snapshot still
makes even a wrong pick reversible — but informed consent is the bar, and git's conflict marker is
the correct precedent, not fast-forward-by-default.

*(Supersession-map addendum: §19.3 gains one row — refinery-r0.md §9.5's apply belt list acquires
the divergence check + `source_run_id`; and §19.5's `apply-and-selection.html` drop-reason note now
widens by TWO members: `would_leave_no_greeting`, `diverged_since_session`.)*
