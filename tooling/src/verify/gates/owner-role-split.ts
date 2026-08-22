// Gate: owner-role-split (ledger D17; Spine-Identity invariant #6) — `can()` is the ONLY
// privilege-comparison site: `owner ⊇ admin` lives inside domain/admin/guard.ts and nowhere else. A
// scattered `role === "owner"`/`"admin"` comparison re-spells the privilege lattice (a delegated admin
// silently gaining/losing owner surface). Scans every server source for a global-role literal compared
// against anything, outside the one allowlisted guard file — assignments (derivation/boot-seed writes) don't match, only comparisons do.
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the guard is SCANNED and exempted by a cited row
// plus the shared RENAME TRIPWIRE, not scoped out of scanRoot — a privilege seam that moves must go RED at
// its new path, not carry its exemption there silently.
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const SERVER_SRC = /\/packages\/server\/src\//u;
const GATE_SELF = "tooling/src/verify/gates/owner-role-split.ts";

/** The ONE privilege-comparison site. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/server/src/domain/admin/guard.ts": {
    why: "THE privilege seam (D17, Spine-Identity inv #6) — `owner ⊇ admin` is DECIDED here, so the lattice must be spelled here exactly once. Ends when the guard moves: the rename tripwire reds the row at its dead path",
  },
};
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
  scanRoot: (p) => SERVER_SRC.test(`/${p}`),
  kinds: [SyntaxKind.BinaryExpression],
  visit: (node, sf, ctx) => {
    if (!node.isKind(SyntaxKind.BinaryExpression)) {
      return;
    }
    if (!EQUALITY_OPS.has(node.getOperatorToken().getText())) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (isRoleCompare(node.getLeft().getText(), node.getRight().getText())) {
      ctx.report(node, { token: "role === owner/admin", offset: 0 });
    }
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "privilege seam" });
  },
  mustFlag: [
    {
      files: 'export const isOwner = (r: { role: string }) => r.role === "owner";\n',
      at: "packages/server/src/domain/hub/x.ts",
      why: "a global-role literal comparison outside the guard — re-spells the privilege lattice (D17)",
    },
    {
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
        "packages/server/src/domain/hub/z.ts": "export const z = 1;\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the shared anchor is loaded but domain/admin/guard.ts resolves to no file — the privilege seam moved, and the old scanRoot exclusion would have kept exempting a dead path while the real seam went unjudged",
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
      why: "THE ALLOWLIST ITSELF: the SAME owner comparison INSIDE domain/admin/guard.ts — the one privilege seam is now SCANNED and passes only on a cited SANCTIONED_HOMES row",
    },
  ],
};
