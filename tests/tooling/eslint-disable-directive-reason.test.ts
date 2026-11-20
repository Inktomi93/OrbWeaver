import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/disable-directive-reason";
const SUBJECT = "packages/server/src/x/probe.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
}, 120_000);

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null } },
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

const REASON = "the fixture parses a third-party body whose shape has no schema";

test.for([
  ["a block disable", "/* eslint-disable no-console */"],
  ["a next-line disable", "// eslint-disable-next-line no-console"],
  ["a block next-line disable", "/* eslint-disable-next-line no-console */"],
  ["a same-line disable", "run(); // eslint-disable-line no-console"],
  ["a reason too short to name the finding", "// eslint-disable-next-line no-console -- ok"],
  ["a reason with no words", "// eslint-disable-next-line no-console -- ----------------"],
  ["dashes with no space after them, which ESLint reads as part of the rule list", `// eslint-disable-next-line no-console --${REASON}`],
] as const)("%s without a reason is reported", async ([, line]) => {
  expect(await findings(`${line}\nrun();\n`)).toHaveLength(1);
});

test.for([
  ["a next-line disable", `// eslint-disable-next-line no-console -- ${REASON}`],
  ["a block disable", `/* eslint-disable no-console -- ${REASON} */`],
  ["a reason after a longer dash run", `// eslint-disable-next-line no-console --- ${REASON}`],
  ["a reason on the lines after a block directive", `/* eslint-disable-next-line no-console --\n * ${REASON}\n */`],
  ["an enable, which ends a suppression", "/* eslint-enable no-console */"],
  ["a line comment with a block-only label, which ESLint does not read as a directive", "// eslint-disable no-console"],
  ["prose that names a directive", "// see the eslint-disable directive rule for the grammar"],
] as const)("%s is not reported", async ([, line]) => {
  expect(await findings(`${line}\nrun();\n`)).toEqual([]);
});

test("the rule covers tests, tooling and scripts as well as packages", async () => {
  for (const path of ["tests/server/probe.test.ts", "tooling/src/probe/probe.ts", "scripts/probe.ts", "packages/client/src/probe.tsx"]) {
    expect(await findings("// eslint-disable-next-line no-console\nrun();\n", path), path).toHaveLength(1);
  }
});
