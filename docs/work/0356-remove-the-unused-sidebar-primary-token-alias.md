---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: ui
---

# Remove the unused sidebar-primary token alias

## What

Remove color.sidebar-primary from the canonical token source and regenerate its derived outputs. Keep color.primary and the active rail styles unchanged.

## Why

The token classification explicitly calls this a reserved alias with no consumers. The active rail uses primary directly, and source searches find only the alias declaration, generated outputs and classification entry.

## Done when

Recheck canonical JSON references, CSS and utility spellings, runtime theme maps and public token contracts. Remove the unused alias and its obsolete classification. Regenerate through the existing token command; do not hand-edit generated files. Run token freshness and affected theme classification checks, and verify the active rail appearance is unchanged.

## Evidence

Canonical source: `packages/ui/src/tokens/tokens.json`. The explicit unused classification is in `tests/ui/content/theme-scope/token-classification.suite.test.ts`. Cross-check artifacts are `reports/launch-ast-audit-2026-10-01/token-css-crosscheck.json` and `reports/launch-ast-audit-2026-10-01/token-utility-crosscheck.json`; runtime reachability is not inferred from generated declarations.

Done in cb-ui-cleanup. Consumer re-check (rg over packages, tests, tooling, scripts, playwright, four spellings): only `tokens.json`, the two generated outputs and the classification entry named the alias. Removed `color.sidebar-primary` from `tokens.json`, added the `removed.json` path and `--color-sidebar-primary` target rows (the token contract refuses a removal without them), regenerated `theme.css` and `tokens/index.ts` with `pnpm --filter @orb/ui tokens:build`, and dropped the classification entry and comment in `token-classification.suite.test.ts`. Ran `tests/ui/tokens/index.test.ts` (drift check), `token-classification.suite.test.ts`, `theme-emit-pairing.suite.test.ts`: all pass. The rail reads `--color-primary`, so its appearance is unchanged by construction.
