---
kind: review
status: active
updated: 2026-09-06
---

# Canonical-origin server/contract/test-side family conversion for #1584

Lane `cb-origin-server`, based at `519242add`. Fourteen legacy gates whose only missing primitive was
canonical symbol/member origin are now final `defineGate` policies. Every one of them stood on a SPELLING
where its law is an IDENTITY; the conversion replaces the spelling and keeps the identity claim honest with
a counterfactual per policy that shares the spelling and differs only in the thing that matters.

## Disposition

| Legacy id | Disposition | Authority / severity | Family | Population verdict |
| - | - | - | - | - |
| `providers-runner-seal` | converted | ordinary / error | singleton | exact (1,287) |
| `discovery-no-stats-rollups` | converted | ordinary / error | singleton | exact (44) |
| `turn-identity` | converted | ordinary / error | singleton | exact (10) |
| `membership-enforcer` | converted | ordinary / error | singleton | exact (138) |
| `persistence-no-in-memory-state` | converted | ordinary / error | singleton | exact (104) |
| `no-await-db-in-loop` | converted | ordinary / error | singleton | classified delta (4,423 → 4,416) |
| `test-fixture-imports` | converted | ordinary / error | singleton | exact (2,627) |
| `test-mock-doctrine` | converted | ordinary / error | singleton | exact (2,780) |
| `no-direct-reports-write` | converted | ordinary / error | singleton | exact (2,780) |
| `bounded-list-limit` | converted | ordinary / error | singleton | exact (132) |
| `no-handwritten-wire-json-schema` | converted | ordinary / error | singleton | exact (1,654) |
| `no-hardcoded-side-gen-sampling` | converted | ordinary / error | singleton | exact (1,229) |
| `vector-scope-derived` | converted | ordinary / error | singleton | exact (1,488) |
| `byte-check-cast` | converted | ordinary / error | `drizzle-schema` | exact (30) |

No policy needed an authority split: all fourteen are `ordinary`/`error`, as the manifest rows ruled, and
none carries a sanctioned home that is a recurring repository PERMISSION rather than a per-occurrence
exception. **No reviewed grant was added and none was needed.**

`byte-check-cast` joins the existing `drizzle-schema` family because it consumes `drizzleSchemaFact`; every
other policy has no proven sibling and uses its own id as a singleton family, per the design's rule that a
family means a shared computation and not a shared topic.

## Three shared readers

Two policies each would have re-implemented the same identity question, so it lives in `verify/lib` as a
pure reader over delivered nodes.

- **`lib/sealed-origin.ts`** — `readSealedOrigin(node, home)` answers "does this reference enter through a
  declaration that lives in THIS implementation home", which is what a seal actually claims. Consumers pass
  an absolute-path INFIX rather than a repo-relative path because a canonical declaration is routinely
  OUTSIDE the consuming policy's population, where `ctx.relativePath` refuses by contract. Five policies
  consume it (`providers-runner-seal`, `discovery-no-stats-rollups`, `turn-identity`,
  `membership-enforcer`, `vector-scope-derived`).
- **`lib/drizzle-client-call.ts`** — `readDrizzleClientCall(call)` replaces the `/\b(db|tx)\./` regex the
  N+1 gate stood on. The database handle is a PARAMETER of type `Db` and has no module-member origin of its
  own, but the METHOD is canonical: every query verb on the client and on its builders is declared inside
  the installed `drizzle-orm` package (measured on the live tree — `db.batch` resolves to
  `drizzle-orm/libsql/driver-core.d.ts`).
- **`lib/test-runner-door.ts`** — `readFixtureDoor` plus `registersSnapshotSerializer`. Canonical ORIGIN
  structurally cannot answer the fixture-doctrine question: `tests/support/fixtures.ts` and
  `tests/support/tool-fixtures.ts` both re-export vitest's `expect`, so both resolve to the same external
  declaration. What differs is the door the consumer NAMED (which `ModuleMemberOrigin` preserves by
  contract) and, in the tooling mirror, whether that door installs the RESULT serializer — the exact reason
  §4.8 names a second door, read structurally so either door may be renamed freely.
- **`lib/template-static-text.ts`** — `readTemplateSkeleton` / `readStaticTextOf`. `readStaticString`
  correctly refuses a `TemplateExpression`, but two policies need the quasis and the holes APART: a
  `reports/` prefix is authored in a quasi even when the filename is interpolated, and a SQL
  `length(col) <= <hole>` cap is a quasi skeleton with the cap in a hole.

