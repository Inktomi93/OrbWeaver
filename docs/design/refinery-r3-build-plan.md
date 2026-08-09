---
kind: design
status: active
updated: 2026-08-08
---

# Refinery R3 — build plan (the ratified design mapped onto code)

> **This is a MAPPING, not a design.** The design is ratified: `refinery-schema-renderer.md` (the
> authority, §-cites below are into it), the three published mocks (`mocks/refinery/` — deltas ruled
> A/A/A, accept = arm (B) per-block Keep/Discard), the NL→schema addendum
> (`docs/reviews/stickler/2026-08-08-card-refinery-nl-schema-design.md`), and the 08-08 RULINGS rows.
> This file records only: where each ratified element lands in code, the seams it touches, the
> handful of defaults taken where the ratified docs are silent, and the test plan. Deviations from a
> mock/ruling are escalations, not entries here.

## 0. What already exists (verified on this tree — do not rebuild)

- Contracts: cleared arm + `isClearedRewrite` (`contracts/refinery/index.ts:332-343`), `durationMs` +
  `sourceRunId` on runs (`:423-434`), `{{shape}}` splice (`REFINERY_SHAPE_TOKEN`/`REFINERY_STAGE_SHAPES`
  `:395-405`), single-arm config union with the P1-B header ruling (`:254-269`).
- Server: all 9 R1 verbs; apply intersection belts incl. greetingIndexes + `would_leave_no_greeting`
  (`verbs/apply-fields.ts`); empty-section prompt rendering + `overlayRewrite` cleared handling
  (`substrate/refine-prompt.ts:95-115,120-170`); stage engine with DAG parents + wall time
  (`verbs/run-stage.ts`); 12 prose slots with `{{shape}}` (`contracts/refinery/prose.ts`).
- Client: R2 data tier — 6 mutation hooks + 3 query hooks (`features/refinery/hooks/`), section
  registered DECLARED-PLANNED (`lib/refinery-section.tsx`).
- UI: `CompareBlocks` (checkbox variant, zero prod consumers), `DiffView` (chars/words/lines),
  `Meter`, `bar-list`, `stat-figure`, `list-row`, `selection-bar`, `EmptyState`, charts frame.
- Kit: `liftJsonSchema` (refuses `x-orb-ui` today), `projectJsonSchema`, `estimateTokens`,
  `runStructuredTurn`, `resolveSideGenSampling`.

## 1. Contracts (`packages/contracts/src/refinery/`)

