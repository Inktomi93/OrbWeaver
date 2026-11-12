// The whole-tree ESLint parts in `scripts/eslint-parts.ts` are the parts CI lints, every whole-tree lint command runs
// them, and together they lint every file a whole-tree run lints, each once. The file sets come from ESLint's own
// enumeration, with every rule filtered out and a parser that reads nothing, so no typed program loads.
// @subject scripts/eslint-parts.ts
import { join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { Linter } from "eslint";
import { ESLint } from "eslint";
import ts from "typescript";
import { parse } from "yaml";
import { z } from "zod";
import { ESLINT_LINT_SCRIPT, ESLINT_PARTS, ESLINT_PARTS_SCRIPT } from "../../scripts/eslint-parts.ts";
import { TEST_WORLDS } from "../../tooling/src/unwired/worlds.ts";
import { read, workflowJobs } from "./_workflow-support.ts";

const RUNNER = "scripts/eslint-parts.ts";
const PARTS_COMMAND = `pnpm ${ESLINT_PARTS_SCRIPT}`;

// Every line of every run step in a workflow, trimmed, so a multi-line step's commands compare one by one.
function runLines(repoRoot: string, workflow: string): string[] {
  return Object.values(workflowJobs(repoRoot, workflow)).flatMap(({ steps }) => steps.flatMap(({ run }) => (run ?? "").split("\n").map((line) => line.trim())));
}

const lefthookConfig = z.object({ "pre-push": z.object({ commands: z.record(z.string(), z.object({ run: z.string() })) }) });

// `pnpm lint:eslint` passes this flag; the enumeration loads the same config the same way.
const CONFIG_FLAG = "unstable_native_nodejs_ts_config";

// A parser that returns an empty program: which files ESLint lints does not depend on what they hold.
const EMPTY_PROGRAM_PARSER: Linter.Parser = {
  parseForESLint: (text: string) => ({
    ast: {
      type: "Program",
      body: [],
      sourceType: "module",
      range: [0, text.length],
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      tokens: [],
      comments: [],
    },
  }),
};

async function lintedFiles(repoRoot: string, targets: readonly string[], ignorePatterns: readonly string[]): Promise<string[]> {
  const eslint = new ESLint({
    cwd: repoRoot,
    flags: [CONFIG_FLAG],
    ignorePatterns: [...ignorePatterns],
    ruleFilter: (): boolean => false,
    overrideConfig: { languageOptions: { parser: EMPTY_PROGRAM_PARSER } },
  });
  const results = await eslint.lintFiles([...targets]);
  return results.map(({ filePath }) => relative(repoRoot, filePath).replaceAll("\\", "/"));
}

test("the CI eslint matrix runs exactly the parts the pre-push runner runs, through that runner", ({ repoRoot }) => {
  const parts = workflowJobs(repoRoot, "ci")["eslint"]?.strategy?.matrix;
  const matrix = typeof parts === "object" ? parts.part : undefined;
  expect(matrix).toEqual(ESLINT_PARTS.map((part) => part.name));
  const steps = workflowJobs(repoRoot, "ci")["eslint"]?.steps.map(({ run }) => run) ?? [];
  expect(steps).toContain(`${PARTS_COMMAND} \${{ matrix.part }}`);
});

test("pre-push and the contributor workflow lint the whole tree through the parts runner", ({ repoRoot }) => {
  const manifest = z.object({ scripts: z.record(z.string(), z.string()) }).parse(JSON.parse(read(repoRoot, "package.json")));
  expect(manifest.scripts[ESLINT_PARTS_SCRIPT]).toBe(`node ${RUNNER}`);
  const prePush = lefthookConfig.parse(parse(read(repoRoot, "lefthook.yml")))["pre-push"].commands;
  expect(prePush["eslint"]?.run).toBe(PARTS_COMMAND);
  const contributor = runLines(repoRoot, "contributor");
  expect(contributor).toContain(PARTS_COMMAND);
  // A bare `pnpm lint:eslint` line there is a whole-tree run in one process, the form that exhausts its heap.
  expect(contributor.filter((line) => line === `pnpm ${ESLINT_LINT_SCRIPT}` || line.startsWith(`pnpm ${ESLINT_LINT_SCRIPT} `))).toEqual([]);
});

test("the parts lint every file a whole-tree run lints, and no file twice", { timeout: 300_000 }, async ({ repoRoot }) => {
  const whole = await lintedFiles(repoRoot, ["."], []);
  const byPart = await Promise.all(ESLINT_PARTS.map((part) => lintedFiles(repoRoot, part.targets, part.ignorePatterns)));
  const linted = byPart.flat();
  const twice = linted.filter((file, index) => linted.indexOf(file) !== index);
  expect(whole.length).toBeGreaterThan(0);
  expect(twice).toEqual([]);
  expect(linted.toSorted()).toEqual(whole.toSorted());
});

// The root files each test world's tsconfig names, as tsc resolves its `include` and `exclude`.
function worldFiles(repoRoot: string, world: string): ReadonlySet<string> {
  const parsed = ts.getParsedCommandLineOfConfigFile(join(repoRoot, world), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
  return new Set((parsed?.fileNames ?? []).map((file) => relative(repoRoot, file).replaceAll("\\", "/")));
}

const parserProject = z.object({ languageOptions: z.object({ parserOptions: z.object({ project: z.array(z.string()).optional() }).optional() }).optional() });

test("a test-world file takes its own world's project, so no part builds two test-world programs", { timeout: 300_000 }, async ({ repoRoot }) => {
  const worlds = TEST_WORLDS.map((world) => ({ world, files: worldFiles(repoRoot, world) }));
  const eslint = new ESLint({ cwd: repoRoot, flags: [CONFIG_FLAG] });
  const projectOf = async (file: string): Promise<readonly string[]> =>
    parserProject.parse(await eslint.calculateConfigForFile(join(repoRoot, file))).languageOptions?.parserOptions?.project ?? [];
  const byPart = await Promise.all(ESLINT_PARTS.map(async (part) => ({ part, files: await lintedFiles(repoRoot, part.targets, part.ignorePatterns) })));
  const wrong: string[] = [];
  const builds = new Map<string, Set<string>>();
  for (const { part, files } of byPart) {
    for (const file of files) {
      const project = await projectOf(file);
      const world = project.find((name) => worlds.some((entry) => entry.world === name));
      if (world === undefined) {
        continue;
      }
      // The first world whose tsconfig names the file owns it; a file no world names has no world project to take.
      const owner = worlds.find((entry) => entry.files.has(file))?.world ?? "no world";
      if (project.length !== 1 || world !== owner) {
        wrong.push(`${file}: ${project.join(", ")} (owner ${owner})`);
      }
      builds.set(part.name, (builds.get(part.name) ?? new Set()).add(world));
    }
  }
  expect(wrong).toEqual([]);
  expect([...builds].filter(([, built]) => built.size > 1).map(([name, built]) => `${name}: ${[...built].join(", ")}`)).toEqual([]);
  // Positive control: every test world is linted by some part.
  expect(new Set([...builds.values()].flatMap((built) => [...built]))).toEqual(new Set(TEST_WORLDS));
});
