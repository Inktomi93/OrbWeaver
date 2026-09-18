---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave9 — closing the debt wave 8 left: `origin-server`'s 14 on §4.1 and the third answer (#1584)

Read-only adversarial audit of the fourteen SERVER-plane policies imported by
[`tests/tooling/verify/gates/origin-server-family.suite.test.ts`](../../../tests/tooling/verify/gates/origin-server-family.suite.test.ts).
[`v-audit-wave8-2026-09-12.md`](v-audit-wave8-2026-09-12.md) audited them on the corpus-wide axes only and
declared, in its own "What I did NOT cover" list, that **`origin-server`'s §4.1 narrowing cuts and §4.5/#944
reachability probes were uncovered for all 14**. This document closes exactly those axes, plus a
re-derivation of §5b.5/§5b.3 and one axis where wave 8's number is WRONG.

Every number below came out of a run produced in this session, in the isolated worktree
`.claude/worktrees/agent-a0cc823523214ee98` at `396b4024b`. Every probe was a scratch-driven
`cp`-equivalent (`<module>.ts` → `<module>.ts.w9bak` → mutate → run → restore in a `finally`, asserting a
sha256 byte identity every time; every line of every run printed `RESTORED-IDENTICAL=True`). No
`git stash`/`checkout`/`restore`. **No shared-tree file was touched** — the gate modules probed live in this
lane's own worktree — so no mid-run probe announcement was owed.
`find tooling/src/verify/gates -name '*.w9bak' -o -name '*.bak'` returns nothing and
`git status --short` is EMPTY after the final round.

## Subject set

| Family | Policies |
| - | - |
| **origin-server** (14) | `bounded-list-limit` · `byte-check-cast` · `discovery-no-stats-rollups` · `membership-enforcer` · `no-await-db-in-loop` · `no-direct-reports-write` · `no-handwritten-wire-json-schema` · `no-hardcoded-side-gen-sampling` · `persistence-no-in-memory-state` · `providers-runner-seal` · `test-fixture-imports` · `test-mock-doctrine` · `turn-identity` · `vector-scope-derived` |

### Fresh vs re-audit — and the running total does NOT move

