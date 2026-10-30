---
kind: tooling
status: open
updated: 2026-10-24
priority: P3
area: tests
plan: test-foundation
---

# Sandbox-frame CTs run under the production app policy

## What

The sandbox-frame CTs capture the app CSP from a served response, but the CT stack serves the development variant (it allows unsafe-eval and ws:). Frame navigation directives are identical in both variants, so today's verdicts hold; a future directive that differs would go untested.

## Why

A security-boundary test should run against the policy owners actually get.

## Done when

The sandbox-frame navigation CTs run with the production variant of the app policy, read from the same served response path; a planted production-only directive change fails a case.

## Evidence

`tests/ui/content/sandbox-frame/_served-frame.ts` opens its corpus root with `NODE_ENV=production`, so the app policy read from the served response is the production variant.

- Before: a production-only `frameSrc` widening planted in `packages/server/src/entry/http/security-headers.ts` passed every case in `sandbox-frame-navigation.ct.tsx`.
- After: the same plant fails four navigation cases. With the plant reverted, `sandbox-frame-navigation.ct.tsx` and `sandbox-frame.ct.tsx` pass.
