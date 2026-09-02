---
paths:
  - "packages/db/src/migrations/**"
  - "packages/db/src/schema/**"
  - "drizzle.config.ts"
---

<!-- Path-scoped rule, split out of `.claude/rules/orchestration.md` on 2026-08-24 (lane
     cb-agent-fleet). This is the most expensive standing fact we own and it is inert everywhere
     except these paths, so it loads on match. `.claude/rules/lane-standing-facts.md` carries a
     one-line pointer at it so nobody reaches these files without knowing this exists. Schema law
     proper is `docs/architecture/core/Tier-1-DB.md` + D15/D20/D23/D24/D28. -->

# Editing the schema baseline DROPS the dev database

**Any change under `packages/db/src/migrations/**` — hand-patch or regen — changes the baseline hash,
and the next boot/migrate RESETS the dev database.** All of it. This is pre-launch behaviour by
design, and on 2026-08-23 (#533/#534) it cost a 1,242-chat SillyTavern import plus ten corpus passes,
about eight GPU-hours.

- **Pre-launch, schema changes SQUASH into `0000_baseline.sql`** — never an incremental `0001`. The
  `db-structure` gate does NOT catch a stray incremental.
- **A lane doing this is merge-window-scheduled**, exactly like a drive that depends on the in-memory
  recorders. Say so in your report; the orchestrator picks the window.
- **The tripwire is a `[verify-notice]` line in `pnpm check`'s tail block** — "THE NEXT SERVER RESPAWN
  WILL DROP THE DEV DB". READ IT. It never fails the run, so a green verdict does not mean nothing
  happened.
- **The moment the boot's pre-migrate backup appears, PIN it**:
  `touch data/orbweaver.db.backup-<stamp>.keep`. A pinned backup is exempt from `pruneDbBackups`
  forever; an unpinned one ages out of the recent-5 / daily-7 budget.
- **Never run `drizzle generate` on a shared or multi-lane tree** — like every whole-tree regenerator
  it recomputes from the WHOLE working tree and bakes a sibling's in-flight edits into your committed
  baseline.
- **The squash procedure itself lives in `docs/architecture/core/Tier-1-DB.md` §"Regime 1"** — read it
  before you regenerate (it owns the `mv`-aside step, the `_journal.json` requirement, the
  diff-your-delta check, and the two-lane sequencing rule).
- **NEVER open the LIVE db with bare `sqlite3`** — it takes a WAL lock the running server does not
  expect. Read through the app's own path.
