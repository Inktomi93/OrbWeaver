// Gate: membership-enforcer (ledger D16/D18) — chats are MEMBERSHIP-scoped; `chats.ownerId` does not
// exist and owner-equality must never come back. The layered enforcement this gate completes:
//   • compile-time (already physics): `CHAT_VERB_AUTHORITY satisfies Record<keyof ChatService, …>`
//     (substrate/auth/matrix.ts) — a NEW chat verb fails `tsc` until classified, default-deny;
//     `chats` has no `ownerId` column, so a property access fails `tsc` too.
//   • THIS gate (the regression freeze): no OWNER-EQUALITY comparison (`x.ownerId === y` /
//     `y === x.ownerId`) anywhere in `domain/chat` or the chat transport surfaces — the ~171-site
//     neo pattern D18 dissolved; membership (`assertParticipant` → the `can()` seam) is the ONLY
//     authority model. Also: no `fetchOwned`/`OwnedTable` IMPORT in `domain/chat` — chats are the
//     membership-scoped category; treating one as single-owned is the D18 category error.
// Deliberately NOT gated here: participant-role literals (`role === "host"`) — those are host-LOOKUP
// (deriving `runAsUserId`/the funding source from the loaded roster, D18-sanctioned), not privilege
// decisions; the privilege comparison lives inside `can()` (the owner-role-split gate's territory).
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const CHAT_SCOPE = new RegExp(
  "/packages/server/src/(?:domain/chat/|transport/trpc/(?:routers/chat|chat-events-bus))",
  "u",
);
const BANNED_IMPORTS = new Set(["fetchOwned", "OwnedTable"]);
const OWNER_ID = "ownerId";
const EQUALITY_OPS = new Set(["==", "===", "!=", "!=="]);

const COMPARE_MESSAGE =
  "owner-equality comparison in the chat scope — chats are MEMBERSHIP-scoped (D18: chats.ownerId is DROPPED; authority = chat_participants via assertParticipant → the can() seam). The host, when needed, is LOOKED UP from the loaded roster, never compared as an owner.";
const IMPORT_MESSAGE =
  "fetchOwned/OwnedTable imported in domain/chat — chats are the MEMBERSHIP-scoped ownership category (D18's two-category split); the single-owned helpers structurally do not apply to a chat.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

function endsInOwnerId(text: string): boolean {
  return text === OWNER_ID || text.endsWith(`.${OWNER_ID}`);
}

/** Owner-equality binary expressions (`….ownerId ==/=== …` either side). */
function ownerEqualityViolations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const bin of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
    if (!EQUALITY_OPS.has(bin.getOperatorToken().getText())) {
      continue;
    }
    const left = bin.getLeft().getText();
    const right = bin.getRight().getText();
    if (endsInOwnerId(left) || endsInOwnerId(right)) {
      out.push({ file: rel, line: bin.getStartLineNumber(), message: COMPARE_MESSAGE });
    }
  }
  return out;
}

/** `fetchOwned`/`OwnedTable` named imports inside domain/chat. */
function ownedHelperImports(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const decl of sf.getImportDeclarations()) {
    for (const named of decl.getNamedImports()) {
      if (BANNED_IMPORTS.has(named.getName())) {
        out.push({ file: rel, line: named.getStartLineNumber(), message: IMPORT_MESSAGE });
      }
    }
  }
  return out;
}

export const membershipEnforcer: Check = {
  name: "membership-enforcer",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!CHAT_SCOPE.test(path)) {
        continue;
      }
      const rel = relPath(root, path);
      violations.push(...ownerEqualityViolations(sf, rel), ...ownedHelperImports(sf, rel));
    }
    return violations;
  },
};
