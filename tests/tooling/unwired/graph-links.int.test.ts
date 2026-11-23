// Uses no name joins to the member it uses: a member or binding typed `Owner["m"]`, an overload's parameter beside its
// implementation's, a class member that implements an interface member, and a literal a `satisfies` holds to a string-
// indexed type. Each found case has an unused sibling beside it as its control.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/links.ts`;
const source = (lines: readonly string[]): Record<string, string> => ({ [FILE]: lines.join("\n") });
// A member label without the note a write-only row carries.
const members = (labels: readonly string[]): readonly string[] => labels.map((label) => label.split("\t")[0] ?? label).toSorted();

test("a member typed by another member's indexed type reads that member where it is read", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Service { readonly viaIndex: () => number; readonly viaDeadIndex: () => number }",
      "export const service: Service = { viaIndex: () => 1, viaDeadIndex: () => 2 };",
      'export interface IndexedPort { readonly viaIndex: Service["viaIndex"]; readonly viaDeadIndex: Service["viaDeadIndex"] }',
      "export const run = (port: IndexedPort): number => port.viaIndex();",
    ]),
  );
  expect(members(labelsIn(scan, "member-write-only", FILE))).toEqual(["Service.viaDeadIndex"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["IndexedPort.viaDeadIndex"]);
});

// A composition root builds a verb once, puts it in the service and hands it to a sibling through a parameter typed
// by the member. The annotation alone credits nothing: a binding handed an unrelated value reads no member.
test("a binding typed by a member reads it only when the value it holds is the member's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Verbs {",
      "  readonly bundle: (name: string) => number;",
      "  readonly file: (name: string) => number;",
      "  readonly spareVerb: (name: string) => number;",
      "  readonly ghost: (name: string) => number;",
      "  readonly held: (name: string) => number;",
      "  readonly inited: (name: string) => number;",
      "}",
      'export function createFile(bundle: Verbs["bundle"], _spare: Verbs["spareVerb"]): Verbs["file"] {',
      "  return (name) => bundle(name);",
      "}",
      "const initedVerb = (): number => 2;",
      'const bound: Verbs["inited"] = initedVerb;',
      'export const boundRan = bound("v");',
      "export function createVerbs(): Verbs {",
      "  const bundle = (name: string): number => name.length;",
      "  const spareVerb = (): number => 0;",
      "  const held = (): number => 1;",
      "  return { bundle, file: createFile(bundle, spareVerb), spareVerb, ghost: () => 9, held, inited: initedVerb };",
      "}",
      'export const filed = createVerbs().file("x");',
      'export function runWith(fn: Verbs["ghost"]): number {',
      '  return fn("y");',
      "}",
      "export const ran = runWith(() => 7);",
      'const local: Verbs["ghost"] = () => 8;',
      'export const localRan = local("z");',
      "const heldVerb = (): number => 1;",
      'const copy: Verbs["held"] = heldVerb;',
      'export const copied = copy("w");',
    ]),
  );
  expect(members(labelsIn(scan, "member-write-only", FILE))).toEqual(["Verbs.ghost", "Verbs.held", "Verbs.spareVerb"]);
});

test("an overload's parameter members pair with the implementation's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface PublicProps { readonly save?: () => number; readonly spare?: () => number; }",
      "interface ImplProps { readonly save?: () => number; readonly spare?: () => number; }",
      "export function makeBoundary(): (props: PublicProps) => number;",
      "export function makeBoundary(): (props: ImplProps) => number {",
      "  return (props) => props.save?.() ?? 0;",
      "}",
      "export const bounded = makeBoundary()({ save: () => 1, spare: () => 2 });",
    ]),
  );
  expect(members(labelsIn(scan, "member-write-only", FILE))).toEqual(["ImplProps.spare", "PublicProps.spare"]);
});

test("a class member that implements an interface member supplies it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Clock { implementedOnly(): number; unimplemented?(): number }",
      "export class SystemClock implements Clock {",
      "  implementedOnly(): number {",
      "    return 0;",
      "  }",
      "}",
      "export const clock: Clock = new SystemClock();",
    ]),
  );
  expect(members(labelsIn(scan, "member-write-only", FILE))).toEqual(["Clock.implementedOnly"]);
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Clock.unimplemented"]);
});

test("a literal a satisfies holds to a string-indexed type is read through the index type's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Copy { readonly title: () => string; readonly unusedLine: () => string; }",
      'export const COPY = { a: { title: () => "t", unusedLine: () => "u" } } satisfies Record<string, Copy>;',
      "export const shownTitle = COPY.a.title();",
    ]),
  );
  expect(members(labelsIn(scan, "member-write-only", FILE))).toEqual(["Copy.unusedLine"]);
});
