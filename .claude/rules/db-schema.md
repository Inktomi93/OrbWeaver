---
paths:
  - "packages/db/src/migrations/**"
  - "packages/db/src/schema/**"
  - "drizzle.config.ts"
---

<!-- Path-scoped rule, split out of `.claude/rules/orchestration.md` on 2026-08-24 (lane
     cb-agent-fleet), REWRITTEN 2026-09-18 when the launch flip (#316 Arm A) inverted its subject.
     It is inert everywhere except these paths, so it loads on match.
     `.claude/rules/lane-standing-facts.md` carries a one-line pointer at it so nobody reaches these
     files without knowing this exists. Schema law proper is
     `docs/architecture/core/Tier-1-DB.md` + D15/D20/D23/D24/D28. -->

# A schema change is a FORWARD MIGRATION — and the db is no longer auto-wiped

**The box is LAUNCHED (owner ruling 2026-09-18, #316 Arm A).** `DB_LAUNCHED` is `true` in
`packages/server/src/entry/boot/migrate.ts`, so the old pre-launch bargain is over in both directions:

- **Editing the baseline no longer drops the dev database — it BRICKS THE BOOT.** A db that recorded a
  migration which is in no shipped journal entry aborts `runBootMigrations` with a refusal instead of
  backing up and re-migrating from scratch. Louder, and non-destructive.
- **There is no squash procedure any more.** `0000_baseline.sql` is FROZEN. Never regenerate it, never
  hand-patch it, never `mv` the migrations dir aside. An applied migration is never edited or deleted:
  a mistake in one is fixed by a NEW forward migration.

## The procedure for a schema change

1. Edit `packages/db/src/schema/<feature>.ts`.
2. `pnpm --filter @orb/db exec drizzle-kit generate --name <what-changed> --config=drizzle.config.ts` —
   with the migrations dir UNTOUCHED. It emits `000N_<name>.sql`, `meta/000N_snapshot.json` and a journal
   entry. **Commit `meta/` too** — the snapshot chain IS the history.
3. **READ the emitted SQL before committing.** SQLite cannot drop a constraint or retype a column, so
   drizzle emits its 12-step table rebuild (create `__new_x` → copy → drop → rename) for those. A
   hand-written data backfill goes in the SAME `.sql`, after the DDL.
4. Verify: `pnpm check:drizzle-kit` (chain integrity — this is the one that catches two lanes generating
   `000N` off the same parent) and `pnpm check:db-baseline` (the chain accounts for the live schema).
5. `pnpm exec biome check --write` the two `migrations/meta` files (drizzle emits unformatted JSON;
   `lint:biome` reds otherwise). Scope the `--write` to those files — never a repo-wide fix-all.

The full law, including what each check does and does NOT see: `docs/architecture/core/Tier-1-DB.md`
§"Regime 2" (regime 1 above it is the pre-2026-09-18 squash era, kept as history — do not follow it).

## Still true, and still expensive to learn twice

- **Never run `drizzle generate` on a shared or multi-lane tree** — like every whole-tree regenerator it
  recomputes from the WHOLE working tree and bakes a sibling's in-flight schema edit into your migration.
- **A deliberate local wipe is `pnpm seed:demo --fresh`** (it wipes the `file:` db + its WAL/SHM sidecars,
  re-migrates and reseeds; it refuses a non-`file:` `DATABASE_URL`). That is now the ONLY thing that
  resets a developer's db — nothing does it behind your back. The owner has priced a dev-db wipe as
  acceptable (relayed 2026-09-05: *"we don't gaf about the db, it can be nuked"*), so it needs no merge
  window and no owner word; the `.keep`-pin ritual retired with the auto-reset that made it necessary.
- **The `[verify-notice]` line in `pnpm check`'s tail block is the tripwire** — it now reads `THE NEXT
  SERVER BOOT WILL REFUSE TO START` when your local db diverged from the committed chain. It never fails
  the run, so a green verdict does not mean the notice was absent. READ IT.
- **NEVER open the LIVE db with bare `sqlite3`** — it takes a WAL lock the running server does not
  expect. Read through the app's own path.
- **The pre-migrate backup still exists** (`backupBeforeMigrate`), taken only on a boot that will CHANGE
  the db, with a recent-5 + daily-7 retention sweep. `touch data/orbweaver.db.backup-<stamp>.keep`
  exempts one forever if you want to hold a copy.
