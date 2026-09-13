---
kind: review
status: active
updated: 2026-09-12
---

# cb-v-migrations-wave — the five gate commits of 2026-09-12, verified cold

Lane `cb-v-migrations-wave`, fresh-context Opus verifier, own worktree at `9e14a5d93` (= `main` tip; the
worktree needed no rebase — it was already at the tip, `git log --oneline -1` and `git log --oneline -1 main`
both `9e14a5d93`). Every number below is a run I produced in this session. No tracked file was edited: every
probe wrote a scratch sibling module (one per cut, serial-numbered `cbvmw-<serial>-…`) removed in a `finally`,
and `git status --short` is EMPTY with zero `cbvmw` files left in `gates/` or `lib/`.

## VERDICTS

### 1. `3420a81e9` — five families' shared predicates move to `lib/` — **CONFIRMED** (2 LOW defects)

- **Move cut, per family, BOTH siblings** (the §4.1 rule that a split family's cut names the policy it was
  driven against — I drove each cut against BOTH policies, in one invocation, one scratch lib + one scratch
  gate per sibling per cut, anchor asserted to occur EXACTLY ONCE or the harness refuses):

  | family | cut (in `lib/`) | occurrence sibling | `-health` sibling |
  | - | - | - | - |
  | `raw-spacing-tier` | `SANCTIONED_HOMES` → `{}` | `mustPass[0]` died | `mustFlag[0]` died |
  | `raw-typography-tier` | `SANCTIONED_HOMES` → `{}` | `mustPass[0]` died | `mustFlag[0]` died |
  | `context-definition-shape` | `REGISTRY_CONTRACTS_RE` → never-matching | `mustPass[1]`,`[5]` died | `mustPass[1]` died |
  | `context-definition-shape` | `DEFINE_CONTEXT_REGION` → renamed | `mustPass[4]` died | `mustFlag[0]` died |
  | `freeze-provenance` | `writeChainVerdict` → `"other"` | `mustFlag[2..11]` + `mustPass[15]` died | `mustPass[0]` died |
  | `bus-fact` (`deferralsFor`) | body → `return []` | `user-bus` `mustFlag[0]` + `mustRefuse[0]` died | `bus-producer-coverage` `mustPass[8]` died |

  Every family kills rows in BOTH consumers. The commit's own cited row indices reproduce where I cut the
  same symbol (`context-definition` owner `mustPass[4]` + health `mustFlag[0]`; freeze `mustFlag[8..11]` +
  `mustPass[15]` + health `mustPass[0]`; bus `mustFlag[0]` + `mustPass[8]`).
- **No duplicate declaration survives**: a declaration sweep for all thirteen moved symbols across
  `tooling/src/verify/**` returns exactly ONE home each, all in `lib/` (the three other `SANCTIONED_HOMES`
  hits are unrelated single-module tables in `no-pointer-variants-in-features`, `ui-skin-fragment-purity`,
  `no-raw-z-index`).
- **The `-health` sibling receipts a CONSTANT (§12.3)**: five of the six touched `-health` modules declare
  `facts: []` and owe no receipt; `freeze-provenance-write-pairing-health:102` receipts
  `{ members: 1 }` in the blindness branch and otherwise routes through `recordReadySchemaFact`, which files
  the PROVIDER's own measurement, never the policy's census. Correct.
- **LOW-1 (defect):** `lib/context-definition-shape.ts` moved THREE names and its header says *"the three
  names both halves must spell IDENTICALLY"* and *"A `lib/` module earns its place by having two readers"*.
  `REGION_ATTR` has ONE reader. Cut of `REGION_ATTR`: `context-definition-shape` **0 rows died**,
  `context-definition-shape-health` 1 row died (`mustFlag[1]`); a corpus grep finds the only other mentions
  in that same `-health` module. The other two names cut both ways (table above).
