// Native protocol exceptions remain local while the installed rules still judge adjacent unsafe calls.
// The slowest case, the tests-tree file on its scoped program, measures 20 to 24 s at load average 22 to 25.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isPlainObject } from "@orb/kit/guards";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint } from "eslint";

const DEPRECATED_RULE = "@typescript-eslint/no-deprecated";
const FLOATING_RULE = "@typescript-eslint/no-floating-promises";
const RESPONSE_PATHS = ["packages/server/src/infra/network/response-body.ts", "tests/server/infra/network/response-body.test.ts"] as const;
const UNRELATED_DEPRECATED_CALL = "\n/** @deprecated Use the current API. */\nfunction obsoleteNativeControl(): void {}\nobsoleteNativeControl();\n";

/** The tests tree is linted against whole-repo programs; the rule finding needs only the file's own types. This
 *  tsconfig extends the repo's test program but includes just the file and the root ambient declarations, so the
 *  checker pulls in the file's imports and nothing else (typescript-eslint `parserOptions.project` takes a path to
 *  a dedicated tsconfig that lists only the files to lint). */
function scopedProject(repoRoot: string, scratch: string, filePath: string): string {
  const rootConfigPath = join(repoRoot, "tsconfig.json");
  const parsed: unknown = JSON.parse(readFileSync(rootConfigPath, "utf8"));
  const include = isPlainObject(parsed) && Array.isArray(parsed["include"]) ? parsed["include"] : [];
  const ambient = include.filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".d.ts")).map((entry) => join(repoRoot, entry));
  const scopedPath = join(scratch, "tsconfig.scoped.json");
  writeFileSync(scopedPath, JSON.stringify({ extends: rootConfigPath, include: [...ambient, join(repoRoot, filePath)], exclude: [] }));
  return scopedPath;
}

// One test per compiler owner: each builds its own type-aware program. The tests-tree file gets a program scoped to
// itself, because the whole-tests program alone outgrows the slow budget.
test.for(RESPONSE_PATHS)(
  "native formData exceptions do not admit unrelated deprecated calls in %s",
  { tags: ["slow"] },
  async (filePath, { repoRoot, scratch }) => {
    const scoped = filePath.startsWith("tests/") ? { project: [scopedProject(repoRoot, scratch, filePath)], projectService: false } : {};
    const eslint = new ESLint({
      flags: ["unstable_native_nodejs_ts_config"],
      cwd: repoRoot,
      overrideConfig: { languageOptions: { parserOptions: { disallowAutomaticSingleRunInference: true, ...scoped } } },
    });
    const source = readFileSync(join(repoRoot, filePath), "utf8");
    const [qualified] = await eslint.lintText(source + UNRELATED_DEPRECATED_CALL, { filePath, warnIgnored: true });
    expect(qualified?.fatalErrorCount).toBe(0);
    expect(qualified?.messages.filter(({ ruleId }) => ruleId === DEPRECATED_RULE)).toHaveLength(1);
    const unqualified = source.replace(/^\s*\/\/ eslint-disable-next-line @typescript-eslint\/no-deprecated --[^\n]*\n/gmu, "");
    expect(unqualified).not.toBe(source);
    const [control] = await eslint.lintText(unqualified + UNRELATED_DEPRECATED_CALL, { filePath, warnIgnored: true });
    expect(control?.fatalErrorCount).toBe(0);
    expect(control?.messages.filter(({ ruleId }) => ruleId === DEPRECATED_RULE)).toHaveLength(2);
  },
);

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