## Population equality, over one frozen 7,203-path candidate manifest

Both predicates — each legacy `scanRoot` extracted from `519242add` and each final `PopulationExpr` through
`compilePopulation` — were run over the SAME byte set (the final loader's `searchGlobs` corpus). Thirteen
are byte-exact. One classified delta:

`no-await-db-in-loop`: legacy 4,423 / final 4,416. The seven dropped paths are
`packages/client/vite.config.ts`, `packages/db/drizzle.config.ts`, `packages/ui/token-contract.ts`,
`packages/ui/tokens.build.ts`, `packages/ui/tokens.near-duplicate.ts`, `playwright/index.tsx` and
`packages/showcase-plugins/src/index.ts`.

- **Six of the seven were never in the LEGACY corpus at all.** `searchGlobs` adds `packages/*/*.ts` and
  `playwright/**/*.tsx` on top of `harnessGlobs`; the legacy gate ran on `harnessGlobs`, so those package-root
  and Playwright-harness files are an artifact of measuring both predicates over the final loader's candidate
  set. Corpus counts differ by METHOD, not by drift.
- **`packages/showcase-plugins/src/index.ts` is the one genuine drop** — the same one-file delta
  `nullable-column-inequality` recorded, because `@authored`/`@packages` name the six cake packages and
  guest showcase code is not one of them. It admits nothing: its only awaited call inside a loop is
  `readFile` from `node:fs/promises`, which the drizzle reader classifies FOREIGN and which is not in the
  fail-closed verb vocabulary either.

## Old/new finding differential

Legacy replay: the fourteen descriptors extracted from `519242add`, run through the production legacy
dispatcher (`runPass` + `projectCtx`) over the real 7,200-file harness corpus, 14.4 s, zero tool errors.
Final: one `runPolicyPass` over `getWorkspace({types: true})` with the FULL 66-policy final roster as
`knownPolicies` (a hand-picked roster manufactures unknown-policy waiver alarms) and the fourteen selected.

| Policy | Legacy raw | Final raw | Final effective | Classification |
| - | -: | -: | -: | - |
| `persistence-no-in-memory-state` | 42 | 42 | 0 | identical set; all 42 markers translated and consumed |
| `no-await-db-in-loop` | 1 | 8 | 0 | +7 the text regex could not see; all deliberate serialization, waived |
| `test-fixture-imports` | 6 | 0 | 0 | the same 6 sites, FIXED rather than waived |
| every other policy | 0 | 0 | 0 | — |
| `no-hardcoded-side-gen-sampling` | 0 | 2 | **2** | a genuine ladder bypass — see "Open findings" |

### Why the legacy N+1 regex missed seven real sites

The former `DB_QUERY_RE` needed `db.` or `tx.` ADJACENT to a verb in the expression's own text. Three ways that failed
on the live tree, all of them formatting or vocabulary rather than semantics:

- `db.selectDistinct(…)` — the pattern's `select\b` has no word boundary before `D`;
- `await db\n  .select(…)` — a formatted chain puts a newline and indentation between `db` and `.select`;
- a tagged-template read spelled `db.all<Row>(…)` — `all` was not in the verb vocabulary at all.

The canonical reader has none of those seams, because it asks the checker where the called METHOD is
declared. All seven are genuinely deliberate and now carry positioned waivers with end conditions: a
per-registry-row fan-out and a bound-variable chunk loop (`assets/persistence/asset-refs.ts`), two
converge-to-fixpoint json_set migrations, one per-row owner-scoped backfill, and two keyset-paginated
streaming scans (`stats/write/rebuild-from-canon.ts`).

## Three policy defects the differential caught

Each is fixed with a committed control row, and each is the same class: a fail-closed or value-following
rule applied one step too widely.

1. **Fail-closure belongs to a DECLARED import door.** `test-fixture-imports` treated an unresolved door as
   fail-closed on its MEMBER arm too, so `pattern.test(value)` and a property named `expect` reported —
   **89 confident false positives**, nearly all `RegExp.prototype.test`. A member read whose receiver is not
   a namespace import is NOT A SUBJECT, which is a different answer from "unproven innocence".
2. **A door resolving to a FILE is not a project door.** A typed workspace resolves a package specifier to
   its shipped declarations, so `@playwright/experimental-ct-react` answers `getModuleSpecifierSourceFile()`
   with a real file — classified as a composed project door, the tooling mirror then demanded a serializer
   registration from a third-party package. Four false positives, on the two CT specs that legitimately
   enter through the CT runner. Doors under `node_modules/` are external.
3. **A MEMBER-MUTATED binding is not an authored literal.** `resolveStableExpression` resolves a binding to
   its initializer and says so explicitly — value readers refuse member effects SEPARATELY. Following a
   transpiler root that is seeded `{ type: "object", … }` and then assembled (`root["required"] = …`)
   accused `packages/contracts/src/refinery/schema-forge.ts`, which is the derive D79 encourages. Both
   `no-handwritten-wire-json-schema` and `no-direct-reports-write` now refuse a written binding.

## Two rulings recorded rather than silently taken

1. **ONE ROUND TRIP PER ITERATION IS ONE FINDING, because finding granularity must match WAIVER
   granularity.** A positioned marker binds to its carrier and suppresses only when EXACTLY ONE finding of
   its position token lies inside it; the central engine calls a marker matching two findings OVER-BROAD and
   suppresses neither. So two awaits in one carrier make a legitimate site unwaivable BY CONSTRUCTION. The
   live shape that proved it is a ternary whose branches are MUTUALLY EXCLUSIVE
   (`assets/persistence/asset-refs.ts`): one statement, two awaited queries, one round trip per iteration.
   `no-await-db-in-loop` therefore reports once per waiver carrier. The recorded cost is a slight
   under-report where one statement genuinely makes two round trips; the finding still fires and its fix
   addresses the statement.
2. **`maxTokens` is SHARED VOCABULARY and the policy asks the OBJECT to corroborate.** It names the
   summarize seam's output cap AND the transcript budget `ResolveCanonWindow` takes
   (`chat/contract/context.ts`). An ambiguous key is read as a sampling knob only when its own object
   literal also carries an unambiguous one (`temperature`/`topP`/`maxOutputTokens`). Which word names which
   concept is not decided in a gate (`AGENTS.md` §3 → `docs/design/vocabulary-map.md`); this is the
   fail-quiet reading until that map rules. DECLARED LIMIT: a lone `{ maxTokens: N }` sampling bag is out of
   subject, and `rpg/verbs/game/resync-from-story.ts` is the live shape the rule protects.

## Real-tree final pass

`runPolicyPass` over `getWorkspace({root, types: true})`, 66 known final policies, the fourteen selected,
`reviewedGrantsFor(policies)` (empty — this family needs none):

- 7,207 loaded sources; 4.7 s workspace + 37.0 s pass = **43.03 s wall, 5,581,224 KiB peak RSS**, zero
  swaps, zero major page faults;
- `drizzleSchemaFact` ready over its exact 30 files: 1,288 members, zero unresolved, 9.2 s (shared);
- owner status `success` for all fourteen, **nothing withheld**, zero fact errors, zero policy tool errors,
  zero authority tool errors, **zero authority alarms**;
- **raw 52 = waived 50 + granted 0 + effective 2**; all 50 waivers consumed exactly once.

Per-policy cost is concentrated where the population is: `no-await-db-in-loop` 6.6 s over 4,419 files,
`test-fixture-imports` 3.5 s over 2,627, `byte-check-cast` 3.1 s over 30 (its cost is the shared fact's
table/column resolution, not its own walk), `vector-scope-derived` 2.5 s over 1,488. The legacy replay of
the same fourteen cost 14.4 s over a 7,200-file corpus, of which `vector-scope-derived` alone was 6.3 s.

## Open findings this conversion surfaced

**`no-hardcoded-side-gen-sampling`, 2 effective, `packages/server/src/domain/embeddings/indexer/caption.ts:64-65`.**
`analyzeAvatarImage` hardcodes `temperature: 0.2` / `maxTokens: 512` through two module-local constants.
This is a GENUINE side-gen ladder bypass: the burn-down converted the `/autobg` caption path
(`entry/compose/imagery.ts:145` folds `SIDE_GEN_POSTURES.caption` under the caller's preset params) and left
the embeddings indexer's avatar-analysis path behind. It is NOT waived, deliberately — a waiver here would
be a `// TODO` wearing a marker, and the exception grammar is for permanent deliberate exemptions.

The fix is a product decision this lane does not own: `SIDE_GEN_POSTURES.caption` is an EMPTY floor, so
routing through it as-is would silently drop the indexer's values; the honest fix mints a posture for the
avatar-analysis call and threads the asset owner's preset params into a background sweep that resolves no
caller today. Generation settings are preset-owned (`gen-settings-are-preset-owned`), so the catalog member
is an owner-adjacent call. **This needs its own row.**

## Verification

| Check | Result |
| - | - |
| family conformance (`tests/tooling/verify/gates/origin-server-family.test.ts`) | green — 14 policies, 159 proofs |
| the four shared readers' own specs (`tests/tooling/verify/lib/{sealed-origin,drizzle-client-call,test-runner-door,template-static-text}.test.ts`) | green — 29 tests; each reader ARMED (neutering its comparison reds exactly the rows that assert it) |
| fixture-resolution control (every relative specifier in every final proof) | 323 checked corpus-wide; within the fourteen the only 5 unresolved are the deliberate `./missing*.ts` fail-closed rows (the other 2 belong to `no-raw-id` / `no-mint-via-cast`, below) |
| tooling type program (`ts7.cjs -p tooling/tsconfig.json`) | green, zero errors |
| scoped biome + eslint on all 45 touched `.ts`/`.tsx` files (of 47 touched) | green, both exit 0 |
| population equality over a frozen 7,203-path manifest | 13 exact, 1 classified |
| legacy replay + final real-tree pass | see above |
| the three re-doored sibling specs (`id-brand-flow`, `ledger-banned-shapes`, `schema-fact-wave-1`) | green, 4 tests |

**A FIXTURE-RESOLUTION CONTROL IS WORTH KEEPING AS A HABIT.** Eight cross-package relative specifiers in
this family's own proofs resolved to nothing, which would have made every alias / re-export / namespace
identity row pass by FAIL-CLOSURE rather than by identity — a lying proof that conformance reports green.
Within the fourteen, 5 unresolved specifiers remain and all five are the deliberate `./missing*.ts`
fail-closed rows.
The same sweep found two pre-existing unresolved specifiers in another lane's rows,
`no-raw-id mustPass[0]` (a fixture path — there is no `packages/contracts/src/x.ts` on the real tree —  → `../../../kit/src/ids/index`, three ups from a
three-segment directory) and `no-mint-via-cast mustPass[2]` (a fixture path — there is no `tests/server/x.test.ts` on the real tree —  →
`../../../packages/kit/src/ids/index`). Neither is fixed here — they are not this lane's files — but
`no-raw-id`'s row is the one that claims the canonical kit schema is RECOGNIZED, and it cannot currently
prove that.

## Known limits, written down

- Every seal's candidate PREFILTER is the sealed NAME, so a barrel that re-exports a sealed symbol under a
  DIFFERENT name is outside the subject. The legacy name readers missed it too, so this is a written
  baseline rather than a regression; closing it means resolving a canonical origin on every identifier in
  the population, which does not finish in ten minutes.
- `turn-identity`'s uppercase arm is a DELIBERATE NARROWING: a genuinely foreign export named `Principal`
  now passes. Its lowercase `principal` vocabulary arm remains the name-ban backstop, and both halves carry
  rows.
- `persistence-no-in-memory-state` does not see an immutable ALIAS of the ambient constructor
  (`const Store = Map; new Store()`), for the same prefilter reason.
- `byte-check-cast` reads byte intent from the cap's NAME only. A cap the reader cannot name (a call result)
  carries no evidence and stays quiet; the KiB/MiB-comment fallback the issue floats has zero live cases.
- `bounded-list-limit` remains `limit`-scoped by design; `topN` fields carry the same bomb class and are
  bounded by hand in `search.*`.
- `test-fixture-imports` bans the two doors the doctrine names. The CT runner is a third external door and
  is out of subject, with its own row.
- `no-await-db-in-loop` sees only a DIRECT Drizzle method call. A domain HELPER that itself hits the db
  inside the loop is structurally invisible — `character/persistence/backfill-plugin-provenance.ts:87`
  calls `resolveInstalledPluginId(db, …)` in the same loop body as the waived write at :92, and only the
  write is seen. Closing it needs a call-graph fact (does this function reach a drizzle call?), which no
  shared reader supplies today. The legacy text regex was blind to it too, so this is a written baseline
  rather than a regression.
- The root graph type program is red at 12 pre-existing errors across five legacy/final harness-caller test
  files (`policy-loader`, `policy-plan`, `render.int`, `resource-declaration`, `scoped.int`) — the known-red
  state the checkpoint records. None is in a file this lane touched.
