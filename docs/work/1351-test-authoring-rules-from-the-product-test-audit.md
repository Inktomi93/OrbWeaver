---
kind: tooling
status: doing
updated: 2026-10-25
priority: P1
area: tests
lane: cb-testlint
plan: test-foundation
---

# Test-authoring rules from the product-test audit land

## What

Seven rules: fixed or always-error tRPC responders, hand-typed appearance names in tests, story roots outside CtIsolation/CtClientProviders, hand-built shell DOM in stories, cross-feature test helper imports, hand-copied production labels, absence-only cases without a positive control. The surface harness moved onto serveCorpusProcedures; admin SSO link buttons gained distinct names.

## Why

An audit found tests passing over fabricated states and copied production values; owner: tests use the actual product.

## Done when

The branch passes review with every touched e2e spec run, all rules on at zero, and each of the four file-header exceptions judged against Spine-Testing section 9.

## State

- Branch `wt/agent-af01e0d3719ce9957` at merge `671f42d651`, refuted once; merging main conflicts in `eslint.config.ts` imports (keep both) and `_surface-harness.ts` (keep the SERVED list and main's `overrides` spread). The lane is fixing:
  - the responder rule misses route maps passed by variable or spread (live: `own-key-panels.ct.tsx:84-91`; main's census overrides at `surface-census.suite.ct.tsx:165,184`), a `trpcError` held in a const, a both-branch error ternary, and `void input` responders;
  - `ServeIntercept` lets a hold release fabricated data (`ct-corpus-procedures.ts:65`), and route-map holds do too (`confirmation-identity.ct.tsx:44`);
  - the `list-lifetimes.ct.tsx` exception hides 7 fixed responders and a copied server merge; rebuild on the corpus;
  - the label rule's first-module ownership mis-owns common words (group "Advanced" imported from the character facet tiers) and hoisted test literals still copy labels; extend to `getByText`;
  - the absence rule misreads `toBeNull()` and `.not.toBeHidden()`.
- e2e: all desktop corpus cells pass at low load except `corpus-shell.spec.ts:309`, which fails on main too (item 1359).

## Evidence

Filled at landing: what ran and where its output is.
