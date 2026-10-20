import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { InventoryBuildRequest } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import { latestInventoryGeneration, openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { canonicalInventoryPath, contentVersion, inputVersion, inventoryAuthoredFiles } from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { extractInventoryPartition } from "@orb/tooling/floor/compiler/semantic-inventory-extract";
import { createSemanticWorkspace, nativeCompilerSourceFiles } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { Project, ts } from "ts-morph";
import { vi } from "vitest";
import { readInventoryInputs, readInventorySourceMetadata } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { fixtureValue, nativeReferenceFixture, redirectFixture, span } from "./_semantic-inventory-extract-support.ts";
import { nativeInventoryFixture } from "./native-inventory-fixture.ts";

test("readonly native token lookups avoid repeated traversal without caching symbol meaning", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  project.createSourceFile("/base.ts", "export interface First { value:number } export interface Second { value:string }\n");
  project.createSourceFile(
    "/consumer.ts",
    "import type {First,Second} from './base'; export declare const first:First; export declare const second:Second; export const a=first.value; export const b=second.value;\n",
  );
  const service = project.getLanguageService().compilerObject;
  const program = fixtureValue(service.getProgram());
  const base = fixtureValue(program.getSourceFile("/base.ts"));
  const consumer = fixtureValue(program.getSourceFile("/consumer.ts"));
  const positions = [base.text.indexOf("value"), base.text.lastIndexOf("value")];
  const options = { includeDefinitionDisplay: false };
  const expected = positions.map((position) => service.findReferences(base.fileName, position, options));
  expect(expected[0]).not.toEqual(expected[1]);
  const traversal = vi.spyOn(consumer, "getChildren");
  const meaning = vi.spyOn(program.getTypeChecker(), "getSymbolAtLocation");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(base.fileName, fixtureValue(positions[0]), options)).toEqual(expected[0]);
    expect(traversal).toHaveBeenCalled();
    traversal.mockClear();
    meaning.mockClear();
    expect(pass.findReferences(base.fileName, fixtureValue(positions[1]), options)).toEqual(expected[1]);
    expect(traversal.mock.calls.length).toBe(0);
    expect(meaning.mock.calls.some(([node]) => node.getSourceFile() === consumer)).toBe(true);
    const returned = fixtureValue(pass.findReferences(base.fileName, fixtureValue(positions[0]), options));
    fixtureValue(returned[0]).references.length = 0;
    expect(pass.findReferences(base.fileName, fixtureValue(positions[0]), options)).toEqual(expected[0]);
    traversal.mockClear();
    expect(service.findReferences(base.fileName, fixtureValue(positions[1]), options)).toEqual(expected[1]);
    expect(traversal).toHaveBeenCalled();
  } finally {
    pass.dispose();
    meaning.mockRestore();
    traversal.mockRestore();
    service.dispose();
  }
});

test("full-cap native token memo preserves fallback and releases its bounded retained representation", { timeout: scaledBudget(125_000) }, async ({
  scratch,
}) => {
  const child = fileURLToPath(new URL("../../../support/node/native-token-memo-child.mjs", import.meta.url));
  const output = join(scratch, "native-token-memo.json");
  const result = await spawnNiced(process.execPath, ["--expose-gc", child, output], { timeoutMs: scaledBudget(120_000) });
  console.log(result.stdout);
  expect(result.code, result.stderr).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
    phase: "complete",
    passed: true,
    capacity: 524_288,
    inputReferences: 524_304,
    runtimeSha256: contentVersion(readFileSync(ts.sys.getExecutingFilePath())),
    gcDisturbedRepresentationOnly: true,
  });
});

