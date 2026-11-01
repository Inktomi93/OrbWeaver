---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tooling
plan: unwired-code
---

# Unwired engine one judges and find-references audits one way: homeWritten from direct writes, a key per union option, serviceReflectedReads deleted, reflected memoized, linked deduped (lands with 1697)

## What

`pnpm unwired fields` judges with engine one and audits one way with find-references. A disagreement means engine two found a production site in a role engine one lacks. `homeWritten` reads the sites that name a field plus the writes a flow carries in. Each schema union option has its own field key, the second and later declarations with a `#n` suffix. `serviceReflectedReads` is deleted. `reflected` runs once per value, target and key shape, and `linked` deduplicates by key edge.

## Why

[ts71-engine-disagreements.md](../plans/unwired-code/ts71-engine-disagreements.md) shows the old comparison reported engine two's blind spots as contradictions, and most of the time and memory sits in `reflected` and `linked`.

## Done when

- A field engine two reaches in fewer sites stays a finding. A field engine two reaches in a role engine one lacks leaves the findings for `disagreements`.
- A home written only through a spread link is not written. The env schema reports no `never-written` row.
- Two union options that share a key are two fields.
- `fields` loads TypeScript 6 only under `--cross-check`.
- The full before and after runs below agree with the expected change.

## Evidence

- `tests/tooling/unwired/fields.int.test.ts` and `tests/tooling/unwired/occurrences.int.test.ts`: a found case and a control per change, each seen red first. The deletion has no red: the reflective controls stay green without the walk.
- A union option's key reads narrowed to another option, which find-references climbs across, so such a key is an audit row and not a finding. `HealthSchema.at#2` in `tests/tooling/unwired/fields.int.test.ts` holds the case. The real run can show more rows than class D for this reason.
- Owed by the owner: the full before and after, peak memory and wall time.
