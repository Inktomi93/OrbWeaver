// `orb/room-token-mint`: a room token proves the step that mints it ran (D166). A `RoomAdmission` proves a membership
// gate loaded the caller's seat, a `RoomClaim` proves the room's claim settled, and a `ClaimExempt` proves a write needs
// no claim of its own. The compiler refuses a literal, a spread and `satisfies` by the tokens' private members, so this
// rule closes the two forgeries left: a mint called outside its listed sites, and a cast to a token type.

import { relative } from "node:path";
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import type { FunctionSite } from "./function-site.ts";
import { inFunctionSite } from "./function-site.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { posixPath } from "./syntax.ts";

/** The one module that builds the tokens' runtime values; its declarations and casts are the mint itself. */
export const ROOM_TOKEN_HOME = "packages/server/src/domain/chat/substrate/room-tokens.ts";

const ADMISSION_REASON = "a membership gate that loaded the caller's present seat in the room";
const CALLER_GATED_REASON =
  "a principal-free chat op: each caller gated its own authority over the room before calling, and the op mints so the confinement stays in chat";

interface MintSite extends FunctionSite {
  readonly reason: string;
}

/** Each mint's listed callers, by the enclosing function, with the reason the site may mint. */
export const ROOM_TOKEN_MINT_SITES: Readonly<Record<"mintRoomAdmission" | "mintRoomClaim" | "mintClaimExempt", readonly MintSite[]>> = {
  mintRoomAdmission: [
    { path: "packages/server/src/domain/chat/guard.ts", name: "requireParticipant", reason: ADMISSION_REASON },
    {
      path: "packages/server/src/domain/chat/verbs/get-membership.ts",
      name: "getMembership",
      reason: `${ADMISSION_REASON}; rpg's gates resolve through it, so rpg never mints`,
    },
    {
      path: "packages/server/src/domain/chat/verbs/turn.ts",
      name: "requireRequestTurn",
      reason: "requestTurn's presence wall: the initiator holds a present seat in the room",
    },
    { path: "packages/server/src/domain/chat/verbs/post-narrator-message.ts", name: "postNarratorMessage", reason: CALLER_GATED_REASON },
    { path: "packages/server/src/domain/chat/verbs/set-rpg-pointer.ts", name: "setRpgPointer", reason: CALLER_GATED_REASON },
    {
      path: "packages/server/src/domain/chat/engine/engine.ts",
      name: "fireRpgTurnCompleted",
      reason:
        "a stand-in until the engine carries the turn verb's own token: a turn reaches onTurnCompleted only after its verb claimed the room (resolveTurnBase, commitUserTurn, forceCharacterTurn, resolveRequestTurn); remove this site when the engine takes the token",
    },
  ],
  mintRoomClaim: [{ path: "packages/server/src/domain/chat/verbs/claim-chat.ts", name: "claim", reason: "the claim op, once the room's claim has settled" }],
  mintClaimExempt: [
    {
      path: "packages/server/src/domain/chat/verbs/set-rpg-pointer.ts",
      name: "setRpgPointer",
      reason:
        "the detach: D166 (`docs/adr/0166-a-chat-row-exists-from-the-creation-click.md`) claims on 'the first user message, generated turn, or explicit host write', and the detach is a server heal of a dangling pointer, not a host write",
    },
    {
      path: "packages/server/src/domain/chat/verbs/turn.ts",
      name: "restoreContinue",
      reason: "a continue snapshot exists only after a continue turn, which claimed the room in resolveTurnBase",
    },
  ],
};

// The private member each token's nominal class declares, by class name.
const TOKEN_MEMBERS = [
  ["RoomAdmissionMint", "roomAdmission"],
  ["RoomClaimMint", "roomClaim"],
  ["ClaimExemptMint", "claimExempt"],
] as const;

function namesToken(type: ts.Type): boolean {
  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(namesToken);
  }
  return TOKEN_MEMBERS.some(([owner, member]) =>
    (type.getProperty(member)?.declarations ?? []).some((declaration) => ts.isClassDeclaration(declaration.parent) && declaration.parent.name?.text === owner),
  );
}

const castMessage =
  "D166: a cast cannot prove a room token. Receive the RoomAdmission from a membership gate, the RoomClaim from the claim op, or mint at a site ROOM_TOKEN_MINT_SITES lists with its reason.";

const mintMessage = (mint: string): string =>
  `D166: only the sites ROOM_TOKEN_MINT_SITES lists for ${mint} may call it. Receive the token from the gate or the claim, or list the site with the reason it may mint.`;

/** Refuses a room-token mint read outside its listed sites, and any cast to a room-token type, outside {@link ROOM_TOKEN_HOME}. */
export const roomTokenMintRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    if (posixPath(relative(context.cwd, context.filename)) === ROOM_TOKEN_HOME) {
      return {};
    }
    const { checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
    const visitors: RuleVisitor = {};
    for (const [mint, sites] of Object.entries(ROOM_TOKEN_MINT_SITES)) {
      const report = (node: TSESTree.Node): void => {
        if (!inFunctionSite(context, node, sites)) {
          context.report({ node, message: mintMessage(mint) });
        }
      };
      visitors[`Identifier[name='${mint}']`] = (node: TSESTree.Identifier): void => {
        // A plain import binds the name for a listed site's call; an alias would hide every later call.
        const plainImport =
          node.parent.type === AST_NODE_TYPES.ImportSpecifier &&
          node.parent.imported.type === AST_NODE_TYPES.Identifier &&
          node.parent.imported.name === mint &&
          node.parent.local.name === mint;
        if (!plainImport) {
          report(node);
        }
      };
      // A computed member or a string import name spells the mint without an identifier.
      visitors[`:matches(MemberExpression[computed=true] > Literal.property, ImportSpecifier > Literal.imported)[value='${mint}']`] = report;
    }
    const cast = (node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion): void => {
      if (namesToken(checker.getTypeFromTypeNode(toTs.get(node.typeAnnotation) as ts.TypeNode))) {
        context.report({ node, message: castMessage });
      }
    };
    visitors[AST_NODE_TYPES.TSAsExpression] = cast;
    visitors[AST_NODE_TYPES.TSTypeAssertion] = cast;
    return visitors;
  },
};
