# 1085: ordinary cohort Type questions stay within what readers read

## Outcome

The ordinary-cohort planner now plans only the column questions its readers can actually look up.

- Normalizer (`_output`) questions: only at `.parse` calls, the member every normalizer reader gates on.
- Remap field-at-call questions (the 1070 arm): only for fields that can be the remap receiver. That is a field whose declared Type carries the member, or a field the narrowed receiver Type is assignable to (see the verifier correction below).

The db and server ordinary cohorts both complete on single-program runs. Neither hits a Map overflow or runs out of heap. The client failure on `check:ledgers-fresh` is a different planner (`captureTypeObservations`, types mode). Neither narrowing touches it, and it still runs out of heap. Its contributors are measured below and owed as a new item.

## Reader census

Selector readers of schema-column and `_output` questions:

- ast-grep `{ kind: "property", name: "_output", $$$ }`: ts 8826 files scanned, 4 matches; tsx 1653 files scanned, 0 matches.
- ast-grep `{ kind: "schema-column", $$$ }`: ts 8826 files, 13 matches; tsx 1653 files, 0 matches.
- Cross-checked with `rg '"_output"|_output'` and `rg '"schema-column"'` over tooling, tests and scripts.

| Reader | Asks | At which calls |
| - | - | - |
| `tooling/src/verify/lib/json-column-origin-context.ts:115` | whole column | any normalizer call it is handed |
| `tooling/src/verify/lib/json-column-origin-context.ts:121-133` | `_output` on `proof.schema`; whole column; every `shape.vocabulary.properties` field at `args[0] ?? call` | only calls where `readJsonColumnNormalizer` resolves, which requires `member.name === "parse"` declared by zod (`json-column-normalizer.ts:327`); `readNormalizer` also asserts the call is in `closureCalls` (`json-column-origin-context.ts:87-91`) |
| `tooling/src/verify/lib/json-column-merge-proof.ts:288-301` | `_output` on `normalizer.schema`; whole column | only when `jsonColumnNormalizer(call)` is defined, the same `parse` gate |
| `tooling/src/verify/lib/json-column-array-field-proof.ts:169-175` | one field (`target`, `field`) at a remap call, then `nonnullable` | only `ORDINARY_ARRAY_REMAPS` members whose receiver traces to that column field and has the member installed (`installedMember`, `:38-50`) |
| `tooling/src/verify/gates/json-column-read-parsed.ts:75` | column `nonnullable.array-element-or-self` | not call-dependent; unchanged |
| `tooling/src/verify/lib/json-column-observed-readers.ts:119-137` | generic lookup through `typeSelectionIndex` | pass-through; refuses a missing selector (`type-projection-contract.ts:332`) |

The remaining matches are codecs and replays (`type-projection-codec.ts`, `ordinary-observations-codec.ts`, `type-observations*.ts`, `type-projection.ts`). They carry planned selectors through and never nominate them.

The answer to the brief's questions:

- **Which calls?** `.parse` calls whose receiver has `_output`. An element-access callee is included too, because a consumer can resolve a computed key the planner's default reader cannot. That matches what 1070 did for remaps.
- **Which fields?** At a parse call: every property of the column's override Type (`observedNormalization` loops all of them). At a remap, either of two conditions plans the field. (1) Some union arm of the field's declared Type has that remap member, or is any, unknown or a type parameter. (2) The narrowed receiver Type at that call is assignable to the field's declared Type, because a guard narrows a value only to a subtype of its declaration.

## Fix

- `tooling/src/floor/code-facts/ordinary-observations-contract.ts`: `ORDINARY_NORMALIZER_MEMBER` is the one home of `"parse"`. The planner imports it, and so does `readJsonColumnNormalizer`.
- `tooling/src/verify/lib/json-column-array-field-proof.ts`: `PURE_MEMBERS` derives from `ORDINARY_ARRAY_REMAPS` instead of spelling `filter` and `map` again, so the remap set has one home.
- `tooling/src/floor/code-facts/ordinary-type-questions.ts` (new): the planner, moved out of `ordinary-observations.ts`, which was over the 450-line tooling cap (`eslint.config.js:4588-4592`) at 558 lines. It is now 398, and the new file is 199.
  - `columnCallSite` sets `parser` only at `parse` (or a computed key).
  - `typedColumn` computes each column's per-remap field list once per cohort with `carriesMember`.
- A missing selector still refuses ("native Type selector was not captured in this ordinary cohort", `type-projection-contract.ts:332`). Nothing falls back.

## Red / green

`tests/tooling/floor/code-facts/ordinary-normalizer-plan.test.ts` (new):

- Red on the unmodified planner: with 40 unrelated zod builders, `outputs` was 81, and fields were planned at every builder's argument (`enabled@z.string().min(0).optional()`, `enabled@0`, and so on).
- Green: `few` equals `many`. One `_output`, and fields `enabled@input`, `label@input`, `tags@input` at the real `.parse`.

