// Policy: baseline-single-migration — before launch, schema changes squash into the single regenerated
// `0000_baseline.sql`; incremental SQL files and multi-entry/wrong-tag journals are forbidden. The three
// filesystem reads from the legacy descriptor now arrive through the closed `db-migration` authored tree,
// `db-baseline-sql` exact file, and strict `migration-journal` JSON resources. A missing directory, baseline,
// or journal therefore refuses during population acquisition instead of reading an absent checkout as clean.
//
// FAMILY `baseline-single-migration` is a singleton: it owns one launch-phase database migration invariant.
// `hard`/`error` preserves the legacy descriptor's unconditional blocking authority. `LAUNCHED` remains the
// explicit sunset signal; turning it true is the instruction to retire this policy and its resource contract
// ids in the same change, because incremental migrations become correct only after that boundary.
//
// POPULATION PORT: the legacy descriptor had no `scanRoot`; every harness candidate was dispatched although
// its `run` read none of them. The final policy admits no compiler source and declares the three resources it
// actually reads. The four legacy proof rows are retained below; the missing-baseline case is now a refusal,
// matching the exact-file door's fail-closed contract rather than fabricating a partial resource population.
import { defineGate } from "../contract/policy.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

// Widened to `boolean` so the launch transition remains an intentional authored edit rather than an
// always-falsy branch. When it flips, delete this policy in the same change.
const LAUNCHED: boolean = false;

const MIGRATIONS_REL = "packages/db/src/migrations";
const BASELINE_TAG = "0000_baseline";
const BASELINE_SQL = `${BASELINE_TAG}.sql`;
const SQL_EXT_RE = /\.sql$/u;

const EXTRA_SQL_MESSAGE =
  "an incremental migration file was found — pre-launch schema changes SQUASH into a regenerated " +
  "0000_baseline, never an incremental 0001+ migration (wipe packages/db/src/migrations and rerun " +
  "`pnpm --filter @orb/db db:generate`); Core-Laws-and-Precedents.md (db-baseline-squash)";
const JOURNAL_SHAPE_MESSAGE =
  "meta/_journal.json must have EXACTLY one entry (idx 0, tag 0000_baseline) pre-launch — a second " +
  "journal entry means an incremental migration was generated instead of a squashed baseline; " +
  "Core-Laws-and-Precedents.md (db-baseline-squash)";
const MESSAGE =
  "pre-launch schema changes must SQUASH into the regenerated 0000_baseline, never accrete as an incremental " +
  "0001+ migration — an extra migration file or a second/wrong journal entry is RED; a missing required " +
  "migration resource refuses the pass. Core-Laws-and-Precedents.md (db-baseline-squash).";
const FIX =
  "wipe packages/db/src/migrations and rerun `pnpm --filter @orb/db db:generate` from a clean dir — the entire pre-launch schema is one regenerated baseline.";

function isSingleBaselineJournal(value: JsonValue): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = value["entries"];
  const entry = Array.isArray(entries) && entries.length === 1 ? entries[0] : undefined;
  return typeof entry === "object" && entry !== null && !Array.isArray(entry) && entry["idx"] === 0 && entry["tag"] === BASELINE_TAG;
}

export const gate = defineGate({
  id: "baseline-single-migration",
  family: "baseline-single-migration",
  authority: "hard",
  severity: "error",
  population: {
    of: "none",
    why: "the migration tree, exact baseline SQL, and strict journal JSON are closed ResourceHost facts; this policy reads no compiler source",
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "authored-tree", id: "db-migration" },
    { kind: "exact-file", id: "db-baseline-sql" },
    { kind: "json", id: "migration-journal" },
  ],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      if (LAUNCHED) {
        return;
      }
      const entries = readyResourceValue(ctx.resources.authoredTree("db-migration"));
      for (const entry of entries.filter((candidate) => candidate.kind === "file" && SQL_EXT_RE.test(candidate.path))) {
        if (entry.path !== `${MIGRATIONS_REL}/${BASELINE_SQL}`) {
          ctx.report.file(entry.path, { line: 1, column: 1, message: EXTRA_SQL_MESSAGE, fix: FIX });
        }
      }
      // Accessing the exact file is deliberate even though the tree also lists it: this is the closed
      // missing-baseline refusal. A directory listing is not evidence that the required file was acquired.
      readyResourceValue(ctx.resources.exactFiles(["db-baseline-sql"]));
      const journal = readyResourceValue(ctx.resources.json("migration-journal"));
      if (!isSingleBaselineJournal(journal.value)) {
        ctx.report.file(journal.path, { line: 1, column: 1, message: JOURNAL_SHAPE_MESSAGE, fix: FIX });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/db/src/migrations/0000_baseline.sql": "-- baseline\n",
        "packages/db/src/migrations/0001_extra.sql": "-- incremental\n",
        "packages/db/src/migrations/meta/_journal.json": '{ "entries": [{ "idx": 0, "tag": "0000_baseline" }] }\n',
      },
      expect: { count: 1, messageIncludes: "incremental migration" },
      why: "an incremental 0001 migration alongside the baseline — pre-launch changes must squash",
    },
    {
      mode: "resource",
      files: {
        "packages/db/src/migrations/0000_baseline.sql": "-- baseline\n",
        "packages/db/src/migrations/meta/_journal.json": '{ "entries": [{ "idx": 0, "tag": "0000_baseline" }, { "idx": 1, "tag": "0001_extra" }] }\n',
      },
      expect: { count: 1, messageIncludes: "EXACTLY one entry" },
      why: "a second journal entry exercises the journal-shape arm independently of SQL discovery",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/db/src/migrations/0000_baseline.sql": "-- baseline\n",
        "packages/db/src/migrations/meta/_journal.json": '{ "entries": [{ "idx": 0, "tag": "0000_baseline" }] }\n',
      },
      why: "exactly the baseline SQL and a single matching journal entry — the sanctioned pre-launch shape",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: {
        "packages/db/src/migrations/0001_stray.sql": "-- stray\n",
        "packages/db/src/migrations/meta/_journal.json": '{ "entries": [{ "idx": 0, "tag": "0001_stray" }] }\n',
      },
      expect: { messageIncludes: "exact-file:db-baseline-sql is missing" },
      why: "the required baseline is absent — the exact-file acquisition refuses before a partial tree can be judged clean",
    },
  ],
});
