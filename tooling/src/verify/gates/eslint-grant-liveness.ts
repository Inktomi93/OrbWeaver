// Gate: eslint-grant-liveness — every native `eslint.config.js` files/ignores selector keeps at least
// one member in its actual global or entry-local scope. Executable config is observed through the
// `native-config` ResourceHost fact (config-snapshot child + @eslint/config-array); imported values,
// basePath, negation, directories and AND selectors retain ESLint semantics. Findings use config-entry/field
// identity because derived values have no honest source line. A `native-config` resource that cannot resolve
// (missing/malformed eslint.config.js) makes population resolution itself throw — the fail-LOUD requirement
// is the runtime's own refusal now, not a reportable arm of this policy (see the permanent-pin test).
// COMMENT POSTURE: comment-SAFE — the policy reads evaluated config data, never source text.
// THREE EXPORTS BESIDE `gate`, all for the permanent pin and none for a second reader (#2302, 2026-09-13):
// `RATIFIED`, `selectorIdentity` and `MSG_STALE`. `tests/tooling/verify/gates/eslint-grant-liveness.int.test.ts`
// drives this table against the REAL `eslint.config.js` through the production resource selection and
// asserts the VALUE AT EACH RATIFIED INDEX — the `mustFlag` rows below prove the positional re-pointing
// hazard on synthetic configs, and that pin is what proves the live table still names the live values.
import type { EslintSelectorSnapshot, EslintSelectorValue } from "../contract/config-snapshot.ts";
import type { ExemptionTable } from "../contract/gate.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { GrantExemption } from "../lib/grant-liveness.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CONFIG_REL = "eslint.config.js";
const GATE_FIXTURE_LAW = "tooling/src/verify/gates/GATE-AUTHORING.md";

type RatifiedRow = GrantExemption & { readonly value: EslintSelectorValue };

/** EXPORTED for the scoped real-config proof (#2302's residual), never for a second reader: the
 *  permanent pin drives this table against the REAL `eslint.config.js` through the production resource
 *  selection and asserts the VALUE AT EACH RATIFIED INDEX. The table is keyed by POSITION, so a test that
 *  re-spelled these rows would be asserting its own copy of the hazard instead of this one. */
export const RATIFIED: ExemptionTable<RatifiedRow> = {
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
    // `**/.cache/**`, NOT `.cache/**` (#2213, 2026-09-12). A flat-config glob is anchored at the config
    // DIRECTORY, so the bare spelling covered only the ROOT cache and `playwright/.cache` was linted; the
    // config was re-pointed in `c57e3c9b9` and this row was not, which is the coupled site that left a
    // RATIFIED identity naming a selector that no longer exists. The value here is matched BYTE-FOR-BYTE
    // against the evaluated config (`sameValue`), so it is a literal this gate references and it owes the
    // repo-wide grep of the old spelling whenever eslint.config.js moves it again.
    value: "**/.cache/**",
    why: "local tools write derived, refetchable cache artifacts outside the tracked corpus, at the root and at every nesting depth. Delete this row when the cache root changes or the repository starts tracking authored files there.",
    cite: ".gitignore",
  },
  // THE TABLE IS KEYED BY POSITION, so these two were inserted at positions 6–7 (#2281/#2282, 2026-09-13) — every key above
  // is index 5 or lower and neither identity below existed before. An ignore inserted ABOVE index 5 would
  // silently RE-POINT every row beneath it: the keys would still resolve, just to different selectors, and
  // `sameValue` is the only thing that would catch it. Both rows below were ADDED BECAUSE THIS GATE CAUGHT
  // THEM: the two ignores landed alone first and the policy redded 2 (`config[0].ignores[6]`,
  // `config[0].ignores[7]`), which is the measurement, not the pattern — #2282's own row body predicted its
  // selector might be member-LIVE because the rig has 9 tracked files, and it is not: those 9 sit at the
  // rig's top level, while the ignore names only `sillytavern-runtime/**` beneath them.
  "config[0].ignores[6]": {
    value: "**/.claude/worktrees/**",
    why: "agent worktrees are transient checkouts the repository never tracks, and ESLint cannot see .gitignore (flat config reads no VCS ignore file), so this selector is the only fence. Delete this row when worktrees stop living inside the repository or the harness stops creating them under .claude/.",
    cite: ".gitignore",
  },
  "config[0].ignores[7]": {
    value: "scripts/probes/st-goldens/sillytavern-runtime/**",
    why: "the st-parity rig's captured SillyTavern runtime is vendored third-party source the repository deliberately does not track; its own 9 files sit ABOVE this path, stay tracked, and stay outside the fence. Delete this row when the rig stops materialising a runtime under scripts/probes/ or the repository starts tracking it.",
    cite: ".gitignore",
  },
};

