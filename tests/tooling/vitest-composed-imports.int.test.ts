// The installed Vitest rules must recognize the public composed fixtures without a compiler program.
import { expect, test } from "@orb/testkit/tooling";
import { ESLint } from "eslint";

const ASSERTIONS = "vitest/expect-expect";
const VALID_EXPECT = "vitest/valid-expect";

test("effective Vitest rules recognize composed imports and retain legal assertion cases", async ({ repoRoot }) => {
  const configured = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const filePath = "tests/tooling/vitest-composed-imports.int.test.ts";
  const config = await configured.calculateConfigForFile(filePath);
  const native = new ESLint({
    flags: ["unstable_native_nodejs_ts_config"],
    cwd: repoRoot,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: { ...config.languageOptions, parserOptions: { project: false, projectService: false } },
        plugins: config.plugins,
        settings: config.settings ?? {},
        rules: { [ASSERTIONS]: config.rules[ASSERTIONS], [VALID_EXPECT]: config.rules[VALID_EXPECT] },
      },
    ],
  });
  for (const door of ["@orb/testkit/node/fixtures.ts", "@orb/testkit/node/tool-fixtures.ts", "vitest"]) {
    const head = `import { test as check, expect } from "${door}";\n`;
    for (const [body, expected] of [
      ['check("missing", () => { const value = 1; });', [ASSERTIONS]],
      ['check("bare", () => { expect(1); });', [VALID_EXPECT]],
      ['check("valid", () => { expect(1, "why").toBe(1); });', []],
      ['check("callback", assertionBody); function assertionBody() { expect(1).toBe(1); }', []],
      // These legitimate forms expose the installed rule's callback-order and helper-tracing limits.
      ['function assertionBody() { expect(1).toBe(1); } check("earlier callback", assertionBody);', [ASSERTIONS]],
      ['function assertValue() { expect(1).toBe(1); } check("helper", () => { assertValue(); });', [ASSERTIONS]],
      ['const extended = check.extend({}); extended("extended", () => { expect(1).toBe(1); });', []],
    ] as const) {
      const [result] = await native.lintText(head + body, { filePath, warnIgnored: true });
      expect(result?.fatalErrorCount, door + body).toBe(0);
      expect(
        result?.messages.map(({ ruleId }) => ruleId),
        door + body,
      ).toEqual(expected);
    }
  }
  const [local] = await native.lintText('function test(name, callback) {} test("not Vitest", () => {});', { filePath });
  expect(local?.messages).toEqual([]);
});
