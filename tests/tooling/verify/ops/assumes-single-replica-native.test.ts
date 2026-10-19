import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/assumes-single-replica";
const SUBJECT = "packages/server/src/domain/hub/probe.ts";
const eslint = new ESLint({ cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
}, 120_000);

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

const ANNOTATION = "// ASSUMES(single-replica): per-process state, replace with a DB seam later\n";
const RECORDER = "class Recorder {\n  private count = 0;\n  bump(): void {\n    this.count += 1;\n  }\n}\nexport const recorder = new Recorder();\n";
const RING =
  "export const ring: number[] = [];\nexport function record(n: number): void {\n  ring.push(n);\n  if (ring.length > 100) {\n    ring.shift();\n  }\n}\n";
const CACHE = "export const cache = new Map<string, number>();\n";

test.for([
  ["a module-scope mutable new Map", CACHE, "cache"],
  ["a module-scope Set with a non-literal seed", "export const seen = new Set<string>(external);\n", "seen"],
  ["a module-scope array accumulator mutated by push and shift", RING, "ring"],
  ["a module-scope array accumulator mutated by splice", "export const q: string[] = [];\nexport function drop(): void {\n  q.splice(0, 1);\n}\n", "q"],
  ["a module-scope instance of a local class with a non-readonly field", RECORDER, "recorder"],
  [
    "a module-scope instance of a local class with a non-readonly auto-accessor field",
    "class Recorder {\n  accessor count = 0;\n}\nexport const recorder = new Recorder();\n",
    "recorder",
  ],
  [
    "a module-scope instance of a same-file default-exported class with a non-readonly field",
    "export default class Recorder {\n  count = 0;\n}\nexport const recorder = new Recorder();\n",
    "recorder",
  ],
] as const)("flags %s at the declared name", async ([, source, name]) => {
  const found = await findings(source);
  expect(found).toHaveLength(1);
  const line = source.split("\n")[(found[0]?.line ?? 1) - 1] ?? "";
  expect(line.slice((found[0]?.column ?? 1) - 1, (found[0]?.endColumn ?? 1) - 1)).toBe(name);
});

test.for([
  ["the identical Map with the file annotation", `${ANNOTATION}${CACHE}`],
  ["a Map seeded purely from an array literal", 'export const CONFIG = new Map([["a", 1], ["b", 2]]);\n'],
  [
    "an array literal that is only read",
    'export const LOOKUP = ["a", "b", "c"];\nexport function has(x: string): boolean {\n  return LOOKUP.includes(x);\n}\n',
  ],
  [
    "an instance of a local class whose only field is readonly",
    "class Frozen {\n  private readonly a = 1;\n  get(): number {\n    return this.a;\n  }\n}\nexport const frozen = new Frozen();\n",
  ],
  ["an annotated array accumulator", `${ANNOTATION}${RING}`],
  ["an annotated local-class instance", `${ANNOTATION}${RECORDER}`],
  [
    "an imported factory return, the declared structural limit",
    'import { createBoundedRing } from "@orb/kit/bounded-ring";\nexport const ring = createBoundedRing<string>(10);\n',
  ],
  [
    "a Map created inside a function, not at module scope",
    "export function make(): Map<string, number> {\n  const local = new Map<string, number>();\n  return local;\n}\n",
  ],
  [
    "a shadowing local of the same name mutated inside a function",
    "export const ring: number[] = [];\nexport function other(): number {\n  const ring = [1];\n  ring.push(2);\n  return ring.length;\n}\n",
  ],
] as const)("passes %s", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("the annotation is read from a comment, not from string data", async () => {
  expect(await findings(`export const note = "ASSUMES(single-replica)";\n${CACHE.replace("export const cache", "export const other")}`)).toHaveLength(1);
});

test("the population fence: persistence is excluded, server and inference sources are admitted", async () => {
  expect(await findings(CACHE, "packages/server/src/domain/persistence/store/x.ts")).toEqual([]);
  expect(await findings(CACHE, "packages/server/src/domain/hub/x.ts")).toHaveLength(1);
  expect(await findings(CACHE, "packages/inference/src/backends/x.ts")).toHaveLength(1);
  expect(await findings(CACHE, "packages/client/src/x.ts")).toEqual([]);
});

test("a deliberate exception is waived at its site with a reasoned eslint-disable", async () => {
  const source = `// eslint-disable-next-line ${RULE} -- the proof's stand-in reason.\n${CACHE}`;
  expect(await findings(source)).toEqual([]);
});
