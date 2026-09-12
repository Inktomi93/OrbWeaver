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
//     because `bus-producer-coverage` imports the list below;
//   • the member STOPS BEING DECLARED (renamed, deleted) -> this policy REFUSES. A silent pass over a
//     vanished subject is how a standing exception becomes a loaded gun, so the run reports a tool error
//     instead. A refusal cannot be expressed as a proof row, so it is pinned through `runPolicyPass` in
//     `tests/tooling/verify/gates/bus-pair.test.ts`.
//
// The legacy `user-bus-coverage` descriptor (d9ac09d580d98188caae64ba04f24deee7402ef6) carried the
// DEFERRED allowlist as a citation string parked inside its single gate before this split gave the
// deferral its own descriptor.
import type { BusDeclarationIdentity, BusMemberDeferral } from "../contract/bus-fact.ts";
import { busByUnion, recordReadyBusFact } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { busProducerFact } from "../lib/bus-fact.ts";

const UNION = { path: "packages/contracts/src/user-bus/index.ts", exportName: "UserBusEvent" } as const;

/** The ONE home for "which bus members are owner-deferred", keyed by `(union, member)`.
 *  `bus-producer-coverage` imports it, so deleting this module when #1822 lands is atomic: the sibling stops
 *  excluding the member in the same edit that removes the deferral, and `tsc` refuses any half of that
 *  removal. The union half is load-bearing since the coverage policy became generic over every belted bus —
 *  a bare member NAME would defer a same-named member of any other bus with it. */
export const BUS_MEMBER_DEFERRALS: readonly BusMemberDeferral[] = Object.freeze([{ union: UNION, member: "connectionsChanged" }]);

/** The deferred members of ONE bus — the only way either policy is allowed to read the list, so the union
 *  half of the key cannot be dropped in one reader and honoured in the other.
 *
 *  `rows` is injectable because the union filter is otherwise UNREACHABLE: the live list holds exactly one
 *  row today, so a reader that ignored the union entirely would behave identically and no proof could tell
 *  the two apart (measured — an unfiltered mutant left every bus spec green). A proof plants a second bus's
 *  row and the filter becomes observable. */
export function deferralsFor(union: BusDeclarationIdentity, rows: readonly BusMemberDeferral[] = BUS_MEMBER_DEFERRALS): readonly string[] {
  return rows.filter((row) => row.union.path === union.path && row.union.exportName === union.exportName).map(({ member }) => member);
}

const MESSAGE =
  "owner-deferred UserBusEvent member now HAS a server producer — the deferral is retired. Delete tooling/src/verify/gates/user-bus-deferred-member.ts (its sibling `bus-producer-coverage` then owns the member by construction) and close the work item.";

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
      expect: { count: 1 },
      why: "the deferred member gained its canonical injected producer — the deferral is stale and must be deleted, which is the only self-cleaning direction a proof row can express",
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