- **LOW-2 (defect):** the move CREATED a second home for `UNION` — the identical
  `{ path: "packages/contracts/src/user-bus/index.ts", exportName: "UserBusEvent" }` literal is now declared
  at `lib/bus-deferred-member.ts:40` AND `gates/user-bus-deferred-member.ts:59`, in the commit whose own body
  says *"two homes for one concept, which a symbol move must end, not create"*. It is PROOF-GUARDED (I drifted
  the `lib/` copy's path: `user-bus-deferred-member` `mustFlag[0]` + `mustRefuse[0]` and
  `bus-producer-coverage` `mustPass[8]` all red), so it is hygiene, not a blind spot.

### 2. `3ed1a7d7a` — the tenancy registry moves to `lib/` as a record array — **CONFIRMED**

- **The two-sided 97-name set proof, re-derived independently** (my own walker over
  `packages/db/src/schema/**` + the live `TABLE_SCOPING_ROWS`, with a planted control):
  `schema files=30 declared=97 rows=97 mapSize=97`, *in registry NOT in schema:* **(none)**, *in schema NOT
  in registry:* **(none)**, census `ownerId 27 · membership 21 · junction 17 · parent 26 · global 6` —
  byte-for-byte the header's re-derived figures. Control: `declared.has("users")=true`,
  `declared.has("cbvmw_not_a_table")=false`.
- **Pinned as derived-vs-declared EQUALITY, never the literal 97**: the reshape pin asserts
  `byName.size === rows.length` and the two key sets equal; RATCHET SIDE 2 asserts
  `stale.length === TABLE_SCOPING_ROWS.length - 1`. No literal count anywhere in the three pins.
- **The three invented pins DISCRIMINATE, and the diagonal is real** — reproduced independently by driving
  a scratch copy of `table-scoping-class` through `runPolicyPass` with the family test's own two fixtures:
  control `SIDE1 unclassified=1 (token "planted_extra_table") · SIDE2 stale=96 (= rows-1)`;
  break the UNCLASSIFIED report → `SIDE1 0 · SIDE2 96`; break the STALE report → `SIDE1 1 · SIDE2 0`.
  Each break kills its own side and leaves the other intact.
- `pnpm test:scoped tests/tooling/verify/gates/tenancy-scope-family.test.ts` → **7 passed**, exit 0.
- **ONE lib reader**: all four policies reach the classes through `tableScopingClasses()` /
  `ownerScopedTableIdents` / `schemaTableIdents`; `TABLE_SCOPING_CLASSES` appears **zero** times anywhere in
  `tooling/`, `tests/` or `docs/`.
- **No suppression, no override widening**: zero `biome-ignore` / `eslint-disable` / `useNamingConvention`
  in `lib/tenancy-scope.ts` or `gates/table-scoping-class.ts`, and no `tenancy`-scoped override in
  `biome.json`.
- **"Both headers' DELIBERATELY paragraphs rewritten, not deleted" — TRUE with one nuance.** The LIB
  paragraph (`3ed1a7d7a~1:lib/tenancy-scope.ts:13`) is quoted VERBATIM and superseded in place. The GATE-side
  sentence (`3ed1a7d7a~1:gates/table-scoping-class.ts:49`, *"NOT moved to `lib/tenancy-scope.ts`… the WALK
  moved, the DATA stays where its keys are legal"*) rode the registry's own JSDoc out of the file; its
  reasoning and its stale 87-count are both carried into the lib rewrite, so the substance survived — but
  only ONE paragraph is literally quoted, not two.
- **LOW-3 (defect):** the move left a stale header claim — `lib/tenancy-scope.ts`'s `ownerScopedTableIdents`
  JSDoc still says the three `owner-scoped-*` policies key on it *"(through `table-scoping-class.ts`'s
  wrapper)"*. There is no wrapper any more; all three import the reader directly from `lib/` (this commit's
  own diff).
