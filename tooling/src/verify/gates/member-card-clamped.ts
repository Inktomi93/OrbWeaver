// Gate: member-card-clamped (ledger D22; PD-111) — a roster member's card read has ONE clamp.
// `MemberCardView` lives in `@orb/contracts/chat`; the only producer is chat's
// `clampMemberCard`/`resolveCardVisibility` (domain/chat/substrate/auth/clamp.ts). PD-111 found the
// character domain had grown a second, divergent clamp (`getRosterCardView`) — deleted, chat's canonical.
// Three freezes: no `MemberCardView` declaration outside packages/contracts/; no clamp declaration outside domain/chat/substrate/auth/; `getRosterCardView` banned in server src.
import type { Node } from "ts-morph";
import { Node as NodeGuards, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";

const CONTRACTS = /\/packages\/contracts\//u;
const SERVER_SRC = /\/packages\/server\/src\//u;
const CLAMP_HOME = /\/packages\/server\/src\/domain\/chat\/substrate\/auth\//u;
const VIEW_TYPE = "MemberCardView";
const CLAMP_SYMBOLS = new Set(["clampMemberCard", "resolveCardVisibility"]);
const DELETED_VERB = "getRosterCardView";

// Three arms, THREE scopes — ONE group message; the node overload (§1, GATE-AUTHORING.md) carries no
// per-finding message, so the `token` (VIEW_TYPE / the clamp symbol name / DELETED_VERB) is what
// distinguishes which arm fired; see mustFlag below.
const GROUP_MESSAGE =
  "a member-card clamp boundary broke: MemberCardView declared outside @orb/contracts (the level-clamped " +
  "projection has ONE home — contracts/chat), a clamp symbol (clampMemberCard/resolveCardVisibility) " +
  "declared outside domain/chat/substrate/auth/ (the ONE D22 decision site), or the deleted duplicate verb " +
  "getRosterCardView resurrected in server src — a re-spelled local shape or a second clamp is exactly how " +
  "the clamp levels diverged before (D22/PD-111 — Core-Laws-and-Precedents.md §7 D22).";

/** The declared name of a clamp-symbol function/variable declaration node, else undefined. */
function clampDeclName(node: Node): string | undefined {
  if (NodeGuards.isFunctionDeclaration(node)) {
    return node.getName();
  }
  return NodeGuards.isVariableDeclaration(node) ? node.getName() : undefined;
}

/** The declaration's own NAME node — reporting on it, at offset 0, is trivially an exact self-slice of its
 *  own text (the runtime requires a node-anchored `token` to be an exact slice of `node.getText()`, and a
 *  whole declaration's text starts with its modifiers/keyword, never the bare identifier). */
function nameNode(node: Node): Node | undefined {
  if (NodeGuards.isInterfaceDeclaration(node) || NodeGuards.isTypeAliasDeclaration(node) || NodeGuards.isFunctionDeclaration(node)) {
    return node.getNameNode();
  }
  return NodeGuards.isVariableDeclaration(node) ? node.getNameNode() : undefined;
}

function reportName(report: GatePolicyContext["report"], node: Node, token: string): void {
  const target = nameNode(node) ?? node;
  report.node(target, { token, offset: 0 });
}

export const gate = defineGate({
  id: "member-card-clamped",
  family: "member-card-clamped",
  // The legacy descriptor carried no `markerImmune`, so it was suppressible via the ordinary
  // `@orb-gate-ignore` marker like any other gate — never a hard, unsuppressible boundary.
  authority: "ordinary",
  severity: "error",
  // No scanRoot in the legacy shape: absence there means admit-all over the shared harness workspace,
  // and `@authored` is the closest declared population (tooling/src/_shared/ts-workspace.ts harnessGlobs).
  // `@authored` is a LITERAL nine-root list — client, ui, server, db, contracts, kit, tooling/src, tests/,
  // scripts/ — so it is NOT "every packages/*/src": `packages/showcase-plugins/src` is a root of its own
  // (`@showcase`) and is outside `@authored` today. See contract/population.ts, which records that gap as
  // open rather than settled. The three arms scope themselves per-file (contracts / server-src /
  // clamp-home) inside the visitor, unchanged from the legacy `visit`.
  population: "@authored",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: GROUP_MESSAGE,
  fix:
    "MemberCardView has ONE home (@orb/contracts/chat); the clamp lives ONLY in domain/chat/substrate/auth/; " +
    "getRosterCardView is deleted — use the matrix's roster-card-read. A deliberate site is waived with " +
    "`@orb-waive member-card-clamped(<position>): <reason>` on the line above, where <position> is whichever " +
    "of the three arms fired: the literal `MemberCardView`, the clamp symbol's own name " +
    "(`clampMemberCard`/`resolveCardVisibility`), or the literal `getRosterCardView`.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [
          SyntaxKind.InterfaceDeclaration,
          SyntaxKind.TypeAliasDeclaration,
          SyntaxKind.FunctionDeclaration,
          SyntaxKind.VariableDeclaration,
          SyntaxKind.Identifier,
        ],
        visit: (node) => {
          const path = node.getSourceFile().getFilePath();
          // Type arm: a MemberCardView interface/type-alias declaration outside contracts.
          if ((NodeGuards.isInterfaceDeclaration(node) || NodeGuards.isTypeAliasDeclaration(node)) && node.getName() === VIEW_TYPE && !CONTRACTS.test(path)) {
            reportName(ctx.report, node, VIEW_TYPE);
            return;
          }
          if (!SERVER_SRC.test(path)) {
            return;
          }
          // Clamp arm: a clamp-symbol function/variable declaration outside the clamp home.
          const clampName = CLAMP_HOME.test(path) ? undefined : clampDeclName(node);
          if (clampName !== undefined && CLAMP_SYMBOLS.has(clampName)) {
            reportName(ctx.report, node, clampName);
            return;
          }
          // Resurrection arm: the deleted-verb identifier anywhere in server src — the node IS the
          // identifier, so its own text is trivially the exact slice.
          if (NodeGuards.isIdentifier(node) && node.getText() === DELETED_VERB) {
            ctx.report.node(node, { token: DELETED_VERB, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/character/x.ts": "export interface MemberCardView { name: string }\n" },
      expect: { count: 1, token: VIEW_TYPE },
      why: "a re-spelled MemberCardView outside contracts — exactly how the clamp levels diverged (PD-111)",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/character/y.ts": "export function clampMemberCard() {}\n" },
      expect: { count: 1, token: "clampMemberCard" },
      why: "a second clamp declaration outside the clamp home — re-spells the visibility lattice",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/character/z.ts": "export const use = getRosterCardView;\n" },
      expect: { count: 1, token: DELETED_VERB },
      why: "the deleted duplicate verb resurrected in server src (D22)",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/contracts/src/chat/card.ts": "export interface MemberCardView { name: string }\n" },
      why: "the MemberCardView declaration in its ONE home (contracts) — sanctioned, passes",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/substrate/auth/clamp.ts": "export function clampMemberCard() {}\n" },
      why: "the clamp in its ONE home (domain/chat/substrate/auth) — the canonical decision site, passes",
    },
    {
      mode: "source",
      files: { "packages/contracts/src/chat/card.ts": "export const note = getRosterCardView;\n" },
      why: "the resurrection-verb identifier OUTSIDE server-src (in contracts) — the verb arm's SERVER_SRC scope, passes",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/character/x.ts":
          "// @orb-waive member-card-clamped(MemberCardView): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export interface MemberCardView { name: string }\n",
      },
      why: "POSITIONAL IDENTITY: the type arm reports on the declaration's NAME node (reportName), so the position is the type name `MemberCardView`, never the `interface` keyword its declaration text starts with. Built on the type-arm mustFlag row — a ONE-finding fixture, and one marker consumes one occurrence",
    },
  ],
});
