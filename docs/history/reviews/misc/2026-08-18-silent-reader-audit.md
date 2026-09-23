---
kind: review
status: active
updated: 2026-08-18
---

# Silent-reader audit — are there more `caption_meta`s? — 2026-08-18

Read-only audit lane (`silent-readers`). Nothing was changed; every row carries a `path:line` receipt
produced in this session, and every negative claim carries its scanned-file count plus a second method.

**The founding defect.** `image_embeddings.caption_meta` was a READER WITH NO PRODUCER: discovery's
image-analytics read fourteen facet paths (`artStyle`/`palette`/`mood`/…) out of a JSON column whose only
two writers ever stored `{ model }`. Every hop on the READ side was real — declared, exported, wired to
tRPC, rendered in a tab, integration-tested — so every gate was green while the surface rendered empty
forever. Fixed 2026-08-18 in `5e19418b4`; the vocabulary now has one home at
`packages/contracts/src/embeddings/index.ts:17-37`, which states the provenance verbatim.

## 0. The headline — where this class can and cannot live

**Wherever a persisted shape is TYPED, the type system already binds writer to reader, and the defect is
structurally impossible.** Measured, not asserted: 45 of the 66 JSON columns carry a `$type<Named>()`
annotation; resolving those 43 distinct declarations yields **297 fields**, and a whole-corpus sweep of
every one of them found **0** read-with-no-writer (`scratch/sr-field-parity.ts`, corpus 5,073 files).

The caption class can therefore only live where **no type crosses the write/read seam**:

1. an **OPEN** JSON column — `$type<Record<string, unknown>>()` / `unknown` / `JsonValue` (13 of 66), where
   the reader's shape is declared somewhere else entirely and nothing checks the writer against it;
2. an **optional contract field** whose producers are all pass-throughs, so no arm of `tsc` ever demands an
   origin;
3. a **string-keyed** read off a blob — `json_extract(col, '$.key')`, `blob["key"]`, `field(blob, "key")` —
   which is text, not a type, at every tier.

`caption_meta` was #1 and #3 at once. Every finding below is one of these three.

## 1. Method, corpora, and scanned counts

| Instrument | What it swept | Receipt |
| - | - | - |
| `pnpm ast columns --all` | 754 columns / 85 tables, schema files scanned 27 | `read-only 0`, `write-only 1`, `neither 0` — **with a declared blind spot, see §2** |
| `scratch/sr-column-parity.ts` (class A, 2nd method) | 754 columns / 85 tables, corpus 5,073 files, 10,562 distinct write-names, 33,913 read-names | **hits=0**; known-positive control fired (§2) |
| `scratch/sr-field-parity.ts` (class B, typed columns) | 297 fields over 43 column types, corpus 5,073 files | **hits=0** |
| `scratch/sr-contract-parity.ts` (class C) | 2,296 contract fields / 1,003 distinct names in `packages/contracts/src/**` | **hits=6**, 4 of them brand phantom-symbols → 2 real |
| `pnpm ast regkeys --all` | 192 registries, 130 registry files scanned | 207 informational rows; triaged in §5 |
| `scratch/sr-db-empty.ts` (empirical arm) | 86 tables / 756 columns of the LIVE corpus | 61 all-empty columns on populated tables; triaged in §6 |
| `json_extract` path census | every `json_extract(…, '$.…')` in `packages/server/src` + `packages/db/src` outside migrations | 14 paths, all triaged (§4) |

**Database access.** The live `data/orbweaver.db` was never opened. The census ran against
`data/orbweaver.db.backup-1787038258451` (the 01:31 static backup) copied into the lane scratchpad, read
through node's built-in `node:sqlite` in `readOnly` mode. (`sqlite3` the binary is refused by tool-guard,
correctly; the node route is the sanctioned equivalent and the orchestrator approved it in-lane.)

