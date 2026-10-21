import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-hardcoded-side-gen-sampling";
const VERB = "packages/server/src/domain/chat/verbs/thing.ts";
const eslint = new ESLint({ cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, VERB));
}, 120_000);

async function findings(source: string, path = VERB): Promise<readonly string[]> {
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
  return found.filter(({ ruleId }) => ruleId === RULE).map(({ line, column }) => `${String(line)}:${String(column)}`);
}

async function inScope(path: string): Promise<boolean> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  return config?.rules?.[RULE]?.[0] === 2;
}

test.for([
  ["a literal temperature and its corroborated maxTokens", "export const opts = { temperature: 0.3, maxTokens: 24 };\n", 2],
  ["the ladder's own output name at a compose seam", "export const opts = { maxOutputTokens: 1024 };\n", 1],
  ["a signed literal", "export const opts = { temperature: -1 };\n", 1],
  ["a hoisted same-file constant", "const ARBITER_TEMPERATURE = 0.3;\nexport const opts = { temperature: ARBITER_TEMPERATURE };\n", 1],
  ["a constant two hops away", "const BASE = 0.9;\nconst TOP_P = BASE;\nexport const opts = { topP: TOP_P };\n", 1],
  ["a computed literal key", 'export const opts = { ["topP"]: 0.9 };\n', 1],
  ["a quoted key", 'export const opts = { "temperature": 0.3 };\n', 1],
] as const)("the rule reports %s", async ([, source, count]) => {
  expect(await findings(source)).toHaveLength(count);
});

test.for([
  [
    "a lone maxTokens canon-window budget",
    "const RPG_RESYNC_MAX_TOKENS = 24000;\nexport const read = (resolveCanonWindow: (o: { maxTokens: number }) => void) => resolveCanonWindow({ maxTokens: RPG_RESYNC_MAX_TOKENS });\n",
  ],
  [
    "a catalog floor import",
    'import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";\nexport const opts = { temperature: SIDE_GEN_POSTURES.arbiter.temperature };\n',
  ],
  ["an imported catalog scalar", 'import { ARBITER_TEMPERATURE } from "@orb/contracts/preset";\nexport const opts = { temperature: ARBITER_TEMPERATURE };\n'],
  [
    "a resolved ladder value",
    "declare function resolveSideGenSampling(floor: unknown): { readonly temperature?: number };\nexport const opts = { temperature: resolveSideGenSampling({}).temperature };\n",
  ],
  ["a knob outside the ladder vocabulary", 'export const opts = { model: "x", topK: 40 };\n'],
  ["a reassigned binding", "let t = 0.3;\nt = 0.4;\nexport const opts = { temperature: t };\n"],
] as const)("the rule passes %s", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("the seal binds domain and entry callers, never infra or specs", async () => {
  expect(await inScope(VERB)).toBe(true);
  expect(await inScope("packages/server/src/entry/compose/thing.ts")).toBe(true);
  expect(await inScope("packages/server/src/infra/providers/backends/wire.ts")).toBe(false);
  expect(await inScope("packages/server/src/domain/chat/verbs/posture.test.ts")).toBe(false);
  expect(await inScope("packages/inference/src/funnel/resolve-side-gen.ts")).toBe(false);
});
