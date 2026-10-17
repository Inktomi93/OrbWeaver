import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SourceFile } from "ts-morph";
import { vi } from "vitest";
import type { SemanticInventoryOptions } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { latestInventoryGeneration, openInventoryDatabase } from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";
import { NATIVE_EXPORT_CUTS } from "../compiler/native-inventory-stage-fault.ts";

const ENTRY = "entry.ts";
const EMPTY = "empty.ts";
const NODE = "tsconfig.json";
const BROWSER = "tsconfig.tests-dom.json";

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  write(NODE, JSON.stringify({ compilerOptions, files: [ENTRY, EMPTY, "node-bound.ts", "browser-bound.ts"] }));
  write(BROWSER, JSON.stringify({ compilerOptions: { ...compilerOptions, customConditions: ["browser"] }, files: [ENTRY] }));
  write(
    "package.json",
    JSON.stringify({ name: "export-coverage-fixture", type: "module", imports: { "#bound": { browser: "./browser-bound.ts", default: "./node-bound.ts" } } }),
  );
  write(ENTRY, "export type {Shared as Named} from '#bound';\nexport * as Namespace from '#bound';\n");
  write(EMPTY, "export {};\n");
  write("node-bound.ts", "export interface Shared {readonly node:true}\nexport interface Shared {readonly merged:true}\n");
  write("browser-bound.ts", "export interface Shared {readonly browser:true}\n");
  execFixtureGit(root, ["init", "-q"]);
}

function options(root: string): SemanticInventoryOptions & Required<Pick<SemanticInventoryOptions, "exportQueries">> {
  return {
    root,
    programs: readCompilerPrograms(root),
    families: ["export-declarations"],
    exportQueries: [
      { program: NODE, query: { file: join(root, ENTRY), name: "Named" } },
      { program: NODE, query: { file: join(root, ENTRY), name: "Namespace" } },
      { program: NODE, query: { file: join(root, EMPTY), name: "Named" } },
      { program: BROWSER, query: { file: join(root, ENTRY), name: "Named" } },
    ],
  };
}

function source(inventory: ReturnType<typeof nativeInventoryFixture>, root: string, path: string): SourceFile {
  const found = inventory.sourceCorpus().getSourceFile(join(root, path));
  if (found === undefined) {
    throw new Error("native export control source is missing");
  }
  return found;
}

test(
  "strict exports retain native importing-world type aliases, namespace declarations and explicit empty sources",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    using inventory = nativeInventoryFixture(options(scratch));
    const entry = source(inventory, scratch, ENTRY);
    expect(inventory.exportDeclarations(entry, NODE, "Named")?.map((node) => node.getSourceFile().getFilePath())).toEqual([
      join(scratch, "node-bound.ts"),
      join(scratch, "node-bound.ts"),
    ]);
    expect(inventory.exportDeclarations(entry, BROWSER, "Named")?.map((node) => node.getSourceFile().getFilePath())).toEqual([
      join(scratch, "browser-bound.ts"),
    ]);
    expect(inventory.exportDeclarations(entry, NODE, "Namespace")).toHaveLength(1);
    expect(inventory.exportDeclarations(source(inventory, scratch, EMPTY), NODE, "Named")).toBeNull();
    expect(() => inventory.exportDeclarations(entry, NODE, "Unrequested")).toThrow("source/name coverage is unavailable");
    expect(() => inventory.exportDeclarations(entry, "foreign", "Named")).toThrow("partition is unavailable");
    const before = inventory.generation;
    const workers: string[] = [];
    using reused = nativeInventoryFixture(options(scratch), { workers });
    expect(workers).toEqual([]);
    expect(reused.generation).toBe(before);
  },
  scaledBudget(60_000),
);

test(
  "legacy empty exports do not authorize strict completeness, and stale source text cannot reuse a capture",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    using legacy = nativeInventoryFixture({ root: scratch, programs: readCompilerPrograms(scratch), families: ["exports"] });
    const empty = source(legacy, scratch, EMPTY);
    expect([...legacy.exports(empty)]).toEqual([]);
    expect(() => legacy.exportDeclarations(empty, NODE, "Named")).toThrow("family unavailable");
    using strict = nativeInventoryFixture(options(scratch));
    const entry = source(strict, scratch, ENTRY);
    entry.replaceWithText(`${entry.getFullText()}\nexport const changed=1;`);
    expect(() => strict.exportDeclarations(entry, NODE, "Named")).toThrow("source/epoch is not admitted");
  },
  scaledBudget(60_000),
);