**Evidence discipline.** Every property read was swept in all three shapes (`x.f`, `x?.f` — the same AST
node kind — and `x["f"]`), plus destructuring `BindingElement`s and SQL `$.f` paths. `ts` and `tsx` were
loaded as one ts-morph corpus, never a single-language `ast-grep` pass. Each negative claim below states
the count that entitles it.

## 2. Class A — DB columns read-never-written

**Result: CLEAN, by two independent methods.**

`pnpm ast columns --all` reports `read-only 0` across 754 columns — but that verdict is **not on its own
sufficient**, and the lens says so itself:

> a whole-row/spread writer names no column, so every column of these tables reads as `write?`, never
> "unwritten" — **opaque-write tables (59)**

So on 59 of 85 tables the lens is structurally incapable of producing a class-A finding. That blind spot is
exactly where `caption_meta`-shaped rot would hide, so it was closed with a second, name-based method that
is blind to nothing (`scratch/sr-column-parity.ts`): for each of the 754 column property names, is that name
ever spelled as an object-literal key, a shorthand, an assignment target, or a `json_set` path anywhere in
the 5,073-file corpus? **hits=0.**

**The instrument was proven to bite** before its zero was trusted: a probe column
(`srProbeUnwrittenColumn`) planted in `packages/db/src/schema/tag.ts` was reported `READ-NO-WRITE`, then
removed via the `cp`/`mv` mechanism (`git status --short` empty afterwards — no `git stash`/`restore` was
used at any point in this lane).

| Finding | Reader receipt | Writer-sweep receipt | Verdict | Disposition |
| - | - | - | - | - |
| No column on any of 85 tables lacks a writer spelling | — | `sr-column-parity.ts`: 754 columns, 10,562 write-names, hits=0; `pnpm ast columns --all`: read-only 0 | **CLEAN** | none |
| `pnpm ast columns` is blind on 59/85 tables | lens self-report, `sr-columns.txt` "opaque-write tables (59)" | — | **SUSPECT (instrument)** | note the limitation where the lens is cited as evidence; the proposed gate in §7 is derivation-based and does not inherit it |

## 3. Class B — JSON-column FIELDS read-never-written (the exact caption class)

**The 13 OPEN columns — the entire attack surface, ranked by risk.** Risk = (does a rendered surface or a
behavioral branch read named keys off it?) × (how many independent writers?).

| # | Open column | `$type` | Reader shape | Live rows / non-empty | Risk | Verdict |
| - | - | - | - | - | - | - |
| 1 | `message_variants.metadata` | `Record<string, unknown>` | SQL path `$.reasoning_duration` (2 sites) + `metadata?.["reasoning_duration"]` | 87,904 / 86,467 | **HIGH** | **DEAD-READER (half-producer)** — see F3 |
| 2 | `image_embeddings.caption_meta` | `Record<string, unknown>` | 14 facet paths + `json_each` drill | 353 / — | HIGH | **FIXED** `5e19418b4` |
| 3 | `workloads.result` | `unknown` | per-kind renderers + one `field(x,"changed")` string key | — | MED | CLEAN — closed by `WorkloadResultByKind` on the wire; `changed` exists at `packages/contracts/src/chat/backfill.ts:9` |
| 4 | `workloads.params` / `workload_schedules.params` | `Record<string, unknown>` | re-parsed against the kind's zod schema at the read seam | — | MED | CLEAN — the read seam re-validates, so a missing key is a parse error, not a silent blank |
| 5 | `characters.extensions` | `Record<string, unknown>` | round-trip only (export/serde) | 344 / 310 | LOW | CLEAN — by construction it is the residue bucket; no named reader |
| 6 | `characters.residualData` | `Record<string, unknown>` | round-trip only | 344 / 228 | LOW | CLEAN — same, scoped to `data.*` (PD-127) |
| 7 | `audit_logs.metadata` | `Record<string, unknown>` | none — "parsed at the read seam **if ever surfaced**" (`packages/db/src/schema/audit.ts:30`) | — | LOW | DORMANT-BY-DESIGN (header states it) |
| 8 | `refinery_runs.payload` | `RefineryStagePayload \| Record<…>` | discriminated arm typed; the open arm is the durability escape hatch | 3 / 3 | LOW | CLEAN — the union's typed arm is what readers use |
| 9 | `refinery_schemas.schema` | `Record<string, unknown>` | it IS a user-authored JSON Schema — an open bag on purpose | 0 rows | LOW | CLEAN (open by nature) |
| 10 | `automation_rules.actions` | `readonly Record<…>[]` | dispatched by action `kind` after parse | 0 rows | LOW | CLEAN |
| 11 | `automation_fires.detail` | `Record<string, unknown>` | diagnostic sidecar, no named reader | 0 rows | LOW | CLEAN |
| 12 | `settings.value` | `JsonValue` | key-space is the setting id; per-setting schemas close it | — | LOW | CLEAN |
| 13 | `chats.runtimeVariables` / `variableValues` | `Record<string, string>` | key-space is USER-authored (macro names) — no fixed vocabulary to drift from | 895 / 0, 490 | LOW | N/A (not the class) |

