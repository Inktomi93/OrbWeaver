---
kind: review
status: active
updated: 2026-09-13
---

# Binding-reader GROUP A — the shared callable-declaration verdict (#2097, #2163)

Lane `cb-x-binding-reader-a`, isolated worktree based on `db6e5bbd6`. Subjects: the three modules that
each finished ONE question — *which callable declaration/body does this call denote?* — with their own
`getSymbol().getDeclarations()` chain: `audit-client-tests`, `class-token-splice`, `plugin-dump-guard`.
The owner ruling on #2097 forbids gate-local binding/origin resolution; `policy-binding-resolution` is the
enforcement floor and was NOT touched — it is the integration witness, and this report's last section is
its before/after.

Every number below was produced in this session. `main` moved 9 commits during the lane and touched none
of the nine files this lane owns (`git log db6e5bbd6..main -- <the nine paths>` = empty).

## 1. What the shared reader answers, and the semantics table

`tooling/src/verify/lib/reference-fact-call.ts#resolveCallableDeclaration(node)` →
`ReferenceFact<CallableDeclaration>`, where `CallableDeclaration` (declared in
`tooling/src/verify/contract/reference-fact.ts`) is `{ declaration, body, sourceFile }`.

It is deliberately NOT a declaration list, and NOT a generic "get declarations" door. A caller receives
ONE proven declaration or ONE precise refusal, which is the whole point: before this lane the three
modules answered multiplicity, reassignment and cycles three different ways —
`class-token-splice` demanded exactly one declaration, `audit-client-tests` took the first declaration
carrying a body, `plugin-dump-guard` asked whether ANY declaration matched.

Resolution order is MODULE axis first (`resolveModuleMemberOrigin` — the real resolver: aliases, import
renames, re-export renames), then the LEXICAL binding for the module-local factory the module axis
structurally cannot reach. That order is not invented here: `TS-MORPH-CAPABILITIES.md` limit 2 already
prescribed it and told each caller to write the fallback by hand, which is exactly the shape #2097
forbids. That entry now points at this reader instead (updated in this lane).

| Case | Verdict | Pin (`tests/tooling/verify/lib/reference-fact-callable.test.ts`) |
| - | - | - |
| module-local `function f` | resolved at the `FunctionDeclaration`, `body` present | "a module-local function resolves to its own declaration…" |
| `const g = f` (alias of a local function) | resolved at the SAME `FunctionDeclaration` as `f` | "a const alias of a local function denotes the SAME declaration, not the binding" |
| `const h = () => …` | resolved at the ARROW, never at the binding | "a const binding holding an arrow resolves to the ARROW…" |
| `import { f }` | resolved at the leaf declaration, `sourceFile` = the declaring file | "an IMPORTED function resolves through the real module resolver…" |
| `import { f as g }` · `export { f as renamed }` | resolved at the same leaf declaration | "an import RENAME and a re-export RENAME both land on the leaf declaration" |
| overload set (signatures + implementation) | resolved at the IMPLEMENTATION, via the module axis's own `overloadHome`, exported for the lexical axis | "an OVERLOAD SET is one home…" |
| `function f` + `namespace f` merge | `ambiguous` | same row, second half |
| binding reassigned anywhere in the file (`f = other`) | `write` — never a guess at the first declaration | "a REASSIGNED binding refuses as `write`…" |
| `let`/`var` binding | `write` ("mutable"), before anything reassigns it | "a MUTABLE binding refuses as `write`…" |
| const-alias cycle (`const a = b; const b = a`) | `cycle`, terminating | "an alias cycle and an import cycle each TERMINATE…" |
| re-export cycle (`left.ts` ⇄ `right.ts`) | `cycle`, terminating | same row |
| `declare function` / an overload signature | RESOLVED with `body: undefined` | "a bodyless declaration is a RESOLVED identity, not a refusal" |
| parameter | `missing` | "a parameter, a destructured binding and an unbound name…" |
| destructured binding | `dynamic` | same row |
| unbound name | `missing` | same row |
| unresolvable import door (`./absent.ts`) | the DOOR's refusal (`missing`, detail names the specifier), never the weaker lexical `ImportSpecifier is not a callable declaration` | "an unresolvable module door keeps the DOOR's refusal…" |
| unresolved package door (`external-door`) | `unsupported` — a package door proves SPELLING, not a declaration | (contract comment; covered by the door row above) |
| `f.call(null)` / `apply` / `bind` | `unsupported` | "a `call`/`apply`/`bind` invocation refuses…" |
| `new Thing()` (a class) | `unsupported`, WITH THE GAP NAMED in the detail (`constructor body is not modelled`) | "a construct target refuses with the gap NAMED…" |

