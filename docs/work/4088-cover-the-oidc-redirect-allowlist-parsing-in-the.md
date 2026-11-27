---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: security
plan: test-foundation
---

# Cover the OIDC redirect allowlist parsing in the auth config

## What

Mutation testing packages/server/src/infra/auth/config.ts leaves the oidcRedirectAllowlist parseCsv trim and blank-entry filter uncovered.

## Why

A stray-whitespace or blank redirect entry changes which redirects OIDC accepts.

## Done when

pnpm test:mutation on packages/server/src/infra/auth/config.ts shows no NoCoverage mutant.

## Evidence

Filled at landing: what ran and where its output is.
