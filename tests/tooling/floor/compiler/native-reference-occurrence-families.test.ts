// Family parity preserves canonical native travel and contextual relationships, not symbol-name equivalence.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";

test("native member and module occurrences preserve contextual roots and import travel", () => {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve },
  });
  const base = project.createSourceFile(
    "/base.tsx",
    `export interface Shape {value:number; optional?:number}
     export interface Shape {label?:string}
     export interface Literal {'quoted-key':number;0:number}
     export type Alias=Shape;
     export const source={value:1};
     export function make(value:Shape):Shape;
     export function make(value:Alias){return value;}
     export namespace make {export const extra=source;}
     export class Parent {value=1; static shared=1; static own(){return this.shared;} protected member=1; #private=1; read(){return this.#private+this.member;}}
     export class Child extends Parent {override value=2; read(){return this.value+super.value;}}
     export class Holder {constructor(public readonly value:number){} read(){return this.value;}}
     export default source;`,
  );
  project.createSourceFile("/barrel.ts", "export {source as renamed,make,Shape,Alias} from './base'; export * as space from './base';export * from './loop';");
  project.createSourceFile("/loop.ts", "export * from './barrel'; export * from './base';");
  const consumer = project.createSourceFile(
    "/consumer.tsx",
    `import defaultSource,{source,Shape,Literal,Parent,Child,Holder} from './base';import {renamed,make,space} from './barrel';import * as all from './loop';
     type Remote=import('./loop').Shape;const lazy=import('./loop');
     const value=source.value;const contextual:Shape={value};const {value:bound}=contextual;
     const union:Shape|{value:number}={value:1};const {value:other}=union;
     const Component=(props:Shape)=>props.value;const jsx=<Component value={bound}/>;
     const computed=contextual['value'];const shorthand={value};
     const literal:Literal={'quoted-key':1,0:2};literal['quoted-key'];literal[0];
     /** {@link source} */ export const use=[defaultSource,renamed,make(contextual),space.source,all.source,new Parent(),new Child(),new Holder(1).value,computed,shorthand.value,jsx,other,lazy];`,
  );
  const required = [
    base.getInterfaceOrThrow("Shape").getPropertyOrThrow("value").getNameNode(),
    base
      .getVariableDeclarationOrThrow("source")
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      .getPropertyOrThrow("value")
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
      .getNameNode(),
    base.getTypeAliasOrThrow("Alias").getNameNode(),
    base.getFunctions()[0]?.getNameNode(),
    base.getVariableDeclarationOrThrow("source").getNameNode(),
    consumer
      .getVariableDeclarationOrThrow("contextual")
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      .getPropertyOrThrow("value")
      .asKindOrThrow(SyntaxKind.ShorthandPropertyAssignment)
      .getNameNode(),
    consumer
      .getVariableDeclarationOrThrow("shorthand")
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      .getPropertyOrThrow("value")
      .asKindOrThrow(SyntaxKind.ShorthandPropertyAssignment)
      .getNameNode(),
    base.getClassOrThrow("Parent").getPropertyOrThrow("member").getNameNode(),
    base.getClassOrThrow("Parent").getPropertyOrThrow("#private").getNameNode(),
    base.getClassOrThrow("Parent").getNameNode(),
    base.getClassOrThrow("Holder").getConstructors()[0]?.getParameters()[0]?.getNameNode(),
    base
      .getInterfaceOrThrow("Literal")
      .getPropertyOrThrow((property) => property.getNameNode().isKind(SyntaxKind.StringLiteral))
      .getNameNode(),
    base
      .getInterfaceOrThrow("Literal")
      .getPropertyOrThrow((property) => property.getNameNode().isKind(SyntaxKind.NumericLiteral))
      .getNameNode(),
  ];
  const nodes = project
    .getSourceFiles()
    .flatMap((source) =>
      [SyntaxKind.Identifier, SyntaxKind.PrivateIdentifier, SyntaxKind.StringLiteral, SyntaxKind.NumericLiteral, SyntaxKind.DefaultKeyword].flatMap((kind) =>
        source.getDescendantsOfKind(kind),
      ),
    );
  const service = project.getLanguageService().compilerObject;
  const queries = nodes.map((node) => ({ fileName: node.getSourceFile().getFilePath(), position: node.getStart() }));
  const expected = queries.map((query) => service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? []);
  const pass = service.createReadonlyReferencePass();
  try {
    const answers = pass.findReferencesFromOccurrences(queries);
    expect(answers).toHaveLength(queries.length);
    for (const node of required) {
      if (node === undefined) {
        throw new Error("required member/module query missing");
      }
      const index = nodes.findIndex((candidate) => candidate.compilerNode === node.compilerNode);
      expect(answers[index]?.kind, `${node.getText()}:${node.getParent().getKindName()}`).toBe("indexed");
    }
    for (const [index, query] of queries.entries()) {
      const answer = answers[index];
      const actual =
        answer === undefined || answer.kind === "native"
          ? (pass.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? [])
          : answer.references;
      expect(actual, `${query.fileName}:${String(query.position)} ${nodes[index]?.getText()}`).toEqual(expected[index]);
    }
    console.log(
      JSON.stringify({
        event: "native-member-module-parity",
        requested: queries.length,
        indexed: answers.filter((answer) => answer.kind === "indexed").length,
        computed: answers.filter((answer) => answer.kind === "computed").length,
        native: answers.filter((answer) => answer.kind === "native").length,
        required: required.map((node) => [node?.getText(), node?.getParent().getKindName()]),
      }),
    );
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test("native contextual member worlds retain their own conditional dependency groups", () => {
  const results = ["browser", "node"].map((world) => {
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, customConditions: [world] },
    });
    project
      .getFileSystem()
      .writeFileSync(
        "/node_modules/dual/package.json",
        JSON.stringify({ name: "dual", exports: { ".": { browser: "./browser.d.ts", default: "./node.d.ts" } } }),
      );
    project.createSourceFile("/node_modules/dual/browser.d.ts", "export interface Shape {value:string}");
    project.createSourceFile("/node_modules/dual/node.d.ts", "export interface Shape {value:number}");
    const source = project.createSourceFile("/consumer.ts", "import type {Shape} from 'dual';const object:Shape={value:1};object.value;");
    const property = source
      .getVariableDeclarationOrThrow("object")
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      .getPropertyOrThrow("value")
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
      .getNameNode();
    const query = { fileName: source.getFilePath(), position: property.getStart() };
    const service = project.getLanguageService().compilerObject;
    const expected = service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? [];
    const pass = service.createReadonlyReferencePass();
    try {
      expect(expected.some((group) => group.definition.fileName === `/node_modules/dual/${world}.d.ts`)).toBe(true);
      const answer = pass.findReferencesFromOccurrences([query])[0];
      expect(answer).toEqual({ kind: "indexed", references: expected });
      return answer;
    } finally {
      pass.dispose();
      service.dispose();
    }
  });
  expect(results[0]).not.toEqual(results[1]);
});

