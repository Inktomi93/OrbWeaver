import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import { readShapeAssociation } from "../../../../tooling/src/floor/code-facts/shape-association.ts";
import type { ShapeAssociationRead, ShapeAssociationSite } from "../../../../tooling/src/floor/code-facts/shape-association-contract.ts";
import { SHAPE_ASSOCIATION_UNKNOWN } from "../../../../tooling/src/floor/code-facts/shape-association-contract.ts";
import { baseReferences, shapeAssociationQuestions, shapeAssociationSites } from "../../../../tooling/src/floor/code-facts/shape-association-sites.ts";
import { captureTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations.ts";
import { encodeTypeObservations, replayTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { inventoryQueryNode } from "../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts";

function capture(source: SourceFile, sites: readonly ShapeAssociationSite[]): ReturnType<typeof captureTypeObservations> {
  return captureTypeObservations(
    {
      profile: TYPE_OBSERVATION_PROFILE,
      sources: [source],
      nodes: [],
      questions: shapeAssociationQuestions(sites, source.getDescendants().flatMap(baseReferences)),
    },
    { anchor: source, admit: () => undefined },
  );
}

function read(source: SourceFile, sites: readonly ShapeAssociationSite[]): readonly ShapeAssociationRead[] {
  const project = source.getProject();
  const wire = encodeTypeObservations(capture(source, sites), (node) => ({
    file: node.getSourceFile().getFilePath(),
    start: node.getStart(),
    end: node.getEnd(),
    kind: node.getKind(),
  }));
  const facts = replayTypeObservations(wire, (span) => inventoryQueryNode(project.getSourceFile(span.file), span));
  const readers = readTypeObservations(facts);
  return sites.map((site) =>
    readShapeAssociation(
      site,
      readers,
      (node) => node.getSourceFile() === source,
      (node) => node.getSourceFile().getFilePath().includes("/production/"),
    ),
  );
}

test("persisted direct boundary facts preserve aliases, assignments, arguments, own returns and canonical type-literal owners", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  const production = project.createSourceFile(
    "/production/owner.ts",
    "export type Owner = { value: string }; export function take(value: Owner): void { void value; }",
  );
  const source = project.createSourceFile(
    "/tests/support.ts",
    `
import type { Owner as Output } from "../production/owner";
import { take as accept } from "../production/owner";
interface Hand { value: string }
declare const hand: Hand;
const initial: Output = hand;
let assigned: Output;
assigned = hand;
interface Holder { field: Output }
declare const holder: Holder;
holder.field = hand;
accept(hand);
function returned(): Output { return hand; }
const arrow = (): Output => hand;
`,
  );
  expect(project.getPreEmitDiagnostics()).toEqual([]);
  const sites = source.getDescendants().flatMap(shapeAssociationSites);
  const answers = read(source, sites);
  expect(answers).toHaveLength(6);
  expect(answers.map((answer) => (answer.kind === "associated" ? [answer.kind, answer.value.production.getName()] : answer))).toEqual([
    ["associated", "Owner"],
    ["associated", "Owner"],
    ["associated", "Owner"],
    ["associated", "Owner"],
    ["associated", "Owner"],
    ["associated", "Owner"],
  ]);
  for (const answer of answers) {
    if (answer.kind !== "associated") {
      throw new Error("the direct boundary was not associated");
    }
    expect(answer.value.hand).toBe(source.getInterfaceOrThrow("Hand"));
    expect(answer.value.production).toBe(production.getTypeAliasOrThrow("Owner"));
  }
});

test("computed output aliases use explicit annotation identity while erased parameter and assignment owners stay unknown", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  project.createSourceFile(
    "/production/owner.ts",
    'export type Owner = { output: { value: string } }["output"]; export function take(value: Owner): void { void value; }',
  );
  const source = project.createSourceFile(
    "/tests/support.ts",
    `
import type { Owner as Output } from "../production/owner";
import { take as accept } from "../production/owner";
interface Hand { value: string }
declare const hand: Hand;
const initial: Output = hand;
let assigned: Output;
assigned = hand;
interface Holder { field: Output }
declare const holder: Holder;
holder.field = hand;
accept(hand);
function returned(): Output { return hand; }
const arrow = (): Output => hand;
`,
  );
  expect(project.getPreEmitDiagnostics()).toEqual([]);
  const answers = read(source, source.getDescendants().flatMap(shapeAssociationSites));
  expect(answers.map((answer) => (answer.kind === "associated" ? [answer.kind, answer.value.production.getName()] : answer))).toEqual([
    ["associated", "Owner"],
    expect.objectContaining({ kind: "unknown", reason: "the boundary has no supported whole named production type" }),
    expect.objectContaining({ kind: "unknown", reason: "the boundary has no supported whole named production type" }),
    expect.objectContaining({ kind: "unknown", reason: "the boundary has no supported whole named production type" }),
    ["associated", "Owner"],
    ["associated", "Owner"],
  ]);
});

