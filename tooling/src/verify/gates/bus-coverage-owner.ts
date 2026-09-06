// Every belted bus owes a PRODUCER-COVERAGE owner: some final policy whose declared subject is that exact
// union, so a declared-never-emitted member is somebody's finding. A belt with no owner is the shape that
// let `rulesChanged` ship dead — the belt existed, and no ratchet quantified over it.
//
// WHAT RETIRED THE FILE-NAMING TABLE. The legacy arm asked whether any `tooling/src/verify/gates/*.ts`
// file mentioned the belt const's NAME in code. That is a text match over the tree's most comment-dense
// tier, keyed on a const name rather than on the bus, and it credits any module that happens to spell the
// string. The derivation replaces it with the descriptors themselves: a `defineGate` call resolved to the
// contract's own `defineGate` declaration, its authored `id`/`family`/`severity`, and the union identity
// THE DESCRIPTOR REACHES.
//
// TWO THINGS THE FIRST CUT GOT WRONG, both measured on this tree:
//   • it credited any `{path, exportName}` const declared in the same FILE as a `defineGate` call. The
//     union identity must be reachable from the DESCRIPTOR ARGUMENT — a const the policy never consumes
//     (an unused leftover, or a second bus's identity parked beside it) proves nothing;
//   • it counted every family member as an owner. `user-bus-deferred-member` declares `UserBusEvent` and
//     reports only the RETIREMENT of a deferral — it never reports a dead-wire member — so with
//     `user-bus-coverage` deleted this gate stayed GREEN while the bus had no ratchet at all. An owner is
//     the RATCHET: `severity: "error"` in the producer family. A `warning` descriptor is debt tracking by
//     construction (the contract requires `workItem` for warning and forbids it for error), and debt
//     tracking is not coverage.
import { defineGate } from "../contract/policy.ts";
import { busCoverageOwnerFact, busDefinitionFact } from "../lib/bus-definition-fact.ts";

/** The family whose policies consume the producer fact and report a member with no emitter. */
const PRODUCER_FAMILY = "bus-fact";

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
      const ratchets = owners.owners.filter((owner) => owner.family === PRODUCER_FAMILY && owner.severity === "error" && owner.workItem === null);
      for (const definition of belted) {
        const owned = ratchets.some(({ union }) => union.path === definition.union.path && union.exportName === definition.union.exportName);
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
          'import { defineGate } from "../contract/policy.ts";\nconst UNION = { path: "packages/contracts/src/other/index.ts", exportName: "OtherBusEvent" } as const;\nexport const gate = defineGate({ id: "probe-coverage", family: "bus-fact", severity: "error", union: UNION });\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      expect: { count: 1 },
      why: "a real coverage policy that declares a DIFFERENT union does not own this one — the owner is matched on the union identity, never on being in the family",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "tooling/src/verify/gates/__probe-deferred.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst UNION = { path: "packages/contracts/src/probe/index.ts", exportName: "ProbeBusEvent" } as const;\nexport const gate = defineGate({ id: "probe-deferred", family: "bus-fact", severity: "warning", workItem: 1822, union: UNION });\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      expect: { count: 1 },
      why: "THE LIVE HOLE: a warning-debt sibling declares the union and reports only its own retirement, so it is not the ratchet. Before this arm, deleting the real coverage policy left this gate green while the bus had no dead-wire owner at all",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "tooling/src/verify/gates/__probe-unused.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst LEFTOVER = { path: "packages/contracts/src/probe/index.ts", exportName: "ProbeBusEvent" } as const;\nexport const other = LEFTOVER;\nexport const gate = defineGate({ id: "probe-unused", family: "bus-fact", severity: "error", message: "unrelated" });\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      expect: { count: 1 },
      why: "a union identity declared BESIDE a descriptor that never consumes it is not ownership — the claim is read from the descriptor argument, not from the module",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "tooling/src/verify/gates/__probe-coverage.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst UNION = { path: "packages/contracts/src/probe/index.ts", exportName: "ProbeBusEvent" } as const;\nexport const gate = defineGate({ id: "probe-coverage", family: "bus-fact", severity: "error", union: UNION });\n',
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
          'import { defineGate as declarePolicy } from "../contract/policy.ts";\nconst UNION = { path: "packages/contracts/src/probe/index.ts", exportName: "ProbeBusEvent" } as const;\nexport const gate = declarePolicy({ id: "probe-coverage", family: "bus-fact", severity: "error", union: UNION });\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      why: "the same owner through an import ALIAS — the descriptor is recognized by the declaration it resolves to, so a local spelling cannot hide or fake ownership",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/index.ts":
          'export type ProbeBusEvent = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<ProbeBusEvent["type"], true>;\n',
        "tooling/src/verify/gates/__probe-shared-union.ts":
          'export const SHARED_UNION = { path: "packages/contracts/src/probe/index.ts", exportName: "ProbeBusEvent" } as const;\n',
        "tooling/src/verify/gates/__probe-coverage.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { SHARED_UNION } from "./__probe-shared-union.ts";\nexport const gate = defineGate({ id: "probe-coverage", family: "bus-fact", severity: "error", union: SHARED_UNION });\n',
        "tooling/src/verify/contract/policy.ts": "export function defineGate<T>(policy: T): T {\n  return policy;\n}\n",
      },
      why: "the identity IMPORTED from a shared const rather than declared beside the descriptor: the identifier's own symbol is the import alias, whose declarations are the ImportSpecifier, so without the alias hop the bus reads as unowned and this gate fails loud on a legal spelling",
    },
  ],
});
