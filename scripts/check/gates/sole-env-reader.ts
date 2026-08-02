// Gate: sole-env-reader (Tier-2-Foundation.md invariant #1) — `foundation/env` is the ONE place that
// touches `process.env`; every other tier imports the frozen `env` object. biome's `noProcessEnv`
// already catches `process.env.X`; this gate is the AST backstop that also catches the bracket trick
// `process["env"]` and reads only real access nodes (comments naming process.env are ignored).
// `domain/sessions`' sanctioned call-time reads are allowlisted below.
//
// TWO-SIDED (gate-hub #10): the sanction ratchets DOWN — a SANCTIONED_KEYS entry that role-policy.ts does
// not read any more is RED (a dead licence to bypass the frozen `env` for that var), and so is the whole
// exception if role-policy.ts itself has left the project. The arm self-guards on a REAL-TREE ANCHOR
// (gate-hub #11): `foundation/env/index.ts`, the home this gate exists to protect — a conformance
// mini-project only has it when an example materializes it deliberately.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const ENV_HOME = /\/packages\/server\/src\/foundation\/env\//u;
const GATE_SELF = "scripts/check/gates/sole-env-reader.ts";
/** Real-tree anchor (gate-hub #11): the frozen-env home itself. */
const ANCHOR = "packages/server/src/foundation/env/index.ts";
const ROLE_POLICY_REL = "packages/server/src/domain/sessions/substrate/role-policy.ts";
const STALE_KEY_PREFIX =
  "stale SANCTIONED_KEYS entry — role-policy.ts no longer reads this var at call time, so the sanction is a dead licence to bypass the frozen `env` (ratchet down): ";
const STALE_HOME =
  "stale exception — the sanctioned call-time reader `packages/server/src/domain/sessions/substrate/role-policy.ts` is not in the project any more, so the whole ROLE_POLICY/SANCTIONED_KEYS exception is dead (ratchet down): delete it in scripts/check/gates/sole-env-reader.ts";

/** The sanctioned keys role-policy.ts actually read this run — the stale arm's truth set. */
const seenKeys = new Set<string>();

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
  if (!(arg !== undefined && Node.isStringLiteral(arg) && SANCTIONED_KEYS.has(arg.getLiteralText()))) {
    return false;
  }
  seenKeys.add(arg.getLiteralText());
  return true;
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

/** A role-policy source that reads exactly `keys` at call time — derived from the ledger itself so the
 *  stale arm's proofs never drift out of sync with SANCTIONED_KEYS. */
function rolePolicyReading(keys: readonly string[]): string {
  return keys.map((k, i) => `export const v${i} = process.env["${k}"];\n`).join("");
}
const ALL_SANCTIONED = [...SANCTIONED_KEYS];

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
  begin: () => {
    seenKeys.clear();
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    if (!fileLoaded(ctx, ROLE_POLICY_REL)) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE_HOME });
      return; // the whole exception is dead — per-key noise would only bury that
    }
    for (const key of SANCTIONED_KEYS) {
      if (!seenKeys.has(key)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_KEY_PREFIX}"${key}" — delete it from SANCTIONED_KEYS in scripts/check/gates/sole-env-reader.ts`,
        });
      }
    }
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
    {
      files: {
        [ANCHOR]: "export const env = {};\n",
        [ROLE_POLICY_REL]: rolePolicyReading(ALL_SANCTIONED.slice(1)),
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED_KEYS entry" },
      why: "THE STALE ARM at KEY grain: the anchor is loaded and role-policy reads every sanctioned var but the first — that key's licence to bypass the frozen `env` is dead and ratchets down (the example derives its source from the ledger, so it can never drift out of sync with it)",
    },
    {
      files: {
        [ANCHOR]: "export const env = {};\n",
      },
      expect: { count: 1, messageIncludes: "stale exception" },
      why: "the coarser staleness: the sanctioned reader file itself is gone, so the whole ROLE_POLICY exception is dead — reported ONCE instead of one-per-key",
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
      why: "the sanctioned call-time role-policy read (OWNER_HANDLES in role-policy.ts) — the isSanctionedRolePolicyRead allowlist, passes; and with no anchor in this project the stale arm stays silent",
    },
    {
      files: {
        [ANCHOR]: "export const env = {};\n",
        [ROLE_POLICY_REL]: rolePolicyReading(ALL_SANCTIONED),
      },
      why: "every sanctioned key STILL EARNED, judged against the real-tree anchor — the ledger mirrors the reader exactly, so neither arm fires",
    },
  ],
};
