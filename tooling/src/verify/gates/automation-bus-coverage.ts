// AutomationBusEvent producer coverage: every declared member has a canonical executable server emitter.
// The shared bus fact owns union/member/call identity and refuses incomplete derivations.
import type { AutomationBusEvent } from "@orb/contracts/automation";
import { busByUnion, recordReadyBusFact } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { createBusFactQuery } from "../lib/bus-fact.ts";

const UNION = { path: "packages/contracts/src/automation/index.ts", exportName: "AutomationBusEvent" } as const;
const MESSAGE =
  "AutomationBusEvent member has NO server emit site — a declared-never-emitted bus member is silently dead wire (D50; Core-Laws-and-Precedents.md §7 D50).";

export const gate = defineGate({
  id: "automation-bus-coverage",
  family: "bus-fact",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  message: MESSAGE,
  fix: "wire the canonical automation notify operation for the member.",
  create: (ctx) => {
    const query = createBusFactQuery<AutomationBusEvent>(ctx);
    return {
      visitors: query.visitors,
      evaluate: () => {
        const fact = query.finish();
        recordReadyBusFact(ctx, fact);
        const bus = busByUnion(fact, UNION);
        if (bus === undefined) {
          throw new Error(`expected bus union is missing: ${UNION.path}#${UNION.exportName}`);
        }
        const emitted = new Set(bus.emitters.map(({ member }) => member.name));
        for (const member of bus.declaredMembers) {
          if (!emitted.has(member.name)) {
            ctx.report.node(member.anchor.node, { message: `${MESSAGE} Member: ${member.name}` });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/automation/index.ts":
          'export type AutomationBusEvent = { type: "rulesChanged" };\nexport const AUTOMATION_BUS_EVENT_TYPES = { rulesChanged: true } satisfies Record<AutomationBusEvent["type"], true>;\n',
        "packages/server/src/domain/automation/engine/dispatch.ts": 'export const decoy = "rulesChanged";\n',
      },
      expect: { count: 1, messageIncludes: "rulesChanged" },
      why: "an arbitrary matching literal is not the automation notify operation",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/automation/index.ts":
          'export type AutomationBusEvent = { type: "quickReplySurfaced" };\nexport const AUTOMATION_BUS_EVENT_TYPES = { quickReplySurfaced: true } satisfies Record<AutomationBusEvent["type"], true>;\n',
        "packages/server/src/entry/compose/automation-plugin.ts":
          'import type { AutomationBusEvent } from "../../../../contracts/src/automation/index.ts";\nexport function publish(pluginNotify: (event: AutomationBusEvent) => void): void { pluginNotify({ type: "quickReplySurfaced" }); }\n',
      },
      expect: { count: 1 },
      why: "a compose-only automation publisher is wiring, not a domain/transport producer",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/automation/index.ts":
          'export type AutomationBusEvent = { type: "rulesChanged" };\nexport const AUTOMATION_BUS_EVENT_TYPES = { rulesChanged: true } satisfies Record<AutomationBusEvent["type"], true>;\n',
        "packages/server/src/domain/automation/verbs/create-rule.ts":
          'import type { AutomationBusEvent } from "../../../../../contracts/src/automation/index.ts";\nexport function create(ctx: { notify: (event: AutomationBusEvent) => void }): void { ctx.notify({ type: "rulesChanged" }); }\n',
      },
      why: "the member is carried by the canonical injected automation notifier",
    },
  ],
});
