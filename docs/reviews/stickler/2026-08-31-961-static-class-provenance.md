---
kind: review
status: active
updated: 2026-08-31
---

# #961 static class provenance cold review

## Verdict

**REFUTED** for exact commit `397e805f5226fbff6a8c91d36b9a1b5ac36788bb`.

The shared substrate has three confirmed correctness defects in changed code: it grants composer authority
to non-transparent wrappers, misses namespace access through local re-export modules without accounting,
and evaluates object-member class values without JavaScript overwrite semantics. The required real
`ContextToggle` chain and exact spread-property probe do work, and the focused battery is green, but those
successes do not refute the planted counterexamples.

Separately, this exact SHA is not structure-clean: an already-present `tokens-contract` descriptor cites a
document that does not exist in the commit. The shared checkout contains an untracked copy of that document,
so a green structure run from the dirty checkout is not evidence about exact HEAD. That blocker is not
attributed to the #961 diff, but it prevents an exact-tree integration-green claim for the reviewed SHA.

## Findings

### P1 — non-transparent functions are granted class-composer authority

`tooling/src/verify/lib/static-class-composer.ts:245` — `forwardedComposer` treats a function as a class
composer when any owned descendant composer call mentions all parameters; it never proves that the call's
result is returned, so arguments that never become rendered classes are emitted as class candidates.

Failure scenario: given

```ts
import { clsx } from "clsx";
function notAComposer(value: string) {
  clsx(value);
  return "fixed prose";
}
export const x = notAComposer("probe:not-class");
```

the call at the export is classified as a composer root and `probe:not-class` is returned as a static class
candidate. A downstream policy gate can therefore block harmless prose/data merely because its containing
function makes an unrelated `clsx` call. The defect is visible at `static-class-composer.ts:250-257`: the
implementation searches every descendant call and returns its composer kind after `forwardsAll`, with no
return-position/dataflow condition.

Session evidence:

```text
pnpm exec tsx -e '<in-memory ts-morph controls>'
nontransparentWrapper.values = ["probe:not-class"]
nontransparentWrapper.opaque = ["runtime parameter class value"]
nontransparentWrapper.unresolved = []
```

The committed test at `tests/tooling/verify/lib/static-class-expression.test.ts:31` proves genuine forwarding
wrappers, and its inert local-name control proves that spelling alone is not enough, but neither would fail if
the return-transparency condition were deleted or remained absent. #961's issue contract and receipt promise
"transparent forwarding functions"; `Core-Tooling-Law.md` §2.2 and §6 require enforcement instruments to
report what the code actually proves rather than manufacture policy inputs.

### P1 — namespace access through a local re-export module is silently missed

`tooling/src/verify/lib/static-class-composer.ts:60` — namespace property/bracket resolution converts the
namespace import directly to its module-specifier text and only consults the fixed external-package table;
it does not enter a relative module and resolve that module's exported declaration, so a supported composer
behind a local namespace barrel is neither discovered nor counted opaque/unresolved.

Failure scenario:

```ts
// composer.ts
export { clsx as join } from "clsx";

// x.ts
import * as composer from "./composer.ts";
export const x = composer.join("probe:namespace-reexport");
```

The `composer.join` call is a real supported `clsx` producer but the walker returns no candidate and no
diagnostic. A downstream prevention gate therefore silently misses a forbidden class transported through a
normal namespace barrel. `namespaceModule` at `static-class-composer.ts:195-203` returns `./composer.ts`,
while `composerInner` at lines 60-63 and `elementComposer` at lines 86-90 only call `moduleComposer`; the
named-import path correctly follows `importedSource` at lines 142-151, demonstrating the missing symmetric
arm.

Session evidence:

```text
pnpm exec tsx -e '<in-memory ts-morph controls>'
namespaceReexport.values = []
namespaceReexport.opaque = []
namespaceReexport.unresolved = []
```

