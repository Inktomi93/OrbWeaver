---
kind: review
status: active
updated: 2026-09-13
---

# Verifier — binding-reader GROUP A, the shared callable verdict (#2097, #2163)

Lane `cb-v-callable-reader`, isolated worktree `agent-ab2f43f12d627cf3b`, branch `cbvcr-stack` =
today's `main` tip `b1a23e534` + the stack's four CODE commits cherry-picked (clean, no conflicts).
Subject stack: `46965004a` in worktree `agent-aa97f380b938783da`; `main..46965004a` = 5 commits,
`main` is 10 ahead of the stack's base, and the eleven-file `git diff --stat main...46965004a` is
exactly the file set the brief names. **`tooling/src/verify/gates/policy-binding-resolution.ts` is NOT
in that set — the witness is untouched.**

Every number below was produced in this session in this worktree. The tree was left byte-clean
(`git status --short` empty after each probe restore; the two `cbvcr-` scratch test files were removed).

## VERDICTS

| # | Claim | Verdict |
| - | - | - |
| 1 | the reader's contract, module-first/lexical-second, every case pinned against SOURCE | **PARTIAL** — three contract sentences are false on measured behaviour |
| 2 | no raw declarations API in the reader or the three gates | **PARTIAL** — zero in the three gates; the READER calls `Symbol#getDeclarations()` twice (sanctioned) |
| 3 | `audit-client-tests` keeps LOCAL-ONLY at one fence; `mustFlag[8]` reds when it is cut | **CONFIRMED** (reproduced) |
| 4 | `class-token-splice`'s two deltas are strictly stricter, stated, pinned | **REFUTED** — the overload delta is PERMISSIVE (1 → 0 findings), and neither delta is pinned |
| 5 | `plugin-dump-guard` refuses the imported guard by HOME; the membrane dump is still SEEN | **CONFIRMED** (reproduced) |
| 6 | the witness: 22 → 19, exactly three rows, the other 19 identical, witness untouched | **CONFIRMED** (two sequential runs) |
| 7 | declared proof rows through `verifyPolicyProofs`; bounded real-tree run clean with receipts | **CONFIRMED** |
| 8 | `TS-MORPH-CAPABILITIES.md` limit 2 no longer prescribes the fallback; nothing else teaches it | **CONFIRMED** (ledger rows owe a state flip, below) |
| 9 | the cross-file offset-collision hazard is fenced in every adopter that reconciles by range | **CONFIRMED** for all three adopters |
| 10 | adoption inventory of the 19 survivors | delivered below |

**Per-module verdict.** Reader `lib/reference-fact-call.ts`: **PARTIAL — SOUND FOR TODAY'S THREE
CONSUMERS, CONTRACT OVERSTATED** (two latent lies, neither reached by a current adopter).
`audit-client-tests`: **CONFIRMED.** `plugin-dump-guard`: **CONFIRMED.** `class-token-splice`:
**PARTIAL — correct on the real tree, but one declared delta is described backwards and unpinned.**

## 1. The reader (PARTIAL)

Pins re-run: `pnpm test:scoped tests/tooling/verify/lib/reference-fact-callable.test.ts` → 14/14
(inside a 5-file run, 47/47, exit 0). Every pinned cell reproduces.

I then drove `resolveCallableDeclaration` over 26 additional in-memory fixtures (scratch test, removed).
Eighteen agreed with the contract. **Three did not**, and all three have ONE root cause: in
`callableOfExpression`, the MODULE-axis branch does `accept(state, canonical.declaration)` **raw** — it
neither unwraps a `VariableDeclaration` to its initializer nor applies the mutability/reassignment
checks the LEXICAL branch applies in `unstableBinding`.

| fixture | verdict produced | what the contract says |
| - | - | - |
| `api.ts: export const helper = (x) => …` · `use.ts: import { helper } …; helper(1)` | `RESOLVED VariableDeclaration in api.ts body=NONE` | `declaration` is "the arrow/function expression an immutable binding holds. **Never the binding itself, so two spellings of one callable compare equal**"; `body` absent "IS A FACT" meaning `declare function` / an overload signature / an ambient global |
| the same helper declared and called in ONE file | `RESOLVED ArrowFunction in use.ts body=yes` | (the pinned row) |
| `api.ts: export function f(){…}` **and** `f = other;` · `use.ts: import { f } …; f()` | `RESOLVED FunctionDeclaration in api.ts body=yes` | "a binding reassigned anywhere → `write`"; the pin's own comment: "NEVER A GUESS … the pre-migration chains all took the FunctionDeclaration here and were silently wrong at every call after the assignment" |
| `api.ts: export let f = () => …` · imported and called | `RESOLVED VariableDeclaration in api.ts body=NONE` | "a mutable (`let`/`var`) binding → `write`" (true only same-file: `export let helper` called locally correctly refuses `write :: binding helper is mutable`) |

