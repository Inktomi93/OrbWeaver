---
kind: tooling
status: open
updated: 2026-11-02
priority: P2
area: tests
plan: test-foundation
---

# Test servers boot from one migrated database copied per test instead of migrating from scratch on every boot

## What

Each test server boot copies one already-migrated database made once per run, in place of running the whole migration chain on a fresh database.

## Why

CI's component test job takes about 39 minutes. Its log shows 1,549 server boots across 2,286 tests, each running every migration from scratch. Local Node and CT runs pay the same cost.

## Done when

One boot is timed before and after; the CT and Node suites stay green; a test that needs an unmigrated or partly migrated database still gets one.

## Evidence

Plan: make the corpus harness a worker-scoped Playwright fixture (one composed server root per worker, today `createCorpusHarness` is called per test in 159 of the 341 CT files and nothing in `tests/support` is worker-scoped), and reset only data per test by copying a migrated template database. Move the call sites by codemod. The browser side already reuses the context (`reuseContext: true` in `playwright-ct.config.ts`).

Filled at landing: what ran and where its output is.