test("native token memo belongs to one readonly pass and leaves rename and highlight paths native", () => {
  const { service } = nativeReferenceFixture();
  const program = fixtureValue(service.getProgram());
  const consumer = fixtureValue(program.getSourceFile("/consumer.ts"));
  const position = fixtureValue(program.getSourceFile("/base.ts")).text.indexOf("first");
  const options = { includeDefinitionDisplay: false };
  const expected = service.findReferences("/base.ts", position, options);
  const rename = service.findRenameLocations("/base.ts", position, false, false, {});
  const highlights = service.getDocumentHighlights("/base.ts", position, ["/base.ts", "/consumer.ts"]);
  const traversal = vi.spyOn(consumer, "getChildren");
  const first = service.createReadonlyReferencePass();
  const second = service.createReadonlyReferencePass();
  try {
    expect(first.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal).toHaveBeenCalled();
    traversal.mockClear();
    expect(first.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal.mock.calls.length).toBe(0);
    expect(second.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal).toHaveBeenCalled();
    second.dispose();
    traversal.mockClear();
    expect(first.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal.mock.calls.length).toBe(0);
    expect(service.findRenameLocations("/base.ts", position, false, false, {})).toEqual(rename);
    expect(traversal).toHaveBeenCalled();
    traversal.mockClear();
    expect(service.getDocumentHighlights("/base.ts", position, ["/base.ts", "/consumer.ts"])).toEqual(highlights);
    expect(traversal).toHaveBeenCalled();
    first.dispose();
    const fresh = service.createReadonlyReferencePass();
    try {
      traversal.mockClear();
      expect(fresh.findReferences("/base.ts", position, options)).toEqual(expected);
      expect(traversal).toHaveBeenCalled();
    } finally {
      fresh.dispose();
    }
  } finally {
    first.dispose();
    second.dispose();
    traversal.mockRestore();
    service.dispose();
  }
});

test("interrupted native token lookup retries without caching a partial result and warm hits still cancel", () => {
  const fixture = nativeReferenceFixture();
  const service = fixture.service;
  const consumer = fixtureValue(service.getProgram()?.getSourceFile("/consumer.ts"));
  const position = fixtureValue(service.getProgram()?.getSourceFile("/base.ts")).text.indexOf("first");
  const options = { includeDefinitionDisplay: false };
  const expected = service.findReferences("/base.ts", position, options);
  const getChildren = consumer.getChildren.bind(consumer);
  let interrupt = true;
  const traversal = vi.spyOn(consumer, "getChildren").mockImplementation((source) => {
    if (interrupt) {
      interrupt = false;
      throw new ts.OperationCanceledException();
    }
    return getChildren(source);
  });
  const pass = service.createReadonlyReferencePass();
  try {
    expect(() => pass.findReferences("/base.ts", position, options)).toThrow(ts.OperationCanceledException);
    traversal.mockClear();
    expect(pass.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal).toHaveBeenCalled();
    traversal.mockClear();
    expect(pass.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal.mock.calls.length).toBe(0);
    fixture.cancel(true);
    expect(() => pass.findReferences("/base.ts", position, options)).toThrow(ts.OperationCanceledException);
    fixture.cancel(false);
    expect(pass.findReferences("/base.ts", position, options)).toEqual(expected);
    expect(traversal.mock.calls.length).toBe(0);
  } finally {
    pass.dispose();
    traversal.mockRestore();
    service.dispose();
  }
});

