// Native-loader proof for config-snapshot: executable Vitest config is observed after functions, imports,
// and derived arrays resolve, while absent optional fields remain absence and malformed selectors refuse.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ESLint } from "eslint";
import { createVitest } from "vitest/node";
import { snapshotEslintConfig, snapshotVitestConfig } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CONFIG_REL = "vitest.config.ts";
const ESLINT_CONFIG_REL = "eslint.config.js";

async function plant(root: string, source: string): Promise<void> {
  await writeFile(join(root, CONFIG_REL), source, "utf8");
}

async function plantEslintRepo(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  await writeFile(join(root, "package.json"), '{"type":"module"}\n', "utf8");
  for (const [rel, source] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, source, "utf8");
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
}

test("loads an async Vitest config and preserves derived selector owner/field identities", async ({ scratch }) => {
  await plant(
    scratch,
    `const suffixes = [".test.ts", ".dom.test.ts"];
export default async () => ({
  test: {
    exclude: ["reports/**"],
    projects: [
      { test: { name: "unit", include: suffixes.map((suffix) => \`tests/**/*\${suffix}\`) } },
      { test: { exclude: ["tests/tooling/**"] } },
    ],
  },
});
`,
  );

  const snapshot = await snapshotVitestConfig(scratch, CONFIG_REL);

  expect(snapshot.selectors).toContainEqual({
    owner: "project[0]:unit",
    field: "test.include",
    values: ["tests/**/*.test.ts", "tests/**/*.dom.test.ts"],
  });
  expect(snapshot.selectors).toContainEqual({ owner: "project[1]", field: "test.exclude", values: ["tests/tooling/**"] });
  expect(snapshot.selectors).not.toContainEqual(expect.objectContaining({ owner: "project[1]", field: "test.include" }));
});

test("refuses a selector that the native loader resolves to a non-string array", async ({ scratch }) => {
  await plant(scratch, "export default { test: { projects: [{ test: { include: [42] } }] } };\n");

  await expect(snapshotVitestConfig(scratch, CONFIG_REL)).rejects.toThrow("project[0].test.include resolved to a non-string-array selector");
});

test("Vitest natively collects exact files, not empty or directory includes, while a directory exclude is recursive", async ({ scratch }) => {
  await mkdir(join(scratch, "tests/excluded"), { recursive: true });
  await writeFile(join(scratch, "tests/live.test.ts"), "export const live = 1;\n", "utf8");
  await writeFile(join(scratch, "tests/excluded/hidden.test.ts"), "export const hidden = 1;\n", "utf8");
  await plant(
    scratch,
    `export default { test: { projects: [
  { test: { name: "empty", include: [""] } },
  { test: { name: "directory", include: ["tests"] } },
  { test: { name: "exact", include: ["tests/live.test.ts"] } },
  { test: { name: "exclude-directory", include: ["tests/**/*.test.ts"], exclude: ["tests/excluded"] } },
] } };\n`,
  );

  const vitest = await createVitest("test", { root: scratch, config: CONFIG_REL, run: true, watch: false });
  try {
    const collected = new Map<string, readonly string[]>();
    for (const project of vitest.projects) {
      collected.set(project.name, (await project.globTestFiles()).testFiles);
    }
    expect(collected.get("empty")).toEqual([]);
    expect(collected.get("directory")).toEqual([]);
    expect(collected.get("exact")).toEqual([join(scratch, "tests/live.test.ts")]);
    expect(collected.get("exclude-directory")).toEqual([join(scratch, "tests/live.test.ts")]);
  } finally {
    await vitest.close();
  }
});

test("Vitest accepts a globalSetup directory and executes its index module", async ({ scratch }) => {
  const marker = join(scratch, "global-setup-ran");
  await mkdir(join(scratch, "tests/setup"), { recursive: true });
  await writeFile(
    join(scratch, "tests/setup/index.ts"),
    `import { writeFileSync } from "node:fs";\nexport function setup() { writeFileSync(${JSON.stringify(marker)}, "ran"); }\n`,
    "utf8",
  );
  await writeFile(join(scratch, "tests/live.test.ts"), 'import { expect, test } from "vitest";\ntest("live", () => expect(1).toBe(1));\n', "utf8");
  await plant(scratch, 'export default { test: { include: ["tests/live.test.ts"], globalSetup: ["tests/setup"], reporters: [] } };\n');

  const vitest = await createVitest("test", { root: scratch, config: CONFIG_REL, run: true, watch: false, reporters: [] });
  try {
    await vitest.start();
    expect(existsSync(marker)).toBe(true);
  } finally {
    await vitest.close();
  }
});

