// Gate: rpg-bus-coverage (ledger D50 twin; @orb/contracts/rpg) — the `RpgBusEvent` emit-coverage RATCHET
// for the per-chat rpg SSE bus, the third twin of `bus-coverage.ts` (D50) / `user-bus-coverage.ts`. The
// union is compile-exhaustive on the CONSUMER side (the client's `EVENT_INVALIDATIONS` mapped Record in
// `features/rpg/hooks/use-rpg-stream.ts` is total over `RpgBusEvent["type"]`), but nothing checked the
// PRODUCER side — a member can be declared, listed in the `RPG_BUS_EVENT_TYPES` belt, and never emitted
// (silently dead wire; the belt's `satisfies readonly RpgBusEvent["type"][]` only proves each LISTED member
// is a real type, NOT that every member is emitted). Every `RPG_BUS_EVENT_TYPES` element must have a
// server-side emit site (a verb's `ctx.emitBus`) OR a cited DEFERRED entry. DEFERRED is a self-cleaning
// ratchet (both directions). The reconcile is shared with the chat/user twins
// (scripts/check/bus-coverage-lib.ts) — this file is the rpg SPEC + its self-proof. The rpg belt is an
// ARRAY literal (`keyShape: "array"`), not the chat/user object-literal `satisfies Record<X["type"], true>`.
import type { BusCoverageSpec } from "../bus-coverage-lib.ts";
import { reconcileBusCoverage } from "../bus-coverage-lib.ts";
import type { GateDescriptor } from "../contract.ts";

const MISSING_MESSAGE_PREFIX =
  "RpgBusEvent member has NO server emit site and no DEFERRED entry — a declared-never-emitted rpg-bus member is silently dead wire (a subscriber never re-reads the canon it changed; D38). Wire the verb's `ctx.emitBus` or add a cited DEFERRED entry in rpg-bus-coverage.ts (see @orb/contracts/rpg RPG_BUS_EVENT_TYPES): ";
const STALE_MESSAGE_PREFIX =
  "DEFERRED rpg-bus member now HAS an emit site — delete its stale allowlist entry in rpg-bus-coverage.ts (see @orb/contracts/rpg): ";

/** Declared-not-emitted members, each with its tracked citation. Delete an entry the moment its emit site
 *  lands (the gate flags a stale entry). EMPTY: every `RpgBusEvent` member has a server emit site
 *  (`ctx.emitBus` across `domain/rpg/verbs/`). A future declared-not-yet-emitted member re-populates this. */
const SPEC: BusCoverageSpec = {
  contractsFile: /\/packages\/contracts\/src\/rpg\/index\.ts$/u,
  typesConst: "RPG_BUS_EVENT_TYPES",
  keyShape: "array",
  reportFile: "packages/contracts/src/rpg/index.ts",
  deferred: {},
  missingPrefix: MISSING_MESSAGE_PREFIX,
  stalePrefix: STALE_MESSAGE_PREFIX,
};

export const gate: GateDescriptor = {
  name: "rpg-bus-coverage",
  docRow: "ledger D50 twin (Core-Laws-and-Precedents.md §7 D50; @orb/contracts/rpg)",
  status: "active",
  scopeSafety: "whole-project",
  message: MISSING_MESSAGE_PREFIX,
  fix: "wire the verb's ctx.emitBus for the member, or add a cited DEFERRED entry in rpg-bus-coverage.ts.",
  run: (ctx) => {
    for (const v of reconcileBusCoverage(ctx.project, SPEC)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/contracts/src/rpg/index.ts":
          'export type RpgBusEvent = { type: "neverEmitted" };\nexport const RPG_BUS_EVENT_TYPES = ["neverEmitted"] as const satisfies readonly RpgBusEvent["type"][];\n',
        "packages/server/src/domain/rpg/x.ts": 'export const q = "somethingElse";\n',
      },
      expect: { messageIncludes: "NO server emit site" },
      why: "an RPG_BUS_EVENT_TYPES array element with no server emit site + no DEFERRED entry — silent dead wire (the array-belt shape)",
    },
  ],
  // The DEFERRED/STALE arms are structurally identical to the chat/user twins (shared reconcile). With an
  // empty rpg DEFERRED map they are LIVE-RUN-COVERED by the `user-bus-coverage` twin's `connectionsChanged`
  // entry (same lib) — the FLOOR-GATE-EXHAUSTIVE-MAP.md accepted-delta rule. Only the pure MISSING (flag)
  // + EMITTED-covered (pass) arms are ported here.
  mustPass: [
    {
      files: {
        "packages/contracts/src/rpg/index.ts":
          'export type RpgBusEvent = { type: "emitted" };\nexport const RPG_BUS_EVENT_TYPES = ["emitted"] as const satisfies readonly RpgBusEvent["type"][];\n',
        "packages/server/src/domain/rpg/x.ts": 'export const q = "emitted";\n',
      },
      why: "the element's discriminator appears as a server emit literal — covered, passes",
    },
  ],
};
