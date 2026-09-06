// Every belted bus owes a PRODUCER-COVERAGE owner: some final policy whose declared subject is that exact
// union, so a declared-never-emitted member is somebody's finding. A belt with no owner is the shape that
// let `rulesChanged` ship dead — the belt existed, and no ratchet quantified over it.
//
// WHAT RETIRED THE FILE-NAMING TABLE. The legacy arm asked whether any `tooling/src/verify/gates/*.ts`
// file mentioned the belt const's NAME in code. That is a text match over the tree's most comment-dense
// tier, keyed on a const name rather than on the bus, and it credits any module that happens to spell the
// string. The derivation replaces it with the descriptors themselves: a `defineGate` call resolved to the
// contract's own `defineGate` declaration, its authored `id`/`family`, and the union identity its module
// declares (`{ path, exportName }`). A policy that owns a bus says so in data; nothing else counts.
import { defineGate } from "../contract/policy.ts";
import { busCoverageOwnerFact, busDefinitionFact } from "../lib/bus-definition-fact.ts";

const MESSAGE =
  "belted bus union has NO producer-coverage owner — no final policy declares it as its subject, so a declared-never-emitted member of this bus is nobody's finding (this is how AutomationBusEvent's `rulesChanged` shipped dead). Add a coverage policy in the bus-fact family naming the union.";

export const gate = defineGate({
  id: "bus-coverage-owner",
  family: "bus-definition",
  authority: "hard",
  severity: "error",
  population: { in: ["@contracts", "@client", "@server"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busDefinitionFact, busCoverageOwnerFact],
  resources: [],
  message: MESSAGE,
  fix: "add a producer-coverage policy whose declared UNION identity is this union's path and export name.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busDefinitionFact);
      const owners = ctx.fact(busCoverageOwnerFact);
      const belted = fact.definitions.filter(({ belt }) => belt !== null);
      if (fact.unresolved.length > 0 || belted.length === 0) {
        throw new Error(`bus definition fact is incomplete: ${belted.length} belted unions, ${fact.unresolved.length} unresolved`);
      }
      if (owners.modules === 0 || owners.unresolved.length > 0) {
        // Zero parsed gate modules is "I could not look", never "no policy owns this bus".
        throw new Error(`bus coverage-owner fact is incomplete: ${owners.modules} modules, ${owners.unresolved.length} unresolved`);
      }
      ctx.receipt({ kind: "population", source: "bus-coverage-owner", members: belted.length, unresolved: fact.receipt.unresolved });
      for (const definition of belted) {
        const owned = owners.owners.some(({ union }) => union.path === definition.union.path && union.exportName === definition.union.exportName);
        if (!owned) {
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
        "tooling/src/verify/gates/__probe-prose.ts": '// The sibling ratchet keys on PROBE_EVENT_TYPES; this module does not.\nexport const OTHER = "x";\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      expect: { count: 1, messageIncludes: "NO producer-coverage owner" },
      why: "COMMENT POSTURE in the permissive direction: a gate module whose PROSE names the belt owns nothing — the gate corpus is the tree's most comment-dense tier, which is exactly why the legacy text match was a placebo",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "tooling/src/verify/gates/__probe-coverage.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst UNION = { path: "packages/contracts/src/other/index.ts", exportName: "OtherBusEvent" } as const;\nexport const gate = defineGate({ id: "probe-coverage", family: "bus-fact", union: UNION });\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      expect: { count: 1 },
      why: "a real coverage policy that declares a DIFFERENT union does not own this one — the owner is matched on the union identity, never on being in the family",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "tooling/src/verify/gates/__probe-coverage.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst UNION = { path: "packages/contracts/src/probe/index.ts", exportName: "ProbeBusEvent" } as const;\nexport const gate = defineGate({ id: "probe-coverage", family: "bus-fact", union: UNION });\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      why: "the owner declared in DATA: a defineGate descriptor resolved to the contract's own declaration, carrying this union's exact path and export name",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "tooling/src/verify/gates/__probe-coverage.ts":
          'import { defineGate as declarePolicy } from "../contract/policy.ts";\nconst UNION = { path: "packages/contracts/src/probe/index.ts", exportName: "ProbeBusEvent" } as const;\nexport const gate = declarePolicy({ id: "probe-coverage", family: "bus-fact", union: UNION });\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      why: "the same owner through an import ALIAS — the descriptor is recognized by the declaration it resolves to, so a local spelling cannot hide or fake ownership",
    },
  ],
});
