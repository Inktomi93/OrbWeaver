import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Node as MorphNode } from "ts-morph";
import { Node, Project, SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { spanSchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import { encodeTypeObservations, mapTypeObservationDemand, replayTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import type { SelectedPropertyGraph, TypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { typeObservationsSchema } from "../../../../tooling/src/floor/code-facts/type-observations-inventory.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import type { NativeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector } from "../../../../tooling/src/floor/code-facts/type-projection-contract.ts";
import { inventoryQueryNode } from "../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts";
import { captureInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";

const GRAPH: SelectedPropertyGraph = { exportName: "published", rootPath: ["view"], stopPath: ["tag"], leafPaths: [["tag"], ["value"]] };
const span = (node: MorphNode): InventorySpan => ({
  file: node.getSourceFile().getFilePath(),
  start: node.getStart(),
  end: node.getEnd(),
  kind: node.getKind(),
});
const member = (parent: NativeTypeSelector, name: string, at: MorphNode): NativeTypeSelector => ({
  ...parent,
  steps: [...parent.steps, { kind: "property", name, at }],
});

test("selected native graphs retain export aliases, declaration locations, native order and leaf boundaries through storage", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  project.createSourceFile("/leaf.ts", 'export const leaf={tag:"leaf" as const,value:undefined as void};');
  const source = project.createSourceFile(
    "/root.ts",
    'import{leaf}from"./leaf";const spread={right:{leaf}};const actual={view:{left:{leaf},...spread,empty:{}}};export{actual as published};',
  );
  const root = source.getVariableDeclarationOrThrow("actual");
  const native = root.getType().getPropertyOrThrow("view").getTypeAtLocation(root);
  const expected = native.getProperties().map((symbol) => ({ name: symbol.getName(), declarations: symbol.getDeclarations().map(span) }));
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "selected-property-graph", nodes: [source], selectedPropertyGraph: GRAPH }],
  };
  const facts = captureTypeObservations(demand, { anchor: source, admit: () => undefined });
  const wire = typeObservationsSchema(spanSchema).parse(encodeTypeObservations(facts, span));
  const replayed = replayTypeObservations(wire, (position) => inventoryQueryNode(project.getSourceFile(position.file), position));
  const typeRead = vi.spyOn(Node.prototype, "getType").mockImplementation(() => {
    throw new Error("semantic replay");
  });
  try {
    const reader = readTypeObservations(replayed);
    expect(reader.exportDeclarations(source, "published")).toEqual([root]);
    const record = member(nodeTypeSelector(root), "view", root);
    const properties = reader.properties(record, root);
    expect(properties.map((property) => ({ name: property.name, declarations: reader.symbolData(property.symbol).declarations.map(span) }))).toEqual(expected);
    const left = properties.find((property) => property.name === "left");
    if (left === undefined) {
      throw new Error("left property missing");
    }
    const leftDeclaration = reader.symbolData(left.symbol).declarations[0];
    if (leftDeclaration === undefined) {
      throw new Error("left declaration missing");
    }
    const leftType = member(record, "left", leftDeclaration);
    const leaf = reader.properties(leftType, leftDeclaration)[0];
    if (leaf === undefined) {
      throw new Error("leaf property missing");
    }
    const leafDeclaration = reader.symbolData(leaf.symbol).declarations[0];
    if (leafDeclaration === undefined) {
      throw new Error("leaf declaration missing");
    }
    const leafType = member(leftType, "leaf", leafDeclaration);
    expect(reader.literalValue(member(leafType, "tag", leafDeclaration))).toBe("leaf");
    expect(reader.categoryFlags(member(leafType, "value", leafDeclaration))).toEqual({ object: false, void: true });
    expect(() => reader.properties(leafType, leafDeclaration)).toThrow("not captured");
    expect(() => reader.select(member(leftType, "leaf", root))).toThrow("not captured");
    const empty = properties.find((property) => property.name === "empty");
    const emptyDeclaration = empty === undefined ? undefined : reader.symbolData(empty.symbol).declarations[0];
    if (emptyDeclaration === undefined) {
      throw new Error("empty declaration missing");
    }
    expect(reader.properties(member(record, "empty", emptyDeclaration), emptyDeclaration)).toEqual([]);
    const truncated = { ...replayed, properties: replayed.properties.map((row, index) => (index === 0 ? { ...row, values: row.values.slice(1) } : row)) };
    expect(() => readTypeObservations(truncated)).toThrow("property");
    const truncatedWire = { ...wire, properties: wire.properties.map((row, index) => (index === 0 ? { ...row, values: row.values.slice(1) } : row)) };
    expect(() => typeObservationsSchema(spanSchema).parse(truncatedWire)).toThrow("property");
    expect(() => readTypeObservations({ ...replayed, properties: replayed.properties.filter((row) => row.values.length > 0) })).toThrow("not captured");
    expect(() => readTypeObservations({ ...replayed, exportDeclarations: [] })).toThrow("not captured");
    const foreign = new Project({ useInMemoryFileSystem: true }).createSourceFile("/other.ts", "const x=1;");
    expect(() => reader.select(nodeTypeSelector(foreign))).toThrow("captured native program");
  } finally {
    typeRead.mockRestore();
  }
  source.replaceWithText(source.getFullText());
  expect(() => facts.assertNode(source)).toThrow("stale");
});

test("raw graph cycles and multiple declarations stay observable without recursive SDK expansion", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const source = project.createSourceFile(
    "/cycle.ts",
    'interface Cycle{child:Cycle} interface Merged{edge:{tag:"leaf";value:void}} interface Merged{edge:{tag:"leaf";value:void}} declare const actual:{view:{cycle:Cycle;merged:Merged}};export{actual as published};',
  );
  const root = source.getVariableDeclarationOrThrow("actual");
  const facts = captureTypeObservations(
    {
      profile: TYPE_OBSERVATION_PROFILE,
      sources: [source],
      nodes: [],
      questions: [{ kind: "selected-property-graph", nodes: [source], selectedPropertyGraph: GRAPH }],
    },
    { anchor: source, admit: () => undefined },
  );
  const reader = readTypeObservations(facts);
  const record = member(nodeTypeSelector(root), "view", root);
  const paths = reader.properties(record, root).map((property) => {
    const declaration = reader.symbolData(property.symbol).declarations[0];
    if (declaration === undefined) {
      throw new Error("record declaration missing");
    }
    const selected = member(record, property.name, declaration);
    const nested = reader.properties(selected, declaration)[0];
    if (nested === undefined) {
      throw new Error("nested property missing");
    }
    return { name: property.name, selected, declarations: reader.symbolData(nested.symbol).declarations };
  });
  const merged = paths.find((path) => path.name === "merged");
  const cycle = paths.find((path) => path.name === "cycle");
  if (merged === undefined || cycle === undefined) {
    throw new Error("native cycle or merged record missing");
  }
  expect(merged.declarations).toHaveLength(2);
  const childDeclaration = cycle.declarations[0];
  if (childDeclaration === undefined) {
    throw new Error("cycle declaration missing");
  }
  const child = member(cycle.selected, "child", childDeclaration);
  const childReference = reader.select(child);
  const parentReference = reader.select(cycle.selected);
  if (childReference === null || parentReference === null) {
    throw new Error("cycle Type missing");
  }
  expect(reader.type(childReference).key).toBe(reader.type(parentReference).key);
  expect(() => reader.properties(child, childDeclaration)).toThrow("not captured");
});

