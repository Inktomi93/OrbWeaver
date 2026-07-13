// Gate: member-card-clamped (ledger D22; PD-111) — a roster member's card read has ONE clamp.
// `MemberCardView` (the level-clamped projection) lives in `@orb/contracts/chat`, and the ONLY
// producer is chat's `clampMemberCard`/`resolveCardVisibility` (domain/chat/substrate/auth/clamp.ts,
// keyed to `chatMetadata.group.memberCardVisibility`; host ⇒ `full`). PD-111's founding catch: the
// character domain had grown a SECOND clamp (`getRosterCardView` + its own divergent `MemberCardView`
// — `creatorNotes` at the WRONG level, `tags`/`lore` missing) — adjudicated 2026-07-03, chat's clamp
// canonical (ledger-exact), the duplicate deleted. The three regression freezes:
//   • one-home TYPE — no `MemberCardView` interface/type-alias DECLARATION outside
//     `packages/contracts/` (a re-spelled local shape is how the levels diverged).
//   • one CLAMP — no `clampMemberCard`/`resolveCardVisibility` declaration outside
//     `domain/chat/substrate/auth/` (a second decision site re-spells the level lattice).
//   • resurrection freeze — the identifier `getRosterCardView` is banned in server src (the deleted
//     duplicate's name; the sanctioned surface is the matrix's non-verb `roster-card-read`, served
//     by chat over the one clamp).
// NOT gated: `.memberCardVisibility` property reads — config plumbing (turn.ts's group normalizer)
// legitimately copies the knob; only the field-gating DECISION is confined, and that is the symbols.
import type { Node } from "ts-morph";
import { Node as NodeGuards, SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";

const CONTRACTS = /\/packages\/contracts\//u;
const SERVER_SRC = /\/packages\/server\/src\//u;
const CLAMP_HOME = /\/packages\/server\/src\/domain\/chat\/substrate\/auth\//u;
const VIEW_TYPE = "MemberCardView";
const CLAMP_SYMBOLS = new Set(["clampMemberCard", "resolveCardVisibility"]);
const DELETED_VERB = "getRosterCardView";

const TYPE_MESSAGE =
  "MemberCardView declared outside @orb/contracts — the level-clamped projection has ONE home (contracts/chat; D22/PD-111): a re-spelled local shape is exactly how the clamp levels diverged. Import the contracts type.";
const CLAMP_MESSAGE =
  "clamp symbol declared outside domain/chat/substrate/auth/ — clampMemberCard/resolveCardVisibility are the ONE D22 decision site (PD-111): a second clamp re-spells the visibility lattice.";
const VERB_MESSAGE =
  "getRosterCardView resurrected — PD-111 deleted this duplicate clamp; the sanctioned surface is the matrix's non-verb roster-card-read, served by chat over clampMemberCard (D22 — Core-Laws-and-Precedents.md §7 D22).";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b) — multi-arm, per-arm SCOPE) ────────────────────
// Three arms, THREE scopes, THREE messages — ONE gate. The type arm (MemberCardView decl outside
// contracts), the clamp arm (clampMemberCard/resolveCardVisibility decl outside the clamp home), and the
// resurrection arm (getRosterCardView identifier in server src). Because the arms have DIFFERENT path
// scopes that overlap differently, there is NO single scanRoot — each arm re-checks the file path inside
// visit (exactly as the legacy run). Each finding carries its arm's own message. Per-occurrence. Kept
// ALONGSIDE the legacy Check.
function reportAt(ctx: GateRunCtx, node: Node, message: string, token: string): void {
  const sf = node.getSourceFile();
  const finding: Finding = {
    file: relPath(ctx.root, sf.getFilePath()),
    line: node.getStartLineNumber(),
    column: sf.getLineAndColumnAtPos(node.getStart()).column,
    message,
    token,
  };
  ctx.report(finding);
}

/** The declared name of a clamp-symbol function/variable declaration node, else undefined. */
function clampDeclName(node: Node): string | undefined {
  if (NodeGuards.isFunctionDeclaration(node)) {
    return node.getName();
  }
  return NodeGuards.isVariableDeclaration(node) ? node.getName() : undefined;
}

export const gate: GateDescriptor = {
  name: "member-card-clamped",
  docRow: "ledger D22 / PD-111 (Core-Laws-and-Precedents.md §7 D22)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: TYPE_MESSAGE,
  fix: "MemberCardView has ONE home (@orb/contracts/chat); the clamp lives ONLY in domain/chat/substrate/auth/; getRosterCardView is deleted — use the matrix's roster-card-read.",
  // No scanRoot: the three arms scope themselves per-file (contracts / server-src / clamp-home) inside
  // visit, exactly as the legacy run.
  kinds: [
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.VariableDeclaration,
    SyntaxKind.Identifier,
  ],
  visit: (node, sf, ctx) => {
    const path = sf.getFilePath();
    // Type arm: a MemberCardView interface/type-alias declaration outside contracts.
    if (
      (NodeGuards.isInterfaceDeclaration(node) || NodeGuards.isTypeAliasDeclaration(node)) &&
      node.getName() === VIEW_TYPE &&
      !CONTRACTS.test(path)
    ) {
      reportAt(ctx, node, TYPE_MESSAGE, VIEW_TYPE);
      return;
    }
    if (!SERVER_SRC.test(path)) {
      return;
    }
    // Clamp arm: a clamp-symbol function/variable declaration outside the clamp home.
    const clampName = CLAMP_HOME.test(path) ? undefined : clampDeclName(node);
    if (clampName !== undefined && CLAMP_SYMBOLS.has(clampName)) {
      reportAt(ctx, node, CLAMP_MESSAGE, clampName);
      return;
    }
    // Resurrection arm: the deleted-verb identifier anywhere in server src.
    if (NodeGuards.isIdentifier(node) && node.getText() === DELETED_VERB) {
      reportAt(ctx, node, VERB_MESSAGE, DELETED_VERB);
    }
  },
  mustFlag: [
    {
      files: "export interface MemberCardView { name: string }\n",
      at: "packages/server/src/domain/character/x.ts",
      expect: { messageIncludes: "ONE home" },
      why: "a re-spelled MemberCardView outside contracts — exactly how the clamp levels diverged (PD-111)",
    },
    {
      files: "export function clampMemberCard() {}\n",
      at: "packages/server/src/domain/character/y.ts",
      expect: { messageIncludes: "ONE D22 decision site" },
      why: "a second clamp declaration outside the clamp home — re-spells the visibility lattice",
    },
    {
      files: "export const use = getRosterCardView;\n",
      at: "packages/server/src/domain/character/z.ts",
      expect: { messageIncludes: "resurrected" },
      why: "the deleted duplicate verb resurrected in server src (D22)",
    },
  ],
  mustPass: [
    {
      files: "export interface MemberCardView { name: string }\n",
      at: "packages/contracts/src/chat/card.ts",
      why: "the MemberCardView declaration in its ONE home (contracts) — sanctioned, passes",
    },
    {
      files: "export function clampMemberCard() {}\n",
      at: "packages/server/src/domain/chat/substrate/auth/clamp.ts",
      why: "the clamp in its ONE home (domain/chat/substrate/auth) — the canonical decision site, passes",
    },
  ],
};
