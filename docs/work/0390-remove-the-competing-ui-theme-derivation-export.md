---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: ui
---

# Remove the competing UI theme derivation export

## What

Move test consumers to the canonical kit theme-derivation export and remove the clamp module forwarding alias.

## Why

The forwarding export preserves a redundant import path while production consumers already use the canonical home.

## Done when

Consumers use the kit export and relevant contrast and derivation behavior remains tested. Remove only proof that exists solely for the forwarding alias.

## Evidence

Source audit: `/tmp/claude-launch-alias-audit/results.json` and its summary. Main checked the relevant declarations and canonical ownership. Implementation and affected checks remain pending.

Done in cb-ui-cleanup. Production has no consumer of the alias (`derive-vars.ts` and `clamp.ts` import from `@orb/kit/theme-derivation`). Removed the `THEME_DERIVATION` forwarding export from `packages/ui/src/content/theme-scope/clamp.ts`, repointed `palette-contrast.suite.test.ts` to the kit export, and deleted the alias-identity test in `tests/kit/theme-derivation/index.test.ts`. Ran that file, `palette-contrast.suite.test.ts` and `clamp.test.ts`: all pass; ui, client and test typechecks pass.
