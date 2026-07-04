// Gate: owner-role-split (ledger D17; Spine-Identity invariant #6) — `can()` is the ONLY
// privilege-comparison site: `owner ⊇ admin` lives inside `domain/admin/guard.ts` and NOWHERE else.
// A scattered `role === "owner"`/`"admin"` comparison re-spells the privilege lattice — the exact
// drift D17 exists to prevent (a delegated admin silently gaining/losing owner surface). This gate
// scans every server source for a GLOBAL-role literal compared against anything (either side of an
// equality) outside the one allowlisted guard file. Role DERIVATION (sessions' `determineRole`
// building the value) and role WRITES (boot seed) assign literals — assignments don't match; only
// comparisons do. The 2026-07-03 catch that motivated the allowlist being exactly ONE file: the
// auth seam's debug `isAdmin` re-implemented owner∪admin inline — now routed through
// `requireAdmin` (the seam fix landed with this gate).
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SERVER_SRC = /\/packages\/server\/src\//u;
const ALLOWLIST = /\/packages\/server\/src\/domain\/admin\/guard\.ts$/u;
const ROLE_LITERALS = new Set(['"owner"', '"admin"', "'owner'", "'admin'"]);
const EQUALITY_OPS = new Set(["==", "===", "!=", "!=="]);
const ROLE_REF = /(?:^|\.)role$/iu;

const MESSAGE =
  "global-role literal comparison outside domain/admin/guard.ts — can() is the ONE privilege seam (D17; Spine-Identity inv #6): owner ⊇ admin lives inside it, everything else calls can()/requireAdmin/requireOwner and never re-spells the lattice.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** `<x>.role === "owner"|"admin"` (either operand order). */
function isRoleCompare(leftText: string, rightText: string): boolean {
  if (ROLE_LITERALS.has(rightText) && ROLE_REF.test(leftText)) {
    return true;
  }
  return ROLE_LITERALS.has(leftText) && ROLE_REF.test(rightText);
}

export const ownerRoleSplit: Check = {
  name: "owner-role-split",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!SERVER_SRC.test(path) || ALLOWLIST.test(path)) {
        continue;
      }
      const rel = relPath(root, path);
      for (const bin of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
        if (!EQUALITY_OPS.has(bin.getOperatorToken().getText())) {
          continue;
        }
        if (isRoleCompare(bin.getLeft().getText(), bin.getRight().getText())) {
          violations.push({ file: rel, line: bin.getStartLineNumber(), message: MESSAGE });
        }
      }
    }
    return violations;
  },
};
