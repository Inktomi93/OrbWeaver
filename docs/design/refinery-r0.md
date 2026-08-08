---
kind: design
status: active
updated: 2026-08-08
---

# Refinery R0 — contracts + db foundation (FORGE lane, 2026-08-08)

> **Status: BUILT (this lane, branch `wt/agent-refinery-r0`, base `94394e611`).** R0 of the owner-signed
> Card-Refinery port ([port study](../reviews/stickler/2026-08-08-card-refinery-port-study.md) §6;
> [NL→schema addendum](../reviews/stickler/2026-08-08-card-refinery-nl-schema-design.md)). Owner forks,
> signed 2026-08-08 and NOT re-litigated here: **F1** new `domain/refinery` · **F2** summarize-role v1 ·
> **F3** fixed typed payloads (NL→schema = the later extension arm) · **F4** stage-mode enums ·
> **F5** card-fields-only v1. **R0 stops at contracts + db** — R1 (the engine: verbs, prompts, producers)
> is gated behind a mandatory security-executor pass because it is the untrusted-card→LLM→write-back
> surface.

## 1. Premise re-verification (the scaffold, re-laddered on base `94394e611`)

Every study claim this design builds on, re-verified on THIS lane's tree (the study read a dirty
2026-08-07/08 working tree):

| Scaffold piece | Verdict | Receipt |
| - | - | - |
| `refinerySignalsSchema {score, analysis}` + card `refinery` field, absent from create/update | LIVE | `packages/contracts/src/character/index.ts:63-67,142-143,152` |
| `characters.refinery` JSON column | LIVE | `packages/db/src/schema/character.ts:128-129`; `0000_baseline.sql:146` |
| Defensive read parse (`.nullable().catch(null)`) | LIVE | `domain/character/persistence/queries.ts:29,371` |
| Zero producers (every writer stamps/preserves null) | CONFIRMED | `create.ts:75` · `group-character.ts:47` · `card-merge.ts:44,48` · `serde/card/index.ts:302`; repo sweep this lane (`rg refinery` over packages+tests, all hits enumerated) |
| Two null-guarded client readouts | LIVE | `character-overview-card.tsx:89-90`; `character-provenance-section.tsx:38-42` |
| `DiffView` sealed PREBUILT\[for:refinery/compare]; `CompareBlocks` | LIVE | `packages/ui/src/diff/diff.tsx:1-2`; compare-blocks primitive dir |
| Section slot registered DECLARED-PLANNED | LIVE | `features/refinery/lib/refinery-section.tsx:9-32`; `SECTION_IDS` (`state/shell-store.ts:44`) |
| No refinery sessions store / no refinery schema files / no domain dir | CONFIRMED ABSENT | schema dir listing + the sweep (two methods) |

No premise died. R0 is NOT nearly-already-scaffolded at the contracts/db tier: the scaffold is one
contract shape + one column + readouts. The tables, the typed payloads, the enums, and the id brands are
genuinely new — exactly the study's R0.

## 2. R0 scope (exact)

**Adds:**

1. `@orb/kit/ids` — `refinerySession`/`refineryRun` prefixes + `RefinerySessionId`/`RefineryRunId` brands.
2. `packages/contracts/src/refinery/index.ts` — the refinery contracts namespace (new): stages, verdicts,
   session statuses, F4 mode enums, F5 refinable-field enum + selection, the kind-tagged per-stage payload
   config (the SF-arm seam), the three F3 typed stage payloads, the run view (discriminated on stage), the
   session summary view, the per-stage payload-schema Record (the §7.5 dispatch home).
3. `contracts/character` — the study's I1 tightening IN PLACE: `refinerySignalsSchema.analysis` becomes
   the typed analyze payload (nullable), imported from `#refinery`. `score` unchanged.
4. `packages/db/src/schema/refinery.ts` — `refinery_sessions` + `refinery_runs` (+ barrel row, alphabetical).
5. `scripts/check/gates/db-structure.ts` — a `BASELINE_RIDER_PRODUCERS` entry
   `refinery → packages/server/src/domain/refinery` (the gate's DESIGNED pre-producer mechanism; the crew/
   automation/rpg/roster-preset precedent). **R1 removes it**; the gate auto-flags it stale the moment the
   domain dir lands.
6. Regenerated `0000_baseline.sql` (regime-1 squash per Tier-1-DB) + biome-formatted meta.
7. Tests: `tests/contracts/refinery/index.contract.test.ts` (presence-gated) +
   `tests/db/schema/refinery.int.test.ts` (house bar: all 23 sibling schema files have one) + the two
   stale coupled fixtures updated (`tests/contracts/character/index.contract.test.ts:60`,
   `tests/db/schema/character.int.test.ts:22,72`).

**Deliberately NOT in R0** (each with its owner):

- `refinery_schemas` table + the stage-config custom arm → **SF0** (owner F3: fixed payloads v1; the
  dispatch brief: "SF-arm concern, later, unless R0 needs its skeleton" — it does not; the kind-tag IS the
  skeleton, §4.3).
