// RpgBusEvent producer coverage: every declared member has a canonical executable server emitter.
// The shared bus fact owns union/member/call identity and refuses incomplete derivations.
import type { RpgBusEvent } from "@orb/contracts/rpg";
import { busByUnion, recordReadyBusFact } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { createBusFactQuery } from "../lib/bus-fact.ts";

const UNION = { path: "packages/contracts/src/rpg/bus.ts", exportName: "RpgBusEvent" } as const;
const MESSAGE =
  "RpgBusEvent member has NO server emit site — a declared-never-emitted bus member is silently dead wire (D50; Core-Laws-and-Precedents.md §7 D50).";

export const gate = defineGate({
  id: "rpg-bus-coverage",
  family: "bus-fact",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  resources: [],
  message: MESSAGE,
  fix: "wire the canonical injected EmitRpgEvent operation for the member.",
  create: (ctx) => {
    const query = createBusFactQuery<RpgBusEvent>(ctx);
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
        "packages/contracts/src/rpg/bus.ts":
          'export type RpgBusEvent = { type: "neverEmitted" };\nexport const RPG_BUS_EVENT_TYPES = ["neverEmitted"] as const satisfies readonly RpgBusEvent["type"][];\n',
        "packages/server/src/domain/rpg/x.ts": 'export const decoy = "neverEmitted";\n',
      },
      expect: { count: 1, messageIncludes: "neverEmitted" },
      why: "an arbitrary matching literal is not the injected RPG emitter",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/rpg/bus.ts":
          'export type RpgBusEvent = { type: "freshEmit" };\nexport const RPG_BUS_EVENT_TYPES = ["freshEmit"] as const satisfies readonly RpgBusEvent["type"][];\n',
        "packages/server/src/domain/rpg/x.ts":
          'import type { RpgBusEvent } from "../../../../contracts/src/rpg/bus.ts";\nexport function create(ctx: { emitBus: (event: RpgBusEvent) => void }): void { ctx.emitBus({ type: "freshEmit" }); }\n',
      },
      why: "the member is carried by the canonical injected RPG emitter",
    },
  ],
});