test.for(Object.keys(NATIVE_EXPORT_CUTS) as (keyof typeof NATIVE_EXPORT_CUTS)[])(
  "missing strict %s coverage refuses a worker without publishing over the pinned generation",
  { timeout: scaledBudget(60_000) },
  (cut, { scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const requested = options(scratch);
    using previous = nativeInventoryFixture({ ...requested, exportQueries: requested.exportQueries.filter(({ program }) => program === NODE) });
    const previousGeneration = previous.generation;
    const pinned = previous.exportDeclarations(source(previous, scratch, ENTRY), NODE, "Named")?.map((node) => node.getText());
    const faults: string[] = [];
    expect(() => nativeInventoryFixture(requested, cut === "worker" ? { failWorker: true } : { fault: `export-${cut}`, faults })).toThrow(
      NATIVE_EXPORT_CUTS[cut],
    );
    expect(faults).toEqual(cut === "worker" ? [] : [`export-${cut}`]);
    using observer = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(observer)).toBe(previousGeneration);
    expect(previous.exportDeclarations(source(previous, scratch, ENTRY), NODE, "Named")?.map((node) => node.getText())).toEqual(pinned);
  },
);

test(
  "closed export demand refuses missing sources and family mismatches rather than manufacturing absence",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const selected = readCompilerPrograms(scratch).filter(({ id }) => id === NODE);
    expect(() => nativeInventoryFixture({ root: scratch, programs: selected, families: ["export-declarations"] })).toThrow("closed source/name demand");
    expect(() => nativeInventoryFixture({ root: scratch, programs: selected, families: ["exports"], exportQueries: [] })).toThrow("closed source/name demand");
    expect(() =>
      nativeInventoryFixture({
        root: scratch,
        programs: selected,
        families: ["export-declarations"],
        exportQueries: [{ program: NODE, query: { file: join(scratch, "missing.ts"), name: "Named" } }],
      }),
    ).toThrow("admitted native roots");
  },
  scaledBudget(60_000),
);

test(
  "export overlays remain private while a committed new capture leaves old readers pinned",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const requested = options(scratch);
    using old = nativeInventoryFixture(requested);
    const previous = old.exportDeclarations(source(old, scratch, ENTRY), NODE, "Named")?.map((node) => node.getText());
    using overlay = nativeInventoryFixture(requested, {
      projection: { root: scratch, files: [{ path: join(scratch, ENTRY), text: "export {};\n" }], deleted: [] },
    });
    expect(overlay.exportDeclarations(source(overlay, scratch, ENTRY), NODE, "Named")).toBeNull();
    writeFileSync(join(scratch, ENTRY), "export {};\n");
    using next = nativeInventoryFixture({ ...requested, programs: readCompilerPrograms(scratch) });
    expect(next.generation).toBeGreaterThan(old.generation);
    expect(next.exportDeclarations(source(next, scratch, ENTRY), NODE, "Named")).toBeNull();
    expect(old.exportDeclarations(source(old, scratch, ENTRY), NODE, "Named")?.map((node) => node.getText())).toEqual(previous);
  },
  scaledBudget(60_000),
);

test("export request names and owners remain sealed before read and after disposal", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const home = project.createSourceFile("/fixture/home.ts", "export type Subject = string;\n");
  using facts = isolatedTypeFacts(project);
  facts.request("owner", { kind: "export-declarations", nodes: [home], name: "Subject" });
  expect(() => facts.exportDeclarations("owner", [home], "Subject")).toThrow("must be sealed");
  facts.seal(new Set(["owner"]));
  expect(facts.exportDeclarations("owner", [home], "Subject").get(home)).toHaveLength(1);
  expect(() => facts.exportDeclarations("owner", [home], "Other")).toThrow("not registered by this owner");
  expect(() => facts.exportDeclarations("other", [home], "Subject")).toThrow("not registered by this owner");
  expect(() => facts.request("owner", { kind: "export-declarations", nodes: [home], name: "Other" })).toThrow("registration is sealed");
  facts[Symbol.dispose]();
  expect(() => facts.exportDeclarations("owner", [home], "Subject")).toThrow("disposed");
});

test(
  "strict export capture asks the canonical producer only for the requested source population",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === NODE);
    if (descriptor === undefined) {
      throw new Error("the native Node export program is missing");
    }
    const allowed = new Set([join(scratch, ENTRY), join(scratch, EMPTY)]);
    const readExports = SourceFile.prototype.getExportedDeclarations;
    const observed: string[] = [];
    const reads = vi.spyOn(SourceFile.prototype, "getExportedDeclarations").mockImplementation(function (this: SourceFile) {
      const path = this.getFilePath();
      observed.push(path);
      if (!allowed.has(path)) {
        throw new Error("strict export capture enumerated an unrequested source");
      }
      return readExports.call(this);
    });
    try {
      const capture = extractInventoryPartition({
        root: scratch,
        descriptor,
        destination: join(scratch, "unused.sqlite"),
        families: ["export-declarations"],
        exportQueries: options(scratch)
          .exportQueries.filter(({ program }) => program === NODE)
          .map(({ query }) => query),
      });
      expect([...new Set(observed)].sort()).toEqual([...allowed].sort());
      expect(capture.exportDeclarations).toHaveLength(3);
      expect(capture.exports).toEqual([]);
    } finally {
      reads.mockRestore();
    }
  },
  scaledBudget(60_000),
);