test("readonly native lexical scans reuse full-file positions while interpreting each symbol freshly", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  project.createSourceFile("/base.ts", "export interface First { value:number } export interface Second { value:string }\n");
  project.createSourceFile(
    "/consumer.ts",
    "import type {First,Second} from './base'; export declare const first:First; export declare const second:Second; export const a=first.value; export const b=second.value;\n",
  );
  const service = project.getLanguageService().compilerObject;
  const program = fixtureValue(service.getProgram());
  const base = fixtureValue(program.getSourceFile("/base.ts"));
  const consumer = fixtureValue(program.getSourceFile("/consumer.ts"));
  const positions = [base.text.indexOf("value"), base.text.lastIndexOf("value")];
  const options = { includeDefinitionDisplay: false };
  const expected = positions.map((position) => service.findReferences(base.fileName, position, options));
  expect(expected[0]).not.toEqual(expected[1]);
  const indexOf = String.prototype.indexOf;
  let scans = 0;
  const scan = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (this: string, name, position) {
    if (this === consumer.text && name === "value") {
      scans++;
    }
    return indexOf.call(this, name, position);
  });
  const meaning = vi.spyOn(program.getTypeChecker(), "getSymbolAtLocation");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(base.fileName, fixtureValue(positions[0]), options)).toEqual(expected[0]);
    expect(scans).toBeGreaterThan(0);
    scans = 0;
    meaning.mockClear();
    expect(pass.findReferences(base.fileName, fixtureValue(positions[1]), options)).toEqual(expected[1]);
    expect(scans).toBe(0);
    expect(meaning.mock.calls.some(([node]) => node.getSourceFile() === consumer)).toBe(true);
    const returned = fixtureValue(pass.findReferences(base.fileName, fixtureValue(positions[0]), options));
    fixtureValue(returned[0]).references.length = 0;
    expect(pass.findReferences(base.fileName, fixtureValue(positions[0]), options)).toEqual(expected[0]);
    expect(service.findReferences(base.fileName, fixtureValue(positions[1]), options)).toEqual(expected[1]);
    expect(scans).toBeGreaterThan(0);
  } finally {
    pass.dispose();
    meaning.mockRestore();
    scan.mockRestore();
    service.dispose();
  }
});

function observeLexicalScans(
  source: ts.SourceFile,
  name: string,
  onScan?: (position: number) => void,
): { readonly count: number; reset: () => void; restore: () => void } {
  const indexOf = String.prototype.indexOf;
  let count = 0;
  const spy = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (this: string, search, start) {
    const position = indexOf.call(this, search, start);
    if (this === source.text && search === name) {
      count++;
      onScan?.(position);
    }
    return position;
  });
  return {
    get count(): number {
      return count;
    },
    reset: (): void => {
      count = 0;
    },
    restore: (): void => spy.mockRestore(),
  };
}

