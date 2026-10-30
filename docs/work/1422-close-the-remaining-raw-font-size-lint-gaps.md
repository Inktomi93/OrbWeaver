---
kind: tooling
status: open
updated: 2026-10-30
priority: P3
area: ui
---

# Close the remaining raw font-size lint gaps

## What

Review of the type-ramp rule found gaps: an arbitrary value through '@apply' in CSS passes stylelint and ESLint; non-literal font writes (template 'ctx.font', 'style.cssText', 'setAttribute("style")', a 'font' shorthand in a ui style object) pass ESLint; an uppercase 'FONT-SIZE' passes stylelint; the root font-scale value is admitted on any selector, so a nested use would compound the scale; 'fontSize: "var(--text-…)"' in a ui style object is flagged though it names a token.

## Why

Each gap lets a size bypass the ramp or the font-scale setting without a finding.

## Done when

Each gap has a planted failing case and a passing control in the lint tests, the rules refuse it at zero findings, and legitimate token-resolved canvas fonts still pass.

## Evidence

Each gap has a planted failing case and a passing control in `tests/tooling/eslint-raw-font-size.test.ts` and `tests/tooling/stylelint-rules.test.ts`, both run through the repo configs.

- Template `ctx.font` with a fixed size beside a hole, `style.cssText`, `setAttribute("style", …)` and a `font` shorthand in a style object: `RAW_FONT_SIZE_SYNTAX` in `eslint.config.ts` refuses them. The token-resolved canvas font in `packages/ui/src/charts/chart/label-metrics.ts` (a template of three holes) stays legal and is a control. Before: 14 planted cases failed. After: 46 of 46 pass.
- `fontSize: "var(--text-…)"`: admitted by the same selector. It was a failing control before.
- Uppercase `FONT-SIZE`: the allow-list key in `stylelint.config.ts` is now `/^font-size$/i`.
- The root font-scale value: `orb/font-scale-on-root` in `stylelint-rules.ts` refuses it on any selector but a lone `:root`, including a nested or listed one.
- `@apply` arbitrary values: `orb/no-arbitrary-apply` in `stylelint-rules.ts` refuses a bracket value with a unit, a decimal, a track share, a hex or `length:`.
- Before: 3 of 23 stylelint cases failed. After: 23 of 23 pass; `pnpm lint:css` reports no finding on the shipped sheets.
- Not widened: the other allow-listed properties (`font-weight`, `letter-spacing`, `line-height`, `z-index`) keep their lowercase keys.