test("older primitive demands never acquire new category or exported-root answers", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true } });
  const source = project.createSourceFile("/older.ts", "const value:number=1;");
  const node = source.getVariableDeclarationOrThrow("value");
  const facts = captureTypeObservations(
    { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [], questions: [{ kind: "primitive-flags", nodes: [node] }] },
    { anchor: source, admit: () => undefined },
  );
  const reader = readTypeObservations(facts);
  expect(reader.primitiveFlags(nodeTypeSelector(node)).number).toBe(true);
  expect(() => reader.categoryFlags(nodeTypeSelector(node))).toThrow("not captured");
  expect(() => reader.exportDeclarations(source, "value")).toThrow("not captured");
});

test("explicit callable bodies retain data aliases without opening service implementations or foreign bodies", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, strict: true } });
  const outside = project.createSourceFile("/outside.ts", 'export function outside(){return {outsideOnly:"outside-body"};}');
  const source = project.createSourceFile(
    "/bodies.ts",
    [
      'import {outside} from "./outside";',
      'function service(){return {serviceOnly:"function-service-body"};}',
      'const supplier=()=>({serviceOnly:"arrow-service-body"});',
      "const shared={ok:true};",
      "function named(){return shared;}",
      "const alias=named;",
      "function valued(){service();return supplier();}",
      "const methods={method(){return {ok:true};}};const method=methods.method;",
    ].join("\n"),
  );
  const imported = source.getImportDeclarations()[0]?.getNamedImports()[0]?.getNameNode();
  if (imported === undefined) {
    throw new Error("imported callable nominee missing");
  }
  const named = source.getFunctionOrThrow("named");
  const alias = source.getVariableDeclarationOrThrow("alias").getNameNode();
  const method = source.getVariableDeclarationOrThrow("method").getNameNode();
  const nominees = [named.getNameNodeOrThrow(), alias, source.getFunctionOrThrow("valued").getNameNodeOrThrow(), method, imported];
  const demand: TypeObservationDemand = {
    profile: TYPE_OBSERVATION_PROFILE,
    sources: [source],
    nodes: [],
    questions: [{ kind: "callable-body-values", nodes: nominees, files: [source.getFilePath()], valueFacets: ["stable"] }],
  };
  const plan = { mode: "types" as const, facets: [], arguments: [], typeObservations: mapTypeObservationDemand(demand, span) };
  const evidence = captureInvocationEvidence(source, plan, undefined, demand);
  const facts = evidence.typeObservations;
  if (facts === undefined) {
    throw new Error("callable body capture missing");
  }
  const wire = typeObservationsSchema(spanSchema).parse(encodeTypeObservations(facts, span));
  const replayed = replayTypeObservations(wire, (position) => inventoryQueryNode(project.getSourceFile(position.file), position));
  const reader = readTypeObservations(replayed);
  expect(reader.callableBody(alias)).toBe(named.getBodyOrThrow());
  expect(reader.callableBody(method)).toBeNull();
  expect(reader.callableBody(imported)).toBe(outside.getFunctionOrThrow("outside").getBodyOrThrow());
  const profiled = facts.valueProfiles?.map((row) => row.node) ?? [];
  expect(profiled).toContain(source.getVariableDeclarationOrThrow("shared").getInitializerOrThrow());
  const serviceBodies = source.getDescendantsOfKind(SyntaxKind.StringLiteral).filter((node) => node.getLiteralValue().endsWith("service-body"));
  expect(serviceBodies).toHaveLength(2);
  expect(serviceBodies.some((node) => profiled.includes(node))).toBe(false);
  expect(profiled.some((node) => node.getSourceFile() === outside)).toBe(false);
  expect(() => readTypeObservations({ ...replayed, callableBodies: [] })).toThrow("not captured");
  expect(() => typeObservationsSchema(spanSchema).parse({ ...wire, callableBodies: [] })).toThrow("nomination");
  expect(() => captureTypeObservations(demand, { anchor: source, admit: () => undefined })).toThrow("canonical callable owner");
});