test("derived declarations remain derived and unsupported boundary types stay distinct from unrelated declarations", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  project.createSourceFile("/production/owner.ts", "export interface Owner { value: string }");
  const source = project.createSourceFile(
    "/tests/support.ts",
    `
import type { Owner } from "../production/owner";
interface Hand { value: string }
interface Derived extends Owner {}
type Picked = Pick<Owner, "value">;
type Indexed = { owner: Owner }["owner"];
declare const hand: Hand;
declare const derived: Derived;
declare const picked: Picked;
declare const indexed: Indexed;
declare const direct: Pick<Owner, "value">;
const local: Hand = hand;
const first: Owner = derived;
const second: Owner = picked;
const third: Owner = indexed;
const fourth: Owner = direct;
const ambiguous: Owner | null = hand;
declare function opaque(value: unknown): void;
opaque(hand);
missing(hand);
`,
  );
  const answers = read(source, source.getDescendants().flatMap(shapeAssociationSites));
  // A wrapper is walked through its own alias arguments; a local alias over it hides them and stays UNKNOWN.
  expect(answers).toEqual([
    { kind: "unassociated" },
    { kind: "unassociated" },
    { kind: "unknown", reason: SHAPE_ASSOCIATION_UNKNOWN.opaqueValue },
    { kind: "unassociated" },
    { kind: "unassociated" },
    { kind: "unknown", reason: SHAPE_ASSOCIATION_UNKNOWN.unsupportedBoundary },
    { kind: "unknown", reason: SHAPE_ASSOCIATION_UNKNOWN.unsupportedBoundary },
    { kind: "unknown", reason: SHAPE_ASSOCIATION_UNKNOWN.unresolvedParameter },
  ]);
});

test("a union value is judged by its constituents and an erased value only where a production owner could exist", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  project.createSourceFile("/production/owner.ts", "export interface Owner { value: string }");
  project.createSourceFile("/other/local.ts", "export interface Other { value: string }");
  const source = project.createSourceFile(
    "/tests/support.ts",
    `
import type { Owner } from "../production/owner";
import type { Other } from "../other/local";
interface Hand { value: string }
declare const flag: boolean;
declare const label: string | undefined;
declare const owner: Owner | null;
declare const maybe: Hand | undefined;
declare const loose: any;
declare function take(value: boolean): void;
take(flag);
const named: string | undefined = label;
const nullable: Owner | null = owner;
const carried: Owner | undefined = maybe;
const local: Other = loose;
const erased: Owner = loose;
`,
  );
  expect(project.getPreEmitDiagnostics()).toEqual([]);
  const answers = read(source, source.getDescendants().flatMap(shapeAssociationSites));
  expect(answers).toEqual([
    { kind: "unassociated" },
    { kind: "unassociated" },
    { kind: "unassociated" },
    { kind: "unknown", reason: SHAPE_ASSOCIATION_UNKNOWN.unionHand },
    { kind: "unassociated" },
    { kind: "unknown", reason: SHAPE_ASSOCIATION_UNKNOWN.erasedValue },
  ]);
});

test("missing demanded native evidence refuses instead of turning an association into an unrelated shape", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/production/owner.ts", "export interface Owner { value: string }");
  const source = project.createSourceFile(
    "/tests/support.ts",
    'import type { Owner } from "../production/owner"; interface Hand {value:string} declare const hand:Hand; const seen:Owner=hand;',
  );
  const sites = source.getDescendants().flatMap(shapeAssociationSites);
  const site = sites[0];
  if (site === undefined) {
    throw new Error("the control has no direct boundary");
  }
  const facts = capture(source, sites);
  const readers = readTypeObservations(facts);
  expect(() =>
    readShapeAssociation(
      { ...site, value: source.getVariableDeclarationOrThrow("hand").getNameNode().asKindOrThrow(SyntaxKind.Identifier) },
      readers,
      () => true,
      () => true,
    ),
  ).toThrow("not captured");
  expect(() => readTypeObservations({ ...facts, selections: null })).toThrow("selectors");
});
