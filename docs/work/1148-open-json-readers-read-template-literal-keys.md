---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Open-json readers read template-literal keys

## What

The open-json column readers do not resolve a template-literal key without substitutions, which the 955 lane taught the other member readers. From the 955 version table.

## Why

Every member reader should see the same key spellings; one that does not is a weaker version left behind.

## Done when

The open-json readers resolve plain template keys with red-first cases and unchanged findings otherwise.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
