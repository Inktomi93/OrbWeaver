---
kind: tooling
status: open
updated: 2026-09-23
---

# Move runner-owned report outputs into per-run slots

## What

Playwright CT (playwright-ct.config.ts:109,147,148), Playwright e2e (playwright.config.ts:38,39,76), jscpd (package.json:95), vitest coverage (vitest.config.ts:143) and mutation-probe still write to fixed paths directly under reports/, confirmed live in the current tree. Route each through the run-slot layout (reports/runs/<instrument>/<runId>/ plus a latest pointer), or record a reasoned exemption in the run-slot law.

## Why

Two concurrent runs on one checkout overwrite each other's fixed-path artifacts. In a multi-lane workflow, two lanes running CT or e2e at the same time can read each other's report as their own.

## Done when

No verification tool writes a fixed path directly under reports/ except the published pointers, baselines/ and verify-history.jsonl. Concurrent CT and e2e runs keep separate reports.

## Evidence

Filled at landing: what ran and where its output is.
