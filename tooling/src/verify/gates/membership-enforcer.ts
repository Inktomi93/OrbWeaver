// Ledger D16/D18: chats are MEMBERSHIP-scoped — `chats.ownerId` is DROPPED and authority is
// `chat_participants` via `assertParticipant` → the `can()` seam. Two arms, ONE reason, distinguished by
// token. `ownerId`: an owner-equality comparison, read through the shared member reader so `x["ownerId"]`
// and `x?.ownerId` are the same property as `x.ownerId`. `fetchOwned`/`OwnedTable`: the single-owned db
// helpers, sealed by their DECLARATION HOME rather than their spelling. Not gated: participant-role
// literals (host LOOKUP, D18-sanctioned). DECLARED LIMITS live in the mustPass rows.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import type { SealedHome } from "../lib/sealed-origin.ts";
import { readSealedOrigin } from "../lib/sealed-origin.ts";

const OWNER_ID = "ownerId";
const EQUALITY_OPS = new Set([
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
]);

/** `fetchOwned` and `OwnedTable` are declared once, in the db package's kit. */
const OWNED_HELPER_HOME: SealedHome = { pathInfix: "/packages/db/src/kit/", exportedNames: new Set(["fetchOwned", "OwnedTable"]) };

const MESSAGE =
  "the chat scope is MEMBERSHIP-scoped, not owner-scoped (D18: chats.ownerId is DROPPED; authority = " +
  "chat_participants via assertParticipant → the can() seam). `ownerId`: an owner-equality comparison — the " +
  "host, when needed, is LOOKED UP from the loaded roster, never compared as an owner. " +
  "`fetchOwned`/`OwnedTable`: chats are the MEMBERSHIP-scoped ownership category of D18's two-category " +
  "split, so the single-owned helpers structurally do not apply to a chat. (Spine-Identity-and-Auth.md)";

const FIX = "authority is chat_participants via assertParticipant → the can() seam; the host is LOOKED UP from the loaded roster, never compared as an owner.";

/** Legacy `scanRoot` tested `/packages/server/src/(?:domain/chat/|transport/trpc/(?:routers/chat|chat-events-bus))`
 *  against a slash-prefixed repo path; the two trailing prefixes are open-ended, which `chat**` reproduces. */
const CHAT_SCOPE_POPULATION = {
  in: ["@server"],
  under: ["packages/server/src/domain/chat/**", "packages/server/src/transport/trpc/routers/chat**", "packages/server/src/transport/trpc/chat-events-bus**"],
  ext: ["ts", "tsx"],
} as const;

/** Does this operand NAME the `ownerId` property, in any spelling? A bare identifier counts (the legacy
 *  `text === "ownerId"` arm), and every member spelling — dotted, optional and computed-literal — is
 *  normalized by the shared reader, so `row["ownerId"]` is no longer a silent escape (#1506). */
function namesOwnerId(operand: Node): boolean {
  if (Node.isIdentifier(operand)) {
    return operand.getText() === OWNER_ID;
  }
  const member = readMemberReference(operand);
  return member.kind === "resolved" && member.value.name === OWNER_ID;
}

