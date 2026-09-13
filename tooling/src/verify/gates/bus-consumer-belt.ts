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
//
// FAMILY `bus-definition` — the shared reader is `lib/bus-definition-fact.ts` (`busDefinitionFact`, one
// provider walked once per invocation), read identically by all three members of the split: this policy
// asks whether each belted union has a CONSUMER, `bus-definition-belts` asks which unions own a belt at
// all, and `bus-belt-total` asks whether a belt is total over its union. None of them derives a belt, which
// is why they cannot disagree about what one is. This module owns no table, walk, path regex or cache —
// the `SERVER_INTERNAL_REACH` row above was the last one and its successor is a checker proof, not a name.
//
// POPULATION PORT: an intentional NARROWING of an unstated legacy scope, taken by all three split siblings
// in the same commit. The legacy descriptor declared NO `scanRoot` — it was `scopeSafety: "whole-project"`
// with a `run` hook over `ctx.project` — so it judged whatever the legacy pass loaded. The final population
// is `{ in: ["@contracts", "@client", "@server"] }`, and for THIS policy all three roots are load-bearing
// rather than incidental: the union is declared in `@contracts`, the client total map is located BY SHAPE
// anywhere in `@client`, and the server-side exhaustive dispatch that acquits a never-browser bus is in
// `@server`. Drop any one root and a legal consumer becomes invisible, which is a false accusation.
//
// The legacy `bus-definition-belts` descriptor (001949630e8ae87b44c758fd4ba5614c8e63c15a) carried the
// `SERVER_INTERNAL_REACH` row and the consumer-belt check as two of its four arms before this split.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `bus-definition-belts` descriptor at 001949630e8ae87b44c758fd4ba5614c8e63c15a, the parent of the conversion
// `bda39454c`; this module did not exist there, so it is measured against the module it was carved from,
// `bus-definition-belts` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the SAME 7,230 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy
// harness dispatch (no `scanRoot`) admits 7,230 and final `population` admits 2,908. legacy − final = 4,322 harness
// sources outside `@contracts`/`@client`/`@server` — walked by the whole-project `run`; outside the three roots the
// narrowing above names. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
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
      expect: { count: 1 },
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
