// Native projection observations preserve TypeScript's own lookup semantics before persistence or policy classification.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { typeProjectionWireSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeProjection } from "../../../../tooling/src/floor/code-facts/type-projection.ts";
import { encodeTypeProjection, replayTypeProjection } from "../../../../tooling/src/floor/code-facts/type-projection-codec.ts";
import type { NativeScalarTypeProjection, NativeTypeProjection } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import {
  assertTypeProjectionCoverage,
  canonicalTypeProjectionPlan,
  typeProjectionFacet,
  typeProjectionPlanSchema,
} from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { captureInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";

test("index and property presence distinguish hidden broad spreads, unions, inherited and callable members", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile(
    "/projection.ts",
    `
interface Base { container?: number }
interface Child extends Base { own: boolean }
declare const broad: Readonly<Record<string, unknown>>;
declare const finite: { health?: number };
const erased={health:1,...broad};
declare const inherited: Child;
declare const missing: Base | { other: number };
declare const common: Base | { container: number };
declare const callable: (()=>void) & { container?: number };
declare const absent: { other: number };
`,
  );
  const read = (name: string): NativeTypeProjection =>
    captureTypeProjection(source.getVariableDeclarationOrThrow(name).getNameNode(), {
      facets: ["string-index", "properties", "call-signatures"],
      properties: ["container"],
    });
  expect(typeProjectionFacet(read("broad"), "string-index")).toBe(true);
  expect(typeProjectionFacet(read("finite"), "string-index")).toBe(false);
  expect(typeProjectionFacet(read("erased"), "string-index")).toBe(false);
  for (const [name, present] of [
    ["inherited", true],
    ["missing", false],
    ["common", true],
    ["callable", true],
    ["absent", false],
  ] as const) {
    expect(typeProjectionFacet(read(name), "properties"), name).toEqual([{ name: "container", present }]);
  }
  expect(typeProjectionFacet(read("callable"), "call-signatures")).toBe(true);
  expect(typeProjectionFacet(read("inherited"), "call-signatures")).toBe(false);
});

test("scalar observations preserve literal alternatives and opaque/nonnullable distinctions without inferred policy meaning", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile(
    "/scalar.ts",
    `
declare const axis: "agent-sdk" | "chat-completions" | undefined;
declare const open: string;
declare const opaque: unknown;
declare const loose: any;
declare const maybe: {value:number} | undefined;
`,
  );
  const read = (name: string): NativeScalarTypeProjection =>
    typeProjectionFacet(captureTypeProjection(source.getVariableDeclarationOrThrow(name).getNameNode(), { facets: ["scalar"], properties: [] }), "scalar");
  expect(read("axis").stringLiterals.toSorted()).toEqual(["agent-sdk", "chat-completions"]);
  expect(read("open")).toEqual({ stringLiterals: [], nonNullableObject: false, any: false, unknown: false });
  expect(read("opaque").unknown).toBe(true);
  expect(read("loose").any).toBe(true);
  expect(read("maybe").nonNullableObject).toBe(true);
});

test("runtime undefined identity is not undefined type membership or a shadowed spelling", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile(
    "/undefined.ts",
    `
declare const optional: string | undefined;
const intrinsic=undefined;
const voided=void optional;
const lookalike="undefined";
function shadow(undefined:number){return undefined;}
`,
  );
  const read = (node: Node): boolean =>
    typeProjectionFacet(captureTypeProjection(node, { facets: ["runtime-undefined"], properties: [] }), "runtime-undefined");
  expect(read(source.getVariableDeclarationOrThrow("intrinsic").getInitializerOrThrow())).toBe(true);
  expect(read(source.getVariableDeclarationOrThrow("voided").getInitializerOrThrow())).toBe(true);
  expect(read(source.getVariableDeclarationOrThrow("optional").getNameNode())).toBe(false);
  expect(read(source.getVariableDeclarationOrThrow("lookalike").getInitializerOrThrow())).toBe(false);
  expect(read(source.getFunctionOrThrow("shadow").getFirstDescendantByKindOrThrow(SyntaxKind.ReturnStatement).getExpressionOrThrow())).toBe(false);
});