### F3 — `message_variants.metadata.$.reasoning_duration` has no LIVE producer

**The strongest finding in this audit, and a genuine sibling of `caption_meta`.**

- **Reader (live, three sites):**
  `packages/server/src/domain/stats/write/rebuild-from-canon.ts:435` and `:534`
  (`json_extract(v.metadata, '$.reasoning_duration')`), and the live-delta twin
  `packages/server/src/domain/chat/substrate/stats-delta.ts:191`
  (`Number(metadata?.["reasoning_duration"])`). It accumulates into `reasoningMs` on **three** rollup
  tables (`owner_stats` / `character_stats` / `model_stats`,
  `packages/db/src/schema/stats.ts:75,119,193`).
- **Writer sweep:** the ONLY producer is the SillyTavern import serde,
  `packages/server/src/kit/serde/chat/index.ts:634-646` (`variantMetadata`), reaching the row through
  `packages/server/src/domain/chat/persistence/import-write.ts:322`. `fork.ts:191` merely COPIES it.
  The live turn's canon write path — `packages/server/src/domain/chat/persistence/canon-write.ts`, which
  owns every live `insert(messageVariants)` and `update(messageVariants)` — contains **zero** occurrences of
  `metadata` (literal grep, exit 1 = no match, whole file).
- **Empirical confirmation on the corpus:** `SELECT count(*), sum(json_extract(metadata,'$.reasoning_duration') IS NOT NULL) FROM message_variants`
  → `87904 / 3151`, and every one of those 3,151 is an imported row (`chats.imported_from` is non-null on
  895/895 chats; `message_variants.finish_reason`, a live-only column, is non-null on **1** row).
- **Consequence:** reasoning time is measured for IMPORTED history and is structurally 0 for every turn this
  app generates itself. `owner_stats.reasoning_ms` currently reads 45,225,797 ms — all of it archaeology.

**Verdict: DEAD-READER (half-producer).** The reader is live, the producer exists on exactly one ingest path
and not on the live one. Disposition: either the live turn writes `reasoning_duration` into
`message_variants.metadata` alongside its other economics, or the stat is re-sourced from a first-class
column and the metadata reader is deleted — but the current shape means a user's own reasoning-heavy turns
are invisible to their own stats.

**Note the adjacent, already-paid instance:** the same column had this exact defect on the import side and
it cost a fix — `packages/server/src/kit/serde/chat/index.ts:625-633` records that a NESTED write shape made
`$.reasoning_duration` resolve NULL for 12,718 of 24,824 corpus rows until the 2026-08-08 import-fidelity
audit. That is the second time this one column has produced this class.

### F4 (inverse) — `reasoningMs` / `reasoningGenerations` are computed and never rendered

Not the caption class, its mirror: a PRODUCER with no reader, which `pnpm ast columns` cannot see because
the columns *do* have a reader (the rollup read) — the dead hop is at the VIEW tier.

