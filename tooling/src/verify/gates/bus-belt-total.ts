// A belt is only a belt if it is TOTAL over its union's discriminators. The object shape
// (`{ … } satisfies Record<U["type"], true>`) gets that from `tsc` for free — a missing key is a type
// error on the const. The TUPLE shape (`[…] as const satisfies readonly U["type"][]`) does NOT: `satisfies`
// there proves only that every element IS a member, so a belt can silently omit one and every ratchet that
// quantifies over the belt's members skips it. Same hole as a beltless bus, one level down.
//
// Split from `bus-definition-belts` because the FIX differs (add the missing element vs. add a belt) even
// though both are hard/error facts about the same subject; they share the family and its provider.
//
// The legacy `bus-definition-belts` descriptor (001949630e8ae87b44c758fd4ba5614c8e63c15a) checked the
// tuple-belt totality as one of its four arms before this split gave it its own policy id.
import { defineGate } from "../contract/policy.ts";
import { busDefinitionFact } from "../lib/bus-definition-fact.ts";

const MESSAGE =
  "bus belt is not TOTAL over its union — a `*_EVENT_TYPES` belt that omits a declared discriminator makes every ratchet quantifying over it skip that member (the array-literal belt shape gets no totality check from tsc; only membership).";

export const gate = defineGate({
  id: "bus-belt-total",
  family: "bus-definition",
  authority: "hard",
  severity: "error",
  population: { in: ["@contracts", "@client", "@server"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busDefinitionFact],
  resources: [],
  message: MESSAGE,
  fix: "add the missing discriminator to the belt const, or remove the member from the union.",
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
        const belt = definition.belt;
        if (belt === null) {
          continue;
        }
        const carried = new Set(belt.members);
        const missing = definition.discriminators.filter((value) => !carried.has(value));
        const foreign = belt.members.filter((value) => !definition.discriminators.includes(value));
        if (missing.length > 0 || foreign.length > 0) {
          ctx.report.node(belt.anchor.node, {
            message: `${MESSAGE} Belt: ${belt.exportName}; missing: ${missing.join(", ") || "none"}; not in the union: ${foreign.join(", ") || "none"}`,
          });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/rpg/bus.ts":
          'export type RpgBusEvent = { type: "sheetChanged" } | { type: "rollResolved" };\nexport const RPG_BUS_EVENT_TYPES = ["sheetChanged"] as const satisfies readonly RpgBusEvent["type"][];\n',
      },
      expect: { count: 1, messageIncludes: "rollResolved" },
      why: 'the array-belt hole: `satisfies readonly U["type"][]` proves membership, never totality, so an omitted member type-checks and disappears from every ratchet',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/rpg/bus.ts":
          'export type RpgBusEvent = { type: "sheetChanged" } | { type: "rollResolved" };\nexport const RPG_BUS_EVENT_TYPES = ["sheetChanged", "rollResolved", "ghost"] as const satisfies readonly RpgBusEvent["type"][];\n',
      },
      expect: { count: 1, messageIncludes: "not in the union: ghost" },
      why: "THE FOREIGN ARM (#2047), which no row exercised before: the belt is TOTAL, so the `missing` half reports nothing and only `foreign` can produce this finding — cut that filter and the row goes silent. It also settles the question the shape invites: a foreign member IS a `satisfies` error, so the arm looks compile-time-impossible and therefore unfalsifiable, but the conformance runtime never asserts zero TS diagnostics, so the fixture runs and the arm fires. The `messageIncludes` is load-bearing twice over — a belt that is BOTH short and foreign keeps `count` at 1 across the cut, so a bare count proves neither half",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/rpg/bus.ts":
          'export type RpgBusEvent = { type: "sheetChanged" } | { type: "rollResolved" };\nexport const RPG_BUS_EVENT_TYPES = ["sheetChanged", "rollResolved"] as const satisfies readonly RpgBusEvent["type"][];\n',
      },
      why: "a total array belt",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "delta" } | { type: "typing" };\nexport const CHAT_BUS_EVENT_TYPES = { delta: true, typing: true } satisfies Record<ChatBusEvent["type"], true>;\n',
      },
      why: "a total object belt — the shape tsc already keeps honest, proven here so the two shapes share one reader",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "delta" } | { type: "typing" };\nexport type LiveOnlyChatBusEvent = Extract<ChatBusEvent, { type: "typing" }>;\nexport const CHAT_BUS_EVENT_TYPES = { delta: true, typing: true } satisfies Record<ChatBusEvent["type"], true>;\n',
      },
      why: "a derived sub-union carries no belt of its own, so it is not a subject here — totality is asked of belts, never of unions",
    },
  ],
});