- `domain/refinery/` (verbs, prompts, substrate, injected ops, transport router) → **R1**, security-gated.
- Prose slots + `refine_*` side-gen postures → **R1** (the study's own sequencing puts them in the server
  leg; they touch `SideGenKind` coupled sites that belong with their consumer).
- Sorts/dossier/workload kind → **R4**. Client surface → **R3**.

## 3. Deviations from the study sketch (law + source-corpus receipts; report-not-ask territory)

1. **`refinery_sessions` carries NO `ownerId` column.** The study's §5.2 sketch says "ownerId FK cascade
   (D23 single-owner)" — but D23's actual test rules the opposite: a row whose owner is reachable through
   ONE required FK to owned canon **DERIVES** ownership; "only TRUE PRODUCERS (the user's authored
   artifact with no owned anchor) stamp `ownerId`" (`Core-Path-Registry.md:59`). A refinery session is
   anchored by `characterId NOT NULL → characters(ownerId)` — the same DERIVE class as `gallery_items`,
   `imagery_generations`, `character_sprites`, `proposals` (all D23-enumerated). The D-ledger outranks a
   review doc. Consequence for R1: ownership gating is the join-through-character `persistence/` pattern
   (`ensureCharacterOwned` precedent), not `fetchOwned` on the session table; F7's cascade
   (character delete → sessions → runs) comes free.
2. **`refinerySignalsSchema` keeps its home in `contracts/character`; only `analysis` tightens.** The
   study's §5.1 lists the signals tightening under the refinery namespace. Moving the schema would force
   `character → refinery → character` module edges (the card schema and the signal schema reference each
   other's namespaces) or a 3-file importer re-point for nothing: the signals object is a CARD field (like
   `depthPrompt`), while the ANALYZE PAYLOAD is a pipeline shape. One-home reads: each schema lives with
   its owner; `character` imports the payload from `#refinery` exactly as it imports `#regex`/`#theme`/
   `#world-info` today. The refinery namespace imports NOTHING from `#character` (cycle-proof by
   construction; the `REFINABLE_FIELDS ⊆ card fields` pin lives in the contract test, which may import both).