test.for(["aa", "value", "π", "𐐀", "$value"])("native lexical lists preserve ordered Unicode and boundary references: %s", (name) => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  const baseText = `export interface First { ${name}:number } export interface Second { ${name}:string }`;
  project.createSourceFile("/base.ts", baseText);
  project.createSourceFile(
    "/consumer.ts",
    `import type {First,Second} from './base'; export declare const first:First; export declare const second:Second;
/** ${name}${name} x${name} ${name}x é${name} ${name}é ${name} */
export const text=${JSON.stringify(`${name} ${name}${name} x${name} ${name}x`)};
export const a=first[${JSON.stringify(name)}]; export const b=second.${name}; export const ending=first.${name}`,
  );
  const service = project.getLanguageService().compilerObject;
  const consumer = fixtureValue(service.getProgram()?.getSourceFile("/consumer.ts"));
  const positions = [baseText.indexOf(name), baseText.lastIndexOf(name)];
  const expected = positions.map((position) => service.findReferences("/base.ts", position));
  expect(expected[0]).not.toEqual(expected[1]);
  expect(
    expected[0]?.flatMap((group) => group.references).some((reference) => reference.textSpan.start + reference.textSpan.length === consumer.text.length),
  ).toBe(true);
  const scan = observeLexicalScans(consumer, name);
  const pass = service.createReadonlyReferencePass();
  try {
    for (const [index, position] of positions.entries()) {
      expect(pass.findReferences("/base.ts", position)).toEqual(expected[index]);
    }
    expect(scan.count).toBeGreaterThan(0);
    scan.reset();
    for (const [index, position] of positions.entries()) {
      expect(pass.findReferences("/base.ts", position)).toEqual(expected[index]);
      expect(pass.findReferences("/base.ts", position, { includeDefinitionDisplay: false })).toEqual(
        expected[index]?.map(({ definition, references }) => ({ definition: { ...definition, name: "", displayParts: [] }, references })),
      );
    }
    expect(scan.count).toBe(0);
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("native lexical lists leave local containers, rename and highlights uncached", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/base.ts", "export function first(local:number){return local+local;} export function second(local:string){return local;}\n");
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const position = source.text.indexOf("local");
  const expected = service.findReferences(source.fileName, position);
  const rename = service.findRenameLocations(source.fileName, position, false, false, {});
  const highlights = service.getDocumentHighlights(source.fileName, position, [source.fileName]);
  const scan = observeLexicalScans(source, "local");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(source.fileName, position)).toEqual(expected);
    const cold = scan.count;
    expect(cold).toBeGreaterThan(0);
    scan.reset();
    expect(pass.findReferences(source.fileName, position + 1)).toEqual(expected);
    expect(scan.count).toBe(cold);
    scan.reset();
    expect(service.findRenameLocations(source.fileName, position, false, false, {})).toEqual(rename);
    expect(scan.count).toBeGreaterThan(0);
    scan.reset();
    expect(service.getDocumentHighlights(source.fileName, position, [source.fileName])).toEqual(highlights);
    expect(scan.count).toBeGreaterThan(0);
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("interrupted native lexical scans retry the complete list and warm hits still cancel", () => {
  const fixture = nativeReferenceFixture();
  const service = fixture.service;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/consumer.ts"));
  const position = fixtureValue(service.getProgram()?.getSourceFile("/base.ts")).text.indexOf("first");
  const expected = service.findReferences("/base.ts", position);
  let interrupt = true;
  const scan = observeLexicalScans(source, "first", (found) => {
    if (found > 20 && interrupt) {
      interrupt = false;
      throw new ts.OperationCanceledException();
    }
  });
  const pass = service.createReadonlyReferencePass();
  try {
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    expect(scan.count).toBeGreaterThan(1);
    scan.reset();
    expect(pass.findReferences("/base.ts", position)).toEqual(expected);
    expect(scan.count).toBeGreaterThan(1);
    scan.reset();
    expect(pass.findReferences("/base.ts", position)).toEqual(expected);
    expect(scan.count).toBe(0);
    fixture.cancel(true);
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    fixture.cancel(false);
    expect(pass.findReferences("/base.ts", position)).toEqual(expected);
    expect(scan.count).toBe(0);
    pass.dispose();
    const fresh = service.createReadonlyReferencePass();
    try {
      expect(fresh.findReferences("/base.ts", position)).toEqual(expected);
      expect(scan.count).toBeGreaterThan(1);
    } finally {
      fresh.dispose();
    }
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("native lexical lists use source object identity and never retain an unadmitted source", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const text = "const value=1; export const use=value;\n";
  project.createSourceFile("/first.ts", text);
  project.createSourceFile("/second.ts", text);
  const service = project.getLanguageService().compilerObject;
  const program = fixtureValue(service.getProgram());
  const first = fixtureValue(program.getSourceFile("/first.ts"));
  const second = fixtureValue(program.getSourceFile("/second.ts"));
  const position = text.indexOf("value");
  const expected = [first, second].map((source) => service.findReferences(source.fileName, position));
  expect(expected[0]).not.toEqual(expected[1]);
  const scan = observeLexicalScans(first, "value");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(first.fileName, position)).toEqual(expected[0]);
    expect(scan.count).toBeGreaterThan(0);
    scan.reset();
    expect(pass.findReferences(second.fileName, position)).toEqual(expected[1]);
    expect(scan.count).toBeGreaterThan(0);
    scan.reset();
    expect(pass.findReferences(first.fileName, position)).toEqual(expected[0]);
    expect(pass.findReferences(second.fileName, position)).toEqual(expected[1]);
    expect(scan.count).toBe(0);
    pass.dispose();
    const population = vi.spyOn(program, "getSourceFiles").mockReturnValue([second]);
    const foreign = service.createReadonlyReferencePass();
    try {
      const native = service.findReferences(first.fileName, position);
      scan.reset();
      expect(foreign.findReferences(first.fileName, position)).toEqual(native);
      expect(scan.count).toBeGreaterThan(0);
      scan.reset();
      expect(foreign.findReferences(first.fileName, position)).toEqual(native);
      expect(scan.count).toBeGreaterThan(0);
    } finally {
      foreign.dispose();
      population.mockRestore();
    }
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("full-cap native lexical lists preserve all fallback dimensions and release combined retention", { timeout: scaledBudget(125_000) }, async ({
  scratch,
}) => {
  const child = fileURLToPath(new URL("../../../support/node/native-lexical-memo-child.mjs", import.meta.url));
  const output = join(process.cwd(), "reports", "review", `native-lexical-memo-${basename(scratch)}.json`);
  mkdirSync(dirname(output), { recursive: true });
  const result = await spawnNiced(process.execPath, ["--expose-gc", child, output], { timeoutMs: scaledBudget(120_000) });
  writeFileSync(`${output}.stdout.log`, result.stdout);
  writeFileSync(`${output}.stderr.log`, result.stderr);
  console.log(result.stdout);
  expect(result.code, result.stderr).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
    phase: "complete",
    passed: true,
    nameCapacity: 65_536,
    positionCapacity: 1_048_576,
    nameUnitCapacity: 8_388_608,
    inputQueries: 65_537,
    runtimeSha256: contentVersion(readFileSync(ts.sys.getExecutingFilePath())),
    gcDisturbedRepresentationOnly: true,
  });
});

test("native lexical reuse retains a complete empty candidate list without inventing escaped-name references", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/base.ts", "export const v\\u0061lue=1; export const use=v\\u0061lue;\n");
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const expected = service.findReferences(source.fileName, 13);
  const scan = observeLexicalScans(source, "value");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences(source.fileName, 13)).toEqual(expected);
    expect(scan.count).toBe(1);
    scan.reset();
    expect(pass.findReferences(source.fileName, 14)).toEqual(expected);
    expect(scan.count).toBe(0);
  } finally {
    pass.dispose();
    scan.restore();
    service.dispose();
  }
});

