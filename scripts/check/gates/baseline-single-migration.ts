// Gate: baseline-single-migration (Core-Laws-and-Precedents.md — pre-launch schema changes SQUASH into
// the regenerated 0000_baseline, they never accrete as incremental 0001+ migrations). Nothing else in
// the gate suite catches this: drizzle-kit happily writes 0001_*.sql, tsc/biome don't care, and an
// agent that "just adds a migration" the normal way ships debt that only a human diff review would
// catch — which the 2026-07-09 session miss proved doesn't reliably happen. The law: until launch, the
// ENTIRE schema is one regenerated baseline (`pnpm --filter @orb/db db:generate` after wiping
// migrations/ and regenerating from scratch) — never `db:generate` on top of an existing baseline.
//
// Checks packages/db/src/migrations contains EXACTLY the 0000_baseline artifacts (one *.sql file named
// `0000_baseline.sql`, no other *.sql files) and meta/_journal.json has exactly one entry (idx 0, tag
// "0000_baseline").
//
// LAUNCH-DAY ESCAPE: flip LAUNCHED to true to retire this gate deliberately (post-launch, incremental
// migrations become the correct pattern — squashing a shipped baseline against live data is unsafe).
// This is not a bug workaround; it's the gate's own designed sunset switch.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

// Widened to `boolean` (not the `false` literal) so flipping this to `true` on launch day doesn't
// require silencing a "condition always falsy" lint — the annotation is the deliberate escape hatch.
const LAUNCHED: boolean = false;

const MIGRATIONS_REL = "packages/db/src/migrations";
const BASELINE_TAG = "0000_baseline";
const BASELINE_SQL = `${BASELINE_TAG}.sql`;
const SQL_EXT_RE = /\.sql$/u;

const EXTRA_SQL_MESSAGE =
  "an incremental migration file was found — pre-launch schema changes SQUASH into a regenerated " +
  "0000_baseline, never an incremental 0001+ migration (wipe packages/db/src/migrations and rerun " +
  "`pnpm --filter @orb/db db:generate`); Core-Laws-and-Precedents.md (db-baseline-squash)";

const MISSING_BASELINE_MESSAGE =
  "packages/db/src/migrations is missing 0000_baseline.sql — run `pnpm --filter @orb/db db:generate` " +
  "from a clean migrations/ dir; Core-Laws-and-Precedents.md (db-baseline-squash)";

const JOURNAL_SHAPE_MESSAGE =
  "meta/_journal.json must have EXACTLY one entry (idx 0, tag 0000_baseline) pre-launch — a second " +
  "journal entry means an incremental migration was generated instead of a squashed baseline; " +
  "Core-Laws-and-Precedents.md (db-baseline-squash)";

interface JournalEntry {
  readonly idx?: number;
  readonly tag?: string;
}

interface Journal {
  readonly entries?: readonly JournalEntry[];
}

function checkSqlFiles(migrationsDir: string): Violation[] {
  const sqlFiles = readdirSync(migrationsDir).filter((f) => SQL_EXT_RE.test(f));
  if (!sqlFiles.includes(BASELINE_SQL)) {
    return [
      { file: `${MIGRATIONS_REL}/${BASELINE_SQL}`, line: 0, message: MISSING_BASELINE_MESSAGE },
    ];
  }
  return sqlFiles
    .filter((f) => f !== BASELINE_SQL)
    .map((f) => ({ file: `${MIGRATIONS_REL}/${f}`, line: 0, message: EXTRA_SQL_MESSAGE }));
}

function checkJournal(migrationsDir: string): Violation[] {
  const journalRel = `${MIGRATIONS_REL}/meta/_journal.json`;
  const journalPath = join(migrationsDir, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    return [{ file: journalRel, line: 0, message: JOURNAL_SHAPE_MESSAGE }];
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as Journal;
  const entries = journal.entries ?? [];
  const isSingleBaseline =
    entries.length === 1 && entries[0]?.idx === 0 && entries[0]?.tag === BASELINE_TAG;
  if (isSingleBaseline) {
    return [];
  }
  return [{ file: journalRel, line: 0, message: JOURNAL_SHAPE_MESSAGE }];
}

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanBaselineSingleMigration(root: string): Violation[] {
  if (LAUNCHED) {
    return [];
  }
  const migrationsDir = join(root, MIGRATIONS_REL);
  if (!existsSync(migrationsDir)) {
    return [];
  }
  return [...checkSqlFiles(migrationsDir), ...checkJournal(migrationsDir)];
}

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a pure-FS `run` gate, fsBacked conformance) ──────────────────
// baseline-single-migration reads the real fs (readdirSync of migrations/ *.sql + readFileSync of
// meta/_journal.json) — a `run` descriptor over ctx.root reusing the scan, with `fsBacked` so conformance
// materializes examples to a real temp dir (its .sql/.json fixture files are written to disk though not
// added to the ts-morph Project — exactly what a pure-fs gate needs). Byte-identical to the legacy Check.
//
export const gate: GateDescriptor = {
  name: "baseline-single-migration",
  docRow: "Core-Laws-and-Precedents.md (db-baseline-squash)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "pre-launch schema changes must SQUASH into the regenerated 0000_baseline, never accrete as an incremental 0001+ migration — an extra migration file / a second journal entry / a missing baseline is RED (wipe migrations/ and rerun db:generate). Core-Laws-and-Precedents.md (db-baseline-squash).",
  fix: "wipe packages/db/src/migrations and rerun `pnpm --filter @orb/db db:generate` from a clean dir — the entire pre-launch schema is one regenerated baseline.",
  run: (ctx) => {
    for (const v of scanBaselineSingleMigration(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/db/src/migrations/0000_baseline.sql": "-- baseline\n",
        "packages/db/src/migrations/0001_extra.sql": "-- incremental\n",
        "packages/db/src/migrations/meta/_journal.json":
          '{ "entries": [{ "idx": 0, "tag": "0000_baseline" }] }\n',
      },
      expect: { messageIncludes: "incremental migration" },
      why: "an incremental 0001 migration alongside the baseline — pre-launch changes must squash (db-baseline-squash)",
    },
    {
      files: {
        // a stray *.sql present but NO 0000_baseline.sql → the MISSING_BASELINE arm.
        "packages/db/src/migrations/0001_stray.sql": "-- stray\n",
        "packages/db/src/migrations/meta/_journal.json":
          '{ "entries": [{ "idx": 0, "tag": "0001_stray" }] }\n',
      },
      expect: { messageIncludes: "missing 0000_baseline.sql" },
      why: "migrations/ has a .sql but no 0000_baseline.sql — the MISSING_BASELINE arm (distinct message)",
    },
    {
      files: {
        "packages/db/src/migrations/0000_baseline.sql": "-- baseline\n",
        // a valid single baseline .sql but a SECOND journal entry → the JOURNAL_SHAPE arm.
        "packages/db/src/migrations/meta/_journal.json":
          '{ "entries": [{ "idx": 0, "tag": "0000_baseline" }, { "idx": 1, "tag": "0001_extra" }] }\n',
      },
      expect: { messageIncludes: "EXACTLY one entry" },
      why: "a second _journal.json entry (idx 1) — the JOURNAL_SHAPE arm (distinct message + code path)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/db/src/migrations/0000_baseline.sql": "-- baseline\n",
        "packages/db/src/migrations/meta/_journal.json":
          '{ "entries": [{ "idx": 0, "tag": "0000_baseline" }] }\n',
      },
      why: "exactly the 0000_baseline + a single-entry journal — the sanctioned pre-launch shape, passes",
    },
  ],
};
