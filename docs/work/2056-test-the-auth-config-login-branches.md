---
kind: bug
status: open
updated: 2026-11-07
priority: P2
area: tests
plan: test-foundation
---

# Test the auth-config login branches

## What

Mutation testing found the oidc and single-user schema branches of auth-config have no test in their mirror: static mutants there survive.

## Why

Auth config decides who can sign in, and a wrong branch would pass every mirrored test.

## Done when

A pnpm test:mutation run on the auth-config file kills those mutants, through tests at the production entry.

## Evidence

Filled at landing: what ran and where its output is.
