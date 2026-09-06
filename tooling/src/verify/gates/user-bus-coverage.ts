// UserBusEvent producer coverage: every declared member has a canonical executable server emitter. The
// twin of `bus-coverage` for the per-USER bus (D50) — the union is compile-exhaustive on the CONSUMER
// side, so nothing but this ratchet sees a member that is declared, mapped on the client, and never
// emitted (a second device's write never reaches this one).
//
// The shared bus fact owns union/member/call identity, which is what retired the legacy reader: the
// producers it now proves include the CONDITIONAL PUBLISHER (`publishChatChanged` -> `publishUserEvent`
// -> `defineBusChannel.publish`, two hops below the domain call sites), so `chatsChanged` is proven by
// identity rather than by a literal corpus.
//
// The owner-deferred member is not an allowlist row here: it is the subject of the warning-debt sibling
// `user-bus-deferred-member`, which owns the work item and the retirement ratchet. Importing its list is
// what makes the two halves one decision — when the deferral is deleted, this policy owns the member in
// the same edit.
import { busByUnion, recordReadyBusFact } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { busProducerFact } from "../lib/bus-fact.ts";
import { USER_BUS_DEFERRED_MEMBERS } from "./user-bus-deferred-member.ts";

const UNION = { path: "packages/contracts/src/user-bus/index.ts", exportName: "UserBusEvent" } as const;
const MESSAGE =
  "UserBusEvent member has NO server emit site — a declared-never-emitted user-bus member is silently dead wire (D50; Core-Laws-and-Precedents.md §7 D50).";

export const gate = defineGate({
  id: "user-bus-coverage",
  family: "bus-fact",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@contracts", "@server"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busProducerFact],
  resources: [],
  message: MESSAGE,
  fix: "wire the verb's injected emitUserEvent operation for the member after its durable write commits.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busProducerFact);
      recordReadyBusFact(ctx, fact);
      const bus = busByUnion(fact, UNION);
      if (bus === undefined) {
        throw new Error(`expected bus union is missing: ${UNION.path}#${UNION.exportName}`);
      }
      const emitted = new Set(bus.emitters.map(({ member }) => member.name));
      const deferred = new Set(USER_BUS_DEFERRED_MEMBERS);
      for (const member of bus.declaredMembers) {
        if (!(emitted.has(member.name) || deferred.has(member.name))) {
          ctx.report.node(member.anchor.node, { message: `${MESSAGE} Member: ${member.name}` });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "neverEmitted" };\nexport const USER_BUS_EVENT_TYPES = { neverEmitted: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/settings/verbs/update.ts": 'export const decoy = "neverEmitted";\n',
      },
      expect: { count: 1, messageIncludes: "neverEmitted" },
      why: "an arbitrary matching literal is not an emitUserEvent call — the declared member remains dead wire",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "emitted" };\nexport const USER_BUS_EVENT_TYPES = { emitted: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/settings/verbs/update.ts":
          'import type { UserBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\nfunction emitUserEvent(_userId: string, _event: UserBusEvent): void {}\nemitUserEvent("u", { type: "emitted" });\n',
      },
      expect: { count: 1 },
      why: "a locally shadowed same-named function is not the injected emitUserEvent operation",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "emitted" };\nexport const USER_BUS_EVENT_TYPES = { emitted: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/settings/verbs/update.ts":
          'import type { UserBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\ndeclare const logger: { emitUserEvent: (userId: string, event: UserBusEvent) => void };\nlogger.emitUserEvent("u", { type: "emitted" });\n',
      },
      expect: { count: 1 },
      why: "a same-typed emitter method on an unrelated receiver is not the canonical user-bus operation",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "emitted" };\nexport const USER_BUS_EVENT_TYPES = { emitted: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/settings/verbs/update.ts":
          'import type { UserBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\nexport function update(ctx: { emitUserEvent: (userId: string, event: UserBusEvent) => void }, userId: string): void {\n  ctx.emitUserEvent(userId, { type: "emitted" });\n}\n',
      },
      why: "the member is carried by the canonical injected user-bus operation",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "chatsChanged"; chatId?: string };\nexport const USER_BUS_EVENT_TYPES = { chatsChanged: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/transport/trpc/bus-channel.ts":
          "export interface BusChannel<Key, Event> {\n  readonly publish: (key: Key, event: Event) => void;\n}\nexport function defineBusChannel<Key extends string, Event>(channelFor: (key: Key) => string): BusChannel<Key, Event>;\nexport function defineBusChannel<Key extends string, Event>(channelFor: (key: Key) => string, opts: { readonly firehose: true }): BusChannel<Key, Event>;\nexport function defineBusChannel<Key extends string, Event>(\n  channelFor: (key: Key) => string,\n  opts?: { readonly firehose: true },\n): BusChannel<Key, Event> {\n  return { publish: () => channelFor };\n}\n",
        "packages/server/src/transport/trpc/user-events-bus.ts":
          'import type { UserBusEvent } from "../../../../contracts/src/user-bus/index.ts";\nimport { defineBusChannel } from "./bus-channel.ts";\nconst bus = defineBusChannel<string, UserBusEvent>((userId) => `user:${userId}`);\nexport function publishUserEvent(userId: string, event: UserBusEvent): void {\n  bus.publish(userId, event);\n}\nexport function publishChatChanged(userId: string, chatId: string | undefined): void {\n  const event: UserBusEvent = chatId === undefined ? { type: "chatsChanged" } : { type: "chatsChanged", chatId };\n  publishUserEvent(userId, event);\n}\n',
      },
      why: "THE CONDITIONAL PUBLISHER, in the shape the live tree has it: a member built in a conditional local, relayed through the module publisher, and fanned by the one bus-channel mint whose OVERLOADED factory made the old reader blind",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "connectionsChanged" } | { type: "emitted" };\nexport const USER_BUS_EVENT_TYPES = { connectionsChanged: true, emitted: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/settings/verbs/update.ts":
          'import type { UserBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\nexport function update(ctx: { emitUserEvent: (userId: string, event: UserBusEvent) => void }, userId: string): void {\n  ctx.emitUserEvent(userId, { type: "emitted" });\n}\n',
      },
      why: "the owner-deferred member is owned by the warning-debt sibling, not by this error policy — the exact split the retired DEFERRED allowlist used to express as a local table",
    },
  ],
});
