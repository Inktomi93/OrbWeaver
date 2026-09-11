// Gate: ratchet-row-integrity (#569) — the DEBT-vs-RATIFIED classification's own enforcer, over EVERY
// committed `*.baseline.json` under tooling/src (discovered from the filesystem, never a declared list, so a
// NEW ratchet is judged the day it lands). Four arms, all read through the ONE row reader
// (`tooling/src/_shared/ratchet-rows.ts`) so the gate and the ledgers' owners can never disagree on a shape:
//   A malformed row   — a ledger the shared parser refuses (a bad count, `ratified` > `count`, a cite that is
//                       not an array of paths). A debt file that cannot be parsed must never read as zero.
//   B ratified-no-why — a permanent admission with no `why` is parked debt wearing a permit.
//   C STALE WHY       — a ratified row citing a repo-relative path that is GONE. This is the arm the issue
//                       was filed for: a ratification must not outlive the site that justified it.
//   D blindness       — zero ledgers discovered on a REAL-TREE run (§4.6): the discovery walk died, and a
//                       clean listing over nothing is the false-green this repo keeps paying for.
// COMMENT POSTURE: comments-INTENDED is not applicable — the units are JSON ledgers, not TS source; no file
// text of any scanned source is matched. UNITS: `ctx.scan({ unit: "ledger row" })`, because the ts-morph walk
// structurally cannot see a JSON file and a bare `scanned 0/N files` would read as a blind gate (§1).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { classOf, discoverBaselineFiles, RatchetRowError, readRatchetLedger, rowProblems } from "../../_shared/ratchet-rows.ts";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { fileLoaded } from "../lib/pass.ts";

const GATE_SELF = "tooling/src/verify/gates/ratchet-row-integrity.ts";
/** THE REAL-TREE ANCHOR for the blindness arm (GATE-AUTHORING.md §4.5) — present on every real run and
 *  planted by none of the examples below, so arm D never fires inside a conformance mini-project. */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";

const MESSAGE =
  "a ratchet baseline row's DEBT-vs-RATIFIED classification is broken (#569): a row the shared reader cannot " +
  "parse, a RATIFIED portion with no `why`, or a `cite` naming a site that is no longer on the tree. A " +
  "ratification is a promise that a recorded ruling made this admission permanent — when the thing it cites " +
  "is gone, the promise is a lie and the row is back to being debt. The row shape and its class rules live in " +
  "tooling/src/_shared/ratchet-rows.ts";
const FIX =
  "Fix the row in its ledger: re-cite the ruling at its new path, write the missing `why`, or drop `ratified` " +
  "back to 0 so the budget rejoins the burn-down queue (`pnpm debt` lists both halves). The row shape lives in " +
  "tooling/src/_shared/ratchet-rows.ts.";
const BLIND_MESSAGE =
  "BLINDNESS TRIPWIRE — zero `*.baseline.json` ledgers were discovered under tooling/src on a real-tree run, so " +
  "this gate judged NOTHING while reporting a verdict. Either every ratchet reached its terminal state in one " +
  "commit (delete this gate with them) or the discovery walk broke: re-point discoverBaselineFiles in " +
  "tooling/src/_shared/ratchet-rows.ts";

/** One ledger's rows, judged. A parse refusal is itself a finding anchored on the ledger — never a throw that
 *  the harness would attribute to the gate as a tool error, because a malformed committed ledger is a
 *  VIOLATION of this gate's contract, not a broken checker. */