test("a completed lexical list survives later native interpretation cancellation without retaining query results", () => {
  const { service } = nativeReferenceFixture();
  const source = fixtureValue(service.getProgram()?.getSourceFile("/consumer.ts"));
  const position = fixtureValue(service.getProgram()?.getSourceFile("/base.ts")).text.indexOf("first");
  const expected = service.findReferences("/base.ts", position);
  const scan = observeLexicalScans(source, "first");
  const children = source.getChildren.bind(source);
  let interrupt = true;
  const traversal = vi.spyOn(source, "getChildren").mockImplementation((file) => {
    if (interrupt) {
      interrupt = false;
      throw new ts.OperationCanceledException();
    }
    return children(file);
  });
  const pass = service.createReadonlyReferencePass();
  try {
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    expect(scan.count).toBeGreaterThan(1);
    scan.reset();
    traversal.mockClear();
    expect(pass.findReferences("/base.ts", position)).toEqual(expected);
    expect(scan.count).toBe(0);
    expect(traversal).toHaveBeenCalled();
  } finally {
    pass.dispose();
    traversal.mockRestore();
    scan.restore();
    service.dispose();
  }
});

test.for(["identical", "different", "symlink"] as const)(
  "membership-only source availability matches the canonical Project across native redirects: %s",
  (variant, { scratch }) => {
    const request = redirectFixture(scratch, variant);
    const membership = extractInventoryPartition({ ...request, intent: "membership", families: [] });
    const owner = createSemanticWorkspace({ root: scratch }).program(request.descriptor.config);
    if (owner === undefined) {
      throw new Error("missing native descriptor");
    }
    const project = owner.project();
    const expected = [
      ...new Set(
        nativeCompilerSourceFiles(project)
          .map((source) => canonicalInventoryPath(source.getFilePath()))
          .filter((path) => project.getSourceFile(path) !== undefined),
      ),
    ];
    expect(membership.available).toEqual(expected);
    expect(membership.nativeRoots).toEqual([...project.getProgram().compilerObject.getRootFileNames()]);
    expect(membership.compilerOptionsJson).toBe(JSON.stringify(project.getCompilerOptions()));
    expect(membership.inputs.some(({ kind, path }) => kind === "exists" && path.endsWith("absent.ts"))).toBe(true);
  },
);

