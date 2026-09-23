---
kind: adr
status: active
updated: 2026-09-23
---

# schema history has a post-launch rule and a pre-launch standing exception

## Context

Not recorded in the ledger row.

## Decision

Post-launch, schema changes are numbered forward migrations, applied migrations are immutable, and baseline/journal drift is boot-fatal; `DB_LAUNCHED` stays `true`, so drift never auto-wipes data. **PRE-LAUNCH STANDING EXCEPTION (owner-approved):** while a program is explicitly pre-launch with no user data to preserve, its schema changes regenerate `0000_baseline.sql` and committed `meta/` instead of stacking forward migrations; any existing forward migrations for that program are folded into the regenerated baseline, and the developer deliberately resets with `pnpm seed:demo --fresh`. The exception does not weaken boot refusal or authorize automatic reset. Homes: `Tier-1-DB.md` migration lifecycle · `.claude/rules/db.md` for post-launch law · [orbweaver-inference-package.md §15c](../design/orbweaver-inference-package.md#15c-what-the-six-passes-paid-for--read-before-briefing-a-lane) for the active pre-launch exception. Enforcers: `pnpm check:db-baseline` · `pnpm check:drizzle-kit` · `checkBaseline` · `tests/server/entry/boot/migrate.int.test.ts`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