- Produced: `packages/server/src/domain/stats/write/rebuild-from-canon.ts:219,327,375,481,502` →
  `write/apply-delta.ts:61,87,125,155` → three tables.
- Exposed: `packages/server/src/domain/stats/contract/views.ts:7,94,131`.
- Consumed by the client: **nothing**. `pnpm ast ident reasoningMs --in packages/client` and
  `pnpm ast ident reasoningGenerations --in packages/client` both return 0 matches over **981** scanned
  client files; a literal grep over `packages/client/src` agrees (second method).

**Verdict: SUSPECT.** "Unwired ≠ worthless" (constitution §1) — this is plausibly scaffolded intent for a
stats surface that has not landed. Disposition: wire it into the stats pane or state the intent in the view's
header; do not delete on this evidence alone.

## 4. The `json_extract` path census

Every SQL-path read of a JSON column on the tree — 14 paths, the complete set:

| Path | Column | Producer verdict |
| - | - | - |
| `$.reasoning_duration` ×3 | `message_variants.metadata` | **F3 above — import-only producer** |
| `$.appearance.backgroundAssetId`, `$.appearance.backgroundLibrary`, `$.theme.selectedThemeId` | `user_settings.config` | CLEAN (typed `UserSettings`, covered by the 297-field sweep) |
| `$.assetId`, `$.kind` | `characters.background_override` | CLEAN (typed `ThemeBackground`) |
| `$.background.assetId`, `$.background.kind` | `chats.metadata` | CLEAN (typed `ChatMetadata`) |
| `$.score` ×3 | `characters.refinery` | CLEAN (typed `RefinerySignals`) |
| `${sel.path}` (allowlisted) | `image_embeddings.caption_meta` | FIXED `5e19418b4` |

The pattern is legible and worth stating as law: **a `json_extract` against a TYPED column is safe (the
297-field sweep covers it); a `json_extract` against an OPEN column is the defect surface.** Exactly one such
read exists today outside the fixed one — and it is F3.

## 5. Class C — contract fields consumed-never-populated

2,296 fields / 1,003 distinct names swept; 6 hits, of which 4 are brand phantom-symbols
(`[historyFloorBrand]`, `[chatModelBrand]`, `[credentialBrand]`, `HistoryFloorSeq`) — declaration-only
artifacts of the branded-type idiom, never real fields. Two real findings:

### F1 — `RepetitionDetection` is a fully-plumbed knob with NO origin producer

- **Declared:** `packages/contracts/src/role-clients/index.ts:114-118`
  (`maxPatternSize` / `minPatternSize?` / `minCount`).
- **Read (live wire):** `packages/server/src/infra/providers/vllm/engine/chat-completion.ts:78-85`
  builds the vLLM `repetition_detection` block; emitted at `:110`.
- **Plumbed through five hops:** `infra/providers/contract/roles.ts:81,107` →
  `entry/compose/role-clients.ts:88,99` → `infra/providers/vllm/surfaces/summarize.ts:54,106,184,206`.
- **Writer sweep:** every single assignment site is a PASS-THROUGH (`repetitionDetection: req.repetitionDetection`,
  `opts?.repetitionDetection`) or a TEST. `pnpm ast ident maxPatternSize` → **5 hits over 4,960 scanned
  files**: the declaration, the wire mapper, and three test files
  (`tests/contracts/role-clients/index.contract.test.ts:99`,
  `tests/server/infra/providers/vllm/engine/chat-completion.test.ts:108`,
  `tests/server/infra/providers/backends/agent-sdk/summarize.test.ts:264`). A literal grep for
  `repetitionDetection:` agrees (second method). **No production code ever constructs the value.**
- **Consequence:** the `repetition_detection` block is never emitted in production. The n-gram loop guard the
  contract header advertises ("stops a degenerate loop before `maxTokens`") does not run.

