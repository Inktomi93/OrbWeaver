# Orbweaver — `preset`: generation config

> **Status: planning.** Target spec for the `preset` domain. The authoritative docs are
> `structure.md` (the constitution + enforcement ladder), `domains.md` (the cross-cutting
> partitioning rule), and `domains/connection.md` (which confirms the hard boundary: connection =
> selection, preset = generation config — never merged). This doc follows the 8-slot template
> from `structure.md §4` and names an enforcement tier for every boundary claimed.

---

## What this domain owns

**preset = generation config. NOT the connection.**

A preset is a library of **`PromptConfig` blobs** — the user's authored, reorderable generation
configuration:

- **sections** — the reorderable prompt-section array (`chat_history` as the pivot, markers
  `main_prompt`/`post_history`/etc., each with optional template override)
- **params** — the provider-agnostic `UserIntent` generation knob snapshot (quality/effort/
  sampling/compaction — one vocab, no runner names)
- **regexScripts** — per-preset script attachments (the preset scope junction of the regex
  library)
- **variables** — per-preset ChoiceBlock variables for macro substitution
- **customParameters** — BYO request-body overrides for compatible backends
- **namesBehavior** — how name-stamps are emitted for this preset
- **continuePostfix** — the continuation suffix
- **formatStrings** — display/render format overrides
- **guidedActions** — the 6 guided-steering action definitions (the steers + their placement)
- **postProcess** — post-receive and post-assemble string transforms

**Two row kinds:**
- **owner-scoped presets** — `ownerId IS NOT NULL`, user's library, unlimited count.
- **system default** — exactly ONE row with `ownerId IS NULL`. `SYSTEM_DEFAULT_PRESET_ID` is
  the NIL TypeID (`preset_00000000000000000000000000`), a sentinel that satisfies the branded
  `typeIdSchema('preset_')` constraint. **Never change this to a human-readable string** — every
  request boundary validates the prefix, and equality checks (COW guard, remove guard, seed
  check) all pivot on this constant simultaneously.

**Schema:** one `presets` table — `id` (PresetId TypeID PK), `ownerId` (nullable FK →
`users.id` RESTRICT), `name`, `kind` (free-text label), `config` (JSON `PromptConfig` blob),
`schemaVersion` (mirrors `config.schemaVersion`), `createdAt`, `updatedAt`. Owner index. No FK
from `chats` or `messages` (neo dropped this in its migration 0002; orbweaver's `0000_baseline`
never adds it — past-turn provenance lives on `message_variants.params`, a `UserIntent` snapshot
(D26), not a preset FK).

**Preset is NOT the connection.** The user's `{api, source, model}` selection is `connection`'s
concern. A preset that "saves a connection" is a misuse — the partitioning rule in `domains.md`
is the gate.

---

## 8-slot layout

```
domain/preset/
├── index.ts                 FRONT DOOR — re-exports PresetService, SYSTEM_DEFAULT_PRESET_ID,
│                            ensureSystemDefaultPreset, error types. The only legal external import.
├── service.ts               COMPOSITION ROOT — wires all 6 verbs + injected cross-feature deps.
│                            Zero logic. Produces PresetService.
├── context.ts               DI BUNDLE — { db, logAudit, newId } (wired at entry/). No imports
│                            from other domain front doors (db-kit primitives only).
├── contract/
│   ├── service.ts           PresetService interface — 6 verbs (the "what this feature does" doc)
│   ├── params.ts            CreatePresetParams, UpdatePresetParams
│   ├── views.ts             PresetDetail (full config), PresetSummary (list row — id/name/kind/dates)
│   └── errors.ts            PresetNotFoundError, PresetOperationError
│                            (extend from @orb/kit base errors — no _shared drawer)
├── verbs/
│   ├── create.ts            createPreset(ctx, params) — writes row + audit log
│   ├── list.ts              listPresets(ctx) — owner's presets + system default row
│   ├── get.ts               getPreset(ctx, id) — readable preset by id (owner OR system default)
│   ├── update.ts            updatePreset(ctx, id, params) — see COW note (§ esoteric)
│   ├── remove.ts            removePreset(ctx, id) — guards system default, cascades safe
│   └── reset-to-default.ts  resetToDefault(ctx, id) — replaces config with DEFAULT_PROMPT_CONFIG
├── persistence/
│   └── queries.ts           readablePreset (the owner||system-default two-armed query),
│                            insertPreset, updatePresetRow, deletePreset. DB-layer only, no logic.
└── substrate/               (empty at launch — no pure helpers needed; add if lift chain
                             or config migration logic grows beyond boot/seed)
```

