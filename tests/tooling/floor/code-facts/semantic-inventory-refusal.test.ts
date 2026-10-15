import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { buildLiveness, collectApiSurface, collectOrphanCandidates, ownExports } from "@orb/tooling/ast";
import { createSemanticInventory } from "@orb/tooling/floor/code-facts/semantic-inventory";
import { latestInventoryGeneration, openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { readInventoryModules } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";

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
  using stored = createSemanticInventory({ root: scratch });
  const nativeCorpus = native.sourceCorpus();
  const storedCorpus = stored.sourceCorpus();
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

test("detached source-reader witnesses refuse identically instead of keeping an export alive", ({ scratch }) => {
  initialize(scratch);
  write(scratch, "src/consumer.ts", "const witness='Public' satisfies keyof typeof import('./barrel'); export const checked='detached';\n");
  const native = createSemanticWorkspace({ root: scratch });
  expect(() => buildLiveness(native.sourceCorpus())).toThrow("detached external-consumption witness");
  using stored = createSemanticInventory({ root: scratch });
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
  using stored = createSemanticInventory({ root: scratch });
  const importing = fixtureValue(stored.sourceCorpus().getSourceFile("src/consumer.ts")).getImportDeclarationOrThrow("fixture-platform");
  expect(() => stored.moduleTarget(importing)).toThrow("native semantic inventory ambiguity");
  expect(() => buildLiveness(stored.sourceCorpus())).toThrow("native semantic inventory ambiguity");
  expect(() => stored.bindingUsage(importing.getSourceFile()).parents()).toThrow("native semantic inventory ambiguity");
});

test("config mutation rejects captured descriptors while workspace inventory uses current native options", ({ scratch }) => {
  write(scratch, ".gitignore", ".cache/\n");
  write(scratch, "a.ts", "export const choice='a';\n");
  write(scratch, "b.ts", "export const choice='b';\n");
  write(scratch, "consumer.ts", "import {choice} from '@choice'; export const used=choice;\n");
  const config = (choice: string): string =>
    JSON.stringify({
      files: ["a.ts", "b.ts", "consumer.ts"],
      compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler", paths: { "@choice": [`./${choice}.ts`] } },
    });
  write(scratch, "tsconfig.json", config("a"));
  write(scratch, "tsconfig.side.json", JSON.stringify({ files: ["a.ts"], compilerOptions: { noLib: true, types: [] } }));
  execFixtureGit(scratch, ["init", "-q"]);
  const workspace = createSemanticWorkspace({ root: scratch });
  const captured = workspace.programs.map(({ descriptor }) => descriptor);
  using previous = workspace.inventory();
  const target = (inventory: typeof previous): string | undefined =>
    inventory.moduleTarget(fixtureValue(inventory.sourceCorpus().getSourceFile("consumer.ts")).getImportDeclarationOrThrow("@choice"))?.getFilePath();
  expect(target(previous)).toBe(join(scratch, "a.ts"));
  write(scratch, "tsconfig.json", config("b"));
  expect(() => createSemanticInventory({ root: scratch, programs: captured })).toThrow("descriptor snapshot is stale");
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(database)).toBe(previous.generation);
  using current = workspace.inventory();
  expect(target(current)).toBe(join(scratch, "b.ts"));
  using fresh = createSemanticInventory({ root: scratch });
  expect(target(fresh)).toBe(join(scratch, "b.ts"));
  expect(fresh.generation).toBe(current.generation);
  const currentDescriptors = createSemanticWorkspace({ root: scratch }).programs.map(({ descriptor }) => descriptor);
  using selected = createSemanticInventory({ root: scratch, programs: currentDescriptors.filter(({ id }) => id === "tsconfig.json") });
  expect(selected.programs).toEqual(["tsconfig.json"]);
  expect(target(selected)).toBe(join(scratch, "b.ts"));
  expect(target(previous)).toBe(join(scratch, "a.ts"));
});
