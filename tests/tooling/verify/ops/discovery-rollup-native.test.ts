import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/discovery-no-stats-rollups";
const SUBJECT = "packages/server/src/domain/discovery/verbs/rank.ts";
const eslint = new ESLint({ cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
}, 120_000);

async function findings(source: string, path = SUBJECT): Promise<number> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null } },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE).length;
}

test.for([
  ["a rollup table import", 'import { ownerStats } from "@orb/db";\nexport const t = ownerStats;\n'],
  ["an alias through the barrel", 'import { characterStats as cs } from "@orb/db";\nexport const t = cs;\n'],
  ["a namespace import of the db module", 'import * as db from "@orb/db";\nexport const t = db.dailyStats;\n'],
  ["the bracket spelling through a namespace", 'import * as db from "@orb/db";\nexport const t = db["modelStats"];\n'],
  ["an import from an unreadable door", 'import { modelStats } from "./missing.ts";\nexport const t = modelStats;\n'],
  ["a re-export of the table", 'export { ownerStats } from "@orb/db";\n'],
  ["a dynamic import of the db module", 'export const load = () => import("@orb/db");\n'],
] as const)("the rule reports %s", async ([, source]) => {
  expect(await findings(source)).toBe(1);
});

test.for([
  ["a local object whose key is spelled like a table", "const view = { ownerStats: 1 };\nexport const t = view.ownerStats;\n"],
  ["discovery's own table", 'import { characterDiscoveryFacets } from "@orb/db";\nexport const t = characterDiscoveryFacets;\n'],
] as const)("the rule passes %s", async ([, source]) => {
  expect(await findings(source)).toBe(0);
});

test("the stats domain owns the rollups and is outside the fence", async () => {
  expect((await eslint.calculateConfigForFile(join(ROOT, SUBJECT)))?.rules?.[RULE]?.[0]).toBe(2);
  expect((await eslint.calculateConfigForFile(join(ROOT, "packages/server/src/domain/stats/verbs/x.ts")))?.rules?.[RULE]).toBeUndefined();
});