test("legacy analysis eligibility preserves the complete native closure of an eligible importing world", ({ scratch }) => {
  const write = (path: string, text: string): void => {
    const absolute = join(scratch, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  };
  write(".gitignore", ".cache/\n");
  write(
    "tsconfig.json",
    JSON.stringify({ files: ["entry.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler", strict: true } }),
  );
  write("entry.ts", "import {dependency} from './tests/legacy/dependency';export const value=dependency;");
  write("tests/legacy/dependency.ts", "export const dependency=1;");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const partition = extractInventoryPartition({ root: scratch, descriptor, families: ["bindings"], destination: join(scratch, "unused.sqlite") });
  expect(partition.roots).toEqual([join(scratch, "entry.ts")]);
  expect(partition.nativeRoots).toEqual(partition.roots);
  expect(partition.available.toSorted()).toEqual([join(scratch, "entry.ts"), join(scratch, "tests/legacy/dependency.ts")].toSorted());
  expect(JSON.parse(partition.compilerOptionsJson)).toEqual(descriptor.commandLine.options);
});

test("an ignored dependency overlay transports exact worker bytes without granting authored membership", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const dependency = join(scratch, "vendor/value.ts");
  const physical = "export const value=1;\n";
  const projected = "export const value=2;\n";
  writeFileSync(join(scratch, ".gitignore"), ".cache/\nvendor/\n");
  mkdirSync(dirname(dependency), { recursive: true });
  writeFileSync(dependency, physical);
  writeFileSync(join(scratch, "consumer.ts"), "import {value} from './vendor/value';export const use=value;\n");
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  execFixtureGit(scratch, ["init", "-q"]);
  const options = { root: scratch, families: ["bindings"] as const };
  using previous = nativeInventoryFixture(options);
  const requests: InventoryBuildRequest[] = [];
  const backups: string[] = [];
  let refusal: string | undefined;
  let observed: object | undefined;
  try {
    using current = nativeInventoryFixture(options, {
      projection: { root: scratch, files: [{ path: dependency, text: projected }], deleted: [] },
      requests,
      backups,
    });
    const backup = fixtureValue(backups[0]);
    using db = openInventoryDatabase(backup);
    const partition = fixtureValue(readInventoryGeneration(db, current.generation)[0]);
    observed = {
      text: current.sourceCorpus().getSourceFile(dependency)?.getFullText(),
      authored: [...readInventorySourceMetadata(db, partition.id)].find((source) => source.file === dependency)?.authored,
      membership: [...readInventoryInputs(db, partition.id)].find((input) => input.path === dependency && input.kind === "authored")?.version,
    };
  } catch (error) {
    refusal = String(error);
  }
  expect(requests).toHaveLength(1);
  expect(requests[0]?.overlay?.files.find((file) => file.path === dependency)).toEqual({ path: dependency, text: projected });
  expect(requests[0]?.overlay).toMatchObject({ authoredAddedPaths: [] });
  expect(refusal).toBeUndefined();
  expect(observed).toEqual({ text: projected, authored: false, membership: "false" });
  expect(readFileSync(dependency, "utf8")).toBe(physical);
  expect(previous.sourceCorpus().getSourceFile(dependency)?.getFullText()).toBe(physical);
});

