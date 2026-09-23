// PRODUCER COVERAGE for every belted bus, as ONE policy quantified over the belted roster.
//
// A bus event union is compile-exhaustive on the CONSUMER side (the client's total map), but nothing
// machine-checks the PRODUCER side: a member can be declared, mapped, replay-guarded and never emitted —
// silently dead wire (D50). This is the ratchet for that, for every belted union at once.
//
// WHY ONE POLICY. Until 2026-09-06 this was five modules — `bus-coverage`, `rpg-bus-coverage`,
// `automation-bus-coverage`, `domain-events-coverage`, `user-bus-coverage` — that differed ONLY in a `UNION`
// constant, plus a sixth (`bus-coverage-owner`) whose whole job was to notice when a belted bus had no
// module naming it. Both halves are structural consequences of the per-union shape, not of the law: the law
// is "every declared member of every belted bus has a proven producer". Quantifying over the fact's own
// belted roster states exactly that, and a new bus is then covered the day its belt lands — which is the
// property `bus-coverage-owner` existed to approximate by reading gate descriptors (`AutomationBusEvent`
// carried a declared-never-emitted `rulesChanged` for its whole life because the belt existed and no module
// quantified over it). The owner gate's guarantee now rides the POPULATION RECEIPT below — the producer
// fact's belted roster IS the denominator (so no lookup can miss and no bus can be skipped), a zero-belt
// roster refuses as a blind instrument, and the definition fact's independently derived belted roster must
// AGREE with it or the run refuses.
//
// THE DEFERRED MEMBERS ARE NOT AN ALLOWLIST HERE. An owner-deferred member is warning debt owned by
// `user-bus-deferred-member` (hard/warning, `workItem: 1822`) — an error policy cannot carry that owner
// (gate-runtime-standardization.md §"Authority and exceptions"). This policy imports that module's exact
// (union, member) rows so the two halves are ONE decision: deleting the deferral module when its work item
// lands makes this policy own the member in the same edit, and `tsc` refuses any half of that removal.
//
// Identity — which call is a producer, which relay carries a member, which argument proves nothing — is the
// shared `busProducerFact`'s question, not this policy's. It owns no name table, no path regex and no walk.
//
// FAMILY `bus-fact` — the shared reader is `lib/bus-fact.ts` (`busProducerFact`), read identically by the
// three policies that SPLIT by authority and severity rather than by subject: this ordinary/error one, the
// hard/error `bus-fact-health` that guards the census before any verdict is trusted, and the hard/warning
// `user-bus-deferred-member` that owns the owner-deferred rows. The `family` string is identical across all
// three by construction. This policy ALSO reads the sibling family's provider, `lib/bus-definition-fact.ts`
// (`busDefinitionFact`) — not for identity, but solely so the two independently derived belted rosters can
// be required to AGREE, which is the guarantee that retired `bus-coverage-owner` (see below). Identity —
// which call is a producer, which relay carries a member — is the fact's question, never this module's; it
// owns no name table, no path regex and no walk.
//
// POPULATION PORT for a 5→1 consolidation: an intentional correction, and the five legacy descriptors had
// no `scanRoot` between them. Each was `scopeSafety: "whole-project"` with a `run` hook walking
// `ctx.project`, carrying its path narrowing INLINE as a regex over the emit side
// (`bus-coverage`'s `emitScope: /\/packages\/server\/src\/(?:domain|transport|entry\/compose)\//u`, per-union
// variants in the other four). The final population is `{ in: ["@contracts", "@server"] }`: the declaration
// side lives in `@contracts`, the producer side in `@server`, and NOTHING of the emit-scope regex moved into
// the population — which call counts as a producer is the shared `busProducerFact`'s question, so this
// policy holds no path predicate at all. That is the same 5→1 move the roster records: the narrowing did not
// disappear, it changed OWNER, and the receipt that it did is the belted-roster denominator below.
//
// The legacy `bus-coverage` descriptor (f287dc6dbb2dc4959a0bf4bd5698fea70fa03df8) checked ONLY
// `ChatBusEvent`'s producer coverage by name before this conversion retired it plus five siblings
// (`automation-bus-coverage`, `bus-coverage-owner`, `domain-events-coverage`, `rpg-bus-coverage`,
// `user-bus-coverage`) into this one roster-quantified policy.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `bus-coverage` descriptor at f287dc6dbb2dc4959a0bf4bd5698fea70fa03df8, the parent of `bus-coverage`'s own
// conversion `83d6cf316` (at this module's birth `8f671bf27` that module was already final); the other five retired
// descriptors are not replayed here (blob read from git with no working-tree plant: a `GateDescriptor`, no
// `defineGate`). The legacy descriptor had no `scanRoot`, so its effective population is its in-run path filter —
// bus-coverage SPEC: contractsFile `/packages/contracts/src/chat/bus.ts`, emitScope
// `/packages/server/src/(?:domain|transport|entry/compose)/`. Over the SAME 7,026 harness candidates at that tree
// (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`) it admits 1,220 and the final `population` admits 1,570
// (the bare harness dispatch was 7,026). legacy − final = ∅. final − legacy = 350 — every other `@contracts` source
// (103) and the `@server` tiers outside `domain|transport|entry/compose` (247): the emit-scope regex left the
// population for the shared `busProducerFact` (the 5→1 consolidation above). Controls: inside: the real shared member
// `packages/contracts/src/chat/bus.ts` admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` rejected by both.
import type { Node as MorphNode } from "ts-morph";
import type { BusDeclarationIdentity, BusRecord } from "../contract/bus-fact.ts";
import { recordReadyBusFact } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { deferralsFor } from "../lib/bus-deferred-member.ts";
import { busDefinitionFact } from "../lib/bus-definition-fact.ts";
import { busProducerFact } from "../lib/bus-fact.ts";

