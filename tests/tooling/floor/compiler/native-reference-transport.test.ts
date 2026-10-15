import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { beginReferencePass, endReferencePass, isDocumentationLinkReference } from "@orb/tooling/floor/code-facts/reference-fact";
import { unprovenReferenceUse } from "@orb/tooling/floor/code-facts/reference-fact-writes";
import { readAuthoredCallableSources } from "@orb/tooling/floor/code-facts/value-carrier";
import { nativeReferenceNodes } from "@orb/tooling/floor/compiler/ts-workspace";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";

test("distinct complete-use queries share only the readonly native import scan", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  const base = project.createSourceFile("/base.ts", "export const first=[]; export const second=[];");
  project.createSourceFile(
    "/consumer.ts",
    "import {first,second} from './base'; declare function opaque(value:object):void; export const a=first; export const b=second; opaque(first);",
  );
  project.createSourceFile("/other-base.ts", "export const other=1;");
  project.createSourceFile("/other.ts", "import {other} from './other-base'; export const c=other;");
  const service = project.getLanguageService().compilerObject;
  const program = service.getProgram();
  const other = program?.getSourceFile("/other.ts");
  const sentinel = other?.statements.find(ts.isImportDeclaration)?.moduleSpecifier;
  if (program === undefined || sentinel === undefined) {
    throw new Error("the actual native import sentinel is unavailable");
  }
  const checker = program.getTypeChecker();
  const original = checker.getSymbolAtLocation.bind(checker);
  let scans = 0;
  const lookup = vi.spyOn(checker, "getSymbolAtLocation").mockImplementation((node) => {
    scans += Number(node === sentinel);
    return original(node);
  });
  const first = base.getVariableDeclarationOrThrow("first").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
  const second = base.getVariableDeclarationOrThrow("second").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
  beginReferencePass();
  try {
    expect(unprovenReferenceUse(first, () => true)).toBeUndefined();
    expect(unprovenReferenceUse(second, () => true)).toBeUndefined();
    expect(scans).toBe(1);
    expect(unprovenReferenceUse(first, () => false)).toBeDefined();
    expect(scans).toBe(1);
  } finally {
    endReferencePass();
    lookup.mockRestore();
  }
  expect(unprovenReferenceUse(first, () => false)).toBeDefined();
});

test("readonly references retain ordered native wrapper identities across aliases, definitions, shorthand and documentation", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const base = project.createSourceFile(
    "/base.ts",
    `export const binding={value:1};
     export function overloaded(x:string):string; export function overloaded(x:number):number;
     export function overloaded(x:string|number){return x;}
     export namespace overloaded {export const extra=1;}
     export interface Shape {value:number} export interface Shape {other:string}`,
  );
  project.createSourceFile("/barrel.ts", "export {binding as renamed,overloaded} from './base';");
  const consumer = project.createSourceFile(
    "/consumer.ts",
    `import {binding} from './base'; import {renamed,overloaded} from './barrel';
     const alias=binding; const object={binding};
     /** {@link binding} */ export function documented(){return binding;}
     export const use=[alias,object.binding,renamed,overloaded(1),overloaded.extra];`,
  );
  const queries = [...base.getDescendantsOfKind(SyntaxKind.Identifier), ...consumer.getDescendantsOfKind(SyntaxKind.Identifier)];
  const expected = queries.map((query) => query.findReferencesAsNodes());
  expect(expected.some((references) => references.some(isDocumentationLinkReference))).toBe(true);
  beginReferencePass();
  try {
    for (const [index, query] of queries.entries()) {
      const actual = nativeReferenceNodes(query);
      const baseline = expected[index] ?? [];
      expect(actual.length).toBe(baseline.length);
      actual.forEach((reference, offset) => {
        expect(reference).toBe(baseline[offset]);
      });
    }
  } finally {
    endReferencePass();
  }
});

for (const scenario of [
  { name: "all actual factory instances", extra: "", omitted: false, resolved: true },
  { name: "a mutated first instance", extra: "first.settle=()=>0;", omitted: false, resolved: false },
  { name: "an escaped first instance", extra: "escape(first);", omitted: false, resolved: false },
  { name: "an omitted unsafe call", extra: "escape(first);", omitted: true, resolved: false },
] as const) {
  test(`readonly complete references preserve ${scenario.name}`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/source.ts",
      `declare function escape(value:object):void;
       function factory(){return{settle:(batch:number[])=>batch.push(1)};}
       const first=factory(); const second=factory();
       first.settle([]); ${scenario.extra} second.settle([]);`,
    );
    const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => !scenario.omitted || call.getExpression().getText() !== "escape");
    const selected = calls.find((call) => call.getExpression().getText() === "first.settle");
    if (selected === undefined) {
      throw new Error("the actual first factory invocation is missing");
    }
    beginReferencePass();
    try {
      const observations = observeCallReturns(calls, source.getDescendants(), { suppliedCallableTargets: true });
      const program = observations.programs[0];
      if (program === undefined) {
        throw new Error("the captured native factory program is missing");
      }
      const actual = readAuthoredCallableSources(selected.getExpression(), (call) => program.byCall.has(call.compilerNode), observations);
      expect(actual.kind).toBe(scenario.resolved ? "resolved" : "unresolved");
    } finally {
      endReferencePass();
    }
  });
}