test("evaluates imported and derived ESLint selectors with entry-local populations", async ({ scratch }) => {
  await plantEslintRepo(scratch, {
    "selector-values.js": 'export const source = ["src/**/*.js"];\nexport const ignored = ["**/*.test.js"].map((value) => value);\n',
    [ESLINT_CONFIG_REL]: 'import { ignored, source } from "./selector-values.js";\nexport default [{ name: "derived", files: source, ignores: ignored }];\n',
    "src/live.js": "export const live = 1;\n",
    "src/live.test.js": "export const test = 1;\n",
    "outside.test.js": "export const outside = 1;\n",
  });

  const snapshot = await snapshotEslintConfig(scratch, ESLINT_CONFIG_REL);

  expect(snapshot.selectors).toEqual([
    { owner: "config[0]:derived", field: "files", position: 0, value: "src/**/*.js", scope: "files", members: 1 },
    { owner: "config[0]:derived", field: "ignores", position: 0, value: "**/*.test.js", scope: "local-ignore", members: 1 },
  ]);
});

test("preserves global directory/negation/dotfile and local basePath/AND semantics", async ({ scratch }) => {
  await plantEslintRepo(scratch, {
    [ESLINT_CONFIG_REL]: `export default [
  { ignores: ["ignored/*", "!ignored/keep.js", "**/.*.js", "blocked"] },
  { name: "scoped", basePath: ${JSON.stringify(join(scratch, "packages/app"))}, files: [["src/**", "**/*.js"]], ignores: ["src/generated/**"] },
];\n`,
    "ignored/drop.js": "drop\n",
    "ignored/keep.js": "keep\n",
    "src/.hidden.js": "hidden\n",
    "blocked/nested.js": "blocked\n",
    "packages/app/src/live.js": "live\n",
    "packages/app/src/generated/output.js": "generated\n",
    "packages/other/src/live.js": "outside base\n",
  });

  const snapshot = await snapshotEslintConfig(scratch, ESLINT_CONFIG_REL);
  const population = Object.fromEntries(snapshot.selectors.map((row) => [`${row.owner}.${row.field}[${String(row.position)}]`, row.members]));

  expect(population).toMatchObject({
    "config[0].ignores[0]": 2,
    "config[0].ignores[1]": 1,
    "config[0].ignores[2]": 1,
    "config[0].ignores[3]": 1,
    "config[1]:scoped.files[0]": 1,
    "config[1]:scoped.ignores[0]": 1,
  });
});

test("refuses empty and unsupported ESLint selector values", async ({ scratch }) => {
  await plantEslintRepo(scratch, { [ESLINT_CONFIG_REL]: "export default [];\n", "live.js": "live\n" });
  await expect(snapshotEslintConfig(scratch, ESLINT_CONFIG_REL)).rejects.toThrow("resolved zero config entries");

  await writeFile(join(scratch, ESLINT_CONFIG_REL), "export default [{ files: [] }];\n", "utf8");
  await expect(snapshotEslintConfig(scratch, ESLINT_CONFIG_REL)).rejects.toThrow("Expected value to be a non-empty array");

  await writeFile(join(scratch, ESLINT_CONFIG_REL), "export default [{ files: [() => true] }];\n", "utf8");
  await expect(snapshotEslintConfig(scratch, ESLINT_CONFIG_REL)).rejects.toThrow("unsupported selector value");
});

