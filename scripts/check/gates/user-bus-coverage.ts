// Gate: user-bus-coverage (PD user-bus lane) — the `UserBusEvent` emit-coverage RATCHET, the twin of
// `bus-coverage.ts` (D50) for the per-USER bus: the union is compile-exhaustive on the CONSUMER side but
// nothing machine-checks the PRODUCER side — a member can be declared, mapped on the client, and never
// emitted (silently dead wire). Every `USER_BUS_EVENT_TYPES` discriminator must have a server-side emit
// site OR a cited DEFERRED entry. DEFERRED is a self-cleaning ratchet (both directions). The reconcile is
// shared with the chat/rpg bus twins (scripts/check/bus-coverage-lib.ts) — this file is the user SPEC + proof.
import type { BusCoverageSpec } from "../bus-coverage-lib.ts";
import { reconcileBusCoverage } from "../bus-coverage-lib.ts";
import type { GateDescriptor } from "../contract.ts";

const MISSING_MESSAGE_PREFIX =
  "UserBusEvent member has NO server emit site and no DEFERRED entry — a declared-never-emitted user-bus member is silently dead wire (a second device's write never reaches this device). Wire the verb's `emitUserEvent` or add a cited DEFERRED entry in user-bus-coverage.ts (see @orb/contracts/user-bus + packages/client/src/data/invalidation.ts): ";
const STALE_MESSAGE_PREFIX =
  "DEFERRED user-bus member now HAS an emit site — delete its stale allowlist entry in user-bus-coverage.ts (see @orb/contracts/user-bus): ";

/** Declared-not-emitted members, each with its tracked citation. Delete an entry the moment its emit site
 *  lands (the gate flags a stale entry — the STALE arm). */
const SPEC: BusCoverageSpec = {
  contractsFile: /\/packages\/contracts\/src\/user-bus\/index\.ts$/u,
  typesConst: "USER_BUS_EVENT_TYPES",
  keyShape: "object",
  reportFile: "packages/contracts/src/user-bus/index.ts",
  deferred: {
    connectionsChanged:
      "no per-user connection store exists — connection config lives in USER SETTINGS (settingsChanged); the model catalog is admin/global (refreshCatalog). Wire the emit when a per-user connection entity lands. See @orb/contracts/user-bus.",
  },
  missingPrefix: MISSING_MESSAGE_PREFIX,
  stalePrefix: STALE_MESSAGE_PREFIX,
};

export const gate: GateDescriptor = {
  name: "user-bus-coverage",
  docRow: "PD user-bus lane (ledger D50 twin; @orb/contracts/user-bus)",
  status: "active",
  scopeSafety: "whole-project",
  message: MISSING_MESSAGE_PREFIX,
  fix: "wire the verb's emitUserEvent for the member, or add a cited DEFERRED entry in user-bus-coverage.ts.",
  run: (ctx) => {
    for (const v of reconcileBusCoverage(ctx.project, SPEC)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/contracts/src/user-bus/index.ts": 'export const USER_BUS_EVENT_TYPES = { neverEmitted: "neverEmitted" } as const;\n',
        "packages/server/src/domain/settings/x.ts": 'export const q = "somethingElse";\n',
      },
      expect: { messageIncludes: "NO server emit site" },
      why: "a USER_BUS_EVENT_TYPES member with no server emit site + no DEFERRED entry — a dead cross-device wire",
    },
  ],
  // The STALE arm (a DEFERRED member that GAINS an emit site — `emitted && deferred`) is LIVE-RUN-COVERED:
  // reproducing it synthetically would brittle-couple a fixture to today's DEFERRED map contents; the
  // accepted-delta rule applies (see FLOOR-GATE-EXHAUSTIVE-MAP.md). Only the pure MISSING (flag) and
  // EMITTED/DEFERRED-covered (pass) arms are ported as examples.
  mustPass: [
    {
      files: {
        "packages/contracts/src/user-bus/index.ts": 'export const USER_BUS_EVENT_TYPES = { emitted: "emitted" } as const;\n',
        "packages/server/src/domain/settings/x.ts": 'export const q = "emitted";\n',
      },
      why: "the member's discriminator appears as a server emit literal — covered, passes",
    },
    {
      files: {
        "packages/contracts/src/user-bus/index.ts": 'export const USER_BUS_EVENT_TYPES = { connectionsChanged: "connectionsChanged" } as const;\n',
        "packages/server/src/domain/settings/x.ts": 'export const q = "somethingElse";\n',
      },
      why: "a member with NO emit site but a DEFERRED entry present (connectionsChanged) — the deferred-covers-it branch, passes",
    },
  ],
};