- **`predicatesTableColumn` (the acquitting half) — cited, not re-filed, WITH a receipt and a correction.**
  I could not corroborate the brief's pointer: `#2214`'s only ledger row (`:380`) is the `_proof/node-types.ts`
  branch claim and is CLOSED, and NO file under `docs/` mentions `predicatesTableColumn` at all. On the tree
  the acquittal is **UNPINNED**: cutting the namespace acquittal (`… && !tableIdent.includes(".")`) kills
  **0 rows** in `owner-scoped-writes` and **0** in `owner-scoped-upserts`; positive control (the function
  always `false`) kills 3 and 7 rows respectively, so the cut reaches the code. That makes
  `tests/tooling/gate-spelling-twins.int.test.ts:38-40`'s sentence — *"the acquitting half moved with it …
  Pinned by that gate's own new namespace `mustFlag` row"* — FALSE: a `mustFlag` proves the ACCUSING side; an
  acquittal needs a `mustPass`. Filed below as MED-1.

### 3. `ebfe88146` — the last four gate-to-gate imports — **CONFIRMED**

- **ZERO gate→gate imports corpus-wide, with a positive control.** `ast-grep` over
  `tooling/src/verify/gates` (both `import … from` and `import type … from`, merged): **1963 import
  declarations across 305 files**; **35** sibling-relative (`./`) specifiers and **all 35** target
  `./_proof/**` (which pass by REGISTRATION, §12.3). `export … from "./…"`: **0**. The remaining `"./…"`
  string matches in `no-context-returntype`, `section-registry-completeness` and `playwright-css-topology`
  are inside fixture STRINGS. Positive control: **257 gate modules / 640 declarations** import `../lib/`.
- **ARM B reports 0 for the sibling class on the REAL corpus.**
  `pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` → **13 passed**,
  exit 0, including the 164 s real-corpus arm that asserts `accusedBy("policy-legacy-imports")` equals a text
  SECOND OPINION whose `importsSiblingGate` half is now empty, with `importOpinion.length > 0` still holding
  from ARM A. No tool errors, nothing withheld.
- **Move cut per family, both consumers:** `serde-core-seal` **2 + 3** rows died (exactly the commit's
  claim); `ct-poll-schedule-and-paint` **7 + 2**; `injected-op-caller-param` **3 + 2** on the genuinely
  shared predicate (`deriveEntityIdTypes`). Note the commit cut the ARRAY and reported "1 + a load refusal":
  cutting `callerFreeOps()` alone gives **1 + 0**, because the occurrence sibling reads the MAP and the
  `-health` sibling reads `CALLER_FREE_OP_ROWS` — the both-sides predicate is `deriveEntityIdTypes`, and it
  kills rows in both. Same conclusion, stronger receipt.
- **`sanctioned-css-homes`:** the structural receipt holds — exactly ONE declaration
  (`lib/sanctioned-css-homes.ts:36`), imported by `gates/sanctioned-css-homes.ts:8` and
  `gates/playwright-css-topology.ts:9`, no other declaration anywhere.