The absence is non-vacuous: the same control project contains two parsed source files, and the committed
named-import re-export test passes. #961 explicitly requires local/cross-file imports, re-exports, namespace
forms, aliases, and loud opaque/unresolved accounting. The silent empty result violates that contract and
`Core-Tooling-Law.md` §6's false-clean prohibition.

### P1 — object-member class evaluation ignores later writes and silently skips runtime spreads

`tooling/src/verify/lib/static-class-object.ts:152` — `objectMemberValues` appends values from every matching
property and recursively resolved spread instead of applying JavaScript's later-write-wins rule; an
unresolvable spread contributes nothing and produces no diagnostic. Consequently it can report overwritten
values as exact and can preserve a stale earlier value across an unknown overwriting spread.

Two independently planted scenarios reproduce both consequences:

```ts
const newest = { className: "probe:new" };
const props = { className: "probe:old", ...newest };
export const x = <div className={props.className} />;
```

returns both `probe:new` and `probe:old`, although runtime returns only `probe:new`.

```ts
declare const runtime: Record<string, string>;
const props = { className: "probe:old", ...runtime };
export const x = <div className={props.className} />;
```

returns `probe:old` with empty opaque and unresolved arrays, although the runtime spread may overwrite that
property. A downstream gate can thus false-red on a dead value or false-clean based on a value it has not
proved survives. The responsible loop is `static-class-object.ts:158-168`; unlike the separate exact-property
API's `Map` at lines 225-244, it has no selected-slot overwrite state, and line 162 calls `resolveObjects`
directly without diagnosing a zero-object runtime spread.

Session evidence from dedicated `evaluateStaticClassExpression(props.className, classNameAttribute)` controls
(so independently rooted object declarations cannot contaminate the result):

```text
overwriteMemberOnly.values = ["probe:old", "probe:new"]
overwrite.opaque = []
overwrite.unresolved = []
dynamicOverwriteMemberOnly.values = ["probe:old"]
dynamicOverwrite.opaque = []
dynamicOverwrite.unresolved = []
```

\#961 requires object/spread resolution with overwrite order and explicit opaque/unresolved accounting. The
separate `evaluateStaticObjectProperties` overwrite test is real, but it exercises `findObjectProperties`,
not the `evalObjectMember` path used by ordinary `props.className`, so it cannot catch this defect.

### P1 integration blocker outside the #961 diff — exact HEAD contains a dangling gate-law citation

`tooling/src/verify/gates/tokens-contract.ts:46` — exact commit `397e805f5` sets
`docRow: "token-contract-program.md §4"`, but that commit contains no
`docs/architecture/proposed/token-contract-program.md` (nor another file of that basename). The active
`dangling-refs` gate's arm 1 resolves bare `*.md` citations against core/history/proposed/root and reports a
missing file, so an exact clean checkout cannot reproduce the green structure result obtained from the
shared dirty checkout.

Session evidence:

```text
git show 397e805f5:tooling/src/verify/gates/tokens-contract.ts | rg -n 'docRow|token-contract'
46:  docRow: "token-contract-program.md §4",

git ls-tree -r --name-only 397e805f5 docs/architecture | rg 'token-contract-program|token-contract'
# no matches
```

The shared tree had untracked `docs/architecture/proposed/token-contract-program.md`; its presence made
`dangling-refs` green in dirty-root run `660072-2026-08-31T16:55:46.030Z`. This is not a changed-file defect
from #961, and it should be routed to the token-contract integration owner, but the exact reviewed SHA must
not be described as structure-clean. The gate's own header records this exact class as a false-green risk.

## Verified clean

### Authority and scope

- Read `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`, the complete
  `Core-Laws-and-Precedents.md`, `Core-Tooling-Law.md`, `Spine-Testing.md`, and
  `Spine-TypeScript-and-Patterns.md`, plus the relevant structure/tooling sections of
  `Core-0-Architecture-and-Structure.md`.
- Read the complete CSS census
  `docs/reviews/stickler/2026-08-30-css-census-doctrine-and-enforcement.md` and the complete prior review
  `docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md`.