- **All 14 are FRESH on the two axes this wave exists for** (§4.1 narrowing cuts, §4.5/#944 reachability).
  Wave 8 assigned no verdict on either; grepping the seven earlier audit documents
  (`v-exemplar-audit`, `v-audit-wave2`…`wave7`) for each id returns **no match at all for 13 of 14**, and
  exactly one match for `byte-check-cast` (`v-audit-wave3-2026-09-12.md:141`, one row in that wave's
  `drizzleSchemaFact` receipt-routing table). I did not re-derive that wave-3 row.
- **All 14 are a RE-AUDIT on §5b.5 and §5b.3**, which wave 8 measured. I re-derived both mechanically
  because the brief asked for this subset's rate; my numbers CORROBORATE wave 8 on both.
- **The running total stays at 101 of 167.** These 14 were already counted by wave 8. Adding them again
  would be wave 5's double-count. What changed is that their verdicts are now EARNED rather than withheld.

## FLOOR — `pnpm check:structure`, one invocation, no wrapping `timeout`

Read from the run's own artifact (`reports/runs/structure/agent-a0cc823523214ee98-3814066-2026-09-12T01-05-49-740Z/check-structure.json`), not scrollback:

```
final policies: 171 ran · raw 1379 = waived 1150 + granted 105 + effective 124 (66 error, 58 warning)
  · 0 alarm(s) · 0 tool error(s) · 0 withheld
single-pass: ran 275/275 active gate(s) (104/104 legacy · 171/171 final) of 275 corpus file(s) — run COMPLETE
```

**`0 tool error(s)` · `0 withheld` · `0 alarm(s)`**, exit 1 (the ordinary-violation mid-migration
baseline). No subject policy is blinded (#1972) and none withholds. Every finding below is about PROOF —
none is a policy that failed to run. (Raw is 1379 here against wave 8's 1450 at `8fac273c3`; the subject
modules themselves are byte-identical to wave 8's tree — `git log 8fac273c3..HEAD -- <module>` is empty for
them — so the delta is sibling-lane traffic elsewhere in the corpus, not a moving subject.)

## Headline

**All 14 are FINAL `defineGate` modules, all 14 pass conformance, and 14 of 14 are REFUTED.**

1. **FIVE CONFIRMED FALSE POSITIVES ON PRISTINE SOURCE — no cut applied.** Five of the fourteen test
   `readSealedOrigin(…).kind !== "foreign"` directly instead of calling the shared
   `sealedOriginReports(verdict, anchor)`. That conflates "an unreadable import door" with "a member read
   that provably binds something else", which is the precise conflation the shared reader's own doc
   comment says produces false positives. A local object literal whose KEY is spelled like the sealed
   export is accused by all five. **A one-line fix is proven** (below). This is D1 and it is the wave.
2. **§4.1: 107 cuts, every one with its DIRECTION. Naive clean 49 (46%); classified UNENFORCED 34 (32%)
   — a naive over-report of 44%**, in line with wave 7's 71% and wave 8's 73% after the same four rules.
3. **The #944 third answer is REACHED in 11 of 14** — the best rate the program has measured
   (wave 6: 3/12 · wave 7: 1/11 · wave 8: 7/8 on a smaller set). The three misses are each a comment or a
   `mustFlag` row's own label asserting a fail-closure no row executes.
4. **§5b.5 fails 14 of 14** — zero FAMILY lines, zero POPULATION PORT lines, zero legacy SHAs, and 13 of 14
   declare a singleton family with no stated reason. Corroborates wave 8's 25/25.
5. **Wave 8's `token` claim for this family is WRONG and I am correcting it.** Wave 8 reported "78 rows
   carry `token` (every origin-server row)". The mechanical census over the same, byte-identical files is
   **79 `mustFlag` rows, 79 with `count`, 77 with `token`** — `vector-scope-derived` carries two rows whose
   expectation is `expect: { count: 2 }` with no `token` at all.

| Property | Wave 6 (12) | Wave 7 (14) | Wave 8 (25) | **Wave 9 (14)** |
| - | -: | -: | -: | -: |
| `mustFlag` rows with no `count` | 0 of 61 | 0 of 71 | 0 of 155 | **0 of 79** |
| `mustFlag` rows with no `token` | — | — | (claimed 0) | **2 of 79** |
| §4.1 narrowings genuinely UNENFORCED | — | 17/85 (20%) | 11/46 (24%) | **34 of 107 (32%)**, naive 49 (46%) |
| #944 third answer REACHED | 3 of 12 | 1 of 11 | 7 of 8 | **11 of 14** |
| Header records FAMILY / POPULATION PORT | — | — | 0 of 25 | **0 of 14** |
| `fix` names the exact waiver spelling | 1 of 12 | — | 3 of 14 | **3 of 14** (same three) |

## D1 — the sealed-origin conflation: five false positives, one line each (HIGH)

`lib/sealed-origin.ts:41-52` ships `sealedOriginReports(verdict, anchor)` and its doc comment states the
rule verbatim:

> *"an `unresolved` verdict is SCOPED by the shared refusal classifier: a DECLARED import door with no
> reachable target is unreadable and reports … while a member read that provably binds something else — a
> local object's key, a project interface's property — is simply not a subject. Conflating the two is how a
> seal acquires either permanent exemption rows or a silent green."*

Census of the whole gates tree:

| Calls `sealedOriginReports` (correct) | Compares `readSealedOrigin(…).kind` directly |
| - | - |
| `content-part-seam` · `empty-state-has-action` · `no-direct-users-read` · `scrubber-home` | **`discovery-no-stats-rollups` · `membership-enforcer` · `providers-runner-seal` · `turn-identity` · `vector-scope-derived`** · `untrusted-regex-safe-exec` |

Five of the six conflating modules are in this subject set. (`untrusted-regex-safe-exec` is outside it; I
measured nothing about it and only report that it carries the same shape.) Three of the four CORRECT
modules are wave 8's home-server set — so the right pattern and the wrong one landed in the same program.

**The probe is a `mustPass` row added to PRISTINE source with no cut anywhere.** All five FAILED:

| Module | Row added to `mustPass` | Result |
| - | - | - |
| `discovery-no-stats-rollups` | `const bag = { ownerStats: 1 };\nexport const n = bag.ownerStats;` in `domain/discovery/lib/` | **RED** — `the stats rollup tables … are stats' alone` |
| `membership-enforcer` | `const bag = { fetchOwned: (a: string): string => a };\nexport const n = bag.fetchOwned;` in `domain/chat/verbs/` | **RED** |
| `providers-runner-seal` | `const bag = { deriveRunner: (a: string): string => a };\nexport const n = bag.deriveRunner;` in `domain/chat/` | **RED** |
| `turn-identity` | `const bag = { Principal: 1 };\nexport const n = bag.Principal;` in `domain/chat/engine/` | **RED** |
| `vector-scope-derived` | `const bag = { chatDigests: 1 };\nexport const n = bag.chatDigests;` in `domain/hub/` | **RED** |

Each module's own comment above the offending line advertises fail-closure on an *unreadable door*
(`"FAIL-CLOSED: a rollup NAME whose origin cannot be read is reported"`,
`"Only a PROVEN foreign declaration acquits"`, `"a candidate whose origin cannot be read is not evidence of
innocence"`). Not one of them says it also accuses a local object's key — and none has a row that would
have shown it.

**THE FIX IS PROVEN, one line.** On `discovery-no-stats-rollups`, replacing

```ts
if (readSealedOrigin(hit.anchor, STATS_ROLLUP_HOME).kind !== "foreign") {
```

with

```ts
if (sealedOriginReports(readSealedOrigin(hit.anchor, STATS_ROLLUP_HOME), hit.anchor)) {
```

and keeping the probe row **goes to `FAILURES=0` while `mustFlag[4]` — the unreadable-door fail-closed row —
STILL FLAGS**. Control (pristine + row): 1 failure. Armed (fix + row): 0 failures.

The scale is not hypothetical: `test-fixture-imports`, in this same family, documents that reading an
unresolved MEMBER door as fail-closed *"produced 89 confident false positives on the real tree, nearly all
of them `RegExp.prototype.test`"* and scopes its fail-closure to a declared import door for exactly that
reason. **The counter-example and the fix both already live inside the family being copied from.**

## §4.1 — 107 cuts, each with its DIRECTION

Every cut states what the predicate was replaced WITH, because §4.1's worked failure is an auditor who
substituted a different wrong value and manufactured a false UNENFORCED. **Direction rule: the cut must make
the policy flag MORE.** Every population cut ran with at least one in-population anchor fixture present; no
run produced a `[population]` tool error.

| Module | Cuts | Naive clean | UNENFORCED | DEAD | REDUNDANT | PREFILTER |
| - | -: | -: | -: | -: | -: | -: |
| `bounded-list-limit` | 8 | 4 | 4 (1 falsified) | — | — | — |
| `byte-check-cast` | 10 | 6 | 5 | — | 1 | — |
| `discovery-no-stats-rollups` | 5 | 2 | — | — | — | 2 |
| `membership-enforcer` | 7 | 2 | — | 1 | — | 1 |
| `no-await-db-in-loop` | 7 | 4 | 3 | — | 1 | — |
| `no-direct-reports-write` | 7 | 5 | 3 | 2 | — | — |
| `no-handwritten-wire-json-schema` | 6 | 3 | 3 | — | — | — |
| `no-hardcoded-side-gen-sampling` | 10 | 4 | 3 | 1 | — | — |
| `persistence-no-in-memory-state` | 7 | 4 | 2 | — | 2 | — |
| `providers-runner-seal` | 5 | 1 | 1 | — | — | — |
| `test-fixture-imports` | 9 | 3 | 1 | — | — | 2 |
| `test-mock-doctrine` | 7 | 3 | 3 (1 falsified) | — | — | — |
| `turn-identity` | 6 | 1 | — | — | — | 1 |
| `vector-scope-derived` | 13 | 7 | 6 | — | — | 1 |
| **Total** | **107** | **49** | **34** | **4** | **4** | **7** |

Classification rules applied, and what each one cost:

- **DECLARED PREFILTER, clean by design (7).** A candidate-NAME prefilter in front of an identity fence
  whose discriminating half REDs. Every one was verified by showing the half behind it red: `discovery`'s
  home infix REDs 1, `membership-enforcer`'s REDs 1, `turn-identity`'s REDs 1, `vector-scope-derived`'s REDs 1.
  `test-fixture-imports`' two are covered by TF3–TF6 (RED 1/1/2/2). **These are 7 of the 15-cut gap between
  naive and classified, and `providers-runner-seal` shows the OTHER outcome is reachable** — widening ITS
  import prefilter REDs its own `mustPass[4]` DECLARED LIMIT row, so a prefilter CAN be pinned and six of
  the seven simply are not.
- **MUTUALLY REDUNDANT (4).** Clean alone, RED when cut with the sibling. The clean example is
  `persistence-no-in-memory-state` (below); `byte-check-cast`'s `member.value.name !== RAW_MEMBER` is
  redundant with `isDrizzleExport(… RAW_MEMBER)` beside it; `no-await-db-in-loop`'s `verdict.kind ===
  "foreign"` early return is redundant with the positive `verdict.kind === "drizzle" || failClosed` test
  eight lines down (the arm IS reached — a `throw` there fires on 2 rows — it just changes no verdict).
- **DEAD BRANCH (4).** The cut came back clean because NO declared row reaches the branch; a `mustPass`
  row would not fix it. `membership-enforcer`'s bare-identifier `ownerId` arm (a `throw` inside
  `Node.isIdentifier(operand)` fires on **zero** of its 10 rows), `no-direct-reports-write`'s two
  object-literal tests (cut individually AND together: still clean, and no crash, which proves the
  non-object path is never taken), `no-hardcoded-side-gen-sampling`'s `canonical.kind !== "project"` arm.
- **WRONG-DIRECTION control run.** `no-await-db-in-loop`'s `LOOP_KINDS` narrowed to `ForStatement` alone —
  the flags-LESS direction — REDs **7 rows**, confirming the set is heavily exercised and that the
  flags-MORE cut (NA2, RED 2) is the honest one.

### The two BUILT FALSIFIERS — control green → armed red, both directions run

**D2 — the canonical-origin identity comparison whose only counterfactual is a LOCAL object. Three modules,
two falsifiers, and each module's own row-`why` claims otherwise (HIGH — this is the ANTI-pattern).**

`bounded-list-limit`, `test-mock-doctrine` and `byte-check-cast` all resolve an origin and then compare two
things: the MODULE specifier (`!== "zod"` / `!== "vitest"` / `!== "drizzle-orm"`) and the exported NAME
tail. Each carries an "IDENTITY COUNTERFACTUAL" `mustPass` row, and each row's `why` says some form of
*"deleting the origin check turns this row red."* **It does not — only the weakest clause is load-bearing.**
All three counterfactual rows use a LOCAL object (`const z = {…}`, `const vi = {…}`, a local `check`), which
`resolveModuleMemberOrigin` refuses outright, so the `origin.kind !== "resolved"` half acquits it before
either comparison runs.

| Cut (direction: flags MORE) | `bounded-list-limit` | `test-mock-doctrine` | `byte-check-cast` |
| - | - | - | - |
| MODULE specifier comparison dropped | CLEAN | CLEAN | CLEAN |
| exported-NAME tail comparison dropped | CLEAN | (no name tail) | CLEAN |
| both comparisons cut TOGETHER | **still CLEAN** | — | — |
| `origin.kind !== "resolved"` flipped open | **RED 1** | **RED 1** | — |

**Falsifier F1 — `test-mock-doctrine`.** A project module that is NOT vitest, exporting a `vi` with a `mock`:

```ts
"tests/tooling/vendor-vi.ts":       'export const vi = { mock: (target: string): void => { void target; } };',
"tests/tooling/w9-falsifier.test.ts": 'import { vi } from "./vendor-vi.ts";\nvi.mock("./local-module.ts");',
```

The origin RESOLVES (unlike the local-object row), the member name is `mock`, the target is internal — only
the `originModuleSpecifier(…) !== VITEST_MODULE` comparison rejects it.
**Control run, row added to pristine source: 0 failures. Armed run (same row + the module comparison cut):
1 failure.** The fix is that `mustPass` row, verbatim.

**Falsifier F2 — `bounded-list-limit`.** A genuine zod chain whose factory is `string`, not `number`:

```ts
"node_modules/zod/index.ts": "interface StringSchema { trim(): StringSchema; optional(): StringSchema; }\nexport declare const z: { string: () => StringSchema; object: (shape: unknown) => unknown };",
"packages/server/src/transport/trpc/routers/w9-string-limit.ts": 'import { z } from "zod";\nexport const s = z.object({ limit: z.string().trim().optional() });',
```

The module origin IS zod, the field IS `limit`, there is no `.max()` — only `path.at(-1) === NUMBER_FACTORY`
acquits it. **Control: 0 failures. Armed (factory-name tail cut): 1 failure.**

`byte-check-cast`'s two halves take the identical shape and the identical falsifier construction; I did not
build its row and record it as UNENFORCED-by-the-same-mechanism rather than claiming a measurement I did
not take.

### `persistence-no-in-memory-state` — the clean MUTUAL-REDUNDANCY result

Its ambient-identity condition reads
`origin.value.globalName === spelled.name && origin.value.memberPath.length === 0`. Measured:

| Cut (direction: flags MORE) | Result |
| - | - |
| candidate NAME prefilter (`IN_MEMORY_GLOBALS.has(…)`) widened to any identifier | CLEAN |
| `globalName === spelled.name` half dropped | CLEAN |
| `memberPath.length === 0` half dropped | CLEAN |
| the WHOLE condition dropped (`if (true)`) | CLEAN |
| **prefilter widened AND the whole condition dropped, together** | **RED 1** |
| fail-closed `declarationOf(callee).kind === "unresolved"` → always true | RED 2 |
| population `**/persistence/**` widened to `**` | RED 1 |
| population `notUnder tests/` + `notNamed *.test.*` dropped | RED 1 |

The row that reds under the paired cut is `mustPass[0]`, the `new Store()` alias DECLARED LIMIT. So the
prefilter and the identity comparison are **each other's only proof** — which is a real, if thin, receipt,
and is NOT two unenforced narrowings. Reported as REDUNDANT (2), plus 2 genuinely UNENFORCED (the member-arm
prefilter, and the `memberPath.length === 0` half, which no row exercises because `globalThis.Map`
collapses onto the bare global with an empty path by construction).

### The 34 UNENFORCED narrowings

| Module | Clause cut | Replaced with |
| - | - | - |
| `bounded-list-limit` | zod MODULE specifier comparison | dropped |
| `bounded-list-limit` | `path.at(-1) === NUMBER_FACTORY` | `path.length > 0` — **falsified, F2** |
| `bounded-list-limit` | `namedExpression`'s `reason === "dynamic"` scoping | every refusal followed (arm REACHED — 7 rows) |
| `bounded-list-limit` | population `under` routers+contracts | all of `packages/server/src/**` |
| `byte-check-cast` | drizzle MODULE specifier comparison | dropped |
| `byte-check-cast` | exported-NAME tail comparison | `path.length > 0` |
| `byte-check-cast` | `LENGTH_CAP_TAIL_RE`'s leading `[^A-Za-z0-9_]` class | dropped |
| `byte-check-cast` | `SQL_QUOTES` stripping in `alreadyCountsBytes` | dropped |
| `byte-check-cast` | population `packages/db/src/schema/**` | `@db` root only |
| `no-await-db-in-loop` | the FUNCTION-BOUNDARY stop in `awaitedInLoopBody` | never stops (arm REACHED — 2 rows) |
| `no-await-db-in-loop` | fail-closed `QUERY_VERBS.has(verdict.method)` | any non-empty method |
| `no-await-db-in-loop` | population `notUnder tests/` + `notNamed *.test.*` | dropped |
| `no-direct-reports-write` | `callee.value.name !== SCREENSHOT` | any resolved method |
| `no-direct-reports-write` | `propertyName(property) !== PATH_KEY` | any key |
| `no-direct-reports-write` | first-argument-only (`getArguments()[0]`) | `.at(-1)` |
| `no-handwritten-wire-json-schema` | `propertyName(node) !== SCHEMA_KEY` | any key |
| `no-handwritten-wire-json-schema` | `propertyName(property) !== TYPE_KEY` | any key |
| `no-handwritten-wire-json-schema` | population `notNamed *.test.*`/`*.test-d.*` | dropped |
| `no-hardcoded-side-gen-sampling` | `CATALOG_HOMES` `/packages/kit/src/side-gen-posture/` | dropped (the preset home alone REDs 1) |
| `no-hardcoded-side-gen-sampling` | population `domain/**`+`entry/**` | all of `packages/server/src/**` |
| `no-hardcoded-side-gen-sampling` | population `notNamed *.test.ts`/`*.test.tsx` | dropped |
| `persistence-no-in-memory-state` | member-arm `IN_MEMORY_GLOBALS.has(member.value.name)` | any resolved member |
| `persistence-no-in-memory-state` | `memberPath.length === 0` | dropped |
| `providers-runner-seal` | member-arm sealed-NAME prefilter | any resolved member |
| `test-fixture-imports` | population `notUnder tests/e2e/**`, `tests/support/**` | dropped |
| `test-mock-doctrine` | vitest MODULE specifier comparison | dropped — **falsified, F1** |
| `test-mock-doctrine` | first-argument-only | `.at(-1)` |
| `test-mock-doctrine` | population `under tests/**` | `@authored` root only |
| `turn-identity` | — | (none) |
| `vector-scope-derived` | `IMPORT_SANCTIONED` `domain/chat/memory/persistence/` | dropped |
| `vector-scope-derived` | `IMPORT_SANCTIONED` `domain/discovery/persistence/` | dropped |
| `vector-scope-derived` | `IMPORT_SANCTIONED` `foundation/observability/debug/` | dropped |
| `vector-scope-derived` | `WRITE_METHODS.has(callee.value.name)` | any resolved method |
| `vector-scope-derived` | `verdict.kind === "sealed"` in `vectorTableArgument` | `!== "foreign"` |
| `vector-scope-derived` | `LITERAL_KINDS` | plus the two member kinds |

Two recurring shapes account for 20 of the 34:

- **Population fences: 9 of 14 modules carry at least one unexercised population clause** (8 UNENFORCED
  population cuts). Every `notNamed`/`notUnder` test-tree exclusion in the family is unproven except
  `persistence-no-in-memory-state`'s and `test-fixture-imports`' `.test-d.ts` one — and those two show the
  fix costs exactly one `mustPass` row with a `*.test.*` file plus an in-population anchor.
- **SANCTIONED-HOME LISTS with unexercised entries: 4.** `vector-scope-derived` declares five
  `IMPORT_SANCTIONED` homes and only two (`embeddings/`, RED 2; `search/persistence/`, RED 1) are proven;
  `no-hardcoded-side-gen-sampling` declares two `CATALOG_HOMES` and only the preset one is proven — the
  `packages/kit/src/side-gen-posture/` entry exists on the tree but no row derives from it. A list entry no
  row exercises is a §5b.1 declaration the module does not use, and it is the entry a future re-home will
  silently delete.

## The #944 third answer, per module — probed, never read off the header

Probe: replace the branch's report/return with `throw` and run the module's OWN rows. **0 failures means
unreached.** The brief's warning that a DECLARED LIMIT paragraph is exactly the thing that is wrong here
held for a third consecutive wave — see D3/D4/D5.

| Module | Declared fail-closed / refusal arm | REACHED? | Other arms probed |
| - | - | - | - |
| `bounded-list-limit` | `isZodNumberFactory` unresolved origin | **YES** (flipping it open REDs 1) | `zodNumberChain` member-unresolved **UNREACHED**; non-static computed key **UNREACHED** |
| `byte-check-cast` | unnameable cap (`capName` → null) | **YES** (1) | blob acquittal **YES** (1); unresolved-table arm **UNREACHED** |
| `discovery-no-stats-rollups` | `readSealedOrigin` → `unresolved` | **YES** (1) | `foreign` acquittal **YES** (1) |
| `membership-enforcer` | `readSealedOrigin` → `unresolved` | **NO** | `foreign` acquittal **YES** (1); bare-identifier `ownerId` arm **UNREACHED** |
| `no-await-db-in-loop` | `verdict.kind === "unresolved"` fail-closed | **YES** (1) | `foreign` **YES** (2); `anchor === null` **UNREACHED**; function-boundary stop **YES** (2) |
| `no-direct-reports-write` | mutated-options refusal | **YES** (1) | unresolved callee **YES** (1); non-static computed key **UNREACHED** |
| `no-handwritten-wire-json-schema` | mutated-binding refusal | **YES** (1) | non-static computed key **UNREACHED** |
| `no-hardcoded-side-gen-sampling` | `derivesFromCatalog` non-project/external door | **NO** | non-static computed key **UNREACHED** |
| `persistence-no-in-memory-state` | the labelled FAIL-CLOSED report | **NO — the report line itself** | not-ambient acquittal **YES** (2); ambient report **YES** (5) |
| `providers-runner-seal` | `readSealedOrigin` → `unresolved` | **YES** (1) | `foreign` **YES** (1) |
| `test-fixture-imports` | `door.kind === "unresolved"` | **YES** (2) | `door.kind === "runner"` **YES** (5) |
| `test-mock-doctrine` | unresolved target | **YES** (1) | unresolved receiver **YES** (1) |
| `turn-identity` | `readSealedOrigin` → `unresolved` | **YES** (1) | `foreign` **YES** (1) |
| `vector-scope-derived` | `readSealedOrigin` → `unresolved` | **YES** (1) | bare-identifier table fallback **YES** (1) |

**11 of 14 reach their declared fail-closed arm.** Where the server plane lands: well above the client
planes (3/12 and 1/11) and consistent with wave 8's 7/8. The three misses:

**D3 — `persistence-no-in-memory-state`'s FAIL-CLOSED report line is DEAD, and the `mustFlag` row LABELLED
"FAIL-CLOSED" flags through a different arm (HIGH).** The module ends `visit` with

```ts
// NOT AMBIENT. … A constructor with NO declaration at all is unprovable, and the spelling is fail-closed.
if (Node.isIdentifier(callee) && referenceResolutionServices.declarationOf(callee).kind === "unresolved") {
  ctx.report.node(…);
}
```

A `throw` in that report fires on **zero of its 10 rows**. Its `mustFlag[3]` — *"FAIL-CLOSED — with no
ambient library loaded the checker binds no declaration for `Map` at all"* — flags through the AMBIENT arm
instead (a `throw` there fires on 5 rows). The named guarantee has no receipt, and the row that appears to
buy it does not. Widening the dead condition REDs 2 rows, so the surrounding `Node.isIdentifier` arm IS
entered; only the inner `declarationOf` refusal never occurs.

**D4 — `membership-enforcer` advertises a fail-closed unreadable door that no row reaches (MEDIUM).** Its
comment: *"FAIL-CLOSED: an unreadable door for a single-owned helper is reported. Only a PROVEN foreign
declaration acquits."* The `foreign` half IS proven (1 row); the `unresolved` half is reached by zero. Its
near-twin `discovery-no-stats-rollups` — same structure, same helper, same comment — HAS the row
(`mustFlag[4]`, an import from `./missing.ts`). One copied `mustFlag` row closes it. This is #1997 one layer
below a header: a code comment asserting a guarantee no row enforces.

**D5 — `no-await-db-in-loop`'s "FUNCTION BOUNDARY" declared-limit row contains no loop, so the boundary stop
it advertises is proven by nothing (HIGH — a declared-limit row that discriminates nothing).** `mustPass[2]`'s
`why` reads: *"an await inside a callback the loop merely CONSTRUCTS is not executed per iteration — the walk
stops there deliberately, which is what makes the batched `Promise.all` fan-out legal."* Its fixture is
`const runs = xs.map(async (x) => { await db.insert({}); });` — **there is no loop statement in it at all.**
Removing the boundary stop entirely (`if (false)`) leaves every row green; a `throw` at the boundary fires on
that row and on `mustPass[0]`, so the walk DOES reach it — it simply never changes a verdict, because nothing
above it is a loop. The row proves the absence of a loop, not the boundary. One row — `for (const x of xs)
{ const runs = xs.map(async () => { await db.insert({}); }); }` — is what the `why` claims.

Further comment/row-`why` claims no row enforces, in the same class:

- **`no-await-db-in-loop` `mustPass[4]`**: *"neither drizzle-proven **nor spelled like a query verb** is out
  of subject."* Widening `QUERY_VERBS` to every method is CLEAN — the row is acquitted by `verdict.kind ===
  "foreign"`, not by the verb vocabulary. The second half of the sentence is unenforced.
- **`byte-check-cast`**: *"The leading character class keeps `json_array_length(` — a different SQL function —
  out of the subject."* Dropping the class is CLEAN; no row carries a `json_array_length` cap.
- **`vector-scope-derived`**: *"a text scan over every subscribed kind would double-report
  `db["vector_distance_cos"]`."* Adding `PropertyAccessExpression`/`ElementAccessExpression` to
  `LITERAL_KINDS` is CLEAN; no row spells the cosine function as a member.

**D6 — the copied dead `propertyName` computed-key refusal, four modules (MEDIUM, and it propagates).**
`bounded-list-limit`, `no-direct-reports-write`, `no-handwritten-wire-json-schema` and
`no-hardcoded-side-gen-sampling` each carry a byte-identical `propertyName` helper ending
`return computed.kind === "resolved" ? computed.value : null;`. A `throw` on that `null` arm fires on **zero
rows in all four**. Each module DOES have a computed-key `mustFlag` row — but always a STATIC one
(`["limit"]`, `["path"]`, `["schema"]`, `["topP"]`), which takes the resolved branch. The refusal branch —
the one that decides what happens to `{ [dynamicKey]: … }` — is untested in every copy. The helper is
duplicated rather than shared, so a §5b.7 extraction would give all four one row instead of four.

## §5b.5 / §5b.4 — 14 of 14, re-derived

Mechanical census over the 14 module headers (text above the first `import`):

```
FAMILY                      → 0 of 14
POPULATION PORT             → 0 of 14
/[0-9a-f]{7,}\^/  (legacy SHA) → 0 of 14
/singleton/i                → 0 of 14
family === id (singleton)   → 13 of 14   (only byte-check-cast declares family "drizzle-schema")
```

This corroborates wave 8's 25/25 on the overlapping 14, and it is the mechanical reason **#2000 cannot
attempt a differential** — no module records the legacy pre-conversion SHA its §4.6 differential would have
to replay against. Filed under #2005.

## §5b.3 — `fix` names the exact waiver spelling: 3 of 14 (re-derived, matches wave 8)

`no-await-db-in-loop`, `persistence-no-in-memory-state` and `test-mock-doctrine` spell the position
placeholder (`@orb-waive no-await-db-in-loop(<the reported method>)`). The other eleven fire on an author
with no spelling to copy, and several of them anchor on a token a reader would NOT guess —
`bounded-list-limit` on the field name `limit`, `membership-enforcer` on `ownerId` or the helper name
depending on the arm, `vector-scope-derived` on three different tokens across its three arms.

## §5b.7 — private readers with one caller: 2 of 14

`lib/drizzle-client-call.ts` is imported by `no-await-db-in-loop` alone; `lib/test-runner-door.ts` by
`test-fixture-imports` alone (census: every `lib/*.ts` grepped against every `gates/*.ts`). Both are
genuinely substantial readers and the extraction is defensible, but §5b.7 names this shape and neither
header states why the reader lives in `lib/` rather than in the module. Contrast D6, where a helper with
FOUR copies was not extracted at all.

## §4.1 expectation rows — and the wave-8 correction

79 `mustFlag` rows across the 14. **79 carry `count` (100%). 77 carry `token`. 0 carry `line`. 0 carry
`messageIncludes`.** The two rows with no `token`:

```
vector-scope-derived:  expect: { count: 2 }     (the namespace-reached write, :167)
vector-scope-derived:  expect: { count: 2 }     (the bracket-spelled namespace write, :177)
```

Both are legitimately multi-arm rows (one fixture produces an import finding AND a write finding, with
different tokens), so a single `token` would be wrong — but `count: 2` alone cannot tell an import finding
from a write finding, and swapping the two arms' anchors would keep the row green. **Wave 8 reported "78
rows carry `token` (every origin-server row)" for a byte-identical tree** (`git log 8fac273c3..HEAD --
tooling/src/verify/gates/vector-scope-derived.ts` is empty). I am contradicting it deliberately, with the
mechanical census as the receipt; the mechanism is that a multi-arm row's expectation is the one shape a
per-row `token` census does not have a slot for.

**No tautologies.** No `messageIncludes` exists in the family to be tautological, and the `count`+`token`
pairs discriminate: three sibling-arm TRANSPLANTS were run implicitly by the cut battery — every enforced
cut above reds on a token/count mismatch or an effective-finding count, and two cuts red specifically with
`node finding token "limit" is not anchored at its declared offset`, which is the anchor assertion doing
its job.

## §4.2 identity arms — presence re-derived, discrimination NOT re-run

All 14 carry an in-module `@orb-waive <id>(<position>)` `mustPass` row (14 of 14, grepped). **Wave 8 proved
all 14 DISCRIMINATE** by flipping each position to a dead one and observing the
`AUTHORITY ALARM [ordinary-waiver] … names a dead position` message. I did not re-run that sweep; it is
wave 8's receipt and I am not re-counting it.

## Per-module verdicts

| # | Module | Verdict |
| -: | - | - |
| 1 | `bounded-list-limit` | **REFUTED** — D2 (both identity comparisons unenforced, one falsified); the dynamic-refusal scoping unenforced with the arm REACHED; population unenforced. Its field-name fence, `hasMax` half and resolution fence are all proven |
| 2 | `byte-check-cast` | **REFUTED** — D2's third instance (both comparisons unenforced); the `json_array_length` guard and the SQL-quote stripping are comment-claimed and row-unproven; the unresolved-table arm is dead. Its `cast(`, BYTES-intent and blob-acquittal clauses are excellent |
| 3 | `discovery-no-stats-rollups` | **REFUTED — D1** (false positive on pristine source). **0 unenforced narrowings otherwise**, both prefilters correctly exempted, both third answers reached, population pinned with an anchor. The best §4.1 sheet in the family, undone by one line |
| 4 | `membership-enforcer` | **REFUTED** — D1 + D4 (the fail-closed comment no row reaches) + a DEAD bare-identifier arm. Six of seven cuts enforced; the `ownerId` and helper arms are otherwise well pinned |
| 5 | `no-await-db-in-loop` | **REFUTED — worst declared-limit record** — D5 (a boundary row with no loop in it) + the unenforced verb vocabulary + an unenforced test-tree exclusion. Its carrier/dedupe pair is the best-proven waiver-grain work in the family |
| 6 | `no-direct-reports-write` | **REFUTED** — the METHOD name, the KEY name and the argument position are all unenforced (and cut together, still clean), plus two dead object-literal guards. The needle and the mutated-bag refusal are proven |
| 7 | `no-handwritten-wire-json-schema` | **REFUTED** — both key-name fences and the test-basename exclusion unenforced; the `type: "object"` tell, the builder-root refusal and the object-literal test are all proven |
| 8 | `no-hardcoded-side-gen-sampling` | **REFUTED** — one of two `CATALOG_HOMES` unexercised, both population clauses unenforced, the external-door arm dead. Its ambiguous-key corroboration work (`maxTokens`) is the strongest vocabulary reasoning in the family and is fully pinned |
| 9 | `persistence-no-in-memory-state` | **REFUTED** — D3 (the labelled FAIL-CLOSED report is dead and the row named for it flags elsewhere). Its identity comparison survives only as a REDUNDANT pair; population is the best-pinned in the family (both clauses red) |
| 10 | `providers-runner-seal` | **REFUTED — D1**, and one unenforced member-arm prefilter. Otherwise the model for how to pin a prefilter: its DECLARED LIMIT row REDs when the import prefilter is widened, which is the receipt six other prefilters lack |
| 11 | `test-fixture-imports` | **REFUTED on §5b.5 + one population clause** — the richest proof set in the family: 6 of 9 cuts enforced, both third answers reached, an external-door control, a rename control, and the ONE module that solved D1's class correctly (fail-closure scoped to a declared import door, with the 89-false-positive receipt in its own row) |
| 12 | `test-mock-doctrine` | **REFUTED** — D2 (falsified, F1) + argument position + population. Its member vocabulary, internal-prefix list and fail-closed target arm are all individually proven |
| 13 | `turn-identity` | **REFUTED — D1 ONLY.** Zero unenforced narrowings, its one clean cut is a declared prefilter with the home fence reddening behind it, both third answers reached, and its MIXED declared-limit row genuinely discriminates. The nearest miss |
| 14 | `vector-scope-derived` | **REFUTED — worst §4.1 record** — D1, three of five sanctioned homes unexercised, the write vocabulary, the sealed-vs-non-foreign asymmetry and the LITERAL_KINDS comment all unproven, and the family's only two `token`-less expectation rows |

## The COPY candidate

**`turn-identity`, and it clears the bar once D1 is fixed.** For it: 6 of 6 `mustFlag` rows with `count` AND
`token`; ZERO unenforced narrowings (its single clean cut is the import prefilter, with the home infix
reddening behind it); both third answers reached; a MIXED declared-limit row that is genuinely
discriminating (`bag["principal"]` quoted vs the identifier spelling — widening the vocabulary arm REDs 6
rows); no private single-consumer `lib/` reader; and a two-arm design whose tokens are what make a per-arm
waiver expressible. Against it: D1 (one line), no §5b.5 header paragraph (universal), a `fix` that does not
name the waiver spelling, and a prefilter with no DECLARED LIMIT row — which
`providers-runner-seal:mustPass[4]` shows how to write in four lines.

**`test-fixture-imports` is the runner-up and the better teacher for the hard part** — it is the only module
in either server family that got the fail-closure scoping RIGHT, and its `doorIsIllegal` is the exact shape
the five D1 modules need. Against it: a single-consumer `lib/` reader (§5b.7) and one unenforced population
exclusion.

**So: one module in this wave survives "point a conversion lane at this and tell it to copy" — and only after
a one-line D1 fix.** That is better than wave 8's answer, which was none.

## The ANTI-pattern of this wave

**Two, and both are copy-shaped.**

1. **D1 — the sealed-origin conflation.** Five of fourteen modules reach for
   `readSealedOrigin(…).kind !== "foreign"` because it reads like the obvious thing, and the shared
   `sealedOriginReports` sits one export away with a doc comment explaining why it exists. A lane copying
   any of the five ships a policy that accuses a local object's key. The rule to write down: **`readSealedOrigin`
   returns a VERDICT, not a decision — the decision is `sealedOriginReports(verdict, anchor)`, and a policy that
   compares `.kind` itself has silently opted out of the refusal classifier.**
2. **D2 — the identity counterfactual that only falsifies the RESOLUTION half.** Three modules write a
   two-clause canonical-identity check (module specifier + exported name), give it one "IDENTITY
   COUNTERFACTUAL" row built from a LOCAL object, and state in that row's `why` that deleting the origin
   check turns it red. A local object never resolves, so it proves only `origin.kind !== "resolved"`. The rule:
   **a counterfactual for a MODULE comparison must RESOLVE — it is a real project module or package with the
   right export name and the wrong home. A local object proves the refusal arm and nothing else.**

## What I did NOT cover

- **§4.2 identity-arm DISCRIMINATION.** Presence re-derived (14/14); the dead-position flip is wave 8's
  receipt and I did not re-run it.
- **§4.6 conversion differentials.** Not replayed for any module; no legacy SHA exists in any header to
  replay against (that is D-systemic / #2005, and the mechanical blocker for #2000).
- **Real-tree behaviour.** Every probe in this document runs a module's DECLARED ROWS through
  `verifyPolicyProofs`. The only real-tree evidence is the single `pnpm check:structure` floor, which
  establishes that nothing is withheld or tool-erroring — **not** that D1's false positive has a live
  instance. Counting D1's live instances (a local object key spelled like a sealed export, inside each of
  the five populations) is the first thing a fix lane should do, and I did not do it.
- **`untrusted-regex-safe-exec`.** It carries D1's shape and is outside this subject set; I measured
  nothing about it.
- **`byte-check-cast`'s D2 falsifier.** Reasoned by mechanism from F1/F2, not built.
- **`byte-check-cast`'s schema-fact receipt routing.** Wave 3 measured it; I did not re-derive it.
- **`gate-ignore-grammar.repo.int` and `gate-conformance.repo.int`** — reserved to the orchestrator, not run.

## Durable lessons proposed (the orchestrator owns the memory write)

- **`readsealedorigin-verdict-is-not-a-decision`** — `readSealedOrigin` returns a three-way VERDICT; the
  DECISION is `sealedOriginReports(verdict, anchor)`, which scopes the `unresolved` arm through
  `classifyOriginRefusal`. A policy that writes `readSealedOrigin(…).kind !== "foreign"` has opted out of
  the refusal classifier and accuses a LOCAL OBJECT'S KEY spelled like the sealed export — proven on
  pristine source in five of six such modules (`discovery-no-stats-rollups`, `membership-enforcer`,
  `providers-runner-seal`, `turn-identity`, `vector-scope-derived`; `untrusted-regex-safe-exec` untested).
  The one-line swap fixes it while the unreadable-door `mustFlag` row still flags (#1584).
- **`identity-counterfactual-must-resolve`** — A `mustPass` counterfactual for a canonical-identity check
  built from a LOCAL object or a local class falsifies only `origin.kind !== "resolved"`; the MODULE
  specifier and exported-NAME comparisons behind it stay unproven, including when cut together. The
  falsifier must RESOLVE: a real project module or package exporting the right NAME from the wrong HOME
  (`bounded-list-limit`, `test-mock-doctrine`, `byte-check-cast` — two built falsifiers, control green →
  armed red).
- **`declared-limit-row-must-contain-the-condition-it-limits`** — A DECLARED LIMIT `mustPass` row proves
  nothing if the fixture omits the enclosing condition the limit is about.
  `no-await-db-in-loop`'s "FUNCTION BOUNDARY" row has no loop in it, so the boundary stop it advertises can
  be deleted with every row staying green — while a `throw` proves the walk DOES reach the boundary. Probe a
  declared-limit row by cutting the clause it names, not by reading its `why`.
- **`sanctioned-home-list-entries-need-one-row-each`** — A policy that declares a LIST of sanctioned
  homes/catalog homes owes one `mustFlag`/`mustPass` row per entry: drop each entry in turn and it must RED.
  `vector-scope-derived` proves 2 of 5 `IMPORT_SANCTIONED` homes and `no-hardcoded-side-gen-sampling` 1 of 2
  `CATALOG_HOMES`; an unexercised entry is a §5b.1 declaration the module does not use and the one a re-home
  deletes silently.
