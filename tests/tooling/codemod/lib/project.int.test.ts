import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TEST_KIND_DEFINITIONS } from "@orb/tooling/_shared/test-kinds";
import { castStringLiteralsByDiagnostic, createCodemodProject, deleteFiles, isTestFile, moveFiles, runCodemod } from "@orb/tooling/codemod";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SEMANTIC_RUN_TIMEOUT_MS = scaledBudget(20_000);

function initializeGit(root: string): void {
  const initialized = spawnSync("git", ["init", "--quiet", "--template=", "--initial-branch=main"], { cwd: root, encoding: "utf8" });
  expect(initialized.status, initialized.stderr).toBe(0);
}

test("createCodemodProject honors the explicit config basename", ({ scratch }) => {
  initializeGit(scratch);
  const source = join(scratch, "subject.ts");
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ compilerOptions: { strictNullChecks: true }, files: ["subject.ts"] }));
  writeFileSync(join(scratch, "tsconfig.loose.json"), JSON.stringify({ compilerOptions: { strictNullChecks: false }, files: ["subject.ts"] }));
  writeFileSync(source, "export const value: number = null;\n");

  const project = createCodemodProject({ tsConfigFilePath: join(scratch, "tsconfig.loose.json"), replaceGlobs: [source] });

  expect(project.getCompilerOptions().strictNullChecks).toBe(false);
  expect(project.getPreEmitDiagnostics()).toEqual([]);
});

test("isTestFile consumes every canonical authored test kind", () => {
  for (const { suffix } of TEST_KIND_DEFINITIONS) {
    expect(isTestFile(`/repo/tests/subject${suffix}`), suffix).toBe(true);
  }
  expect(isTestFile("/repo/tests/support/helper.ts")).toBe(false);
});

test("the mutable project excludes ignored sibling worktrees and dependencies", ({ scratch }) => {
  initializeGit(scratch);
  const subject = join(scratch, "subject.ts");
  const sibling = join(scratch, ".claude/worktrees/decoy/poison.ts");
  const dependency = join(scratch, "node_modules/decoy/index.ts");
  writeFileSync(join(scratch, ".gitignore"), ".claude/worktrees/\nnode_modules/\n");
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ include: ["**/*.ts"] }));
  writeFileSync(subject, "export const subject = true;\n");
  mkdirSync(join(scratch, ".claude/worktrees/decoy"), { recursive: true });
  mkdirSync(join(scratch, "node_modules/decoy"), { recursive: true });
  writeFileSync(sibling, "export const poison = true;\n");
  writeFileSync(dependency, "export const dependency = true;\n");

  const project = createCodemodProject({ tsConfigFilePath: join(scratch, "tsconfig.json"), replaceGlobs: [`${scratch}/**/*.ts`] });

  expect(project.getSourceFile(subject)).toBeDefined();
  expect(project.getSourceFile(sibling)).toBeUndefined();
  expect(project.getSourceFile(dependency)).toBeUndefined();
});

test(
  "diagnostic-driven planning reads the selected native test program without an external log",
  async ({ scratch }) => {
    initializeGit(scratch);
    const subject = join(scratch, "subject.test-d.ts");
    writeFileSync(
      join(scratch, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          ignoreDeprecations: "6.0",
          module: "esnext",
          moduleResolution: "bundler",
          noEmit: true,
          strict: true,
          paths: { "#brand": ["./loose.ts"] },
        },
        files: ["subject.test-d.ts"],
      }),
    );
    writeFileSync(
      join(scratch, "tsconfig.tests.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          ignoreDeprecations: "6.0",
          module: "esnext",
          moduleResolution: "bundler",
          noEmit: true,
          strict: true,
          paths: { "#brand": ["./strict.ts"] },
        },
        files: ["subject.test-d.ts"],
      }),
    );
    writeFileSync(join(scratch, "loose.ts"), "export type ProviderId = string;\nexport const castId = <T>(value: string): T => value as T;\n");
    writeFileSync(
      join(scratch, "strict.ts"),
      'export type ProviderId = string & { readonly __brand: "ProviderId" };\nexport const castId = <T>(value: string): T => value as T;\n',
    );
    writeFileSync(subject, 'import type { ProviderId } from "#brand";\nexport const provider: ProviderId = "openrouter";\n');

    const result = await runCodemod(
      "native-diagnostic-plan",
      (ctx) => {
        ctx.plan(
          castStringLiteralsByDiagnostic(ctx, {
            brand: "ProviderId",
            brandHints: ["ProviderId"],
            castFn: "castId",
            importModule: "#brand",
          }),
        );
      },
      {
        argv: [],
        forceApply: true,
        repoRoot: scratch,
        setup: { replaceGlobs: [subject] },
      },
    );

    expect(result.filesChanged).toBe(1);
    expect(readFileSync(subject, "utf8")).toContain('castId<ProviderId>("openrouter")');
  },
  SEMANTIC_RUN_TIMEOUT_MS,
);

test("fresh semantic queries see an unsaved move and do not resurrect its deleted origin", async ({ scratch }) => {
  initializeGit(scratch);
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "esnext", moduleResolution: "bundler", noEmit: true, strict: true }, include: ["*.ts", "moved/*.ts"] }),
  );
  writeFileSync(join(scratch, "value.ts"), "export const value = 1;\n");
  writeFileSync(join(scratch, "consumer.ts"), 'import { value } from "./value.js";\nexport const answer: number = value;\n');

  await runCodemod(
    "semantic-overlay",
    (ctx) => {
      ctx.plan(moveFiles(ctx, [["value.ts", "moved/value.ts"]]));
      const moved = ctx.semantic();
      expect(moved.sourceViews("value.ts")).toEqual([]);
      expect(moved.sourceViews("moved/value.ts")).toHaveLength(1);
      expect(moved.programs.flatMap((program) => program.project().getPreEmitDiagnostics())).toEqual([]);

      ctx.plan(deleteFiles(ctx, ["moved/value.ts"], { confirm: true }));
      const deleted = ctx.semantic();
      expect(deleted.sourceViews("moved/value.ts")).toEqual([]);
      expect(deleted.programs.flatMap((program) => program.project().getPreEmitDiagnostics()).map((diagnostic) => diagnostic.getCode())).toContain(2307);
    },
    {
      argv: [],
      repoRoot: scratch,
      setup: { replaceGlobs: [`${scratch}/**/*.ts`] },
      skipDiagnosticsCheck: true,
    },
  );
});