test("matches ESLint's implicit base files for every universal files spelling", async ({ scratch }) => {
  await plantEslintRepo(scratch, {
    [ESLINT_CONFIG_REL]: 'export default [{ files: ["src/**"], rules: { semi: "error" } }];\n',
    "live.js": "export const root = 1\n",
    "src/live.js": "export const nested = 1\n",
  });
  const cases = [
    { pattern: "*", path: "live.js" },
    { pattern: "**/*", path: "src/live.js" },
    { pattern: "src/**", path: "src/live.js" },
    { pattern: "src/*", path: "src/live.js" },
  ] as const;

  for (const row of cases) {
    await writeFile(join(scratch, ESLINT_CONFIG_REL), `export default [{ files: [${JSON.stringify(row.pattern)}], rules: { semi: "error" } }];\n`, "utf8");
    const snapshot = await snapshotEslintConfig(scratch, ESLINT_CONFIG_REL);
    const eslint = new ESLint({ cwd: scratch, overrideConfigFile: join(scratch, ESLINT_CONFIG_REL) });
    const nativeMembers = (
      await Promise.all([ESLINT_CONFIG_REL, "live.js", "src/live.js"].map((path) => eslint.calculateConfigForFile(join(scratch, path))))
    ).filter((config) => config?.rules?.semi !== undefined).length;
    expect(snapshot.selectors[0]).toMatchObject({ value: row.pattern, members: nativeMembers });
    expect((await eslint.calculateConfigForFile(join(scratch, row.path)))?.rules?.semi).toBeDefined();
  }
});

test("matches ESLint for a local ignores-and-rules entry without files", async ({ scratch }) => {
  await plantEslintRepo(scratch, {
    [ESLINT_CONFIG_REL]: 'export default [{ files: ["**/*.js"], rules: {} }, { ignores: ["**/*.test.js"], rules: { semi: "error" } }];\n',
    "src/live.js": "export const live = 1\n",
    "src/live.test.js": "export const test = 1\n",
  });

  const snapshot = await snapshotEslintConfig(scratch, ESLINT_CONFIG_REL);
  const ignore = snapshot.selectors.find((row) => row.owner === "config[1]" && row.field === "ignores");
  const eslint = new ESLint({ cwd: scratch, overrideConfigFile: join(scratch, ESLINT_CONFIG_REL) });

  expect(ignore).toMatchObject({ scope: "local-ignore", value: "**/*.test.js", members: 1 });
  expect((await eslint.calculateConfigForFile(join(scratch, "src/live.js")))?.rules?.semi).toBeDefined();
  expect((await eslint.calculateConfigForFile(join(scratch, "src/live.test.js")))?.rules?.semi).toBeUndefined();
});

test("keeps local-ignore counterfactuals from widening universal selectors or unrelated no-files entries", async ({ scratch }) => {
  await plantEslintRepo(scratch, {
    [ESLINT_CONFIG_REL]: `export default [
  { files: ["src/**/*.ts"], ignores: ["src/**/*.test.ts"] },
  { files: ["src/**"], rules: { semi: "error" } },
  { ignores: ["src/**/*.test.ts"], rules: { quotes: ["error", "double"] } },
];\n`,
    "src/live.ts": "export const live = 1\n",
    "src/live.test.ts": "export const test = 1\n",
  });

  const snapshot = await snapshotEslintConfig(scratch, ESLINT_CONFIG_REL);
  const population = Object.fromEntries(snapshot.selectors.map((row) => [`${row.owner}.${row.field}[${String(row.position)}]`, row.members]));
  const eslint = new ESLint({ cwd: scratch, overrideConfigFile: join(scratch, ESLINT_CONFIG_REL) });
  const live = await eslint.calculateConfigForFile(join(scratch, "src/live.ts"));
  const testFile = await eslint.calculateConfigForFile(join(scratch, "src/live.test.ts"));

  expect(population).toMatchObject({
    "config[0].files[0]": 1,
    "config[0].ignores[0]": 1,
    "config[1].files[0]": 1,
    "config[2].ignores[0]": 0,
  });
  expect(live?.rules?.semi).toBeDefined();
  expect(live?.rules?.quotes).toBeDefined();
  expect(testFile?.rules?.semi).toBeUndefined();
  expect(testFile?.rules?.quotes).toBeUndefined();
});