test("alias-first origin and underlying symbol declarations stay independent across barrels and same-name foreign types", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const home = project.createSourceFile("/registry.ts", "export interface ContributorRegistry<T> { readonly value:T }\n");
  const foreign = project.createSourceFile("/foreign.ts", "export interface ContributorRegistry<T> { readonly other:T }\n");
  project.createSourceFile("/barrel.ts", 'export type {ContributorRegistry as Seam} from "./registry.ts";');
  const source = project.createSourceFile(
    "/consumer.ts",
    `
import type {Seam} from "./barrel.ts";
import type {ContributorRegistry as Foreign} from "./foreign.ts";
type Alias=Seam<string>;
type Pane=(value:string)=>null;
declare function make(a:Alias,b:Foreign<number>,pane:Pane):void;
`,
  );
  const parameters = source.getFunctionOrThrow("make").getParameters();
  const captures = parameters.map((parameter) =>
    captureTypeProjection(parameter.getTypeNodeOrThrow(), { facets: ["type-identity", "type-symbol", "call-signatures"], properties: [] }),
  );
  const [real, impostor, pane] = captures;
  expect(real).toBeDefined();
  expect(impostor).toBeDefined();
  expect(pane).toBeDefined();
  if (real === undefined || impostor === undefined || pane === undefined) {
    throw new Error("native parameter controls are missing");
  }
  expect(typeProjectionFacet(real, "type-symbol")).toEqual([home.getInterfaceOrThrow("ContributorRegistry")]);
  expect(typeProjectionFacet(impostor, "type-symbol")).toEqual([foreign.getInterfaceOrThrow("ContributorRegistry")]);
  const origin = typeProjectionFacet(pane, "type-identity");
  expect(origin.kind).toBe("resolved");
  if (origin.kind !== "resolved") {
    throw new Error("native callable alias did not resolve");
  }
  expect(origin.value.name).toBe("Pane");
  expect(origin.value.declarations).toEqual([source.getTypeAliasOrThrow("Pane")]);
  expect(typeProjectionFacet(pane, "type-symbol")).not.toEqual(origin.value.declarations);
  expect(typeProjectionFacet(pane, "call-signatures")).toBe(true);
});

test("closed demand refuses missing/foreign coverage while preserving false and null native answers", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/coverage.ts", "declare const value:string;");
  const node = source.getVariableDeclarationOrThrow("value").getNameNode();
  const plan = { facets: ["string-index", "type-symbol"], properties: [] } as const;
  const facts = captureTypeProjection(node, { facets: [...plan.facets], properties: [] });
  expect(typeProjectionFacet(facts, "string-index")).toBe(false);
  expect(typeProjectionFacet(facts, "type-symbol")).toBeNull();
  expect(() => typeProjectionFacet(facts, "scalar")).toThrow("scalar is unavailable");
  expect(() => assertTypeProjectionCoverage(facts, { facets: ["string-index"], properties: [] })).toThrow("foreign");
  expect(() => assertTypeProjectionCoverage({}, { facets: ["string-index"], properties: [] })).toThrow("incomplete");
  expect(() => canonicalTypeProjectionPlan({ facets: ["properties"], properties: [] })).toThrow("exact properties");
  expect(() => canonicalTypeProjectionPlan({ facets: ["scalar", "scalar"], properties: [] })).toThrow("duplicate");
  expect(() => typeProjectionPlanSchema.parse({ facets: ["scalar"], properties: [], unrelated: true })).toThrow();
  expect(() =>
    assertTypeProjectionCoverage({ properties: [{ name: "foreign", present: false }] }, { facets: ["properties"], properties: ["container"] }),
  ).toThrow("property coverage");
});

test("captured lexical declarations preserve portal wiring identity for parameters, local destructuring and shadow bindings", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile(
    "/container.ts",
    `
declare const fallback:number;
function direct(props:{container:number}) { return props.container; }
function destructured({container}:{container:number}) { return container; }
function local(props:{container:number}) { const {container}=props; return container; }
function shadow(props:{container:number}) { const container=fallback; return container; }
`,
  );
  const roots = source.getDescendantsOfKind(SyntaxKind.ReturnStatement).map((node) => node.getExpressionOrThrow());
  const first = roots[0];
  if (first === undefined) {
    throw new Error("portal identity control has no value roots");
  }
  const evidence = captureInvocationEvidence(first, { mode: "value", facets: [], arguments: [] });
  const identifiers = roots.flatMap((root) => [root, ...root.getDescendantsOfKind(SyntaxKind.Identifier)]).filter(Node.isIdentifier);
  const localReceiver = source.getFunctionOrThrow("local").getFirstDescendantByKindOrThrow(SyntaxKind.VariableDeclaration).getInitializerOrThrow();
  if (!Node.isIdentifier(localReceiver)) {
    throw new Error("local portal destructuring control has no parameter receiver");
  }
  identifiers.push(localReceiver);
  expect(identifiers).toHaveLength(6);
  for (const identifier of identifiers) {
    expect(evidence.declarations(identifier), identifier.getText()).toEqual(identifier.getDefinitionNodes());
  }
});

