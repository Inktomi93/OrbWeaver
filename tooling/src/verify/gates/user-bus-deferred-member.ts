// The owner-deferred half of UserBusEvent producer coverage, split off `bus-producer-coverage` because
// authority and severity are per-policy: a member deferred by an owner decision is WARNING DEBT tied to a
// positive Project issue, and an error policy cannot carry that owner (gate-runtime-standardization.md
// §"Exceptions and debt"). The legacy DEFERRED allowlist — a citation string parked inside the gate — is
// retired into this descriptor: the member is named once, here, and `workItem` is the machine-readable
// debt identity the roster derives.
//
// #1822 owns the debt: `connectionsChanged` is DECLARED and never emitted because no per-user connection
// entity exists (a user's provider/role routing lives in USER SETTINGS -> `settingsChanged`; the model
// catalog is admin/global -> `refreshCatalog`). It stays declared so the client invalidation map and this
// ratchet track it explicitly.
//
// WHY THE FINDING IS THE RETIREMENT AND NOT THE DEBT: the debt is already stated — mandatorily, and in
// machine-readable form — by `severity: "warning"` plus `workItem`, which no descriptor may fake. What a
// RUN must catch is the two ways this deferral can rot, and both are covered:
//   • the member GAINS a producer -> this policy reports (warning, unsuppressible: `hard` authority), and
//     the message is the exact retirement instruction. Its sibling then owns the member by construction,
//     because `bus-producer-coverage` reads the same `lib/bus-deferred-member.ts` registry;
//   • the member STOPS BEING DECLARED (renamed, deleted) -> this policy REFUSES. A silent pass over a
//     vanished subject is how a standing exception becomes a loaded gun, so the run reports a tool error
//     instead. A refusal cannot be expressed as a proof row, so it is pinned through `runPolicyPass` in
//     `tests/tooling/verify/gates/bus-pair.test.ts`.
//
// The legacy `user-bus-coverage` descriptor (d9ac09d580d98188caae64ba04f24deee7402ef6) carried the
// DEFERRED allowlist as a citation string parked inside its single gate before this split gave the
// deferral its own descriptor.
//
// FAMILY `bus-fact` — the shared reader is `lib/bus-fact.ts` (`busProducerFact`), plus
// `contract/bus-fact.ts` (`busByUnion`, `recordReadyBusFact`), consumed identically by all three members
// (`bus-producer-coverage`, `bus-fact-health` and this policy), so the producer census and the deferral
// cannot drift apart. The DEFERRAL REGISTRY is a second shared module, `lib/bus-deferred-member.ts`
// (`BUS_MEMBER_DEFERRALS`, `deferralsFor`), read identically by this policy and by `bus-producer-coverage`.
// Until 2026-09-12 that list was declared HERE and exported, and this paragraph argued the arrangement was
// deliberate — "exported rather than shared through `lib/` on purpose: it is DEBT DATA with one owner and a
// deletion date, not a reader". The owner banned the shape that day (#2096 / §12.3: a gate module never
// imports another gate module; a shared predicate moves to `lib/<family>.ts`), so the sentence is corrected
// rather than left as precedent — debt data read by two policies is shared data, whatever its lifespan, and
// its lifespan is recorded in the new module instead. The atomic-deletion property it claimed was RE-DRIVEN
// at the move rather than restated; the three-arm measurement is in that module's header.
// POPULATION PORT: an INTENTIONAL CORRECTION, legacy at d9ac09d58 (the parent of 001949630). The legacy
// descriptor declared `scopeSafety: "whole-project"` with no `scanRoot` and walked `ctx.project`, so its
// effective population was the entire tree. The final is `{ in: ["@contracts", "@server"] }` — and that set
// is NOT a free choice: it must EQUAL `busProducerFact`'s own population (lib/bus-fact.ts:651), because
// nothing checks that a provider's population is a subset of its consumers' (guide §4.5b) and a consumer
// narrower than its provider is handed nodes it may not NAME, which is the `ctx.relativePath` throw. So
// narrowing this to `@contracts` alone — the only package this policy's own arms NAME — is the tempting
// simplification that must not be made. The worked receipt for that failure mode is the twin family's
// `bus-definition-belts` `mustPass[0]`, which reproduces the real-tree throw inside conformance.
import { busByUnion, recordReadyBusFact } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { deferralsFor } from "../lib/bus-deferred-member.ts";
import { busProducerFact } from "../lib/bus-fact.ts";

