// Read and write forms the fields scan's engine one must link: each found case has a truly dead twin beside it that
// stays reported.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanFields } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD } from "./_planted.ts";

const scan = (root: string): ReturnType<typeof scanFields> => scanFields({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
const fieldsOf = (report: ReturnType<typeof scanFields>, file: string): string[] =>
  report.unwired
    .filter((entry) => entry.file.endsWith(file))
    .map(({ home, member, kind }) => `${home}.${member} ${kind}`)
    .toSorted();

// The value meets only the constraint's members inside the generic body: at the call, `Room` infers to the argument's
// own type, so only a link from that type to the constraint carries the read back.
const CONSTRAINT = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/hearth.ts": [
    "export interface Summary { readonly id: string; readonly stamp: number | null; readonly dead: string }",
    "export interface Candidate { readonly id: string; readonly stamp: number | null }",
    "export function split<Room extends Candidate>(items: readonly Room[]): Room | undefined {",
    "  return items.find((room) => room.stamp !== null && room.id !== '');",
    "}",
    "export const rows: readonly Summary[] = [{ id: 'a', stamp: 1, dead: 'd' }];",
    "export const hearth = split(rows);",
    // A twin nobody hands to the generic: still dead.
    "export interface Lonely { readonly id: string; readonly stamp: number | null }",
    "export const lonely: Lonely = { id: 'l', stamp: 2 };",
  ].join("\n"),
};

test("a type argument inferred at a call links to its parameter's constraint", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(CONSTRAINT));
  expect(fieldsOf(report, "hearth.ts")).toEqual(["Lonely.id never-read", "Lonely.stamp never-read", "Summary.dead never-read"]);
});

// An anonymous constraint, and a row key typed by a type parameter whose constraint is a union of names.
const GENERIC_ROW = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/lanes.ts": [
    "export interface Row { readonly lane: string; readonly dead: string }",
    "export const group = <T extends { readonly lane: string }>(items: readonly T[]): number => items.filter((item) => item.lane === 'a').length;",
    "export const rows: readonly Row[] = [{ lane: 'a', dead: 'd' }];",
    "export const grouped = group(rows);",
    "export interface Keyed { readonly first: string; readonly second: string; readonly spare: string }",
    "export const pluck = <K extends 'first' | 'second'>(row: Keyed, key: K): string => row[key];",
    "export const keyed: Keyed = { first: 'f', second: 's', spare: 'p' };",
    "export const plucked = pluck(keyed, 'first');",
  ].join("\n"),
};

test("an anonymous constraint and a key typed by a type parameter read the members they name", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(GENERIC_ROW));
  expect(fieldsOf(report, "lanes.ts")).toEqual(["Keyed.spare never-read", "Row.dead never-read"]);
});

// A spread into a typed literal links the nested object too: `patch.title` is read through the params twin.
const NESTED_TWIN = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/twin.ts": [
    "export interface Input { readonly id: string; readonly patch?: { readonly title?: string; readonly stale?: string } }",
    "export interface Params { readonly owner: string; readonly id: string; readonly patch?: { readonly title?: string | undefined; readonly stale?: string | undefined } | undefined }",
    "export const verb = (params: Params): string => params.owner + params.id + (params.patch?.title ?? '');",
    "export const route = (input: Input): string => verb({ owner: 'o', ...input });",
    "export const called = route({ id: 'i', patch: { title: 't', stale: 's' } });",
    // The same shape no production code hands to a reader: its members stay dead.
    "export interface Orphan { readonly id: string; readonly patch?: { readonly title?: string } }",
    "export const orphan: Orphan = { id: 'o', patch: { title: 't' } };",
  ].join("\n"),
};

test("a spread links the nested members of a twin type", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(NESTED_TWIN));
  expect(fieldsOf(report, "twin.ts")).toEqual([
    "Input.patch.stale never-read",
    "Orphan.id never-read",
    "Orphan.patch never-read",
    "Orphan.patch.title never-read",
  ]);
});

// `"key" in value` reads the property of that name on the value's type.
const IN_CHECK = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/frames.ts": [
    "export interface Frame { readonly kind: string; readonly payload: string }",
    "export interface Fault { readonly __fault: true; readonly code: string; readonly spare: string }",
    "export const route = (frame: Frame | Fault): string => ('__fault' in frame ? frame.code : frame.payload);",
    "export const fault: Fault = { __fault: true, code: 'c', spare: 's' };",
    "export const frame: Frame = { kind: 'k', payload: 'p' };",
    "export const routed = route(fault) + route(frame);",
  ].join("\n"),
};

test("an in check reads the property it names", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(IN_CHECK));
  expect(fieldsOf(report, "frames.ts")).toEqual(["Fault.spare never-read", "Frame.kind never-read"]);
});

// A server codec re-declares a contract key under a stricter schema with `.extend({ key })`: the override is the same wire
// field, so a read through it reads the base key. `dropped`, written and never read through either, stays reported.
const EXTENDED = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/z.ts": [
    "export interface Schema<V> { readonly value?: V }",
    "export interface ObjectSchema<T> { readonly shape: T; extend<U>(more: U): ObjectSchema<Omit<T, keyof U> & U> }",
    "const objectOf = <T>(shape: T): ObjectSchema<T> => ({ shape, extend: <U>(more: U) => objectOf({ ...shape, ...more }) as never });",
    "export type Infer<S> = S extends { readonly shape: infer T } ? { [K in keyof T]: T[K] extends Schema<infer V> ? V : never } : never;",
    "export const z = { object: <T>(shape: T): ObjectSchema<T> => objectOf(shape), string: (): Schema<string> => ({}) };",
  ].join("\n"),
  "packages/a/src/wire.ts": [
    'import { z } from "./z.ts";',
    "export const viewSchema = z.object({ role: z.string(), name: z.string(), dropped: z.string() });",
  ].join("\n"),
  "packages/a/src/codec.ts": [
    'import type { Infer } from "./z.ts";',
    'import { z } from "./z.ts";',
    'import { viewSchema as wireViewSchema } from "./wire.ts";',
    "export const viewSchema = wireViewSchema.extend({ role: z.string() });",
    "type View = Infer<typeof viewSchema>;",
    'export const made: View = { role: "r", name: "n", dropped: "d" };',
    "export const shown = (view: View): string => view.role + view.name;",
  ].join("\n"),
};

test("a key an extend call re-declares reads and writes as the base schema's key", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = scan(await plantedTree(EXTENDED));
  expect(fieldsOf(report, "wire.ts")).toEqual(["viewSchema.dropped never-read"]);
});