- Read #961's body, owner addendum, and receipt comment `5481318306`, and the full issue/comment histories
  for downstream #951, #954, #949, #955, and #956. #951's latest cold controls are especially relevant:
  its consumer needs a trustworthy shared evaluator rather than another rule-local interpreter.
- Verified `HEAD == main == 397e805f5226fbff6a8c91d36b9a1b5ac36788bb` at review start and that the reviewed commit exists on the
  current branch. The working tree was already dirty with unrelated tracked/untracked work; exact-SHA facts
  were therefore checked with `git show`, `git diff-tree`, `git grep`, and `git ls-tree`, not inferred from
  the dirty filesystem.
- Read all nine changed TS/TSX files in full. Parsed the complete changed manifest as JSON, verified its
  sorted/no-duplicate invariants, and confirmed the only manifest delta is
  `tests/tooling/verify/lib/static-class-expression.test.ts`. `git diff --check 397e805f5^ 397e805f5` was
  clean.

### Focused behavior and planted controls

- `pnpm exec vitest run tests/tooling/verify/lib/static-class-expression.test.ts` passed 1 file, 14/14 tests,
  with no type errors in 5.20s. Those tests genuinely cover named/default import aliases, named re-exports,
  direct package namespaces, optional/bracket calls, declared forwarding forms, arrays/objects/templates,
  tv/cva config selection, local/imported values, runtime prefixes, cycles/mutable bindings, exact property
  selection, and custom JSX binding.
- Independent controls beyond the committed suite established:
  - positive namespace-re-export control: **failed**, finding 2;
  - positive overwrite control: **failed**, finding 3;
  - negative non-transparent-wrapper control: **failed**, finding 1;
  - negative inert local `cn` function: clean, no candidate/diagnostic;
  - cycle control: no candidate plus `static class-expression cycle` unresolved;
  - opaque call control: no candidate plus `runtime call result` opaque.
- The real chain resolves correctly. On the exact source population,
  `marker="shell-context-toggle"` at
  `packages/client/src/features/app-shell/components/context-toggle.tsx:36` binds through imported
  `TopbarIconButton({ marker })` into the template at
  `packages/client/src/features/app-shell/components/shell-topbar.tsx:73`. The result is
  `shell-topbar-icon-btn shell-context-toggle`, with producer segments in both files and consumer
  `shell-topbar.tsx:73`.
- The real conditional JSX spread at
  `packages/client/src/features/app-shell/surfaces/app-shell.tsx:255` resolves exact property
  `data-has-bg-image` to value node `true`, with no opaque/unresolved result. Evaluating that value as a
  class produces no candidate, and the whole census contains no candidate equal to `true` or
  `data-has-bg-image`. This confirms exact property selection does not turn `data-*` values into class
  tokens.
- Source/test inspection and the inert-prose controls confirmed root discovery is structural (JSX/object
  `className` and declaration-proven composers), not comment/prose tokenization. The implementation source
  contains no `dark:`, `shell-*`, `data-*`, or other gate-policy vocabulary; the only Tailwind strings are
  package identities needed to prove composer provenance.

### Population, runtime, and memory

- Exact cold client/UI census through `walkStaticClassExpressions`, over the same explicitly filtered
  1,582-file population named in the receipt:

```text
population=1582
roots=2324
candidates=2342
runtimePrefixes=48
opaque=833
unresolved=0
elapsed=47.11s
max RSS=2,744,368 KB
exit=0
```

This confirms bounded completion and closely reproduces the receipt's 39.77s / 2,756,864 KB ceiling.
The receipt's `3223 declared / 2390 exact-runtime / 833 opaque` are consumer-policy counters rather than
the substrate's root/candidate counters; the dirty-root structure output reproduced those consumer counts
but is not exact-SHA integration evidence.

