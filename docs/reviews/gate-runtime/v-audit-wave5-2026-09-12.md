---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave5 — the `ordinary-visitors` family (15 policies) against §5b PRISTINE (#1584)

Read-only adversarial audit of the fifteen `defineGate` policies imported by
`tests/tooling/verify/gates/ordinary-visitors-family.test.ts`, held to
[`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven criteria and
§4's proof rules. Method, receipt style and verdict-block format follow
[`v-audit-wave3-2026-09-12.md`](v-audit-wave3-2026-09-12.md), which in turn follows wave 2's corrected
four-way cut classification.

**Why this family and not a bigger one.** `.claude/rules/gates-and-tooling.md` — a rule injected into every
gate lane in this repo — tells every remaining conversion to copy the positive identity arm from
`ordinary-visitors-family.test.ts:187-205`. That shape is the transmission mechanism for the ~104
conversions still to come, so a defect here is not local.

Every number below came out of a run produced in this session in an isolated worktree
(`.claude/worktrees/agent-a38b61736dbc0b8c0`). Every probe was `cp f f.w5bak` … `mv f.w5bak f`, never
`git stash`/`checkout`/`restore`; `git status --short` was EMPTY after every round and before the commit.
No file outside this document was modified on any shared tree.

## Headline

**All fifteen are in scope, all fifteen are final `defineGate` modules, all fifteen are LIVE on the real
tree, and NONE is blinded.** The family is clean on the two defect classes that produced the worst prior
findings — zero `#1972` (withheld-on-the-real-tree) and zero `#1979` (silent not-ready return). Its
identity arms are the strongest yet measured: **six ordinary policies, six positive arms, and all six
DISCRIMINATE** under a dead-position control.

**The family's weakness is the §4.1 narrowing axis, where it is the WORST of the four waves**, and the
§5b.3 `fix`-names-the-waiver-spelling criterion, where four of six ordinary policies fail.

**Verdict: 13 REFUTED, 2 CONFIRMED.**

| Property | Wave 1 (10) | Wave 2 (7) | Wave 3 (9) | **Wave 5 (15)** |
| - | -: | -: | -: | -: |
| `mustFlag` rows with no `expect` | — | — | — | **0 of 66** |
| `mustFlag` rows with no `count` | 2 of 33 | 0 of 45 | 1 of 53 | **1 of 66** (`persisted-store-registry` mF4; derived count = **14**) |
| `messageIncludes` discriminators that are tautologies | 3 of 8 | 0 of 6 | 0 of 6 | **2 of 7** (both `no-untyped-soft-ref`) |
| §4.1 narrowings — NAIVE clean cuts | 12 of 30 (40%) | 12 of 30 | — | **56 of 94 (60%)** |
| §4.1 narrowings — CLASSIFIED unenforced | (unsplit) | 5 of 30 (17%) | 4 of 24 (17%) | **33 of 94 (35%)** |
| Ordinary policies whose `fix` names the waiver spelling | — | 7 of 7 | 2 of 3 | **2 of 6** |
| Ordinary identity arms that DISCRIMINATE on a dead position | — | — | — | **6 of 6** |
| Modules in the #1972 `ctx.relativePath` / blinded class | — | 5 of 7 | 0 of 9 | **0 of 15** |
| Modules in the #1979 silent-not-ready class | — | — | — | **0 of 15** |
| Headers recording a POPULATION PORT | — | 6 of 7 | 1 of 9 | **9 of 15** |
| Roster rows that are bare pre-conversion labels | 4 | 0 | 1 | **0 of 15** |
| Header claims REFUTED by the tree's own data | — | — | — | **3** (see "Header lies") |

| # | Module | Authority | Verdict |
| -: | - | - | - |
| 1 | `no-raw-interactive-intrinsics` | reviewed-grant | **CONFIRMED** — zero genuinely unenforced narrowings, 6/6 exact `count`+`token`, population port + the 2026-08-22 ruling + the deleted `BURN_DOWN` table all recorded, message true of what it flags, minimal contract. **The reviewed-grant module to copy.** |
| 2 | `no-mutating-register-api` | ordinary | **CONFIRMED** — the only module in the corpus whose `mustPass` `why` NAMES which row dies without its population fence, and that claim is TRUE on measurement. `fix` names the waiver spelling AND the position rule. Identity arm discriminates. **The ordinary module to copy**, with one known one-row gap named below. |
| 3 | `plugin-dump-guard` | hard | **REFUTED** (criteria 5, 6) — 6 of 9 narrowings enforced, the best absolute count, but **two real gaps in a security-adjacent policy**: an INVERTED guard and a guarded dump in a NON-canonical helper both flag correctly with no row. No population-port line. |
| 4 | `empty-state-has-action` | ordinary | **REFUTED** (criteria 3, 4, 5) — zero unenforced narrowings and a discriminating identity arm, but `fix` names NO waiver spelling, the family is an undeclared singleton, and there is no population-port line. Its `message` shows the spelling `(EmptyState)` while its own alias row proves the position is the AUTHORED tag. |
| 5 | `no-inline-domain-interface` | ordinary | **REFUTED** (criteria 3, 6) — `fix` names no waiver spelling; both `notNamed` clauses unenforced (one falsifier row fixes both). Identity arm discriminates. |
| 6 | `registry-assembly-at-door-only` | ordinary | **REFUTED** (criterion 4) — proofs and `fix` are exemplary and the header PREDICTS its own clean cut (`name-prefilter`, measured true). But the header declares `FAMILY: SINGLETON` while `no-mutating-register-api` carries the identical `family` string: **the family has two members**. |
| 7 | `no-untyped-soft-ref` | reviewed-grant | **REFUTED** (criteria 2, 6) — `mustPass[2]`'s `why` claims to prove the primary-key exemption and DOES NOT (cut proven). Both `messageIncludes` are TAUTOLOGIES because `UNREADABLE === MESSAGE` at `:42`. |
| 8 | `untrusted-regex-safe-exec` | hard | **REFUTED** (criteria 5, 6) — the canonical-property fence is unenforced by any row; the file anchor IS enforced, but only by a family pin, which the header does not say. No population-port line. |
| 9 | `persisted-store-registry` | hard | **REFUTED** (criteria 5, 6) — the family's ONLY `mustFlag` with no `count` (derived **14**), so the two-sided stale ratchet's completeness is unpinned; the `UNREADABLE_NAME` report arm is reached by no row. No population-port line. |
| 10 | `no-raw-egress` | reviewed-grant | **REFUTED** (criteria 6, 7) — one of seven narrowings individually enforced; the `@server` fence and the no-substitution-template spelling are unenforced with falsifiers built; and the header's load-bearing **imported-binding branch is REDUNDANT** — cutting it changes nothing because the refusal classifier already reports it. |
| 11 | `zod-error-issues-home` | reviewed-grant | **REFUTED** (criterion 6) — three of five narrowings unenforced (`@packages`, both `issues`-name clauses), each with a built falsifier. |
| 12 | `zod-modern-spellings` | ordinary | **REFUTED** (criteria 3, 6) — the family's BEST identity coverage (three per-token arms, all discriminating) and its worst narrowing coverage: **6 of 10 unenforced**, including the `zod` DOOR the header's whole identity claim rests on. `fix` names no waiver spelling (the header does). |
| 13 | `no-rejected-cors-proxy` | hard | **REFUTED** (criteria 2, 6) — **0 of 2 narrowings enforced**. Three of the five subscribed literal node kinds are proven by nothing, while the header and the roster both claim the host is unspellable "in any part of a template". |
| 14 | `persistence-boundary` | reviewed-grant | **REFUTED** (criteria 2, 5, 6) — **not one of its six narrowings is individually enforced**; three form a proven 3-way redundant cluster, two are unenforced with falsifiers, one is unfalsifiable. The header claims six grant rows where **four** exist. |
| 15 | `no-inline-types` | ordinary | **REFUTED** (criteria 3, 6) — **9 of 16 narrowings unenforced**, the family's worst absolute count. Independently reproduces wave 1's finding; see the premise correction below. |

## Premise corrections

1. **`no-inline-types` was ALREADY audited by wave 1** and is therefore a re-audit, not a fresh subject —
   `v-exemplar-audit-2026-09-12.md:36` and its cut table at `:85-89`. My cuts reproduce every wave-1
   finding (the `zod` door, the `VariableStatement` export-keyword clause, seven of ten population
   clauses, the `fix` with no waiver spelling), so **wave 1's naive method was RIGHT on this module**, with
   one reclassification: `ZOD_FACTORIES.has(terminal)` (wave 1: "NOT EVALUATED") is MUTUALLY REDUNDANT with
   the `factoryCandidateName` prefilter — cut together, `mustPass[5]` (`z.string()`) dies, so the pair IS
   jointly enforced. The "27 audited / 2 copyable" denominator double-counts this module.
2. **The exemplar citation is ambiguous across the program's own documents.** `.claude/rules/gates-and-tooling.md`
   and §4.2 both cite `ordinary-visitors-family.test.ts:187-205`; `v-exemplar-audit-2026-09-12.md:146`
   cites `:187-195` for the same thing. `:187-196` is the POSITIVE arm and `:198-205` is a dead-position
   NEGATIVE arm — so the range lanes are told to copy includes an arm §4.2 tells them not to copy.
3. **The subject list is exactly as briefed.** Re-derived from the family test's fifteen `import { gate as … }`
   statements at `:9-23`; the brief's list matches member for member.

## What I ran

| Instrument | Result |
| - | - |
| `pnpm check:policy-conformance` (baseline) | `167 final policies · 1679 proof rows · 0 failure(s) · 105 grant rows · 0 invalid · 16858ms`, **exit 0** |
| `pnpm test:scoped tests/tooling/verify/gates/ordinary-visitors-family.test.ts` (baseline) | **14 tests PASSED, exit 0**, no type errors, 12.46 s |
| **`pnpm check:structure`** (ONCE, restored tree) | **exit 1** (the migration baseline). Tail: `final policies: 167 ran · raw 1323 = waived 1141 + granted 105 + effective 77 (77 error, 0 warning) · **0 alarm(s)** · **0 tool error(s)** · **0 withheld**`; `single-pass: ran 271/271 active gate(s) (104/104 legacy · 167/167 final) … run COMPLETE`. Run id `agent-a38b61736dbc0b8c0-3540351-2026-09-12T00-10-52-788Z` |
| A lane-private `verifyPolicyProofs` driver over the 15 subjects | `DRIVER policies=15 rows=133 failures=0` in 4.0 s. **Positive control planted first**: cutting `node.hasExportKeyword()` from `no-inline-domain-interface` turned `mustPass[1]` red, so the driver bites |
| 7 probe rounds | **95 module cuts** (single, paired and one triple), **26 BUILT FALSIFIERS** added as real proof rows and run on unmodified source, **22 of them re-run WITH their cut** to prove they discriminate, **4 `messageIncludes` transplants**, **1 `count: 99` derivation**, **6 identity dead-position controls**, **3 family-test pin probes**. Every module restored; `git status --short` EMPTY after every round |

`pnpm exec biome` / `pnpm typecheck` were not run: this lane wrote one markdown file and modified no tracked
code. `pnpm check:docs` was run scoped for that file.

## The narrowing axis — naive 56/94, classified 33/94

The naive sweep over-reports by **41%** here, which is why the four-way classification is not optional. A
CLEAN cut was promoted to UNENFORCED only when a BUILT falsifier row passed on unmodified source AND died
under the cut; promoted to MUTUALLY REDUNDANT only when a paired or triple cut killed a real row; and left
UNFALSIFIABLE only when a built falsifier could not discriminate even with the fence removed.

| Module | narrowings | ENFORCED | MUT-RED | UNFALS | declared | **UNENFORCED** |
| - | -: | -: | -: | -: | -: | -: |
| `plugin-dump-guard` | 9 | 6 | 1 | 0 | 0 | **2** |
| `no-mutating-register-api` | 4 | 3 | 0 | 0 | 0 | **1** |
| `no-untyped-soft-ref` | 4 | 3 | 0 | 0 | 0 | **1** |
| `empty-state-has-action` | 6 | 3 | 2 | 1 | 0 | **0** |
| `no-raw-interactive-intrinsics` | 4 | 1 | 2 | 1 | 0 | **0** |
| `registry-assembly-at-door-only` | 5 | 3 | 0 | 0 | 1 | **1** |
| `no-inline-domain-interface` | 6 | 3 | 1 | 0 | 0 | **2** |
| `untrusted-regex-safe-exec` | 4 | 2 | 1 | 0 | 0 | **1** |
| `persisted-store-registry` | 6 | 3 | 1 | 0 | 0 | **1** + 1 not isolated |
| `zod-error-issues-home` | 5 | 2 | 0 | 0 | 0 | **3** |
| `no-raw-egress` | 7 | 1 | 3 | 1 | 0 | **2** |
| `persistence-boundary` | 6 | **0** | 3 | 1 | 0 | **2** |
| `no-rejected-cors-proxy` | 2 | **0** | 0 | 0 | 0 | **2** |
| `zod-modern-spellings` | 10 | 3 | 1 | 0 | 0 | **6** |
| `no-inline-types` | 16 | 5 | 2 | 0 | 0 | **9** |
| **total** | **94** | **38** | **17** | **4** | **1** | **33** + 1 |

### The MUTUALLY REDUNDANT clusters, each proven by a paired or triple cut

- **`persistence-boundary` and `no-raw-egress` each hide a 3-WAY cluster.** `isCapabilityProbe`, the
  member-read→`"other"` rule and `classifyOriginRefusal` all catch the same subjects. Cut singly: every row
  green. Cut in pairs (`member` + `refusal`): `no-raw-egress` loses `mustPass[1]`, `[2]`, `[5]`;
  `persistence-boundary` loses `mustPass[0]`, `[2]`, `[3]`. Cut as a triple: 5 and 4 rows die respectively.
  **So the clauses ARE enforced — jointly — and the naive sweep would have reported six false gaps.**
  The legibility cost is real, though: `persistence-boundary` `mustPass[1]`'s `why` says "a `typeof`
  CAPABILITY PROBE reads whether the environment has the api at all", and the pairwise cut shows the row
  does not exercise `isCapabilityProbe` at all — the member rule catches it first.
- **`no-inline-types`: `factoryCandidateName` prefilter + `ZOD_FACTORIES.has(terminal)`.** Cut singly,
  clean. Cut together, `mustPass[5]` (`z.string()`) dies. The module's own comment calls the prefilter
  "Prefilter only: it decides whether the origin is worth resolving, never whether the call is a zod
  factory" — honest, and now measured.
- **Subsumed-by-a-stronger-fence cases** (the population clause is a scope/perf decision the visitor fence
  already makes): `plugin-dump-guard`'s `under: plugin-host/**` (the `sourceFile !== membrane` fence
  decides), `untrusted-regex-safe-exec`'s `under: compose/**` (the `COMPOSE_ANCHOR` fence decides),
  `no-inline-domain-interface`'s `in: ["@server"]` (the `under: domain/**` clause decides, and `in` is
  structurally required by `PopulationExpr`), `persisted-store-registry`'s name prefilter (the
  `classifyProjectHomeOrigin` verdict decides — cutting the verdict kills `mustFlag[3]` and `mustPass[1]`).
