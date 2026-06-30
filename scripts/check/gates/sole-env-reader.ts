// Gate: sole-env-reader (tiers/foundation.md invariant #1, ENFORCEMENT.md) — `foundation/env` is the ONE
// place that touches `process.env`. Every other tier imports the frozen `env` object and dot-accesses a
// typed key. biome's `noProcessEnv` (scoped-off only for foundation/env) already catches the property form
// `process.env.X`; this gate is the AST backstop that ALSO catches the bracket trick `process["env"]`
// (which biome's global rule can miss) and reads only real access nodes — comments naming `process.env`
// (e.g. the agent-sdk firewall docs) are ignored. When `domain/sessions` lands its sanctioned call-time
// reads (foundation.md inv #1), allowlist them here.
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SERVER_SRC = "/packages/server/src/";
const ENV_HOME = /\/packages\/server\/src\/foundation\/env\//u;

// The ONE sanctioned call-time process.env EXCEPTION (sessions.md §Esoteric, invariant #10): the
// role-derivation policy reads exactly these three vars at CALL time (not via the frozen `env`) so per-test
// `vi.stubEnv` drives the role matrix. Allowlisted to THIS ONE file + EXACTLY these keys — any other key,
// or any process.env read elsewhere in the domain, stays RED.
const ROLE_POLICY = /\/packages\/server\/src\/domain\/sessions\/substrate\/role-policy\.ts$/u;
const SANCTIONED_KEYS = new Set(["OWNER_HANDLES", "OWNER_GROUP", "RE_DERIVE_ROLE_ON_LOGIN"]);

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

// A `process.env` node is a sanctioned role-policy read iff it is the object of `process.env["<KEY>"]`
// where KEY is one of the three allowlisted vars.
function isSanctionedRolePolicyRead(node: Node): boolean {
  const parent = node.getParent();
  if (parent === undefined || !Node.isElementAccessExpression(parent)) {
    return false;
  }
  const arg = parent.getArgumentExpression();
  return (
    arg !== undefined && Node.isStringLiteral(arg) && SANCTIONED_KEYS.has(arg.getLiteralText())
  );
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
    return (
      Node.isIdentifier(obj) &&
      obj.getText() === "process" &&
      arg !== undefined &&
      Node.isStringLiteral(arg) &&
      arg.getLiteralText() === "env"
    );
  }
  return false;
}

function scan(sf: SourceFile, root: string, out: Violation[]): void {
  const isRolePolicy = ROLE_POLICY.test(sf.getFilePath());
  for (const node of sf.getDescendants()) {
    if (isProcessEnvAccess(node)) {
      if (isRolePolicy && isSanctionedRolePolicyRead(node)) {
        continue;
      }
      out.push({
        file: relPath(root, sf.getFilePath()),
        line: node.getStartLineNumber(),
        message:
          "reads process.env outside foundation/env — env is the SOLE reader; import the frozen `env` and dot-access a typed key (tiers/foundation.md inv #1).",
      });
    }
  }
}

export const soleEnvReader: Check = {
  name: "sole-env-reader",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!path.includes(SERVER_SRC) || ENV_HOME.test(path)) {
        continue;
      }
      scan(sf, root, violations);
    }
    return violations;
  },
};