**Verdict: DEAD-READER CHAIN.** The tests pin the shape, so every gate is green — the caption class exactly,
one tier up. Disposition: give it an origin (a preset/summarize-settings knob, the `knob-wire-coverage`
DEFERRED grammar) or delete the five hops. `minPatternSize?` is the same finding one level down (its only
value is the `MIN_PATTERN_DEFAULT` at `chat-completion.ts:76`).

### F2 — `AssembleContext.activeSpeakerCharacterId` is a superseded, documented, zero-consumer field

- **Declared:** `packages/contracts/src/chat/assemble.ts:451-453`, with a doc comment asserting live
  behaviour: *"The identity of the per-speaker turn's active character — drives the `cardScope: "scoped"`
  egocentric history fold. Absent (merged / narrator / solo) ⇒ no fold."*
- **Sweep:** the identifier occurs **exactly once in the repository** — that declaration. Literal grep over
  `packages/`, `tests/`, `playwright/`, `scripts/`: one hit, the declaration itself. `sr-contract-parity.ts`
  classes it `NO-WRITE-NO-READ`.
- **The behaviour it claims IS built — under other names:** the scoped fold runs off `scopedTargetId`
  (`packages/server/src/domain/chat/assembly/shape.ts:372,434`, minted at
  `domain/chat/engine/round.ts:83`) and `speakerCharId` (`domain/chat/engine/engine.ts:1235`).

**Verdict: DEAD-DECLARATION (superseded).** Harmless at runtime, actively harmful to a cold agent: it is a
comment that reads as law on a hot contract. Disposition: delete the field. Note that no lens can find this
class — `orphans`/`apisurface` work on EXPORTS, and this is a field.

### The remaining class-C candidates and why they are NOT findings

An earlier pass of the sweep fenced "producer must live outside `packages/contracts`" and produced 27 hits.
That fence was **wrong** and is recorded here so the next run does not repeat it: `contracts` legitimately
holds pure builders, so a field can be both declared and produced there. `StImportResult.sectionCount`
(produced at `packages/contracts/src/preset/index.ts:3083`, rendered at
`packages/client/src/features/preset/components/preset-import-dialog.tsx:191`) and
`forbidCharacterOverride` (produced at `preset/index.ts:2713`, plus a TanStack-Form field-name path at
`section-drill-in.tsx:364` that no key-based index can see) both looked exactly like the caption class and
are both fully alive. Corrected fence: exclude only the DECLARATION site, never a package.

### F6 — DORMANT-BY-DESIGN, with citations (do not flag these again)

| Field(s) | Dormancy source (verbatim) |
| - | - |
| `RPG_PROFILE_{FREEFORM,D20,SPECIAL}.defaultAttribute` / `.perceptionAttribute` | `packages/contracts/src/rpg/profile.ts:1-4`: *"lite never computes a modifier (no lite code path reads `modifier`/`skillGoverning`/`perceptionAttribute`/`resolution`), but every field ships, populated and validated, because full's check engine consumes the profile AS-IS on arrival — zero re-shape at graft."* |
| `RpgModePolicy.{scenes,clocks,encounters,maps,perception,checks,npcs,loot,timeWeather,requireToolCapable}` | same D86 graft contract — the mode policy is the full-engine capability surface |
| `RpgStatProfile.resolution` (single-arm union) | `profile.ts:29-31`: *"a single-arm union today (`house-d20`) … lite never reads it"* |
| the dormant agent DDL | Spine-Identity-and-Auth.md §4 + D60 — the mint + ceiling were purged 2026-07-25; only DDL survives |

## 6. Class D — registries / dispatch / events, and what is ALREADY gated

`pnpm ast regkeys --all`: 207 informational rows over 192 registries, 130 files scanned. The lens is
**HEURISTIC by construction** and its own header says so; the distribution confirms it — **139 of 207** are
`packages/ui/src/tokens/index.ts`, a GENERATED token table consumed through CSS (and a dead token is already
a `tokens:build` error). The next-largest blocks (`GREETING_TRANSFORMS` 14, `REWRITE_TOGGLES` 6,
`ITEM_ICON_CHOICES` 12) are `Object.keys`-iterated option vocabularies — live rows that look dead here.
**No class-D finding survives triage.** The one row worth a second look, `RPG_PROFILE_*`, is F6 above:
dormant with a citation.