- **`no-raw-egress`'s imported-binding branch is REDUNDANT, and the header calls it load-bearing.**
  `:106-110` says *"An IMPORTED binding named `fetch` is a raw egress door under another roof (a polyfill,
  `undici`), and legacy reported it as an identifier callee. It stays a finding."* I built the row
  (`import { fetch } from "undici"` in a server verb): it flags, and it **still flags with the branch
  deleted**. The refusal classifier already reports it. The branch is dead; the behaviour is real.

### The UNFALSIFIABLE four, documented rather than faked

- **`ext: ["tsx"]` in `empty-state-has-action` and `no-raw-interactive-intrinsics`.** A `.ts` fixture
  carrying JSX cannot produce a finding even with the clause removed — I built the anchored row twice and
  it stayed green under the cut. (Without an anchor the row does not even run: the population refuses with
  `Invalid population resolution: expression admitted zero paths from 2 candidate(s)`.) Neither header says
  so; §4.1's fourth outcome asks that it be written down.
- **`memberPath.length === 0` in `no-raw-egress` and `persistence-boundary`.** The resolved-global branch is
  reached only for non-member nodes, where `memberPath` is empty by construction — the same shape §4.1
  records for `no-raw-matchmedia`. Neither header says so.

### The one DECLARED-HONEST non-narrowing — copy this sentence

