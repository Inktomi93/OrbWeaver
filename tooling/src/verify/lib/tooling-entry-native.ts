export const TOOLING_ENTRY_HOMES = {
  runner: { path: "tooling/src/floor/cli/run-tool.ts", names: ["runTool"] },
  guard: { path: "tooling/src/floor/cli/entrypoint.ts", names: ["refuseDirectInvocation"] },
} as const;

export const TOOLING_ENTRY_NATIVE_POLICIES = ["tooling-cli-entry", "tooling-ops-direct-invocation"].map((id) => ({
  id,
  hard: true,
  processPrivate: true,
  scope: [id === "tooling-cli-entry" ? "tooling/src/*/cli.ts" : "tooling/src/*/ops/**/*.ts"],
  inputs: [
    "tooling/src/verify/lib/tooling-entry-native.ts",
    "eslint-hard.config.js",
    "tooling/src/verify/ops/eslint.ts",
    "tooling/src/verify/lib/project-home-origin.ts",
    "tooling/src/verify/lib/origin-verdict.ts",
    "tooling/src/verify/lib/type-member-origin.ts",
    "tooling/src/floor/code-facts/type-member-origin.ts",
    "tooling/src/floor/compiler/module-entry.ts",
    TOOLING_ENTRY_HOMES.runner.path,
    TOOLING_ENTRY_HOMES.guard.path,
  ],
}));