**Already gated — this audit re-derived none of it:**

| Gate | The class it makes unrepresentable |
| - | - |
| `bus-coverage` (D50) | a `ChatBusEvent` member declared, reduced, and never EMITTED |
| `user-bus-coverage` · `automation-bus-coverage` · `domain-events-coverage` | the same ratchet for the user / automation / domain buses (shared reconcile, `scripts/check/bus-coverage-lib.ts`) |
| `warning-code-coverage` | a declared-never-emitted warning code, both tuples |
| `message-kind-policy-coverage` | a `MESSAGE_KIND_POLICY` axis with no production reader |
| **`knob-wire-coverage` (D107)** | **the nearest sibling of this audit** — a settings field/section/leaf, an `AppSettings` key, a `DEFAULT_FORMAT_STRINGS` string, or a `chatMetadataSchema` field that validates + stores but is never WRITTEN or never READ |
| **`testid-liveness`** | **the same shape in another namespace** — a `data-testid` a test SELECTS but nothing MINTS |
| `json-column-write-parity` | two writers of one JSON column disagreeing (key-wise vs whole-replace) — the CLOBBER class, adjacent to but not this one |
| `freeze-provenance-write-pairing` | a `message_variants` write touching part of the D129-F provenance triple |
| `external-id-single-writer` · `assets-single-writer` | write-authority for two specific columns |
| `contract-verb-presence` | a `*Service` method declared and never behaviorally tested |
| `chrome`/`collection`/`home-tile`/`modal`/`section`-`registry-completeness`, `settings-pane-completeness` | half-registration across the client's contribution registries |
| `enforcement-registry-parity` · `verify-registry-parity` | the gate/verify registries drifting from their docs |

**The gap this audit lands on, stated precisely:** `knob-wire-coverage` covers the SETTINGS knob surface and
`json-column-write-parity` covers writer DISAGREEMENT. Nothing covers **a persisted OPEN column's key
vocabulary**, and nothing covers **a role-client / provider knob** (F1 sits in exactly that hole).

## 7. Empirical arm — the live-corpus census, and its honest limits

61 columns are 100% empty on populated tables. **That is a symptom detector, not a verdict**, and it is weak
in one specific direction on this corpus: the database is overwhelmingly IMPORTED (`chats.imported_from`
non-null on 895/895; `message_variants.finish_reason`, a live-only column, non-null on **1** row of 87,904),
so a live-path column reading 0 usually means the live path has barely run — not that it has no writer. All
61 were checked against the class-A sweep (which found writers for all of them); the four worth recording:

| Column(s) | Rows / non-empty | Verdict | Why |
| - | - | - | - |
| `hub_score` on `character_embeddings`, `image_embeddings`, `chat_digests`, `chat_segments` | 327/0, 353/0, 2421/0, 1903/0 | **PRODUCER-EXISTS-NEVER-RUN (ops)** | the writer chain is complete and correct — `domain/discovery/verbs/compute-hub-scores.ts` → the injected `embeddings.writeHubScores` seam (`domain/embeddings/persistence/queries.ts:418-490`) — and it is wired as the `csls` workload (`domain/discovery/workload-contributions.ts:175,184`). It has simply never been run on this corpus. Consequence: `cslsAdjust(distance, hubScore)` (`domain/search/substrate/csls.ts:9`) falls to its null constant for EVERY row, so the CSLS re-ranking is order-identical to plain cosine — a silent, designed degrade. Disposition: an ops item (run `csls`), not a code defect. |
| `characters.source` / `creation_date` / `modification_date` | 344/0 each | **BACKFILL GAP** | the write chain is complete end-to-end: `kit/serde/card/index.ts:297-298` parses `data.creation_date` → `domain/import/substrate/card.ts:185-186` → `domain/character/verbs/create.ts:50-51`. These are the V3 content-promotion columns (PD-127); the 317 imported cards predate them or carried no such fields. NOT a dead reader. |
| `tags.color` / `color2` / `sort_order` | 1713/0 each | **USER-DATA-ABSENT** | full writers exist (`domain/tag/verbs/update.ts:29`, `verbs/set-order.ts`, `persistence/queries.ts:150-156`), and `packages/client/src/features/tag/components/tag-collection-rows.tsx:22-29` documents the "every `sortOrder` is null" fact under an owner ruling. Nothing to do. |
| `chats.user_macro_values` / `runtime_variables` / `standalone_variable_deltas`, most of `message_variants` | 0 | **LIVE-PATH-UNEXERCISED** | typed columns, covered by the 297-field sweep; the corpus simply has \~1 live-generated variant |

