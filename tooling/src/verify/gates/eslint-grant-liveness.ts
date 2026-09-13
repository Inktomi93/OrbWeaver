// Policy: eslint-grant-liveness — every native `eslint.config.js` files/ignores selector keeps at least
// one member in its actual global or entry-local scope. Executable config is observed through the
// `native-config` ResourceHost fact (config-snapshot child + @eslint/config-array); imported values,
// basePath, negation, directories and AND selectors retain ESLint semantics. Findings use config-entry/field
// identity because derived values have no honest source line. A `native-config` resource that cannot resolve
// (missing/malformed eslint.config.js) makes population resolution itself throw — the fail-LOUD requirement
// is the runtime's own refusal now, not a reportable arm of this policy (see the permanent-pin test).
// COMMENT POSTURE: comment-SAFE — the policy reads evaluated config data, never source text.
//
// FAMILY: `grant-liveness`, with the `biome-grant-liveness` and `tsconfig-entry-liveness` pairs,
// `depcruise-grant-liveness` and `runner-config-path-liveness`. Reader: the `native-config` resource's
// executable-config snapshot (`contract/config-snapshot.ts` `EslintSelectorSnapshot`, produced by
// `ops/config-snapshot.ts`), the same subject reader `depcruise-grant-liveness` consumes.
//
// AUTHORITY — REVIEWED GRANT, MIGRATED FROM A GATE-LOCAL TABLE (#1922 / #2147, 2026-09-13). This policy
// landed `hard` carrying a positional `RATIFIED` ExemptionTable that SKIPPED a zero-member selector whose
// key and value both matched, plus two in-policy arms policing the table itself (STALE: the key no longer
// names the same zero-member value; DEAD-CITE: the row's `cite` stopped resolving). §5 forbids a gate-owned
// exemption table, so the seven rows are now exact `(policy, subject, operation)` rows in
// `lib/reviewed-grants.ts` and this policy reports EVERY zero-member selector. The identity keeps both halves
// of the retired row:
//   · SUBJECT = the positional selector identity (`config[0].ignores[5]`), byte-for-byte the retired key.
//   · OPERATION = `eslint-zero-member-selector:<JSON value>`, the retired row's `value`, JSON-rendered so a
//     string selector and an AND selector can never spell the same operation.
// So an ignore inserted ABOVE a granted index re-points every subject beneath it to a different value: each
// shifted finding stays effective and each grant is consumed zero times and alarms `stale-reviewed-grant`
// centrally. An in-place value change stales exactly that grant. That is the #2302 positional hazard, now
// held by the central engine instead of `sameValue` in this file; the real-config pins in
// `tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts` drive the SHIPPED grant rows through it.
//   · STALE → central `stale-reviewed-grant` (zero consumption after a complete owner run). Stronger: it
//     cannot be forgotten by a module.
//   · DEAD-CITE → NO SUCCESSOR. A grant has no `cite` field and a policy never reads grants, so nothing
//     re-checks that the decision a grant cites still exists — the same retired property
//     `biome-grant-liveness.ts`'s header records. Each grant's `why` carries its former cite path verbatim
//     so the successor citation check (#2349) has something to read. Per row, the cite that
//     lost its liveness check: `node-modules`, `dist`, `cache`, `claude-worktrees`, `st-goldens-runtime` →
//     `.gitignore`; `g-fixture` → `tooling/src/verify/gates/GATE-AUTHORING.md`; `stryker-tmp` →
//     `tooling/src/_shared/stryker-config.ts`.
//
// POPULATION PORT: `{ of: "none" }` and the `native-config:eslint` declaration are unchanged. The
// `tracked-files` declaration left with DEAD-CITE, its only reader. The other removed behavior is the
// SUBTRACTION (§6.4 exemption-mechanism move): the seven formerly hidden selectors are now raw findings,
// each consumed by exactly one grant.
import type { EslintSelectorSnapshot, EslintSelectorValue } from "../contract/config-snapshot.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CONFIG_REL = "eslint.config.js";

const MESSAGE =
  "an evaluated ESLint files/ignores selector has ZERO members in its native scope — the rule block or " +
  "grant is dead, and a later file can inherit policy nobody re-approved. Re-point or delete the selector; " +
  "only a by-construction absent population may be granted, with a reason and an end condition.";

const FIX =
  "delete or re-point the zero-member selector in eslint.config.js. If its population is absent BY DESIGN " +
  "(installed dependencies, build output, a transient sandbox), it is a REVIEWED GRANT: add a row to " +
  "tooling/src/verify/lib/reviewed-grants.ts keyed on this policy id, the finding's subject and its operation, " +
  "with its `why` and its `endsWhen`.";

/** The licensed act. The authored selector value is part of the OPERATION so a grant binds the value it
 *  reviewed and nothing that later occupies the same position. */
const OPERATION_PREFIX = "eslint-zero-member-selector:";

