// Every bus union in `@orb/contracts` owes a `*_EVENT_TYPES` belt — the coverage ratchets quantify over
// BELTS, so a beltless bus is invisible to all of them. That is not hypothetical: `AutomationBusEvent`
// shipped beltless and carried a declared-never-emitted `rulesChanged` for the domain's whole life.
//
// WHAT RETIRED `BELT_EXEMPT`. Its three rows (`DurableChatBusEvent`, `LiveOnlyChatBusEvent`, `WiBusEvent`)
// all said the same thing in prose: this alias is a DERIVED SUB-UNION of a belted root, so the root's belt
// already covers every member it can contain, and a second belt would be a parallel home for the same
// discriminators. That is a fact about the TYPE, not about the name — `Exclude<>`, `Extract<>` and a
// spliced sub-union all resolve to a discriminator set, and a set contained by a belted union's set is
// belted by construction. The shared definition fact answers it, so the table is derived, not ported. Its
// two-sidedness survives verbatim: the day one of those aliases stops being a subset it owes its own belt
// and this policy says so, with no row to delete.
import { defineGate } from "../contract/policy.ts";
import { busDefinitionFact } from "../lib/bus-definition-fact.ts";

const MESSAGE =
  'bus event union in @orb/contracts with NO `*_EVENT_TYPES` belt const and no belted root — the coverage ratchets quantify over BELTS, so a beltless bus is invisible to every one of them. Add the belt beside the union, `satisfies Record<Union["type"], true>` or `as const satisfies readonly Union["type"][]`.';

export const gate = defineGate({
  id: "bus-definition-belts",
  family: "bus-definition",
  authority: "hard",
  severity: "error",
  population: { in: ["@contracts", "@client", "@server"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busDefinitionFact],
  resources: [],
  message: MESSAGE,
  fix: "add the union's own belt const, or keep the alias a derived sub-union of a belted root.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busDefinitionFact);
      if (fact.unresolved.length > 0 || fact.definitions.length === 0) {
        // A blind instrument, never a clean tree: this policy keys on an exported `*BusEvent` alias, so a
        // corpus that yields none — or one identity the reader could not resolve — must refuse rather
        // than report every bus healthy.
        throw new Error(
          `bus definition fact is incomplete: ${fact.definitions.length} unions, ${fact.unresolved.map(({ stage, reason, detail }) => `${stage}/${reason}: ${detail}`).join("; ") || "no readable bus unions"}`,
        );
      }
      ctx.receipt({ kind: "population", source: fact.receipt.source, members: fact.receipt.unions, unresolved: fact.receipt.unresolved });
      for (const definition of fact.definitions) {
        if (definition.belt === null && definition.beltedRoots.length === 0) {
          ctx.report.node(definition.anchor.node, { message: `${MESSAGE} Union: ${definition.union.exportName}` });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/automation/index.ts": 'export type ProbeBusEvent = { type: "ruleFired" } | { type: "rulesChanged" };\n',
      },
      expect: { count: 1 },
      why: "ARM C's founding shape: a beltless bus union, which is how AutomationBusEvent shipped a dead member for its whole life",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/events/index.ts": 'export type DomainEvent = { type: "character.updated" };\n',
      },
      expect: { count: 1, messageIncludes: "DomainEvent" },
      why: "the by-NAME half of the derivation: `DomainEvent` predates the `*BusEvent` convention, so a suffix test alone would miss it",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "delta" };\nexport const CHAT_BUS_EVENT_TYPES = { delta: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/contracts/src/world-info/index.ts": 'export type WiBusEvent = { type: "wiBookAttached" };\n',
      },
      expect: { count: 1, messageIncludes: "WiBusEvent" },
      why: "a sub-union is exempt only while it IS a subset: this one is spliced into nothing, so the belted root does not cover its member and the alias owes a belt of its own",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "delta" };\nexport const CHAT_BUS_EVENT_TYPES = { delta: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/client/src/features/x/lib/x-map.ts":
          'import type { ForeignEvent } from "../../../../../ui/src/foreign-bus.ts";\nexport const handlers: Record<ForeignEvent["type"], string> = { foreign: "x" };\n',
        "packages/ui/src/foreign-bus.ts": 'export type ForeignEvent = { type: "foreign" };\n',
      },
      why: "A CLIENT TOTAL MAP KEYED ON A UNION FROM OUTSIDE THE POPULATION, and the row that dies without a TOTAL home read: `attachClientMaps` resolves the map's key through `canonicalTypeAlias`, which follows the binding wherever it was declared — here into a file the `bus-definitions` population never admitted, exactly as the real tree resolves an imported symbol into a node_modules `.d.ts`. `busDeclarationIdentity` used to ask `ctx.relativePath` for that alias's path, which REFUSES any file outside the effective population (lib/policy-pass-context.ts:211-217), so the whole FACT threw and withheld every bus consumer — the failure that left `freeze-provenance-write-pairing` reporting nothing for an entire run (guide §12.3). THIS ROW REDS AS A FACT TOOL ERROR against the unmodified reader rather than as an unexpected finding, and that is the real-tree failure reproduced inside conformance (receipt 2026-09-12: `FACT TOOL ERROR [bus-definitions:finish] source file is outside the effective population: packages/ui/src/foreign-bus.ts`). The foreign identity now keeps a real comparable path, misses `byUnion` exactly as it always would have, and this belted root still passes",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "delta" };\nexport const CHAT_BUS_EVENT_TYPES = { delta: true } satisfies Record<ChatBusEvent["type"], true>;\n',
      },
      why: "a belted root union",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/world-info/index.ts": 'export type WiBusEvent = { type: "wiBookAttached" };\n',
        "packages/contracts/src/chat/bus.ts":
          'import type { WiBusEvent } from "../world-info/index.ts";\nexport type ChatBusEvent = WiBusEvent | { type: "delta" };\nexport const CHAT_BUS_EVENT_TYPES = { wiBookAttached: true, delta: true } satisfies Record<ChatBusEvent["type"], true>;\n',
      },
      why: "the SPLICED sub-union, derived: WiBusEvent's members ride CHAT_BUS_EVENT_TYPES, which is what the retired BELT_EXEMPT row said in prose",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "delta" } | { type: "typing" };\nexport type LiveOnlyChatBusEvent = Extract<ChatBusEvent, { type: "typing" }>;\nexport type DurableChatBusEvent = Exclude<ChatBusEvent, { type: "typing" }>;\nexport const CHAT_BUS_EVENT_TYPES = { delta: true, typing: true } satisfies Record<ChatBusEvent["type"], true>;\n',
      },
      why: "the `Extract<>`/`Exclude<>` pair, derived from their RESOLVED types: neither has an alias symbol of its own after resolution, and neither owes a belt",
    },
  ],
});