So the reader answers ONE question TWO ways depending on which axis wins — the exact drift the
migration exists to end — and `body: undefined` is **not** discriminable by a caller between "there is
no authored body" (the documented fact) and "I resolved to the binding and never looked" (an imported
const-held arrow). That is candidate-UNREADABLE wearing ABSENT's clothes, in the one field the contract
says is safe to read as a fact.

**Is it live?** No, and I checked each adopter rather than assuming: `audit-client-tests` fences to the
call's own file (and a same-file exported const arrow resolves to the ARROW, measured, so its helper hop
is unaffected); `class-token-splice` only reads a `FunctionDeclaration`, so a `VariableDeclaration`
lands on its unresolved arm exactly as `resolveCallableOrigin` used to; `plugin-dump-guard` requires a
`FunctionDeclaration` named `handleSafeToDump` in the membrane file. It is a **latent lie in a shared
primitive** — the next Group B/C/D adopter that asks `body` about an imported helper gets a silent
`undefined`. Ledger row 1.

**The one candidate-unreadable-as-absent branch inside the reader's own vocabulary**:
`declare const f: () => string; f()` → `missing :: const binding f has no initializer`. The declaration
exists and is unreadable; `missing` is the reader's absence reason (`nowhere()` gets the same reason).
The detail is honest, no consumer is harmed today, and I am recording it as an observation rather than a
row. Related asymmetry, also observation-only: a parameter → `missing`, a destructured binding →
`dynamic`, though both are "the callable arrives at runtime".

Other measured behaviours, all correct and none pinned (worth knowing before Group B adopts):
`export *` re-export → resolves to the leaf; namespace-import member call (`api.f()`) → resolves;
optional call `f?.()` → resolves; call-of-a-call `make()()` → resolves to the inner arrow;
class static method → `unsupported`; instance method → `dynamic`; object-literal method → `dynamic`;
importing a name the module does not export → `missing :: /repo/api.ts exports no member named f`;
unresolved package door → `unsupported`, as the contract states; `g.call(null)` through a const alias →
`unsupported` (the wrapper prefilter sees through the alias).

## 2. No raw declarations API (PARTIAL — wording, not substance)

- Three gates: **zero**. `ast-grep --lang ts -p '$X.getDeclarations()'` and `'$X?.getDeclarations()'`
  over the four subject files matched **2 sites, both in `lib/reference-fact-call.ts`** (`:126`, `:173`)
  and none in the three gates — that is the positive control and the negative in one invocation.
  Literal `rg`/`grep` over the three gates finds the name only inside comments narrating the removal
  (`class-token-splice.ts:29,152`, `plugin-dump-guard.ts:22`). Second method: the live witness reports
  no row for any of the three (§6).
- The reader: `reference-fact-call.ts:126 symbol.getDeclarations()` and
  `:173 lexicalReferenceSymbol(identifier)?.getDeclarations()`. **This is sanctioned, not a defect** —
  §12.3 bans the shape "inside a gate module", the witness's population is
  `under: ["tooling/src/verify/gates/**"]`, and its own `mustPass` row says in so many words: *"The
  reader itself walks symbols — under `lib/`, outside this population, once for everyone."* The claim
  as WORDED ("no raw declarations API survives in the reader") is false; the ruling it stands for holds.

## 3. `audit-client-tests` — the fence (CONFIRMED, reproduced)

Probe on a copy in my own worktree (`cp` backup, one command per call, `mv` restore; no
`stash`/`checkout`/`restore`): `resolveCalleeBody`'s
`callable.value.sourceFile === call.getSourceFile()` deleted, everything else untouched.

