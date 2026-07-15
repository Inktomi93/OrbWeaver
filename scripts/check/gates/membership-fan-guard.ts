// Gate: membership-fan-guard (client-architecture-lockdown.md §13 law 2/§16 G12) — chat is the
// MEMBERSHIP-scoped domain (D16/D18): state visible to more than one member must fan to every present
// member's channel, never to a single actor. `emitUserEvent` is the per-PERSON, actor-only emit (the
// injected op every single-owner domain verb closes over) — under `domain/chat/**` it is banned outright;
// member-visible state rides the member-fan op (`emitChatChanged`, membership-derived) or the chat bus,
// never a single-user channel a non-member/other-member could be silently excluded from.
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const CHAT_DOMAIN = /\/packages\/server\/src\/domain\/chat\//u;
const FORBIDDEN = "emitUserEvent";

const MESSAGE =
  "`emitUserEvent` identifier under domain/chat/** — chat is MEMBERSHIP-scoped (D16/D18): member-visible state rides the member-fan op (`emitChatChanged`) or the chat bus, never an actor-only channel that could silently exclude a co-member (client-architecture-lockdown.md §13 law 2/§16 G12).";

export const gate: GateDescriptor = {
  name: "membership-fan-guard",
  docRow: "client-architecture-lockdown.md §13 law 2/§16 G12",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "fan member-visible state through emitChatChanged (or the chat bus) — never emitUserEvent inside domain/chat.",
  scanRoot: (p) => CHAT_DOMAIN.test(`/${p}`),
  kinds: [SyntaxKind.Identifier],
  visit: (node, _sf, ctx) => {
    if (node.getText() === FORBIDDEN) {
      ctx.report(node, { token: FORBIDDEN, offset: 0 });
    }
  },
  mustFlag: [
    {
      files:
        'export function leak(emitUserEvent: (u: string, e: unknown) => void): void {\n  emitUserEvent("u1", { type: "chatsChanged" });\n}\n',
      at: "packages/server/src/domain/chat/verbs/__probe.ts",
      expect: { count: 2 },
      why: "an actor-only emitUserEvent identifier inside domain/chat — every occurrence (param + call) is its own finding",
    },
  ],
  mustPass: [
    {
      files: "export function fan(emitChatChanged: () => void): void {\n  emitChatChanged();\n}\n",
      at: "packages/server/src/domain/chat/verbs/__probe-ok.ts",
      why: "the sanctioned member-fan op (emitChatChanged) — not the banned identifier",
    },
    {
      files:
        "export const use = (emitUserEvent: (u: string, e: unknown) => void) => emitUserEvent;\n",
      at: "packages/server/src/domain/persona/verbs/__probe-other.ts",
      why: "emitUserEvent OUTSIDE domain/chat (a genuinely single-owner domain) — scanRoot excludes it, passes",
    },
  ],
};