14 pins, all green: `pnpm test:scoped tests/tooling/verify/lib/reference-fact-callable.test.ts` → 14/14.

Two supporting changes, both minimal and both named in the commit:

- `reference-fact.ts#inspectBindingReassignment` — the BINDING-scope twin of `inspectReferenceWrites`
  (value-scope). The distinction is load-bearing for this question: a member mutation (`f.cache = x`)
  changes the value and leaves the DECLARATION the name denotes untouched. It shares the open pass's write
  caches, so the file-wide write scan still happens once per file per pass (the #2026-era perf property:
  29 s of a 76 s composed pass when those caches were per-query).
- `reference-fact-module.ts#overloadHome` is EXPORTED. A module-local overloaded function has the same
  shape and the same one home as an exported one; giving the two axes two answers to one question is what
  this migration exists to stop.

**The one thing the reader deliberately does NOT carry:** a `scope: "local" | "module"` discriminator. It
was drafted and cut — no caller consumes it, and the honest claim it would have to make ("local ⟹ same
file") is FALSE for an ambient global, whose lexical symbol declares in `lib.d.ts`. Callers that need a
home question read `sourceFile`, which is the house idiom for a RESOLVED declaration (guide §12.3 —
`ctx.relativePath` THROWS on a declaration outside the policy's population). Same reasoning as
`ModuleMemberOrigin.canonical`'s deliberately-absent overload-set SIZE.

## 2. Per-gate: the red-first receipt and the preserved limit

Proof rows were driven through the PRODUCTION conformance runner (`verifyPolicyProofs([gate])`, the same
entry the static `structure:policy-conformance` stage uses), from a lane-unique scratch driver at
`$SCRATCHPAD/xbra-proofs.ts`. Backups for every probe were kept OUTSIDE `tooling/src/verify/gates/`
(a scratch module in that directory tool-errors the corpus loader); restore was one `cp` per Bash call;
no `git stash`/`checkout`/`restore` anywhere in this lane.

### 2.1 `audit-client-tests` — PRESERVED: the same-file-only imported-helper limit

- **Red-first:** `resolveCalleeBody` reduced to `return undefined` (the local chain deleted, the shared
  verdict not yet wired) → **mustPass\[1] RED** (the same-file helper hop). Restored → 0 failures.
- **Wired** → 0 failures across 9 `mustFlag` + 10 `mustPass`.
- **The limit and what changed under it.** Before: an imported helper's symbol declared an
  `ImportSpecifier`, which has no body, so the reader COULD NOT leave the file and the "declared limit"
  was a reader weakness nobody could falsify. After: the shared reader DOES follow the import, and the
  policy declines it at ONE explicit fence — `callable.value.sourceFile === call.getSourceFile()` — for a
  reason the reader change makes concrete: a cross-file body would make this `selected-files` verdict
  depend on a file the request need not contain, so `--changed` and the whole run would disagree. The
  duplicate second file test inside `assertsWithin` is deleted; the fence has one home.
- **§4.1 — and this is the part worth reading.** Cutting the fence with only the pre-existing rows reads
  **CLEAN**, and that is NOT an unenforced fence. `mustFlag[7]`'s test file carries no matcher expect at
  all, so the followed body's OFFSET RANGE has nothing to capture and the cut cannot reach the code — the
  guide's "a clean cut is more often an unenforced FIXTURE than an unenforced fence" class. The
  constructed falsifier is a NEW invented row, **`mustFlag[8]`**: a support helper whose body spans
  offsets **42-249** beside a test file whose own `expect(1).toBe(1)` spans **173-190** (both measured
  with a scratch probe before the row was written, not hoped for), so an unfenced cross-file body
  satisfies a stub that asserts nothing. Planted-break receipt: fence cut → `mustFlag[7]` green,
  `mustFlag[8]` **RED**; fence restored → both green.
- The family test's prose pin (`callback-provenance-family.suite.test.ts`) asserted the OLD mechanism in a
  comment ("the import never yields a body"). Same one finding is still asserted; the comment now states
  the fence and points at `mustFlag[8]`.

### 2.2 `class-token-splice` — PRESERVED: the indexed-return semantics

- **Red-first:** the local `lexicalReferenceSymbol(callee)?.getDeclarations()` fallback deleted →
  **mustPass\[1] RED** (the module-local factory idiom `shrink-0${widthClass(true)}` through a same-file
  `function`). Restored → 0 failures. Wired → 0 failures across 5 `mustFlag` + 12 `mustPass` (**6 + 13**
  after the 2026-09-13 delta repair below).
- **Indexed returns are untouched:** only a `FunctionDeclaration` yields a value set, and the shared
  verdict returns the SAME ts-morph node the ReturnStatement ancestor walk indexes, so
  `state.returns.get(declaration)` still hits. The `entire-population` reason and the cross-file return
  index (`mustFlag[3]`, `mustPass[0]`) are unchanged.
- **A behaviour DELTA, stated rather than papered over:** a module-local OVERLOAD SET now resolves to its
  implementation where the private exactly-one rule refused it, and a REASSIGNED callee now REFUSES where
  the old fallback silently took the single declaration. Both move the verdict the same direction this
  module's own header already celebrates for `resolveStableExpression`'s write refusal (`mustFlag[4]`),
  and both make the policy stricter, never more permissive — the only safe direction for a policy whose
  unresolvable arm is UNSAFE.

  **CORRECTED — LANDED 2026-09-13 (`5c73621ea`), REFUTED the same day by `cb-v-callable-reader` and
  repaired here.** The direction claim in the paragraph above is WRONG for the overload half, and the
  mechanism is the one this module's own doc states two lines up: an unresolvable segment IS the report
  verdict (`Segment = undefined` → `startsSafe` false → the junction reads as spliced), so **resolving
  MORE makes this policy report LESS**. Measured on the reviewer's fixture and reproduced here inside the
  production proof runner:

  - the OVERLOAD delta is **PERMISSIVE** — an overloaded module-local `widthClass` returning
    `" w-avatar-hero"` inside `` `shrink-0${widthClass(true)}` `` gives **1 finding pre-stack, 0 on the
    stack**. More ACCURATE (the dropped finding was a false positive on a factory whose returns genuinely
    lead with a space) but permissive, which is a different claim;
  - only the REASSIGNED-CALLEE delta is **stricter** (0 pre-stack, 1 on the stack).

  Deviation 3 below used the incorrect direction claim as its reason for giving neither delta a row. Both
  now have one, and both discriminate: `mustPass[12]` is the overload fixture (cardinality **0**, and 1
  before the migration), `mustFlag[5]` is the reassigned-callee twin (cardinality **1**, and 0 before).
  Receipt: restore the pre-#2163 two-half `calleeDeclaration` (`cp`-backed, one command per call) and run
  `verifyPolicyProofs` → **exactly 2 failures, `mustFlag[5]` (`got 0`) and `mustPass[12]` (`got 1`)**, and
  nothing else among the **19** rows moves (5 + 12 = 17 before the repair, 6 + 13 = 19 after); restored →
  0 failures, `git status --short` empty. *(The denominator read "18" until 2026-09-13; corrected by
  `cb-v-callable-reader`'s confirmation pass. The commit message that carries the same receipt is
  immutable and still says 18 — this file is the corrected copy.)*

### 2.3 `plugin-dump-guard` — PRESERVED: the membrane canonical-guard identity

- **Red-first:** the local chain deleted (guard never recognized) → **4 RED** (`mustPass[0..3]` — every
  fixture whose dump is legally guarded starts reporting). Restored → 0 failures. Wired → 0 failures
  across 8 `mustFlag` + 4 `mustPass`.
- **Identity preserved on both axes that matter, and one of them is now honest:**
  - `mustFlag[1]`'s `declare function handleSafeToDump` still counts as the guard, because the shared
    verdict RESOLVES a bodyless declaration (`body: undefined`) — identity and body are different
    questions. Had the reader refused bodyless declarations, this HARD security-adjacent policy would
    have stopped recognizing an ambient guard and the ordering arm would have gone quiet.
  - `mustFlag[5]`'s guard IMPORTED from `guards.ts` is still refused — but the shared reader FOLLOWS the
    import to the real `FunctionDeclaration`, so what refuses it now is the HOME test
    (`sourceFile.compilerNode !== membrane.compilerNode`). The old chain refused it only because the
    local declaration was an `ImportSpecifier`: an accident of reader weakness that would have evaporated
    the moment the reader improved. The row's `why` records both readings.
- The receiver-type `dump` identity, the non-canonical-helper arm, the inverted-guard arm, the
  `realm.ts` scope control and the zero-dump-site population receipt are untouched.

## 3. The witness — `policy-binding-resolution` before/after

Two SEQUENTIAL `pnpm check:structure --check policy-binding-resolution` runs in this worktree, on the
orchestrator's explicit slot GO. BEFORE = the same tree with ONLY the three gate FILES swapped back to
their `db6e5bbd6` content (three `cp` calls; `git status --short` showed exactly those three modified);
then swapped forward (three `cp` calls; `git status --short` EMPTY) and AFTER run. The witness MODULE was
never edited — its recognizer is not weakened, and the clean status is the receipt.

| | raw | effective | alarms | tool errors | withheld | exit |
| - | -: | -: | -: | -: | -: | -: |
| BEFORE | 22 | 22 | 0 | 0 | 0 | 1 |
| AFTER | 19 | 19 | 0 | 0 | 0 | 1 |

**The behavioural comparison, by `file:line:token` — three rows left the set and nothing else moved:**

```
- tooling/src/verify/gates/audit-client-tests.ts:221:6    getDeclarations
- tooling/src/verify/gates/class-token-splice.ts:149:96   getDeclarations
- tooling/src/verify/gates/plugin-dump-guard.ts:89:73     getDeclarations
```

The surviving 19 are byte-identical in file, line, COLUMN and member across the two runs:
`context-definition-shape:129:25`, `ct-no-oneshot-live-read-assert:203:39`,
`evaluate-no-scope-capture:227:26 · 228:24 · 249:19 · 249:50 · 286:34`,
`message-kind-policy-coverage:77:35 · 77:66 · 95:36`, `no-context-returntype:41:29`,
`no-manual-token-estimate:57:34 · 57:64`, `no-raw-zustand-persist:343:40 · 343:70`,
`registry-context-via-mint:76:26 · 77:19`, `section-factory-contribution-bundle:94:30`,
`warning-code-coverage:98:41` — i.e. the dispatch design's Groups B, C and D are exactly as red as they
were, and no row moved by a line (which a stray reformat would have shown).

**A falling accused path proves the local call disappeared; it does NOT prove the replacement preserved
behaviour** (guide §4.1). The behavioural floor is §2's per-gate proof rows plus the real-tree run below.

**Real-tree receipt, same window** —
`pnpm check:structure --check audit-client-tests --check class-token-splice --check plugin-dump-guard`,
exit 0:

```
✓ audit-client-tests  · final ordinary/error · population 2153 source
✓ class-token-splice  · final ordinary/error · population 1686 source
✓ plugin-dump-guard   · final hard/error    · population    9 source · membrane guest-dump sites: 1 member(s)
final policies: 3 ran · raw 0 = waived 0 + granted 0 + effective 0 · 0 alarm(s) · 0 tool error(s) · 0 withheld
```

`plugin-dump-guard`'s population receipt still reports **1 member**: the live membrane dump is still SEEN
(the blindness tripwire is not silently satisfied by a reader that stopped recognizing the call) and still
judged GUARDED. That is the liveness half a clean zero cannot give.

## 4. Deviations, with receipts

1. **A `scope` field was cut from the contract** (§1). Reason stated there; no caller consumes it and the
   claim it would make is false for an ambient global.
2. **`audit-client-tests` gained a `mustFlag` row (8 → 9).** §4.1 requires a row that dies without the
   narrowing, and the pre-existing rows could not be that row (measured, §2.1). The row is invented and
   carries its planted-break receipt.
3. **`class-token-splice` has two behaviour deltas** (overload set, reassigned callee), §2.2. Both are
   strictly stricter; neither is covered by an existing row, and neither is invented as a row here because
   inventing fixtures for a shape the corpus does not contain would be padding — the reader's own pins
   (`overload set`, `reassigned binding`) hold the semantics at their one home.

   **CORRECTED — LANDED 2026-09-13 (`5c73621ea`), REPAIRED the same day.** Both halves of that sentence
   were wrong. The overload delta is PERMISSIVE, not stricter (§2.2's correction), and "the corpus does
   not contain the shape" was never the test — a permissive change in an `ordinary/error` policy whose
   catch is invisible rendered geometry owes a §4.1 row whatever the corpus holds, and the reader's own
   pins prove the READER's semantics, not this policy's verdict. Both deltas now carry a row in this
   module (`mustPass[12]`, `mustFlag[5]`), each proven to discriminate its own delta through
   `verifyPolicyProofs`. Found by `cb-v-callable-reader`; the row is the reviewer's own counterexample.
4. **`TS-MORPH-CAPABILITIES.md` limit 2 was edited.** It PRESCRIBED the deleted fallback in so many words
   ("the fallback is the shared `lexicalReferenceSymbol(identifier).getDeclarations()`"), which is now a
   `policy-binding-resolution` finding inside a gate module. Leaving it would have taught the next lane to
   re-introduce exactly what this lane removed. `pnpm check:docs <that file>` exit 0.
5. **The edit hook was blocking-erroring on `pnpm install` (lefthook race on main's shared
   `.git/hooks`) at the start of the lane.** Reported to the orchestrator, default approved; edits were
   verified with `git diff` until it cleared itself. No `pnpm install` was run by this lane.

## LEDGER ROWS (0 rows)

No new instrument defect was MEASURED by this lane. The one candidate — "cutting
`audit-client-tests`'s same-file fence reads clean" — is an unenforced FIXTURE that this lane FIXED in the
same commit (`mustFlag[8]`), not a standing instrument lie, and the guide already names the class.

ledger rows OWED: 0

**Existing-row update owed at integration (2026-09-13, added with the delta repair):**
`cb-v-callable-reader`'s LEDGER ROW 2 — *"`class-token-splice` … the OVERLOAD delta is PERMISSIVE …
neither delta carries a proof row"* — is **FIXED by this branch**, not merely acknowledged: the direction
claim is corrected in the module header and in §2.2/deviation 3 above, and both deltas now carry a
discriminating row. Its sibling ROW 1 (the shared reader's module-axis raw accept / write-refusal gap,
`reference-fact-call.ts:196-206`) stays **OPEN** and is explicitly OUTSIDE this lane's fence — it is
codex-owned under #2163, and none of the three current adopters reads `body` across a file, so it is
latent rather than live.

## Proposed lessons (report text — the orchestrator owns any memory write)

- **`resolveCallableDeclaration` is the one home for "which callable declaration/body"** —
  `tooling/src/verify/lib/reference-fact-call.ts`. Module axis first, lexical second; a bodyless
  declaration RESOLVES (identity ≠ body); an overload set has one home; reassigned/mutable → `write`;
  cycles terminate; an import door keeps the DOOR's refusal. Never hand-roll the lexical fallback —
  `TS-MORPH-CAPABILITIES.md` limit 2 told lanes to for months and it is now gate-RED.
- **A "declared limit" that is really a READER WEAKNESS becomes falsifiable the moment the reader
  improves — and its old pin usually does not survive the promotion.** `audit-client-tests`' same-file
  limit had a `mustFlag` row that looked like a narrowing pin and was actually a record of what the reader
  could not do; when the shared reader could do it, cutting the new fence still read clean because the
  FIXTURE could not reach it. Before trusting a limit's pin after a reader upgrade, cut the fence and
  check the row actually dies.
- **A cross-file containment reader is offset-collidable, and the collision is constructible.** Range
  containment (`getStart()/getEnd()`) is numeric and per-file; a body resolved in another file can
  numerically contain a node in the querying file. Any policy that follows a resolved declaration into
  another file and reconciles by RANGE owes either a source-file fence or a per-file index — and its
  falsifier fixture must be built from MEASURED offsets, not from plausible-looking source.