- **LOW-4 (defect):** the class is now EMPTY and the enforcer's own rows still advertise it as live.
  `policy-legacy-imports.ts:353`'s `why` says *"the live class (thirteen modules at landing) — `owner-scoped-reads`
  reading `table-scoping-class`'s idents, `bus-producer-coverage` reading `user-bus-deferred-member`'s
  deferral list"* and `:359`'s says *"`playwright-css-topology` reads `sanctioned-css-homes`' table"* — all
  three examples were dissolved by these very three commits. The ROWS still hold (synthetic fixtures), so this
  is documentation drift, not an enforcement gap; the same sentence lives in guide §12.3 (*"Both are RED on the
  tree by design"* is now half-false — ARM B is at zero).

### 4. `874b34b58` — the 23 blocking ARM-M findings — **CONFIRMED**

- **No `severity` or `authority` changed anywhere**, mechanically: the diff is **46 changed lines**, of which
  **0** are not an `expect: {` line, and the strings `severity`/`authority` appear **0** times in the diff.
- **All 6 NARROWED substrings discriminate, proven in BOTH directions by transplant** (scratch sibling per
  swap; a row that survives a foreign substring would prove the substring names nothing):
  - `assumes-single-replica`: the array row given the class row's substring → `mustFlag[1]` dies; the class
    row given the array row's substring → `mustFlag[2]` dies. Literal comparison of all three details against
    the base `MESSAGE` (`:41-45`): neither new substring occurs in `MESSAGE` (it says *"an array accumulator
    mutated"*, not *"a module-scope array accumulator mutated"*, and *"a locally-declared mutable-field
    class"*, not *"locally-declared class (\`Recorder\`) with a non-readonly field"*), which is exactly why
    the OLD substrings were tautologies.
  - `d-citation-integrity`: `reservedLabel` (`:121-125`) has exactly two branches and the module has ONE
    report site (`:169`). Branch-A substring transplanted into a branch-B row → `mustFlag[0]` dies;
    branch-B substring into the branch-A row (`:208`) → `mustFlag[2]` dies. The module now pins both branches.
- **The UPGRADED row is genuinely dynamic:** `public-route-body-cap-health:80` composes
  `` `… — ${routes.size} mutating routes, ${bodyReadingRoutes.size} body-reading routes.` ``, so the pinned
  `"0 mutating routes, 0 body-reading routes."` names the census's own numbers, not its prose.
- **The 2 `line`-pinned rows red under a line shift:** patching the report to
  `ctx.report.file(CLIENT_MANIFEST, { line: 2, … })` reds BOTH `surface-in-a-container-health` rows
  (`mustFlag[0]`, `mustFlag[1]`: *"expected one effective finding matching line=1"*). Row `[1]`'s separate
  prefix-fence claim also holds: relaxing ``startsWith(`${EXEMPT_DIR}/`)`` to `startsWith(EXEMPT_DIR)` kills
  `mustFlag[1]` **and only** `mustFlag[1]`.
- **The 14 deletions were rows whose count/token alone still discriminates.** Every one of the 8 modules has
  exactly ONE report site and one message shape, so the deleted substring was a constant (checked per module,
  including the three composed builders: `unslotted(tool, site)`, `missing(rel)` — single-branch templates).
  Cut receipts: cutting `testid-liveness-health`'s blindness arm (`if (rows === 0)` → false) kills **all
  three** deleted-substring rows; cutting `tooling-cli-entry`'s eligibility fence (`isToolCli(rel) &&`) kills
  `mustFlag[1..3]` + `mustPass[0..3]`.
  - Probed and CLEARED, stated because it looks like a hole: a hand-forced wrong-FILE report
    (`ctx.report.file(RUNNER_HOME.path, …)`) leaves `tooling-cli-entry` at **0 rows died** — but that is
    pre-existing (the same transplant against `874b34b58~1` is also 0), it is not reachable by any realistic
    mutation, and the fence that makes only one file eligible IS pinned by count. Not a defect; not filed.
- **`policy-proof-expectations` at 0 on the real corpus:** stronger than the 11 modules — the soundness
  family's real-corpus arm holds it in `closedAtZero` (`accusedBy(policy-proof-expectations) === []`) over the
  WHOLE gate corpus, and that test passed 13/13 in my run.

### 5. `b5490a02a` — chunk C1, the `css-length-tokens` re-key, #2103 — **CONFIRMED** (one defect it shipped is ALREADY CLOSED on main)

- **All four deleted tables were EMPTY at the parent, by declaration**, not merely unused:
  `list-row-adoption` `const ALLOWLIST: ExemptionTable<RootRow> = {};`, `stale-draft-commit`
  `const ALLOWLIST: ExemptionTable = {};`, `no-interactive-role-in-features:49`
  `const BURN_DOWN: ExemptionTable = {};`, `db-structure:56` `BASELINE_RIDER_PRODUCERS` = a literal holding
  only comments. `stale-draft-commit` keeps its `finalize` for the `DECISION_HOME` tripwire, as claimed.
- **`css-length-tokens`' liveness arm runs against the REAL `shell.css`**, driven through the LEGACY
  `runPass` at the repo root (`scanShell` reads `join(ctx.root, SHELL)`). Every header cell reproduces:

  | drive | shell-arm findings | class-arm findings (my thin file set) |
  | - | -: | -: |
  | no cut | **0** — all ten declaration rows and all three query rows resolve | 4 |
  | one `width: 100dvw` row re-keyed to a fourth selector | **+2** (the real occurrence REPORTED at `shell.css`, the row UNUSED) | 4 |
  | a query row's prelude changed 48rem → 49rem | **+2** | 4 |
  | the declaration liveness test INVERTED | **10 UNUSED** | 4 |

  The 4 class-arm findings are `STRUCTURAL_CLASS_FILES` rows against a deliberately thin file set (my probe
  loads one file) — the unconverted half the commit says it did not touch.
- **#2103 is a deletion with a successor, not a carry and not a grant.** `CLIENT_EXCLUDE_FILES` is gone,
  `clientTierRel` has no per-file subtraction, `tests/client/data/trpc.test.ts` exists (3 tests, green:
  `pnpm test:scoped` exit 0), the manifest was regenerated in the same commit, and the successor row's
  polarity claim is TRUE: renaming the mirror in `mustPass[7]`'s file map reds exactly `mustPass[7]`.
- **The defect this commit shipped was caught by a later commit already on main.** `ea37c99d8` —
  *"css-length-tokens' liveness arms fire inside fixtures — the #2101 re-key dropped the real-tree guard
  (#2198)"* — is the parent-of-my-HEAD-side fix. My measurements above are at `9e14a5d93`, i.e. WITH that
  guard; at `b5490a02a` itself the arms were unguarded. Recorded, not re-filed.

### Cross-cutting — the `ledger rows OWED:` / `flipped ledger rows:` lines — **REFUTED**

Three of the five commits leave ledger rows OPEN for work that shipped, and one of them claims the flip.

| commit | its line | tree |
| - | - | - |
| `3420a81e9` | *"none"* | correct in spirit — its four rows (`:582`,`:583`,`:591`,`:592`) ARE marked CLOSED at `3420a81e9`, so a later hand closed them |
| `3ed1a7d7a` | *"none"* | rows `:587`,`:588`,`:589` (`owner-scoped-{reads,upserts,writes}`) still read **OPEN → `p-family-readers`**; the imports are gone |
| `ebfe88146` | *"none"* | rows `:584`,`:586`,`:590`,`:593` (`ct-poll…-health`, `injected-op…-health`, `serde-core-seal-health`, `playwright-css-topology`) still read **OPEN**; the imports are gone |
| `874b34b58` | *"flipped ledger rows: policy-proof-expectations ARM M x23"* | `git show --stat` touches NO `docs/` file; the eleven per-module rows at `:608-618` all still read **OPEN — file per module** |
| `b5490a02a` | *"flipped … C1 · L7 · L10"* | already filed by another lane as ledger row `:632`; `:486` and `:554` (L10) since read CLOSED, `:483` (L7) reads OPEN-partial. **Cited, not re-filed.** |

## WHAT I RAN

1. `git log`/`git show --stat`/`git show -U6` on all five shas + `git show <parent>:<path>` for four
   pre-commit versions (never `git stash`/`checkout`/`restore`).
2. A conformance driver (`verifyPolicyProofs` through the production runner) over the 10 modules of commit 1,
   the 4 of commit 2, the 8 of commit 3, the 11 of commit 4 and the 6 of commit 5 — baseline `FAILURES=0`
   everywhere.
3. **14 cuts / transplants**, serials `s01`–`s14`, `t01`–`t11`, `u00`–`u03`, one scratch module per cut, anchor
   asserted to occur exactly once (the harness THROWS otherwise), all removed in `finally`.
4. `pnpm check:policy-conformance` (whole, once): **250 final policies · 2967 proof rows · 7 refusal rows ·
   0 failure(s) · 206 grant rows · 0 invalid · 38.6 s · corpus 304 modules**, exit 0.
5. `pnpm test:scoped tests/tooling/verify/gates/tenancy-scope-family.test.ts` → 7/7, exit 0.
6. `pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` → 13/13, exit 0
   (169 s; the real-corpus arm is 164 s of it).
7. `pnpm test:scoped tests/client/data/trpc.test.ts` → 3/3, exit 0.
8. `ast-grep --lang ts` over `tooling/src/verify/gates` for `import`/`import type`/`export … from`, merged and
   classified in a script (1963 declarations, 305 files, positive control 257 modules importing `../lib/`).
9. An independent schema-vs-registry set derivation over `packages/db/src/schema/**` with a planted control.
10. A legacy `runPass` driver over the REAL tree for `css-length-tokens`' shell arms.

No run exited 2, was killed, OOMed or timed out. Nothing was wrapped in `timeout`.

## LEDGER ROWS (5 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `tests/tooling/gate-spelling-twins.int.test.ts` · `lib/tenancy-read.ts` | cb-v-migrations-wave MED-1 · `tests/tooling/gate-spelling-twins.int.test.ts:38-40`, `lib/tenancy-read.ts:120-131` | the #2199 shrink receipt claims the namespace ACQUITTAL is *"Pinned by that gate's own new namespace `mustFlag` row"*. A `mustFlag` proves the ACCUSING side; an acquittal needs a `mustPass`, and none exists — so a shrink receipt written to make a deleted blind-spot arm auditable rests on a pin that does not hold. Parent: the brief's #2214 records the acquittal as unpinned; this row is the FALSE HEADER CLAIM beside it | §4.1 narrowing · header lie | **OPEN — new** | cut `predicatesTableColumn`'s receiver comparison so a namespace-spelled table can never acquit (`… && !tableIdent.includes(".")`): **0 rows died** in `owner-scoped-writes`, **0** in `owner-scoped-upserts`. Positive control (`return false`): 3 and 7 rows died, so the cut reaches the code |
| the refutation ledger | cb-v-migrations-wave MED-2 · `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:584,586,587,588,589,590,593` + `:608-618` | **eighteen rows read OPEN for work that shipped**, in the same family as `:632` but for three DIFFERENT commits: `3ed1a7d7a` closed `:587`,`:588`,`:589` and `ebfe88146` closed `:584`,`:586`,`:590`,`:593` while both commit messages said *"flipped ledger rows: none"*; `874b34b58` CLAIMED *"policy-proof-expectations ARM M x23"* and touched no `docs/` file, leaving all eleven `#2025` per-module rows at `:608-618` OPEN. Maintenance rule 1 (*"NO ROW OUTLIVES ITS FIX"*) again | other (ledger staleness) | **OPEN — new** | `git show --stat` on all three: nine, six and eleven files, none under `docs/reviews/`. The subjects verified landed: **zero** gate→gate imports corpus-wide (ast-grep, 1963 declarations / 305 files, positive control 257 modules importing `../lib/`), and `policy-proof-expectations` accuses **nothing** on the real corpus (`policy-soundness-family.repo.int` `closedAtZero`, 13/13 green) |
| `policy-legacy-imports` · design `gate-runtime-standardization.md` §12.3 | cb-v-migrations-wave LOW-4 · `gates/policy-legacy-imports.ts:353,359`; `docs/design/gate-runtime-standardization.md` §12.3 | ARM B's class is EMPTY as of `ebfe88146`, and the enforcer's own `why` strings still advertise it as live, naming three examples all dissolved that night (`owner-scoped-reads` → `table-scoping-class`, `bus-producer-coverage` → `user-bus-deferred-member`, `playwright-css-topology` → `sanctioned-css-homes`). §12.3's *"Both are RED on the tree by design (the migration rows)"* is now half-false. The proof ROWS still hold (synthetic fixtures) — this is the header-lie-read-as-precedent class, not an enforcement gap | header lie / doc staleness | **OPEN — new** | ast-grep: 35 sibling-relative imports in `gates/`, all into `./_proof/**`; `export … from "./…"`: 0. The three named examples' imports are absent from the tree |
| `lib/context-definition-shape.ts` | cb-v-migrations-wave LOW-1 · `lib/context-definition-shape.ts:8-16,22` | the new shared module's header states *"the three names both halves must spell IDENTICALLY"* and *"A `lib/` module earns its place by having two readers; the rest stays with its one"* — but `REGION_ATTR` has exactly ONE reader, so one of the three is single-consumer data in a shared home, contradicting the module's own stated criterion in the commit that mints it | §5b.5 header accuracy | **OPEN — new** | cut `REGION_ATTR` to a different attribute name: `context-definition-shape` **0 rows died**, `context-definition-shape-health` 1 (`mustFlag[1]`). The other two names kill rows in BOTH (`REGISTRY_CONTRACTS_RE` 2+1, `DEFINE_CONTEXT_REGION` 1+1). Corpus grep: no third reader |
| `lib/bus-deferred-member.ts` · `gates/user-bus-deferred-member.ts` · `lib/tenancy-scope.ts` | cb-v-migrations-wave LOW-2/LOW-3 · `lib/bus-deferred-member.ts:40` + `gates/user-bus-deferred-member.ts:59`; `lib/tenancy-scope.ts:444-449` | two residues the moves created: (a) the `UNION` identity literal is now declared in BOTH the moved-from gate and the moved-to lib module, in the commit whose body says *"two homes for one concept, which a symbol move must end, not create"*; (b) `ownerScopedTableIdents`' JSDoc still routes the three `owner-scoped-*` consumers *"through `table-scoping-class.ts`'s wrapper"*, which `3ed1a7d7a` deleted — all three now import the reader directly | one-home / header lie | **OPEN — new** | (a) drifting the `lib/` copy's `path` reds `user-bus-deferred-member` `mustFlag[0]` + `mustRefuse[0]` and `bus-producer-coverage` `mustPass[8]`, so the duplication is proof-guarded — hygiene, not a blind spot. (b) read off `3ed1a7d7a`'s own diff: the three gates' imports moved from `./table-scoping-class.ts` to `../lib/tenancy-scope.ts` |

## WHAT I DID NOT COVER

- **`pnpm check:structure` — NOT RUN** (brief-excluded; it is the orchestrator's serialized leg). So the
  whole-tree 23 → 0 ARM-M claim that `874b34b58` explicitly OWES to the barrier is still owed; I verified the
  stronger per-corpus statement through the soundness family's real-corpus arm instead.
- **The four planting suites — NOT RUN** (`check-gates.repo.int`, `gate-ignore-grammar.repo.int`,
  `gate-conformance.repo.int`, `gate-spelling-twins.int`). `check-gates.repo.int.test.ts` carries comment
  edits from commits 3 and 5 that no run of mine exercised, and `gate-spelling-twins.int.test.ts` is where
  MED-1's false claim lives — I read it, I did not run it.
- **The 54 LEGACY modules' proofs** (`gate-conformance`'s half of the corpus): `check:policy-conformance`
  reports them as proven elsewhere; I did not drive them.
- `gate:contract` totals (396 → 388) — not re-measured; the commits' own before/after pairs are unverified
  by me.
- The `STRUCTURAL_CLASS_FILES` half of `css-length-tokens` (deliberately unconverted) beyond noting the four
  findings my thin-file-set probe produces.
- The full `docs/` sweep for other stale citations of the now-empty gate→gate class — I checked
  `policy-legacy-imports` and §12.3 only.
