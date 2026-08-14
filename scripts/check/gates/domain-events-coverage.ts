// Gate: domain-events-coverage (ledger D50 twin; event-bus coverage survey §3.3) — the DomainEvent
// emit-coverage ratchet, the fifth SPEC on the shared reconcile (scripts/check/bus-coverage-lib.ts).
// Minted 2026-08-14 with the G-B belt-existence arm, when `DOMAIN_EVENT_TYPES` gained its
// `satisfies readonly DomainEvent["type"][]`.
//
// This bus is SERVER-INTERNAL: in-process, fire-and-forget, error-isolated, and it never leaves the
// process (entry/compose/event-bus.ts). Its consumer belt is therefore a server-side exhaustive dispatch
// (`assertNeverEvent` at entry/compose/search-discovery.ts), NOT a client total map — the declared
// SERVER_INTERNAL reach lane in bus-definition-belts.ts. The producer side is what THIS gate holds: both
// members emit today (`character.updated` from the character verbs, `asset.created` from assets/verbs/store),
// so the ratchet's real job is the NEXT member — the union's own header plans `crew.*`/`rpg.*` grafts back
// onto it, and a grafted member with no emit would otherwise be exactly the dead wire D50 names.
import type { BusCoverageSpec } from "../bus-coverage-lib.ts";
import { reconcileBusCoverage } from "../bus-coverage-lib.ts";
import type { GateDescriptor } from "../contract.ts";

const MISSING_MESSAGE_PREFIX =
  "DomainEvent member has NO server emit site and no DEFERRED entry — a declared-never-emitted bus member is silently dead wire (D50 — see Core-Laws-and-Precedents.md §7 D50). Wire the `ctx.emit` in the owning domain or add a cited DEFERRED entry: ";
const STALE_MESSAGE_PREFIX =
  "DEFERRED domain-event member now HAS an emit site — delete its stale allowlist entry in scripts/check/gates/domain-events-coverage.ts: ";

/** Declared-not-emitted members, each with its citation. EMPTY at mint — `character.updated` emits from
 *  character create/update/duplicate/restore, `asset.created` from `assets/verbs/store.ts`. */
const SPEC: BusCoverageSpec = {
  contractsFile: /\/packages\/contracts\/src\/events\/index\.ts$/u,
  typesConst: "DOMAIN_EVENT_TYPES",
  keyShape: "array",
  reportFile: "packages/contracts/src/events/index.ts",
  deferred: {},
  missingPrefix: MISSING_MESSAGE_PREFIX,
  stalePrefix: STALE_MESSAGE_PREFIX,
};

export const gate: GateDescriptor = {
  name: "domain-events-coverage",
  docRow: "ledger D50 twin (Core-Laws-and-Precedents.md §7 D50) · client-architecture-lockdown.md §13 law 4",
  status: "active",
  scopeSafety: "whole-project",
  message: MISSING_MESSAGE_PREFIX,
  fix: "emit the member through the injected `EmitDomainEvent` op in its OWNING domain (never by reaching the bus directly — packages/contracts/src/events/index.ts states the injection model), or add a cited DEFERRED entry in scripts/check/gates/domain-events-coverage.ts.",
  run: (ctx) => {
    for (const v of reconcileBusCoverage(ctx.project, SPEC)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/contracts/src/events/index.ts": 'export const DOMAIN_EVENT_TYPES = ["crew.updated"] as const satisfies readonly never[];\n',
        "packages/server/src/domain/character/verbs/update.ts": 'export const q = "character.updated";\n',
      },
      expect: { messageIncludes: "NO server emit site" },
      why: "the GRAFT case this ratchet is actually for — a member added back onto the union (the header plans `crew.*`) with no emit wired is dead wire the type system happily accepts",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/contracts/src/events/index.ts": 'export const DOMAIN_EVENT_TYPES = ["asset.created"] as const satisfies readonly never[];\n',
        "packages/server/src/domain/assets/verbs/store.ts": 'export const q = "asset.created";\n',
      },
      why: "the live state — a DOTTED discriminator emits as a plain literal and the space-delimited corpus test matches it exactly; this row also pins that the dot is not treated as a path separator anywhere in the reconcile",
    },
  ],
};
