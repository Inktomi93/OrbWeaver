import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { contentVersion } from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project, ts } from "ts-morph";
import { vi } from "vitest";
import { scaledBudget } from "../../_load-budget.ts";
import {
  extractWithoutReferenceWrappers,
  fixtureValue,
  implementationRoot,
  nativeInputCase,
  nativeReferenceFixture,
} from "./_semantic-inventory-extract-support.ts";

test("readonly native results avoid repeated computation without sharing mutable answers", () => {
  const { service } = nativeReferenceFixture();
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const position = source.text.indexOf("first");
  const oracle = fixtureValue(service.findReferences(source.fileName, position));
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    const miss = fixtureValue(pass.findReferences(source.fileName, position));
    expect(miss).toStrictEqual(oracle);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
    const definition = fixtureValue(miss[0]).definition;
    definition.textSpan.start++;
    definition.name = "caller mutation";
    definition.displayParts.push({ text: "caller mutation", kind: "text" });
    const reference = fixtureValue(fixtureValue(miss[0]).references[0]);
    reference.textSpan.length++;
    reference.isDefinition = reference.isDefinition !== true;
    reference.isWriteAccess = !reference.isWriteAccess;
    reference.isInString = true;
    const context = fixtureValue(definition.contextSpan);
    context.start++;
    fixtureValue(definition.displayParts[0]).text = "caller mutation";
    fixtureValue(miss[0]).references.reverse();
    miss.reverse();
    lookup.mockClear();
    const hit = fixtureValue(pass.findReferences(source.fileName, position, { includeDefinitionDisplay: true }));
    expect(hit).toStrictEqual(oracle);
    expect(lookup.mock.calls.length).toBe(0);
    fixtureValue(hit[0]).references.length = 0;
    fixtureValue(hit[0]).definition.displayParts.length = 0;
    hit.length = 0;
    expect(pass.findReferences(source.fileName, position)).toStrictEqual(oracle);
    lookup.mockClear();
    expect(service.findReferences(source.fileName, position)).toStrictEqual(oracle);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native result keys preserve source, position and normalized presentation", () => {
  const { service } = nativeReferenceFixture();
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const first = source.text.indexOf("first");
  const second = source.text.indexOf("second");
  const rich = service.findReferences(source.fileName, first);
  const lean = service.findReferences(source.fileName, first, { includeDefinitionDisplay: false });
  expect(rich).not.toEqual(lean);
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    expect(pass.findReferences(source.fileName, first)).toEqual(rich);
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, first, { includeDefinitionDisplay: false })).toEqual(lean);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, first, { includeDefinitionDisplay: true })).toEqual(rich);
    expect(pass.findReferences(source.fileName, first, { includeDefinitionDisplay: false })).toEqual(lean);
    expect(lookup.mock.calls.length).toBe(0);
    expect(pass.findReferences(source.fileName, second)).toEqual(service.findReferences(source.fileName, second));
    expect(pass.findReferences("/consumer.ts", first)).toEqual(service.findReferences("/consumer.ts", first));
    expect(() => pass.findReferences("/missing.ts", first)).toThrow();
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native undefined results consume bounded entries and saturation remains native", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/empty.ts", " ".repeat(4097));
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/empty.ts"));
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    for (let position = 0; position < 4097; position++) {
      expect(pass.findReferences(source.fileName, position)).toBeUndefined();
    }
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, 0)).toBeUndefined();
    expect(lookup.mock.calls.length).toBe(0);
    expect(pass.findReferences(source.fileName, 4096)).toBeUndefined();
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
    lookup.mockClear();
    expect(service.findReferences(source.fileName, 0)).toBeUndefined();
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native results retain repeated physical-path strings once without losing later small answers", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const file = join(process.cwd(), "packages/server/src/domain/chat/engine/engine.ts");
  project.createSourceFile(
    file,
    Array.from({ length: 1800 }, (_, index) => `export const value${index}=1; export const use${index}=value${index};`).join("\n"),
  );
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile(file));
  const positions = source.statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations
          .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text.startsWith("value"))
          .map((declaration) => declaration.name.getStart(source))
      : [],
  );
  const options = { includeDefinitionDisplay: false };
  const expected = positions.map((position) => service.findReferences(file, position, options));
  const pass = service.createReadonlyReferencePass();
  const traversal = vi.spyOn(source, "getChildren");
  try {
    for (const [index, position] of positions.entries()) {
      expect(pass.findReferences(file, position, options)).toStrictEqual(expected[index]);
    }
    traversal.mockClear();
    expect(pass.findReferences(file, fixtureValue(positions.at(-1)), options)).toStrictEqual(expected.at(-1));
    expect(traversal.mock.calls.length).toBe(0);
  } finally {
    traversal.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native string ownership detaches admissions and only copies mutable containers on hits", () => {
  const { service } = nativeReferenceFixture();
  const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
  const position = source.text.indexOf("first");
  const pass = service.createReadonlyReferencePass();
  const copy = vi.spyOn(globalThis, "structuredClone");
  try {
    const miss = pass.findReferences(source.fileName, position);
    const detachments = copy.mock.calls.length;
    expect(detachments).toBeGreaterThan(0);
    expect(copy.mock.calls.every(([value]) => typeof value === "string")).toBe(true);
    expect(new Set(copy.mock.calls.map(([value]) => value)).size).toBe(detachments);
    const hit = pass.findReferences(source.fileName, position);
    expect(hit).toStrictEqual(miss);
    expect(hit).not.toBe(miss);
    expect(copy.mock.calls.length).toBe(detachments);
  } finally {
    copy.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native string admission is atomic and distinct strings still exhaust the unchanged allowance", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const files = ["a", "b"].map((letter) => `/${letter.repeat(600_000)}.ts`);
  for (const file of files) {
    project.createSourceFile(file, "export const value=1; export const use=value;");
  }
  const service = project.getLanguageService().compilerObject;
  const first = fixtureValue(service.getProgram()?.getSourceFile(fixtureValue(files[0])));
  const second = fixtureValue(service.getProgram()?.getSourceFile(fixtureValue(files[1])));
  const position = first.text.indexOf("value");
  const options = { includeDefinitionDisplay: false };
  const expected = contentVersion(JSON.stringify(fixtureValue(service.findReferences(second.fileName, position, options))));
  const pass = service.createReadonlyReferencePass();
  const secondTraversal = vi.spyOn(second, "getChildren");
  const firstTraversal = vi.spyOn(first, "getChildren");
  const failure = new Error("private native clone failed");
  const copy = vi.spyOn(globalThis, "structuredClone").mockImplementationOnce(() => {
    throw failure;
  });
  try {
    expect(() => pass.findReferences(first.fileName, position, options)).toThrow(failure);
    expect(contentVersion(JSON.stringify(fixtureValue(pass.findReferences(second.fileName, position, options))))).toBe(expected);
    const completedDetachments = copy.mock.calls.length;
    expect(completedDetachments).toBeGreaterThan(1);
    secondTraversal.mockClear();
    expect(contentVersion(JSON.stringify(fixtureValue(pass.findReferences(second.fileName, position, options))))).toBe(expected);
    expect(secondTraversal.mock.calls.length).toBe(0);
    firstTraversal.mockClear();
    expect(pass.findReferences(first.fileName, position, options)?.length).toBe(1);
    firstTraversal.mockClear();
    expect(pass.findReferences(first.fileName, position, options)?.length).toBe(1);
    expect(firstTraversal.mock.calls.length).toBeGreaterThan(0);
    expect(copy.mock.calls.length).toBe(completedDetachments);
  } finally {
    copy.mockRestore();
    firstTraversal.mockRestore();
    secondTraversal.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test("readonly native result admission bounds the aggregate of individually small answers", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  project.createSourceFile("/a.ts", `export interface T{${Array.from({ length: 4095 }, (_, index) => `p${index}:number;`).join("")}}`);
  const service = project.getLanguageService().compilerObject;
  const source = fixtureValue(service.getProgram()?.getSourceFile("/a.ts"));
  const declaration = fixtureValue(source.statements.find(ts.isInterfaceDeclaration));
  const positions = declaration.members.map((member) => fixtureValue(member.name).getStart(source));
  const first = fixtureValue(positions[0]);
  const last = fixtureValue(positions.at(-1));
  const options = { includeDefinitionDisplay: false };
  const expected = service.findReferences(source.fileName, last, options);
  const pass = service.createReadonlyReferencePass();
  const lookup = vi.spyOn(source, "getChildren");
  try {
    for (const position of positions) {
      expect(pass.findReferences(source.fileName, position, options)?.length).toBe(1);
    }
    lookup.mockClear();
    expect(pass.findReferences(source.fileName, first, options)?.length).toBe(1);
    expect(lookup.mock.calls.length).toBe(0);
    expect(pass.findReferences(source.fileName, last, options)).toStrictEqual(expected);
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test.for(["objects", "strings"] as const)(
  "readonly native result %s saturation preserves complete native fallback",
  { timeout: scaledBudget(20_000) },
  (dimension) => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    project.createSourceFile("/base.ts", "export const value=1;");
    const files = dimension === "objects" ? 180 : 1;
    for (let index = 0; index < files; index++) {
      const name = dimension === "strings" ? "x".repeat(1_048_577) : `consumer${index}`;
      project.createSourceFile(
        `/${name}.ts`,
        `import {value} from './base'; export const uses=[${Array.from({ length: dimension === "objects" ? 100 : 300 }, () => "value").join(",")}];`,
      );
    }
    const service = project.getLanguageService().compilerObject;
    const source = fixtureValue(service.getProgram()?.getSourceFile("/base.ts"));
    const position = source.text.indexOf("value");
    const options = { includeDefinitionDisplay: false };
    const expected = fixtureValue(service.findReferences(source.fileName, position, options));
    expect(expected.flatMap((group) => group.references).length).toBeGreaterThan(dimension === "objects" ? 18_000 : 300);
    const pass = service.createReadonlyReferencePass();
    const lookup = vi.spyOn(source, "getChildren");
    try {
      expect(pass.findReferences(source.fileName, position, options)).toEqual(expected);
      lookup.mockClear();
      expect(pass.findReferences(source.fileName, position, options)).toEqual(expected);
      expect(lookup.mock.calls.length).toBeGreaterThan(0);
    } finally {
      lookup.mockRestore();
      pass.dispose();
      service.dispose();
    }
  },
);

test("cancelled native import-map construction never survives into a later query", () => {
  const fixture = nativeReferenceFixture();
  const service = fixture.service;
  const program = fixtureValue(service.getProgram());
  const checker = program.getTypeChecker();
  const consumer = fixtureValue(program.getSourceFile("/consumer.ts"));
  const trigger = fixtureValue(consumer.statements.find(ts.isImportDeclaration)).moduleSpecifier;
  const unrelated = fixtureValue(program.getSourceFile("/unrelated.ts"));
  const sentinel = fixtureValue(unrelated.statements.find(ts.isImportDeclaration)).moduleSpecifier;
  const getSymbol = checker.getSymbolAtLocation.bind(checker);
  let armed = true;
  let completedScans = 0;
  let firstImports = 0;
  const lookup = vi.spyOn(checker, "getSymbolAtLocation").mockImplementation((node) => {
    if (node === trigger) {
      firstImports++;
      if (armed) {
        armed = false;
        fixture.cancel(true);
      }
    }
    if (node === sentinel) {
      completedScans++;
    }
    return getSymbol(node);
  });
  const pass = service.createReadonlyReferencePass();
  const position = fixtureValue(program.getSourceFile("/base.ts")).text.indexOf("first");
  try {
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    expect(firstImports).toBe(1);
    expect(completedScans).toBe(0);
    fixture.cancel(false);
    const recovered = pass.findReferences("/base.ts", position);
    expect(firstImports).toBe(2);
    expect(completedScans).toBe(1);
    fixture.cancel(true);
    expect(() => pass.findReferences("/base.ts", position)).toThrow(ts.OperationCanceledException);
    fixture.cancel(false);
    expect(pass.findReferences("/base.ts", position)).toEqual(recovered);
    expect(completedScans).toBe(1);
    expect(service.findReferences("/base.ts", position)).toEqual(recovered);
  } finally {
    lookup.mockRestore();
    pass.dispose();
    service.dispose();
  }
});

test.for(["text", "roots", "order", "options"] as const)("readonly reference passes refuse changed native snapshots: %s", (change) => {
  const fixture = nativeReferenceFixture();
  const service = fixture.service;
  const program = fixtureValue(service.getProgram());
  const position = fixtureValue(program.getSourceFile("/base.ts")).text.indexOf("first");
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferences("/base.ts", position)).toEqual(service.findReferences("/base.ts", position));
    if (change === "text") {
      fixture.update("/consumer.ts", "import {second} from './base'; export const use=second;\n");
    } else if (change === "roots") {
      fixture.update("/added.ts", "import {first} from './base'; export const added=first;\n");
    } else if (change === "order") {
      fixture.reverseRoots();
    } else {
      fixture.strict();
    }
    expect(() => pass.findReferences("/base.ts", position)).toThrow("invalidated");
    expect(service.getProgram()).not.toBe(program);
    expect(() => pass.findReferences("/base.ts", position)).toThrow("disposed");
    const fresh = service.createReadonlyReferencePass();
    try {
      const expected = service.findReferences("/base.ts", position);
      expect(fresh.findReferences("/base.ts", position)).toEqual(expected);
      expect(expected?.some((group) => group.references.some((reference) => reference.fileName === "/added.ts"))).toBe(change === "roots");
    } finally {
      fresh.dispose();
    }
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test.for(["pass", "service", "semantic-cleanup"] as const)("readonly native reference handles release with their owner: %s", (owner) => {
  const { service } = nativeReferenceFixture();
  const position = fixtureValue(service.getProgram()?.getSourceFile("/base.ts")).text.indexOf("first");
  const pass = service.createReadonlyReferencePass();
  expect(pass.findReferences("/base.ts", position)).toBeDefined();
  if (owner === "pass") {
    pass.dispose();
    pass.dispose();
  } else if (owner === "service") {
    service.dispose();
  } else {
    service.cleanupSemanticCache();
  }
  expect(() => pass.findReferences("/base.ts", position)).toThrow("disposed");
  pass.dispose();
  service.dispose();
});

test("readonly native reference passes retain the language-service mode restriction", () => {
  const { service } = nativeReferenceFixture(ts.LanguageServiceMode.Syntactic);
  try {
    expect(() => service.createReadonlyReferencePass()).toThrow("not allowed in LanguageServiceMode.Syntactic");
    expect(() => service.findReferences("/base.ts", 13)).toThrow("not allowed in LanguageServiceMode.Syntactic");
  } finally {
    service.dispose();
  }
});

test.for([false, true])("inventory releases its native reference pass after query failure: %s", (fail, { scratch }) => {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export const use=value;\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  const failure = new Error("native reference query failed");
  let pass: ts.ReadonlyReferencePass | undefined;
  const extract = (): ReturnType<typeof extractWithoutReferenceWrappers> =>
    extractWithoutReferenceWrappers(
      { root: scratch, descriptor, destination: join(scratch, "unused.sqlite") },
      () => {
        if (fail) {
          throw failure;
        }
      },
      (observed) => {
        pass = observed;
      },
    );
  let thrown: Error | undefined;
  let referenceCount = 0;
  try {
    referenceCount = extract().partition.references.length;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    thrown = error;
  }
  expect(thrown).toBe(fail ? failure : undefined);
  expect(referenceCount > 0).toBe(!fail);
  expect(() => fixtureValue(pass).findReferences(join(scratch, "base.ts"), 13)).toThrow("disposed");
});

test("inventory refuses a Program replacement between source facts and its reference pass", ({ scratch }) => {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export const use=value;\n");
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = fixtureValue(readCompilerPrograms(scratch)[0]);
  let host: Project | undefined;
  let pass: ts.ReadonlyReferencePass | undefined;
  const resolve = Project.prototype.resolveSourceFileDependencies;
  const observation = vi.spyOn(Project.prototype, "resolveSourceFileDependencies").mockImplementation(function (this: Project) {
    host = this;
    return resolve.call(this);
  });
  try {
    expect(() =>
      extractWithoutReferenceWrappers({ root: scratch, descriptor, destination: join(scratch, "unused.sqlite") }, undefined, (created) => {
        pass = created;
        fixtureValue(host).createSourceFile(join(scratch, "added.ts"), "export const added=2;\n");
      }),
    ).toThrow("native inventory Program changed before its reference pass");
    expect(() => fixtureValue(pass).findReferences(join(scratch, "base.ts"), 13)).toThrow("disposed");
  } finally {
    observation.mockRestore();
  }
});

test("lean native references bypass display-node materialization on fresh checkers", () => {
  const query = (omitDisplay: boolean, throughPass = false): { groups: ts.ReferencedSymbol[]; materializations: number } => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/fixture.ts", "export const value={outer:{nested:1}, method(){return {result:1};}}; export const use=value;\n");
    const service = project.getLanguageService().compilerObject;
    fixtureValue(service.getProgram()).getTypeChecker();
    const factory = vi.spyOn(ts.factory, "createTypeLiteralNode");
    const pass = throughPass ? service.createReadonlyReferencePass() : undefined;
    try {
      const groups = fixtureValue(
        (pass ?? service).findReferences(source.getFilePath(), source.getFullText().indexOf("value"), { includeDefinitionDisplay: !omitDisplay }),
      );
      return { groups, materializations: factory.mock.calls.length };
    } finally {
      pass?.dispose();
      factory.mockRestore();
      service.dispose();
    }
  };
  const rich = query(false);
  const lean = query(true);
  const richPass = query(false, true);
  const leanPass = query(true, true);
  expect(rich.materializations).toBeGreaterThan(0);
  expect(lean.materializations).toBe(0);
  expect(richPass.materializations).toBeGreaterThan(0);
  expect(leanPass.materializations).toBe(0);
  expect(richPass.groups).toEqual(rich.groups);
  expect(leanPass.groups).toEqual(lean.groups);
  expect(lean.groups).toEqual(
    rich.groups.map(({ definition, references }) => ({
      definition: { ...definition, name: "", displayParts: [] },
      references,
    })),
  );
});

test("native reference display opt-out preserves all grouped metadata except presentation", () => {
  const files = {
    "/base.ts": [
      '/// <reference path="./reference.d.ts" />',
      "export const value={nested:{item:1}}; export const {nested:binding}=value;",
      "export interface Shape<T> { 'tag': T; method(x:T):T; }",
      "export class Base<T> { constructor(public field:T){} get item(){return this.field;} set item(x:T){this.field=x;} method(x:T){return x;} }",
      "export class Child extends Base<number> { override method(x:number){return super.method(x)+this.item;} }",
      "export enum Choice { One=1, Two=One+1 }",
      "export namespace Group { export const held=value; }",
      "export function overloaded(x:string):string; export function overloaded(x:number):number; export function overloaded(x:string|number){return x;}",
      "export namespace overloaded {export const extra=1;}",
      "export type Mapped<T> = {[K in keyof T]:T[K]};",
      "export default function(){return binding;}",
      "export const text='literal';",
      "export function control(){ outer: for(let i=0;i<2;i++){if(i)break outer;continue;} return 'literal'; }",
    ].join("\n"),
    "/consumer.ts": [
      "import fallback,{value as alias,binding,Base,Child,Choice,Group,overloaded,type Shape,type Mapped} from './base';",
      "import * as all from './base'; export {alias as renamed};",
      "export const shape:Shape<number>={tag:1,method(x){return x;}};",
      "export const read=shape['tag']+new Child(1).method(2)+Choice.Two+overloaded(1)+overloaded.extra;",
      "export const object={binding}; export const use=[alias,all.value,Group.held,fallback()];",
      "export type Copy=Mapped<typeof object>; /** {@link binding} */ export const doc=binding;",
      "import {renamed,everything} from './barrel'; export const indirect=[renamed,everything.value];",
      "export type Imported=import('./base').Shape<number>; export type Module=typeof import('./base');",
      "export const later=()=>import('./base'); import {missing} from './absent'; export const unresolved=missing;",
    ].join("\n"),
    "/barrel.ts": "export {value as renamed} from './base'; export * as everything from './base';\n",
    "/augmentation.d.ts": "import './base'; declare module './base' {interface Shape<T> {extra?:T}}\n",
    "/export-equals.ts": "const exported={value:1}; export = exported;\n",
    "/import-equals.ts": "import imported=require('./export-equals'); export const use=imported.value;\n",
  };
  const create = (): Project => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
    });
    project.createSourceFile("/reference.d.ts", "interface ExternalShape {external:number}\n");
    project.createSourceFile("/jsx.tsx", "declare namespace JSX {interface IntrinsicElements {div:{tag?:number}}} export const rendered=<div tag={1}/>;\n");
    for (const [path, text] of Object.entries(files)) {
      project.createSourceFile(path, text);
    }
    return project;
  };
  const original = create().getLanguageService().compilerObject;
  const leanFirst = create().getLanguageService().compilerObject;
  const richPass = original.createReadonlyReferencePass();
  const leanPass = leanFirst.createReadonlyReferencePass();
  const kinds = new Set<ts.ScriptElementKind>();
  let laterDefinitions = 0;
  const queries: { file: string; position: number }[] = [];
  const visit = (node: ts.Node, source: ts.SourceFile): void => {
    if (node.getChildCount(source) === 0 && node.kind !== ts.SyntaxKind.EndOfFileToken) {
      queries.push({ file: source.fileName, position: node.getStart(source) });
    }
    for (const child of node.getChildren(source)) {
      visit(child, source);
    }
  };
  try {
    for (const source of fixtureValue(original.getProgram()).getSourceFiles()) {
      visit(source, source);
      for (const reference of source.referencedFiles) {
        queries.push({ file: source.fileName, position: reference.pos });
      }
    }
    for (const { file, position } of queries) {
      const rich = original.findReferences(file, position);
      const lean = leanFirst.findReferences(file, position, { includeDefinitionDisplay: false });
      expect(richPass.findReferences(file, position)).toEqual(rich);
      expect(richPass.findReferences(file, position, { includeDefinitionDisplay: true })).toEqual(rich);
      expect(leanPass.findReferences(file, position, { includeDefinitionDisplay: false })).toEqual(lean);
      expect(lean).toEqual(rich?.map(({ definition, references }) => ({ definition: { ...definition, name: "", displayParts: [] }, references })));
      expect(leanFirst.findReferences(file, position)).toEqual(rich);
      expect(leanFirst.findReferences(file, position, { includeDefinitionDisplay: true })).toEqual(rich);
      for (const group of rich ?? []) {
        kinds.add(group.definition.kind);
        laterDefinitions += group.references.filter((entry, index) => index > 0 && entry.isDefinition === true).length;
      }
    }
    expect(queries.length).toBeGreaterThan(100);
    expect(laterDefinitions).toBeGreaterThan(0);
    for (const kind of [
      ts.ScriptElementKind.label,
      ts.ScriptElementKind.keyword,
      ts.ScriptElementKind.string,
      ts.ScriptElementKind.alias,
      ts.ScriptElementKind.classElement,
      ts.ScriptElementKind.interfaceElement,
      ts.ScriptElementKind.enumElement,
      ts.ScriptElementKind.enumMemberElement,
      ts.ScriptElementKind.typeParameterElement,
      ts.ScriptElementKind.memberFunctionElement,
    ]) {
      expect(kinds.has(kind)).toBe(true);
    }
  } finally {
    richPass.dispose();
    leanPass.dispose();
    original.dispose();
    leanFirst.dispose();
  }
});

test("native executing sources and SDK pins reject stale stored and staged worker identities", { timeout: scaledBudget(240_000) }, ({ scratch }) => {
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(scratch, "base.ts"), "export const value=1; export const use=value;\n");
  writeFileSync(join(scratch, ".gitignore"), ".cache/\n");
  execFixtureGit(scratch, ["init", "-q"]);
  expect(JSON.parse(nativeInputCase("sdk-pins", implementationRoot, scratch))).toMatchObject({
    sdkPinned: true,
    versionedOwners: [
      "authored-repository.ts",
      "semantic-inventory-database.ts",
      "semantic-inventory-records.ts",
      "semantic-inventory-queries.ts",
      "semantic-inventory-reader.ts",
      "semantic-inventory.ts",
    ],
    rebuiltAfterStalePin: true,
    refusal: expect.stringMatching(/implementation.*(changed|stale)/u),
    publicationWorkers: 1,
    latestUnchanged: true,
    pinnedText: "export const value=1; export const use=value;\n",
  });
});
