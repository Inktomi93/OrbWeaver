---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-enforcement
---

# Refuse hand-copied CSS custom properties and media queries in tests

## What

An ESLint rule over tests/\*\* that reports a string or template literal naming a CSS custom property (--name) or a media condition ((hover: …), (pointer: …), (width …)), pointing at TOKENS\[...].cssVar and MEDIA_QUERIES.

## Why

These copies sit beside the token reads in the same files and drift silently.

## Done when

The rule refuses a planted literal and accepts the token read; its existing findings are rewritten by codemod; it reports zero over tests/.

## Evidence

Rule `orb/no-hand-typed-css-token` in `tooling/src/eslint/test-derivation.ts`; controls in `tests/tooling/eslint-test-derivation.test.ts`. The existing sites moved through the `literal-to-binding` codemod, with reads inside `evaluate` callbacks threaded through the evaluate argument. `pnpm lint:eslint` over `tests/` by directory reports zero for the rule. `tests/tooling` is out of scope because Spine-Testing §9 governs product tests and a tooling literal is its tool's input.
