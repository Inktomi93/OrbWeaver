// Every belted bus owes a CONSUMER belt: a mapped-type-total map over its union somewhere in
// `packages/client/src` (the ONE invalidation seam for the global buses; a feature bus may home its map in
// its own stream hook, so the map is located BY SHAPE and client-wide, never by path), or — for a bus that
// never reaches a browser — a server-side EXHAUSTIVE dispatch. A `satisfies` belt with no consumer is legal
// TypeScript and a silent hole: the producer side ratchets, the consumer side drops members on the floor.
//
// WHAT RETIRED `SERVER_INTERNAL_REACH`. Its one row (`DomainEvent`) said: this bus never leaves the
// process, so its consumer belt is the `assertNeverEvent` subscriber in `entry/compose/search-discovery.ts`
// rather than a client map — and a client total map would be dead wire knip flags. That is derivable, and
// the derivation is stronger than the row: a call whose ARGUMENT'S FLOW TYPE IS `never` at a guard declared
// with a `never` parameter is the checker's own proof that every member was handled before it, and the
// argument's DECLARED type says which union was exhausted. No name, no path, no table. The row's
// two-sidedness survives: a bus with neither belt reports, whichever kind of consumer it was supposed to
// have.
import { defineGate } from "../contract/policy.ts";
import { busDefinitionFact } from "../lib/bus-definition-fact.ts";

const MESSAGE =
  "belted bus union has NO consumer belt — neither a mapped-type total map over the union in packages/client/src (data/invalidation.ts for the global buses, or the bus's own stream hook) nor a server-side exhaustive dispatch. A belt with no consumer ratchets producers only, and members reach nobody.";

export const gate = defineGate({
  id: "bus-consumer-belt",
  family: "bus-definition",
  authority: "hard",
  severity: "error",
  population: { in: ["@contracts", "@client", "@server"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busDefinitionFact],
  resources: [],
  message: MESSAGE,
  fix: "add the client mapped-type total map over the union, or an exhaustive server-side dispatch ending in a `never`-parameter guard.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busDefinitionFact);
      const belted = fact.definitions.filter(({ belt }) => belt !== null);
      if (fact.unresolved.length > 0 || belted.length === 0) {
        throw new Error(
          `bus definition fact is incomplete: ${belted.length} belted unions, ${fact.unresolved.map(({ stage, reason, detail }) => `${stage}/${reason}: ${detail}`).join("; ") || "no readable belts"}`,
        );
      }
      ctx.receipt({ kind: "population", source: fact.receipt.source, members: fact.receipt.belts, unresolved: fact.receipt.unresolved });
      for (const definition of belted) {
        if (definition.clientTotalMaps.length === 0 && definition.exhaustiveConsumers.length === 0) {
          ctx.report.node(definition.anchor.node, { message: `${MESSAGE} Union: ${definition.union.exportName}` });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      expect: { count: 1, messageIncludes: "NO consumer belt" },
      why: "a new bus's belt with neither consumer belt wired — legal TypeScript, and the members reach no reader",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" } | { type: "b" };\nexport const PROBE_EVENT_TYPES = { a: true, b: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "packages/server/src/entry/compose/probe.ts":
          'import type { ProbeBusEvent } from "../../../../contracts/src/probe/index.ts";\nfunction assertNeverEvent(event: never): never {\n  throw new Error(String(event));\n}\nexport function route(event: ProbeBusEvent): string {\n  switch (event.type) {\n    case "a":\n      return "a";\n    default:\n      return assertNeverEvent(event);\n  }\n}\n',
      },
      expect: { count: 1 },
      why: "a PARTIAL server dispatch is not an exhaustive consumer: the guard's argument still types as a live member, so the checker never proved the union was covered",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "packages/client/src/data/invalidation.ts":
          'import type { ProbeBusEvent } from "../../../contracts/src/probe/index.ts";\nexport type ProbeMap = { readonly [K in ProbeBusEvent["type"]]: () => void };\n',
      },
      why: "the client mapped-type total map, the global-bus shape",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "packages/client/src/features/probe/hooks/use-probe-stream.ts":
          'import type { ProbeBusEvent } from "../../../../../contracts/src/probe/index.ts";\nexport type ProbeMap = Record<ProbeBusEvent["type"], () => void>;\n',
      },
      why: 'the same belt as a `Record<Union["type"], …>` in a FEATURE stream hook — the map is located client-wide by shape, never by path',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/events/index.ts":
          'export type DomainEvent = { type: "asset.created" } | { type: "persona.updated" };\nexport const DOMAIN_EVENT_TYPES = ["asset.created", "persona.updated"] as const satisfies readonly DomainEvent["type"][];\n',
        "packages/server/src/entry/compose/search-discovery.ts":
          'import type { DomainEvent } from "../../../../contracts/src/events/index.ts";\nfunction assertNeverEvent(event: never): never {\n  throw new Error(String(event));\n}\nexport function route(event: DomainEvent): string {\n  switch (event.type) {\n    case "asset.created":\n      return "index";\n    case "persona.updated":\n      return "skip";\n    default:\n      return assertNeverEvent(event);\n  }\n}\n',
      },
      why: "THE REACH LANE, derived: a bus that never reaches a browser owes an exhaustive SERVER consumer, and the `never` argument at the guard IS the checker's exhaustiveness proof — the exact claim the retired SERVER_INTERNAL_REACH row made in prose",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "packages/client/src/data/invalidation.ts":
          'import type { ProbeBusEvent } from "../../../contracts/src/probe/index.ts";\ntype Alias = ProbeBusEvent;\nexport type ProbeMap = { readonly [K in Alias["type"]]: () => void };\n',
      },
      why: "the map keyed through a local type ALIAS: identity comes from the resolved type, so a respelling that a name-text reader would miss still satisfies the belt",
    },
  ],
});
