// Gate: membership-fan-guard (client-architecture-lockdown.md §13 law 2/§16 G12) — chat is the
// MEMBERSHIP-scoped domain (D16/D18): state visible to more than one member must fan to every present
// member's channel, never to a single actor. `emitUserEvent` is the per-PERSON, actor-only emit (the
// injected op every single-owner domain verb closes over) — under `domain/chat/**` it is banned outright;
// member-visible state rides the member-fan op (`emitChatChanged`, membership-derived) or the chat bus,
// never a single-user channel a non-member/other-member could be silently excluded from.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const FORBIDDEN = "emitUserEvent";

const MESSAGE =
  "`emitUserEvent` identifier under domain/chat/** — chat is MEMBERSHIP-scoped (D16/D18): member-visible state rides the member-fan op (`emitChatChanged`) or the chat bus, never an actor-only channel that could silently exclude a co-member (client-architecture-lockdown.md §13 law 2/§16 G12).";

export const gate = defineGate({
  id: "membership-fan-guard",
  family: "membership-fan-guard",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/chat/**"] },
  analysis: "syntax",
  execution: "selected-files",
  resources: [],
  message: MESSAGE,
  fix: "fan member-visible state through emitChatChanged (or the chat bus) — never emitUserEvent inside domain/chat.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Identifier],
        visit: (node) => {
          if (node.getText() === FORBIDDEN) {
            ctx.report.node(node, { token: FORBIDDEN, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/__probe.ts":
          'export function leak(emitUserEvent: (u: string, e: unknown) => void): void {\n  emitUserEvent("u1", { type: "chatsChanged" });\n}\n',
      },
      expect: { count: 2 },
      why: "an actor-only emitUserEvent identifier inside domain/chat — every occurrence (param + call) is its own finding",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/verbs/shadow.ts": "export function f(): void { const emitUserEvent = () => undefined; emitUserEvent(); }\n" },
      expect: { count: 2 },
      why: "name-only matching deliberately catches a locally shadowed binding and its call; symbol provenance is not an escape",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/verbs/__probe-ok.ts": "export function fan(emitChatChanged: () => void): void {\n  emitChatChanged();\n}\n" },
      why: "the sanctioned member-fan op (emitChatChanged) — not the banned identifier",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/verbs/anchor.ts": "export const clean = true;\n",
        "packages/server/src/domain/persona/verbs/__probe-other.ts": "export const use = (emitUserEvent: (u: string, e: unknown) => void) => emitUserEvent;\n",
      },
      why: "emitUserEvent OUTSIDE domain/chat (a genuinely single-owner domain) — the declared population excludes it, passes",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/verbs/computed.ts": 'export const emitter = { "emitUserEvent": 1, ["emitUserEvent"]: 2 };\n' },
      why: "declared limit: quoted and computed property keys contain no emitUserEvent Identifier node and are outside this spelling policy",
    },
  ],
});
