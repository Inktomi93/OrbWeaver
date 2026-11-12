import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/enforcement-claim-cites-checker";
const PACKAGE_SUBJECT = "packages/ui/src/x/probe.ts";
const TEST_SUBJECT = "tests/ui/x/probe.test.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, PACKAGE_SUBJECT));
}, 120_000);

async function findings(source: string, path = PACKAGE_SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test("an uncited claim is reported at the line its sentence starts on", async () => {
  const found = await findings("export const x = 1;\n// The width is fixed. A CT pins the gutter at 14px.\nexport const y = 2;\n");
  expect(found.map(({ line }) => line)).toEqual([2]);
});

test("a whole-suite command or a source file that is no checker backs no claim", async () => {
  const source = "// A test pins the order (`pnpm test`).\n// A test pins the order (packages/kit/src/ids/index.ts).\nexport const x = 1;\n";
  expect((await findings(source)).map(({ line }) => line)).toEqual([1, 2]);
});

test("a claim wrapped over line comments is one sentence, and a cite on its second line backs it", async () => {
  const wrapped = "// The gutter is 14px and a CT pins the\n// width on every surface.\nexport const x = 1;\n";
  expect((await findings(wrapped)).map(({ line }) => line)).toEqual([1]);
  const cited = "// The gutter is 14px and a CT pins the width\n// (tests/client/feature-layout.suite.test.ts).\nexport const x = 1;\n";
  expect(await findings(cited)).toEqual([]);
});

test.for([
  ["a tracked test path", "/** A test pins the gutter (tests/client/feature-layout.suite.test.ts). */\nexport const x = 1;\n"],
  ["an orb rule id", "// The `orb/commented-code` lint rule refuses parked code.\nexport const x = 1;\n"],
  ["a dependency-cruiser policy", "// dependency-cruiser holds the direction (policy `no-circular`).\nexport const x = 1;\n"],
  ["a Biome rule", "// Biome refuses a barrel here (`lint/performance/noBarrelFile`).\nexport const x = 1;\n"],
] as const)("a claim that names its checker by %s passes", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test.for([
  ["an instruction to the author", "// A test must pin this width before it changes.\nexport const x = 1;\n"],
  ["a conditional", "// If a test pins this width, update it with the token.\nexport const x = 1;\n"],
  ["a denial", "// No test pins this width; the token is the only home.\nexport const x = 1;\n"],
  ["a quoted example", '// Write the claim as "a CT pins the gutter" only beside its path.\nexport const x = 1;\n'],
  ["a ruling with no claim", "// The gutter is 14px on phones.\nexport const x = 1;\n"],
] as const)("%s is not a claim", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test('"the test" names the file it sits in, so the claim passes only inside a test file', async () => {
  const source = "// The test pins the gutter at 14px.\nexport const x = 1;\n";
  expect(await findings(source, TEST_SUBJECT)).toEqual([]);
  expect(await findings(source, PACKAGE_SUBJECT)).toHaveLength(1);
});
