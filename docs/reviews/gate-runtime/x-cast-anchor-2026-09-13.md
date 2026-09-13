---
kind: evidence
status: active
updated: 2026-09-13
---

# #2325 — parenthesized branded-cast coordinate

## Repair

`no-loose-id-cast` already reported an ordinary `value as unknown as UserId` at the established
`value as unknown` coordinate. The legal parenthesized spelling
`("" as const) as unknown as UserId` instead handed the report door the paren-leading
`("" as const) as unknown` token. The central marker grammar cannot name parentheses, so the visit phase
threw and withheld the policy.

`castAnchor` now descends through an inner cast only when that cast's operand is a
`ParenthesizedExpression`, then removes that parenthesis chain. It reports this example on the authored
`"" as const` carrier. It does not generally unwrap `AsExpression`, so the established unparenthesized
double-cast coordinate remains `value as unknown`; it also leaves a zero-argument arrow beginning with
`(` unnameable and loudly refused.

The policy proof corpus now pins the parenthesized const-asserted violation and its exact ordinary-waiver
identity, the unparenthesized control already present, `satisfies` around double and single branded casts,
the existing single-cast and non-brand boundaries, and the genuinely unnameable arrow refusal. These are
production-dispatched by the complete `id-brand-flow.test.ts` family test.

## Evidence

Red first on the unmodified implementation:

```text
pnpm test:scoped tests/tooling/verify/gates/id-brand-flow.test.ts
1 failed; mustFlag[3] returned PASS TOOL ERROR [visit]
token "(\"\" as const) as unknown" cannot be named by an @orb-waive marker
```

After the bounded anchor repair:

- `pnpm test:scoped tests/tooling/verify/gates/id-brand-flow.test.ts`: 1/1 passed; artifact
  `reports/runs/test/codex-planter-residue-786358-2026-09-13T08-12-17-625Z/test-report.json`.
- Scoped Biome: passed on the gate and family test.
- Scoped ESLint: passed on the gate and family test.
- `pnpm typecheck --config tooling/tsconfig.json`: one runnable program, passed.
- `git diff --check`: passed before the report was added; repeated before commit.

No whole-tree structure, full verification, catalog, ledger, browser, or runtime suite was run. Runtime
behavior is unchanged; this repair is confined to one policy's finding coordinate and proof corpus.

## Corrective review leg

Independent review confirmed the original reproduction and its controls, then found that legal
`(value as unknown) as UserId` and `((value) as unknown) as UserId` spellings passed silently. The first
repair changed only coordinate selection; the arm still asked whether the raw outer operand was an
`AsExpression`, so parentheses around the complete inner cast prevented detection before a coordinate was
needed.

The correction separates the two questions. `unwrapParentheses` supplies the semantic inner expression used
to recognize `as unknown`. `castAnchor` independently chooses the authored node and token: the first spelling
reports `value as unknown`, while the nested-value spelling reports `value`. Exact `mustFlag` and ordinary
waiver rows pin both coordinates. All const, `satisfies`, single-cast, non-brand, population, and unnameable
refusal rows remain in the same proof corpus.

Red first on the prior implementation: the focused family returned four proof failures — both new
`mustFlag` rows had zero findings and both exact waiver rows alarmed stale. After the semantic/coordinate
split, the family passes 1/1; artifact
`reports/runs/test/codex-planter-residue-804501-2026-09-13T08-18-10-021Z/test-report.json`.

## Integrated verification

Both repair legs are integrated on main as `f6661bf44` and `1769f8ac9`. The complete id-brand-flow family passed on main; artifact `reports/runs/test/main-827740-2026-09-13T08-22-36-455Z/test-report.json`. The native tooling program also passed. The independent review below preserves the rejected first repair and the accepted correction, rather than treating the initial green family as sufficient.

# Independent review — #2325 / `094e8c1be`

## Verdict: REFUTED

The filed const-asserted reproduction is fixed and the committed family floor passes, but the repair is not
complete for the issue's stated contract that transparent operand wrappers must not prevent judging a
nameable branded double cast. A neighboring legal parenthesis placement silently bypasses the policy.

## Confirmed working behavior

I read the complete changed gate and report, the complete `id-brand-flow.test.ts`, and the coordinate/brand
helpers used by the finding path.