`registry-assembly-at-door-only.ts:22-24`: *"The name prefilter is a CANDIDATE filter, not a narrowing —
**measured 2026-09-11: removing it changes no proof row**, because `classifyProjectHomeOrigin` is what
decides."* I cut it. No proof row changed. **A header that predicts its own clean cut is exactly what §4.1
asks for, and this is the only instance in the family.**

### The 33 genuinely unenforced narrowings, each with the falsifier that fixes it

| Module | narrowing (`file:line`) | the row that fixes it | falsifier measured |
| - | - | - | - |
| `no-rejected-cors-proxy` | `STRING_KINDS` `:16-22` — `NoSubstitutionTemplateLiteral`, `TemplateMiddle`, `TemplateTail` are subscribed and proven by nothing | two `mustFlag` rows: a backtick literal, and the host in a non-head quasi | both flag unmodified; both die with the three kinds removed |
| `no-rejected-cors-proxy` | `population: "@server"` `:45` | a `mustPass` placing the literal in `@client` | passes; dies under `@authored` |
| `persistence-boundary` | `population: "@client"` `:107` | a `mustPass` placing `globalThis.localStorage` in `@server` | passes; dies under `@authored` |
| `persistence-boundary` | the `NoSubstitutionTemplateLiteral` arm of `storageCandidateName` `:65` | a `mustFlag` on ``globalThis[`localStorage`]`` | flags; dies with the arm removed |
| `no-raw-egress` | `population: "@server"` `:122` | a `mustPass` placing `globalThis.fetch` in `@client` | passes; dies under `@authored` |
| `no-raw-egress` | the `NoSubstitutionTemplateLiteral` arm of `fetchCandidate` `:68` | a `mustFlag` on ``globalThis[`fetch`]`` | flags; dies with the arm removed |
| `plugin-dump-guard` | the NEGATION requirement in `negatedGuardCall` `:81-83` | a `mustFlag` on `if (handleSafeToDump(…)) { return …; } return ctx.dump(handle);` | flags; dies when the `!` requirement is relaxed |
| `plugin-dump-guard` | `fn?.getName() !== HELPER` `:107` | a `mustFlag` on a guarded dump inside `otherDumpPath` in `membrane.ts` | flags; dies when the helper-name test becomes `fn === undefined` |
| `untrusted-regex-safe-exec` | `node.getName() !== PROPERTY` `:59` | a `mustPass` adding an unrelated property to the canonical object | passes; dies with the name test removed |
| `no-untyped-soft-ref` | `!column.primaryKey` `:47` | a `mustPass` on `widgetId: text("widget_id").primaryKey()` | passes; dies with the clause removed |
| `persisted-store-registry` | the `UNREADABLE_NAME` report arm `:236-239` | a `mustFlag` on `createPersistedStore(dynamic, …)` | flags; dies when the arm returns silently |
| `no-mutating-register-api` | the exact-name test on the VARIABLE arm `:37` | a `mustPass` on `export const registerAll = (id) => {}` | passes; dies under `startsWith` |
| `no-inline-domain-interface` | `notNamed: ["contract.ts", …]` and the `*.test.*` entries `:36` | one `mustPass` carrying both spellings under `domain/**` | passes; dies with `contract.ts` dropped |
| `no-inline-types` | the same two `notNamed` clauses `:112` | ditto | passes; dies with `contract.ts` dropped |
| `no-inline-types` | `notUnder` `forms/**`, `state/**`, `lib/**`, `server/src/kit/**` `:105-108` | one `mustPass` carrying all four homes | passes; **dies under each of the four cuts, measured separately** |
| `no-inline-types` | `in: ["@client","@server","@tooling"]` `:102` | a `mustPass` exporting a type from a whole-home package | not built (the whole-home packages are the point; a row is expressible) |
| `no-inline-types` | `VariableStatement` `hasExportKeyword()` `:79` | a `mustPass` on an UNEXPORTED `const Foo = z.object({})` | passes; dies with the clause removed |
| `no-inline-types` | `doors.has(ZOD_DOOR)` `:70` | a `mustPass` importing `object()` from a RESOLVED project module | passes; dies with the door test removed |
| `zod-modern-spellings` | `doors.has(ZOD_DOOR)` `:96` | a `mustPass` importing `union`/`literal` from a RESOLVED non-zod module | passes; dies with the door test removed |
| `zod-modern-spellings` | `population: "@packages"` `:164` | a `mustPass` placing the union in `@tooling` | passes; dies under `@authored` |
| `zod-modern-spellings` | `node.getArguments().length > 0` `:111` | a `mustPass` on `z.object({}).strict("why")` | passes; dies with the arity test removed |
| `zod-modern-spellings` | `MIN_LITERAL_UNION_MEMBERS` `:125` | a `mustPass` on `z.union([z.literal("a")])` | passes; dies with the minimum removed |
| `zod-modern-spellings` | `texts[0] !== texts[1]` `:138` | a `mustPass` on `z.enum(["true","true"])` | passes; dies with the distinctness test removed |
| `zod-modern-spellings` | `args.length === 1` in `soleArrayArgument` `:106` | a `mustPass` on `z.enum([…], { error: "x" })` | passes; dies with the arity test removed |
| `zod-error-issues-home` | `population: "@packages"` `:92` | a `mustPass` placing the flatten in `@tooling` | passes; dies under `@authored` |
| `zod-error-issues-home` | `member.value.name === ISSUES` `:67` | a `mustPass` on a NON-`issues` zod member read (`failure.message`) | passes; dies with the name test removed |
| `zod-error-issues-home` | `property !== ISSUES` in `isIssuesDestructure` `:76-78` | a `mustPass` destructuring `{ message }` off a `ZodError` | passes; dies with the clause removed |
| `registry-assembly-at-door-only` | `in: ["@client"]` `:59` | a `mustPass` calling the factory from `@server` | passes; dies under `@client`+`@server` |

