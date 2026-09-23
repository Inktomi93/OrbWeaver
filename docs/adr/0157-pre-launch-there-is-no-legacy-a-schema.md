---
kind: adr
status: active
updated: 2026-09-23
---

# pre-launch there is no legacy: a schema or wire change is a CLEAN BREAK

## Context

Not recorded in the ledger row.

## Decision

Owner ruling: *"we haven't launched yet — there shouldn't be legacy anything."* No lift-at-parse machinery, no wire-compat era, no dual-shape read, no committed runtime compat code; the dev DB is expendable (wipe and reseed) or gets a ONE-TIME throwaway script that is not committed as runtime. The schema corollary was the baseline squash — a schema change REGENERATED `0000_baseline.sql` rather than accreting an incremental migration. That schema corollary is superseded, owner-ruled: the sunset switch fired. `DB_LAUNCHED` is `true`, the baseline is frozen, and a schema change is now a forward incremental migration; the `baseline-single-migration` gate was deleted with the flip (recorded at `docs/law/Core-Enforcement-Deferred-Dropped.md` §`Retired`). The WIRE half of D157 is untouched — no lift-at-parse, no dual-shape read, no committed compat code — and so is "the dev db is expendable": it is still wiped and reseeded on demand (`pnpm seed:demo --fresh`), it just is no longer wiped by a boot nobody asked for. Homes: `Tier-1-DB.md` §"The migration lifecycle" (regime 2 is today's law, regime 1 is kept as history) · `.claude/rules/db.md`. Enforcers now: `pnpm check:db-baseline` (the chain accounts for the live schema) + `pnpm check:drizzle-kit` (chain integrity) + the boot refusal; the no-compat-code half stays owner-ruled, prose-enforced.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