/** The positional identity — the finding token and the grant subject are this one spelling. EXPORTED so
 *  the permanent pin speaks the same identity language instead of re-deriving `owner.field[position]`. */
export function selectorIdentity(row: Pick<EslintSelectorSnapshot, "owner" | "field" | "position">): string {
  return `${row.owner}.${row.field}[${String(row.position)}]`;
}

/** The grant operation for one selector value. EXPORTED for the same reason as `selectorIdentity`. */
export function selectorOperation(value: EslintSelectorValue): string {
  return `${OPERATION_PREFIX}${JSON.stringify(value)}`;
}

function reportDeadSelectors(ctx: GatePolicyContext, selectors: readonly EslintSelectorSnapshot[]): void {
  for (const row of selectors) {
    if (row.members > 0) {
      continue;
    }
    const subject = selectorIdentity(row);
    const operation = selectorOperation(row.value);
    ctx.report.file(CONFIG_REL, {
      line: 1,
      column: 1,
      token: subject,
      subject,
      operation,
      message: `${MESSAGE} Subject: ${subject}, operation: ${operation}.`,
      fix: FIX,
    });
  }
}

export const gate = defineGate({
  id: "eslint-grant-liveness",
  family: "grant-liveness",
  authority: "reviewed-grant",
  severity: "error",
  population: { of: "none", why: "the executable ESLint config and the tracked corpus are closed ResourceHost facts" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  // `tracked-files` LEFT with the retired DEAD-CITE arm, its only reader: `native-config` already carries each
  // selector's member count, and the runtime reds a declared resource that is never acquired.
  resources: [{ kind: "native-config", id: "eslint" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      reportDeadSelectors(ctx, readyResourceValue(ctx.resources.nativeConfig("eslint")).selectors);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      grant: { subject: "config[1].files[0]", operation: 'eslint-zero-member-selector:"packages/ui/src/gone.ts"' },
      files: {
        [CONFIG_REL]: 'export default [{ ignores: ["reports/**"] }, { files: ["packages/ui/src/gone.ts"] }];\n',
        "reports/README.md": "reports\n",
      },
      expect: { count: 1, token: "config[1].files[0]" },
      why: "the founding shape — a dead file selector, found by config-entry identity; the grant witness binds its exact (position, value) pair",
    },
    {
      mode: "resource",
      files: {
        [CONFIG_REL]: 'export default [{ ignores: ["reports/**"] }, { files: ["packages/client/src/**/*.ts"], ignores: ["**/*.test.ts"] }];\n',
        "reports/README.md": "reports\n",
        "packages/client/src/live.ts": "export const live = 1;\n",
        "tests/client/outside.test.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "config[1].ignores[0]" },
      why: "a local ignore with no member inside its parent files scope — the parent-scoped-population arm the corpus-wide reader missed",
    },
    {
      // THE #2213 COUPLED SITE, successor form. `c57e3c9b9` re-pointed the real config from `.cache/**` to
      // `**/.cache/**` and the retired table was not re-pointed with it. The OPERATION carries the authored
      // value byte-for-byte, so the shipped grant for `**/.cache/**` cannot license this spelling — the
      // stale half of that accusation is the central engine's, driven against the real config in the int test.
      mode: "resource",
      files: {
        [CONFIG_REL]: 'export default [{ ignores: ["reports/**", ".cache/**"] }, { files: ["packages/ui/src/live.ts"] }];\n',
        "reports/README.md": "reports\n",
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "config[0].ignores[1]", messageIncludes: 'operation: eslint-zero-member-selector:".cache/**".' },
      why: "the selector VALUE is part of the grant identity — a grant reviewed for one spelling cannot consume a re-spelled selector at the same position",
    },
    {
      // THE #2302 POSITIONAL RE-POINTING HAZARD, successor form. An ignore inserted at index 0 shifts
      // `**/dist/**` from index 1 to index 2; the finding now pairs SUBJECT `config[0].ignores[2]` with the
      // dist VALUE, which a grant reviewed for `config[0].ignores[1]` cannot match. The live `reports/**` at
      // index 1 stays silent, so the count is the probe entry plus the shifted dist entry.
      mode: "resource",
      files: {
        [CONFIG_REL]: 'export default [{ ignores: ["__probe_index0_insert/**", "reports/**", "**/dist/**"] }, { files: ["packages/ui/src/live.ts"] }];\n',
        "reports/README.md": "reports\n",
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      expect: {
        count: 2,
        token: "config[0].ignores[2]",
        messageIncludes: 'Subject: config[0].ignores[2], operation: eslint-zero-member-selector:"**/dist/**".',
      },
      why: "the SUBJECT is the position — a shifted selector changes its subject, so a grant keyed on the old index goes stale instead of silently licensing whatever moved into it",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        [CONFIG_REL]: 'export default [{ ignores: ["reports/**"] }, { files: ["packages/ui/src/live.ts"] }];\n',
        "reports/README.md": "reports\n",
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      why: "the global ignore and the file selector both have a member — the sanctioned shape, silent",
    },
  ],
});
