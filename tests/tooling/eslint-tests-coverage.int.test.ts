import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import { ESLint } from "eslint";
import { scaledBudget } from "./_load-budget.ts";

test("generated sandboxes and caches are excluded while authored JavaScript remains linted", async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  expect(await eslint.isPathIgnored(".cache/eslint-discovery-probe.mjs")).toBe(true);
  const results = await eslint.lintText("/* eslint-disable no-empty-pattern */\nexport const value = 1;\n", {
    filePath: "scripts/temporary-lint-control.js",
  });
  expect(results).toHaveLength(1);
  expect(results[0]?.messages.some(({ message }) => message.includes("Unused eslint-disable directive"))).toBe(true);
});

test("the Node-tool surface executes the type-aware promise diagnostic", { timeout: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS) }, async ({ repoRoot }) => {
  // CI's single-run parser reads on-disk source rather than the first lintText replacement.
  const eslint = new ESLint({
    flags: ["unstable_native_nodejs_ts_config"],
    cwd: repoRoot,
    overrideConfig: { languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } } },
  });
  const [result] = await eslint.lintText("Promise.resolve('dropped');\n", { filePath: "knip.ts", warnIgnored: true });
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.map(({ ruleId }) => ruleId)).toContain("@typescript-eslint/no-floating-promises");
  const [handled] = await eslint.lintText("await Promise.resolve('handled');\n", { filePath: "knip.ts", warnIgnored: true });
  expect(handled?.messages).toEqual([]);
});

test("hyphenated browser fixtures execute React hook diagnostics in their owning program", { timeout: scaledBudget(LONG_TEST_TIMEOUT_BASE_MS) }, async ({
  repoRoot,
}) => {
  const eslint = new ESLint({
    flags: ["unstable_native_nodejs_ts_config"],
    cwd: repoRoot,
    overrideConfig: { languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } } },
  });
  const filePath = "tests/support/browser/contained-within-fixtures.tsx";
  const [broken] = await eslint.lintText("function Probe({ enabled }) { if (enabled) useState(0); return null; }\n", { filePath, warnIgnored: true });
  expect(broken?.fatalErrorCount).toBe(0);
  expect(broken?.messages.map(({ ruleId }) => ruleId)).toContain("react-hooks/rules-of-hooks");
  const [valid] = await eslint.lintText("function Probe() { useState(0); return null; }\n", { filePath, warnIgnored: true });
  expect(valid?.messages).toEqual([]);
});