`tests/tooling/floor/code-facts/ordinary-column-call-plan.test.ts` (1070's test, extended):

- The schema adds `items: Bag`, a non-array class with its own `map`, and `notes: string[] | null`, plus a `filter` remap.
- Red on the old planner: the map call planned `enabled`, `items`, `label`, `notes`, `tags`.
- Green: map plans `items`, `notes`, `tags` (the class-with-`map` control holds), and filter plans `notes`, `tags`.

## Single-program proofs

Every run was under `heavy.lock`, with `setsid` and a `timeout` that signals the whole group at 30 minutes, and `/usr/bin/time -v` for wall time and peak RSS. The db and server runs used a scratch harness, `cb-1085-cohort.ts`. It builds the json-column cohort the worker builds: roots are every population call the program owns, plus reads for read-parsed, with `JSON_COLUMN_READ_TERMINALS` inside one reference pass, as the worker does in `semantic-inventory-extract.ts:401`. It then calls `captureOrdinaryObservations` with `captureTypeSelections`. Old counts are probe estimates: typed fields × (calls with an `_output` receiver + remap sites).

| Program and cohort | Calls | Old plan (field keys) | New selectors | Wall | Peak RSS | Result |
| - | - | - | - | - | - | - |
| db, json-column-writes (`packages/db/src/schema/**`) | 6,196 | 22,714,956 (over 2^24) | 178,482 | 9:15 (no reference pass) | 1.79 GB | completed |
| server, json-column-read-parsed (`**/persistence/**`, 153 files) | 18,691 | 46,027,674 | 2,342,429 | 2:51 | 7.76 GB | completed |
| server, same cohort, parse narrowing only (from the focused structure run) | 18,691 | 38,256,768 normalizer keys alone | 10,085,037 | 15:25 (run) | 18.0 GB (tree) | worker heap OOM at 16 GB |
| client, caught-failure population regen narrowed to `packages/client/` (real worker path) | n/a | n/a | n/a | 7:09 / 8:30 | 17.3 GB | worker heap OOM, SIGABRT |

- The server read-parsed cohort has the same call count (18,691) as the cohort the focused `check:structure --check json-column-read-parsed` run reached. The harness rebuilt that exact cohort.
- The server json-column-writes cohort (`packages/server/src/domain/**`) timed out at 30 minutes, before planning, in a harness run without a reference pass. That run is not a verdict: the read-parsed harness also timed out without a pass and finished in 2:51 with one.
- No orphaned semantic-inventory workers from this worktree were left after any run.

### Client contributors (temporary probe in `createTypeObservationCapture`, removed)

At 750,000 selectors the worker heap was 13.8 GB. That is about 18 KB per selector, so the cost is retained checker Types, not Map size. The plan shapes:

- `node` base with no steps: 64,021
- One `property` step, for each of `then`, `ok`, `kind`, `status`, `step`, `verdict`: 64,020 each
- Two `property` steps: 41,371 each
- Three `property` steps: 5,985 each
- `type-argument`: 11,336
- `union-part`: 5,019
- Other sizes: symbols 26,013; nodes 64,021; unions 68,452; definitions 33,072.

The driver is the `symbol-closure` question in `tooling/src/verify/lib/caught-failure-native.ts:58-75`. It asks the six `PROPERTIES` at every node of a 64k-node closure, and again on each nested property and union-part step.

## Verifier correction (second commit)

The verifier refuted 562bc8d16f on one P2. The remap test read only the field's declared Type, but the reader asks whenever the receiver traces to the field. A field declared `object`, `{}`, `Iterable<number>` or `ArrayLike<number>` that a user-defined guard narrows to `number[]` was not planned, so a write the parent proved threw "native Type selector was not captured".

The fix adds condition (2) above. It uses the checker (`Type.isAssignableTo`) with the receiver at the call as the array Type. The public checker API has no array-type constructor to test against a generic `any[]`. Results are cached per (receiver, field) Type pair.

- Red on 562bc8d16f: the extended `ordinary-column-call-plan` failed, missing `loose: object` at the `map` call. Green after.
- The case asserts `extra: Iterable<number>` is planned at a guard-narrowed `filter`, and `object` is planned at every remap. `Bag` is planned too: the checker finds `number[]` assignable to a class whose only member is a compatible `map`.
- The verifier's probe (`ArrayLike`, `object`, `{}`, `Iterable<number>` and the `number[]` control) reports no missing questions on the fix.
- Server read-parsed cohort re-measured under the heavy lock: 2,342,474 selectors (2,342,429 before), 6.75 GB peak, 4:58.

## Verifier correction (third commit)

The re-verify of 6f7819b655 found one more P2. The reader's tracer strips `as`, `satisfies` and parentheses (`expression-value.ts:5-11`) before it follows the receiver to the field, but rule (2) tested the cast Type. With `extra: Iterable<number>`, `(current.extra as unknown as string[]).map(...)` was proved keywise and asked about `extra` at that call, which was not planned.

The fix: when the remap receiver chain holds an assertion the reader strips, every field is planned at that call. That is 1070's behavior, applied only to that call. The chain is walked with the reader's own `unwrapExpression`, through inner remap calls and raw `const` initializers. `resolveStableExpression` unwraps what it returns, so it would hide the cast (`reference-fact.ts:602`).

- Red on 6f7819b655: `ordinary-column-call-plan` failed at the direct-cast `map` (missing `enabled`, `extra`, `label`). Green after. A const-bound cast at `filter` is asserted too.
- The verifier's probe2 passes 9/9 with no missing questions (the three cast variants, a null-union guard, and the five probe-1 cases).
- Server read-parsed cohort under the heavy lock: 2,486,866 selectors (2,342,474 before), 8.23 GB peak, 3:07.
- Residual, not covered: a cast passed through a call argument and remapped on the callee's parameter. The reader's binding trace can carry the field into the parameter, and the parameter's declared Type need not relate to the field. That case still fails closed with "selector not captured". Closing it needs the planner to follow call bindings the way the tracer does.

## Owed

- A new item for the client caught-failure type-observation plan size (above). `check:ledgers-fresh` stays blocked on it. It is outside this lane's fences: `caught-failure*` files.
- `structure:full` on merged main (primary).
- A server json-column-writes cohort proof with a reference pass, if primary wants one beyond structure:full.