- `pnpm test:scoped tests/tooling/verify/gates/callback-provenance-family.test.ts` → **exit 1**,
  `Tests 1 failed | 11 passed`, and the single failure is
  `{ policyId: 'audit-client-tests', arm: 'mustFlag', exampleIndex: 8, detail: 'expected at least one
  effective finding but got 0' }`.
- `mustFlag[7]` stayed GREEN under the same cut, and so did the family's own prose pin
  ("an IMPORTED assertion helper is not followed"). The lane's §4.1 reasoning is therefore correct as
  measured, not merely as argued: the pre-existing row is an unenforced FIXTURE and `mustFlag[8]` is the
  falsifier.
- Restored → tree byte-clean, and the 5-suite run above is the green side.

## 4. `class-token-splice` — the two deltas (REFUTED in part)

The header states both deltas (`class-token-splice.ts:27-38` and the `calleeDeclaration` doc at
`:149-156`). The DIRECTION claim is wrong. Commit `5c73621ea` and report §2.2 say *"Both … make the
policy stricter, never more permissive."*

**Counterexample, produced twice on the same fixture** (scratch `runPolicyPass` driver, removed):

```
packages/client/src/probe.tsx
function widthClass(c: boolean): string;
function widthClass(c: number): string;
function widthClass(c: unknown): string {
  return c ? " w-avatar-hero" : "";
}
const x = <div className={`shrink-0${widthClass(true)}`} />;
```

| gate module | findings |
| - | -: |
| pre-stack `class-token-splice.ts` (from `main`, installed by `cp`, restored by `mv`) | **1** |
| the stack's `class-token-splice.ts` | **0** |

A single-declaration version of the same factory reports 0 in both. The mechanism is not in dispute:
`Segment = undefined` is the UNSAFE verdict (`startsSafe(undefined)` is `false`, so the junction reads
as spliced and is REPORTED), so **resolving MORE makes this policy report LESS**. The overload delta is
a permissive change; only the reassigned-callee delta is stricter.

