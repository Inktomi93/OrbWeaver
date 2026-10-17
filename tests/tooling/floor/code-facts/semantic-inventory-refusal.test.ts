import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { buildLiveness, collectApiSurface, collectOrphanCandidates, ownExports } from "@orb/tooling/ast";
import { latestInventoryGeneration, openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { readInventoryModules } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";
import { copyNativeInventoryImplementation } from "../compiler/native-inventory-tree.ts";

function write(root: string, path: string, text: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function initialize(root: string): void {
  write(root, ".gitignore", ".cache/\nnode_modules/\n");
  write(
    root,
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022"], types: [] }, include: ["src/*.ts"] }),
  );
  write(root, "src/module.ts", "export default function(){ return 1; }; export const untouched=2;\n");
  write(root, "src/barrel.ts", "export {default as Public} from './module';\n");
  write(
    root,
    "src/consumer.ts",
    "import {Public as local} from './barrel'; export const used=local(); const computed='./module'; export const unresolved=import(computed); const witness='Public' satisfies keyof typeof import('./barrel'); export const checked=witness;\n",
  );
  execFixtureGit(root, ["init", "-q"]);
}

function fixtureValue<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("required native fixture value missing");
  }
  return value;
}

test("anonymous default aliases and nonliteral dynamic refusals retain native collector meaning", ({ scratch }) => {
  initialize(scratch);
  const native = createSemanticWorkspace({ root: scratch });
  using stored = nativeInventoryFixture({ root: scratch });
  const nativeCorpus = native.sourceCorpus();
  using storedCorpus = stored.sourceCorpus();
  const summarize = (corpus: typeof nativeCorpus): object => {
    const live = buildLiveness(corpus);
    return {
      files: corpus.getSourceFiles().map((file) => file.getFilePath()),
      own: corpus.getSourceFiles().flatMap((file) => [...ownExports(file)].map(({ name, decl }) => [name, decl.getStart(), decl.getKind()])),
      orphans: collectOrphanCandidates(corpus, live, () => true).map(({ name, starSuppressed }) => [name, starSuppressed]),
      api: collectApiSurface(corpus, () => true, live).map(({ name, klass, consumers }) => [name, klass, consumers]),
    };
  };
  expect(summarize(storedCorpus)).toEqual(summarize(nativeCorpus));
  expect(collectOrphanCandidates(storedCorpus, buildLiveness(storedCorpus), () => true).map(({ name }) => name)).toContain("untouched");
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partitions = readInventoryGeneration(db, latestInventoryGeneration(db));
  expect(
    partitions.flatMap((partition) => [...readInventoryModules(db, partition.id)]).find((module) => module.dynamic && module.specifier === null),
  ).toMatchObject({
    target: null,
    declarations: [],
  });
});

test("detached source-reader witnesses refuse identically instead of keeping an export alive", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  initialize(scratch);
  write(scratch, "src/consumer.ts", "const witness='Public' satisfies keyof typeof import('./barrel'); export const checked='detached';\n");
  const native = createSemanticWorkspace({ root: scratch });
  expect(() => buildLiveness(native.sourceCorpus())).toThrow("detached external-consumption witness");
  using stored = nativeInventoryFixture({ root: scratch });
  expect(() => buildLiveness(stored.sourceCorpus())).toThrow("detached external-consumption witness");
});

test("a physically shared importer with differing native targets refuses world selection", ({ scratch }) => {
  initialize(scratch);
  write(scratch, "src/consumer.ts", "import {platform} from 'fixture-platform'; export const used=platform;\n");
  write(
    scratch,
    "tsconfig.browser.json",
    JSON.stringify({ extends: "./tsconfig.json", compilerOptions: { customConditions: ["browser"] }, files: ["src/consumer.ts"], include: [] }),
  );
  write(
    scratch,
    "node_modules/fixture-platform/package.json",
    JSON.stringify({ name: "fixture-platform", exports: { ".": { browser: "./browser.ts", default: "./node.ts" } } }),
  );
  write(scratch, "node_modules/fixture-platform/browser.ts", "export const platform='browser';\n");
  write(scratch, "node_modules/fixture-platform/node.ts", "export const platform='node';\n");
  const native = createSemanticWorkspace({ root: scratch });
  const views = native.sourceViews("src/consumer.ts");
  const targets = views
    .map((view) => view.sourceFile.getImportDeclarationOrThrow("fixture-platform").getModuleSpecifierSourceFile()?.getFilePath())
    .toSorted((left, right) => String(left).localeCompare(String(right)));
  expect(targets).toEqual([join(scratch, "node_modules/fixture-platform/browser.ts"), join(scratch, "node_modules/fixture-platform/node.ts")]);
  const usages = views.map(({ sourceFile }) => native.bindingUsage(sourceFile));
  expect(usages[0]).not.toBe(usages[1]);
  expect(
    usages
      .map((usage) => [...usage.parents().keys()].filter((key) => key.includes("/fixture-platform/")))
      .toSorted((left, right) => String(left).localeCompare(String(right))),
  ).toEqual(targets.map((target) => [`${target}\0${String("export const ".length)}`]).toSorted((left, right) => String(left).localeCompare(String(right))));
  using stored = nativeInventoryFixture({ root: scratch });
  const importing = fixtureValue(stored.sourceCorpus().getSourceFile("src/consumer.ts")).getImportDeclarationOrThrow("fixture-platform");
  expect(() => stored.moduleTarget(importing)).toThrow("native semantic inventory ambiguity");
  expect(() => buildLiveness(stored.sourceCorpus())).toThrow("native semantic inventory ambiguity");
  expect(() => stored.bindingUsage(importing.getSourceFile()).parents()).toThrow("native semantic inventory ambiguity");
});

test(
  "config mutation rejects captured descriptors while workspace inventory uses current native options",
  ({ scratch, repoRoot }) => {
    const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
    const root = join(scratch, "subject");
    mkdirSync(root);
    writeFileSync(join(root, ".gitignore"), ".cache/\n");
    execFixtureGit(root, ["init", "-q"]);
    const entry = fileURLToPath(new URL("../compiler/native-inventory-adapter-cases.ts", import.meta.url));
    const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const resultPath = join(scratch, "result.json");
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "workspace-config", implementation, root, resultPath], {
      timeout: scaledBudget(110_000),
    });
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toMatchObject({
      mode: "workspace-config",
      before: "a.ts",
      stale: expect.stringMatching(/descriptor snapshot is stale/u),
      refusedWithoutPublication: true,
      current: "b.ts",
      fresh: "b.ts",
      freshReused: true,
      selected: "b.ts",
      selectedPrograms: ["tsconfig.json"],
      pinned: "a.ts",
    });
  },
  scaledBudget(120_000),
);
