---
kind: work
status: open
updated: 2026-10-17
priority: P3
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
