> **2026-08-08 — RECORD.** Renderer + hint design now lives in
> [refinery-schema-renderer.md](../../design/refinery-schema-renderer.md) (its §3-§5 supersede
> §4.7's renderer sketch; its §9.1 supersedes the bare {kind:"custom",schemaId} run-provenance
> arm — runs must embed the schema; its §6.3/§16.3 adds a Versions CONTEXT tab as an owner-fork
> DELTA to §10.3's Runs+Setup pair). The SF0-SF3 sequencing and the shell-conformance audit
> (§10) otherwise stand.

# NL→schema generation — orb-native design addendum (owner override of study row S1)

Addendum to `2026-08-08-card-refinery-port-study.md`. Owner ruling: S1 (NL→JSON-schema generation) is
**overridden from SKIP to PORT-AND-IMPROVE, maximal** — "bring it over or improve it and make it fuck."
Second owner rider: **"the thing is implemented so it needs to handle that in the design"** — the design
below is architected ON the implemented structured-output machinery, with every piece's CURRENT shape
re-verified against today's tree (2026-08-08) and cited; where an implemented contract constrains the
design, the constraint is named and handled, not designed around.

This addendum AMENDS the study's S1 row and half of fork F3: fixed typed payloads remain the refinery
DEFAULT, and user-authored schemas become the sanctioned EXTENSION arm — the escape hatch that makes
F3's fixed set both safe and extensible (§4.3).

---

## 1. What the extension's NL-schema subsystem actually did

### 1.1 The UX loop (receipts)

1. **Entry point**: a "Generate" button in the per-stage schema config; click → `popup.input`
   ("Describe the structure you want (e.g., 'rating 1-10, list of issues, summary')")
   (`src/ui/components/stage-config/events.ts:484-493`; a second identical wiring in the preset drawer,
   `preset-drawer/form-view.ts:317`).
2. **Generation**: one raw LLM call — a fixed instruction prompt (exact wrapper format, "additionalProperties:
   false to ALL object types (required for Anthropic)", "simple types only", "keep it minimal") + the user's
   description (`src/domain/schema/generate.ts:9-24,63-66`).
3. **Cleanup + validate**: strip markdown fences (`generate.ts:76-81`), then `validateSchema` — JSON parse
   with character-position errors, wrapper checks (`name` must match `^[a-zA-Z_][a-zA-Z0-9_]*$`), then a
   recursive walk policing ANTHROPIC LIMITS client-side: depth ≤ 10, anyOf ≤ 8 variants, defs ≤ 100,
   enum warnings, unsupported-feature errors (`if/then/else/not/oneOf/dependent*` …), ignored-constraint
   warnings (`minimum/maxLength/maxItems/patternProperties` …), regex-feature refusals
   (lookaround/backrefs/word-boundaries), optional-field-explosion warnings
   (`src/domain/schema/validate.ts:46-637`; constants `constants.ts:10-89`).
4. **Auto-fix**: on warnings, clone + mutate — pin `additionalProperties:false` everywhere, default
   `strict:true`, MOVE unsupported constraints into `description` text (`[Constraints: minimum: 1, …]`),
   clamp `minItems` to 0/1 (`auto-fix.ts:18-121`).
5. **Land**: the generated schema is dumped into a raw JSON **textarea** as the stage's "custom schema",
   preset selection cleared, toast "Schema generated! Review and save as preset if desired"
   (`events.ts:505-527`). On validation failure the partial schema is STILL shown for hand-fixing
   (`generate.ts:86-91`, `events.ts:533-535`).
6. **Use**: the schema rides `generateRaw({jsonSchema})`; the reply is "validated" by checking only that
   top-level `required` keys exist (`parse.ts:49-61`) — no real conformance check — and a parse failure
   silently downgrades the run to unstructured text (`generation.ts:207-213`).

### 1.2 What made it cool (the essence to keep)

- **Describe-in-English → working schema in one click** — no JSON Schema literacy required; the README's
  pitch ("Don't know JSON Schema? Click Generate") is the feature.
- **Review-then-adopt**: generated ≠ trusted; the user sees it, can hand-tune, can save as a reusable preset.
- **The schema drives the RENDER**: structured replies became score bars / verdict badges instead of prose
  (`ui/formatter/json-renderer.ts`).

### 1.3 The contortions (named, shed)

| Contortion | Why it existed | Dies to |
| - | - | - |
| Client-side provider-limit policing (the whole `validate.ts` walk + `constants.ts` census) | The extension had no server and no wire ownership | `scrubWireSchema`'s four per-wire modes applied inside each backend (§2.4) + `liftJsonSchema`'s conservative-or-refuse subset (§2.2) |
| `auto-fix.ts` silent mutation (constraints moved into description text) | Couldn't refuse, so it patched | The lift REFUSES with a typed error naming construct+path — the repo's conservative-or-refuse law (`lift.ts:7-11`); and the bounded retry hands that refusal to the model to fix (§4.5) |
| Raw JSON textarea + a Validate button that JSON.parses | No typed representation | A FORM editor over the liftable subset (§4.7); raw-paste stays a secondary door through the same lift belt |
| Top-level-`required`-only reply "validation", silent downgrade to unstructured | No runtime validator for a dynamic schema | The lifted zod IS the runtime validator, inside `runStructuredTurn`'s salvage-parse + bounded retry (§2.1) |
| The `{name, strict, value}` wrapper format baked into the generation prompt | ST's `generateRaw` shape | orb `ResponseFormat` is `{name, schema, strict?, description?}` (`contracts/role-clients/index.ts:24-38`); `name` is a table column, `schema` is the stored artifact |
| One-shot generation only | No conversation state | `refineSchema` (§5.2) |

---

## 2. The implemented machinery (re-verified on TODAY'S tree — the shapes the design must obey)

### 2.1 `runStructuredTurn` (D79) — `packages/server/src/kit/structured-turn/index.ts`

Current contract (read in full this session): caller supplies `payloadSchema: z.ZodType<T>` + a
`run(correction?)` closure over its OWN already-built wire request; the helper owns fence/`<think>`-tolerant
balanced-brace extraction → `safeParse` → **exactly ONE bounded retry** with the zod issue summary
(`path: message`) appended → typed value or `StructuredOutputError`; `onRetry` observability (paths only,
never model text) (`:69-102`).

**Constraints this fixes for the design:** (a) the NL→schema generation's validator MUST be a zod schema —
so the lift refusal has to surface AS zod issues (the bridge in §4.5); (b) the retry budget is one and is
not a design knob — conversational schema iteration is a NEW verb call per instruction, never a widened
retry loop; (c) recovery POLICY stays at the caller (`:5-6`) — the "partial schema shown anyway" behavior
(§1.1.5) is a caller policy the verb reimplements from the error's `raw` field, not a helper change.

### 2.2 `liftJsonSchema` — the JSON-Schema→zod half is ALREADY BUILT (`packages/kit/src/json-schema/lift.ts`)

Built for plugin guest tool schemas (PL-B), **two live callers**:
`domain/tool-use/verbs/register-plugin-tool.ts:68` and `backends/agent-sdk/terminal-tools.ts`.
Current shape: object root required (`:287-293`); the supported subset is the exported
`LIFTABLE_JSON_SCHEMA` const — types object/array/string/number/integer/boolean, `enum` (string members
only), `const` (primitives), a standalone ≥2-member `anyOf` union, per-type keywords
(string min/max/pattern · number min/max · array items/min/max · object properties/required/closed-only
additionalProperties) (`:20-36`); **conservative-or-refuse** — any construct outside the subset throws
`JsonSchemaLiftError` naming construct + JSON-pointer path, never a silent strip (`:38-53`); depth-capped
at 32 with a typed refusal (`:55-60`); output is plain zod, projection-clean by construction (`:10-11`);
the golden proof is lift → `projectJsonSchema` ≡ input (`:13-14`).

**This kills the study's provisional "meta-schema AST" idea**: the internal representation question is
already answered by implemented law — **stored/wire representation = the liftable JSON-Schema subset;
runtime representation = the lifted zod; zod is never stored; the lift/projection pair is the ONE bridge**
(the exact tool-registry precedent, `register-plugin-tool.ts:9-12` — "zod stays the ONE representation
(D79), no second schema").

### 2.3 `projectJsonSchema` — `packages/kit/src/json-schema/index.ts:55-59`

zod→wire via zod v4 `z.toJSONSchema` + `additionalProperties:false` pinned on every object node. The
header's HONESTY constraints bind the design's claims (`:6-20`): the pin is grammar-level prevention ONLY
on a wire that compiles a grammar (vLLM/xgrammar); the OpenRouter structured vehicle is a FORCED TOOL CALL
that compiles no grammar (shape contract, salvage parse is the backstop; `WireTool` has no `strict` field);
zod v4 `z.object` parse is STRIP-mode, so post-parse validation tolerates junk keys by design. **Design
consequence: never claim "the model cannot emit an invalid schema" except on the vLLM wire; everywhere
else the lift belt is the enforcement and the honest sentence is "validated, retried once, refused typed."**

### 2.4 `scrubWireSchema` — the four-mode per-wire scrub, applied INSIDE backends (I-1, closed)

One position-aware walk engine (`packages/kit/src/json-schema/wire-subset.ts:1-40`), mode owned by each
request-build site:

- **OpenRouter hosted**: `"hosted-common"` — ALL bound keywords stripped (strictest common subset; the
  route can't know which vendor serves it); `oneOf` carried (`backends/openrouter/runners/chat/shared.ts:183-189`).
- **vLLM guided decoding**: `"guided-decoding"` — bounds/enum/required KEPT, xgrammar compiles them into
  the grammar; only annotations stripped (`vllm/engine/chat-completion.ts:42-48` `cleanJsonSchema`).
- **agent-sdk**: bounds off the wire, `oneOf` a typed refusal, `allOf`/`anyOf` pass (live-probed)
  (`backends/agent-sdk/output-schema.ts:5-19`).
- The doctrine line the design must carry into UX copy: **"bounds are never lost as VALIDATION — zod keeps
  them and every caller re-imposes them on the parsed reply"** (`wire-subset.ts:24-26`). A user schema's
  `minLength/minimum/maxItems` are therefore honest everywhere (post-parse zod belt) and grammar-enforced
  only on local vLLM.

### 2.5 The D126 admin knob — `structuredOutputShape` (AppSettings tier, LIVE)

`STRUCTURED_OUTPUT_SHAPES = ["as-projected","strict-compatible"]`, default `as-projected`
(`packages/contracts/src/settings/index.ts:281-286,317-318`); admin UI shipped
(`client/src/features/user-admin/components/structured-output-section.tsx`). The implemented consumption
pattern the design must copy: a mapped `Record<StructuredOutputShape, (schema) => ResponseFormat>`
resolved PER CALL (never captured at compose time) so an admin flip governs the next request —
`entry/compose/rpg.ts:134-145` is the exemplar (`strict-compatible` arm = `scrubWireSchema(schema,
"strict-compatible").schema` + `strict:true`). Board status: I-1 has NO open items
(`docs/retro-workboard.md:942-967`).

### 2.6 The `structured` provider ROLE (owner ruling 2026-07-27, split from summarize)

`infra/providers/roles/structured.ts:1-27`: one-shot schema-constrained generation; `responseFormat`
REQUIRED; batch-shaped like summarize; **backends: openrouter|vllm only — the metered sub is excluded**
(it reaches structured output only through the chat outputFormat path). Wired into domains at the compose
root (rpg's `extractViaStructured` precedent). `ResponseFormat.strict` semantics: absent = the backend's
own default; vLLM pins strict at its own call site regardless (`role-clients/index.ts:28-36`; I-1 close).

### 2.7 Nothing else in the loop pre-exists (absence receipts)

- **No stored user-schema table**: grep of `packages/db/src/schema/*.ts` for schema-carrying JSON/text
  columns returns none beyond typed config blobs (sweep this session; the only "schema" hits are
  `schemaVersion` counters).
- **No schema-authoring surface**: client sweep for `json.schema|jsonschema` finds ONLY the admin knob's
  select UI (`user-admin/components/structured-output-section.tsx`, `lib/structured-output-nav.ts`) —
  a picker, not an editor.
- Corroborated by the study's `refinery` sweep (ast-grep scannedFileCount=2029/2031 + literal grep, ts+tsx).
  Nothing to incorporate; nothing gets duplicated.

---

## 3. The design decision that falls out: there is nothing to BUILD at the engine tier

The extension's 1,100-LOC schema subsystem maps onto orb as: **generation = `structured` role (or
summarize+responseFormat) + `runStructuredTurn`; validation = `liftJsonSchema` (already built, already the
trust boundary for exactly this artifact class); auto-fix = the bounded retry carrying the lift's typed
refusal; provider limits = `scrubWireSchema` inside the backends; reply validation = the lifted zod.**
The new work is exclusively: a table, a handful of refinery verbs, prose/posture rows, and the client
authoring + rendering surface.

## 4. The orb-native design

### 4.1 Representation (ruled by §2.2, not open)

- **Stored + portable form**: a raw JSON Schema object in the liftable subset (what `liftJsonSchema`
  accepts), plus a `name` (ResponseFormat identifier grammar: keep the extension's
  `^[a-zA-Z_][a-zA-Z0-9_]*$`, `validate.ts:100`) and the NL description it was generated from.
- **Runtime form**: `liftJsonSchema(stored)` → zod, derived on every use, never persisted.
- **Wire form**: `projectJsonSchema(lifted)` → scrubbed per-wire inside the backend + shaped by the D126
  knob at the request-build site. One chain, golden-round-trip-proven.

### 4.2 Ownership + storage

- **Engine**: `@orb/kit/json-schema` — no changes required for v1 (see §5.4 for the one optional widening).
- **Verbs + storage**: `domain/refinery` (the study's F1 home; consumers live there). New table
  `refinery_schemas` following the `presets` row shape (`db/schema/preset.ts:27-68` — TypeID PK, ownerId
  FK cascade, name, JSON payload, schemaVersion, createdAt/updatedAt, owner index):
  `{id: refinery_schema_…, ownerId, name, description (the NL origin, editable), schema (JSON, liftable
  subset), stage (score|rewrite|analyze|any), createdAt, updatedAt}`.
- **Write-boundary belt**: EVERY write (create/update/import) runs `liftJsonSchema` + the refinery
  tightenings (§6) and refuses typed on failure — a stored schema is therefore liftable by invariant;
  reads still re-lift defensively (the parse-seam convention).

### 4.3 The F3 interplay — the design win, stated

Study fork F3 ruled refinery v1 payloads FIXED (typed contracts). This feature is the sanctioned
extension arm that makes that ruling both safe and extensible:

- Each stage config gains `payload: {kind:"fixed", mode} | {kind:"custom", schemaId}`.
- A custom SCORE schema must structurally include the well-known core — `overallScore: number` (checked
  at save time against the lifted zod's shape) — so `characters.refinery` stamping, the library sorts, and
  the dossier keep working under any custom schema. Custom analyze schemas must include
  `verdict: enum[ACCEPT, NEEDS_REFINEMENT, REGRESSION]` for the iterate loop's regression stop.
  A custom schema that omits the core is refused at save with copy naming the missing member.
- Custom REWRITE schemas are v1-excluded: the apply path depends on the typed
  `{fields:[{field,text}]}` contract (study §5.1); an arbitrary rewrite shape has no apply semantics.
  (Fork F-N3 if the owner wants it later.)

### 4.4 Verbs (all owner-gated, leak-free NOT\_FOUND belts per the generate-greeting precedent)

- `generateSchema {description, stage}` → draft (NOT persisted; the client holds the draft): builds the
  system prompt from the new prose slot, runs ONE structured call, validates via §4.5, returns
  `{schema, name, warnings}` — or, on double failure, the typed error INCLUDING the raw last reply (the
  extension's show-the-partial policy, reimplemented from `StructuredOutputError.raw` at this caller).
- `refineSchema {schema | schemaId, instruction}` → draft: same call with the CURRENT schema JSON + the
  NL instruction in the user prompt ("modify this schema: …"). One verb arm; the conversational loop is
  N calls, not a widened retry (§2.1 constraint).
- `testSchema {schema | schemaId, characterId}` → one score-stage run against the named owned card using
  the draft schema's ResponseFormat; returns the typed-per-schema payload for preview rendering. Does NOT
  write signals or runs (a drill, not a run).
- `createSchema/updateSchema/deleteSchema/listSchemas` — CRUD over `refinery_schemas` with the write belt.
- `runStage` (study §5.3) grows the `payload.kind:"custom"` arm: lift → `projectJsonSchema` → the D126
  mapped-Record shaping (rpg's `extractionResponseFormat` pattern, resolved per call) → the run; the
  validator handed to `runStructuredTurn` is the lifted zod.

### 4.5 The generation call's validator — the lift-refusal bridge

The `payloadSchema` handed to `runStructuredTurn` for `generateSchema`/`refineSchema` is:

- a loose envelope (`z.object({name: identifier-regex, schema: z.record(z.string(), z.unknown())})`)
- `.superRefine` that calls `liftJsonSchema(value.schema)` (+ §6 tightenings) and converts a
  `JsonSchemaLiftError` into a zod issue at the error's own JSON-pointer path with the construct-naming
  message (`lift.ts:46` — the message already tells the author exactly what subset to stay inside).

Effect: **the model's correction prompt on the bounded retry IS the lift's typed refusal** — "unsupported
JSON Schema construct "oneOf" at #/properties/verdict — the liftable subset is …". The extension's
auto-fix (silent mutation) becomes an honest ask-the-model-to-fix, and the final failure is a typed
refusal carrying the raw draft for hand-editing. No new validator is written; the trust boundary that
already guards plugin tool registration guards this artifact.

### 4.6 Model routing + wire posture

- **Vehicle**: the `structured` role (§2.6 — built for exactly "one-shot schema-constrained generation"),
  wired to refinery at the compose root like rpg's `extractViaStructured`. On vLLM the generation itself
  is grammar-locked (§5.1); on OpenRouter it is the forced-tool shape contract + salvage parse (§2.3
  honesty rule).
- **Fallback fork (F-N1)**: the structured role excludes the metered sub (§2.6). A deployment whose only
  backend is agent-sdk cannot reach it — the fallback is `summarize` + `SummarizeOptions.responseFormat`
  (the distill vehicle, `discovery/verbs/distill.ts:95,165`). Recommendation: structured-first with a
  composed summarize fallback, decided at the compose root by what `resolveRole` yields — never a silent
  in-verb downgrade (banned-silent-fork).
- **Posture**: new `schema_forge` side-gen kind (temp \~0.2, \~768 out) beside `distill`
  (`contracts/preset/index.ts:111-140`); the `SideGenKind` union + posture map are one coupled edit
  (`satisfies Record<SideGenKind, …>` makes a missing arm tsc-RED).
- **Prompt**: new PROSE-1 slot `refinery.schemaForge.system` (owner-signed baseline; seeded from the
  ESSENCE of `generate.ts:9-24` but rewritten for the orb wire: no `{name,strict,value}` wrapper, no
  "additionalProperties everywhere" instruction — the projection pins it and the lift accepts only the
  closed form; instead the baseline TEACHES the liftable subset, which is short and enumerable).

### 4.7 Client surface

- **Home**: the refinery stage config (CONTENT surface, study §5.4). Per stage: payload mode select
  (fixed modes | "Custom…") → the schema library (owner's saved schemas for that stage) → "New schema"
  opens the editor **modal** (the rail-kind rule: authoring dialogs are modals, `Core-Path-Registry.md:156`).
- **The editor is a FORM, not a textarea** — possible precisely because the artifact is subset-bounded:
  a field list (name · type · required · description · enum members · bounds · nested object/array
  drill-in), plus the NL panel: description box → Generate → the form populates → "Refine" instruction box
  → iterate → "Test on a card" (character picker → `testSchema` → the rendered preview) → Save.
  Raw-JSON paste/import is a secondary door surfacing the lift refusal verbatim (construct + path).
- **Schema-driven payload rendering**: one renderer component over the liftable subset —
  number (+bounds) → stat/bar, string enum → badge, array<string> → list, nested object → section —
  used by BOTH the test preview and custom-schema run output in the assay panel. This is the extension's
  `json-renderer` essence with the guesswork (`inferSchema`) deleted: the schema is known, typed, and
  bounded.
- **Honest-enforcement copy** (§2.4): the editor's bounds row carries "checked after the model replies;
  grammar-enforced on local models" — the implemented posture, surfaced instead of hidden.

## 5. The improvements that "make it fuck" (and their cost)

1. **Grammar-enforced schema-of-a-schema + refusal-driven repair.** The generation call is itself
   structured; its validator is the same trust boundary that guards plugin tools; the bounded retry's
   correction is a typed refusal naming construct and path. On vLLM, ride the optional depth-unrolled
   meta-schema of the liftable subset as the generation call's OWN `ResponseFormat` so xgrammar makes an
   out-of-subset draft UNREPRESENTABLE at the wire (`kit/json-schema/meta.ts`, derived from
   `LIFTABLE_JSON_SCHEMA`, \~80 lines + golden test). The extension generated raw text and hoped.
   Cost: the verbs (§4.4) + \~80 kit lines (optional arm); the engine is standing.
2. **Iterate-on-the-schema-in-dialogue.** `refineSchema` — "add a per-field severity enum" against the
   current draft, same belt, N times. The extension was one-shot into a textarea. Cost: one verb arm +
   one instruction box.
3. **Test-drive against a real card before saving.** `testSchema` runs the draft on an owned card and
   renders the typed result in the schema-driven renderer — the schema is proven against real model
   output, and its visualization previewed, before it ever governs a session. The extension could not
   validate replies against schemas at all (`parse.ts:49-61`). Cost: one verb + the renderer §4.7 already
   requires.
4. **(Standing bonus, no extra cost)** The saved artifact is a CONTRACT: the same stored subset is what
   tool-use already lifts for plugin tools (`register-plugin-tool.ts:68`), so a future "user schema backs
   a custom extraction/tool" consumes `refinery_schemas` through the same kit engine with zero new
   representation work. Named as a future consumer, not v1 scope.

## 6. Where the implemented shapes CONSTRAIN the design (explicit, handled)

| Implemented fact | Design consequence |
| - | - |
| `runStructuredTurn` retry budget is fixed at ONE (`structured-turn/index.ts:69-82`) | Convergence is verb-call-per-instruction (§4.4); no in-helper loop; the caller reimplements show-partial from `StructuredOutputError.raw` |
| Hosted wires strip ALL bounds (`shared.ts:183-186`); agent-sdk refuses `oneOf` typed (`output-schema.ts:13-18`) | User-schema bounds are POST-PARSE-enforced (zod belt) except on vLLM — surfaced in editor copy (§4.7). The lift cannot emit `oneOf` (only `anyOf`, `lift.ts:26-30`), so the agent-sdk refusal is unreachable from a stored schema — by construction, not by luck |
| The D126 knob resolves PER CALL via a mapped Record (`compose/rpg.ts:134-145`) | Refinery's custom-schema ResponseFormats ride the SAME mapped-Record pattern at refinery's compose seam; `strict-compatible` reshaping of user schemas comes free from the shared scrub |
| `structured` role: `responseFormat` required, openrouter\|vllm only (`roles/structured.ts:1-4`) | Fork F-N1 (§4.6): composed fallback to summarize+responseFormat; decided at compose, never silently in-verb |
| `projectJsonSchema`'s pin is advisory off-grammar wires; forced-tool is a shape contract (`json-schema/index.ts:6-20`) | No "cannot emit invalid" claims off vLLM; the lift belt is the universal enforcement; salvage-parse junk-key tolerance is accepted and observable, not fought |
| Lift refuses number enums, null types, tuples, open objects (`lift.ts:21-36,136-145,185-187,221-223`) | The extension's builtin schema corpus (score/quick-score/analyze — `defaults.ts:239-370`) lies ENTIRELY inside the subset (verified field-by-field: objects/arrays/strings/numbers/string-enum only) — so subset v1 loses nothing the source feature shipped. Widening (number enums, nullables) is fork F-N2, each widening owing the golden round-trip (`lift.ts:19`) |
| `liftJsonSchema` lifts guest `pattern` into `z.string().regex` (`lift.ts:105-111,117-123`) | Refinery's save belt REFUSES `pattern` v1 (a per-consumer tightening of the kit subset): an LLM-payload schema doesn't need regex, and a user pattern executed server-side against model output is a ReDoS surface the extension itself part-policed (`constants.ts:85-89`). security-executor confirms (§7) |

## 7. Security notes (route: security-executor, same pass as refinery R1)

- **User text reaches provider wires** inside ResponseFormat (property names, descriptions, enum members).
  Bounds: the save belt caps name lengths (identifier regex), description lengths, property count, enum
  count, and depth (tighter than the kit's 32 — e.g. 8) — contract-level `.superRefine` beside the lift.
- **ReDoS**: `pattern` refused v1 (§6).
- **Payload rendering**: the schema-driven renderer emits typed components only — model output under a
  custom schema is text-tier, never HTML.
- **Prompt injection**: the NL description and refine instructions are the OWNER'S own prompt input (the
  guidance trust tier); the card content in `testSchema` is untrusted as in every refinery run (study §6
  security block governs).
- **Existence oracles**: `testSchema`'s character read sits behind the ownership belt BEFORE any content
  verdict (the distill precedent, `distill.ts:136-141`).

## 8. Sequencing vs the study's R0-R4 (amended)

- **SF0** (rides R0): `refinery_schemas` table (baseline squash) + contracts (schema-row wire types, the
  stage-config `payload` union, the well-known-core refinements) + the save-belt tightenings. \~S.
- **SF1** (after R1's engine lands): `generateSchema`/`refineSchema`/`testSchema`/CRUD + the prose slot +
  `schema_forge` posture + the structured-role compose wiring + `runStage`'s custom arm. \~M.
- **SF2** (with/after R3): the editor modal + form + NL panel + schema-driven renderer + stage-config
  integration. \~M-L (client \~600-1,000 LOC + CTs).
- **SF3** (optional, anytime after SF1): the depth-unrolled meta-schema for grammar-locked generation on
  vLLML. \~S (\~80 kit lines + golden).

**Owner-veto forks:** F-N1 structured-role-first with composed summarize fallback (rec: yes) · F-N2 subset
widenings (number enums / nullables; each owes the golden round-trip; rec: defer until a real schema hits
the wall) · F-N3 custom rewrite payloads (rec: no — apply semantics are the fixed contract's) · the
`refinery.schemaForge.system` baseline text is owner-signed before ship (prose is owner-sacred) · whether
schema rows ride the portability bundle (the study flagged prose-override portability as UNVERIFIED; same
question, same answer, one lane).

## 9. Coverage

Re-read IN FULL this session (current tree): `kit/src/json-schema/index.ts`, `lift.ts`,
`wire-subset.ts` (header + modes), `server/src/kit/structured-turn/index.ts`,
`infra/providers/roles/structured.ts` (head), the three scrub call sites (context hunks), the D126 knob
(contracts/settings:277-318 + board I-1 §), `compose/rpg.ts` knob-consumption hunk,
`contracts/role-clients:14-38`, extension `schema/constants.ts` + the `events.ts:470-547` UX hunk.
Carried from the study's same-day reads: `generate.ts`/`validate.ts`/`auto-fix.ts`/`parse.ts`/
`generation.ts`/`defaults.ts` (whole files). NOT read: `wire-subset.ts` below line 40 (mode keyword tables
read via headers + call-site comments), `agent-sdk/output-schema.ts` full body, the preset-drawer's second
generate wiring beyond its call line, `structured-output-section.tsx` internals (confirmed a knob UI by
name + nav file only).

---

## 10. Shell-conformance audit (owner addendum #2 — the P5 surface + this design vs the REAL shell contract)

Charge: verify the Refinery design (study §5.4 + §4.7 above) against the shell's actual
LIST|CONTENT|CONTEXT contracts — not D62's sketch. All seams read in full this session; receipts below.
Where D62 and the shell's later law diverge, the conflict is named for the owner (§10.5).

### 10.1 The contracts as they actually are

- **`list` and `selection` are ONE type-forked decision** (`packages/client/src/state/section-registry.ts:98-115`):
  `SectionWithList` REQUIRES `selection: SectionSelection` — `{subscribe, hasSelection, clear}`
  (`:89-96`) — "a `list` without a `selection` does not type-check … that is what makes the rule
  un-opt-out-able" (`:98-102`). The seam publishes the section's EXISTING selection store, never a second
  home (`:86-88`).
- **Mobile never resolves a docked LIST except the list-as-screen arm** (`state/panel-resolve.ts:73-77`),
  and that arm fires only when `listIsScreen` — computed as `selection !== undefined && !hasSelection`
  (`state/section-list-projection.ts:27-32`). **The coordinator's premise is verified TRUE**: a section
  without a `selection` key can never resolve a docked LIST at mobile widths. Refinery TODAY declares
  neither `list` nor `selection` (`features/refinery/lib/refinery-section.tsx:9-32`), so `listIsScreen`
  is structurally false — that is exactly why its list is collapsed/overlay-only now.
- **The ONE-SHELL rule** (owner-ruled 2026-08-03, `panel-resolve.ts:48-57`): on a phone, a list-bearing
  section with nothing selected shows its LIST docked as THE SCREEN; a selection pushes CONTENT with the
  shell topbar carrying back; the user's own `"none"` (topbar toggle) still drops the roster to reach the
  no-selection CONTENT (the corpus/analytics dashboard arm).
- **The two reveal intents** (`state/shell-store.ts:288-324`): `revealContextPanel(tab?)` writes BOTH
  regime channels unconditionally — for a jump whose DESTINATION is the panel ("the sheet IS the
  navigation", the rpg Scene→Quests hop). `revealContextPanelBesideContent(tab)` (side-eye 2026-08-06 P1)
  skips `setOpenOverlayPanel` on mobile (`:318-324`) — for a drill whose body is ALREADY in CONTENT,
  because the mobile context sheet resolves overlay at 100dvw with CONTENT `inert` behind it: the
  self-occlusion defect. Mock ruling: "the CONTEXT arm folds into CONTENT on mobile — no third pane on a
  phone" (`:313-317`). Live exemplars: `preset-content.tsx`, `character-content.tsx`, `chat-header.tsx`,
  rpg band/tab (sweep this session).
- **`ContextDefinition`** (`lib/registry-contracts.ts:168-184`): `none | single | tabs`; `tabs` minted
  ONLY by `defineContextTabs<S>` (G3 wall, `:182`); every arm carries the empty copy; the band identity
  (`header`) is mint-supplied from the same `S` (`:193-196`).
- **The selection mint is sealed**: `createDrillSelectionStore` (G27 `selection-store-via-factory` —
  `state/create-drill-selection-store.ts:1-11`); `clear()` is the ONE door back and also releases an open
  slide-over (`:27-30`).
- **The X-7 defect class** (`docs/reviews/side-eye/2026-08-03-scoped-recheck.md:258-264`): the same
  heading + helper rendered in the CONTEXT inspector AND the CONTENT drill header AND the CONTENT picker
  heading, plus a dead no-action readout — the anti-echo bar every CONTEXT payload below is tested against.
- **The board's taste note** (`docs/retro-workboard.md:711-712`): "two CONTEXT arms now spend \~383px
  declining honestly — fine twice, worth noticing before a third joins." Bears directly on §10.3.

### 10.2 The selection-key decision (explicit, with the mobile arms)

**Refinery declares a sessions LIST ⇒ it MUST declare `selection` — and the design does:**
`state/refinery-selection-store.ts` minted via `createDrillSelectionStore` (G27), primary =
`RefinerySessionId`, no secondary (the STAGE is in-session UI state on the stepper, not a drill — the
back gesture must pop to the roster, never stage-by-stage). The section definition publishes the mint's
`{subscribe, hasSelection, clear}` as its `selection` seam; `useSelectionTitle` returns the open
session's name (character + session label), `null` ⇒ the shell prints "Refinery".

**This CHANGES the mobile resolution, deliberately.** Today: no seam ⇒ mobile refinery can never dock a
list. Under the design, refinery joins the one-shell rule, and the arms become:

| Regime | Resolution |
| - | - |
| Phone, no session open | the sessions roster IS the screen (docked, in flow, no scrim — `panel-resolve.ts:74-76`); topbar toggle (`"none"`) drops it to the pick-a-character CONTENT |
| Phone, session open | CONTENT (the pipeline surface) is the screen; the shell back affordance fires `selection.clear()` → roster again |
| Narrow desktop | LIST default `collapsed` auto-behaves as a closed slide-over; opens to overlay on demand (`:79-84`) |
| Wide desktop | `panelDefaults: {list: "collapsed"}` — D62's content-first hub, unchanged |

**Load-bearing consequence**: a first-run phone user lands on an EMPTY sessions roster — so the LIST
empty state must carry the start door ("Pick a character → Score it"), not a bare "no sessions" (the
empty-states-are-load-bearing posture). The planned-state marker (`content: {planned}`) is deleted in the
SAME edit that lands `list`+`selection`+`content` (G1's wall). The H3 `panels` arm is not needed — the
section gains real panes.

### 10.3 The CONTEXT-panel payload rule (anti-echo applied)

D62 fixed CONTENT's cargo: stage stepper · assay · issues · compare, plus guidance and field selection
(study §5.4). The rule this design adds, stated as law for the build lane:

> **Refinery CONTEXT carries the session's CROSS-RUN dimension — the ledger — never the current stage's
> payload.** Anything about the run you are looking at lives in CONTENT; anything about the runs you are
> NOT looking at, and the configuration in force across them, lives in CONTEXT.

Concretely: `kind: "tabs"` via `defineContextTabs<RefinerySessionState>` (G3), replacing today's
`{kind: "none"}`:

- **Runs** — the append-only run history, reactive to the selected session: per-run stage · iteration ·
  model · token cost · duration · verdict chip; tapping a run loads it into CONTENT's viewer (the
  extension's `viewingHistoryIndex` history navigation, re-homed to the panel that owns cross-run data).
- **Setup** — the in-force configuration snapshot: the active custom-schema chip (name + "Edit" → the
  §4.7 modal) · prose-override indicator · model/posture line · the original-card anchor link (snapshot
  precedent) · the token-fit line (study I4).
- Band identity (`header`): character avatar + session name — from the same `S` (P4, `registry-contracts.ts:193-196`).

**Anti-echo test, applied**: no Runs/Setup row reproduces a CONTENT heading or helper — CONTENT never
lists prior runs (it shows ONE payload at a time) and never restates the model/schema/posture config;
the stepper's stage names appear in CONTEXT only as row DATA (chips), never as heading+helper pairs.
No dead readouts: every row carries its action (load run · open editor · open snapshot) — the X-7
receipt's "0 scripts attached" no-action readout is the named anti-pattern. Empty arms per
`ContextEmptyArm` (`registry-contracts.ts:164-165`): session-with-zero-runs ⇒ "No runs yet — Run Score
to start" WITH the action; no-session ⇒ the mint's empty copy naming what appears on selection.

`panelDefaults: {context: "collapsed"}` is KEPT — D62's ruling was a default-MODE, not a kind (§10.5-2).

### 10.4 Reveal-intent picks per payload (the self-occlusion rule)

| Trigger | Payload home | Intent |
| - | - | - |
| CONTENT iteration chip / "view run N" | the run viewer swaps INTO CONTENT; the ledger is supplementary | `revealContextPanelBesideContent("runs")` — desktop docks the ledger beside the viewer; a phone does NOT get a sheet over the viewer it just opened |
| Topbar detail toggle · a menu's "Session setup" | the panel IS the destination | `revealContextPanel("setup")` — the sheet is the navigation, mobile included |
| Schema chip "Edit" · stage-config "New schema" | a MODAL (registry-paired) | neither intent — modals are viewport-safe by construction |

NL-schema surfaces re-checked against self-occlusion: the payload picker, editor form, NL panel and
test-preview all live in CONTENT or the modal; the only CONTEXT resident is the passive schema chip —
no addendum surface can occlude itself on coarse pointer.

### 10.5 D62-vs-shell conflicts, named for the owner (not silently picked)

1. **D62 "Refinery LIST … defaults collapsed" vs the one-shell rule (post-dates D62 by a month).** On
   mobile the sessions roster now leads over D62's pick-a-character CONTENT whenever sessions exist.
   Not a contradiction — a later owner ruling layered over an older sketch — but it changes what a phone
   user sees first. REC: accept (it is ONE rule across all seven measured list-bearing sections,
   `panel-resolve.ts:53-55`; opting refinery out would require sitting outside the sealed seam). The
   opt-out alternative — no LIST at all + `panels: {list: "unavailable"}` — keeps D62's letter and
   forfeits the session roster everywhere; not recommended.
2. **D62 "CONTEXT collapsed (compare/guidance live in CONTENT)" vs the board's taste note.** D62's cell
   rules a default MODE; it does not rule `kind:"none"`. Keeping the panel EMPTY would add the third
   \~383px honestly-declining CONTEXT arm the board flagged (`retro-workboard.md:711-712`). REC: the
   §10.3 ledger payload (unique cargo, default collapsed — D62's mode honored). This is the one
   D62-delta the owner signs.
3. **D62 "past refinery sessions per character".** The drill store has ONE primary; the design's LIST is
   the owner's sessions with the character as row identity/grouping — not a per-character sub-list.
   Minor letter-deviation, named here; the row's title carries the character name so the reading is the
   same.

### 10.6 Coverage (this audit)

Read IN FULL: `state/section-registry.ts`, `state/panel-resolve.ts`, `state/section-list-projection.ts`,
`features/refinery/lib/refinery-section.tsx` (study session), `create-drill-selection-store.ts:1-30`,
`shell-store.ts:274-338` (the reveal/overlay hunks), `registry-contracts.ts:160-198`, the X-7 receipt
(`side-eye/2026-08-03-scoped-recheck.md:256-264,322-325`), the board hunks (`retro-workboard.md:702-726,
813-827`). NOT read: `useShellLayout` itself (app-shell tier — its behavior is cited via the contracts'
own headers, which name it), the seven live section definitions beyond refinery's (their conformance is
the gates' business), `defineContextTabs`'s mint body below `registry-contracts.ts:250`.
