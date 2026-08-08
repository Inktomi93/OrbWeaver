// Gate: membership-enforcer (ledger D16/D18) — chats are MEMBERSHIP-scoped; `chats.ownerId` does not
// exist and owner-equality must never come back. The regression freeze: no owner-equality comparison
// (`x.ownerId === y` / `y === x.ownerId`) anywhere in domain/chat or the chat transport surfaces —
// membership (`assertParticipant` → the `can()` seam) is the ONLY authority model. Also: no
// `fetchOwned`/`OwnedTable` import in domain/chat. Not gated: participant-role literals (host-lookup, not a privilege decision — that's owner-role-split's territory).
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const CHAT_SCOPE = /\/packages\/server\/src\/(?:domain\/chat\/|transport\/trpc\/(?:routers\/chat|chat-events-bus))/u;
const BANNED_IMPORTS = new Set(["fetchOwned", "OwnedTable"]);
const OWNER_ID = "ownerId";
const EQUALITY_OPS = new Set(["==", "===", "!=", "!=="]);

// THE ONE REASON, carrying BOTH arms by token. `ownerId`: an owner-equality comparison. `fetchOwned` /
// `OwnedTable`: the single-owned import. (The import arm's own message folded in here when it stopped
// riding the Finding overload — see the header's SUPPRESSION note.)
const MESSAGE =
  "the chat scope is MEMBERSHIP-scoped, not owner-scoped (D18: chats.ownerId is DROPPED; authority = " +
  "chat_participants via assertParticipant → the can() seam). `ownerId`: an owner-equality comparison — the " +
  "host, when needed, is LOOKED UP from the loaded roster, never compared as an owner. " +
  "`fetchOwned`/`OwnedTable`: chats are the MEMBERSHIP-scoped ownership category of D18's two-category " +
  "split, so the single-owned helpers structurally do not apply to a chat. (Spine-Identity-and-Auth.md)";

function endsInOwnerId(text: string): boolean {
  return text === OWNER_ID || text.endsWith(`.${OWNER_ID}`);
}

// Two arms, ONE gate: an owner-equality BinaryExpression (`….ownerId ==/=== …`), and a fetchOwned/
// OwnedTable named import — both in the chat scope. An import finding carries its own message.
export const gate: GateDescriptor = {
  name: "membership-enforcer",
  docRow: "ledger D16/D18 (Spine-Identity-and-Auth.md)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "authority is chat_participants via assertParticipant → the can() seam; the host is LOOKED UP from the loaded roster, never compared as an owner.",
  scanRoot: (p) => CHAT_SCOPE.test(`/${p}`),
  kinds: [SyntaxKind.BinaryExpression, SyntaxKind.ImportSpecifier],
  visit: (node, _sf, ctx) => {
    if (
      node.isKind(SyntaxKind.BinaryExpression) &&
      EQUALITY_OPS.has(node.getOperatorToken().getText()) &&
      (endsInOwnerId(node.getLeft().getText()) || endsInOwnerId(node.getRight().getText()))
    ) {
      ctx.report(node, { token: OWNER_ID, offset: 0 });
      return;
    }
    if (node.isKind(SyntaxKind.ImportSpecifier) && BANNED_IMPORTS.has(node.getName())) {
      ctx.report(node, { token: node.getName(), offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const bad = (x: { ownerId: string }, y: string) => x.ownerId === y;\n",
      at: "packages/server/src/domain/chat/verbs/x.ts",
      expect: { count: 1, token: "ownerId" },
      why: "an owner-equality comparison in the chat scope — the ~171-site neo pattern D18 dissolved",
    },
    {
      files: 'import { fetchOwned } from "@orb/db";\nexport const f = fetchOwned;\n',
      at: "packages/server/src/domain/chat/verbs/y.ts",
      expect: { count: 1, token: "fetchOwned" },
      why: "a fetchOwned import in domain/chat — the D18 category error (chats aren't single-owned)",
    },
  ],
  mustPass: [
    {
      files: 'export const host = (r: { role: string }) => r.role === "host";\n',
      at: "packages/server/src/domain/chat/verbs/z.ts",
      why: "a participant-role literal (role === 'host') is host-LOOKUP (D18-sanctioned), not owner-equality",
    },
    {
      files: 'import { fetchOwned } from "@orb/db";\nexport const f = fetchOwned;\n',
      at: "packages/server/src/domain/billing/z.ts",
      why: "a fetchOwned import OUTSIDE the chat scope (a single-owned domain) — legitimate, scanRoot excludes it, passes",
    },
  ],
};
