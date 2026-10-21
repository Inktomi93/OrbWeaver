---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
---

# Remove the vanity aliases the baselined waivers hide

## What

For every `@orb-waive no-vanity-alias` marker in `packages/*/src`, delete the alias and use the original name, or keep the second name with an inline reason where the consumer names a different concept. Batch by package.

## Why

One symbol, one name. The markers were stamped when the gate landed and cite no item; the gate is the judge and the sites are the defect.

## Done when

No `no-vanity-alias` marker cites a burn-down item; each surviving marker states why the second name is a distinct concept; the gate passes on each touched package.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