const MESSAGE = "declared bus member has NO server emit site — a declared-never-emitted bus member is silently dead wire (docs/adr/0050-d50.md).";

const identityKey = ({ path, exportName }: BusDeclarationIdentity): string => `${path}#${exportName}`;

/** THE COVERAGE GUARANTEE, and what retired `bus-coverage-owner`. The two bus facts derive "which unions
 *  are belted" from DIFFERENT populations (producers read contracts+server, definitions read
 *  contracts+client+server) and by different routes, so their belted rosters agreeing is a checkable claim —
 *  and a bus that appears in only one of them is a bus somebody's ratchet is not quantifying over. Measured
 *  reachable direction: a union alias declared OUTSIDE `packages/contracts/src/` whose belt lives inside it
 *  is belted for the producer fact and INVISIBLE to the definition fact (its alias collection is
 *  contracts-only), which is exactly a bus this policy would judge while the definition family's belt/consumer
 *  ratchets never see it. Either way the run REFUSES rather than reporting the rest of the tree clean.
 *
 *  It is checked BEFORE the completeness refusal below on purpose: the same corpus trips both, and a refusal
 *  that cannot say WHICH invariant broke is not a receipt. The pin in `bus-fact-health.test.ts` asserts this
 *  message, so neutering this check reds the row instead of silently falling through to the other refusal. */
function assertRosterAgreement(producerBelted: ReadonlySet<string>, definitionBelted: ReadonlySet<string>): void {
  const disagreement = [
    ...[...definitionBelted]
      .filter((key) => !producerBelted.has(key))
      .map((key) => `${key} is belted for the definition fact and absent from the producer fact`),
    ...[...producerBelted]
      .filter((key) => !definitionBelted.has(key))
      .map((key) => `${key} is belted for the producer fact and invisible to the definition fact`),
  ];
  if (disagreement.length > 0) {
    throw new Error(`bus rosters disagree about belted unions: ${disagreement.join("; ")}`);
  }
}

/** Every declared member of one bus with no proven emitter and no owner deferral, as its finding. The
 *  deferrals are read THROUGH the deferral module's own selector, per bus, so "which members are deferred"
 *  is answered by `(union, member)` in one home rather than by a name in two. */
function uncoveredMembers(bus: BusRecord): readonly { readonly node: MorphNode; readonly message: string }[] {
  const emitted = new Set(bus.emitters.map(({ member }) => member.name));
  const deferred = new Set(deferralsFor(bus.union));
  return bus.declaredMembers
    .filter((member) => !(emitted.has(member.name) || deferred.has(member.name)))
    .map((member) => ({ node: member.anchor.node, message: `${MESSAGE} Union: ${bus.union.exportName}. Member: ${member.name}` }));
}