The lost finding in my fixture was a FALSE positive (the returns genuinely carry a leading space), so
the new verdict is more ACCURATE — but "more accurate" and "strictly stricter" are different claims, and
the report uses the latter as its stated reason for NOT giving either delta a proof row
(deviation 3: *"Both are strictly stricter … neither is invented as a row here"*). A permissive delta in
an `ordinary/error` policy whose whole point is a rendered-geometry catch is exactly the shape that owes
a row. The fixture above is a ready-made one (`mustPass`, with the returns' leading space as its why);
its stricter twin — a reassigned callee — is a ready-made `mustFlag`. Ledger row 2.

Everything else in §2.2 verifies: the return index is keyed by ts-morph NODE identity
(`state.returns: Map<Node, Node[]>`, `:252/:273`), the shared verdict returns that same node, only a
`FunctionDeclaration` yields a value set (`:269`), and the `entire-population` reason is untouched.

## 5. `plugin-dump-guard` — refusal by HOME (CONFIRMED, reproduced)

- Falsifier: I cut `callable.value.sourceFile.compilerNode === membrane.compilerNode` from
  `negatedGuardCall` (copy/restore as above) and ran
  `pnpm test:scoped tests/tooling/verify/gates/ordinary-visitors-family.test.ts` → **exit 1**, one
  failure, `policyId: plugin-dump-guard`, `arm: mustFlag`, `exampleIndex: 5`. So the HOME test — not the
  `FunctionDeclaration` kind test — is what refuses the imported guard, which is the claim.
  Corroborating reader receipt: an imported `export function f` resolves to the real
  `FunctionDeclaration` in the declaring file (kind and name preserved, only the file differs).
- Bodyless identity: the reader resolves `declare function f` with `body: undefined` (pinned, re-run),
  which is what keeps `mustFlag[1]` alive.
- Real tree: `✓ plugin-dump-guard · final hard/error · population 9 source · 0 resource · **membrane guest-dump sites: 1 member(s)**`. The dump is still SEEN and still judged guarded.

## 6. The witness (CONFIRMED)

Two SEQUENTIAL `pnpm check:structure --check policy-binding-resolution` runs in this worktree, one at a
time, ~13 s each.

| | raw | effective | alarms | tool errors | withheld | exit |
| - | -: | -: | -: | -: | -: | -: |
| `main` tip `b1a23e534` | 22 | 22 | 0 | 0 | 0 | 1 |
| + the four code commits | 19 | 19 | 0 | 0 | 0 | 1 |

`diff` of the two sorted `file:line:column  member` row sets — three deletions, nothing else:

```
< tooling/src/verify/gates/audit-client-tests.ts:221:6   getDeclarations
< tooling/src/verify/gates/class-token-splice.ts:149:96  getDeclarations
< tooling/src/verify/gates/plugin-dump-guard.ts:89:73    getDeclarations
```

The surviving 19 are byte-identical in file, line, COLUMN and member. `policy-binding-resolution.ts`
does not appear in `git diff --stat main...46965004a`, so the witness's recognizer was not weakened;
population was 309 source files on both runs. Note the lane's 22 was taken against `db6e5bbd6` and mine
against `b1a23e534` — ten commits later, the number and every row are unchanged.

## 7. Proof rows and the bounded real-tree run (CONFIRMED)

- `pnpm test:scoped` over `reference-fact-callable.test.ts`, `callback-provenance-family.test.ts`,
  `class-string-literal-wave.test.ts`, `ordinary-visitors-family.test.ts`, `port-parity-tier3.test.ts`
  → **exit 0, 5 files, 47/47**. Those four gate suites are the `verifyPolicyProofs` entry for the three
  subjects (`callback-provenance-family` imports `audit-client-tests`, `class-string-literal-wave`
  imports `class-token-splice`, `ordinary-visitors-family` imports `plugin-dump-guard`), plus the frozen
  legacy differential replay for `plugin-dump-guard`.
- `pnpm check:structure --check audit-client-tests --check class-token-splice --check plugin-dump-guard`
  → **exit 0**: `audit-client-tests` population 2153 source · `class-token-splice` 1686 source ·
  `plugin-dump-guard` 9 source with `membrane guest-dump sites: 1 member(s)`;
  `raw 0 … 0 alarm(s) · 0 tool error(s) · 0 withheld`.
- `pnpm exec biome check <the 9 code/test files> --diagnostic-level=error` → 9 files, clean.
- `pnpm typecheck --config tooling/tsconfig.json` → exit 0, `PASS`.

## 8. `TS-MORPH-CAPABILITIES.md` limit 2 (CONFIRMED)

Limit 2 no longer prescribes the hand-written fallback; it points at `resolveCallableDeclaration`, states
the verdict table, and names the old spelling as *"now a `policy-binding-resolution` finding inside a
gate module"*. Sweep for anything still TEACHING it: `rg --hidden --no-ignore` for
`lexicalReferenceSymbol` → 16 files (8 docs, 8 source); for `getDeclarations` in markdown → 14 files.
Reading every one of the doc hits: **zero remaining prescriptions.** What is left is
(a) ts-morph capability FACTS (`TS-MORPH-CAPABILITIES.md:32,65`, both correct and both about the shared
readers), (b) historical narration inside `class-token-splice.ts:29,152` and `plugin-dump-guard.ts:22`
("used to be"), (c) other `lib/` consumers of `lexicalReferenceSymbol` that are outside this ruling
(`lib/authored-key-set.ts:106`; `contract-banned-shapes.ts:175` and `windowed-infinite-query.ts:184`
mention it only in comments), and (d) **ledger rows that this stack makes stale** — see below.

## 9. The cross-file offset-collision hazard (CONFIRMED for all three)

- `audit-client-tests` **is** the exposed adopter — it reconciles a resolved body against a per-file
  index by numeric containment (`within`, `getStart()/getEnd()`) — and it is fenced at
  `resolveCalleeBody`, with the fence falsified by `mustFlag[8]` (§3, reproduced).
- `class-token-splice` reconciles by ts-morph NODE IDENTITY (`Map<Node, Node[]>`); its only offset
  arithmetic is `anchor.getStart() - node.getStart()`, both inside the same visited template. Not
  exposed.
- `plugin-dump-guard` compares statement ranges only among the statements of ONE membrane function body;
  the resolved declaration is used solely for an identity/home test. Not exposed.
- No fourth adopter exists: `resolveCallableDeclaration` is imported by exactly these three modules.

## 10. Adoption coverage — the exact next-chunk inventory (19 rows, 11 modules)

The lane's B/C/D labels have no on-tree definition I could find (`rg` over `docs/` for
`GROUP B`/`Group B`/`group B` returns nothing about binding readers), so I group by the QUESTION each
site asks — which is what a shared reader has to answer — and map each module to its live refutation-
ledger row (`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md:595-607`, states re-confirmed in
`adj-ledger-receipt-reconciliation-2026-09-13.md:25-37`).