test.for(["authored-addition", "byte-only-addition", "deletion"] as const)(
  "native overlay byte availability and authored membership remain separate under %s",
  { timeout: scaledBudget(60_000) },
  (mode, { scratch }) => {
    const dependency = join(scratch, "value.ts");
    const physical = "export const value=1;\n";
    const projected = "export const value=2;\n";
    const deleted = mode === "deletion";
    const added = mode === "authored-addition";
    writeFileSync(join(scratch, ".gitignore"), ".cache/\n");
    if (deleted) {
      writeFileSync(dependency, physical);
    }
    writeFileSync(join(scratch, "consumer.ts"), "import {value} from './value';export const use=value;\n");
    writeFileSync(
      join(scratch, "tsconfig.json"),
      JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
    );
    execFixtureGit(scratch, ["init", "-q"]);
    const options = { root: scratch, families: ["bindings"] as const };
    using previous = nativeInventoryFixture(options);
    const requests: InventoryBuildRequest[] = [];
    const backups: string[] = [];
    using current = nativeInventoryFixture(options, {
      projection: { root: scratch, files: deleted ? [] : [{ path: dependency, text: projected }], deleted: deleted ? [dependency] : [] },
      authoredAddedPaths: added ? [dependency] : [],
      requests,
      backups,
    });
    expect(requests).toHaveLength(1);
    const overlay = fixtureValue(requests[0]?.overlay);
    expect(overlay.authoredAddedPaths).toEqual(added ? [dependency] : []);
    expect(overlay.files.find((file) => file.path === dependency)).toEqual(deleted ? undefined : { path: dependency, text: projected });
    expect(inventoryAuthoredFiles(scratch, overlay).has(dependency)).toBe(added);
    expect(current.sourceCorpus().getSourceFile(dependency)?.getFullText()).toBe(deleted ? undefined : projected);
    using db = openInventoryDatabase(fixtureValue(backups[0]));
    const partition = fixtureValue(readInventoryGeneration(db, current.generation)[0]);
    const source = [...readInventorySourceMetadata(db, partition.id)].find((entry) => entry.file === dependency);
    expect(source?.authored).toBe(deleted ? undefined : added);
    expect(previous.sourceCorpus().getSourceFile(dependency)?.getFullText()).toBe(deleted ? physical : undefined);
    expect(existsSync(dependency)).toBe(deleted);
    const physicalText = existsSync(dependency) ? readFileSync(dependency, "utf8") : undefined;
    expect(physicalText).toBe(deleted ? physical : undefined);
  },
);

function aliasedProjection(
  root: string,
  second: "none" | "alias" | "target",
): { readonly target: string; readonly alias: string; readonly peer: string; readonly physical: string; readonly projected: string } {
  const target = join(root, "vendor/value.ts");
  const alias = join(root, "vendor/alias.ts");
  const peer = join(root, "vendor/peer.ts");
  const physical = "export const value=1;\n";
  const projected = "export const value=2;\n";
  writeFileSync(join(root, ".gitignore"), ".cache/\nvendor/\n");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, physical);
  symlinkSync("value.ts", alias);
  symlinkSync("value.ts", peer);
  const extra = second === "none" ? "" : `import {value as other} from './vendor/${second === "alias" ? "peer" : "value"}';`;
  writeFileSync(join(root, "consumer.ts"), `import {value} from './vendor/alias';${extra}export const use=value;\n`);
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ files: ["consumer.ts"], compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" } }),
  );
  execFixtureGit(root, ["init", "-q"]);
  return { target, alias, peer, physical, projected };
}