export const gate = defineGate({
  id: "bus-producer-coverage",
  family: "bus-fact",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@contracts", "@server"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busProducerFact, busDefinitionFact],
  resources: [],
  message: MESSAGE,
  fix:
    "wire the member's canonical server producer — the domain/transport call on its injected emit " +
    "operation, or the bus-channel publisher it is relayed through. A deliberate site is waived with " +
    "`@orb-waive bus-producer-coverage(<position>): <reason>` on the line above, where <position> is the " +
    "derived position — the first identifier, literal or keyword of the reported member declaration.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busProducerFact);
      recordReadyBusFact(ctx, fact);
      const definitions = ctx.fact(busDefinitionFact);
      // THE DENOMINATOR is the producer fact's own belted roster, so every bus this policy judges is one it
      // holds the members and emitters for — there is no lookup that can miss, and therefore no silent skip.
      // The definition fact is the INDEPENDENT cross-check that the roster is the whole roster.
      const belted = fact.buses.filter(({ belt }) => belt !== null);
      const definitionBelted = definitions.definitions.filter(({ belt }) => belt !== null);
      assertRosterAgreement(new Set(belted.map(({ union }) => identityKey(union))), new Set(definitionBelted.map(({ union }) => identityKey(union))));
      if (definitions.unresolved.length > 0 || belted.length === 0) {
        // Zero belted unions is "I could not look", never "every bus is covered".
        throw new Error(`bus definition fact is incomplete: ${belted.length} belted unions, ${definitions.unresolved.length} unresolved`);
      }
      ctx.receipt({ kind: "population", source: "bus-producer-coverage", members: belted.length, unresolved: definitions.receipt.unresolved });
      for (const bus of belted) {
        for (const finding of uncoveredMembers(bus)) {
          ctx.report.node(finding.node, { message: finding.message });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "neverEmitted" };\nexport const CHAT_BUS_EVENT_TYPES = { neverEmitted: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/domain/chat/x.ts": 'export const decoy = "neverEmitted";\n',
      },
      expect: { count: 1, messageIncludes: "neverEmitted" },
      why: "an arbitrary matching literal is not a canonical chat emitter",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "emitted" };\nexport const CHAT_BUS_EVENT_TYPES = { emitted: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/domain/chat/x.ts":
          'import type { ChatBusEvent } from "../../../../contracts/src/chat/bus.ts";\nfunction emit(_event: ChatBusEvent): void {}\nemit({ type: "emitted" });\n',
      },
      expect: { count: 1 },
      why: "a locally declared same-typed emitter name is not the injected chat operation",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "emitted" };\nexport const CHAT_BUS_EVENT_TYPES = { emitted: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/domain/chat/x.ts":
          'import type { ChatBusEvent } from "../../../../contracts/src/chat/bus.ts";\ndeclare const logger: { emit: (event: ChatBusEvent) => void };\nlogger.emit({ type: "emitted" });\n',
      },
      expect: { count: 1 },
      why: "a same-typed emit method on an unrelated receiver is not a canonical chat emitter",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "opened" };\nexport const CHAT_BUS_EVENT_TYPES = { opened: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/transport/trpc/stream/sources/chat.ts":
          'import type { ChatBusEvent } from "../../../../../../contracts/src/chat/bus.ts";\nexport function* stream(event: ChatBusEvent) { yield { channel: "chat", event }; }\n',
      },
      expect: { count: 1 },
      why: "relaying an arbitrary typed bus event does not prove where any declared member is produced",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "opened" };\nexport const CHAT_BUS_EVENT_TYPES = { opened: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/transport/trpc/stream/sources/chat.ts": 'export function* stream() { yield { channel: "user", event: { type: "opened" } }; }\n',
      },
      expect: { count: 1 },
      why: "only a frame synthesized on the chat channel is a chat-bus producer",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/rpg/bus.ts":
          'export type RpgBusEvent = { type: "neverEmitted" };\nexport const RPG_BUS_EVENT_TYPES = ["neverEmitted"] as const satisfies readonly RpgBusEvent["type"][];\n',
        "packages/server/src/domain/rpg/x.ts": 'export const decoy = "neverEmitted";\n',
      },
      expect: { count: 1, messageIncludes: "RpgBusEvent" },
      why: "the ARRAY-shape belt is the same law: an arbitrary matching literal is not the injected RPG emitter, and the finding names the union it belongs to",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/automation/index.ts":
          'export type AutomationBusEvent = { type: "rulesChanged" };\nexport const AUTOMATION_BUS_EVENT_TYPES = { rulesChanged: true } satisfies Record<AutomationBusEvent["type"], true>;\n',
        "packages/server/src/domain/automation/engine/dispatch.ts": 'export const decoy = "rulesChanged";\n',
      },
      expect: { count: 1, messageIncludes: "rulesChanged" },
      why: "an arbitrary matching literal is not the automation notify operation — the member this bus shipped dead for its whole life",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/automation/index.ts":
          'export type AutomationBusEvent = { type: "quickReplySurfaced" };\nexport const AUTOMATION_BUS_EVENT_TYPES = { quickReplySurfaced: true } satisfies Record<AutomationBusEvent["type"], true>;\n',
        "packages/server/src/entry/compose/automation-plugin.ts":
          'import type { AutomationBusEvent } from "../../../../contracts/src/automation/index.ts";\nexport function publish(pluginNotify: (event: AutomationBusEvent) => void): void { pluginNotify({ type: "quickReplySurfaced" }); }\n',
      },
      expect: { count: 1 },
      why: "a compose-only automation publisher is wiring, not a domain/transport producer — this family's own tier fence, which the relay ladder applies symmetrically",
    },
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
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "opened" };\nexport const CHAT_BUS_EVENT_TYPES = { opened: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/contracts/src/user-bus/index.ts":
          'export type UserBusEvent = { type: "settingsChanged" };\nexport const USER_BUS_EVENT_TYPES = { settingsChanged: true } satisfies Record<UserBusEvent["type"], true>;\n',
        "packages/server/src/domain/settings/verbs/update.ts":
          'import type { UserBusEvent } from "../../../../../contracts/src/user-bus/index.ts";\nexport function update(ctx: { emitUserEvent: (userId: string, event: UserBusEvent) => void }, userId: string): void {\n  ctx.emitUserEvent(userId, { type: "settingsChanged" });\n}\n',
      },
      expect: { count: 1, messageIncludes: "ChatBusEvent" },
      why: "THE CONSOLIDATION ITSELF: two belted unions in one corpus, one produced and one not. The single policy quantifies over the whole belted roster, so the uncovered bus is reported and the covered one is silent — the property five per-union modules could only have by all five existing",
    },
  ],
  // THE REFUSAL ARM (§4.5b, #1977; migrated from `bus-fact-health.test.ts`'s `runPolicyPass` pins by #2109 item 2 /
  // #2111 so the two roster guarantees run on the static bar). The family test keeps the `runPolicyPass` twins: they
  // additionally assert the owner status, the empty finding set and the phase, which a row cannot express.
  mustRefuse: [
    {
      mode: "types",
      files: { "packages/contracts/src/probe/index.ts": 'export type ProbeBusEvent = { type: "a" };\n' },
      expect: { messageIncludes: "bus definition fact is incomplete" },
      why: "THE RETIRED OWNER GATE'S GUARANTEE, half one: a corpus with no BELTED bus is 'I could not look', and the policy REFUSES instead of reporting every bus covered — the message is the definition fact's own refusal text, forwarded by this consumer",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/bus.ts": 'export type XBusEvent = { type: "changed" };\n',
        "packages/contracts/src/x/index.ts":
          'import type { XBusEvent } from "../../../server/src/domain/x/bus.ts";\nexport const X_EVENT_TYPES = { changed: true } satisfies Record<XBusEvent["type"], true>;\n',
      },
      expect: { messageIncludes: "bus rosters disagree about belted unions" },
      why: "THE RETIRED OWNER GATE'S GUARANTEE, half three: a union declared outside `packages/contracts/src/` whose belt lives inside it is belted for the producer fact and INVISIBLE to the definition fact — the run REFUSES with the roster-disagreement text rather than judging a bus nobody quantifies over. This corpus also carries a definition-fact refusal behind it, so the needle is the ROSTER text: neutering `assertRosterAgreement` reds this row instead of sliding to the other refusal",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "emitted" };\nexport const CHAT_BUS_EVENT_TYPES = { emitted: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/domain/chat/x.ts":
          'import type { ChatBusEvent } from "../../../../contracts/src/chat/bus.ts";\nexport function create(deps: { emit: (event: ChatBusEvent) => void }): void { deps.emit({ type: "emitted" }); }\n',
      },
      why: "the member is carried by the canonical injected chat emitter",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "opened" };\nexport const CHAT_BUS_EVENT_TYPES = { opened: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/transport/trpc/stream/sources/chat.ts": 'export function* stream() { yield { channel: "chat", event: { type: "opened" } }; }\n',
      },
      why: "a literal event synthesized on the chat channel is an executable producer",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "memoryRecall" };\nexport const CHAT_BUS_EVENT_TYPES = { memoryRecall: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/domain/chat/memory/recall/recall.ts":
          'import type { ChatBusEvent } from "../../../../../../contracts/src/chat/bus.ts";\ntype MemoryRecallBusEvent = Extract<ChatBusEvent, { type: "memoryRecall" }>;\ninterface Ctx { emitRecallPhase?: (event: MemoryRecallBusEvent) => void; }\nexport function recall(ctx: Ctx): void { ctx.emitRecallPhase?.({ type: "memoryRecall" }); }\n',
      },
      why: "an optional injected callback carrying a derived bus arm is a real domain producer",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/rpg/bus.ts":
          'export type RpgBusEvent = { type: "freshEmit" };\nexport const RPG_BUS_EVENT_TYPES = ["freshEmit"] as const satisfies readonly RpgBusEvent["type"][];\n',
        "packages/server/src/domain/rpg/x.ts":
          'import type { RpgBusEvent } from "../../../../contracts/src/rpg/bus.ts";\nexport function create(ctx: { emitBus: (event: RpgBusEvent) => void }): void { ctx.emitBus({ type: "freshEmit" }); }\n',
      },
      why: "the member is carried by the canonical injected RPG emitter",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/automation/index.ts":
          'export type AutomationBusEvent = { type: "rulesChanged" };\nexport const AUTOMATION_BUS_EVENT_TYPES = { rulesChanged: true } satisfies Record<AutomationBusEvent["type"], true>;\n',
        "packages/server/src/domain/automation/verbs/create-rule.ts":
          'import type { AutomationBusEvent } from "../../../../../contracts/src/automation/index.ts";\nexport function create(ctx: { notify: (event: AutomationBusEvent) => void }): void { ctx.notify({ type: "rulesChanged" }); }\n',
      },
      why: "the member is carried by the canonical injected automation notifier",
    },
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
      why: "the owner-deferred member is owned by the warning-debt sibling, not by this error policy — the exact split the retired DEFERRED allowlist used to express as a local table, now keyed by (union, member) so a same-named member of ANOTHER bus is not silently deferred with it",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/chat/bus.ts":
          'export type ChatBusEvent = { type: "neverEmitted" };\nexport const CHAT_BUS_EVENT_TYPES = {\n  // @orb-waive bus-producer-coverage(neverEmitted): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  neverEmitted: true,\n} satisfies Record<ChatBusEvent["type"], true>;\n',
        "packages/server/src/domain/chat/x.ts": 'export const decoy = "neverEmitted";\n',
      },
      why: "POSITIONAL IDENTITY: the finding carries only a message, so the sink DERIVES the token from `member.anchor.node` — which `beltMembers` sets to the BELT's key node, i.e. the member name as authored in `CHAT_BUS_EVENT_TYPES` (`neverEmitted`), not the union arm's `type:` literal and not the union alias. An object-shaped belt therefore takes a bare identifier position; an ARRAY-shaped belt's key node is a string literal, whose derived token carries its quotes. The fixture is mustFlag[0] (:114, count 1) plus the marker line inside the belt object; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
  ],
});