const UNION = { path: "packages/contracts/src/user-bus/index.ts", exportName: "UserBusEvent" } as const;

const MESSAGE =
  "owner-deferred UserBusEvent member now HAS a server producer — the deferral is retired. Delete BOTH tooling/src/verify/gates/user-bus-deferred-member.ts AND tooling/src/verify/lib/bus-deferred-member.ts, then drop the now-unresolvable deferral read from bus-producer-coverage (which then owns the member by construction), and close the work item.";

export const gate = defineGate({
  id: "user-bus-deferred-member",
  family: "bus-fact",
  authority: "hard",
  severity: "warning",
  workItem: 1822,
  population: { in: ["@contracts", "@server"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busProducerFact],
  resources: [],
  message: MESSAGE,
  fix: "delete the deferral policy and let bus-producer-coverage own the member.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busProducerFact);
      recordReadyBusFact(ctx, fact);
      const bus = busByUnion(fact, UNION);
      if (bus === undefined) {
        throw new Error(`expected bus union is missing: ${UNION.path}#${UNION.exportName}`);
      }
      // THE UNION HALF OF THE KEY IS LOAD-BEARING HERE TOO: this policy owns ONE union, and a deferral row
      // minted for another bus is not its subject — reading the rows unfiltered would make a second row throw
      // "no longer declared" against a union that never declared it.
      for (const deferred of deferralsFor(UNION)) {
        const member = bus.declaredMembers.find(({ name }) => name === deferred);
        if (member === undefined) {
          throw new Error(`deferred ${UNION.exportName} member ${deferred} is no longer declared — this deferral outlived its subject`);
        }
        if (bus.emitters.some((emitter) => emitter.member.name === deferred)) {
          ctx.report.node(member.anchor.node, { message: `${MESSAGE} Member: ${deferred}` });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "connectionsChanged" };\nexport const USER_BUS_EVENT_TYPES = { connectionsChanged: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/connection/verbs/save.ts":
          'import type { UserBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\nexport function save(ctx: { emitUserEvent: (userId: string, event: UserBusEvent) => void }, userId: string): void {\n  ctx.emitUserEvent(userId, { type: "connectionsChanged" });\n}\n',
      },
      expect: { count: 1, messageIncludes: "Member: connectionsChanged" },
      why: "the deferred member gained its canonical injected producer — the deferral is stale and must be deleted, which is the only self-cleaning direction a proof row can express. The `messageIncludes` names WHICH member retired, which a bare count cannot: the report appends the member to a single policy-level message, so a reader that matched the wrong declared member — or dropped the `deferralsFor` union filter and retired a same-named member of another bus — would still produce exactly one finding here",
    },
  ],
  // THE REFUSAL ARM (§4.5b, #1977; migrated from `bus-pair.test.ts`'s `runPolicyPass` pin by #2109 item 2 / #2111).
  mustRefuse: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "connectionChanged" };\nexport const USER_BUS_EVENT_TYPES = { connectionChanged: true } satisfies Record<UserBusEvent["type"], true>;\n',
      },
      expect: { messageIncludes: "deferred UserBusEvent member connectionsChanged is no longer declared" },
      why: "A DEFERRAL THAT OUTLIVES ITS SUBJECT REFUSES instead of passing silently: the deferred member was renamed, every other identity still resolves, and a name-keyed exemption would sit here forever describing nothing — the policy's own throw text is the needle",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "connectionsChanged" } | { type: "settingsChanged" };\nexport const USER_BUS_EVENT_TYPES = { connectionsChanged: true, settingsChanged: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/settings/verbs/update.ts":
          'import type { UserBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\nexport function update(ctx: { emitUserEvent: (userId: string, event: UserBusEvent) => void }, userId: string): void {\n  ctx.emitUserEvent(userId, { type: "settingsChanged" });\n}\n',
      },
      why: "the standing tree state: the deferred member is declared with no producer while a sibling member has one — the deferral is live and honest, so this policy is silent and `bus-producer-coverage` reports nothing either",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "connectionsChanged" };\nexport const USER_BUS_EVENT_TYPES = { connectionsChanged: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/connection/verbs/save.ts": 'export const decoy = "connectionsChanged";\n',
      },
      why: "an arbitrary matching literal is not a producer, so it cannot retire a deferral — the permissive direction of the same identity the coverage twins prove",
    },
  ],
});
