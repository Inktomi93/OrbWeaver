// Drizzle's syntax-only rule must keep local bulk permissions off neighboring scoped writes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import { resolvedConfig } from "./_eslint-config.ts";

const DELETE_RULE = "drizzle/enforce-delete-with-where";
const UPDATE_RULE = "drizzle/enforce-update-with-where";
const BULK_SUBJECTS = [
  ["packages/server/src/domain/discovery/duplicates/generate.ts", 2],
  ["packages/server/src/domain/discovery/themes/generate.ts", 1],
  ["packages/server/src/domain/embeddings/persistence/clear.ts", 0],
] as const;
const ADJACENT_DELETES = "\ndb.delete(controlTable);\ndb.delete(controlTable).where(eq(controlTable.id, controlId));\n";

test("native bulk delete permissions admit only their statements and preserve scoped enforcement", async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const linter = new Linter({ cwd: repoRoot });
  for (const [path, bulkCount] of BULK_SUBJECTS) {
    const native: Linter.Config | undefined = await resolvedConfig(eslint, path);
    if (native.rules === undefined || native.languageOptions === undefined || native.plugins === undefined) {
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

// The plugin matches a receiver by its last member name, so `db` covers every handle spelling the server writes
// through (`db`, `ctx.db`, `deps.db`, `this.db`), while a collection's own `delete` stays out.
test("the where-rules reach every database handle spelling and leave collections alone", async ({ repoRoot }) => {
  const path = "packages/server/src/domain/probe/persistence/probe.ts";
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const native: Linter.Config = await resolvedConfig(eslint, path);
  const rules = Object.fromEntries([DELETE_RULE, UPDATE_RULE].map((rule) => [rule, native.rules?.[rule] ?? "off"]));
  const config: Linter.Config = {
    files: [path],
    languageOptions: { ...native.languageOptions, parserOptions: { ...native.languageOptions?.parserOptions, project: false, projectService: false } },
    ...(native.plugins === undefined ? {} : { plugins: native.plugins }),
    rules,
  };
  const ruleIdsOf = (input: string): readonly (string | null)[] =>
    new Linter({ cwd: repoRoot }).verify(input, [config], { filename: path }).map(({ ruleId }) => ruleId);
  for (const handle of ["db", "ctx.db", "deps.db", "this.db"]) {
    expect(ruleIdsOf(`${handle}.delete(t);\n${handle}.update(t).set({ a: 1 });\n`), handle).toEqual([DELETE_RULE, UPDATE_RULE]);
    expect(ruleIdsOf(`${handle}.delete(t).where(w);\n${handle}.update(t).set({ a: 1 }).where(w);\n`), handle).toEqual([]);
  }
  expect(ruleIdsOf("pending.delete(key);\nhash.update(part);\n")).toEqual([]);
});
