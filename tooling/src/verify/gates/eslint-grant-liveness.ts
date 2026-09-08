// Gate: eslint-grant-liveness — every native `eslint.config.js` files/ignores selector keeps at least
// one member in its actual global or entry-local scope. Executable config is observed through the
// config-snapshot child and @eslint/config-array; imported values, basePath, negation, directories and
// AND selectors retain ESLint semantics. Findings use config-entry/field identity because derived values
// have no honest source line. COMMENT POSTURE: comment-SAFE — the gate reads evaluated config data.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EslintSelectorSnapshot, EslintSelectorValue } from "../contract/config-snapshot.ts";
import type { ExemptionTable, Finding, GateDescriptor, GateScanDeclaration } from "../contract/gate.ts";
import { readConfigSnapshot } from "../lib/config-snapshot.ts";
import type { GrantExemption } from "../lib/grant-liveness.ts";

const CONFIG_REL = "eslint.config.js";
const GATE_SELF = "tooling/src/verify/gates/eslint-grant-liveness.ts";
const GATE_FIXTURE_LAW = "tooling/src/verify/gates/GATE-AUTHORING.md";

type RatifiedRow = GrantExemption & { readonly value: EslintSelectorValue };

const RATIFIED: ExemptionTable<RatifiedRow> = {
  "config[0].ignores[0]": {
    value: "**/node_modules/**",
    why: "installed dependencies are absent from the tracked corpus by design. Delete this row when ESLint stops ignoring node_modules.",
    cite: ".gitignore",
  },
  "config[0].ignores[1]": {
    value: "**/dist/**",
    why: "build output is absent from the tracked corpus by design. Delete this row when packages stop emitting dist/.",
    cite: ".gitignore",
  },
  "config[0].ignores[3]": {
    value: "**/__g_*",
    why: "check-gates materialises the reserved __g_ fixtures only transiently. Delete this row when that sentinel is retired.",
    cite: GATE_FIXTURE_LAW,
  },
};

const MESSAGE =
  "an evaluated ESLint files/ignores selector has ZERO members in its native scope — the rule block or " +
  "grant is dead, and a later file can inherit policy nobody re-approved. Re-point or delete the selector; " +
  "only a by-construction absent population may be ratified with a reason, end condition, and live cite.";
const MSG_MISSING = "eslint.config.js is not at the repo root — this gate's subject is gone, so its verdict is unknowable.";
const MSG_UNREADABLE =
  "eslint.config.js could not be evaluated into a complete native selector snapshot; malformed, unsupported, " +
  "empty, or failed imports must refuse rather than shrink the observed population.";
const MSG_STALE = "an eslint-grant-liveness RATIFIED identity no longer names the same zero-member selector — delete or re-derive the row.";
const MSG_DEAD_CITE = "an eslint-grant-liveness RATIFIED cite no longer resolves — the decision that justified it is gone.";

function identity(row: EslintSelectorSnapshot): string {
  return `${row.owner}.${row.field}[${String(row.position)}]`;
}

function sameValue(left: EslintSelectorValue, right: EslintSelectorValue): boolean {
  return typeof left === "string" || typeof right === "string"
    ? left === right
    : left.length === right.length && left.every((value, index) => value === right[index]);
}

function fileFinding(message: string, token?: string): Finding {
  return token === undefined ? { file: CONFIG_REL, line: 0, column: 0, message } : { file: CONFIG_REL, line: 0, column: 0, token, message };
}

interface Outcome {
  readonly findings: readonly Finding[];
  readonly declaration: GateScanDeclaration;
}

function scanEslintGrantLiveness(root: string): Outcome {
  if (!existsSync(join(root, CONFIG_REL))) {
    return { findings: [fileFinding(MSG_MISSING)], declaration: { unit: "ESLint selector", candidates: 0, scanned: 0 } };
  }
  if (!existsSync(join(root, GATE_SELF))) {
    return { findings: [], declaration: { unit: "ESLint selector", candidates: 0, scanned: 0 } };
  }
  const read = readConfigSnapshot(root, "eslint", CONFIG_REL);
  if (read.kind === "unreadable") {
    return {
      findings: [fileFinding(`${MSG_UNREADABLE} (${read.detail})`)],
      declaration: { unit: "ESLint selector", candidates: 0, scanned: 0 },
    };
  }
  const selectors = read.snapshot.selectors;
  const findings: Finding[] = [];
  const byIdentity = new Map(selectors.map((row) => [identity(row), row]));
  let ratified = 0;
  for (const row of selectors) {
    if (row.members > 0) {
      continue;
    }
    const key = identity(row);
    const allowance = RATIFIED[key];
    if (allowance !== undefined && sameValue(row.value, allowance.value)) {
      ratified += 1;
      continue;
    }
    findings.push(fileFinding(MESSAGE, key));
  }
  for (const [key, allowance] of Object.entries(RATIFIED)) {
    const row = byIdentity.get(key);
    if (row === undefined || row.members !== 0 || !sameValue(row.value, allowance.value)) {
      findings.push(fileFinding(MSG_STALE, key));
    } else if (!existsSync(join(root, allowance.cite))) {
      findings.push(fileFinding(MSG_DEAD_CITE, allowance.cite));
    }
  }
  return {
    findings,
    declaration: {
      unit: "ESLint selector",
      candidates: selectors.length,
      scanned: selectors.length,
      admitted: ratified,
      admittedRatified: ratified,
      population: [{ source: "native ESLint config entries", members: read.snapshot.entries }],
    },
  };
}

export const gate: GateDescriptor = {
  name: "eslint-grant-liveness",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  scanRoot: () => false,
  message: MESSAGE,
  fix: "delete or re-point the zero-member selector in eslint.config.js; ratify only a population absent by construction.",
  run: (ctx) => {
    const outcome = scanEslintGrantLiveness(ctx.root);
    ctx.scan(outcome.declaration);
    for (const finding of outcome.findings) {
      ctx.report(finding);
    }
  },
  mustFlag: [
    {
      files: { "not-eslint.config.js": "export default [];\n" },
      expect: { count: 1, messageIncludes: "not at the repo root" },
      why: "the exact config identity disappearing is a refused verdict, never a silent pass",
    },
  ],
  mustPass: [
    {
      files: { [CONFIG_REL]: 'export default [{ files: ["packages/ui/src/**/*.ts"] }];\n' },
      why: "native population proofs require a Git inventory and are permanently pinned in the focused integration suite",
    },
  ],
};
