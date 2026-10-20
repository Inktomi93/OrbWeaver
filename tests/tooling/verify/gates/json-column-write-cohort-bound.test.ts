// The D328 cohort bound at gate level: a write whose normalizer lies past the carried closure is an advisory unknown
// for that write alone, and every other write in the same pass is still judged.
// @subject tooling/src/floor/code-facts/ordinary-root-closure.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { CARRIED_CLOSURE_ROUNDS } from "../../../../tooling/src/floor/code-facts/ordinary-root-closure.ts";
import { gate } from "../../../../tooling/src/verify/gates/json-column-write-parity.ts";
import { jsonWriteProofFiles } from "../../../../tooling/src/verify/lib/json-column-write-proof-fixtures.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/cohort-bound";
// One const-held helper per carried round, plus one, puts the deepest normalizer just past the bound.
const DEPTH = CARRIED_CLOSURE_ROUNDS + 1;

function deepChain(): string {
  const levels = Array.from({ length: DEPTH }, (_, index) => DEPTH - index);
  const chain = levels
    .map((level) => {
      const held = level === DEPTH ? "parser.parse({ fields: [] })" : `v${String(level + 1)}()`;
      return `const D${String(level)} = ${held};\nfunction v${String(level)}() { return D${String(level)}; }\n`;
    })
    .join("");
  return [
    'import { refinerySelectionSchema } from "../../../../../contracts/src/refinery/index.ts";',
    "const parser = refinerySelectionSchema.catch(() => ({ fields: [] }));",
    chain,
    "function view(row) { return { ...parser.parse(row.selection), fields: v1().fields }; }",
    "export async function deep(ctx, id) { const row = await readStored(ctx.db); await ctx.db.update(userSettings).set({ selection: view(row) }).where(id); }",
    "",
  ].join("\n");
}

const FILES = jsonWriteProofFiles({
  "packages/db/src/schema/settings.ts":
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core"; export const userSettings = sqliteTable("user_settings", { userId: text("user_id"), selection: text("selection", { mode: "json" }), config: text("config", { mode: "json" }) });\n',
  "packages/server/src/domain/settings/persistence/deep.ts": deepChain(),
  "packages/server/src/domain/settings/persistence/straddle.ts":
    "export async function merge(db, id) { const row = await readStored(db); await db.update(userSettings).set({ config: { ...row.config } }).where(id); }\nexport async function replace(db, config, id) { await db.update(userSettings).set({ config }).where(id); }\n",
});

test("a normalizer past the carried closure is an advisory unknown for its write; the other writes are still judged", {
  timeout: scaledBudget(120_000),
}, () => {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(FILES)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ file, subject }) => [file, subject])).toEqual([
    ["packages/server/src/domain/settings/persistence/straddle.ts", "userSettings.config"],
  ]);
  expect(result.policies[0]?.analysis?.unknown).toEqual([
    expect.objectContaining({
      file: "packages/server/src/domain/settings/persistence/deep.ts",
      reason: expect.stringContaining("outside the requested ordinary cohort"),
    }),
  ]);
});