**Not isolated by any fixture I could build:** `persisted-store-registry`'s `population: "@client"`. My
cross-package falsifier stayed green under the cut, so I cannot promote it past "clean cut, cause
unestablished". Recording the gap rather than faking a row is §4.1's own instruction.

## Header lies — three claims the tree's own data refutes

These are the §5b.2/§5b.5 class: a header that says something a reader will believe and the code or the
data does not support.

1. **`persistence-boundary.ts:7-13` claims six grant rows where FOUR exist.** *"The legacy
   `RAW_STORAGE_ALLOWLIST` was six FILES, each with a written standing reason: **the two factories are the
   doors themselves**, `durable-local.ts` …, `probe-mode.ts` …, `session-resume.ts` … and `main.tsx` ….
   **Every one is a recurring repository PERMISSION rather than a per-occurrence slip, so each is an exact
   `(subject, operation)` row**"*. Derived from `lib/reviewed-grants.ts`:
   `grep -c 'policyId: "persistence-boundary"'` → **4**, and the four subjects are `durable-local.ts`,
   `main.tsx`, `probe-mode.ts`, `data/session-resume.ts` (`:574`, `:582`, `:590`, `:598`). The two persist
   factories got no row. The roster row at `Core-Enforcement-Active-Gates.md:152` says "four" and is
   CORRECT; the module header is the one that is wrong.