`pnpm test:scoped tests/tooling/verify/gates/id-brand-flow.test.ts` passed 1/1 in 1.26 s; artifact:
`reports/runs/test/codex-planter-residue-793067-2026-09-13T08-14-20-687Z/test-report.json`.

The committed rows establish:

- `("" as const) as unknown as UserId` reports once at token `"" as const`;
- that exact coordinate binds an ordinary waiver;
- unparenthesized `value as unknown as UserId` keeps token `value as unknown`;
- a double cast wrapped by `satisfies` still reports at the established token;
- a single branded cast under `satisfies` passes;
- a non-brand double cast passes;
- a genuinely unnameable zero-argument arrow still refuses loudly.

Independent `/tmp/codex-2325-controls.ts` controls also confirmed nested parentheses around the const assertion
remain nameable and the single-cast `satisfies` boundary remains accepted.

## Blocking defect

This legal equivalent silently passes:

```ts
export const x = (value as unknown) as UserId;
```

The same is true with another transparent parenthesis:

```ts
export const x = ((value) as unknown) as UserId;
```

Both were added as `mustFlag` rows to a scratch clone of the real `defineGate` policy and driven through
`verifyPolicyProofs`. Each returned:

`expected at least one effective finding but got 0`

This is a false clean, not a coordinate refusal. The control `value as unknown as UserId` remains green, so
the brand reader and basic double-cast arm are live.

Cause: `create.visitors` computes the semantic `inner` predicate directly from
`node.getExpression()` (`no-loose-id-cast.ts:88-91`). When parentheses wrap the inner `as unknown`, that
expression is a `ParenthesizedExpression`, so `Node.isAsExpression(expression)` is false and the policy never
reaches reporting. The new `castAnchor` branch (`:58-67`) only changes coordinate selection after this same
raw expression has been captured; it does not provide a normalized semantic operand to the arm predicate.

The implementation therefore fixes the exact `("" as const) as unknown as UserId` shape because its outer
expression is an unparenthesized `AsExpression` whose own operand happens to be parenthesized. It does not fix
the equally transparent `(value as unknown) as UserId` shape where the parenthesis encloses the inner cast.
The issue's expected contract explicitly covers transparent operand wrappers, so this is within #2325 rather
than speculative expansion.

## Required bounded correction

Separate semantic unwrapping from coordinate selection:

- normalize transparent parentheses before asking whether the outer operand is an `as unknown` expression;
- retain the authored-node coordinate rules so plain `value as unknown` keeps its existing token;
- add the two parenthesized-inner controls above, including exact coordinate/waiver discrimination;
- retain all committed const, `satisfies`, single-cast, non-brand and refusal rows.

No population, severity, brand-identity, marker grammar, or general cast policy change is needed.

## Limits

I ran the focused family once and four scratch conformance controls. I did not run broad structure, native
typecheck, lint, catalog, or lifecycle operations. No tracked file was edited; `git diff --check` for the
reviewed commit passed. The worktree was already clean and remained clean.

## Corrective re-review — `46b8639d2`

### Verdict: ACCEPT

The corrective commit closes the confirmed false clean. Detection now unwraps only transparent
`ParenthesizedExpression` nodes before recognizing the inner `as unknown`, independently of `castAnchor`'s
coordinate choice. Consequently `(value as unknown) as UserId` reports at the established full-inner-cast
token `value as unknown`, while `((value) as unknown) as UserId` reports at `value`; both exact ordinary
waivers are pinned in the production-dispatched policy corpus. The const-asserted carrier, `satisfies`,
single-cast, non-brand, population and unnameable-arrow rows remain present.

The original scratch control's first coordinate expectation (`value`) was deliberately stricter than the
policy's pre-existing unparenthesized identity and therefore produced a token mismatch after the semantic
fix; it did find the violation. Correcting that control to the established `value as unknown` coordinate
made all four independent controls pass. The nested-value control retained its exact `value` expectation.

Verification on the corrective tip:

- `pnpm exec tsx /tmp/codex-2325-controls.ts`: four controls, no failures.
- `pnpm test:scoped tests/tooling/verify/gates/id-brand-flow.test.ts`: 1/1 passed; artifact
  `reports/runs/test/codex-planter-residue-821467-2026-09-13T08-20-52-778Z/test-report.json`.

This verdict covers the corrected aggregate through `46b8639d2`. I did not run broader structure,
typecheck, lint, catalog or lifecycle operations.
