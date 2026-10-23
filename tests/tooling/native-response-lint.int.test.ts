// Native protocol exceptions remain local while the installed rules still judge adjacent unsafe calls.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint } from "eslint";

const DEPRECATED_RULE = "@typescript-eslint/no-deprecated";
const FLOATING_RULE = "@typescript-eslint/no-floating-promises";
const RESPONSE_PATHS = ["packages/server/src/infra/network/response-body.ts", "tests/server/infra/network/response-body.test.ts"] as const;
const UNRELATED_DEPRECATED_CALL = "\n/** @deprecated Use the current API. */\nfunction obsoleteNativeControl(): void {}\nobsoleteNativeControl();\n";

test("native formData exceptions do not admit unrelated deprecated calls in either compiler owner", { tags: ["slow"] }, async ({ repoRoot }) => {
  const eslint = new ESLint({
    flags: ["unstable_native_nodejs_ts_config"],
    cwd: repoRoot,
    overrideConfig: { languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } } },
  });
  for (const filePath of RESPONSE_PATHS) {
    const source = readFileSync(join(repoRoot, filePath), "utf8");
    const [qualified] = await eslint.lintText(source + UNRELATED_DEPRECATED_CALL, { filePath, warnIgnored: true });
    expect(qualified?.fatalErrorCount).toBe(0);
    expect(qualified?.messages.filter(({ ruleId }) => ruleId === DEPRECATED_RULE)).toHaveLength(1);
    const unqualified = source.replace(/^\s*\/\/ eslint-disable-next-line @typescript-eslint\/no-deprecated --[^\n]*\n/gmu, "");
    expect(unqualified).not.toBe(source);
    const [control] = await eslint.lintText(unqualified + UNRELATED_DEPRECATED_CALL, { filePath, warnIgnored: true });
    expect(control?.fatalErrorCount).toBe(0);
    expect(control?.messages.filter(({ ruleId }) => ruleId === DEPRECATED_RULE)).toHaveLength(2);
  }
});

test("tracing owns its native rejection handler without exempting raw void promises", { tags: ["slow"] }, async ({ repoRoot }) => {
  const filePath = "packages/server/src/foundation/observability/tracing.ts";
  const source = readFileSync(join(repoRoot, filePath), "utf8");
  const eslint = new ESLint({
    flags: ["unstable_native_nodejs_ts_config"],
    cwd: repoRoot,
    overrideConfig: { languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true } } },
  });
  const [qualified] = await eslint.lintText(source, { filePath, warnIgnored: true });
  expect(qualified?.fatalErrorCount).toBe(0);
  expect(qualified?.messages.filter(({ ruleId }) => ruleId === FLOATING_RULE)).toEqual([]);
  const [control] = await eslint.lintText(`${source}\nvoid Promise.reject(new Error("unowned"));\n`, { filePath, warnIgnored: true });
  expect(control?.fatalErrorCount).toBe(0);
  expect(control?.messages.filter(({ ruleId }) => ruleId === FLOATING_RULE)).toHaveLength(1);
});