**Named subsystems:** none. Preset has no internal subsystem beyond the boot seeder —
`seed.ts` (boot-time `ensureSystemDefaultPreset`) lives at the domain root, not in a subsystem
folder. If guided-actions resolution moves server-side (see §movement), it would land in
`substrate/guided.ts`.

---

## Public surface (`domain/preset/index.ts`)

```ts
createPresetService(db: Db): PresetService
SYSTEM_DEFAULT_PRESET_ID: PresetId
ensureSystemDefaultPreset(db: Db): Promise<void>
PresetNotFoundError
PresetOperationError
// re-exports via contract/:
PresetService            // the interface
PresetDetail
PresetSummary
CreatePresetParams
UpdatePresetParams
```

---

## Cross-boundary types that leave this domain

These live in `@orb/contracts`, not in `shared/prompt/` (see §movement):

| Type | Contract home | Consumer direction |
|---|---|---|
| `PromptConfig` | `contracts/preset/config.ts` | server (assembly, seed, chat), client (preset editor) |
| `UserIntent` + `userIntentSchema` + `generationKnobSchemas` | `contracts/preset/intent.ts` | server (runners, assembly), client (form validation) |
| `PresetFormValues` + `presetFormValuesSchema` | `contracts/preset/form.ts` | server (tRPC input validation), client (preset editor form) |
| `GuidedActionsConfig` + `GuidedActionKind` union | `contracts/preset/guided.ts` | server (assembly, config), client (guided panel) |
| `CustomParameters` + `customParametersSchema` | `contracts/preset/custom-parameters.ts` | server (runners), client (form) |
| `StDroppedField`, `StImportResult`, `NeoPresetFile` | `contracts/preset/serde.ts` | client (import toolbar), tests |

---

## Movement table

