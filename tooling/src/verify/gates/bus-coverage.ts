// ChatBusEvent producer coverage: every declared member has a canonical executable server emitter.
// The shared bus fact owns union/member/call identity and refuses incomplete derivations.
import { busByUnion, recordReadyBusFact } from "../contract/bus-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { busProducerFact } from "../lib/bus-fact.ts";

const UNION = { path: "packages/contracts/src/chat/bus.ts", exportName: "ChatBusEvent" } as const;
const MESSAGE =
  "ChatBusEvent member has NO server emit site — a declared-never-emitted bus member is silently dead wire (D50; Core-Laws-and-Precedents.md §7 D50).";

export const gate = defineGate({
  id: "bus-coverage",
  family: "bus-fact",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@contracts", "@server"], ext: ["ts", "tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [busProducerFact],
  resources: [],
  message: MESSAGE,
  fix: "wire the canonical server emit site for the ChatBusEvent member.",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(busProducerFact);
      recordReadyBusFact(ctx, fact);
      const bus = busByUnion(fact, UNION);
      if (bus === undefined) {
        throw new Error(`expected bus union is missing: ${UNION.path}#${UNION.exportName}`);
      }
      const emitted = new Set(bus.emitters.map(({ member }) => member.name));
      for (const member of bus.declaredMembers) {
        if (!emitted.has(member.name)) {
          ctx.report.node(member.anchor.node, { message: `${MESSAGE} Member: ${member.name}` });
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
  ],
});
