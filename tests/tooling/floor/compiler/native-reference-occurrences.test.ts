// Native occurrence coverage is explicit; unsupported queries keep their ordinary reference search.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";

function fixture(): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      noLib: true,
      types: [],
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
    },
  });
  project.createSourceFile(
    "/base.tsx",
    `export interface Shape { value:number }
     export interface Shape { other?:string }
     export function overload(value:string):string;
     export function overload(value:number):number;
     export function overload(value:string|number){return value;}
     export namespace overload {export const extra=1;}
     export const exported=1;
     export default exported;
     export function owner<T>(parameter:T){
       const local=parameter; const tuple={local}; const unused=0;
       var repeated=1; var repeated=2; const later=repeated;
       /** {@link local} */ const documented=local;
       const {local: renamed}=tuple; const direct=tuple.local;
       const computed=tuple['local'];
       const contextual:Shape={value:1};
       const {value}=contextual; const {other: otherName}=contextual;
       function nested(local:number){return local;}
       const Component=(props:Shape)=>props.value;
       const jsx=<Component value={value}/>;
       type LocalType=T;
       return [local,tuple,documented,renamed,direct,computed,value,otherName,nested,jsx] as LocalType[];
     }`,
  );
  project.createSourceFile("/barrel.ts", "export {exported as renamed,overload} from './base';export * as ns from './base';");
  project.createSourceFile(
    "/consumer.ts",
    "import def,{Shape,exported} from './base';import {renamed,overload,ns} from './barrel';const object:Shape={value:1};export const use=[def,exported,renamed,overload(1),ns.exported,object['value']];declare const unresolved:Missing;",
  );
  project.createSourceFile("/legacy.js", "export function legacy(seed){const local=seed;const {value}=require('./base');return {local,value};}");
  return project;
}

test("native occurrence production replaces local searches and retains full native groups", () => {
  const project = fixture();
  const source = project.getSourceFileOrThrow("/base.tsx");
  const owner = source.getFunctionOrThrow("owner");
  const nodes = [
    ...owner.getDescendantsOfKind(SyntaxKind.VariableDeclaration).map((node) => node.getNameNode()),
    ...owner.getDescendantsOfKind(SyntaxKind.Parameter).map((node) => node.getNameNode()),
    ...owner.getDescendantsOfKind(SyntaxKind.TypeParameter).map((node) => node.getNameNode()),
  ].filter((node) => node.isKind(SyntaxKind.Identifier));
  const queries = nodes.map((node) => ({ fileName: source.getFilePath(), position: node.getStart() }));
  const service = project.getLanguageService().compilerObject;
  const expected = queries.map((query) => service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? []);
  const pass = service.createReadonlyReferencePass();
  try {
    const answers = pass.findReferencesFromOccurrences(queries);
    expect(answers).toHaveLength(queries.length);
    expect(answers.every((answer) => answer.kind === "indexed")).toBe(true);
    for (const [index, answer] of answers.entries()) {
      expect(answer.kind === "indexed" ? answer.references : undefined, nodes[index]?.getText()).toEqual(expected[index]);
    }
  } finally {
    pass.dispose();
    project.getLanguageService().compilerObject.dispose();
  }
});

