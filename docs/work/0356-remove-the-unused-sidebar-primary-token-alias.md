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