## 8. Proposed gate — `open-json-column-key-parity` (DESIGN ONLY, not built)

Per `GATE-AUTHORING.md` §10: *"every audit must answer, per structural rule it lands on … what gate makes the
whole CLASS unrepresentable? A finding fixed by hand REGRESSES."* §0 establishes that the class is confined
to OPEN columns, which makes the attack surface **enumerable** — this gate does not need whole-tree analysis.

```ts
export const gate: GateDescriptor = {
  name: "open-json-column-key-parity",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project", // the verdict compares readers and writers that live in different domains
  scanRoot: (p) => p.includes("packages/db/src/schema/") || p.includes("packages/server/src/") || p.includes("packages/contracts/src/"),
  // DERIVED, NEVER HAND-LISTED (GATE-AUTHORING §10 "key off a LIVE single source of truth"):
  //   OPEN COLUMNS = `text(…, { mode: "json" })` in packages/db/src/schema/** whose `$type<…>()` is
  //   `Record<string, unknown>` / `unknown` / `JsonValue` — the 13 today. An empty derivation on a tree that
  //   HAS a schema is a RED blindness tripwire (§4.6), never a silent pass.
  //   READER KEYS  = every string key addressed at that column's value: a `json_extract(<col>, '$.k')` /
  //   `json_each(<col>, '$.k')` path, an ElementAccess `blob["k"]`, and a one-hop helper `f(blob, "k")`.
  //   WRITER KEYS  = the union of object-literal keys assigned to that column across every
  //   `.values({…})` / `.set({…})` / `onConflictDoUpdate` reaching it, one helper hop (the
  //   json-column-write-parity precedent, which already walks exactly this).
  // VIOLATION = a READER key in NO writer's key set. That is `caption_meta` verbatim.
};
```

Design notes the next author needs:

- **Why the writer walk is affordable:** `json-column-write-parity.ts` already derives the JSON-column set
  from the schema and walks `.set()` arguments one helper hop deep with a taint analysis. This gate reuses
  that traversal and changes only the verdict — key-set difference instead of replace-vs-merge.
- **The exemption grammar** is the two-map, two-sided shape `knob-wire-coverage` uses, not a flat allowlist:
  `DOORWAY` (a sanctioned dormant vocabulary — the D86 graft class) and `DEFERRED` (tracked debt with a
  remediation cite). Both self-clean: an entry whose key GAINED a writer is STALE-RED; an entry naming a
  key that no longer exists is ORPHAN-RED.
- **`mustFlag` must be the founding defect verbatim** — a `caption_meta`-shaped fixture where the writer
  stores `{ model }` and the reader `json_extract`s `'$.artStyle'` — plus a `blob["k"]` spelling. A
  name/shape matcher would pass both, which is the LYING-PROOF failure `GATE-AUTHORING.md` §5 warns about.
- **`mustPass` must pin:** a TYPED column (never judged — the type is the enforcer); an open column whose
  reader key set is empty (`audit_logs.metadata`); a user-authored key space (`chats.runtimeVariables`,
  `refinery_schemas.schema`) where there is no fixed vocabulary to drift from; and a `Object.keys(blob)`
  iteration, which reads no NAMED key and must not be flagged.
