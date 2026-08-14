// Gate: automation-bus-coverage (ledger D50 twin; client-architecture-lockdown.md §13 law 4) — the
// AutomationBusEvent emit-coverage ratchet, the fourth SPEC on the shared reconcile
// (scripts/check/bus-coverage-lib.ts). Minted 2026-08-14 with the G-B belt-existence arm.
//
// WHY IT EXISTS, measured not argued (event-bus coverage survey §2.3): the automation bus was built AFTER
// the three ratchets and shipped WITHOUT a `*_EVENT_TYPES` belt, so `bus-definition-belts` never found it
// and no coverage spec could. `rulesChanged` was therefore declared, room-filtered, and emitted NOWHERE —
// D50's exact "declared, replay-guarded, never emitted" class, invisible to every gate on the tree. The
// emit landed in bus wave 2 (the five rule-CRUD verbs through the injected `notify` sink); this ratchet is
// what keeps it landed.
//
// SCOPE SUBTLETY, worth stating because it looks like a hole: the shared reconcile's `EMIT_SCOPE` is
// `server/src/{domain,transport}` and deliberately EXCLUDES `entry/compose` (compose is wiring, not a
// producer home). `quickReplySurfaced` has a plugin-side emit at `entry/compose/automation-plugin.ts:277`
// that the corpus cannot see — the member stays covered by its RULE-side emit
// (`domain/automation/engine/arm-executors.ts`), which is in scope. Widening EMIT_SCOPE to entry would
// weaken every twin; documenting the asymmetry here is the correct trade.
import type { BusCoverageSpec } from "../bus-coverage-lib.ts";
import { reconcileBusCoverage } from "../bus-coverage-lib.ts";
import type { GateDescriptor } from "../contract.ts";

const MISSING_MESSAGE_PREFIX =
  "AutomationBusEvent member has NO server emit site and no DEFERRED entry — a declared-never-emitted bus member is silently dead wire (D50 — see Core-Laws-and-Precedents.md §7 D50). This is the exact state `rulesChanged` shipped in. Wire the emit or add a cited DEFERRED entry: ";
const STALE_MESSAGE_PREFIX =
  "DEFERRED automation-bus member now HAS an emit site — delete its stale allowlist entry in scripts/check/gates/automation-bus-coverage.ts: ";

/** Declared-not-emitted members, each with its citation. EMPTY at mint — all five emit in `domain/automation`
 *  (`engine/dispatch.ts` ruleFired/ruleErrored/ruleAutoDisabled · `engine/arm-executors.ts`
 *  quickReplySurfaced · the five rule-CRUD verbs rulesChanged). A member re-added here while its emit lives
 *  is STALE-red; an emit LOST on a live member is MISSING-red. */
const SPEC: BusCoverageSpec = {
  contractsFile: /\/packages\/contracts\/src\/automation\/index\.ts$/u,
  typesConst: "AUTOMATION_BUS_EVENT_TYPES",
  keyShape: "object",
  reportFile: "packages/contracts/src/automation/index.ts",
  deferred: {},
  missingPrefix: MISSING_MESSAGE_PREFIX,
  stalePrefix: STALE_MESSAGE_PREFIX,
};

export const gate: GateDescriptor = {
  name: "automation-bus-coverage",
  docRow: "ledger D50 twin (Core-Laws-and-Precedents.md §7 D50) · client-architecture-lockdown.md §13 law 4",
  status: "active",
  scopeSafety: "whole-project",
  message: MISSING_MESSAGE_PREFIX,
  fix: "wire the emit through the injected `notify` sink in packages/server/src/domain/automation/, or add a cited DEFERRED entry in scripts/check/gates/automation-bus-coverage.ts.",
  run: (ctx) => {
    for (const v of reconcileBusCoverage(ctx.project, SPEC)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/contracts/src/automation/index.ts": "export const AUTOMATION_BUS_EVENT_TYPES = { rulesChanged: true } satisfies Record<never, true>;\n",
        "packages/server/src/domain/automation/engine/dispatch.ts": 'export const q = "ruleFired";\n',
      },
      expect: { messageIncludes: "NO server emit site" },
      why: "`rulesChanged` declared with no emit literal anywhere in the domain — the survey's founding instance, reproduced: the member the tree carried dead for the whole life of the bus",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/contracts/src/automation/index.ts": "export const AUTOMATION_BUS_EVENT_TYPES = { rulesChanged: true } satisfies Record<never, true>;\n",
        "packages/server/src/domain/automation/verbs/create-rule.ts": 'export const q = "rulesChanged";\n',
      },
      why: "the member's discriminator appears as an emit literal in the domain scope — covered, passes. This is the post-wave-2 state of the real tree",
    },
    {
      files: {
        "packages/contracts/src/automation/index.ts": "export const AUTOMATION_BUS_EVENT_TYPES = { quickReplySurfaced: true } satisfies Record<never, true>;\n",
        "packages/server/src/entry/compose/automation-plugin.ts": 'export const q = "quickReplySurfaced";\n',
        "packages/server/src/domain/automation/engine/arm-executors.ts": 'export const q = "quickReplySurfaced";\n',
      },
      why: "DECLARED LIMIT pinned: the plugin-side emit under `entry/compose` is OUTSIDE the shared EMIT_SCOPE and contributes nothing — coverage here rests entirely on the domain-scope rule-side emit, exactly as the header states",
    },
  ],
};
