---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: tooling
plan: restoration-register
---

# Distinguish missing report directories from failed discovery

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B039-104`: Treat only missing-directory errors as the named empty result; let other directory-read errors reach the existing tool failure boundary.

Inspect `tests/tooling/bug-reports/cli.int.test.ts`, `tooling/src/bug-reports/lib/read.ts`.

## Why

`AF3-B039-104`: The blanket readdir catch reports existing unreadable or non-directory paths as nonexistent and returns a clean listing exit.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B039-104`: Native CLI tests retain absent/empty behavior; a real file occupying the report-directory path produces a visible non-clean failure. Preserve corrupt individual report rows.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