- **Coupled sites** (GATE-AUTHORING §2): the descriptor · a `__g_` fixture in
  `tests/tooling/check-gates.int.test.ts` `writeFixtures()` · the `Core-Enforcement-Active-Gates.md` Layer-3
  row · the `(N registered gates)` count line. No new package.json script (it rides `structure:full`).
- **THE BETTER FIX, per column, is to CLOSE THE TYPE.** A gate catches the drift; a contract shape makes it
  unrepresentable, which is what §0 measures. `caption_meta` was fixed exactly that way — one home in
  `contracts`, imported by both sides. Each of the 13 open columns that has a fixed key vocabulary should
  migrate the same way, which turns this gate's exemption table into a **shrinking** allowlist and its
  derivation into a **shrinking** column set. That is the disposition to prefer wherever it is available.
- **What this gate does NOT cover, and what would:** F1 (`RepetitionDetection`) and F2
  (`activeSpeakerCharacterId`) are contract-tier, not column-tier. The natural home for F1 is a new ARM on
  `knob-wire-coverage` (D107) covering role-client sampler knobs — it already owns the
  declared-knob-is-wired ratchet and already has the DOORWAY/DEFERRED grammar. F2 is a field-level orphan
  that no lens sees; a `contract-field-liveness` lens (`pnpm ast`, not a gate — the verdict is a human's,
  the `stringy` precedent) is the right instrument, and `sr-contract-parity.ts` is its prototype.

## 9. Instrument limits — read before re-running any of this

1. **The name-based sweeps under-report, never over-report.** A same-named write anywhere in the corpus
   hides a finding. Every reported hit therefore means "zero writer spellings exist on the tree", which is
   strong; a clean run means "no field whose name is unique to it lacks a writer", which is weaker. This is
   the safe direction for an audit and the wrong direction for a gate — the gate in §7 is column-scoped
   precisely to avoid inheriting it.
2. **A field-name index cannot see a computed write path.** TanStack-Form's
   `name={`sections\[${i}].forbidCharacterOverride`}` is a real producer that no key-based index will find.
   Any tool built on this technique owes a template-literal arm.
3. **`pnpm ast columns` cannot flag a column on an opaque-write table** (59/85). Never cite its zero alone.
4. **The db census is corpus-shaped.** On an import-dominated database, a live-path column reading 0 says
   nothing about its writer. Segment by ingest path before drawing a verdict.
5. **Scratch instruments** used by this lane live at `scratch/sr-*.ts` (gitignored, not committed):
   `sr-json-columns` (the 66-column inventory) · `sr-field-parity` (class B) · `sr-column-parity` (class A
   second method, with its probe-validated known-positive) · `sr-contract-parity` (class C) · `sr-db-empty`
   - `sr-q` (the read-only census over a scratch copy).

## 10. Answer to the owner's question

**Yes — two, plus one ops item, and the class is now bounded.**

- **F3** `message_variants.metadata.$.reasoning_duration` — a live reader with an import-only producer; every
  turn this app generates contributes 0 reasoning ms to three stats tables. Highest severity.
- **F1** `RepetitionDetection` — a six-hop knob chain to the vLLM wire that no production code ever
  originates; the loop guard never runs.
- **F2** `AssembleContext.activeSpeakerCharacterId` — a documented contract field with zero occurrences
  beyond its own declaration, superseded by `scopedTargetId`.
- **F5** `hub_score` on four populated tables — writer complete and wired, never run; CSLS re-ranking is
  silently order-identical to plain cosine.
- **F4** (inverse) `reasoningMs`/`reasoningGenerations` — computed into three tables, rendered nowhere.

And the bound: 754 columns clean by two methods, 297 typed JSON-column fields clean, 2,296 contract fields
yielding two real hits. **The defect cannot live where a type crosses the seam** — which is why the durable
answer is closing the 13 open columns, with the §7 gate as the ratchet that holds the line while they close.