function judgeLedger(ctx: GateRunCtx, rel: string): number {
  let rows = 0;
  // @orb-waive caught-failure-ownership(error): reported via ctx.report() as an UNPARSEABLE LEDGER violation, per the doc comment above — the gate's contract treats a parse failure as a finding, never a silent pass. Ends if ctx.report() stops being read as the gate's violation stream.
  try {
    const ledger = readRatchetLedger(ctx.root, rel);
    for (const row of ledger.rows) {
      rows += 1;
      for (const problem of rowProblems(ctx.root, row)) {
        ctx.report({
          file: rel,
          line: 0,
          column: 0,
          token: row.subject,
          message: `${classOf(row)} row "${row.subject}": ${problem} — the row shape and its class rules live in tooling/src/_shared/ratchet-rows.ts`,
        });
      }
    }
  } catch (error) {
    const detail = error instanceof RatchetRowError ? error.message : String(error);
    ctx.report({
      file: rel,
      line: 0,
      column: 0,
      message: `UNPARSEABLE LEDGER — ${detail}. A debt ledger that cannot be parsed must never report zero rows: the parser is tooling/src/_shared/ratchet-rows.ts`,
    });
  }
  return rows;
}

export const gate: GateDescriptor = {
  name: "ratchet-row-integrity",
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "whole-project", // the corpus is every committed ledger, discovered from disk
  message: MESSAGE,
  fix: FIX,
  fsBacked: true, // the units are JSON files on disk, not ts-morph sources
  run: (ctx) => {
    const ledgers = discoverBaselineFiles(ctx.root);
    if (ledgers.length === 0) {
      if (fileLoaded(ctx, REAL_TREE_ANCHOR) || existsSync(join(ctx.root, REAL_TREE_ANCHOR))) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_MESSAGE });
      }
      return;
    }
    let rows = 0;
    for (const rel of ledgers) {
      rows += judgeLedger(ctx, rel);
    }
    ctx.scan({ unit: "ledger row", scanned: rows, candidates: rows });
  },
  mustFlag: [
    {
      files: {
        "tooling/src/verify/gates/__probe.baseline.json":
          '{\n  "subject::a": { "count": 2, "ratified": 2, "why": "ruled", "cite": ["packages/client/src/gone.tsx"] }\n}\n',
      },
      expect: { count: 1, messageIncludes: "STALE WHY" },
      why: "THE FOUNDING SHAPE — a RATIFIED row citing a site that is not on the tree: the ratification outlived what justified it (#569's stale-why arm)",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.baseline.json": '{\n  "subject::a": { "count": 2, "ratified": 2 }\n}\n',
      },
      expect: { count: 2 },
      why: "a permanent admission with NO `why` and NO `cite` — two findings, because a permit that names neither its ruling nor its site is parked debt in a permit's clothing",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.baseline.json":
          '{\n  "subject::a": { "count": 1, "ratified": 3, "why": "w", "cite": ["tooling/src/verify/gates/__probe.baseline.json"] }\n}\n',
      },
      expect: { count: 1, messageIncludes: "UNPARSEABLE LEDGER" },
      why: "`ratified` exceeding `count` — the partition is part of the budget, never beside it; an unparseable ledger REDs rather than reading as zero rows",
    },
  ],
  mustPass: [
    {
      files: { "tooling/src/verify/gates/__probe.baseline.json": '{\n  "subject::a": 3\n}\n' },
      why: "THE DEFAULT SPELLING — a bare count is class DEBT, which owes no why and no cite: burnable debt is the thing this classification does NOT ask anyone to justify",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.baseline.json":
          '{\n  "subject::a": { "count": 2, "ratified": 2, "why": "ruled in #568", "cite": ["tooling/src/verify/gates/__probe.baseline.json"] }\n}\n',
      },
      why: "a RATIFIED row whose why is written and whose cite resolves on the tree — the honoured promise",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.baseline.json":
          '{\n  "subject::a": { "count": 4, "ratified": 1, "why": "one marker is ruled", "cite": ["tooling/src/verify/gates/__probe.baseline.json"] }\n}\n',
      },
      why: "DECLARED LIMIT — a MIXED row (part ruled, part burnable) is legitimate and passes: the per-file ledgers really do carry both classes in one row",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.baseline.json": '{\n  "note": "the swept tree",\n  "entries": { "packages/kit/src/x.ts::thing": "undecided" }\n}\n',
      },
      why: "DECLARED LIMIT — the entries-map shape (the orphan ratchet's envelope) parses as one DEBT row carrying its reason; it can never be ratified, which is correct for an UNDECIDED sweep",
    },
  ],
};
