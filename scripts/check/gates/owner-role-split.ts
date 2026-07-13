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
import type { GateDescriptor } from "../contract.ts";

const SERVER_SRC = /\/packages\/server\/src\//u;
const ALLOWLIST = /\/packages\/server\/src\/domain\/admin\/guard\.ts$/u;
const ROLE_LITERALS = new Set(['"owner"', '"admin"', "'owner'", "'admin'"]);
const EQUALITY_OPS = new Set(["==", "===", "!=", "!=="]);
const ROLE_REF = /(?:^|\.)role$/iu;

const MESSAGE =
  "global-role literal comparison outside domain/admin/guard.ts — can() is the ONE privilege seam (D17; Spine-Identity inv #6): owner ⊇ admin lives inside it, everything else calls can()/requireAdmin/requireOwner and never re-spells the lattice.";

/** `<x>.role === "owner"|"admin"` (either operand order). */
function isRoleCompare(leftText: string, rightText: string): boolean {
  if (ROLE_LITERALS.has(rightText) && ROLE_REF.test(leftText)) {
    return true;
  }
  return ROLE_LITERALS.has(leftText) && ROLE_REF.test(rightText);
}

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b)) ──────────────────────────────────────────────
// The legacy predicate as a BinaryExpression subscription: a global-role literal compared (either side)
// in server-src outside the ONE allowlisted guard file. scanRoot mirrors the legacy SERVER_SRC ∧ ¬ALLOWLIST
// filter. Per-occurrence (each role comparison).
export const gate: GateDescriptor = {
  name: "owner-role-split",
  docRow: "ledger D17 (Spine-Identity inv #6)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "call can()/requireAdmin/requireOwner — the privilege lattice (owner ⊇ admin) lives ONLY inside domain/admin/guard.ts.",
  scanRoot: (p) => SERVER_SRC.test(`/${p}`) && !ALLOWLIST.test(`/${p}`),
  kinds: [SyntaxKind.BinaryExpression],
  visit: (node, _sf, ctx) => {
    if (!node.isKind(SyntaxKind.BinaryExpression)) {
      return;
    }
    if (!EQUALITY_OPS.has(node.getOperatorToken().getText())) {
      return;
    }
    if (isRoleCompare(node.getLeft().getText(), node.getRight().getText())) {
      ctx.report(node, { token: "role === owner/admin", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: 'export const isOwner = (r: { role: string }) => r.role === "owner";\n',
      at: "packages/server/src/domain/hub/x.ts",
      why: "a global-role literal comparison outside the guard — re-spells the privilege lattice (D17)",
    },
  ],
  mustPass: [
    {
      files: 'export const isHost = (r: { role: string }) => r.role === "host";\n',
      at: "packages/server/src/domain/hub/y.ts",
      why: "a NON-global role (host) comparison — only owner/admin are the confined privilege lattice",
    },
  ],
};
