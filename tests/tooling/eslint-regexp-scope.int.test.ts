// Regexp rules use syntax/scope; their native effective configuration does not need a typed program.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";

const BACKTRACKING_RULE = "regexp/no-super-linear-backtracking";
const REJECTED_SOURCE = "export const accepts = (value: string): boolean => /^(?:a+b?)+$/u.test(value);\n";
const LINEAR_SOURCE = "export const accepts = (value: string): boolean => /^a+$/u.test(value);\n";
const MIRROR_SUBJECTS = ["tooling/src/review-mirror/lib/strip.ts", "tooling/src/review-mirror/ops/generate.ts", "tooling/src/review-mirror/ops/run.ts"];
const PACKAGE_SUBJECT = "packages/kit/src/regex/index.ts";

async function regexpMessages(eslint: ESLint, linter: Linter, path: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const native: Linter.Config | undefined = await eslint.calculateConfigForFile(path);
  if (native?.rules === undefined || native.languageOptions === undefined || native.plugins === undefined) {
    throw new Error(`No native regexp configuration for ${path}`);
  }
  const languageOptions: Linter.LanguageOptions = native.languageOptions;
  const messages = linter.verify(
    source,
    [
      {
        files: [path],
        languageOptions: {
          ...languageOptions,
          parserOptions: { ...languageOptions.parserOptions, project: false, projectService: false },
        },
        plugins: native.plugins,
        rules: Object.fromEntries(Object.entries(native.rules).filter(([rule]) => rule.startsWith("regexp/"))),
      },
    ],
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal === true),
    path,
  ).toEqual([]);
  return messages;
}

test("review-mirror rejects native backtracking without losing the package boundary or linear expressions", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const linter = new Linter({ cwd: repoRoot });
  const packageMessages = await regexpMessages(eslint, linter, PACKAGE_SUBJECT, REJECTED_SOURCE);
  expect(packageMessages.map(({ ruleId }) => ruleId)).toContain(BACKTRACKING_RULE);
  for (const path of MIRROR_SUBJECTS) {
    const rejected = await regexpMessages(eslint, linter, path, REJECTED_SOURCE);
    expect(
      rejected.map(({ ruleId }) => ruleId),
      path,
    ).toContain(BACKTRACKING_RULE);
    const accepted = await regexpMessages(eslint, linter, path, LINEAR_SOURCE);
    expect(accepted, path).toEqual([]);
  }
});
