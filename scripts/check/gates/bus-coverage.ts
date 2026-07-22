// Gate: bus-coverage (ledger D50) — the ChatBusEvent emit-coverage ratchet. The union is compile-
// exhaustive on the CONSUMER side, but nothing checked the PRODUCER side — a member can be declared,
// replay-guarded, reduced, and never emitted (silently dead wire). Every discriminator in
// `CHAT_BUS_EVENT_TYPES` must have a server-side emit site OR a cited DEFERRED entry. DEFERRED is a
// ratchet, self-cleaning in both directions (a lost emit site or a gained one on a deferred member is RED).
// The reconcile is shared with the user/rpg bus twins (scripts/check/bus-coverage-lib.ts) — this file is
// the chat SPEC + its self-proof.
import type { BusCoverageSpec } from "../bus-coverage-lib.ts";
import { reconcileBusCoverage } from "../bus-coverage-lib.ts";
import type { GateDescriptor } from "../contract.ts";

const MISSING_MESSAGE_PREFIX =
  "ChatBusEvent member has NO server emit site and no DEFERRED entry — a declared-never-emitted bus member is silently dead wire (D50 — see Core-Laws-and-Precedents.md §7 D50). Wire the emit or add a cited DEFERRED entry: ";
const STALE_MESSAGE_PREFIX = "DEFERRED bus member now HAS an emit site — delete its stale allowlist entry in bus-coverage.ts: ";

/** Declared-not-emitted members, each with its tracked citation. Delete an entry the moment its emit site
 *  lands (the gate flags a stale entry). EMPTY: every `ChatBusEvent` member now has a server emit site —
 *  the last deferral (`expression`) closed when the E3 classify emit landed (expressions-design/02 §4).
 *  A future declared-not-yet-emitted member re-populates this; until then the MISSING arm is the only live
 *  branch, and the DEFERRED/STALE arms are demonstrated by the `user-bus-coverage` twin (its
 *  `connectionsChanged` entry — same reconcile, shared lib; the FLOOR-GATE-EXHAUSTIVE-MAP.md accepted-delta rule). */
const SPEC: BusCoverageSpec = {
  contractsFile: /\/packages\/contracts\/src\/chat\/index\.ts$/u,
  typesConst: "CHAT_BUS_EVENT_TYPES",
  keyShape: "object",
  reportFile: "packages/contracts/src/chat/index.ts",
  deferred: {},
  missingPrefix: MISSING_MESSAGE_PREFIX,
  stalePrefix: STALE_MESSAGE_PREFIX,
};

export const gate: GateDescriptor = {
  name: "bus-coverage",
  docRow: "ledger D50 (Core-Laws-and-Precedents.md §7 D50)",
  status: "active",
  scopeSafety: "whole-project",
  message: MISSING_MESSAGE_PREFIX,
  fix: "wire the server emit site for the bus member, or add a cited DEFERRED entry in bus-coverage.ts.",
  run: (ctx) => {
    for (const v of reconcileBusCoverage(ctx.project, SPEC)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/contracts/src/chat/index.ts": 'export const CHAT_BUS_EVENT_TYPES = { neverEmitted: "neverEmitted" } as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "somethingElse";\n',
      },
      expect: { messageIncludes: "NO server emit site" },
      why: "a CHAT_BUS_EVENT_TYPES member with no server emit site + no DEFERRED entry — silent dead wire",
    },
  ],
  // The DEFERRED-covered mustPass example is RETIRED with the now-empty DEFERRED map: a synthetic member can
  // only exercise the deferred branch if it keys into the REAL map, and there is no longer a deferred member
  // to key on. The deferred-covers-it (pass) AND the STALE (flag) branches are LIVE-RUN-COVERED by the
  // structural `user-bus-coverage` twin (its `connectionsChanged` entry) — the FLOOR-GATE-EXHAUSTIVE-MAP.md
  // accepted-delta rule. Only the pure MISSING (flag) + EMITTED-covered (pass) arms are ported here.
  mustPass: [
    {
      files: {
        "packages/contracts/src/chat/index.ts": 'export const CHAT_BUS_EVENT_TYPES = { emitted: "emitted" } as const;\n',
        "packages/server/src/domain/chat/x.ts": 'export const q = "emitted";\n',
      },
      why: "the member's discriminator appears as a server emit literal — covered, passes",
    },
  ],
};