test("occurrence coverage distinguishes native alias and property fallback from indexed locals", () => {
  const project = fixture();
  const nodes = project
    .getSourceFiles()
    .flatMap((source) =>
      [SyntaxKind.Identifier, SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral].flatMap((kind) => source.getDescendantsOfKind(kind)),
    );
  const queries = nodes.map((node) => ({ fileName: node.getSourceFile().getFilePath(), position: node.getStart() }));
  const service = project.getLanguageService().compilerObject;
  const expected = queries.map((query) => service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? []);
  const pass = service.createReadonlyReferencePass();
  try {
    const searching = vi.spyOn(pass, "findReferences");
    const answers = pass.findReferencesFromOccurrences(queries);
    expect(searching).not.toHaveBeenCalled();
    expect(answers.some((answer) => answer.kind === "indexed")).toBe(true);
    expect(answers.some((answer) => answer.kind === "native")).toBe(true);
    console.log(
      JSON.stringify({
        event: "native-occurrence-parity",
        requested: queries.length,
        indexed: new Set(queries.filter((_, index) => answers[index]?.kind === "indexed").map((query) => JSON.stringify(query))).size,
        native: answers.filter((answer) => answer.kind === "native").length,
        indexedDeclarations: nodes.filter((_, index) => answers[index]?.kind === "indexed").map((node) => [node.getText(), node.getParent()?.getKindName()]),
      }),
    );
    for (const [index, answer] of answers.entries()) {
      const query = queries[index];
      if (query === undefined) {
        throw new Error("native occurrence query missing");
      }
      const actual =
        answer.kind === "indexed" ? answer.references : (pass.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? []);
      expect(actual, `${query.fileName}:${String(query.position)} ${nodes[index]?.getText()}`).toEqual(expected[index]);
    }
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test.each([
  ["direct", "return this.x;"],
  ["arrow-captured", "return () => this.x;"],
])("%s receiver parameters retain full native special-this groups", (_kind, body) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/receiver.ts", `export function receiver(this:{x:number}){${body}}`);
  const receiver = source.getFunctionOrThrow("receiver").getParameters()[0];
  if (receiver === undefined) {
    throw new Error("native receiver parameter missing");
  }
  const query = { fileName: source.getFilePath(), position: receiver.getNameNode().getStart() };
  const service = project.getLanguageService().compilerObject;
  const expected = service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? [];
  const pass = service.createReadonlyReferencePass();
  try {
    const answer = pass.findReferencesFromOccurrences([query])[0];
    const actual =
      answer?.kind === "indexed" ? answer.references : (pass.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? []);
    expect(expected.flatMap((group) => group.references)).toHaveLength(2);
    expect(actual).toEqual(expected);
    expect(answer).toEqual({ kind: "native" });
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test("occurrence batches detach repeated answers and retry cancellation without partial coverage", () => {
  const project = fixture();
  const source = project.getSourceFileOrThrow("/base.tsx");
  const node = source
    .getFunctionOrThrow("owner")
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((candidate) => candidate.getName() === "local");
  if (node === undefined) {
    throw new Error("local occurrence declaration missing");
  }
  const query = { fileName: source.getFilePath(), position: node.getNameNode().getStart() };
  const service = project.getLanguageService().compilerObject;
  const program = service.getProgram();
  const native = program?.getSourceFile(query.fileName);
  if (native === undefined) {
    throw new Error("native occurrence source missing");
  }
  const expected = service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? [];
  const pass = service.createReadonlyReferencePass();
  try {
    const children = vi.spyOn(native, "getChildren").mockImplementationOnce(() => {
      throw new ts.OperationCanceledException();
    });
    expect(() => pass.findReferencesFromOccurrences([query])).toThrow(ts.OperationCanceledException);
    children.mockRestore();
    const answers = pass.findReferencesFromOccurrences([query, query]);
    expect(answers).toEqual([
      { kind: "indexed", references: expected },
      { kind: "indexed", references: expected },
    ]);
    const first = answers[0];
    if (first?.kind !== "indexed" || first.references[0] === undefined) {
      throw new Error("indexed native result missing");
    }
    first.references[0].references.length = 0;
    expect(answers[1]).toEqual({ kind: "indexed", references: expected });
    expect(pass.findReferencesFromOccurrences([query])).toEqual([{ kind: "indexed", references: expected }]);
    source.insertText(source.getEnd(), "\nexport const changed=1;");
    expect(() => pass.findReferencesFromOccurrences([query])).toThrow("invalidated");
    expect(() => pass.findReferencesFromOccurrences([query])).toThrow("disposed");
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test("occurrence batches refuse foreign sources and retain per-Project and disposed lifetimes", () => {
  const first = fixture();
  const second = fixture();
  second.getSourceFileOrThrow("/base.tsx").replaceWithText("export function owner(){const local=1;return local+local;}");
  const native = [first, second].map((project) => {
    const source = project.getSourceFileOrThrow("/base.tsx");
    const local = source
      .getFunctionOrThrow("owner")
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((node) => node.getName() === "local");
    if (local === undefined) {
      throw new Error("native local query missing");
    }
    const service = project.getLanguageService().compilerObject;
    const query = { fileName: source.getFilePath(), position: local.getNameNode().getStart() };
    return {
      service,
      query,
      expected: service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? [],
      pass: service.createReadonlyReferencePass(),
    };
  });
  try {
    for (const entry of native) {
      expect(entry.pass.findReferencesFromOccurrences([entry.query])).toEqual([{ kind: "indexed", references: entry.expected }]);
      expect(() => entry.pass.findReferencesFromOccurrences([{ fileName: "/absent.ts", position: 0 }])).toThrow();
      entry.pass.dispose();
      expect(() => entry.pass.findReferencesFromOccurrences([entry.query])).toThrow("disposed");
    }
  } finally {
    for (const entry of native) {
      entry.pass.dispose();
      entry.service.dispose();
    }
  }
});

test("empty occurrence demand still validates its native Program lifetime", () => {
  const project = fixture();
  const service = project.getLanguageService().compilerObject;
  const pass = service.createReadonlyReferencePass();
  try {
    expect(pass.findReferencesFromOccurrences([])).toEqual([]);
    project.getSourceFileOrThrow("/consumer.ts").insertText(0, "export const changed=1;\n");
    expect(() => pass.findReferencesFromOccurrences([])).toThrow("invalidated");
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test("a Program replacement during occurrence capture refuses the complete batch", () => {
  const project = fixture();
  const source = project.getSourceFileOrThrow("/base.tsx");
  const query = { fileName: source.getFilePath(), position: source.getFunctionOrThrow("owner").getParameters()[0]?.getStart() ?? -1 };
  const service = project.getLanguageService().compilerObject;
  const native = service.getProgram()?.getSourceFile(query.fileName);
  if (native === undefined) {
    throw new Error("native capture source missing");
  }
  const pass = service.createReadonlyReferencePass();
  const children = native.getChildren.bind(native);
  const intervene = vi.spyOn(native, "getChildren").mockImplementationOnce((...args) => {
    const nodes = children(...args);
    source.insertText(0, "export const intervened=1;\n");
    return nodes;
  });
  try {
    expect(() => pass.findReferencesFromOccurrences([query])).toThrow("invalidated");
    expect(intervene).toHaveBeenCalled();
    expect(() => pass.findReferencesFromOccurrences([query])).toThrow("disposed");
  } finally {
    intervene.mockRestore();
    pass.dispose();
    service.dispose();
  }
});