function ownedHelperCandidate(node: Node): { readonly name: string; readonly anchor: Node } | null {
  if (Node.isImportSpecifier(node)) {
    const name = node.getName();
    return OWNED_HELPER_HOME.exportedNames.has(name) ? { name, anchor: node } : null;
  }
  if (!(Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    return null;
  }
  const member = readMemberReference(node);
  return member.kind === "resolved" && OWNED_HELPER_HOME.exportedNames.has(member.value.name) ? { name: member.value.name, anchor: node } : null;
}

export const gate = defineGate({
  id: "membership-enforcer",
  family: "membership-enforcer",
  authority: "ordinary",
  severity: "error",
  population: CHAT_SCOPE_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.BinaryExpression],
        visit: (node) => {
          if (!(Node.isBinaryExpression(node) && EQUALITY_OPS.has(node.getOperatorToken().getKind()))) {
            return;
          }
          if (namesOwnerId(node.getLeft()) || namesOwnerId(node.getRight())) {
            ctx.report.node(node, { token: OWNER_ID, offset: node.getText().indexOf(OWNER_ID) });
          }
        },
      },
      {
        kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
        visit: (node) => {
          const hit = ownedHelperCandidate(node);
          if (hit === null) {
            return;
          }
          // FAIL-CLOSED: an unreadable door for a single-owned helper is reported. Only a PROVEN foreign
          // declaration acquits — which is the arm the legacy name-only match never had.
          if (readSealedOrigin(hit.anchor, OWNED_HELPER_HOME).kind !== "foreign") {
            ctx.report.node(hit.anchor, { token: hit.name, offset: hit.anchor.getText().indexOf(hit.name) });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/x.ts": "export const bad = (x: { readonly ownerId: string }, y: string): boolean => x.ownerId === y;\n",
      },
      expect: { count: 1, token: "ownerId" },
      why: "the founding shape — an owner-equality comparison in the chat scope, the ~171-site neo pattern D18 dissolved",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/bracket.ts": 'export const bad = (x: Record<string, string>, y: string): boolean => x["ownerId"] === y;\n',
      },
      expect: { count: 1, token: "ownerId" },
      why: "the COMPUTED spelling of the same comparison — `endsInOwnerId(getText())` never saw a bracket read, so this walked past the freeze in silence (#1506)",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/optional.ts": "export const bad = (x: { readonly ownerId?: string }, y: string): boolean => x?.ownerId !== y;\n",
      },
      expect: { count: 1, token: "ownerId" },
      why: "an OPTIONAL member read on the other side of a `!==` is the same comparison — the shared reader normalizes the spelling and both operands are inspected",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/kit/fetch-owned.ts": "export function fetchOwned(id: string): string {\n  return id;\n}\n",
        "packages/server/src/domain/chat/verbs/y.ts": 'import { fetchOwned } from "../../../../../db/src/kit/fetch-owned.ts";\nexport const f = fetchOwned;\n',
      },
      expect: { count: 1, token: "fetchOwned" },
      why: "a `fetchOwned` import in domain/chat — the D18 category error, since chats are not single-owned",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/kit/fetch-owned.ts": "export function fetchOwned(id: string): string {\n  return id;\n}\n",
        "packages/server/src/transport/trpc/routers/chat.ts":
          'import { fetchOwned as loadMine } from "../../../../../db/src/kit/fetch-owned.ts";\nexport const f = loadMine;\n',
      },
      expect: { count: 1, token: "fetchOwned" },
      why: "AN ALIAS of the single-owned helper, in the chat ROUTER half of the scope — the seal is the declaration home, so renaming the binding is not an escape",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/server/src/domain/chat/verbs/z.ts": 'export const host = (r: { readonly role: string }): boolean => r.role === "host";\n' },
      why: "a participant-role literal (`role === 'host'`) is host LOOKUP from the loaded roster — D18-sanctioned, and explicitly NOT a privilege decision",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/kit/fetch-owned.ts": "export function fetchOwned(id: string): string {\n  return id;\n}\n",
        "packages/server/src/domain/billing/z.ts": 'import { fetchOwned } from "../../../../db/src/kit/fetch-owned.ts";\nexport const f = fetchOwned;\n',
        "packages/server/src/domain/chat/verbs/quiet.ts": "export const quiet = 1;\n",
      },
      why: "the same helper import OUTSIDE the chat scope — a genuinely single-owned domain is exactly who it is for, and the population excludes it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/lib/local-owned.ts": "export function fetchOwned(id: string): string {\n  return id;\n}\n",
        "packages/server/src/domain/chat/verbs/foreign.ts": 'import { fetchOwned } from "../lib/local-owned.ts";\nexport const f = fetchOwned;\n',
      },
      why: "THE HOME COUNTERFACTUAL — a GENUINE export named `fetchOwned` resolving cleanly to a declaration outside the db kit. The legacy arm matched the NAME alone and would have accused it; deleting the home comparison turns this row red",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/other.ts": "export const cmp = (x: { readonly ownerId: string }, y: string): boolean => x.ownerId > y;\n",
      },
      why: "DECLARED LIMIT — the freeze is on owner-EQUALITY (`==`/`===`/`!=`/`!==`), the shape that reintroduces owner authority. An ordering comparison is not an authority decision and is out of subject",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/verbs/waived.ts":
          "// @orb-waive membership-enforcer(ownerId): a migration-window read comparing the legacy column during backfill; ends when the column is dropped.\nexport const bad = (x: { readonly ownerId: string }, y: string): boolean => x.ownerId === y;\n",
      },
      why: "the ONE central positioned waiver naming the exact reported token — the arms are distinguished by token (`ownerId` vs the helper name), which is what makes a per-arm waiver expressible",
    },
  ],
});
