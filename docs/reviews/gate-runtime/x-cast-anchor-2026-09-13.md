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