**Group i — "where is this name DEFINED" (`getDefinitionNodes`), 2 rows, 2 modules** (ledger 597, 598):

| site | source |
| - | - |
| `context-definition-shape.ts:129:25` | `strict = nameNode.getDefinitionNodes().some((def) => REGISTRY_CONTRACTS_RE.test(def.getSourceFile().getFilePath()))` |
| `ct-no-oneshot-live-read-assert.ts:203:39` | `for (const definition of identifier.getDefinitionNodes())` |

Both are HOME questions over a resolved declaration — `resolveCallableDeclaration`'s `sourceFile`, or
`resolveModuleMemberOrigin`'s `canonical.sourceFile`, answers them directly.

**Group ii — the alias hop plus a declaration list (`(getAliasedSymbol() ?? symbol).getDeclarations()` /
`getValueDeclaration()`), 13 rows, 5 modules** (ledger 599, 600, 602, 603, 605):

| site | source |
| - | - |
| `evaluate-no-scope-capture.ts:227:26` · `228:24` | `const target = symbol?.getAliasedSymbol() ?? symbol;` / `const decl = target?.getValueDeclaration();` |
| `evaluate-no-scope-capture.ts:249:19` · `249:50` | `return (symbol?.getAliasedSymbol() ?? symbol)?.getValueDeclaration() !== undefined;` |
| `evaluate-no-scope-capture.ts:286:34` | `const decl = id.getSymbol()?.getValueDeclaration();` |
| `message-kind-policy-coverage.ts:77:35` · `77:66` | `const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];` |
| `no-manual-token-estimate.ts:57:34` · `57:64` | `.flatMap((symbol) => (symbol.getAliasedSymbol() ?? symbol).getDeclarations())` |
| `no-raw-zustand-persist.ts:343:40` · `343:70` | `const declarations = (symbol.getAliasedSymbol() ?? symbol).getDeclarations();` |
| `registry-context-via-mint.ts:76:26` · `77:19` | `const target = symbol?.getAliasedSymbol() ?? symbol;` / `return (target?.getDeclarations() ?? []).flatMap(…)` |

This is the largest and most uniform chunk; `resolveModuleMemberOrigin` already owns the alias hop.
`no-manual-token-estimate.ts:57` is the ledger's own cited `[0]`-reads-the-wrong-overload precedent, so
it is the one that most needs `overloadHome` semantics rather than a list.

**Group iii — "does this name bind anything" / "the FIRST declaration", 3 rows, 3 modules**
(ledger 601, 600 second site, 607):

| site | source |
| - | - |
| `no-context-returntype.ts:41:29` | `return (node.getSymbol()?.getDeclarations() ?? []).length > 0;` — a boundness test, not a resolution |
| `message-kind-policy-coverage.ts:95:36` | `const declaration = property.getDeclarations()[0];` |
| `warning-code-coverage.ts:98:41` | `const declaration = node.getSymbol()?.getDeclarations()[0];` |

**Group iv — set membership over a TYPE symbol, 1 row, 1 module** (ledger 606):

| site | source |
| - | - |
| `section-factory-contribution-bundle.ts:94:30` | `return (type?.getSymbol()?.getDeclarations() ?? []).some((d) => d.compilerNode === canonical.compilerNode);` |

Route this one deliberately: §12.3 records that a member resolved off a RECEIVER'S TYPE legitimately
asks every declaration (`type-member-origin.ts`), so the repair here is probably an existing
type-axis reader, not `resolveCallableDeclaration`.

## LEDGER ROWS (2 rows)

New confirmed defects, in `docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md`'s grammar
(`| subject | issue · path:line | defect | class | state | evidence |`):

