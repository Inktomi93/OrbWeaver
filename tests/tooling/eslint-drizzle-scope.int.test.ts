// Drizzle's syntax-only rule must keep local bulk permissions off neighboring scoped writes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";

const DELETE_RULE = "drizzle/enforce-delete-with-where";
const BULK_SUBJECTS = [
  ["packages/server/src/domain/discovery/duplicates/generate.ts", 2],
  ["packages/server/src/domain/discovery/themes/generate.ts", 1],
  ["packages/server/src/domain/embeddings/persistence/clear.ts", 0],
] as const;
const ADJACENT_DELETES = "\ndb.delete(controlTable);\ndb.delete(controlTable).where(eq(controlTable.id, controlId));\n";

test("native bulk delete permissions admit only their statements and preserve scoped enforcement", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const linter = new Linter({ cwd: repoRoot });
  for (const [path, bulkCount] of BULK_SUBJECTS) {
    const native: Linter.Config | undefined = await eslint.calculateConfigForFile(path);
    if (native?.rules === undefined || native.languageOptions === undefined || native.plugins === undefined) {
      throw new Error(`No native Drizzle configuration for ${path}`);
    }
    const languageOptions: Linter.LanguageOptions = native.languageOptions;
    const config: Linter.Config = {
      files: [path],
      languageOptions: {
        ...languageOptions,
        parserOptions: { ...languageOptions.parserOptions, project: false, projectService: false },
      },
      linterOptions: { ...native.linterOptions },
      plugins: native.plugins,
      rules: { [DELETE_RULE]: native.rules[DELETE_RULE] ?? "off" },
    };
    const verify = (input: string): readonly Linter.LintMessage[] => {
      const messages = linter.verify(input, [config], { filename: path });
      expect(
        messages.filter(({ fatal }) => fatal === true),
        path,
      ).toEqual([]);
      return messages;
    };
    const source = readFileSync(join(repoRoot, path), "utf8");
    expect(verify(source), path).toEqual([]);
    const adjacent = verify(source + ADJACENT_DELETES);
    expect(
      adjacent.map(({ ruleId }) => ruleId),
      path,
    ).toEqual([DELETE_RULE]);
    const unqualified = source.replace(/\/\/ eslint-disable-next-line drizzle\/enforce-delete-with-where --[^\n]*/gu, "");
    expect(unqualified === source, path).toBe(bulkCount === 0);
    const bulkMessages = verify(unqualified);
    expect(
      bulkMessages.map(({ ruleId }) => ruleId),
      path,
    ).toEqual(Array.from({ length: bulkCount }, () => DELETE_RULE));
    const unscoped = source.replace("db.delete(themeClusters).where(eq(themeClusters.ownerId, ownerId))", "db.delete(themeClusters)");
    const replacesThemeScope = path === BULK_SUBJECTS[1][0];
    expect(unscoped !== source, path).toBe(replacesThemeScope);
    expect(verify(unscoped).map(({ ruleId }) => ruleId)).toEqual(replacesThemeScope ? [DELETE_RULE] : []);
  }
});