for (const change of ["text", "roots", "options"] as const) {
  test(`readonly transport refuses a changed native ${change} epoch without raw retry`, () => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/source.ts", "const value=1; const use=value;");
    beginReferencePass();
    try {
      const name = source.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
      expect(nativeReferenceNodes(name)).toHaveLength(1);
      if (change === "text") {
        source.addStatements("const added=value;");
      } else if (change === "roots") {
        project.createSourceFile("/added.ts", "export const added=2;");
      } else {
        project.compilerOptions.set({ strict: true });
      }
      const current = source.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
      const raw = vi.spyOn(current, "findReferencesAsNodes");
      try {
        expect(() => nativeReferenceNodes(current)).toThrow("invalidated");
        expect(raw).not.toHaveBeenCalled();
      } finally {
        raw.mockRestore();
      }
    } finally {
      endReferencePass();
    }
    const current = source.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    expect(nativeReferenceNodes(current)).toEqual(current.findReferencesAsNodes());
  });
}

test("readonly transport propagates cancellation and disposes its native handle with the invocation", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/source.ts", "const value=1; const use=value;");
  const name = source.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
  const service = project.getLanguageService().compilerObject;
  const create = service.createReadonlyReferencePass.bind(service);
  let captured: ts.ReadonlyReferencePass | undefined;
  const observation = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
    const pass = create();
    captured = pass;
    vi.spyOn(pass, "findReferences").mockImplementationOnce(() => {
      throw new ts.OperationCanceledException();
    });
    return pass;
  });
  const raw = vi.spyOn(name, "findReferencesAsNodes");
  beginReferencePass();
  try {
    expect(() => nativeReferenceNodes(name)).toThrow(ts.OperationCanceledException);
    expect(raw).not.toHaveBeenCalled();
    expect(nativeReferenceNodes(name)).toHaveLength(1);
    expect(observation).toHaveBeenCalledTimes(1);
  } finally {
    endReferencePass();
    raw.mockRestore();
    observation.mockRestore();
  }
  expect(() => captured?.findReferences(source.getFilePath(), name.getStart())).toThrow("disposed");
  expect(nativeReferenceNodes(name)).toHaveLength(1);
});

test("a failed native snapshot acquisition releases its already-created readonly handle", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/source.ts", "const value=1; const use=value;");
  const name = source.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
  const service = project.getLanguageService().compilerObject;
  const create = service.createReadonlyReferencePass.bind(service);
  let captured: ts.ReadonlyReferencePass | undefined;
  const snapshot = vi.spyOn(service, "getProgram");
  const observation = vi.spyOn(service, "createReadonlyReferencePass").mockImplementation(() => {
    captured = create();
    snapshot.mockImplementationOnce(() => {
      throw new ts.OperationCanceledException();
    });
    return captured;
  });
  beginReferencePass();
  try {
    expect(() => nativeReferenceNodes(name)).toThrow(ts.OperationCanceledException);
  } finally {
    endReferencePass();
    observation.mockRestore();
    snapshot.mockRestore();
  }
  expect(() => captured?.findReferences(source.getFilePath(), name.getStart())).toThrow("disposed");
});

test("separate Projects retain separate readonly native handles and wrapper identities", () => {
  const projects = [0, 1].map(() => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile("/same.ts", "const value=1; const use=value;");
    return { project, name: source.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier) };
  });
  beginReferencePass();
  try {
    const found = projects.map(({ name, project }) => {
      const result = nativeReferenceNodes(name);
      expect(result).toHaveLength(1);
      expect(result[0]?.getProject()).toBe(project);
      return result[0];
    });
    expect(found[0]).not.toBe(found[1]);
  } finally {
    endReferencePass();
  }
});

test("package redirects admit only shared native syntax, never equal path and text alone", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  for (const side of ["left", "right"]) {
    project.getFileSystem().writeFileSync(`/node_modules/${side}/package.json`, JSON.stringify({ name: side, version: "1.0.0", types: "index.d.ts" }));
    project.createSourceFile(`/node_modules/${side}/index.d.ts`, "export {value} from 'shared';");
    project
      .getFileSystem()
      .writeFileSync(`/node_modules/${side}/node_modules/shared/package.json`, JSON.stringify({ name: "shared", version: "1.0.0", types: "index.d.ts" }));
    project.createSourceFile(`/node_modules/${side}/node_modules/shared/index.d.ts`, "export declare const value:1;");
  }
  const consumer = project.createSourceFile("/consumer.ts", "import {value as left} from 'left'; import {value as right} from 'right'; const use=left+right;");
  project.resolveSourceFileDependencies();
  const native = project.getLanguageService().compilerObject.getProgram();
  const redirected = project.getSourceFileOrThrow("/node_modules/right/node_modules/shared/index.d.ts");
  expect(native?.getSourceFile(redirected.getFilePath())).not.toBe(redirected.compilerNode);
  expect(native?.getSourceFile(redirected.getFilePath())?.text).toBe(redirected.getFullText());
  const imported = consumer.getImportDeclarations()[0]?.getNamedImports()[0]?.getAliasNode();
  if (imported === undefined) {
    throw new Error("the actual package import alias is unavailable");
  }
  const expected = imported.findReferencesAsNodes();
  beginReferencePass();
  try {
    const actual = nativeReferenceNodes(imported);
    expect(actual.length).toBe(expected.length);
    actual.forEach((reference, index) => {
      expect(reference).toBe(expected[index]);
    });
    const name = redirected.getVariableDeclarationOrThrow("value").getNameNode().asKindOrThrow(SyntaxKind.Identifier);
    expect(() => nativeReferenceNodes(name)).toThrow("does not share");
  } finally {
    endReferencePass();
  }
});