\| `reference-fact-call` | #2163 · `tooling/src/verify/lib/reference-fact-call.ts:196-206` | the MODULE-axis branch of `callableOfExpression` accepts `canonical.declaration` RAW: an IMPORTED `const`/`let` binding holding an arrow or function expression resolves to the **VariableDeclaration** with `body: undefined` (same-file: the ArrowFunction with a body), and a binding REASSIGNED in its declaring file resolves silently. Both contradict the contract at `contract/reference-fact.ts:86-94` ("never the binding itself"; "body ABSENT IS A FACT" meaning ambient/overload only) and the reader's own header table ("reassigned anywhere → `write`"). Latent: none of the three current adopters reads `body` across a file. The repair is to run the module-axis result through the same unwrap + `unstableBinding` the lexical branch uses, and to pin an imported const-held arrow | shared-reader contract lie (candidate-UNREADABLE returned as the documented ABSENT fact) | OPEN | measured 2026-09-13, lane `cb-v-callable-reader`: `import { helper } from "./api.ts"; helper(1)` with `export const helper = (x: number): string => …` → `RESOLVED VariableDeclaration in api.ts body=NONE`; the same helper same-file → `RESOLVED ArrowFunction body=yes`; `export function f(){} ; f = other;` imported → `RESOLVED FunctionDeclaration`, no `write`; `export let f = arrow` imported → RESOLVED, no `write` (same-file → `write :: binding helper is mutable`) |
\| `class-token-splice` | #2163 · `tooling/src/verify/gates/class-token-splice.ts:27-38` | the header/commit/report state both migration deltas are *"strictly stricter, never more permissive"*. The OVERLOAD delta is PERMISSIVE: a module-local overload set that used to refuse (→ `Segment = undefined` → UNSAFE → reported) now resolves, so the policy reports LESS. Neither delta carries a proof row, and the report's stated reason for omitting them is the incorrect direction claim | unstated permissive behaviour change + missing narrowing row (§4.1) | OPEN | measured 2026-09-13, lane `cb-v-callable-reader`, one fixture (`packages/client/src/probe.tsx`, an overloaded `widthClass` returning `" w-avatar-hero"` used in `` `shrink-0${widthClass(true)}` ``) through `runPolicyPass`: pre-stack module (from `main`, `cp`-installed, `mv`-restored) **1 finding**; stack module **0 findings**; single-declaration twin 0/0 both sides |

**Existing-row updates owed at integration (not new defects), 3:** refutation-ledger rows **595**
`audit-client-tests` (`:221`), **596** `class-token-splice` (`:149`) and **604** `plugin-dump-guard`
(`:89`) are all `OPEN → p-binding-readers` with `policy-binding-resolution` live findings as evidence.
This stack removes all three sites — my §6 run is the receipt. `adj-ledger-receipt-reconciliation-2026-09-13.md:25,26,34`
carries the same three as "unchanged / remains at `:NNN`" and goes stale in the same merge. Rows
597-603, 605-607 stay OPEN and are inventoried in §10.

ledger rows OWED: 2 new + 3 existing-row state flips (595, 596, 604) + 3 mirror cells in
`adj-ledger-receipt-reconciliation-2026-09-13.md`.

## Owed combined checks for root

1. The whole-tree `pnpm check` / `pnpm verify --full` on the merged tree — I ran no whole-tree check
   (brief fence). The #1584 standing exception applies to the hook battery, not to this.
2. `pnpm check:policy-conformance` (the static stage that runs EVERY module's proof rows) — I ran only
   the four suites that carry the three subjects.
3. `pnpm typecheck` with no `--config` (I ran `tooling/tsconfig.json` only; the stack's own floor also
   names the root `tsconfig.json`).
4. The two ledger rows above, plus the three state flips, before the ledger's `ledgers:fresh` re-derive.

## What I did NOT cover

- No whole-tree run of any kind; no `pnpm check`, no `--push`, no CT, no e2e.
- I did not audit the other 11 modules' repairs — only inventoried their sites (§10).
- I did not re-verify `resolveCallableOrigin`'s own semantics (untouched by the stack except for the
  shared `invocationWrapper` helper it already used) or `resolveModuleMemberOrigin`'s internals beyond
  the behaviours the fixtures exercised.
- `overloadHome`'s export is a visibility change only (verified in the diff: signature + comment); I did
  not re-run the module-axis suites that own it.
- I did not measure performance. The reader now follows imports out of the requesting file for
  `audit-client-tests` (population 2153); its bounded run took 1052 ms, which I recorded but did not
  compare against a pre-stack baseline.
- No live/rendered surface is involved, so nothing was driven in a browser.
