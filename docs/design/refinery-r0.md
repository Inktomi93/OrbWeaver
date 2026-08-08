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
| `DiffView` sealed PREBUILT[for:refinery/compare]; `CompareBlocks` | LIVE | `packages/ui/src/diff/diff.tsx:1-2`; compare-blocks primitive dir |
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

Imports: `zod`, `@orb/kit/ids` (typeIdSchema/ID_PREFIX for view ids). ZERO `#character` imports (§3.2).

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
and leads an index (`fk-ondelete-stated`/`fk-columns-indexed`); explicit snake_case column names
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
    `tests/support/factories/character.ts` (`refinery: null` stays valid); the ~10 chat-test
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
- **Updated fixtures**: character contract APP_CARD gets a FULL typed analyze payload (upgrades the
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
   NOT_FOUND). NO `fetchOwned` on refinery tables (no ownerId — §3.1).
4. Prose slots (`refinery.score.system` + rewrite/refine/analyze — owner signs baselines; prose is
   owner-sacred) + `refine_score`/`refine_rewrite`/`refine_analyze` SideGenKind postures + the
   summarize-role wiring (F2) + `characters.refinery` stamping via an injected character op (F6;
   character stays the only writer of `characters.*`).
5. New-domain coupled set (the memory-pinned seven): Services type + compose wiring +
   DOMAIN_SPECIFIC_ROOT_FILES + the rider removal + tRPC router registration + cross-tenant sweep
   classification per procedure + the `services.test.ts` SERVICE_KEYS array.
6. **Why security first:** untrusted card text (serde header law: cards are UNTRUSTED) enters LLM
   prompts; model output is written back into the card on accept; prompt-injection can steer a rewrite
   into `systemPrompt`; the study §6 security block names the mitigations (explicit per-field apply,
   snapshot-first, zod-bounded payloads, text-tier rendering, ownership belts before content verdicts,
   existence-oracle defense). The R0 contracts are the bounds that pass owes review against.

## 8. Floors run (receipts in the lane report)

Named suites cold: the two new tests + the two updated tests + kit/ids tests + serde card test +
tooling gate suites; `pnpm check:structure`; `pnpm check:db-baseline` + `pnpm check:drizzle-kit`;
`pnpm typecheck` + `pnpm typecheck:graph` (tests/ touched); scoped biome + eslint; whole-tree knip;
depcruise (new files).