const MESSAGE =
  "an evaluated ESLint files/ignores selector has ZERO members in its native scope — the rule block or " +
  "grant is dead, and a later file can inherit policy nobody re-approved. Re-point or delete the selector; " +
  "only a by-construction absent population may be ratified with a reason, end condition, and live cite.";
/** EXPORTED so the permanent pin discriminates the STALE arm by identity rather than by re-spelling a
 *  substring of it — the two arms report at the same anchor and differ only in message. */
export const MSG_STALE = "an eslint-grant-liveness RATIFIED identity no longer names the same zero-member selector — delete or re-derive the row.";
const MSG_DEAD_CITE = "an eslint-grant-liveness RATIFIED cite no longer resolves — the decision that justified it is gone.";

/** The finding token AND the `RATIFIED` key are this one spelling — EXPORTED so the permanent pin speaks
 *  the same identity language instead of re-deriving `owner.field[position]` beside it. */
export function selectorIdentity(row: EslintSelectorSnapshot): string {
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
    const key = selectorIdentity(row);
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
      const native = readyResourceValue(ctx.resources.nativeConfig("eslint"));
      const tracked = readyResourceValue(ctx.resources.trackedFiles());
      const trackedSet = new Set(tracked.repoPaths);
      const selectors = native.selectors;
      const byIdentity = new Map(selectors.map((row) => [selectorIdentity(row), row]));
      reportDeadSelectors(ctx, selectors);
      reportRatifiedArms(ctx, byIdentity, trackedSet);
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        [CONFIG_REL]:
          'export default [{ ignores: ["**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", "**/.cache/**", "**/.claude/worktrees/**", "scripts/probes/st-goldens/sillytavern-runtime/**"] }, { files: ["packages/ui/src/gone.ts"] }];\n',
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
          'export default [{ ignores: ["**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", "**/.cache/**", "**/.claude/worktrees/**", "scripts/probes/st-goldens/sillytavern-runtime/**"] }, { files: ["packages/client/src/**/*.ts"], ignores: ["**/*.test.ts"] }];\n',
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
    {
      // THE #2213 COUPLED-SITE ARM, red forever. The config here carries the PRE-`c57e3c9b9` spelling
      // `.cache/**` at the identity the RATIFIED table ratifies as `**/.cache/**`. The identity still
      // resolves and the selector is still zero-member, so nothing about LIVENESS has changed — what
      // changed is the VALUE, and that is exactly the shape that reached main on 2026-09-12: the config
      // was re-pointed and this table was not. `MSG_STALE` is the accusation; the `mustPass` twin below
      // holds the same config at the CURRENT spelling and is silent. Two directions on one literal.
      mode: "resource",
      files: {
        [CONFIG_REL]:
          'export default [{ ignores: ["**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", ".cache/**", "**/.claude/worktrees/**", "scripts/probes/st-goldens/sillytavern-runtime/**"] }, { files: ["packages/ui/src/live.ts"] }];\n',
        "reports/README.md": "reports\n",
        ".gitignore": "node_modules/\ndist/\n",
        [GATE_FIXTURE_LAW]: "fixture law\n",
        "tooling/src/_shared/stryker-config.ts": "export const live = 1;\n",
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      // TWO findings, not one, and the pair IS the real-tree number (`raw 0 → 2`, `check:structure-delta`,
      // 2026-09-12): `reportDeadSelectors` sees a zero-member selector whose ratified value does not match
      // and reports it UNRATIFIED, while `reportRatifiedArms` sees a ratified identity whose value moved and
      // reports it STALE. Both are correct and both are the same coupled site — asserting only one would
      // let half the accusation rot.
      expect: { count: 2, token: "config[0].ignores[5]", messageIncludes: "no longer names the same zero-member selector" },
      why: "the RATIFIED value and the config's value DISAGREE — the coupled site #2213 left behind, pinned so a future re-point of eslint.config.js cannot strand this row silently again",
    },
    {
      // THE #2302 POSITIONAL RE-POINTING ARM (2026-09-13). `RATIFIED` is keyed by POSITIONAL INDEX
      // (`config[0].ignores[N]`), never by the selector's own value, so an `ignores` entry inserted ABOVE
      // index 5 shifts every key beneath it to a DIFFERENT selector — the keys still resolve, they just name
      // the wrong thing. This fixture inserts one new zero-member entry at index 0; every one of the SEVEN
      // RATIFIED rows (indices 0, 1, 3, 4, 5, 6, 7 — index 2 and the tail are unratified) below it now names
      // the selector that used to sit one position earlier. RED-FIRST
      // receipt (docs/reviews/gate-runtime/x-eslint-grant-pin-2026-09-13.md): before this row existed,
      // `verifyPolicyProofs([gate])` returned `[]` for the UNMODIFIED gate — the harness only drives the
      // rows a module declares, so it was structurally blind to this fixture until it was written as a row.
      mode: "resource",
      files: {
        [CONFIG_REL]:
          'export default [{ ignores: ["__probe_index0_insert/**", "**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", "**/.cache/**", "**/.claude/worktrees/**", "scripts/probes/st-goldens/sillytavern-runtime/**"] }, { files: ["packages/ui/src/live.ts"] }];\n',
        "reports/README.md": "reports\n",
        ".gitignore": "node_modules/\ndist/\n",
        [GATE_FIXTURE_LAW]: "fixture law\n",
        "tooling/src/_shared/stryker-config.ts": "export const live = 1;\n",
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      // 15 = 8 dead-selector findings + 7 stale findings, not 8-RATIFIED-keys arithmetic: of the SEVEN
      // RATIFIED keys, six land on ANOTHER zero-member selector after the shift (each contributes one
      // dead-selector MESSAGE plus one STALE MSG_STALE — 2 findings each = 12), and one
      // (`config[0].ignores[3]`, ratified as `**/__g_*`) lands on the now-live shifted-in `reports/**`
      // selector (members != 0, so only the STALE arm fires = 1). That is 7 stale findings total (6 + 1) and
      // 6 of the 8 dead-selector findings. The remaining 2 dead-selector findings are the two positions the
      // shift pushes OUTSIDE the RATIFIED table entirely — the true `**/dist/**` landing in the previously
      // unratified `ignores[2]` slot, and the tail entry pushed past the roster into `ignores[8]` — each an
      // ordinary unratified dead selector with no stale twin. 8 dead + 7 stale = 15, the exact real-tree
      // count this row was filed against (#2302).
      expect: { count: 15, token: "config[0].ignores[1]", messageIncludes: "no longer names the same zero-member selector" },
      why: "an index-0 insert re-points every RATIFIED row beneath it — this is the hazard itself, not a coupled-site symptom of it",
    },
    {
      // THE CONTROL FOR THE CONTROL: an APPEND at the array's END re-points NOTHING, because every existing
      // RATIFIED index keeps its own value. Only the appended row itself is new and unratified, so it reports
      // its own ordinary dead-selector finding and nothing else. This discriminates the re-pointing arm above
      // from "any edit to eslint.config.js finds something" — a mere append is safe by construction.
      mode: "resource",
      files: {
        [CONFIG_REL]:
          'export default [{ ignores: ["**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", "**/.cache/**", "**/.claude/worktrees/**", "scripts/probes/st-goldens/sillytavern-runtime/**", "__probe_append_end/**"] }, { files: ["packages/ui/src/live.ts"] }];\n',
        "reports/README.md": "reports\n",
        ".gitignore": "node_modules/\ndist/\n",
        [GATE_FIXTURE_LAW]: "fixture law\n",
        "tooling/src/_shared/stryker-config.ts": "export const live = 1;\n",
        "packages/ui/src/live.ts": "export const live = 1;\n",
      },
      expect: { count: 1, token: "config[0].ignores[8]", messageIncludes: "ZERO members in its native scope" },
      why: "an append at the array's end never re-points a RATIFIED key — only the appended row's own dead-selector finding appears",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        [CONFIG_REL]:
          'export default [{ ignores: ["**/node_modules/**", "**/dist/**", "reports/**", "**/__g_*", ".stryker-tmp/**", "**/.cache/**", "**/.claude/worktrees/**", "scripts/probes/st-goldens/sillytavern-runtime/**"] }, { files: ["packages/ui/src/live.ts"] }];\n',
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