- An exploratory 6,295-project-file walk plus real probes also completed (2,556 roots, 2,541 candidates,
  48 prefixes, 853 opaque, zero unresolved) in 4:42.17 at 6,519,552 KB RSS. It was broader than the required
  client/UI census and ran under host contention, so its timing is recorded but not used as the bounded
  client/UI verdict.

### Static/tooling hygiene and API seam

- `pnpm exec biome check <nine changed TS/test paths>`: 9 files checked, no fixes and no findings.
- `pnpm exec tsc -p tooling/tsconfig.json --noEmit`: exit 0, no output.
- `pnpm knip --cache`: exit 0. This run occurred in the dirty checkout, where the in-progress #951 consumer
  already imports `walkStaticClassExpressions` and three public result types; it is evidence against current
  dead exports, not proof of exact-SHA integration by itself.
- Exact-SHA `git grep` shows all four public functions are exercised by the committed focused test. The
  public result types are the declared cross-gate contract rather than duplicate internal spellings; internal
  types and helpers have live imports. No second interpreter was added by #961. Exact SHA's #951 gate still
  uses its pre-substrate carrier logic and does not consume the new module, as intended for the separate
  downstream item.
- The API shape is useful for #951 without copying an evaluator: the consumer can enumerate DOM mutation
  terminals itself and pass each `classList` argument/spread, `className` RHS, or object-spread expression to
  `evaluateStaticClassExpression` / `evaluateStaticClassProperties`; whole-file JSX/composer roots use
  `walkStaticClassExpressions`. This judgment does not clear the three correctness defects above.
- Changed implementation line counts are 62, 244, 286, 152, 161, 250, 262, and 334; every implementation
  module is below the 450-line tooling cap. The test is 326 lines. An exact owned-path search found zero
  `biome-ignore`, ESLint disable, TS ignore/expect-error, `@orb-gate-ignore`, excessive-lines, or cognitive
  complexity bypasses. Composer type vocabulary derives from the single `COMPOSERS as const` tuple, and the
  focused Biome/tsc checks found no inline-union/type error.
- `pnpm check:structure` in the shared dirty root completed 236/236 active gates over 6,295 files, run
  `660072-2026-08-31T16:55:46.030Z`, exit 0. It confirmed the changed tooling-size, inline-union,
  suppression, test-layout, and manifest shapes on that filesystem. It is explicitly a **non-verdict for
  exact SHA** because the untracked token-contract program masked finding 4. A concurrent second structure
  run also made this run's wall/RSS unsuitable as performance evidence.

## Exclusions and remaining uncertainty

- Per the review charge, no redundant full `pnpm check` was run and no rendered UI probe was required: this
  commit changes tooling only. No source, test, issue, Project row, commit, branch, or remote was modified.
- An isolated clean-checkout structure battery was not rerun after the exact-tree mismatch was discovered;
  the orchestrator stopped further repo-wide runs. The missing exact-SHA file and `dangling-refs` resolution
  code directly establish the integration blocker without relying on the dirty run.
- HOCs, render factories, rest-prop dataflow, arbitrary call-return object graphs, external class-value
  imports, and runtime-computed bodies remain declared narrow limits. They were not promoted to findings
  absent a conflict with the issue's accepted residual contract.
- No unconfirmed low-priority suspicions remain.

## Issue summary

REFUTED exact #961 commit `397e805f5226fbff6a8c91d36b9a1b5ac36788bb`: 3 changed-code P1 findings (non-transparent wrappers gain composer authority, namespace local re-exports are silently missed, and object-member class evaluation violates overwrite/fail-loud semantics) plus 1 separate P1 exact-tree integration blocker outside the #961 diff (the committed `tokens-contract` docRow points at an absent document). Focused Vitest is 14/14, Biome/tsc are clean, the exact 1,582-file cold census completes in 47.11s at 2,744,368 KB RSS with 833 opaque and 0 unresolved, and the real ContextToggle/data-spread probes pass. Full evidence: `docs/reviews/stickler/2026-08-31-961-static-class-provenance.md`.
