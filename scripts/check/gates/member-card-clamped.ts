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
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

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

/** `interface MemberCardView` / `type MemberCardView =` outside contracts. */
function duplicateViewDeclarations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const decl of [...sf.getInterfaces(), ...sf.getTypeAliases()]) {
    if (decl.getName() === VIEW_TYPE) {
      out.push({ file: rel, line: decl.getStartLineNumber(), message: TYPE_MESSAGE });
    }
  }
  return out;
}

/** A clamp-symbol FUNCTION/VARIABLE declaration outside the clamp home (re-exports don't declare). */
function strayClampDeclarations(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (name !== undefined && CLAMP_SYMBOLS.has(name)) {
      out.push({ file: rel, line: fn.getStartLineNumber(), message: CLAMP_MESSAGE });
    }
  }
  for (const v of sf.getVariableDeclarations()) {
    if (CLAMP_SYMBOLS.has(v.getName())) {
      out.push({ file: rel, line: v.getStartLineNumber(), message: CLAMP_MESSAGE });
    }
  }
  return out;
}

/** Any `getRosterCardView` identifier in server src (property key, import, call — all resurrection). */
function resurrectedVerb(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() === DELETED_VERB) {
      out.push({ file: rel, line: id.getStartLineNumber(), message: VERB_MESSAGE });
    }
  }
  return out;
}

export const memberCardClamped: Check = {
  name: "member-card-clamped",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!CONTRACTS.test(path)) {
        violations.push(...duplicateViewDeclarations(sf, relPath(root, path)));
      }
      if (SERVER_SRC.test(path)) {
        if (!CLAMP_HOME.test(path)) {
          violations.push(...strayClampDeclarations(sf, relPath(root, path)));
        }
        violations.push(...resurrectedVerb(sf, relPath(root, path)));
      }
    }
    return violations;
  },
};