Every row names its **enforcement tier** — the earliest tier that goes RED on violation.

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `domain/preset/` (6 verbs, contract, persistence) | **stays domain feature** | `server/domain/preset/` | Clean 8-slot template compliance; CRUD over one table, one owner, correct abstraction fit | resolve-time (package dep — `@orb/server` owns `domain/`) |
| `shared/prompt/prompt-config.ts` — `PromptConfig` schema + `DEFAULT_PROMPT_CONFIG` + `CONFIG_LIFTS` (v1→v2→v3) lift chain | **→ `contracts`** | `@orb/contracts/preset/config.ts` | Cross-boundary wire type consumed by server (assembly, seed) AND client (editor). The lift chain must co-locate with the schema it evolves — move together as one unit | resolve-time (undeclared dep between packages fails the resolver) |
| `shared/prompt/intent.ts` — `UserIntent`, `userIntentSchema`, `generationKnobSchemas` | **→ `contracts`** | `@orb/contracts/preset/intent.ts` | Cross-boundary wire type + the shared numeric-bounds object (the one source that prevents client/server bound-drift — §7.4 of the fanout brief). Both server (runners, assembly) and client (form) import it. `generationKnobSchemas` must stay co-located with `userIntentSchema` — one bounds source, no split | resolve-time (package dep) |
| `shared/prompt/preset-schema.ts` — `PresetFormValues`, `presetFormValuesSchema`, `toPresetFormValues`/`toPromptConfig` mappers | **→ `contracts`** | `@orb/contracts/preset/form.ts` | The flat form ↔ PromptConfig pair is a cross-boundary wire shape consumed by 14 client files AND the tRPC input validator. Belongs in `contracts` not `shared/prompt`. The bidirectional mapper (200-line manual field map) is a maintenance tax. **DEFERRED (crisp criterion):** eliminate `PresetFormValues` + the mapper and bind the nested `PromptConfig` shape directly via TanStack Form's nested-path binding; keep the flat shape + mapper ONLY for a field TanStack cannot bind (e.g. an array-of-objects the lib flattens). **Decision criterion** = does TanStack bind every nested `PromptConfig` path the 14 editor files touch — if yes, delete the mapper. The shape lands in `contracts/preset/form.ts` either way. | resolve-time (package dep) + compile-time (if mapper is eliminated, remove sites fail `tsc`) |
| `shared/prompt/st-preset.ts` — `importStChatCompletionPreset`, `StImportResult`, `StDroppedField` | **→ `contracts`** | `@orb/contracts/preset/serde.ts` | A pure serde adapter with zero server consumers (client-only: preset-crud-toolbar). The emit/read pair shape (§7.3 of the fanout brief) confirms it belongs in `contracts`. `StDroppedField`/`StImportResult` are co-located output types — move together | resolve-time (package dep) |
| `shared/prompt/preset-file.ts` — `buildNeoPresetFile`/`parseNeoPresetFile`, `NeoPresetFile` | **→ `contracts`** | `@orb/contracts/preset/serde.ts` | Same rationale as ST importer: one client consumer, a pure codec pair, the envelope type is cross-boundary. **Load-bearing detail:** `parseNeoPresetFile` uses strict schema validation (NOT the lenient `parsePromptConfig` fallback) — this distinction must survive the move and be explicitly preserved in the new location | resolve-time (package dep) |
| `shared/prompt/guided-actions.ts` — `GuidedActionsConfig` schema + `GuidedAction` union + `DEFAULT_GUIDED_ACTIONS` | **→ `contracts`** | `@orb/contracts/preset/guided.ts` | Schema/config/defaults are a cross-boundary wire type (server assembly + tRPC router + client panel all consume it). **The preset is the ONE home (D33)** — guided actions are NOT an AppSettings tier; resolution is `activePreset.guidedActions ?? DEFAULT_GUIDED_ACTIONS` at the consumer (no settings-side projection). | resolve-time (package dep) |
| `shared/prompt/guided-actions.ts` — `resolveGuidedInstruction` (the macro-call + ZWSP neutralization) | **→ `kit`** | `@orb/kit/guided` | Pure function of `MacroContext` with zero I/O; called by chat assembly server-side. Kit is the correct home for pure cross-boundary transform functions with multiple consumers. **Load-bearing detail:** `neutralizeMacros` inserts U+200B BETWEEN the `{{` braces (not before/after the pair) — verified against the macro parser's `indexOf('{{')` scan. This specific ZWSP placement is the defense against macro re-injection from untrusted `{{input}}`; any change to the escaping strategy re-opens the attack. Document this invariant explicitly at the move site | resolve-time (package dep) + compile-time (neutralizeMacros must remain typed; a string-replace rewrite would lose the type signal) |
| `shared/prompt/macro/` — the macro engine (`parseMacros`, `evaluateMacros`, `createDefaultRegistry`, `globalMacroRegistry`, `processMacros`, `createMacroContext`) | **→ `kit`** | `@orb/kit/macro` | Pure, zero-I/O, zero-domain; two call sites (server assemble + client render) — the textbook `kit` engine case, confirmed by `structure.md §2`. `globalMacroRegistry` is a module-level singleton — the `SINGLE-TENANT ASSUMPTION` comment must become an explicit kit-level design invariant: registry creation is per-module (acceptable for this single-process deployment); test isolation requires single-worker execution for macro tests | resolve-time (package dep — `kit` has zero domain deps; any domain type in the engine is illegal) |
| `shared/prompt/post-process.ts` — `collapseNewlines`, `trimTrailingWhitespace`, `dropIncompleteSentence`, `collapseToSingleLine`, `applyReceivePostProcess`, `applyAssemblePostProcess` | **→ `server/kit`** | `@orb/server/kit/post-process` | Pure, zero-I/O, server-only (two server consumers: assembly + pipeline; zero client consumers). `@orb/kit` (isomorphic) would require zero-runtime-dep — these are pure string transforms, so they *could* be isomorphic, but their only consumers are server-side. Server kit is the right home. NOT `@orb/contracts` (no type, no schema — pure logic) | resolve-time (server kit cannot be imported by `@orb/kit` or `@orb/contracts` — package deps enforce the direction) |
| `shared/prompt/custom-parameters.ts` — `customParametersSchema` | **→ `contracts`** | `@orb/contracts/preset/custom-parameters.ts` | Cross-boundary wire type; the schema is the boundary guard for user-supplied request overrides and is needed by both the form and the server runner. The prototype-pollution `superRefine` (the Layer 1 guard) must travel with the schema — it is the schema's enforcement, not a separate concern | resolve-time (package dep) |
| `shared/prompt/custom-parameters.ts` — `deepMergeRequestBody` (the runtime defense / Layer 2 guard) | **→ `server/kit`** | `@orb/server/kit/custom-parameters` | Server-only (three runner consumers: openrouter, vllm, custom-openai; zero client consumers). Pure function + the runtime forbidden-key check. The Layer 2 guard re-checks `__proto__`/`constructor`/`prototype` even if schema parse was skipped — the comment "Layer 2 is the ACTUAL defense" is load-bearing; do NOT remove the forbidden-key check from `deepMergeRequestBody` when relocating | resolve-time (package dep) + compile-time (`deepMergeRequestBody` signature stays typed; a re-implementation loses the layer-1/layer-2 commentary that documents why both exist) |
| `shared/prompt/prompt-assemble-types.ts` — `AssembleContext`, `AssembleCharacter`, `AssemblePersona`, `AssembleWorldEntry`, `ChatInjection`, `AssembledPrompt`, `AssembleTrace`, `SectionPreview` | **→ `contracts` (chat cluster)** | `@orb/contracts/chat/assemble.ts` | These are chat-assembly contract types, not preset types. They describe the ASSEMBLE-stage contract (§7.4 of the fanout brief), are referenced by `db/schema/chat.ts` (promptSnapshot column) and 10 chat domain files — stranded in `shared/prompt` by accident. Preset owns no assembly type | resolve-time (package dep) |
| `shared/prompt/prompt-macros.ts` — `PROMPT_MACROS` catalog (`PromptMacroDef[]`) | **→ `contracts`** | `@orb/contracts/preset/macros.ts` | A cross-boundary catalog: the server registers these macros AND the client displays them for autocomplete. The invariant "when you add a macro, add it here" is cross-boundary — belongs in `contracts` where both sides can import it. The future server linter confirming every registered macro has a catalog entry also imports from `contracts` | resolve-time (package dep) |
| `db/schema/preset.ts` — the `presets` table definition | **stays in `@orb/db`** | `@orb/db/schema/preset.ts` | A DB schema lives in the `db` package. No change | resolve-time (package dep) |
| `domain/preset/constants.ts` — `SYSTEM_DEFAULT_PRESET_ID` | **stays domain, exported via front door** | `domain/preset/constants.ts` → re-exported from `domain/preset/index.ts` | The NIL TypeID sentinel is domain-internal (the COW guard, remove guard, seed comparison all live in this domain). External callers receive it through the front door. No need to promote to `contracts` — no client needs this sentinel | compile-time (the TypeID brand type enforces `typeIdSchema('preset_')` at every boundary) |

---

## Spine thread intersections

**§7.1 (identity / auth):** `update.ts`'s COW guard checks `presetId === SYSTEM_DEFAULT_PRESET_ID`
before allowing mutation. Ownership is `ownerId === ctx.userId` (the simple case — no `host|member`
roster check needed; presets have one owner). No change needed from the identity/auth rework.

**§7.2 (settings / config):** `PromptConfig.params` carries the `UserIntent` generation knob
snapshot. The env tier (`maxOutputTokens`/`maxContextTokens`/compaction) sets per-env ceilings;
the preset is the user-facing level; the runner translates. The preset is NOT a settings tier — it
is a user library row, versioned by `schemaVersion` with a lift chain.

**§7.3 (serialization / serde):** The ST importer (`importStChatCompletionPreset`) and the
neo-preset file codec (`buildNeoPresetFile`/`parseNeoPresetFile`) are the preset-slice strandings
identified in §7.3. Both are client-only serde adapters that land in `contracts/preset/serde.ts`.
The neo-preset `parseNeoPresetFile` deliberately uses strict parse (not lenient `parsePromptConfig`
fallback) — this is a named design choice that must be documented at the move site.

**§7.4 (types & schemas):** `PresetFormValues`/`presetFormValuesSchema` are the textbook inline-
type leak from the fanout brief's `inlineTypes` list — exported from `shared/prompt/preset-schema.ts`
but should live in `contracts`. `generationKnobSchemas` is the one shared numeric-bounds object
(the fix for the historic bound-drift bug; must not be split from `userIntentSchema`).

**§7.5 (string-union dispatch):** `guidedAction` is flagged in the dispatch-scout as 23 touch-count
with 14 redecls + 4 untyped `Record`s and no exhaustiveness backstop. In orbweaver: one importable
`GuidedActionKind` union (the canonical name used in the cross-boundary types table above; neo/the
steady clone calls it `GuidedAction`) in `contracts/preset/guided.ts`; the dispatch table is a
`GUIDED_ACTION_IMPLS: { [K in GuidedActionKind]: Impl<K> }` mapped-type Record so a missing action
is a `tsc` error. The untyped `Record`s become RED at compile time.

---

## Esoteric / load-bearing details

1. **`SYSTEM_DEFAULT_PRESET_ID` = NIL TypeID.** The sentinel is `preset_00000000000000000000000000`
   (all-zero base32) — chosen because it satisfies `typeIdSchema('preset_')`. A human-readable
   string (`'system-default'`) would be rejected at every request boundary. The seed insert,
   equality guards in `update.ts`/`remove.ts`, and the boot reseed comparison all pivot on this
   one constant simultaneously. Cannot change without updating all four sites atomically.

2. **COW-on-system-default is a designed UX, not an error path.** `update.ts` detects
   `presetId === SYSTEM_DEFAULT_PRESET_ID`, creates a new owned preset with the submitted config,
   and returns the new id. The client (`onSuccess`) must detect the id change and navigate to the
   fork. If the COW branch is removed, users editing the system default lose their changes silently
   (no error, just a no-op).

3. **Boot reseed is `schemaVersion`-gated.** `seed.ts` compares the row's `schemaVersion` against
   `DEFAULT_PROMPT_CONFIG.schemaVersion`. Version bump = forced reseed on next boot, overwriting
   whatever is in the system default row. A direct DB edit that changes `config.schemaVersion`
   without bumping it in `DEFAULT_PROMPT_CONFIG` (or vice versa) causes the next boot to silently
   overwrite admin field tweaks. The version bump is the only reseed trigger.

4. **`params: userIntentSchema.catch({}).default({})` in `promptConfigSchema`.** The `.catch({})`
   is load-bearing. Without it, a single unknown/renamed field in the `params` blob fails the outer
   parse and degrades the ENTIRE preset to `DEFAULT_PROMPT_CONFIG` — silently losing the user's
   sections, regex scripts, and variables. The `.catch({})` bounds the damage to just `params`.
   Do not remove for "cleanliness."

5. **CONFIG_LIFTS v1→v2 carries three load-bearing transforms** (all in `shared/prompt/prompt-config.ts`):
   (a) merges the old `'jailbreak'` marker's content into `post_history`'s template;
   (b) converts the literal `'main'` section to a `main_prompt` marker;
   (c) inserts a `chat_history` pivot ONLY when `post_history` exists — no spurious pivot for
   configs without post-history. Simplifying the lift or dropping the `post_history` guard breaks
   configs that have no post-history section (they gain a pivot that routes all history out of the
   prompt).

6. **`neutralizeMacros` in `resolveGuidedInstruction` uses U+200B BETWEEN `{{` braces** — not
   before/after the pair. Earlier implementations placed ZWSP outside the pair; the macro parser's
   `indexOf('{{')` scan still found the intact token, making the defense a no-op. The between-placement
   is verified correct. Any change to this escaping strategy (HTML entities, backslash, external ZWSP)
   re-opens the macro re-injection attack from untrusted `{{input}}`.

7. **`globalMacroRegistry` is a module-level singleton** (currently at `shared/prompt/macro/index.ts:31`).
   When moved to `@orb/kit/macro`, the SINGLE-TENANT ASSUMPTION must be documented as a kit-level
   design invariant: handlers are already pure (register is additive); the risk is per-request mutation.
   Vitest must run macro tests in a single worker (or with module isolation) to prevent custom-macro
   leakage between parallel test workers.

8. **Two prototype-pollution defense layers in `custom-parameters`.** Layer 1: `customParametersSchema`
   `superRefine` strips `__proto__` and rejects `constructor`/`prototype` at every nested level. Layer 2:
   `deepMergeRequestBody` re-checks all three at the merge boundary even if parse was skipped. Both
   layers must survive the separation (schema → `contracts`, merge → `server/kit`). The comment "Layer 2
   is the ACTUAL defense" (a caller bypassing schema still hits the runtime check) is load-bearing
   documentation.
