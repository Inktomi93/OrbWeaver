# User-macro INPUT-VALUE DELIVERY — implementation blueprint

> **Status: design-complete spec (2026-07-27).** Executes the MU-wave follow-on the exec flagged BLOCKED:
> the kit half (`packages/kit/src/macro/user-macros.ts`) is built; this spec delivers the values bag, the
> per-turn registry, and the draw-record persistence through a REAL turn — swipe/variant-safe by
> construction. A builder executes this top to bottom; §7 flags the ONE owner fork (the values-store home)
> — everything else is decided here and is NOT blocked on that ruling.

## 0. The invariants this design is built around (verified against the code)

- **Swipe replays the identical draw; a new turn draws fresh.** Kit already separates FROZEN draws
  (replayed byte-exact via `frozenDraws`) from FRESH draws (reported back in
  `ResolvedUserMacroInputs.draws`) — `resolveUserMacroInputs`, user-macros.ts:151-183. The server's job is
  (a) persist the draws at commit, (b) read them back on the swipe/continue path, (c) thread them in as
  `frozenDraws`.
- **All draws happen at REGISTRY-BUILD time, not during evaluation.** The server threading resolves inputs
  ONCE per turn (`RegisterUserMacrosOptions.inputBindings` — "resolves once per turn with the frozen
  draws"). Unlike the `opLog` (mutated during evaluation, spliced per speaker at engine.ts:489), the draw
  record is immutable for the whole round — a group round's speakers share one record, each committed
  variant persists the same record, no per-speaker clearing.
- **`registerUserMacros` forbids the singleton** (per-render `createDefaultRegistry()` + handler
  closures). The process-wide `globalMacroRegistry` (kit/macro/engine.ts:35) is the DEFAULT at every
  render seam (`processMacros`/`createMacroContext` default params) — so an UNTHREADED path stays
  byte-identical automatically, and an unknown `{{myMacro}}` on an unthreaded path is a byte-identical
  passthrough (evaluator.ts:136 — unknown macro renders verbatim), never an eaten token.
- **`AssembleContext` stays serializable.** It is a `@orb/contracts/chat` shape the client imports; the
  registry (closures) NEVER rides it. It may carry the serializable draw RECORD (it already carries the
  serializable `opLog` by the same argument), but this design keeps the registry AND the draws off it —
  both ride `TurnPrep` (domain contract, server-only) instead, keeping the contracts shape untouched.
- **Freeze-at-commit / one row atom.** Draws persist in the same atomic batch as the variant
  (`variantPayloadOf` → `insertCanonMessageStatements`/`appendVariantStatements`), exactly like
  `variableDelta` (engine.ts:213). `MessageView` is NOT extended — draws are a generation-record column
  (the `promptSnapshot`/`params` class), not a display field.

---

## 1. Seam 2 — draw-record persistence (DB + contracts + read-parse + read-back + drain)

### 1.1 The decision: a NEW `message_variants.macro_draws` column (not a fold into an existing blob)

Argued against the alternatives:

| Option | Verdict |
| - | - |
| **New `message_variants.macro_draws` column** | **CHOSEN.** The draws are generation-record data (the inputs this generation was produced under) — exactly the D26 class `promptSnapshot`/`params`/`variableDelta` live in. Typed `$type<>` column + a zod read-parse schema = born-compliant (D-ledger typing law); per-variant means the record travels WITH the generation that used it and the swipe write re-persists the (identical) replayed record — self-describing, no join back to variant 0. |
| Fold into `message_variants.variable_delta` | REJECTED — op-log-shaped (`readonly VarOp[]`, parsed by `variableDeltaSchema`); overloading it breaks the parse boundary and the `foldChain` runtime-variable machinery that folds it. |
| Fold into `message_variants.metadata` | REJECTED — the open `Record<string, unknown>` sidecar; no typed read seam, invisible to the schema, exactly the "loose blob" the born-compliant law exists to prevent. |
| A `messages`-level column | REJECTED — `messages` is the SLOT (attribution only; "NO characterId/authorUserId — attribution is the SLOT's" applies inversely here: generation inputs are the VARIANT's). Also a slot column can't distinguish "which generation first drew" without convention. |

Per-variant + copy-forward semantics: variant 0 records its fresh draws; every appended variant (swipe)
records the effective draws it USED = frozen(replayed) ∪ fresh(new inputs added to the preset since).
Reading always targets the slot's SELECTED variant — one rule, no idx-0 special case.

**Pre-launch schema change ⇒ SQUASH into `0000_baseline.sql`** (regen via drizzle-kit + biome-format the
meta — the `db-structure` gate does NOT catch a forgotten squash). Orchestrator note: baseline regen is a
whole-tree generator — never run it while other lanes hold uncommitted work (shared-tree rule).

### 1.2 Contracts schema — `packages/contracts/src/chat/messages.ts`

Home beside `variableDeltaSchema`/`toolCallRecordSchema` (the established read-parse boundary for
`message_variants` JSON blobs — queries.ts:107 documents the pattern):

```ts
/** The per-turn user-macro random-pick draw record (MU delivery) — the read-parse boundary for
 *  `message_variants.macro_draws`: macro name → input name → the drawn option value. Written at turn
 *  commit (frozen ∪ fresh); the swipe/continue path replays it as `frozenDraws` so a re-generation of
 *  the same slot resolves the IDENTICAL draw. Absent/null ⇒ the turn drew nothing. */
export const userMacroDrawsSchema = z.record(z.string(), z.record(z.string(), z.string()));
export type UserMacroDraws = z.infer<typeof userMacroDrawsSchema>;
```

Export both from `packages/contracts/src/chat/index.ts` (beside `variableDeltaSchema`). Rationale for
contracts/chat over contracts/preset: the shape's ONE consumer relationship is the `message_variants`
column read/write seam (chat wire), and the ledger's read-parse precedent homes column schemas beside the
column's other blob schemas. (`UserMacroValues` stays in contracts/preset — it is authoring-plane
vocabulary; the two shapes are different concepts: picks vs draws.)

### 1.3 DB column — `packages/db/src/schema/chat.ts` (`messageVariants`, after `variableDelta` ~line 316)

```ts
// MU user-macro delivery — the per-turn random-pick draw record (macro → input → drawn value). Written
// at commit in the same batch as the variant; the swipe/continue path replays it byte-exact
// (`frozenDraws`) so a re-generation of this slot resolves the identical draw. Nullable JSON, parsed at
// the read seam with `userMacroDrawsSchema` (never cast); absent/null ⇒ this turn drew nothing.
macroDraws: text("macro_draws", { mode: "json" }).$type<UserMacroDraws>(),
```

(`UserMacroDraws` imported from `@orb/contracts/chat` — contracts ← db, cake-legal.) Then: baseline
squash + meta format per §1.1.

### 1.4 Write path — `packages/server/src/domain/chat/persistence/canon-write.ts`

The variant-payload interface (the `variableDelta?: readonly VarOp[] | null | undefined` sibling at :59)
gains:

```ts
readonly macroDraws?: UserMacroDraws | null | undefined;
```

and BOTH insert sites that spell the variant columns (`:158` and `:296` — the
`insertCanonMessageStatements` and `appendVariantStatements` arms) gain
`macroDraws: args.variant.macroDraws ?? null` / `macroDraws: params.variant.macroDraws ?? null`.
`continueVariantStatements` spreads the same payload — a continue re-writes the identical replayed
record (self-healing no-op; verify it does not clobber to null when the caller threads frozen draws —
it won't, because the continue prep carries the replayed record per §3.4).

### 1.5 Read-back channel — `packages/server/src/domain/chat/persistence/queries.ts`

`loadSlotTarget` (:512) is ALREADY the one read both swipe and continue run pre-turn (slot ⋈ selected
variant). Extend `slotTargetSelection` with `macroDraws: messageVariants.macroDraws` and the `SlotTarget`
row mapping with a safeParse:

```ts
// In the row → SlotTarget projection (mirror the variableDelta safeParse degrade at :694):
const parsedDraws = userMacroDrawsSchema.safeParse(row.macroDraws);
// SlotTarget gains:  readonly macroDraws: UserMacroDraws | null;   (null on absent OR malformed — degrade, never throw)
```

No new query — the existing choke point carries it (reuse-seam rule: the write end (§1.4) and the read
end (§1.5) are both specced; the pin test in §5 proves them against each other).

### 1.6 Commit DRAIN point — `packages/server/src/domain/chat/engine/engine.ts`

`variantPayloadOf` (:186-216), directly beside the `variableDelta` drain (:213):

```ts
variableDelta: [...(prep.assembleContext.opLog ?? [])],
// MU delivery — the turn's user-macro draw record (frozen ∪ fresh), resolved ONCE at registry build
// (verbs/turn.ts) and immutable for the round: every speaker's variant persists the same record, and a
// swipe of any of them replays it. Unlike the op-log there is nothing to splice per speaker.
macroDraws: prep.userMacroDraws ?? null,
```

`TurnPrep` (domain `contract/results.ts`) gains the field (§3.5). No change to `commitGeneration`'s
opLog-splice — the draw record is deliberately NOT cleared between speakers (see §0).

---

## 2. Seam 3 — the per-turn `MacroRegistry` threading

### 2.1 The decision (verified against the code): explicit `registry` params, defaulting to the singleton — built ONCE per turn in `buildTurnContext`, riding `TurnPrep`, NEVER on `AssembleContext`

The exec's recommendation survives verification, with two refinements found in the code:

1. **The build site is `verbs/turn.ts::buildTurnContext`, not `buildAssembleContext`.** The registry
   needs `foreign.promptConfig.userMacros` + the values bag + the frozen draws + `deps.prng` — all
   present in `buildTurnContext` — AND it must outlive assembly to reach `runTurnPipeline`
   (pipeline.ts:338 `buildPrompt(ctx.promptConfig, ctx)` renders the SECTION WALK per speaker) and the
   engine's receive-side `buildTurnMacroContext` (pipeline.ts:218). Building inside
   `buildAssembleContext` would force a return-shape change on the serializable producer; building in
   `buildTurnContext` lets the registry ride the existing `BuiltTurnContext`/`TurnBase`/`TurnPrep`
   plumbing that already threads `memoryRecall`/`chatBehavior` the same way.
2. **The `assemble.ts` module-level volatile-name cache must become per-registry** (:26-34
   `volatileMacroReCache` memoizes `globalMacroRegistry.volatileNames()` ONCE per process). A random-pick
   user macro is `volatile:true` (kit derives it); the D51 static-cache-buster scan must see the TURN
   registry's names or a volatile user macro in a static section silently never busts the cache.

Rejected alternatives: registry on `AssembleContext` (banned — client-imported serializable contract
shape); a module-level "current registry" slot (concurrency-unsafe across interleaved turns); a
`WeakMap<AssembleContext, MacroRegistry>` side-channel (implicit magic, invisible to the type system —
exactly what the explicit-DI doctrine exists to prevent).

### 2.2 The one new module — `packages/server/src/domain/chat/assembly/user-macros.ts`

```ts
import type { MacroRegistry, RejectedUserMacro, UserMacroDef } from "@orb/kit/macro";
import { createDefaultRegistry, createVolatileOnlyRegistry, registerUserMacros, resolveUserMacroInputs } from "@orb/kit/macro";
import type { UserMacroValues } from "@orb/contracts/preset";
import type { UserMacroDraws } from "@orb/contracts/chat";

export interface BuildTurnUserMacrosArgs {
  /** The active preset's authored defs (`foreign.promptConfig.userMacros`). */
  readonly defs: readonly UserMacroDef[];
  /** Source attribution for the macro browser metadata ({ kind: "preset", id: <resolved preset id> }). */
  readonly sourceId: string;
  /** The per-chat/per-user picks bag (§7 fork owns the store; `{}` until it lands — fully functional:
   *  unpicked inputs resolve their per-kind defaults, random-pick pools fall back to ALL options). */
  readonly values: UserMacroValues;
  /** The slot's persisted draw record on a swipe/continue turn (loadSlotTarget.macroDraws) — replayed
   *  byte-exact; absent ⇒ a fresh-draw turn. */
  readonly frozenDraws?: UserMacroDraws | undefined;
  /** The turn PRNG (deps.prng) — fresh draws ride it; NEVER ambient entropy. */
  readonly prng: () => number;
}

export interface TurnUserMacros {
  /** The per-turn render registry: createDefaultRegistry() + the accepted defs. */
  readonly registry: MacroRegistry;
  /** The per-turn FREEZE registry: createVolatileOnlyRegistry() + the same defs/bindings — the SEND
   *  volatile bake + greeting freeze resolve user macros in composer/greeting text with the SAME
   *  bindings the section walk sees (one resolution per turn, so both splice identical values). */
  readonly freezeRegistry: MacroRegistry;
  /** The EFFECTIVE draw record for the turn (frozen ∪ fresh) — what the engine persists (§1.6). */
  readonly draws: UserMacroDraws;
  /** Refused defs (name collision / bad name) — logged loud at turn time (D53 posture); the authoring
   *  surface (preset editor macro-browser) is the primary error UI and already renders these. */
  readonly rejected: readonly RejectedUserMacro[];
}

/** Build the per-turn user-macro registry pair + the draw record. Returns null when `defs` is empty —
 *  the byte-identical fast path: callers thread nothing, every render seam falls back to the process
 *  singletons, zero per-turn allocation. */
export function buildTurnUserMacros(args: BuildTurnUserMacrosArgs): TurnUserMacros | null;
```

Implementation notes for the builder:
- Resolve inputs ONCE: for each def, `resolveUserMacroInputs(def.inputs, args.values[def.name] ?? {},
  { prng, frozenDraws: args.frozenDraws?.[def.name] })`; accumulate
  `inputBindings[def.name] = bindings` and `draws[def.name] = { ...frozen-used, ...fresh }` — the
  persisted record is the EFFECTIVE record (replayed entries included), so a swipe-of-a-swipe reads one
  self-contained record. Only record entries for random-pick inputs (kit's `draws` output + the frozen
  entries actually consumed); an empty per-macro record is omitted.
- Register the SAME defs with the SAME `inputBindings` onto both registries
  (`registerUserMacros(createDefaultRegistry(), defs, { source: { kind: "preset", id: sourceId }, inputBindings })`
  and again onto `createVolatileOnlyRegistry()`). Two `registerUserMacros` calls, one input resolution.
- Determinism: defs iterate in authored order, inputs in declared order — the prng consumption order is
  stable (matches the document-order draw invariant).
- Mirror test: `tests/server/domain/chat/assembly/user-macros.test.ts` (§5).

### 2.3 Kit change (one, small) — `resolveGuidedInstruction` registry param

`@orb/kit/guided` calls `processMacros` internally with the default registry, so a guided template
referencing a user macro would passthrough. Add to its trailing options object:
`readonly registry?: MacroRegistry` and thread it as `processMacros(text, opts, registry ?? globalMacroRegistry)`
(kit-internal import, no new dep). Every existing caller is untouched (optional field).

### 2.4 Exact signature changes — the threading (all defaults = the current singleton ⇒ every untouched caller is byte-identical)

**`assembly/macros.ts`**
```ts
export function renderMacros(text: string, ctx: AssembleContext, persona: AssemblePersona | null | undefined,
  original?: string, registry: MacroRegistry = globalMacroRegistry): string;          // + processMacros(text, opts, registry)

export function freezeVolatileMacros(text: string, ctx: AssembleContext,
  args?: { readonly random?: (() => number) | undefined;
           readonly registry?: MacroRegistry | undefined }): string;                   // registry ?? VOLATILE_ONLY_REGISTRY

export function resolveGuidedActionText(ctx: AssembleContext, args: { …existing…;
  readonly registry?: MacroRegistry | undefined }): string;                            // → resolveGuidedInstruction(…, { …, registry })

export function buildTurnMacroContext(args: { …existing…;
  readonly registry?: MacroRegistry | undefined }): MacroContext;                      // → createMacroContext(opts, args.registry ?? globalMacroRegistry)
```

**`assembly/assemble.ts`**
- `interface BuildEnv` gains `readonly registry: MacroRegistry;` — every `renderMacros(...)` call that has
  `env` in scope passes `env.registry` as the 5th arg.
- The env-less helpers gain an explicit param: `renderMemberField(field, member, ctx, registry)`,
  `resolveScopeFallback(field, ctx, activeValue, registry)`, `renderCoSpeakers(ctx, registry)`,
  `computeOriginals(config, ctx, registry)`.
- `export function assemblePrompt(rawConfig: PromptConfig, ctx: AssembleContext, registry: MacroRegistry = globalMacroRegistry): AssembledPrompt`
  — constructs `BuildEnv` with it.
- `export function previewSection(section: PromptSection, ctx: AssembleContext, config: PromptConfig, registry: MacroRegistry = globalMacroRegistry): SectionPreview`.
- **Volatile-scan fix:** replace the module `volatileMacroReCache` with
  `const volatileReByRegistry = new WeakMap<MacroRegistry, RegExp>()` and
  `volatileMacroRe(registry: MacroRegistry)`; `findVolatileMacros(text, registry)`;
  `scanStaticBusters(section, ctx, busters, registry)` reads `env.registry`. (The WeakMap keeps the
  global's memoization AND gives each per-turn registry one compile; per-turn registries are GC'd with
  the turn.)

**`assembly/context.ts`**
- `interface BuildAssembleContextInput` gains
  `readonly macroRegistry?: MacroRegistry | undefined;` and
  `readonly freezeMacroRegistry?: MacroRegistry | undefined;`
- Inside `buildAssembleContext`: `const reg = input.macroRegistry ?? globalMacroRegistry;` threaded to
  EVERY render call in the file — `wrapWiFormat`, `classifyWiEntry` (via `WiConvEnv`, add
  `readonly registry`), `resolveGuidedSteer` → `resolveGuidedActionText(base, { …, registry: reg })`,
  `activePersonaDepthCandidate`, `anchorPersonaCardCandidate`, `characterDepthNoteCandidates`,
  `roomAuthorsNoteCandidate` (thread a param down, same pattern as `assemble.ts`'s helpers), both
  `buildTurnMacroContext` calls (:676, :723), and the SEND freeze (:668) →
  `freezeVolatileMacros(input.pendingUserText, base, { random: input.prng, registry: input.freezeMacroRegistry })`.

**`substrate/assemble-gather.ts`** — `gatherAssembleContext` args gain
`readonly macroRegistry?: MacroRegistry | undefined; readonly freezeMacroRegistry?: MacroRegistry | undefined;`
threaded verbatim into `buildAssembleContext`'s input. (`substrate/assembly-access.ts` re-exports via
`Parameters<>` — no edit.)

**`verbs/turn.ts`**
- `buildTurnContext` args gain `readonly frozenUserMacroDraws?: UserMacroDraws | undefined;`. Body, after
  `resolveForeignInputs`:
  ```ts
  const userMacros = buildTurnUserMacros({
    defs: foreign.promptConfig.userMacros,
    sourceId: foreign.presetId ?? "default",          // §2.5
    values: {},                                        // ← the §7 store lands here (W5)
    frozenDraws: args.frozenUserMacroDraws,
    prng: deps.prng,
  });
  ```
  threads `macroRegistry: userMacros?.registry` / `freezeMacroRegistry: userMacros?.freezeRegistry` into
  `gatherAssembleContext`, logs `userMacros?.rejected` (non-empty ⇒ `getLog().warn` — D53 loud-degrade),
  and returns them on `BuiltTurnContext`:
  ```ts
  interface BuiltTurnContext { …existing…;
    readonly macroRegistry: MacroRegistry | undefined;
    readonly userMacroDraws: UserMacroDraws | undefined; }
  ```
- `resolveTurnBase` args gain `readonly frozenUserMacroDraws?: UserMacroDraws | undefined;` (threaded
  through); `TurnBase` gains the same two fields as `BuiltTurnContext`.
- `createSwipe` / `createContinueTurn`: after `loadSlotTarget`, pass
  `frozenUserMacroDraws: target.macroDraws ?? undefined` into `resolveTurnBase`.
- EVERY generating prep (send's `RoundBase`, swipe, continue, impersonate, generate, force, drain, auto)
  gains `...(macroRegistry !== undefined ? { macroRegistry } : {})` and
  `...(userMacroDraws !== undefined ? { userMacroDraws } : {})` — the `memoryRecall` spread pattern.
- `freezeGreetingVolatiles(ctx, deps, assembleContext, priorCanon, freezeRegistry?)` — the send path
  passes the turn's freeze registry so a greeting referencing a user macro bakes with the turn's
  bindings/draws.

**`contract/results.ts`** — `TurnPrep` gains:
```ts
/** The per-turn user-macro registry (MU delivery) — closures, server-only, NEVER on the serializable
 *  AssembleContext. Absent ⇒ the preset authored no user macros ⇒ every render seam falls back to the
 *  process singleton (byte-identical). */
readonly macroRegistry?: MacroRegistry | undefined;
/** The turn's effective draw record (frozen ∪ fresh) — persisted onto every committed variant (§1.6). */
readonly userMacroDraws?: UserMacroDraws | undefined;
```
(`RoundBase = Parameters<typeof driveRoundVia>[0]["base"]` — round.ts's base type inherits these; verify
`driveRoundVia` spreads the base onto each speaker prep, which it does today for
`assembleContext`/`memoryRecall`.)

**`engine/engine.ts`** — `runTurnPipeline({ …, macroRegistry: prep.macroRegistry, … })`; the §1.6 drain.

**`engine/pipeline.ts`** — `RunTurnPipelineArgs` gains
`readonly macroRegistry?: MacroRegistry | undefined;`; `buildPrompt(ctx.promptConfig, ctx, args.macroRegistry ?? globalMacroRegistry)`
(:338); the AI_OUTPUT/REASONING `buildTurnMacroContext` (:218) gains `registry: args.macroRegistry`.

**`verbs/read.ts` (previews)** — `previewAssembly`/`peekPrompt`/`previewSection` build a PREVIEW registry:
`buildTurnUserMacros({ defs, sourceId, values, prng: () => 0 })` (no frozenDraws; the fixed prng gives the
stable first-pool-element resolution — the "preview never varies per poll" precedent already used by
`gatherAssembleContext`'s absent-prng arm). Draws are DISCARDED (previews persist nothing). Thread the
registry into the preview's `gatherAssembleContext`/`previewSection` calls.

**Deliberately NOT threaded (unknown-macro passthrough is the honest degrade, documented in each header):**
`verbs/edit.ts:190` (edited-row regex re-run), `verbs/extract-quiet.ts`, quiet-generate/compaction,
memory builds, `domain/automation/substrate/macro-render.ts`. None of these render preset sections; a
user-macro token there stays verbatim.

### 2.5 One `ForeignInputs` addition this seam DOES need: `presetId`

`MacroSourceRef` requires the preset id (`{ kind: "preset", id }` — kit/macro/types.ts:83) and
`ForeignInputs.promptConfig` is id-less. Add to `ForeignInputs`:

```ts
/** The RESOLVED preset id `promptConfig` came from (override > host default), or null when the system
 *  DEFAULT_PROMPT_CONFIG stood in — user-macro source attribution (MacroSourceRef) reads it. */
readonly presetId?: PresetId | null | undefined;
```

and have the compose resolver (`entry/compose/chat.ts::resolveForeignInputs`) return the id
`resolvePromptConfigWithOverride` resolved (thread it out of that helper — it currently returns only the
config; change its return to `{ config, presetId }` and fix its two callers).

---

## 3. Seam 1 — the values bag (`UserMacroValues`) threading

The CONSUMPTION seam is §2.2's `values` param — identical regardless of where the picks live, which is
why waves 1–4 are unblocked. The bag's semantics with `values: {}` are fully functional (per-kind
defaults; random-pick pool = ALL options), so the load-bearing swipe-replay invariant ships and is
testable BEFORE any store exists.

**The STORE home is the one genuine owner fork (§7).** The two arms, both fully specced so the ruling is
one line:

**Arm A — per-chat store (RECOMMENDED).** Exact parity with the ChoiceBlock-variables plane, which is the
same product concept (preset-declared typed knobs, user-picked per room, consumed at assembly):
- `chats.userMacroValues: text("user_macro_values", { mode: "json" }).$type<UserMacroValues>()` — the
  `variableValues` sibling (db/schema/chat.ts:138; baseline squash again).
- Verb `setUserMacroValues` — member-gated, mirrors `createSetVariables`
  (verbs/chat-lifecycle.ts:234-235): validate with `userMacroValuesSchema`, flush the column, emit
  `chatUpdated`. Read verb: fold into the existing variables/detail read the client already polls
  (`getVariables`/ChatDetail — builder's choice, mirror `getStoredVariables`).
- Gather read: `gatherAssembleContext` loads it beside `loadStoredVariables` (new
  `loadStoredUserMacroValues(db, chatId)` in persistence/queries.ts) — **but note** the registry is built
  in `buildTurnContext` (§2.1) BEFORE gather. So under Arm A the load moves UP: `buildTurnContext` does
  the one-row read itself (or `loadRoom`'s chat read carries it). Chat-internal — `ForeignInputs` is NOT
  touched; the exec's Seam-1 field is NOT landed (a dead optional contract field fails the liveness
  lens).
- New tRPC proc ⇒ the router sweep classification (PROBED/EXEMPT) must be updated — a new proc without a
  classification is gate-red.

**Arm B — per-user settings store (the exec's traced seam, literal reading).** A
`UserSettings.macros.inputValues: UserMacroValues` arm (settings schema + `USER_SETTINGS_SCHEMA_VERSION`
bump per the versioned-config-lift rule), resolved in compose `resolveForeignInputs` from
`loadUserSettings(runAsUserId)` and delivered as:
```ts
/** The host's per-user user-macro input picks — absent ⇒ {} (defaults posture; byte-identical). */
readonly userMacroValues?: UserMacroValues | undefined;   // on ForeignInputs
```
`buildTurnContext` then sources `values: foreign.userMacroValues ?? {}`. Simpler plumbing; global-per-user
picks (same pick in every room), host-plane only (a member's picks never apply — the turn resolves under
`runAsUserId`).

Why Arm A is recommended: ChoiceBlock picks are already per-chat room state (`chats.variableValues`,
`setVariables`) and the two knob families will share one client pane; a per-user-global bag cannot express
"this room's tone is grim, that one's comedic" — the entire point of a select-family input. The
FOREIGN-inputs framing in the exec trace fits Arm B only; under Arm A the read is chat-owned and FOREIGN
would be a wrong-home (chat reads its own `chats` row — the `variableValues` precedent).

---

## 4. Interaction audit (what else the per-turn registry touches — all verified)

- **D51 cache honesty**: automatic once §2.4's volatile-scan reads the turn registry — a static section
  referencing a volatile user macro lands in `trace.staticCacheBusters`.
- **Group rounds**: one registry + one draw record per round, shared by reference on the base prep;
  per-speaker `shapeContextForSpeaker` never re-renders inputs. Each speaker's variant persists the same
  record (§0).
- **Swipe of a pre-feature slot**: `macroDraws` null ⇒ `frozenDraws` undefined ⇒ fresh draws (honest —
  there is no record to replay), recorded on the new variant; subsequent swipes of THAT slot replay the
  selected variant's record. `selectVariant` needs NO change — selecting an older variant selects its own
  persisted record, and the next swipe replays whatever the then-selected variant recorded.
- **Continue**: replays via §2.4 (`frozenUserMacroDraws` from `loadSlotTarget`) — the extension's prompt
  prefix carries the SAME drawn values the original generation saw (cache-stable + coherent);
  `continueVariantStatements` re-writes the identical record.
- **SEND freeze / greeting freeze**: the freeze registry (§2.2) bakes a composer-typed or
  greeting-embedded user macro at commit with the turn's bindings — the same freeze-at-commit class as
  `{{roll}}`. Un-threaded paths leave the token verbatim (passthrough, never eaten).
- **Rejected defs at turn time**: log-warn only (D53); the authoring UI (macro-browser) is the error
  surface. No `AssembleTrace` extension (that shape has three coupled literal producers — not worth the
  blast radius for a log-visible condition).
- **Client**: zero changes in W1–W4. `AssembleContext`/`MessageView` untouched; the client macro-browser
  already builds its own per-render registry.
- **`sourceId` fallback `"default"`**: when the system `DEFAULT_PROMPT_CONFIG` stands in, `userMacros`
  is `[]` (contracts default) ⇒ `buildTurnUserMacros` returns null ⇒ the label is unreachable in
  practice; it exists only for a hand-built config.

---

## 5. Test plan (exhaustive posture; central mirror layout `tests/<pkg>/<path>`)

**THE LOAD-BEARING PIN — swipe replays the identical draw through the REAL assembly + persistence path.**
`tests/server/domain/chat/verbs/turn.int.test.ts` (extend the existing turn int suite; real db factory,
fake `runChatTurn` capturing the built `TurnRequest`):
1. Preset with a user macro `{{mood}}` = one `random-pick` input (options a/b/c/d), referenced from an
   enabled literal section. `send` with a seeded prng pinned to draw a known option.
   - assert the captured `request.prompt` (static/dynamic) contains the drawn value (registry reached the
     REAL section walk);
   - assert the committed assistant variant's `macro_draws` row = `{ mood: { <input>: <drawn> } }`
     (read raw via db, parsed via `userMacroDrawsSchema`).
2. `swipe` that slot with a DIFFERENT prng seed (one that would draw another option if consulted):
   - assert the new request's prompt contains the ORIGINAL drawn value (replay, prng not consulted);
   - assert the appended variant persists the identical `macro_draws`.
3. A NEW `send` afterwards draws FRESH (different seed ⇒ different value in prompt + record).
4. `continueTurn` on the slot: prompt carries the original value; the variant's record survives.
5. Pre-feature slot (variant with `macro_draws` null): swipe draws fresh and records.

**Unit/contract, per touched module:**
- `tests/server/domain/chat/assembly/user-macros.test.ts` — builder: null on empty defs; bindings for all
  four kinds; frozen∪fresh union; rejected propagation; both registries carry the defs; prng consumption
  order stable; only random-pick entries recorded.
- `tests/server/domain/chat/assembly/assemble.test.ts` (extend) — `assemblePrompt` with a per-turn
  registry renders the macro in a section; volatile user macro in a STATIC section lands in
  `staticCacheBusters` (the WeakMap scan); default-registry call byte-identical to today (regression pin).
- `tests/server/domain/chat/assembly/context.test.ts` / macros tests (extend) — WI entry content +
  guided template + authors-note render through the threaded registry; SEND freeze bakes a volatile user
  macro in composer text via the freeze registry.
- `tests/server/domain/chat/engine/pipeline.test.ts` (extend) — `macroRegistry` arg reaches
  `buildPrompt`; absent arg ⇒ byte-identical assembled output.
- `tests/server/domain/chat/persistence/…` (extend canon-write/queries suites) — write→read round-trip of
  `macroDraws`; malformed blob degrades to null (safeParse), never throws; `loadSlotTarget` projection.
- `tests/contracts/chat/messages.contract.test.ts` (extend) — `userMacroDrawsSchema` accepts the nested
  record, rejects non-string leaves; assignability pin `UserMacroDraws` ↔ kit's per-macro
  `Record<string, string>` draw shape.
- Kit (extend existing user-macros tests) — none needed for delivery itself (kit is built); add the
  `resolveGuidedInstruction` registry-param test in `tests/kit/guided/index.test.ts`.
- W5 (post-ruling, Arm A): `setUserMacroValues` verb tests (validation, member gate, chatUpdated emit,
  cross-tenant refusal) + the sweep classification.

---

## 6. Build-wave breakdown (executor order; each wave lands green with its tests; scoped verification per lane doctrine)

- **W1 — contracts + db + persistence (Seam 2 substrate).** §1.2 schema, §1.3 column + **baseline
  squash** (coordinate with the orchestrator — quiesced tree), §1.4 write path, §1.5 read-back.
  Inert: nothing writes a non-null record yet. Tests: contracts + persistence round-trip.
- **W2 — the registry seam (Seam 3, inert).** §2.2 builder module, §2.3 kit guided param, §2.4 signature
  threading through macros/assemble/context/gather/pipeline + `TurnPrep` fields + the volatile-scan
  WeakMap. NO producer sets a registry yet ⇒ every path defaults to the singletons ⇒ byte-identical
  (pin this with the regression tests). Tests: builder + assemble/context/pipeline extensions.
- **W3 — wire the turn (delivery live).** §2.4 `verbs/turn.ts` changes (build per turn, thread registry +
  draws onto every prep, swipe/continue frozen-draw read-back, greeting-freeze registry), §1.6 engine
  drain, §2.5 `presetId` on ForeignInputs + compose. Tests: THE PIN (§5 items 1–5).
- **W4 — previews.** `verbs/read.ts` preview registry (stable-prng posture). Tests: preview renders the
  macro, poll-stable.
- **W5 — the values store (PARKED on the §7 ruling).** Arm A or B per ruling; verb/settings + client pane
  wiring; sweep classification for any new proc. Until then `values: {}` ships defaults-posture delivery.

---

## 7. Owner forks

1. **F1 — the values-bag STORE home (blocks W5 only).** Arm A per-chat `chats.user_macro_values` +
   `setUserMacroValues` (RECOMMENDED — ChoiceBlock parity, per-room expressiveness, one client pane) vs
   Arm B per-user `UserSettings.macros.inputValues` riding `ForeignInputs.userMacroValues` (the exec's
   literal Seam-1 trace). §3 has both fully specced. NOTE: under Arm A the exec-traced
   `ForeignInputs.userMacroValues` field is deliberately NOT landed (dead contract field); flagging this
   divergence from the trace is why it's a fork and not a silent choice.
2. **(Resolved in-spec, flag-for-awareness)** Composer/greeting text resolves user macros at
   freeze-at-commit via the per-turn freeze registry (§2.2 `freezeRegistry`) — i.e., ALL user macros in
   USER-authored text bake at send (the resolved-at-write class), while identity macros stay raw. If the
   owner prefers user macros to be section/template-only, drop the `freezeRegistry` arm from §2.2/§2.4
   (three call sites) — everything else stands.

---

## OWNER RULING (2026-07-27) — F1 RESOLVED: **Arm A (per-chat)**

The values-bag store home is **per-chat** — user-macro input values live in `chats.variableValues`
(member-gated `setVariables`), reusing the existing ChoiceBlock-picks store for the identical
"per-turn user-picked value" concept. Do NOT land the `ForeignInputs.userMacroValues` field (Arm B) —
it would be a dead contract field. Build against Arm A. (Owner: "yes option A".)