test("projection wire round-trip preserves complete native answers and rejects foreign plans or missing scalar/property coverage", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const source = project.createSourceFile("/wire.ts", "interface Seam {container:number} declare const value:Seam;");
  const node = source.getVariableDeclarationOrThrow("value").getNameNode();
  const plan = canonicalTypeProjectionPlan({
    facets: ["type-identity", "type-symbol", "string-index", "properties", "call-signatures", "scalar", "runtime-undefined", "origins"],
    properties: ["missing", "container"],
  });
  const projection = captureTypeProjection(node, plan);
  const nodes = new Map<string, Node>();
  const span = (subject: Node): InventorySpan => {
    const anchor = { file: subject.getSourceFile().getFilePath(), start: subject.getStart(), end: subject.getEnd(), kind: subject.getKind() };
    nodes.set(JSON.stringify(anchor), subject);
    return anchor;
  };
  const replay = (anchor: InventorySpan): Node => {
    const subject = nodes.get(JSON.stringify(anchor));
    if (subject === undefined) {
      throw new Error("unadmitted type projection test anchor");
    }
    return subject;
  };
  const wire = typeProjectionWireSchema.parse(JSON.parse(JSON.stringify(encodeTypeProjection(projection, plan, span))));
  expect(replayTypeProjection(wire, plan, replay)).toEqual(projection);
  expect(() => replayTypeProjection(wire, { facets: ["scalar"], properties: [] }, replay)).toThrow("foreign demand");
  expect(() => replayTypeProjection({ ...wire, values: { ...wire.values, scalar: undefined } }, plan, replay)).toThrow("incomplete");
  expect(() => replayTypeProjection({ ...wire, values: { ...wire.values, properties: [{ name: "container", present: true }] } }, plan, replay)).toThrow(
    "property coverage",
  );
  const origins = wire.values.origins;
  if (origins === undefined) {
    throw new Error("native origin round-trip control is missing");
  }
  expect(origins.annotations.length).toBeGreaterThan(0);
  expect(() => replayTypeProjection({ ...wire, values: { ...wire.values, origins: { ...origins, annotations: [] } } }, plan, replay)).toThrow(
    "annotation origin coverage",
  );
  expect(() => replayTypeProjection({ ...wire, values: { ...wire.values, origins: { ...origins, values: [] } } }, plan, replay)).toThrow(
    "root/callable coverage",
  );
});

test("declaration export observations retain export lists, defaults, namespaces and private shadows as data", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile(
    "/exports.ts",
    `
interface Private {}
interface Listed {}
export type { Listed as Renamed };
interface Defaulted {}
export type { Defaulted as default };
export interface Keyword {}
namespace Nested { export interface Member {} }
declare module "ambient" { interface Hidden {} }
const variable=1;
`,
  );
  const plan = canonicalTypeProjectionPlan({ facets: ["declaration-export"], properties: [] });
  const read = (node: Node): boolean => typeProjectionFacet(captureTypeProjection(node, plan), "declaration-export");
  expect(source.getDescendantsOfKind(SyntaxKind.InterfaceDeclaration).map((node) => [node.getName(), read(node)])).toEqual([
    ["Private", false],
    ["Listed", true],
    ["Defaulted", true],
    ["Keyword", true],
    ["Member", true],
    ["Hidden", false],
  ]);
  expect(() => read(source.getVariableDeclarationOrThrow("variable"))).toThrow("requires an interface or type-alias declaration");
  const absent = captureTypeProjection(source.getInterfaceOrThrow("Private"), plan);
  const noAnchor = (): never => {
    throw new Error("scalar declaration observation requested an unnecessary node anchor");
  };
  const wire = encodeTypeProjection(absent, plan, noAnchor);
  expect(replayTypeProjection(typeProjectionWireSchema.parse(JSON.parse(JSON.stringify(wire))), plan, noAnchor)).toEqual({ "declaration-export": false });
  expect(() => replayTypeProjection({ ...wire, values: {} }, plan, noAnchor)).toThrow("facet coverage");
});