test("native export-equals and import-equals retain merged class and member groups", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [], module: ts.ModuleKind.CommonJS } });
  const source = project.createSourceFile("/source.ts", "class Container {value=1;}namespace Container {export const extra=1;} export=Container;");
  project.createSourceFile("/barrel.ts", "import Container=require('./source');export=Container;");
  project.createSourceFile(
    "/consumer.ts",
    "import Container=require('./barrel');const instance=new Container();export const use=instance.value+Container.extra;",
  );
  const service = project.getLanguageService().compilerObject;
  const nodes = [source.getClassOrThrow("Container").getNameNodeOrThrow(), source.getClassOrThrow("Container").getPropertyOrThrow("value").getNameNode()];
  const queries = nodes.map((node) => ({ fileName: source.getFilePath(), position: node.getStart() }));
  const expected = queries.map((query) => service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? []);
  const pass = service.createReadonlyReferencePass();
  try {
    expect(expected.every((groups) => groups.some((group) => group.references.some((reference) => reference.fileName === "/consumer.ts")))).toBe(true);
    expect(pass.findReferencesFromOccurrences(queries)).toEqual(expected.map((references) => ({ kind: "indexed", references })));
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test.each([
  ["object", "export const object={'':1};object[''];"],
  ["contextual", "interface Shape {'':number}const object:Shape={'':1};object[''];"],
])("empty %s property declaration and use preserve native zero groups", (_kind, text) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  const source = project.createSourceFile("/empty.ts", text);
  const queries = source.getDescendantsOfKind(SyntaxKind.StringLiteral).map((node) => ({ fileName: source.getFilePath(), position: node.getStart() }));
  const service = project.getLanguageService().compilerObject;
  const expected = queries.map((query) => service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? []);
  const pass = service.createReadonlyReferencePass();
  try {
    expect(queries.length).toBeGreaterThan(1);
    const answers = pass.findReferencesFromOccurrences(queries);
    expect(answers).toHaveLength(queries.length);
    for (const [index, query] of queries.entries()) {
      const answer = answers[index];
      expect(expected[index]).toEqual([]);
      // A declaration with an empty name still runs native search once and keeps its explicit zero; a use is never computed.
      const actual =
        answer === undefined || answer.kind === "native"
          ? (pass.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? [])
          : answer.references;
      expect(actual).toEqual(expected[index]);
      expect(answer?.kind === "native" || (answer?.kind === "computed" && answer.provider === "native")).toBe(true);
    }
    expect(answers.at(-1)).toEqual({ kind: "native" });
    expect(answers.slice(0, -1).every((answer) => answer.kind === "computed")).toBe(true);
  } finally {
    pass.dispose();
    service.dispose();
  }
});

test("unsupported raw spellings and a saturated source keep their computed native answer", () => {
  for (const padding of ["const escaped='\\u0061';", Array.from({ length: 65_537 }, (_, index) => `p${String(index)}:1`).join(",")]) {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
    const source = project.createSourceFile(
      "/source.ts",
      padding.startsWith("const") ? `${padding}export const object={value:1};object.value;` : `export const object={value:1,${padding}};object.value;`,
    );
    const property = source
      .getVariableDeclarationOrThrow("object")
      .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      .getPropertyOrThrow("value")
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
      .getNameNode();
    const query = { fileName: source.getFilePath(), position: property.getStart() };
    const service = project.getLanguageService().compilerObject;
    const expected = service.findReferences(query.fileName, query.position, { includeDefinitionDisplay: false }) ?? [];
    const pass = service.createReadonlyReferencePass();
    try {
      expect(expected.flatMap((group) => group.references)).toHaveLength(2);
      const searching = vi.spyOn(pass, "findReferences");
      expect(pass.findReferencesFromOccurrences([query])).toEqual([{ kind: "computed", provider: "native", references: expected }]);
      expect(searching).not.toHaveBeenCalled();
      expect(pass.getOccurrenceStatistics()).toMatchObject({ queries: 1, computedNative: 1, nullRosters: 1 });
    } finally {
      pass.dispose();
      service.dispose();
    }
  }
});
