---
kind: design
status: active
updated: 2026-08-31
---

# CSS family ownership — declaration-level provenance wall

This is the phase-1 design for #951's remaining internal-responsibility wall. The existing gate proves
the six declaration homes and their closed grammar, but its producer arm is still a second, weaker class
evaluator: it grants authority from local composer spellings, walks values with its own recursion, and
mixes source-terminal discovery with CSS policy in a 1,959-line module
(`tooling/src/verify/gates/css-family-ownership.ts:270-799`). The dirty lane already planted the right
counterexamples. The implementation below preserves those controls and replaces the duplicate evaluator
with the repaired #961 neutral substrate.

The source doctrine remains the six-home ruling in
`docs/reviews/stickler/2026-08-30-css-census-doctrine-and-enforcement.md:811-981`; this lane does not
change the census, home ownership, CSS source order, or product CSS. The cold #951 comment is the behavioral
specification for the seven dispatcher-level counterexamples. The repaired substrate's own boundary is
recorded in `docs/design/961-static-class-provenance-repair.md`: consumers choose a real terminal, while
the substrate resolves only the value that reaches it.

## 1. Chosen architecture — terminal carriers over one neutral evaluator

Ownership begins only at syntax that can put a hook on a rendered element:

- JSX `class` / `className`, including statically resolved `...props` fields;
- calls whose callee has declaration provenance to a canonical class composer, including a transparent
  function declaration, function expression, block arrow, or expression arrow that RETURNS the canonical
  composer's result;
- DOM-backed `classList.add/remove/replace/toggle` calls and DOM-backed `className` assignments, proven
  from `lib.dom.d.ts` declarations rather than receiver property spelling;
- JSX `data-slot` / `data-shell-*`, including statically resolved JSX spreads.

Each terminal is handed to `evaluateStaticClassExpression`, `evaluateStaticClassProperties`, or
`evaluateStaticObjectProperties`. Those APIs preserve producer anchors through aliases, re-exports,
arrays, object overwrite order, spreads, templates, joins, variants, and canonical forwarding wrappers
(`tooling/src/verify/lib/static-class-expression.ts`). The ownership gate only tokenizes the returned
class values and records their source package. It does not rediscover values or composer identity.

This closes the confirmed misses without making spellings authoritative:

- wrapper calls work because repaired #961 admits only returned canonical-composer values;
- spread arguments to DOMTokenList mutators work because the terminal evaluator unwraps spread/array
  carriers;
- inert `{ className: ... }` objects stay inert because object fields are evaluated only when a proven JSX
  spread terminal requests them;
- unrelated `{ classList: { add() {} } }` receivers stay inert because the call is not DOMTokenList-backed;
- attribute selector values are skipped as one lexical unit before class tokens are scanned;
- every `.shell-*` / `[data-shell-*]` selector hook must have a proven client terminal, so a legal prefix
  cannot launder an invented name.

## 2. Module boundaries

The current gate exceeds the lane's explicit 450-line ceiling, so the repair also separates its existing
responsibilities without changing policy:

- `tooling/src/verify/gates/css-family-ownership.ts` remains the auto-discovered descriptor and proof
  catalog only;
- `tooling/src/verify/lib/css-family-source-provenance.ts` owns terminal selection, DOM type proof, and
  translation of neutral evaluator results into UI/client hook owners;
- `tooling/src/verify/lib/css-family-selector-provenance.ts` owns selector tokenization, shell-root grammar,
  and the written-hook check;
- `tooling/src/verify/lib/css-family-census.ts` owns stylesheet parsing and declaration census;
- `tooling/src/verify/lib/css-family-policy.ts` owns the six-home policy reports and gate orchestration;
- shared CSS-family records/constants live in a small contract module when more than one of those modules
  needs them.

Helpers do not live in `tooling/src/verify/gates/`: that directory is executable descriptor discovery
(`tooling/src/verify/lib/loader.ts:82`), so placing ordinary modules there would create counterfeit gates.
Every resulting TypeScript module stays below 450 lines.

## 3. Rejected alternatives

- **Keep the local evaluator and patch seven branches.** Rejected: #961 exists specifically to prevent
  consumers from each inventing a subtly different class language. The gate's current local resolver and
  recursion (`tooling/src/verify/gates/css-family-ownership.ts:270-609`) already drifted on wrappers,
  spreads, and inert object fields.
- **Use `walkStaticClassExpressions` over every source file.** Rejected: its broad discovery API includes
  object `className` properties by design. #951 needs declaration-level ownership only at proven rendering
  terminals, so it must call the exact-terminal APIs.
- **Trust `className`, `classList`, `cn`, or `shell-*` spellings.** Rejected: every spelling has a confirmed
  inert counterfeit. Compiler declaration provenance and an actual client terminal are the boundary.
- **Require provenance only for the first shell root token.** Rejected: an invented shell descendant would
  still pass beneath a real `.shell-grid`; every structural hook is checked independently.
- **Add suppressions for opaque shapes.** Rejected: no blanket suppression is legal here. Unsupported
  runtime values remain explicitly outside the static guarantee and may be elevated only by a concrete,
  reviewed terminal shape.

## 4. Coupled-site inventory

The implementation touches these coupled sites and no product CSS:

1. prerequisite substrate commits `397e805f5` and repair `0952cc462`, including their focused evaluator
   test and test-baseline manifest row;
2. the gate descriptor/proof catalog;
3. the extracted census, selector, source-provenance, policy, and shared-contract modules;
4. this durable design, replacing the lane-root scratch dotfile;
5. the gate-conformance path that executes every `mustFlag` / `mustPass` fixture through the real
   dispatcher; and
6. tooling typecheck plus scoped lint/format/diff for the changed files.

The active-gate registry row already names `css-family-ownership`; loader discovery already finds the
descriptor. No registry, package export, product census expectation, or authored CSS change is required.

## 5. Red-first and verification plan

Before the behavior change, run the real conformance dispatcher against the dirty descriptor and retain
the failures for all four refutation families:

1. canonical block/function wrappers are false-red;
2. a spread DOMTokenList argument is missed;
3. inert `className` / counterfeit `classList` shapes are false-owned;
4. selector attribute text is false-tokenized and invented shell names are accepted.

Permanent controls retain both polarities: the counterfeit is a `mustFlag` case where false ownership
would hide a CSS violation, while the corresponding legitimate carrier is a `mustPass` case. After the
repair, run the focused substrate test, the focused gate proofs, the gate on the real tree, and tooling
typecheck. Then run only scoped lint, format, and diff checks. This lane explicitly does not run
`check:structure`, `verify --full`, or a repo-wide barrier.

The planted-control rule here also follows the prior tooling lesson in
`rollout_summaries/2026-08-22T00-31-31-CdVc-orbweaver_tooling_plan_and_frame_drop_proof_audit.md`:
a zero-result instrument is credible only after a planted defect proves the failure path can bite.

## 6. Forks and declared limits

There is no owner-sacred fork and no prose/persona/push decision. The strictness choice is already decided
by #951: every shell structural hook needs a client writer, not merely a namespace-shaped spelling.

The wall is static and declaration-level. It does not claim runtime proof for arbitrary higher-order
components, render-prop factories, reflective DOM calls, mutable class accumulators, or values behind
unresolved runtime spreads. Those shapes remain opaque rather than being guessed clean. The lane also does
not revisit the already-accepted six-home census or migrate product CSS.