3. **One payload schema per stage, across all F4 modes.** The extension shipped a structurally different
   QUICK-score schema (no `fieldScores`, top-level `strengths[]`/`weaknesses[]` —
   `card-refinery/src/data/settings/defaults.ts:292-326`). The study's §5.1 types exactly three payloads
   and F4 maps modes to "shipped prompt variants" — so modes are PROMPT-tier, the payload contract is
   fixed per stage (F3's letter). Quick modes produce the full shape under a terse prompt; the
   provider-side schema enforcement fills it. This kills mode-forked rendering/stamping arms in R3/R1.

**Spec completions** (the study's sketch under-specified; completed from the extension source corpus):

- Per-field score entries carry `strengths`/`weaknesses`/`suggestions` as **strings**, not arrays
  (`defaults.ts:255-273` is the source schema).
- Scores are the extension's **1-10 scale** (`defaults.ts:65`, "Rate … 1-10"; soul check `:178`) —
  `z.number().min(1).max(10)`, non-int (overall is a weighted average). Post-parse zod belt everywhere;
  grammar-enforced on vLLM (the projection honesty rule, NL-design §2.3).
- **`greetingIndex`** (optional, int ≥ 0) on score `fieldScores[]` and rewrite `fields[]` entries — the
  study's P3 demands per-greeting granularity end-to-end (selection → prompt → rewrite → apply); orb
  greetings are ONE index-addressable array (`contracts/character:83-95`), so the payload entries need the
  index or a multi-greeting rewrite is unapplicable. Kept FLAT (optional field + documented invariant
  "present ⇔ field === greetings", enforced at R1's apply belt) rather than a per-entry discriminated
  union: nested unions degrade structured-output reliability on small local models
  (plan-for-small-hardware posture) and complicate the per-wire scrubs for zero contract value — the one
  consumer (apply) is the honest enforcement point.
- **Rewrite text caps at 100 000** — the card `TEXT_MAX` twin (`contracts/character:17`). Load-bearing:
  applied rewrites flow into `character.update`, whose fields cap there; an uncapped payload would make
  R1's apply partial. (Pinned behaviorally in the contract test; the constant is not exported and the
  import direction forbids reaching it.)
- **Session `stageConfig` + run `payloadConfig` columns** (the study's table sketch omits both; F4 was
  unsigned when it was written). The session stores the in-force per-stage config; each append-only run
  snapshots the config arm that produced it (the extension's history entries embedded their config; D62
  §10.3's CONTEXT "Setup" tab renders the in-force snapshot). Both are the **kind-tagged single-arm
  union** `{kind:"fixed", mode}` — SF0 adds `{kind:"custom", schemaId}` as a union member with zero DDL
  and zero stored-row migration (lock-the-extensible-shape; the single-arm-union precedent).

## 4. The shape (what gets built)

### 4.1 Contracts — `packages/contracts/src/refinery/index.ts`

Imports: `zod`, `@orb/kit/ids` (typeIdSchema/ID\_PREFIX for view ids). ZERO `#character` imports (§3.2).

- `REFINERY_STAGES = ["score","rewrite","analyze"]` → `RefineryStage`, `refineryStageSchema`.
- `REFINERY_VERDICTS = ["ACCEPT","NEEDS_REFINEMENT","REGRESSION"]` — verbatim (the loop's contract; the
  extension's enum, `defaults.ts:347-350`).
- `REFINERY_SESSION_STATUSES = ["active","completed","abandoned"]` (extension session model, study §1.1.6).
- F4 modes: score `["full","quick"]` · rewrite `["conservative","balanced","expansive"]` · analyze
  `["full","iteration","quick"]` (the 8 builtin presets ARE these modes, `defaults.ts:55-233`; "default"
  renamed full/balanced per the study's F4 cell).
- F5 fields: `REFINABLE_FIELDS = ["description","personality","scenario","greetings","exampleMessages",
  "systemPrompt","postHistoryInstructions","depthPrompt","creatorNotes"]` — canonical-card order, card
  field names; `greetings` granularity via `greetingIndexes` on the selection / `greetingIndex` on payload
  entries. Books excluded (F5; PD-144 attached refs are cross-domain — a follow-up row).
- `refinerySelectionSchema = { fields: RefinableField[] (unique), greetingIndexes?: int[] }`.
- Per-stage kind-tagged configs (`refineryScoreConfigSchema` etc.), `refineryStageConfigSchema`
  (all three), `DEFAULT_REFINERY_STAGE_CONFIG` (full/balanced/full), and `RefineryStagePayloadConfig`
  (the per-run provenance union — a TYPE union only: the arms share `kind:"fixed"` and mode literals
  collide across stages ("full"/"quick"), so a generic runtime union would mis-narrow; reads dispatch
  per stage through the run view / per-stage schemas).
- The three payloads (§3 completions applied): `refineryScorePayloadSchema`,
  `refineryRewritePayloadSchema`, `refineryAnalyzePayloadSchema`.
- `REFINERY_STAGE_PAYLOADS: Record<RefineryStage, ZodType>` — the exhaustive per-stage parse dispatch
  (§7.5 mapped-Record; R1's run rows and read seams dispatch through it, `assertNever`-free by construction).
- Views: `refineryRunSchema` (z.discriminatedUnion on `stage`; shared meta id/sessionId/iteration/
  payloadConfig/model/promptTokens/outputTokens/createdAt) and `refinerySessionSummarySchema`
  (id/characterId/name/status/iterationCount/latestVerdict nullable/createdAt/updatedAt). The FULL
  session view (which carries `originalCard: CharacterCard`) is deliberately NOT here — it homes in
  `domain/refinery/contract/` (R1) where both namespaces are importable without a cycle; the tRPC client
  types flow from the router either way.

### 4.2 Contracts — `contracts/character` tightening (I1)

`refinerySignalsSchema.analysis: refineryAnalyzePayloadSchema.nullable()` (was
`z.record(z.string(), z.unknown()).nullable()`). `score` stays `z.number().nullable()` (R1 stamps the
analyze run's `soulScore`-adjacent `overallScore` from score runs — the stamping semantics are F6/R1).
The read seam (`queries.ts:29`) heals any pre-tightening junk to null via the existing whole-object
`.catch(null)` — the pre-launch bargain, no migration mechanics (the column is belt-parsed on read).
Client impact: none — both readouts consume `score` only, and the provenance component's local
`analysis: Record<string, unknown> | null` view accepts the typed payload (type-alias implicit index
signature).

### 4.3 DB — `packages/db/src/schema/refinery.ts` (producer: `domain/refinery`, R1; baseline-rider until then)

```
refinery_sessions
  id            text PK, $type<RefinerySessionId>            (TypeID refinery_session_)
  character_id  text NOT NULL FK→characters.id CASCADE       (the D23 ownership anchor — NO owner_id, §3.1)
  name          text NULL
  status        text NOT NULL enum REFINERY_SESSION_STATUSES default "active"
  original_card text-json NOT NULL $type<CharacterCard>      (the anti-drift anchor; the character_snapshots.content shape)
  selection     text-json NOT NULL $type<RefinerySelection>
  stage_config  text-json NOT NULL $type<RefineryStageConfig>
  guidance      text NULL
  iteration_count integer NOT NULL default 0
  created_at / updated_at  integer NOT NULL default (unixepoch()*1000)
  index refinery_sessions_character_idx (character_id)       (fk-columns-indexed; the snapshots precedent)

refinery_runs   (append-only — the extension's history[]; latest-per-(session,stage) = current)
  id             text PK, $type<RefineryRunId>               (TypeID refinery_run_)
  session_id     text NOT NULL FK→refinery_sessions.id CASCADE
  stage          text NOT NULL enum REFINERY_STAGES
  iteration      integer NOT NULL default 0
  payload_config text-json NOT NULL $type<RefineryStagePayloadConfig>  (per-run provenance, §3)
  payload        text-json NOT NULL $type<RefineryStagePayload>
  model          text NOT NULL $type<ModelId>
  prompt_tokens / output_tokens  integer NULL                (stats parity; absent when the backend reports none)
  created_at     integer NOT NULL default (unixepoch()*1000)
  index refinery_runs_session_stage_idx (session_id, stage, created_at)  (FK leads; serves the cascade scan AND latest-per-stage)
```

Enum columns reference the imported contracts tuples (`db-enum-from-tuple`); every FK states `onDelete`
and leads an index (`fk-ondelete-stated`/`fk-columns-indexed`); explicit snake\_case column names
(drizzle.config.ts convention); both tables declare PKs. Barrel row added alphabetically. D24 clean (no
polymorphic refs); D28 clean (`original_card` is an opaque blob copy, FKs nothing, gates nothing).

### 4.4 Rejected alternatives (each considered, each with the reason it lost)

- **`ownerId` on sessions** (the study sketch) — loses to D23's own test; §3.1.
- **Move `refinerySignalsSchema` into `#refinery`** — module-cycle risk + 3-file re-point for a worse
  one-home reading; §3.2.
- **Mode-forked payload schemas** (extension parity for quick score) — forks every downstream consumer
  (render, stamping, compare) on a prompt-tier axis; F3 says fixed; §3.3.
- **Per-entry discriminated union for the greetings index** — wire burden on small-model structured
  output + scrub complexity; the invariant has exactly one enforcement consumer (apply, R1); §3 completions.
- **`refinery_schemas` skeleton now** — the kind-tag union is the whole seam SF0 needs; a table with no
  writer, no belt, and no signed custom arm is speculative DDL the owner deferred (F3).
- **A `domain/refinery/` stub dir in R0 to satisfy the producer-mirror** — the gate's
  `BASELINE_RIDER_PRODUCERS` exists precisely so DDL can ride the squash before the domain lands; a stub
  dir would also drag the new-domain compose/Services coupled set into the pre-security window.
- **A tests/support factory for refinery rows** — no consumer beyond the schema int test; the sibling
  schema tests hand-insert (character.int.test.ts precedent); a factory with one caller is filler.

## 5. Coupled-site inventory (enumerated BEFORE building)

1. `packages/kit/src/ids/index.ts` — prefixes + brands (additive; ids tests carry no census — verified).
2. `packages/contracts/src/refinery/index.ts` — NEW (wildcard exports: no package.json edit, D15).
3. `packages/contracts/src/character/index.ts` — the `analysis` tightening + `#refinery` import.
4. `packages/db/src/schema/refinery.ts` — NEW.
5. `packages/db/src/schema/index.ts` — barrel row.
6. `packages/db/src/migrations/*` — regenerated baseline + meta (biome-formatted).
7. `scripts/check/gates/db-structure.ts` — the baseline-rider entry (gate edit ⇒ run the gate suites).
   7a. `scripts/check/gates/own-tables-only.ts` — a `SCHEMA_OWNERS` row (`refinery → ["refinery"]`, the
   pre-producer twin of the rider; R1 deletes both). Surfaced by the structure run, not the pre-build
   sweep — the gate's totality arm demands a deliberate owner for every table-bearing schema file.
   7b. `scripts/check/gates/table-scoping-class.ts` — two `parent`-class rows (the D23 DERIVE declaration
   made legible to readers + gates) + the census comment corrected (it had ALREADY drifted 80→82 before
   this lane; now 84 — 23 ownerId · 19 membership · 15 junction · 22 parent · 5 global).
8. `tests/contracts/character/index.contract.test.ts:60` — stale fixture (`analysis:{tone:…}` fails the
   tightened parse; parse-is-identity test).
9. `tests/db/schema/character.int.test.ts:22,72` — stale typed fixture (type error post-tightening).
10. `tests/contracts/refinery/index.contract.test.ts` — NEW (presence-gated).
11. `tests/db/schema/refinery.int.test.ts` — NEW (house bar).
12. NOT coupled (verified): client components (structural assignability holds, §4.2); serde
    (`refinery: null` literal, no schema import); debug inspector (`refinery: unknown`); compose/Services/
    tRPC/workloads (all R1 — no domain exists yet); relations.ts (consumer-driven, none);
    `tests/support/factories/character.ts` (`refinery: null` stays valid); the \~10 chat-test
    `refinery: null` fixtures (null stays valid).

## 6. Test plan

- **Contract test** (`tests/contracts/refinery/index.contract.test.ts`): parse + round-trip a full
  payload per stage; verdict/mode/status tuples reject foreign members; selection uniqueness +
  greetingIndex bounds; the 1-10 score bounds (reject 0 / 11 — the belt the wire scrubs can't lose);
  rewrite text max = the card cap (accept 100 000, reject 100 001 — the behavioral twin pin);
  `REFINABLE_FIELDS ⊆ keyof CharacterCard` (the satisfies pin — imports both namespaces legally);
  `REFINERY_STAGE_PAYLOADS` exhaustiveness (Record over the stage tuple is compile-forced; assert the
  runtime keys mirror the tuple); run-view discrimination (a score payload under `stage:"analyze"` FAILS).
- **DB int test** (`tests/db/schema/refinery.int.test.ts`, freshDb): insert→select round-trip (branded
  ids, JSON columns through the read-seam parsers, status default); the D23 derivation chain — owner →
  character → session → run, then `DELETE character` cascades sessions AND runs (two levels), and
  `DELETE user` cascades all three; enum column rejects a foreign stage (CHECK constraint);
  latest-per-(session,stage) ordering sanity on the composite index path.
- **Updated fixtures**: character contract APP\_CARD gets a FULL typed analyze payload (upgrades the
  round-trip proof from opaque-blob to typed); character db int test likewise.
- **Gate conformance** (db-structure edited): `tests/tooling/check-gates.int.test.ts` +
  `gate-conformance.int.test.ts` + `schema-baseline-parity.int.test.ts`.

Red-first note (defect-fix framing does not apply — R0 is additive): the two stale fixtures ARE the
red-first evidence for the tightening (they fail against the new schema before their update; run
observed, then fixed). The planted-control discipline applies to the db CASCADE test via the
positive-control-then-delete shape (rows exist → delete → gone), the non-vacuity pattern.

## 7. R1 hand-off brief (what the next lane builds; why it waits for security)

R1 = `domain/refinery` per the study §5.3, riding this foundation:

1. Remove the `refinery` `BASELINE_RIDER_PRODUCERS` row (the gate will be flagging it stale) AND the
   `own-tables-only` `SCHEMA_OWNERS.refinery` row (redundant once `domain/refinery/` exists — the
   default same-named derivation takes over; its `why` says so).
2. The 8-slot domain: `startSession` (snapshot card → `original_card`, default selection = populated
   fields, `DEFAULT_REFINERY_STAGE_CONFIG`), `runStage`, `iterate`, `applyFields` (injected
   `character.snapshot("auto: before refinery apply")` + `character.update`), session CRUD; substrate
   `refine-prompt.ts` (pure; the §1.2 prompt discipline: analyze ALWAYS compares vs `original_card`);
   parse seams dispatch through `REFINERY_STAGE_PAYLOADS`.
3. Ownership: the D23-derived join (`persistence/` helper à la `ensureCharacterOwned`; leak-free
   NOT\_FOUND). NO `fetchOwned` on refinery tables (no ownerId — §3.1).
4. Prose slots (`refinery.score.system` + rewrite/refine/analyze — owner signs baselines; prose is
   owner-sacred) + `refine_score`/`refine_rewrite`/`refine_analyze` SideGenKind postures + the
   summarize-role wiring (F2) + `characters.refinery` stamping via an injected character op (F6;
   character stays the only writer of `characters.*`).
5. New-domain coupled set (the memory-pinned seven): Services type + compose wiring +
   DOMAIN\_SPECIFIC\_ROOT\_FILES + the rider removal + tRPC router registration + cross-tenant sweep
   classification per procedure + the `services.test.ts` SERVICE\_KEYS array.
6. **The security pass is DONE (2026-08-08) — GO for R1:**
   [`../reviews/security/2026-08-08-refinery-r0-security-pass.md`](../reviews/security/2026-08-08-refinery-r0-security-pass.md).
   Its **§4 belt list is R1's checklist** and its §1 carries the prescriptions R1 builds (field-level heal for
   the signals read · the `greetingIndex` biconditional at the APPLY verb, not the contract · strip-stays +
   itemize · the guidance parse/neutralize wiring). The payload BOUNDS it prescribed already landed at the
   contract tier in that pass.
7. **Why security first:** untrusted card text (serde header law: cards are UNTRUSTED) enters LLM
   prompts; model output is written back into the card on accept; prompt-injection can steer a rewrite
   into `systemPrompt`; the study §6 security block names the mitigations (explicit per-field apply,
   snapshot-first, zod-bounded payloads, text-tier rendering, ownership belts before content verdicts,
   existence-oracle defense). The R0 contracts are the bounds that pass owes review against.

## 8. Floors run (receipts in the lane report)

> §8 closed R0. Everything below is the R1 leg (same lane, post-merge `b7ca6d55a`, post-security-pass
> `d8674e83a`), designed against
> [the security pass](../reviews/security/2026-08-08-refinery-r0-security-pass.md) §4's belt list.

## 9. R1 — the engine (`domain/refinery`), designed

### 9.1 Scope

`domain/refinery` (8-slot template) + the compose/transport wiring + the character-side belts the pass
prescribed. NOT in R1: the client surface (R3), sorts/dossier/workload sweep (R4), NL→schema (SF),
portability rows (§3.E: nothing owed — FK-inherited tables ride their character).

### 9.2 Verbs (`contract/service.ts` is the authority; every belt cites its § in the pass)

| Verb | Contract | Belts |
| - | - | - |
| `startSession {principal, characterId, name?}` | snapshot the card into `original_card` via the injected `loadOwnedCard` (leak-free NOT\_FOUND when undefined); selection defaults to the card's POPULATED refinable fields; `DEFAULT_REFINERY_STAGE_CONFIG`; name via `refinerySessionNameSchema` | §3.E ownership-first |
| `getSession` / `listSessions` / `listRuns` | reads scope through the character join (`persistence/queries.ts` carries the owner predicate in the WHERE — the `ensureCharacterOwned` shape); `listSessions` computes `latestVerdict` (newest analyze run per session); `listRuns` is the D62 CONTEXT ledger read | §3.E; run reads ONLY via sessionId |
| `updateSession {sessionId, patch}` | patch = name?/guidance?/selection?/stageConfig?/status? — parsed through the R0 schemas (`refineryGuidanceSchema`, `refinerySelectionSchema`, `refineryStageConfigSchema`); **collapses the study's `renameSession`** (one patch verb, the `updateCharacterSchema` precedent — rename alone cannot serve the D62 Setup tab, which edits modes/selection/guidance) | §1 gap 4 |
| `deleteSession {sessionId}` | owner-belted delete; runs cascade | §3.E |
| `runStage {sessionId, stage}` | the engine (§9.4): prompt → summarize+ResponseFormat → null-drop parse → run row (+ `strippedKeys`) → signal stamp (score/analyze) → `updatedAt` | §4 items 1-7, 14 |
| `iterate {sessionId, guidance?}` | guidance parsed+persisted; refinement REWRITE (the `refine.system` slot + latest analyze feedback in-context) then ANALYZE; `iterationCount++`. Requires a latest analyze run (typed `RefineryStageNotReadyError` otherwise — the loop refines, it does not start) | anti-drift §4.3 |
| `applyFields {sessionId, accepts: [{field, greetingIndex?}]}` | §9.5 — the sharp end. Accepts may carry `cleared` entries; optional `rewriteRunId` (schema-renderer §16.1); sibling verb `applyAsCopy` (schema-renderer §17). | §4 items 8-13 |

Stage preconditions: `analyze` requires a latest rewrite run; `rewrite` embeds the latest score run when
one exists (context, not a requirement); `score` requires nothing. `applyFields` stamps
`status:"completed"`; a later `runStage`/`iterate` stamps it back `"active"` (status is a roster label,
never a lock). Double structured failure = typed `RefineryRunFailedError` — never a fallback write (§4.7).

### 9.3 Context / injected ops (all typed in `contract/service.ts`, wired at `entry/compose/refinery.ts`)

`db · now · newRefinerySessionId · newRefineryRunId · summarize · summarizerModel ·
resolveUserPresetParams · resolveUserProse` (the distill rung, verbatim) plus four character ops:

- `loadOwnedCard(ownerId, characterId) → CharacterCard | undefined` — NEW character persistence factory
  (`character/persistence/card-read.ts`, wrapping `loadOwnedCharacterRow` + `cardOf` so the card
  projection stays one-homed; the `createLinkCharacterAvatars` worked-example pattern).
- `stampRefinerySignals({ownerId, characterId, patch: {score} | {analysis}})` — NEW character persistence
  factory (`character/persistence/refinery-signals-write.ts`): read-merge-write of the JSON column with
  the owner predicate IN THE WHERE (injected-op-caller-gate — dropping the caller is a cross-tenant hole).
  A score run stamps the score half (its `overallScore`); an analyze run stamps the analysis half — the
  two halves have independent producers (the pass's own gap-2 rationale; refines the study's F6 sentence,
  which pre-dated the payload split).
- `snapshotCharacter` = `CharacterService["snapshot"]` (label `"auto: before refinery apply"` — the
  `restore.ts` reversibility precedent, §4.13).
- `updateCharacter` = `CharacterService["update"]` (the full character belt runs inside the verb).

### 9.4 The engine (`runStage` + substrate)

- **Prompt assembly** (`substrate/refine-prompt.ts`, pure): system = `resolveProseText` of the stage
  SYSTEM slot (refinement rewrites use `refinery.refine.system`); instructions = the (stage × mode)
  INSTRUCTION slot; user = engine-CONCATENATED sections — card fields (selected only, per-greeting by
  index, `## <field>` headers), score context (rewrite), original-vs-rewrite (analyze — ALWAYS
  `original_card`, §4.3), guidance last. **No truncation** — a rewrite must see whole fields; the posture
  caps output, a context overflow surfaces as the provider's typed error (the extension's token-fit
  warning is R3's read-only I4).
- **Belt 5 — BY CONSTRUCTION, deviation flagged (SendMessage'd):** no refinery string ever enters the
  macro engine (slots are `macros:"none"`; the user prompt is concatenated, never
  `spliceProseTokens`-spliced — that helper is a sequential replace, an injection surface for values
  carrying token syntax). The pass's §3.C prescription is CONDITIONED on "runs the assembled string
  through the macro engine"; here that path does not exist. `neutralizeMacros` on card text would
  actively CORRUPT the product: ZWSP-split braces ride the model's rewrite back through `applyFields`
  into canon, killing the card's own `{{char}}`/`{{user}}` macros at chat time. Pinned by a substrate
  test: prompt output carries the card's `{{…}}` bytes VERBATIM (no ZWSP), and the domain imports no
  macro engine (grep receipt in the report).
- **Parse** (`substrate/stage-parse.ts`): per-call `z.preprocess` wrapper — `dropNullValues` (§3.B,
  strict-compatible survival) + a capture taken AFTER the drop; `runStructuredTurn` with the
  per-stage schema out of `REFINERY_STAGE_PAYLOADS` (§4.5); after success, `strippedKeys` = the dotted
  paths present in the captured object but absent from the parsed value (paths only, never content —
  §4.6). Capture-after-drop is deliberate: an explicit null under strict-compatible is the projection's
  encoding of ABSENT, not an invented key — itemizing it would stamp every legitimate run on that
  deployment and drown the tamper signal (only schema-unknown keys itemize; pinned in the substrate
  test); retry observability via a refinery-local `traceStructuredRetry` twin (same
  `provider.structured.retry` event + shape as discovery's — its header's one-home claim is per-domain
  lane vocabulary, cited in the file).
- **Run row**: stage, iteration (the session's counter at run time), `payload_config` (the in-force arm),
  payload, `strippedKeys` (NEW COLUMN — the coordinator's belt 6 homes the itemization in the run
  RECORD; baseline re-squashed), model (`summarizerModel`, castId at the boundary), prompt/output tokens
  null v1 (the summarize result carries no usage — "absent when the backend reports none" is the R0
  column's own contract). Gains `durationMs` + the usage-threading decision (schema-renderer §9.2).

### 9.5 `applyFields` (the sharp end, §4.8-13 in order)

ownership belt → load the latest REWRITE run (none = typed not-ready) → per-entry intersection:
`accepts ∩ run.payload.fields ∩ session.selection ∩ REFINABLE_FIELDS` → greeting-index assert against
the LIVE card (`greetingIndex` present ⇔ `field === "greetings"`, `< card.greetings.length` — a greeting
deleted since session start is DROPPED, never re-created; §1 gap 3 verb-tier ruling) → dropped entries
itemized `{field, greetingIndex?, reason}` in the RESULT (per-entry salvage, never a whole-payload
refusal) → build the patch (greetings = the live array with accepted indexes replaced) →
**`updateCharacterSchema.parse` on the constructed patch** (§3.A; the `domain/import/substrate/card.ts:192`
precedent, cited in the verb header) → `snapshotCharacter("auto: before refinery apply")` →
`updateCharacter` → stamp `status:"completed"`. Acquires the divergence check + `source_run_id`
(schema-renderer §21, Edge 1/Edge 2).

### 9.6 Character-side belts (same lane, distinct files)

1. **The heal split + score tightening, ONE change** (§1 gap 2's ordering condition): contracts
   `refinerySignalsSchema.score` gains `.min(1).max(10)` (STRICT — the contract stays the validity
   authority); the READ SEAM (`character/persistence/queries.ts`) replaces the whole-object
   `refinerySignalsSchema.nullable().catch(null)` with a FIELD-LEVEL healing parser — per-arm
   `.catch((ctx) => { addSpanEvent("character.refinery.heal", {arm}); return null; })` + the outer
   `.nullable().catch(null)` kept only for the not-an-object case. Healing is thereby observable
   (D112 banned-silent-fork) and one arm's rot can never cost the other. Red-first: the pass's measured
   `{score: 8, analysis: legacy} → null` case becomes the pin (old parser observed deleting the score;
   new parser preserves it).
2. **Handoff clear** (§3.D, coordinator DEFAULT accepted): `handoff-copy-write.ts` sets
   `refinery: null` on the minted copy, header states the ruling (derived data; the old host's private
   critique; possibly echoing the old host's guidance), pinned beside the existing copy assertions.
   Owner may override — flagged in the report.

### 9.7 Prose slots (12) + postures (3)

- **Slots** (`contracts/refinery/prose.ts` table + `PROSE_SLOT_IDS` rows + the `contracts/prose`
  composition spread + `prose-baseline.json` entries via `scripts/check/gen-prose-baseline.ts`): four
  stage-SYSTEM slots (`refinery.score.system`, `.rewrite.system`, `.refine.system`, `.analyze.system`)
  - eight (stage × mode) INSTRUCTION slots (`refinery.score.mode.full`/`.quick`,
    `refinery.rewrite.mode.conservative`/`.balanced`/`.expansive`,
    `refinery.analyze.mode.full`/`.iteration`/`.quick`). That is F4's own arithmetic — the extension's 8
    builtins ARE the mode bodies, and PROSE-1's one-override-per-slot is the sanctioned tuning surface
    (the study's 4-slot list pre-dated F4's signing). All `home:"user"` (§3.G — beside the discovery
    cohort; the USER\_PROSE\_SLOT\_IDS derivation makes them reach the Prose editor the same commit, zero
    client work), `macros:"none"`, baselines seeded from the extension corpus (`defaults.ts:35-233`) —
    **owner-sacred: the texts ship as baselines for the owner to sign/veto**, flagged in the report.
    The engine maps (stage, mode, isRefinement) → slot id through an exhaustive mapped Record. Notes the
    pending `{{shape}}` splice change (schema-renderer §9.3).
- **Postures** (`contracts/preset`): `refine_score {0.2, 768}` · `refine_rewrite {0.7, 2048}` ·
  `refine_analyze {0.3, 512}` (study §5.3 values) — SideGenKind members + posture rows (`satisfies`
  makes a missing arm tsc-RED); resolved per call via `resolveSideGenSampling(floor, ownerPresetParams)`
  — the caller is always the card owner, so the preset rung ALWAYS applies (no mixed-owner arm here,
  unlike distill's library batch).

### 9.8 Coupled sites (the seven + this lane's own)

Services type (`transport/trpc/context.ts`) · `entry/compose/refinery.ts` + the `services.ts` call ·
`services.test.ts` SERVICE\_KEYS ("refinery", sorted) · tRPC `routers/refinery.ts` + root-router row ·
cross-tenant sweep: a seeded marker session + a probe per procedure (the completeness guard forces it) ·
**delete BOTH pre-producer gate rows** (db-structure BASELINE\_RIDER — self-flagging — and own-tables-only
SCHEMA\_OWNERS.refinery — silent) · prose composition spread + baseline json + the prose contract test's
slot census (if it counts) · `SIDE_GEN_KINDS` consumers sweep (repo-grep, shared-value law) ·
`refinery_runs.strippedKeys` = contracts run view + db column + baseline re-squash + the R0 db/contract
tests updated · workload-contributions: ABSENT BY DESIGN in R1 (no refinery workload kind until R4; five
existing domains ship without the file — persona/tag/settings/sessions/preset all lack it).

### 9.9 Test plan (mirror paths; presence-gated surfaces each get their file)

- Per-verb `.int.test.ts` (freshDb + a scripted `summarize` stub injected through the ctx — the
  mock-at-the-edges doctrine): happy path + the belt each verb owes (foreign session → NOT\_FOUND
  identical to absent; stage-not-ready; per-entry drops itemized; the apply re-parse refusing an
  over-cap text; snapshot-before-update ordering; stamp halves independent).
- `contract/` schemas → `.contract.test.ts` (params/errors round-trip).
- Substrate units: prompt bytes verbatim (the belt-5 pin: `{{char}}` survives un-ZWSP'd), anti-drift
  (analyze prompt contains ORIGINAL bytes, not the previous rewrite), stage-parse null-drop +
  stripped-keys capture (planted junk key → itemized; explicit null → survives parse).
- Character side: the heal-split red-first pin (`{score:8, analysis:junk}` preserved-score), the handoff
  clear pin, the stamp WHERE-belt (foreign ownerId writes nothing).
- Sweep: marker-named session/run seeds + probes for every refinery procedure.
- Conformance: `check-gates.int` + `gate-conformance.int` after the two row deletions; prose baseline
  test; `tests/contracts/preset` posture census if one asserts.

### 9.10 What the post-R1 reviews should attack (the graduation brief)

**verifier:** the apply intersection algebra (accepts ∩ payload ∩ selection ∩ live-card indexes — four
sets, off-by-one surface); the heal split's arm independence under real drift shapes; latestVerdict
join correctness; the iterate two-run transaction (rewrite lands, analyze fails — is the state honest?).
**security-executor:** the belt-5 by-construction claim — WHY it replaced the letter: `neutralizeMacros`
ZWSP-splits braces, the model echoes them into its rewrite, `applyFields` writes that rewrite into
canon, and the card's own `{{char}}`/`{{user}}` are then dead at chat time (the macro engine no longer
matches the ZWSP-split token) — the letter was a canon-corruption path. The construction to attack:
can card bytes reach ANY macro-RESOLVING path downstream (viewers, replays, exports, a future
`spliceProseTokens` call in a refinery template)? The substrate pin holds both drift directions
(a seeded `{{char}}` reaches the assembled prompt VERBATIM — unresolved AND un-neutralized), and the
domain carries zero macro-engine imports (two-method grep receipt in the lane report); the
stamp op's WHERE belt; the sweep's refinery rows; prompt-injection steering `applyFields` outside the
accept set (belt 9/10's intersection is the defense — try to widen it); the run-row strippedKeys never
carrying content.

Named suites cold: the two new tests + the two updated tests + kit/ids tests + serde card test +
tooling gate suites; `pnpm check:structure`; `pnpm check:db-baseline` + `pnpm check:drizzle-kit`;
`pnpm typecheck` + `pnpm typecheck:graph` (tests/ touched); scoped biome + eslint; whole-tree knip;
depcruise (new files).