2. **`no-untyped-soft-ref.ts` `mustPass[2]`'s `why` claims to prove the primary-key exemption and does
   not.** *"a PRIMARY KEY id and a non-id column are not soft refs — the pk exemption is the resolved
   operation, not a `.includes(".primaryKey(")` text probe"*. Its fixture's key is `id`, which fails
   `/Id$/u` (case-sensitive) — so the column is excluded by the id-shape test, never by the pk clause.
   Deleting `!column.primaryKey` leaves every row green; the row that would die is
   `widgetId: text("widget_id").primaryKey()`, which I built and measured in both directions. §4.7: *"A
   header that says 'this row proves X' for a row never shown to catch X is a defect."*
3. **`registry-assembly-at-door-only.ts:26` declares `FAMILY: SINGLETON under its own id`** while
   `no-mutating-register-api.ts:46` carries `family: "registry-assembly-at-door-only"`. The family has two
   members, and the same header says so three paragraphs earlier. §5b.4/§5b.5.

Adjacent, and softer: **`no-rejected-cors-proxy.ts:7-9`** says *"the point of the rule is that the host
cannot be SPELLED in server source, in a string or in any part of a template"* — and the roster row at
`:203` repeats it — while only `StringLiteral` and `TemplateHead` carry a row. The behaviour is correct
(both falsifiers flag); the proof set does not support the sentence.

## Expectation rows (#1968) — the asymmetry, and where it bites

Re-derived from `ops/policy-conformance.ts:184-216`: `count` compares `findings.length` EXACTLY; `line`,
`token` and `messageIncludes` all run through one `findings.some(…)`, so any single matching finding
satisfies the row no matter how many others fire.

**66 `mustFlag` rows across the fifteen. ZERO with no `expect`. ONE with no `count`.**

- **`persisted-store-registry` `mustFlag[4]`** — `expect: { messageIncludes: "classifies nothing" }`.
  Derived by planting `count: 99`: *`expected effective finding count=99 but got 14`*. **The row therefore
  passes on 1 stale finding as readily as on 14**, so the completeness of the two-sided stale ratchet — the
  whole point of the arm — is not pinned. `count: 14` is the fix, and it also becomes a tripwire the next
  time `DEVICE_LOCAL_REGISTRY` gains a row.

**`messageIncludes` census: 7 rows, 2 tautologies.**

| Row | string | transplant | verdict |
| - | - | - | - |
| `persisted-store-registry` mF0-3 | `"unregistered-name"` | transplanted `"classifies nothing"` onto mF0 → **FAILED** | DISCRIMINATES |
| `persisted-store-registry` mF4 | `"classifies nothing"` | transplanted `"unregistered-name"` onto mF4 → **FAILED** | DISCRIMINATES |
| `no-untyped-soft-ref` mF0 | `"soft ref is banned"` | swapped for `"boundaries are physics"` → **PASSED** | **TAUTOLOGY** |
| `no-untyped-soft-ref` mF3 | `"soft ref is banned"` | swapped for `"Core-Path-Registry.md D24"` → **PASSED** | **TAUTOLOGY** |

