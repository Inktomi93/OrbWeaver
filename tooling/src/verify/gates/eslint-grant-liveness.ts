// Gate: eslint-grant-liveness — every native `eslint.config.js` files/ignores selector keeps at least
// one member in its actual global or entry-local scope. Executable config is observed through the
// `native-config` ResourceHost fact (config-snapshot child + @eslint/config-array); imported values,
// basePath, negation, directories and AND selectors retain ESLint semantics. Findings use config-entry/field
// identity because derived values have no honest source line. A `native-config` resource that cannot resolve
// (missing/malformed eslint.config.js) makes population resolution itself throw — the fail-LOUD requirement
// is the runtime's own refusal now, not a reportable arm of this policy (see the permanent-pin test).
// COMMENT POSTURE: comment-SAFE — the policy reads evaluated config data, never source text.
import type { EslintSelectorSnapshot, EslintSelectorValue } from "../contract/config-snapshot.ts";
import type { ExemptionTable } from "../contract/gate.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { GrantExemption } from "../lib/grant-liveness.ts";

const CONFIG_REL = "eslint.config.js";
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
  "config[0].ignores[4]": {
    value: ".stryker-tmp/**",
    why: "Stryker writes rewritten copies and generated runner setup outside the authored corpus. Delete this row when its sandbox directory changes or mutation execution is retired.",
    cite: "tooling/src/_shared/stryker-config.ts",
  },
  "config[0].ignores[5]": {
    value: ".cache/**",
    why: "local tools write derived, refetchable cache artifacts outside the tracked corpus. Delete this row when the cache root changes or the repository starts tracking authored files there.",
    cite: ".gitignore",
  },
};

const MESSAGE =
  "an evaluated ESLint files/ignores selector has ZERO members in its native scope — the rule block or " +
  "grant is dead, and a later file can inherit policy nobody re-approved. Re-point or delete the selector; " +
  "only a by-construction absent population may be ratified with a reason, end condition, and live cite.";
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

function reportDeadSelectors(ctx: GatePolicyContext, selectors: readonly EslintSelectorSnapshot[]): void {
  for (const row of selectors) {
    if (row.members > 0) {
      continue;
    }
    const key = identity(row);
    const allowance = RATIFIED[key];
    if (allowance !== undefined && sameValue(row.value, allowance.value)) {
      continue;
    }
    ctx.report.file(CONFIG_REL, { line: 1, column: 1, token: key, message: MESSAGE });
  }
}

function reportRatifiedArms(ctx: GatePolicyContext, byIdentity: ReadonlyMap<string, EslintSelectorSnapshot>, trackedSet: ReadonlySet<string>): void {
  for (const [key, allowance] of Object.entries(RATIFIED)) {
    const row = byIdentity.get(key);
    if (row === undefined || row.members !== 0 || !sameValue(row.value, allowance.value)) {
      ctx.report.file(CONFIG_REL, { line: 1, column: 1, token: key, message: MSG_STALE });
    } else if (!trackedSet.has(allowance.cite)) {
      ctx.report.file(CONFIG_REL, { line: 1, column: 1, token: allowance.cite, message: MSG_DEAD_CITE });
    }
  }
}

export const gate = defineGate({
  id: "eslint-grant-liveness",
  family: "grant-liveness",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the executable ESLint config and the tracked corpus are closed ResourceHost facts" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "native-config", id: "eslint" }, { kind: "tracked-files" }],
  message: MESSAGE,
  fix: "delete or re-point the zero-member selector in eslint.config.js; ratify only a population absent by construction.",
  create: (ctx) => ({
    evaluate: () => {
      const native = ctx.resources.nativeConfig("eslint");
      const tracked = ctx.resources.trackedFiles();
      if (native.status !== "ready" || tracked.status !== "ready") {
        // Population resolution already refuses a non-ready declared resource before `create` ever runs.
        return;
      }
      const trackedSet = new Set(tracked.value.repoPaths);
      const selectors = native.value.selectors;
      const byIdentity = new Map(selectors.map((row) => [identity(row), row]));
      reportDeadSelectors(ctx, selectors);
      reportRatifiedArms(ctx, byIdentity, trackedSet);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        [CONFIG_REL]:
          'export default [{ ignores: ["**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", ".cache/**"] }, { files: ["packages/ui/src/gone.ts"] }];\n',
        "reports/README.md": "reports\n",
        ".gitignore": "node_modules/\ndist/\n",
        [GATE_FIXTURE_LAW]: "fixture law\n",
        "tooling/src/_shared/stryker-config.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "config[1].files[0]" },
      why: "the founding shape — a dead file selector, found by config-entry identity",
    },
    {
      mode: "resource",
      files: {
        [CONFIG_REL]:
          'export default [{ ignores: ["**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", ".cache/**"] }, { files: ["packages/client/src/**/*.ts"], ignores: ["**/*.test.ts"] }];\n',
        "reports/README.md": "reports\n",
        ".gitignore": "node_modules/\ndist/\n",
        [GATE_FIXTURE_LAW]: "fixture law\n",
        "tooling/src/_shared/stryker-config.ts": "export const live = 1;\n",
        "packages/client/src/live.ts": "export const live = 1;\n",
        "tests/client/outside.test.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "config[1].ignores[0]" },
      why: "a local ignore with no member inside its parent files scope — the parent-scoped-population arm the corpus-wide reader missed",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        [CONFIG_REL]:
          'export default [{ ignores: ["**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", ".cache/**"] }, { files: ["packages/ui/src/live.ts"] }];\n',
        "reports/README.md": "reports\n",
        ".gitignore": "node_modules/\ndist/\n",
        [GATE_FIXTURE_LAW]: "fixture law\n",
        "tooling/src/_shared/stryker-config.ts": "export const live = 1;\n",
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      why: "every ratified row resolves and the file selector has a member — the sanctioned shape, silent",
    },
  ],
});