test.for(["none", "alias"] as const)(
  "native projected aliases retain transaction bytes and canonical facts with second import %s",
  { timeout: scaledBudget(60_000) },
  (second, { scratch }) => {
    const { target, alias, peer, physical, projected } = aliasedProjection(scratch, second);
    const options = { root: scratch, families: ["bindings"] as const };
    using previous = nativeInventoryFixture(options);
    const backups: string[] = [];
    const projectedPaths = second === "alias" ? [alias, peer] : [alias];
    using current = nativeInventoryFixture(options, {
      projection: { root: scratch, files: projectedPaths.map((path) => ({ path, text: projected })), deleted: [] },
      authoredAddedPaths: [],
      backups,
    });
    const source = fixtureValue(current.sourceCorpus().getSourceFile(alias));
    expect(source.getFullText()).toBe(projected);
    expect(source.getFilePath()).toBe(target);
    expect(current.canonicalPath(alias)).toBe(target);
    const consumer = fixtureValue(current.sourceCorpus().getSourceFile("consumer.ts"));
    const origins = consumer
      .getImportDeclarations()
      .flatMap((declaration) => declaration.getNamedImports().flatMap((specifier) => current.symbols(specifier.getNameNode()).origins));
    expect(origins).toHaveLength(projectedPaths.length);
    const valueDeclaration = source.getVariableDeclarationOrThrow("value");
    expect(origins).toEqual(projectedPaths.map(() => span(valueDeclaration)));
    expect(valueDeclaration.getInitializerOrThrow().getText()).toBe("2");
    expect(current.sourceCorpus().getSourceFile(fixtureValue(projectedPaths.at(-1)))).toBe(source);
    using db = openInventoryDatabase(fixtureValue(backups[0]));
    const partition = fixtureValue(readInventoryGeneration(db, current.generation)[0]);
    const captured = [...readInventorySourceMetadata(db, partition.id)].filter((entry) => entry.file === target);
    expect(captured.map((entry) => entry.path).toSorted()).toEqual(projectedPaths.toSorted());
    expect(captured.every((entry) => entry.authored === false)).toBe(true);
    const inputs = [...readInventoryInputs(db, partition.id)];
    expect(
      inputs
        .filter((entry) => entry.kind === "file" && projectedPaths.includes(entry.path))
        .map((entry) => entry.path)
        .toSorted(),
    ).toEqual(projectedPaths.toSorted());
    expect(inputs.find((entry) => entry.kind === "file" && entry.path === alias)?.version).not.toBe(inputVersion(alias, "file"));
    expect(inputs.find((entry) => entry.kind === "file" && entry.path === join(scratch, "consumer.ts"))?.version).toBe(
      inputVersion(join(scratch, "consumer.ts"), "file"),
    );
    expect(inputs.find((entry) => entry.kind === "authored" && entry.path === target)?.version).toBe("false");
    expect(previous.sourceCorpus().getSourceFile(target)?.getFullText()).toBe(physical);
    expect(readFileSync(alias, "utf8")).toBe(physical);
    expect(readFileSync(target, "utf8")).toBe(physical);
  },
);

test("native projected aliases refuse contradictory captured bytes for one canonical source", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const { target, alias, physical, projected } = aliasedProjection(scratch, "target");
  const options = { root: scratch, families: ["bindings"] as const };
  using previous = nativeInventoryFixture(options);
  expect(() => {
    using _conflicting = nativeInventoryFixture(options, {
      projection: { root: scratch, files: [{ path: alias, text: projected }], deleted: [] },
      authoredAddedPaths: [],
    });
  }).toThrow("native semantic inventory mixed source versions");
  expect(previous.sourceCorpus().getSourceFile(target)?.getFullText()).toBe(physical);
  expect(readFileSync(alias, "utf8")).toBe(physical);
  expect(readFileSync(target, "utf8")).toBe(physical);
});

test("native projected aliases refuse a physical retarget before publication despite stable virtual bytes", { timeout: scaledBudget(60_000) }, ({
  scratch,
}) => {
  const { target, alias, physical, projected } = aliasedProjection(scratch, "none");
  writeFileSync(join(scratch, "vendor/other.ts"), "export const value=3;\n");
  const options = { root: scratch, families: ["bindings"] as const };
  using previous = nativeInventoryFixture(options);
  const faults: string[] = [];
  const published: number[] = [];
  expect(() => {
    using _retargeted = nativeInventoryFixture(options, {
      projection: { root: scratch, files: [{ path: alias, text: projected }], deleted: [] },
      authoredAddedPaths: [],
      fault: "projected-alias-retarget",
      faults,
      published,
    });
  }).toThrow(/^native semantic inventory inputs changed during extraction; no current verdict$/u);
  expect(faults).toEqual(["projected-alias-retarget"]);
  expect(published).toEqual([previous.generation]);
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  expect(latestInventoryGeneration(database)).toBe(previous.generation);
  expect(previous.sourceCorpus().getSourceFile(target)?.getFullText()).toBe(physical);
  expect(readFileSync(target, "utf8")).toBe(physical);
  expect(readFileSync(alias, "utf8")).toBe("export const value=3;\n");
});
