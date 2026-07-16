// Gate: sole-env-reader (Tier-2-Foundation.md invariant #1) — `foundation/env` is the ONE place that
// touches `process.env`; every other tier imports the frozen `env` object. biome's `noProcessEnv`
// already catches `process.env.X`; this gate is the AST backstop that also catches the bracket trick
// `process["env"]` and reads only real access nodes (comments naming process.env are ignored).
// `domain/sessions`' sanctioned call-time reads are allowlisted below.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const ENV_HOME = /\/packages\/server\/src\/foundation\/env\//u;

// The ONE sanctioned call-time process.env EXCEPTION: the
// role-derivation policy reads exactly these vars at CALL time (not via the frozen `env`) so per-test
// `vi.stubEnv` drives the role/access matrix. Allowlisted to THIS ONE file + EXACTLY these keys — any other
// key, or any process.env read elsewhere in the domain, stays RED. OIDC_ADMIN_GROUPS / OIDC_ALLOWED_GROUPS
// are the group→role governance vars (admin grant + login gate; declared in foundation/env, read here).
const ROLE_POLICY = /\/packages\/server\/src\/domain\/sessions\/substrate\/role-policy\.ts$/u;
const SANCTIONED_KEYS = new Set(["OWNER_HANDLES", "OWNER_GROUP", "RE_DERIVE_ROLE_ON_LOGIN", "OIDC_ADMIN_GROUPS", "OIDC_ALLOWED_GROUPS"]);
// A `process.env` node is a sanctioned role-policy read iff it is the object of `process.env["<KEY>"]`
// where KEY is one of the three allowlisted vars.
function isSanctionedRolePolicyRead(node: Node): boolean {
  const parent = node.getParent();
  if (parent === undefined || !Node.isElementAccessExpression(parent)) {
    return false;
  }
  const arg = parent.getArgumentExpression();
  return arg !== undefined && Node.isStringLiteral(arg) && SANCTIONED_KEYS.has(arg.getLiteralText());
}

// Is this node a `process.env` access (property `process.env` or element `process["env"]`)?
function isProcessEnvAccess(node: Node): boolean {
  if (Node.isPropertyAccessExpression(node)) {
    const obj = node.getExpression();
    return Node.isIdentifier(obj) && obj.getText() === "process" && node.getName() === "env";
  }
  if (Node.isElementAccessExpression(node)) {
    const obj = node.getExpression();
    const arg = node.getArgumentExpression();
    return Node.isIdentifier(obj) && obj.getText() === "process" && arg !== undefined && Node.isStringLiteral(arg) && arg.getLiteralText() === "env";
  }
  return false;
}

const SOLE_ENV_MESSAGE =
  "reads process.env outside foundation/env — env is the SOLE reader; import the frozen `env` and dot-access a typed key (core/Tier-2-Foundation.md inv #1).";

export const gate: GateDescriptor = {
  name: "sole-env-reader",
  docRow: "core/Tier-2-Foundation.md inv #1 (Core-Laws-and-Precedents.md)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: SOLE_ENV_MESSAGE,
  fix: "import the frozen `env` from foundation/env and dot-access a typed key; foundation/env is the ONE place that touches process.env.",
  scanRoot: (p) => p.includes("packages/server/src/") && !ENV_HOME.test(`/${p}`),
  kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
  visit: (node, sf, ctx) => {
    if (!isProcessEnvAccess(node)) {
      return;
    }
    if (ROLE_POLICY.test(sf.getFilePath()) && isSanctionedRolePolicyRead(node)) {
      return;
    }
    ctx.report(node, { token: "process.env", offset: 0 });
  },
  mustFlag: [
    {
      files: "export const x = process.env.SOME_VAR;\n",
      at: "packages/server/src/domain/hub/x.ts",
      why: "a process.env read outside foundation/env — env is the sole reader (inv #1)",
    },
    {
      files: 'export const x = process["env"].SOME_VAR;\n',
      at: "packages/server/src/domain/hub/y.ts",
      why: 'the bracket trick process["env"] the property-form biome rule can miss — the AST backstop',
    },
  ],
  mustPass: [
    {
      files: "// process.env is only read in foundation/env (inv #1)\nexport const x = 1;\n",
      at: "packages/server/src/domain/hub/z.ts",
      why: "a process.env mention in a COMMENT — only real access nodes are read, docs are exempt",
    },
    {
      files: 'export const owners = process.env["OWNER_HANDLES"];\n',
      at: "packages/server/src/domain/sessions/substrate/role-policy.ts",
      why: "the sanctioned call-time role-policy read (OWNER_HANDLES in role-policy.ts) — the isSanctionedRolePolicyRead allowlist, passes",
    },
  ],
};
