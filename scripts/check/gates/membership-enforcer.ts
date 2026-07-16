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

const COMPARE_MESSAGE =
  "owner-equality comparison in the chat scope — chats are MEMBERSHIP-scoped (D18: chats.ownerId is DROPPED; authority = chat_participants via assertParticipant → the can() seam). The host, when needed, is LOOKED UP from the loaded roster, never compared as an owner (D18 — Spine-Identity-and-Auth.md).";
const IMPORT_MESSAGE =
  "fetchOwned/OwnedTable imported in domain/chat — chats are the MEMBERSHIP-scoped ownership category (D18's two-category split); the single-owned helpers structurally do not apply to a chat.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

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
  message: COMPARE_MESSAGE,
  fix: "authority is chat_participants via assertParticipant → the can() seam; the host is LOOKED UP from the loaded roster, never compared as an owner.",
  scanRoot: (p) => CHAT_SCOPE.test(`/${p}`),
  kinds: [SyntaxKind.BinaryExpression, SyntaxKind.ImportSpecifier],
  visit: (node, sf, ctx) => {
    if (
      node.isKind(SyntaxKind.BinaryExpression) &&
      EQUALITY_OPS.has(node.getOperatorToken().getText()) &&
      (endsInOwnerId(node.getLeft().getText()) || endsInOwnerId(node.getRight().getText()))
    ) {
      ctx.report(node, { token: OWNER_ID, offset: 0 });
      return;
    }
    if (node.isKind(SyntaxKind.ImportSpecifier) && BANNED_IMPORTS.has(node.getName())) {
      ctx.report({
        file: relPath(ctx.root, sf.getFilePath()),
        line: node.getStartLineNumber(),
        column: node.getSourceFile().getLineAndColumnAtPos(node.getStart()).column,
        message: IMPORT_MESSAGE,
        token: node.getName(),
      });
    }
  },
  mustFlag: [
    {
      files: "export const bad = (x: { ownerId: string }, y: string) => x.ownerId === y;\n",
      at: "packages/server/src/domain/chat/verbs/x.ts",
      why: "an owner-equality comparison in the chat scope — the ~171-site neo pattern D18 dissolved",
    },
    {
      files: 'import { fetchOwned } from "@orb/db";\nexport const f = fetchOwned;\n',
      at: "packages/server/src/domain/chat/verbs/y.ts",
      expect: { messageIncludes: "MEMBERSHIP-scoped ownership category" },
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