The cause is in the source, not in the fixtures: `no-untyped-soft-ref.ts:42` sets `const UNREADABLE =
MESSAGE`, so **every** finding this policy can emit — readable or not — carries the whole `MESSAGE` string.
Any substring of it is an inert discriminator. §4.1 names exactly this: *"most converted modules … carry
exactly one policy-level message, which makes any row `why` promising a 'distinct message' a defect rather
than a pinnable claim."* Both rows already carry `count` and one carries `token`, so the fix is to delete
the `messageIncludes`, not to add anything.

## The identity arm — six of six discriminate, and the exemplar is GOOD

§4.2 requires exactly one POSITIVE arm per ordinary policy. Six of the fifteen are ordinary; all six have
one; **all six ALARM on a dead position.** Every row below is a measured run in this session: I moved the
marker's position token to a dead one and the arm went red.

| Policy | arm | dead-position control |
| - | - | - |
| `no-inline-types` | family test `:187-196` | `(Foo)` → `(Bar)`: **1 failed / 13 passed**, `AUTHORITY ALARM [ordinary-waiver] … names a dead position` |
| `empty-state-has-action` | family test `:207-218` | `(Empty)` → `(EmptyState)`: **1 failed / 13 passed** |
| `no-inline-domain-interface` | in-module `mustPass[3]` | `(Foo)` → `(interface)`: row died, `… names a dead position for no-inline-domain-interface` |
| `no-mutating-register-api` | in-module `mustPass[4]` | `(register)` → `(registry)`: row died |
| `registry-assembly-at-door-only` | in-module `mustPass[3]` | `(createRegistry)` → `(assemble)`: row died |
| `zod-modern-spellings` | in-module `mustPass[5]`, `[6]`, `[7]` | `(strict)`→`(object)`, `(union)`→`(literal)`, `(enum)`→`(flag)`: **all three died independently** |

### Is `ordinary-visitors-family.test.ts:187-205` a good exemplar? YES — with one citation fix

**The positive arm at `:187-196` is the best identity-arm shape in the corpus and should keep being the
thing lanes copy.** It meets §4.2 in full and for the right reasons:

- It asserts the complete triple — `effectiveFindings` `toEqual([])`, `waivedFindings` `toHaveLength(1)`,
  `authorityAlarms` `toEqual([])`. A `mustPass` row asserts only the first; §4.2 names the other two as the
  reason a `runPolicyPass` pin exists at all. **Measured contrast inside this same family:** the
  `empty-state-has-action` pin at `:207-218` omits `authorityAlarms`. It still discriminated on my
  dead-position control (because a dead position leaves the finding effective), but it would not catch an
  over-broad or duplicate marker, which alarms without changing the count. **Copy `:187-196`, not
  `:207-218`.**
