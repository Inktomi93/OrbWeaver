// Policy: ratchet-row-integrity (#569) — every committed `*.baseline.json` under the gate corpus keeps an
// honest DEBT-vs-RATIFIED partition. Malformed semantic rows, ratified rows without a why/cite, and cites to
// absent tracked paths are findings. The final policy receives the discovered strict-JSON ledger corpus and
// tracked repository membership through ResourceHost; zero ledgers, malformed JSON, and an unavailable Git
// index refuse during acquisition instead of becoming a clean zero.
//
// FAMILY `ratchet-row-integrity` is a singleton over the shared `_shared/ratchet-rows.ts` parser. That parser
// now accepts already-acquired JSON and an injected cite-membership predicate, so policy code owns neither a
// filesystem walk nor a checkout root. `hard`/`error` preserves the legacy gate's unconditional authority.
//
// POPULATION PORT: the legacy whole-project descriptor received every harness source but read none; its real
// subjects were discovered ledgers and cited path existence. The final source population is explicitly none
// and its two resource declarations are the complete evidence plane. All seven legacy behavior rows survive;
// the old real-tree zero-ledger tripwire is strengthened into the ledger declaration's mustRefuse proof.
import { classOf, parseRatchetLedger, RatchetRowError, rowProblemsFor } from "../../_shared/ratchet-rows.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { LedgerJsonDocument } from "../contract/resource-document.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MESSAGE =
  "a ratchet baseline row's DEBT-vs-RATIFIED classification is broken (#569): a row the shared reader cannot " +
  "parse, a RATIFIED portion with no `why`, or a `cite` naming a site that is no longer tracked. A " +
  "ratification is a promise that a recorded ruling made this admission permanent; when its cited site is " +
  "gone, the row is back to being debt. The row rules live in tooling/src/_shared/ratchet-rows.ts";
const FIX =
  "Fix the row in its ledger: re-cite the ruling at its new path, write the missing `why`, or drop `ratified` " +
  "back to 0 so the budget rejoins the burn-down queue (`pnpm debt` lists both halves).";

function judgeLedger(ctx: GatePolicyContext, document: LedgerJsonDocument, tracked: ReadonlySet<string>): void {
  try {
    const ledger = parseRatchetLedger(document.path, document.value);
    for (const row of ledger.rows) {
      for (const problem of rowProblemsFor(row, (path) => tracked.has(path))) {
        ctx.report.file(document.path, {
          line: 1,
          column: 1,
          token: row.subject,
          message: `${classOf(row)} row "${row.subject}": ${problem} — the row shape and its class rules live in tooling/src/_shared/ratchet-rows.ts`,
          fix: FIX,
        });
      }
    }
  } catch (error) {
    const detail = error instanceof RatchetRowError ? error.message : String(error);
    ctx.report.file(document.path, {
      line: 1,
      column: 1,
      message: `UNPARSEABLE LEDGER — ${detail}. A debt ledger that cannot be parsed must never report zero rows`,
      fix: FIX,
    });
  }
}

export const gate = defineGate({
  id: "ratchet-row-integrity",
  family: "ratchet-row-integrity",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the discovered ratchet ledger and tracked path index are resource facts; no compiler source is read" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "ledger", id: "ratchet-baselines" }, { kind: "tracked-files" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const ledger = readyResourceValue(ctx.resources.ledger("ratchet-baselines"));
      const tracked = new Set(readyResourceValue(ctx.resources.trackedFiles()).repoPaths);
      for (const document of ledger.documents) {
        judgeLedger(ctx, document, tracked);
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "tooling/src/verify/gates/__probe.baseline.json":
          '{\n  "subject::a": { "count": 2, "ratified": 2, "why": "ruled", "cite": ["packages/client/src/gone.tsx"] }\n}\n',
      },
      expect: { count: 1, messageIncludes: "STALE WHY" },
      why: "the founding shape — a ratified row citing a path absent from the tracked tree",
    },
    {
      mode: "resource",
      files: { "tooling/src/verify/gates/__probe.baseline.json": '{\n  "subject::a": { "count": 2, "ratified": 2 }\n}\n' },
      expect: { count: 2, token: "subject::a" },
      why: "a permanent admission with neither why nor cite produces both integrity findings",
    },
    {
      mode: "resource",
      files: {
        "tooling/src/verify/gates/__probe.baseline.json":
          '{\n  "subject::a": { "count": 1, "ratified": 3, "why": "w", "cite": ["tooling/src/verify/gates/__probe.baseline.json"] }\n}\n',
      },
      expect: { count: 1, messageIncludes: "UNPARSEABLE LEDGER" },
      why: "ratified exceeding count makes the semantic row unparseable and reports rather than reading zero",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { "tooling/src/verify/gates/__probe.baseline.json": '{\n  "subject::a": 3\n}\n' },
      why: "a bare count is ordinary burnable debt and owes no permanent-ruling evidence",
    },
    {
      mode: "resource",
      files: {
        "tooling/src/verify/gates/__probe.baseline.json":
          '{\n  "subject::a": { "count": 2, "ratified": 2, "why": "ruled in #568", "cite": ["tooling/src/verify/gates/__probe.baseline.json"] }\n}\n',
      },
      why: "a ratified row whose why is written and whose cited tracked file exists",
    },
    {
      mode: "resource",
      files: {
        "tooling/src/verify/gates/__probe.baseline.json":
          '{\n  "subject::a": { "count": 4, "ratified": 1, "why": "one marker is ruled", "cite": ["tooling/src/verify/gates/__probe.baseline.json"] }\n}\n',
      },
      why: "a mixed row may carry both ruled and burnable portions",
    },
    {
      mode: "resource",
      files: {
        "tooling/src/verify/gates/__probe.baseline.json": '{\n  "note": "the swept tree",\n  "entries": { "packages/kit/src/x.ts::thing": "undecided" }\n}\n',
      },
      why: "the entries-map envelope parses as debt rows carrying their undecided reason",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { "tooling/src/verify/gates/anchor.ts": "export const anchor = true;\n" },
      expect: { messageIncludes: "ledger:ratchet-baselines is empty" },
      why: "zero discovered ledgers is a population refusal, never a clean verdict over nothing",
    },
  ],
});