| Element | Shape | § |
| - | - | - |
| Schema rows | `refinerySchemaStageSchema = z.enum(["score","analyze"])`; `refinerySchemaSummarySchema {id, name, description, stage, version, createdAt, updatedAt}`; caps `SCHEMA_NAME` identifier regex `^[a-zA-Z_][a-zA-Z0-9_]*$` ≤64 · description ≤2000 · `SCHEMA_MAX_DEPTH 8` · ≤64 properties/node · ≤32 enum members | NL §4.2, §7 |
| Render hints | `renderHintSchema` verbatim §4.2 (`role/tone/group/label/chart` — `chart` kept in the vocabulary; only `bars` honored in R3, radar is R4) + `RENDER_HINT_KEY = "x-orb-ui"` | §4.2 |
| Custom config arm | SESSION side: `{kind:"custom", schemaId}` on score+analyze config unions (mutable pointer — re-resolved per run, D126 spirit). RUN side (`payload_config`): `{kind:"custom", schemaId, schemaVersion, schema}` — embedded per the header ruling (P1-B). Rewrite stays fixed-only (F-N3 rec: no) | §9.1, NL §4.3 |
| Manual arm | RUN side rewrite config union gains `{kind:"manual"}` (hand-authored rewrite provenance); session config unchanged | og-feedback gap 1 |
| Run wire | `refineryRunSchema` widens: per-stage arms split fixed/custom (score+analyze), rewrite splits fixed/manual; custom payload rides `z.record(z.string(), z.unknown())` (server-validated by the embedded schema); `model` becomes `.nullable()` (a manual run has no model) | §9.1 |
| Dispatch | `payloadSchemaFor(stage, payloadConfig)` — fixed → `REFINERY_STAGE_PAYLOADS`, custom → lift of the EMBEDDED schema (§9.6); `REFINERY_STAGE_PAYLOADS` header amended |
| Custom shape splice | custom runs splice `{{shape}}` with the projected JSON Schema text (a schema, labeled as such, instead of the fixed arms' example instance) — deterministic; recorded as the taken default | §9.3 |

`contracts/preset`: `SIDE_GEN_KINDS` + `SIDE_GEN_POSTURES` gain `schema_forge` `{temperature: 0.2,
maxOutputTokens: 768}` (NL §4.6). `contracts/refinery/prose.ts`: new slot
`refinery.schemaForge.system` (owner-sacred baseline teaching the liftable subset + `x-orb-ui`
hints — flagged for owner sign-off in the report).

## 2. DB (`packages/db/src/schema/refinery.ts`) — baseline squash

- `refinery_schemas`: `{id (refinery_schema_…), ownerId FK users RESTRICT + index, name, description,
  stage, schema (json), version int default 1, createdAt, updatedAt}` — the `presets` row shape;
  per-owner case-insensitive name uniqueness enforced at the verb (S5).
- `refinery_runs.model` → nullable (manual arm). `kit/ids`: `ID_PREFIX.refinerySchema` +
  `RefinerySchemaId` brand (+ its census/coupled tests).

## 3. Kit (`packages/kit/src/json-schema/lift.ts`) — the ONE kit edit

`liftJsonSchema` ACCEPT-AND-IGNOREs exactly `x-orb-ui` on any node (allowed-key computation + the
union-node key set). Golden: `lift(hinted) ≡ lift(stripped)` — behavior-identical zod, hint-blind
wire (§4.2). Probe receipt for the current refusal: §4.1.

## 4. Server (`packages/server/src/domain/refinery/`)

- `substrate/schema-belt.ts` — the save belt (NL §4.2/§6/§7): lift + refinery tightenings (depth ≤8,
  `pattern` refused, property/enum caps, name grammar, hint nodes validated via `renderHintSchema`,
  well-known core per stage: score ⇒ root `overallScore` number min 1 max 10; analyze ⇒ root
  `verdict` enum == the three spellings). Typed refusal naming construct+path.
- Verbs: `createSchema/updateSchema/deleteSchema/listSchemas` (CRUD, S5 hygiene: per-owner
  case-insensitive uniqueness, update bumps `version`); `generateSchema {description, stage}` and
  `refineSchema {schema, instruction, stage}` (draft-only — ride the domain's ruled F2 vehicle:
  `summarize` + envelope ResponseFormat + `runStructuredTurn` whose validator is the §4.5
  lift-refusal bridge; `schema_forge` posture; double failure returns the typed error WITH the raw
  draft); `testSchema {schema, stage, characterId}` (a drill — runs the stage prompt against the
  owned card under the draft schema; writes NO run row, stamps nothing).
- `run-stage.ts` custom arm: session config `{kind:"custom"}` → load owned schema row (leak-free
  NOT_FOUND), lift → project → ResponseFormat; validator = lifted zod (strip-mode = strippedKeys
  itemization still works); run row embeds `{kind:"custom", schemaId, schemaVersion, schema}`.
  F6 stamps: custom score stamps `overallScore` (core rule guarantees the 1-10 scale); custom
  analyze does NOT stamp `analysis` (canon column is the typed fixed payload — declared in code).
  `latestVerdictsOf` gains the custom fallback (core `verdict` pluck on custom-config rows).
- `submitManualRewrite {sessionId, fields}` (og-feedback gap 1): fields parse through
  `refineryRewritePayloadSchema`, must sit inside the session selection (loud refusal — the author
  is the owner, an out-of-scope entry is a client defect); appends a rewrite run
  `{kind:"manual"}`, model null, durationMs 0, sourceRunId = latest analyze ?? score.
- Operate-back (§16.1): `runStage` gains `rewriteRunId?` (analyze only — judge THAT rewrite);
  `applyFields`/`applyAsCopy` gain `rewriteRunId?` (apply THAT rewrite). Named run must be a
  rewrite of THIS session (else leak-free NOT_FOUND).
- Divergence (§21 edge 2): `AcceptedField` gains `confirmDiverged?: true`; classify gains the belt —
  accepted field whose LIVE text ≠ ORIGINAL text and no confirm ⇒ drop `diverged_since_session`
  (new `ApplyDropReason` member).
- `applyAsCopy {sessionId, accepts, name?}` (§17): same partition/patch belts; write arm =
  injected `character.duplicate` (chassis — avatar/tags/books carry per its own rulings) →
  `character.update` overlay (patch + name default `"<name> (refined)"`) → fresh signal stamp from
  the session's latest score/analyze; no snapshot (stated in result copy); session → completed.
  `RefineryContext` gains `duplicateCharacter`.
- `preflight` (§8, `substrate/preflight.ts` + a query verb): per-stage resolved
  `{model, temperature, maxOutputTokens}` (posture ladder re-run per call) + `contextTokens`
  (RoleClients' summarizerContextTokens, composed in) + input estimate (assembled prompt through
  the REAL builders + `estimateTokens`) + output estimate (rewrite = Σ selected-text tokens ×
  modeFactor {conservative .9, balanced 1.2, expansive 2.5} + 30 + 15/entry, ×1.15; score =
  targets × 140; analyze ≈ 400). WARN-only.
- Label convention (§6.2/§16.2): `APPLY_SNAPSHOT_LABEL` gains ` · <sessionId>`;
  `ApplyFieldsResult` carries `snapshotId` (the immediate rollback-point affordance).
- Router: procs for every new verb; compose (`entry/compose/refinery.ts`) threads
  `duplicateCharacter` + `summarizerContextTokens` + the schema-id minter.

## 5. UI (`packages/ui`)

`CompareBlocks` **review variant** (§18 row 1; the accept-ergonomics mock's widening ×3): tri-state
`decided?: readonly (boolean|null)[]` + `onDecidedChange` (the legacy boolean `accepted` API stays
for zero-change compat — the CT fixture retargets), verb-pair rendering (Keep/Discard buttons with
state chips per the mock's grammar), bulk row suppressed in the review variant, absent-side arm
(`before?`/`after?` at-least-one; Added / Cleared state-word panels — no strikethrough for state,
dashed+dim for discarded at measured ≥.62 opacity). Coupled site: `tests/ui/primitives/compare-blocks/*`.

## 6. Client (`packages/client`)

- `state/refinery-selection-store.ts` — `createDrillSelectionStore<RefinerySessionId>("refinery-selection")`
  (primary only; stage is in-session UI state — addendum §10.2).
- `lib/registry-contracts.ts` — publish `RefineryContextState` (G3 strict arm requires the S type
  exported there).
- Section definition goes FULL (planned marker deleted in the same edit — G1 self-cleaning):
  `list` (sessions roster — bounded owner list ⇒ `useSuspenseQuery` + `LibraryListLayout`, flat,
  newest-first, day-grouped, verdict chips; delta 3 arm A), `listHeader`, `selection`,
  `useSelectionTitle` (session name ?? "Untitled session"), `content`, `context =
  defineContextTabs<RefineryContextState>` with **Runs · Setup · Versions** (delta 2 arm A + §6.3;
  empty arms carry their actions).
- Feature slices (`features/refinery/`):
  - `lib/render-plan.ts` — the §3.2 total mapping (pure; `satisfies Record` over the closed node
    vocabulary; structure-keyed, name-blind; the one structural hero elevation; hints elevate only).
  - `lib/builtin-hints.ts` — the fixed payloads' hint sets (§3.3 — the built-in look as a derivation).
  - `components/payload-view.tsx` — walks plan + data (meters with schema-honest scales, verdict
    banner word-primary, prose blocks, bullet lists, assay rows w/ FORK-A accordion, generic
    definition-list floor; empty values render designed empty arms).
  - `surfaces/refinery-list-surface.tsx` + roster rows; `surfaces/refinery-content-surface.tsx`
    (teaching state w/ FORK-J picker · stepper · scope strip · stage panes · run bar w/ two-sided
    fit line + preflight warns · manual-edit area · apply/apply-as-copy/discard triad · draft state
    line §20b); `components/` for stepper, scope editor (FORK G panel; FORK F "Select what scored
    under 7"), accept grammar (arm B verbs, decided-collapse, cleared/added blocks, conflict
    re-confirm §21), apply result (FORK H/I), context tabs (runs ledger + strippedKeys warn line,
    setup rows w/ actions, versions walk w/ classify + DiffView compare + restore), schema editor
    dialog (NL §4.7: field-list form + NL generate/refine panel + testSchema preview through the
    SAME PayloadView + raw-paste door surfacing the lift refusal).
- Data tier: new hooks (schema CRUD/generate/refine/test, preflight, manualRewrite, applyAsCopy,
  snapshots reads via existing character procs) + `invalidates` rows + the
  `query-freshness-coverage` STATIC entries for the new keys.

## 7. Defaults taken where the ratified docs are silent (recorded, not ruled)

1. `refinery_schemas.stage` = `["score","analyze"]` — no `"rewrite"` (F-N3: custom rewrite has no
   apply semantics), no `"any"` (would demand BOTH well-known cores in one schema; the NL doc's
   `stage` cell was a sketch).
2. Session config carries `schemaId` only; the RUN embeds schema+version (the P1-B ban is about the
   append-only log; sessions are mutable pointers and follow edits — next run picks up the bump).
3. Custom analyze runs do not stamp `characters.refinery.analysis` (typed canon column); declared
   in code + Setup-tab copy.
4. NL generation rides `summarize`+ResponseFormat (the domain's ruled F2 vehicle) rather than the
   structured role — zero new compose machinery, same engine the stages already use (F-N1's rec
   noted; deviation reasoned here).
5. Custom `{{shape}}` splice = the projected JSON Schema text (labeled), not a synthesized example.
6. Fork F-T1 (greeting APPEND): **left out** — the accept UI never needs an Added-greeting block
   (greetings have no "empty slot" state; fill-empty greeting deltas are unrepresentable without the
   append arm, which stays R4+). The ADDED block treatment ships only for the absent-side primitive
   arm (future-proof), not reachable from today's payloads.
7. FORK F's "Select what scored under 7" ships now (the mock's rec left only the timing open; it is
   one action on an already-built editor).

## 8. Test plan

- kit: lift `x-orb-ui` golden (hinted ≡ stripped; control: an unknown `x-` key still refuses).
- contracts: custom/manual arm parses + refusals; schema caps; run-wire nullable model; hint schema.
- server int (per verb, planted negative controls): schema CRUD hygiene (S5: case-insensitive
  uniqueness, version bump), belt refusals (depth 9, `pattern`, missing core, bad hint), custom
  runStage end-to-end (scripted summarize; run row embeds schema; strippedKeys; verdict fallback in
  roster), manual rewrite (in-selection refusal arm; analyze can judge it), operate-back (analyze
  judges run N, not latest; foreign run NOT_FOUND), divergence (drop without confirm, apply with),
  applyAsCopy (fresh character carries patch + signals; original untouched; no snapshot),
  preflight (posture edit shows next call; over-budget warns).
- client: render-plan unit tests (totality over an OG-corpus fixture set — §11c; scale honesty
  `/5` pin; hero elevation; hint elevation; malformed hint heals to structure); CT —
  `payload-view.ct.tsx` (fixed score payload renders the mock anatomy; custom fixture renders w/
  zero generic-floor raw JSON), `refinery-accept.ct.tsx` (tri-state lifecycle, fail-closed
  undecided, cleared block copy, decided-collapse, greyscale-legible words), compare-blocks CT
  retarget + review-variant cases, section CT (roster → content drill; empty states carry doors).

## 9. Sequencing inside the lane

kit → contracts (+preset/prose) → db+ids → server substrate/verbs/router/compose → ui widening →
client state/registry → renderer lib → surfaces → tests throughout; ONE commit at the end through
the pre-commit hook.