- Its fixture produces EXACTLY ONE finding, which §4.2 makes a hard requirement ("one marker consumes one
  occurrence"). The two-line fixture makes that self-evident to a reader.
- It goes through `passOf` → `runPolicyPass` with `knownPolicies: [policy]`, which is the production
  dispatcher, not a hand-rolled harness.
- It is nine lines. A lane can copy it without understanding the authority engine.

**The one correction the rule owes.** `:198-205` is a dead-position NEGATIVE arm, and §4.2 says *"Never copy
a negative arm into a gate."* Because it names the SAME policy id with a wrong position, it does NOT ride
the unknown-policy short-circuit — so as a committed instance of §4.2's own prescribed "two-command
control" it is genuinely valuable and should stay. But the rule file and §4.2 both point lanes at
**`:187-205`**, which includes it, while `v-exemplar-audit-2026-09-12.md:146` points at **`:187-195`**.
**Repoint both to `:187-196` (the positive arm alone)** and, if the negative is worth advertising, cite
`:198-205` separately as "the family-level discrimination control, one per FAMILY, never per gate."

One further gap, not in the cited range: `zod-modern-spellings` is the only module in the family that ships
a per-TOKEN identity arm (three of them, one per arm, each proven independently). Its header at `:30-35`
explains why, and that paragraph is the better exemplar for any multi-arm ordinary policy.

## Refusal and receipt pins (§4.5) — the family's strongest axis

Four policies locate a subject and refuse when it disappears, and the family test pins all four
(`:128-180`). I verified the pins BITE rather than assuming it: **cutting
`untrusted-regex-safe-exec`'s `ctx.relativePath(sourceFile) !== COMPOSE_ANCHOR` fence turns the
"not laundered by a SAFE seam in another compose module" pin RED** (1 failed / 13 passed). That is the one
place in this family where a narrowing with no proof row is nonetheless enforced — and the module header
does not say so, which is why I still count it against criterion 5.

The real-tree run confirms every receipt has live members: `persist store factories: 2`,
`registry factories: 2`, `membrane guest-dump sites: 1`,
`world-info regex-key composition seam: 1`, `drizzle-schema: 1288`.

## Checked and CLEAN — the defect classes this family does NOT have

- **#1979, the silent not-ready return: ZERO sites.** Fourteen of fifteen declare `facts: []`. The one
  consumer, `no-untyped-soft-ref:81`, calls `recordReadySchemaFact(ctx, fact)` — an
  `asserts fact is ReadySchemaFact<T>` function (`contract/schema-fact.ts:29`) that THROWS on a non-ready
  status and files the receipt before returning. `fact.value` before the call does not compile.
- **The `ctx.relativePath` partiality trap (#1972): ZERO exposed sites.** Every call is either on a VISITED
  `sourceFile` (`no-raw-egress:145`, `no-raw-interactive-intrinsics:90`, `persistence-boundary:131`,
  `zod-error-issues-home:113`, `untrusted-regex-safe-exec:59`) or on a member of `ctx.files`, which IS the
  effective population (`persisted-store-registry:222-223,256`, `registry-assembly-at-door-only:67`,
  `plugin-dump-guard:151`). **Two modules go further and document the hazard correctly**:
  `empty-state-has-action:38-40` and `untrusted-regex-safe-exec:30-32` both use a `pathInfix` home
  *"because the declaration lives OUTSIDE this policy's population, where `ctx.relativePath` refuses by
  contract."* That is the right instinct written down; copy it.
- **`under: ["x/"]` without `**`: ZERO instances.** Every `under`/`notUnder` value across the fifteen either
  ends in `**` or is an exact file path, and the exact-file spelling is PROVEN to work — cutting
  `notUnder: ["packages/client/src/main.tsx"]` from `registry-assembly-at-door-only` kills `mustPass[1]`.
- **The fixture-specifier resolution control exists and is derived, not hand-carried** (family test
  `:85-121`): it asserts `sequence` equals a count re-derived from the descriptors, so "zero dangling" and
  "no row was visited" cannot look identical. This is the best version of that control I have seen.
- **Roster honesty: 15 of 15 rows present in `Core-Enforcement-Active-Gates.md`, and every one names
  MECHANISMS** (identity readers, authority class, what the split preserved) rather than coordinates. Zero
  bare pre-conversion labels — the first wave to score 15/15. Grant counts re-derived and correct:
  `no-raw-egress` 8, `no-raw-interactive-intrinsics` 1, `no-untyped-soft-ref` 6, `persistence-boundary` 4,
  `zod-error-issues-home` 8 (the roster's "eight … one of them translated from a permanent inline marker"
  reconciles exactly with the module header's "seven survivors" + one translated marker).
- **`empty-state-has-action` waived 20 on the real tree**, matching the header's and the roster's
  twenty-marker claim exactly. A translated marker census that is TRUE when measured.
- **Contract minimality (§5b.1): no over-declaration found.** `facts: []` and `resources: []` everywhere
  except the one schema-fact consumer; `analysis: "syntax"` on all four pure-syntax policies
  (`no-inline-domain-interface`, `no-mutating-register-api`, `no-rejected-cors-proxy`,
  `no-raw-interactive-intrinsics`); `execution: "entire-population"` only where a receipt or grant liveness
  genuinely needs the whole population.

## §5b.3 — four of six ordinary policies ship a `fix` that names no waiver spelling

§5b.3 is unconditional for an ordinary policy: *"`fix` names the exact waiver spelling … read off the
`report.node` call and never off the message."* Derived mechanically from each descriptor's `fix` string:

| Ordinary policy | `fix` contains `@orb-waive` | note |
| - | -: | - |
| `no-mutating-register-api` | **yes** | and it names the position RULE: *"the reported position is always the literal text `register` … never the enclosing object or variable"* |
| `registry-assembly-at-door-only` | **yes** | and names the position rule: *"the LOCAL callee name at the call site, after the last dot"* |
| `empty-state-has-action` | no | the MESSAGE carries `@orb-waive empty-state-has-action(EmptyState)`, but the module's own alias row proves the position is the AUTHORED tag (`Empty`) — so the one spelling a reader sees is wrong for exactly the case the module is proudest of |
| `no-inline-domain-interface` | no | — |
| `no-inline-types` | no | wave 1 filed this at `v-exemplar-audit-2026-09-12.md:299`; still open |
| `zod-modern-spellings` | no | the HEADER names `@orb-waive zod-modern-spellings(strict\|union\|enum)` at `:31-32`; the `fix` does not |

## §5b.5 — population port and family declaration

Nine of fifteen record the population port in the header or as a population-adjacent comment:
`no-mutating-register-api` (labelled `POPULATION PORT`), `registry-assembly-at-door-only` (labelled, AND
the only one naming the legacy SHA — `68c8f42d6`), `no-inline-domain-interface:30-31`, `no-inline-types:96-100`,
`zod-modern-spellings:162-163`, `zod-error-issues-home:90-91`, `no-raw-egress:119-121`,
`persistence-boundary:105-106`, `no-raw-interactive-intrinsics:67-68`.

Six do not: `empty-state-has-action`, `no-rejected-cors-proxy`, `plugin-dump-guard`,
`untrusted-regex-safe-exec`, `persisted-store-registry`, `no-untyped-soft-ref` (which inherits the shared
`DRIZZLE_SCHEMA_POPULATION` constant, a partial excuse).

Family declarations: the five split pairs are all correct and all explained on BOTH sides
(`no-inline-types`/`no-inline-domain-interface`, `no-raw-egress`/`no-rejected-cors-proxy`,
`persistence-boundary`/`persisted-store-registry`, `zod-modern-spellings`/`zod-error-issues-home`,
`registry-assembly-at-door-only`/`no-mutating-register-api` — the last with the singleton contradiction
noted above). `empty-state-has-action` is an undeclared singleton with no stated reason while sharing
`lib/sealed-origin.ts` and `lib/origin-verdict.ts` with `untrusted-regex-safe-exec` — §5b.4 wants that
decision written down either way.

## A program-level finding, filed for routing rather than as a module defect

`pnpm check:structure` reports **`✗ no-inline-types (19)`** on the real tree. Eighteen of the nineteen are
exported verdict types in `tooling/src/verify/lib/**` — the shared readers the #1584 program MANDATES every
conversion to use:

```
tooling/src/verify/lib/sealed-origin.ts:14:13         SealedOriginVerdict
tooling/src/verify/lib/project-home-origin.ts:37:13   ProjectHomeVerdict
tooling/src/verify/lib/policy-pass-context.ts:40,45   PolicyFactValueEntry, PolicyFactValueRegistry
tooling/src/verify/lib/bus-fact-read.ts:281,388       BusTypedDiscriminators, EmitterSinkKind
… 13 more, plus one at packages/client/src/features/app-shell/lib/bug-report-capture.ts:200
```

**The count is ratcheting with the program, and nobody is tracking it.**
`checkpoint-2026-09-05.md:225` records **15** (*"PRE-EXISTING … the base legacy descriptor replays the same
15 sites … deliberately unwaived; the fold row moves them"*); `mixed-runtime-front-door.md:349` records
**18** (waived 5); I measure **19**. I did not establish which four are new, and the claim that the
original fifteen are pre-existing is the checkpoint's, not mine. But the mechanism is plain: every new
shared `lib/` reader that exports its verdict type adds one, and the population admits `@tooling` minus
`tooling/src/_shared/**` and `**/contract/**`. Either `tooling/src/verify/lib/**` is a type home (a
population edit) or the verdict types belong in `verify/contract/` (a code edit) — both are decisions, and
"gates land on a FIXED tree" says one of them is owed.

## The module to copy

**For a reviewed-grant conversion: `no-raw-interactive-intrinsics`.** Zero genuinely unenforced narrowings;
six `mustFlag` rows each with an exact `count` AND `token`; the `<a href>` narrowing pinned by two separate
`mustPass` rows; the population port, the 2026-08-22 scan-and-allowlist ruling and the DELETED empty
`BURN_DOWN` table all recorded in the header; `analysis: "syntax"` with `facts: []` and `resources: []`; a
`message` that is true clause by clause; and an honest declared reason for resolving no identity at all
(*"a lowercase tag is the DOM element by language rule … which is why this policy resolves nothing and says
so rather than performing a resolution that could only ever agree"*). Its grant row count (1) reconciles
with `lib/reviewed-grants.ts`. Its two residual clean cuts are a MUTUALLY REDUNDANT `in`/`under` pair
(proven jointly enforced) and the UNFALSIFIABLE `ext: ["tsx"]`. Its only owed edit is one header sentence
recording that `ext` is unfalsifiable.

**For an ORDINARY conversion — which is what most of the remaining 104 are: `no-mutating-register-api`.**
It does the thing no other module in this family does: its `mustPass[3]` `why` states *"Deleting the
`@client` population leaves every other row green; **this is the only row that dies without it**"*, and I
cut the population and confirmed that sentence is TRUE. Its `fix` names the waiver spelling AND the
position rule. Its identity arm discriminates. Its header labels the POPULATION PORT and explains why this
policy's population deliberately differs from its sibling's. Three of its four narrowings are enforced.
**Hand a lane this module plus the `:187-196` identity arm and it has everything it needs.** Its one owed
edit is the variable-arm exact-name row (`export const registerAll = (id) => {}`), which I built and
measured in both directions.

**Do NOT hand a lane `no-inline-types`, `zod-modern-spellings`, `persistence-boundary` or
`no-rejected-cors-proxy` as a shape to copy**, whatever their conformance verdict says: between them they
account for 19 of the family's 33 unenforced narrowings, two of the three header lies, both tautological
discriminators, and the family's only two zero-enforced-narrowing modules.

## What I did NOT cover

- **I did not run `pnpm verify --full`, the whole node/CT battery, or `pnpm gate:contract`.** I ran the
  family test, the conformance stage and `check:structure` once each. The `gate:contract` corpus total
  before/after this lane is therefore UNMEASURED by me — the lane modified no tracked code, so I assert
  only that it cannot have changed it, not that I measured it.
- **`persisted-store-registry`'s `population: "@client"` is unclassified.** My falsifier did not
  discriminate; I record the gap rather than a row.
- **`no-inline-types`'s `in: ["@client","@server","@tooling"]`** is the one UNENFORCED cell in the table
  without a built falsifier. The row is expressible; I did not build it.
- **I did not classify which four of the nineteen live `no-inline-types` findings are new since
  2026-09-05**, only that the count moved 15 → 18 → 19 across three dated receipts.
- **I did not audit the five reviewed-grant policies' grant `why`/`endsWhen` prose for accuracy**, only the
  row COUNTS against `lib/reviewed-grants.ts` and the headers' claims about them.
- **The 3-way redundant clusters in `no-raw-egress` and `persistence-boundary` were proven jointly, not
  decomposed.** I did not establish whether a fixture exists that isolates `isExpressionReference`; my two
  attempts did not, and I report that as unestablished rather than as unenforced.
- **Conformance is structurally blind to `node_modules`, symlink and absolute-path defects** (virtual
  projects, `useInMemoryFileSystem: true`). `check:structure` covers the real tree and reported
  `0 tool error(s) · 0 withheld`, which is the strongest statement available; it is not a statement about
  those three trigger classes in isolation.
