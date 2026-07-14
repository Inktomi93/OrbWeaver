// Gate: owner-role-split (ledger D17; Spine-Identity invariant #6) — `can()` is the ONLY
// privilege-comparison site: `owner ⊇ admin` lives inside domain/admin/guard.ts and nowhere else. A
// scattered `role === "owner"`/`"admin"` comparison re-spells the privilege lattice (a delegated admin
// silently gaining/losing owner surface). Scans every server source for a global-role literal compared
// against anything, outside the one allowlisted guard file — assignments (derivation/boot-seed writes) don't match, only comparisons do.
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
    {
      files: 'export const isOwner = (r: { role: string }) => r.role === "owner";\n',
      at: "packages/server/src/domain/admin/guard.ts",
      why: "the SAME owner comparison INSIDE the allowlisted domain/admin/guard.ts — the one privilege seam, passes (scanRoot exclusion)",
    },
  ],
};
