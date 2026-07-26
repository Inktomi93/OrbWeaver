// Gate: rpg-bus-coverage (ledger D50 twin; client-architecture-lockdown.md §13 law 4) — the RpgBusEvent
// emit-coverage ratchet. The union is compile-exhaustive on the CONSUMER side (the client `EVENT_INVALIDATIONS`
// total map), but nothing checks the PRODUCER side — a member can be declared, belt-listed, and never emitted
// (silently dead wire). Every discriminator in `RPG_BUS_EVENT_TYPES` must have a server-side emit site OR a
// cited DEFERRED entry. DEFERRED is a ratchet, self-cleaning in both directions (a lost emit site on a live
// member, or a gained one on a deferred member, is RED). The reconcile is shared with the chat/user twins
// (scripts/check/bus-coverage-lib.ts) — this file is the rpg SPEC + its self-proof. The belt is the ARRAY
// shape (`[…] as const satisfies readonly RpgBusEvent["type"][]`), so `keyShape: "array"`.
//
// W1c-a landed the union + belt + this gate WITH every member DEFERRED; W1c-b wired every emit site (a verb/
// flush calling the injected `EmitRpgEvent` op), so the DEFERRED map is now EMPTY — all five members are
// EMITTED. Like the chat/`bus-coverage` twin, an all-emitted gate has NO fixturable arm (STALE needs a deferred
// member; MISSING needs an un-emitted REAL member, which a throwaway `__g_` file cannot add to the single-home
// union), so it joins UNFIXTURABLE_GATES in check-gates.int and its `__g_rpgbus` STALE fixture is deleted. The
// STALE mechanism stays proven by the `user-bus-coverage` twin's still-DEFERRED `connectionsChanged`.
import type { BusCoverageSpec } from "../bus-coverage-lib.ts";
import { reconcileBusCoverage } from "../bus-coverage-lib.ts";
import type { GateDescriptor } from "../contract.ts";

const MISSING_MESSAGE_PREFIX =
  "RpgBusEvent member has NO server emit site and no DEFERRED entry — a declared-never-emitted bus member is silently dead wire (D50 — see Core-Laws-and-Precedents.md §7 D50). Wire the emit or add a cited DEFERRED entry: ";
const STALE_MESSAGE_PREFIX = "DEFERRED rpg-bus member now HAS an emit site — delete its stale allowlist entry in rpg-bus-coverage.ts: ";

/** Declared-not-emitted members, each with its tracked citation. EMPTY as of W1c-b — every member now HAS a
 *  server emit site in `domain/rpg/**`: `gameChanged` (createGame/updateConfig), `snapshotPatched` (the flush +
 *  editSnapshot/quest verbs/restoreCheckpoint), `sheetChanged` (patchSheet), `questChanged` (upsertQuest/
 *  deleteQuest), `journalChanged` (addJournalEntry-family + the staged journal flush). A member re-added here
 *  while its emit still lives is STALE-red; an emit site LOST on a live member is MISSING-red. */
const SPEC: BusCoverageSpec = {
  contractsFile: /\/packages\/contracts\/src\/rpg\/bus\.ts$/u,
  typesConst: "RPG_BUS_EVENT_TYPES",
  keyShape: "array",
  reportFile: "packages/contracts/src/rpg/bus.ts",
  deferred: {},
  missingPrefix: MISSING_MESSAGE_PREFIX,
  stalePrefix: STALE_MESSAGE_PREFIX,
};

export const gate: GateDescriptor = {
  name: "rpg-bus-coverage",
  docRow: "ledger D50 twin (Core-Laws-and-Precedents.md §7 D50) · client-architecture-lockdown.md §13 law 4",
  status: "active",
  scopeSafety: "whole-project",
  message: MISSING_MESSAGE_PREFIX,
  fix: "wire the server emit site (publishRpgEvent via the injected EmitRpgEvent op) for the bus member, or add a cited DEFERRED entry in rpg-bus-coverage.ts.",
  run: (ctx) => {
    for (const v of reconcileBusCoverage(ctx.project, SPEC)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  // With the DEFERRED map now EMPTY (every member emitted, W1c-b), the STALE (flag) + deferred-covered (pass)
  // arms are RETIRED — a synthetic member can only exercise the deferred branch if it keys into the REAL map,
  // and there is no deferred member to key on. Those two branches stay LIVE-RUN-COVERED by the `user-bus-coverage`
  // twin (its `connectionsChanged` entry — same reconcile, shared lib). Only the pure MISSING (flag) +
  // EMITTED-covered (pass) arms are ported here (the `bus-coverage` twin's exact posture).
  mustFlag: [
    {
      // A member with neither an emit literal nor a DEFERRED entry — the pure MISSING arm (the array belt shape).
      files: {
        "packages/contracts/src/rpg/bus.ts": 'export const RPG_BUS_EVENT_TYPES = ["neverEmitted"] as const satisfies readonly never[];\n',
        "packages/server/src/domain/rpg/x.ts": 'export const q = "somethingElse";\n',
      },
      expect: { messageIncludes: "NO server emit site" },
      why: "an RPG_BUS_EVENT_TYPES member with no server emit site + no DEFERRED entry — silent dead wire",
    },
  ],
  mustPass: [
    {
      // A member with a real emit literal AND not in the (empty) DEFERRED map — the emitted-covered (pass) arm.
      files: {
        "packages/contracts/src/rpg/bus.ts": 'export const RPG_BUS_EVENT_TYPES = ["freshEmit"] as const satisfies readonly never[];\n',
        "packages/server/src/domain/rpg/x.ts": 'export const q = "freshEmit";\n',
      },
      why: "the member's discriminator appears as a server emit literal and is not deferred — covered, passes",
    },
  ],
};
