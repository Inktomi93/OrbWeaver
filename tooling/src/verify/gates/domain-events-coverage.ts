// DomainEvent producer coverage: every declared member has a canonical executable server emitter.
// The shared bus fact owns union/member/call identity and refuses incomplete derivations.
import type { DomainEvent } from "@orb/contracts/events";
import { busByUnion, recordReadyBusFact } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { createBusFactQuery } from "../lib/bus-fact.ts";

const UNION = { path: "packages/contracts/src/events/index.ts", exportName: "DomainEvent" } as const;
const MESSAGE =
  "DomainEvent member has NO server emit site — a declared-never-emitted bus member is silently dead wire (D50; Core-Laws-and-Precedents.md §7 D50).";

export const gate = defineGate({
  id: "domain-events-coverage",
  family: "bus-fact",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@contracts", "@server"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  resources: [],
  message: MESSAGE,
  fix: "emit the member through the injected EmitDomainEvent operation in its owning domain.",
  create: (ctx) => {
    const query = createBusFactQuery<DomainEvent>(ctx);
    return {
      ...query.hooks,
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
        "packages/contracts/src/events/index.ts":
          'export type DomainEvent = { type: "crew.updated" };\nexport const DOMAIN_EVENT_TYPES = ["crew.updated"] as const satisfies readonly DomainEvent["type"][];\n',
        "packages/server/src/domain/character/verbs/update.ts": 'export const decoy = "crew.updated";\n',
      },
      expect: { count: 1, messageIncludes: "crew.updated" },
      why: "an arbitrary matching literal is not the injected domain-event operation",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/events/index.ts":
          'export type DomainEvent = { type: "asset.created" };\nexport const DOMAIN_EVENT_TYPES = ["asset.created"] as const satisfies readonly DomainEvent["type"][];\n',
        "packages/server/src/domain/assets/verbs/store.ts":
          'import type { DomainEvent } from "../../../../../contracts/src/events/index.ts";\nexport function store(ctx: { emit: (event: DomainEvent) => void }): void { ctx.emit({ type: "asset.created" }); }\n',
      },
      why: "the member is carried by the canonical injected domain-event operation",
    },
  ],
});
