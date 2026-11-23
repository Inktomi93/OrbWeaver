// Read and write forms the fields query must link: each found case has a truly dead twin beside it that stays reported.
import { expect, test } from "@orb/testkit/tooling";
import { fieldRows, fieldsScan, GRAPH_SOURCE, ZOD_MODULE } from "./_planted.ts";

// The value meets only the constraint's members inside the generic body: at the call, `Room` infers to the argument's
// own type, so only a link from that type to the constraint carries the read back.
const CONSTRAINT = {
  [`${GRAPH_SOURCE}/hearth.ts`]: [
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
  const report = await fieldsScan(plantedTree, CONSTRAINT);
  expect(fieldRows(report.unwired, "hearth.ts")).toEqual(["Lonely.id never-read", "Lonely.stamp never-read", "Summary.dead never-read"]);
});

// An anonymous constraint, and a row key typed by a type parameter whose constraint is a union of names: the callers
// narrow the key, so a name no call passes stays unread.
const GENERIC_ROW = {
  [`${GRAPH_SOURCE}/lanes.ts`]: [
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
  const report = await fieldsScan(plantedTree, GENERIC_ROW);
  expect(fieldRows(report.unwired, "lanes.ts")).toEqual(["Keyed.second never-read", "Keyed.spare never-read", "Row.dead never-read"]);
});

// A spread into a typed literal links the nested object too: `patch.title` is read through the params twin, and each
// twin's own nested `stale` is judged where nothing reads it.
const NESTED_TWIN = {
  [`${GRAPH_SOURCE}/twin.ts`]: [
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
  const report = await fieldsScan(plantedTree, NESTED_TWIN);
  expect(fieldRows(report.unwired, "twin.ts")).toEqual([
    "Input.patch.stale never-read",
    "Orphan.id never-read",
    "Orphan.patch never-read",
    "Orphan.patch.title never-read",
    "Params.patch.stale never-read",
  ]);
});

// `"key" in value` narrows by the property of that name: a key use, which reads no value, so the narrowed read is the
// one that counts and the tested member itself stays unread.
const IN_CHECK = {
  [`${GRAPH_SOURCE}/frames.ts`]: [
    "export interface Frame { readonly kind: string; readonly payload: string }",
    "export interface Fault { readonly __fault: true; readonly code: string; readonly spare: string }",
    "export const route = (frame: Frame | Fault): string => ('__fault' in frame ? frame.code : frame.payload);",
    "export const fault: Fault = { __fault: true, code: 'c', spare: 's' };",
    "export const frame: Frame = { kind: 'k', payload: 'p' };",
    "export const routed = route(fault) + route(frame);",
  ].join("\n"),
};

test("an in check narrows the value and reads no member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, IN_CHECK);
  expect(fieldRows(report.unwired, "frames.ts")).toEqual(["Fault.__fault never-read", "Fault.spare never-read", "Frame.kind never-read"]);
});

// A server codec re-declares a contract key under a stricter schema with `.extend({ key })`: the override is the same wire
// field, so a read through it reads the base key. `dropped`, written and never read through either, stays reported.
const EXTENDED = {
  ...ZOD_MODULE,
  [`${GRAPH_SOURCE}/wire.ts`]: [
    'import { z } from "zod";',
    "export const viewSchema = z.object({ role: z.string(), name: z.string(), dropped: z.string() });",
  ].join("\n"),
  [`${GRAPH_SOURCE}/codec.ts`]: [
    'import { z } from "zod";',
    'import { viewSchema as wireViewSchema } from "./wire.ts";',
    "export const viewSchema = wireViewSchema.extend({ role: z.string() });",
    "type View = z.infer<typeof viewSchema>;",
    'export const made: View = { role: "r", name: "n", dropped: "d" };',
    "export const shown = (view: View): string => view.role + view.name;",
  ].join("\n"),
};

test("a key an extend call re-declares reads and writes as the base schema's key", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, EXTENDED);
  expect(fieldRows(report.unwired, "wire.ts")).toEqual(["viewSchema.dropped never-read"]);
});

// A schema checked against a mapped re-keying of a type, `{ [K in keyof T]?: T[K] }`, mirrors `T`: its keys are `T`'s
// members. `spare`, which production writes and never reads, stays reported.
const REKEYED = {
  ...ZOD_MODULE,
  [`${GRAPH_SOURCE}/meta.ts`]: [
    'import { z } from "zod";',
    "export interface Meta { readonly title: string; readonly spare: string }",
    "export const metaSchema = z.object({ title: z.string(), spare: z.string() }) satisfies z.ZodType<{ [K in keyof Meta]?: Meta[K] }>;",
    'export const made: Meta = { title: "t", spare: "s" };',
    "export const shown = (meta: Meta): string => meta.title;",
  ].join("\n"),
};

test("a schema checked against a mapped re-keying of a type mirrors that type's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, REKEYED);
  expect(fieldRows(report.unwired, "meta.ts")).toEqual(["Meta.spare never-read"]);
});

// An extended schema checked against a type of its own is another endpoint's shape: its keys mirror that type, so a read
// through it never reads the base's key. `Fields.character` is read only through the copy schema's parsed value and
// stays reported.
const EXTENDED_OTHER = {
  ...ZOD_MODULE,
  [`${GRAPH_SOURCE}/fields.ts`]: [
    'import { z } from "zod";',
    "export interface Fields { readonly applied: string; readonly character: string }",
    "export const fieldsSchema = z.object({ applied: z.string(), character: z.string() }) satisfies z.ZodType<Fields>;",
  ].join("\n"),
  [`${GRAPH_SOURCE}/copy.ts`]: [
    'import { z } from "zod";',
    'import { fieldsSchema } from "./fields.ts";',
    "export interface Copy { readonly applied: string; readonly character: string }",
    "export const copySchema = fieldsSchema.extend({ character: z.string() }) satisfies z.ZodType<Copy>;",
  ].join("\n"),
  [`${GRAPH_SOURCE}/use.ts`]: [
    'import type { Copy } from "./copy.ts";',
    'import type { copySchema } from "./copy.ts";',
    'import type { Fields } from "./fields.ts";',
    'import type { z } from "zod";',
    'export const fields: Fields = { applied: "a", character: "c" };',
    'export const copy: Copy = { applied: "a", character: "c" };',
    "export const appliedOf = (result: Fields): string => result.applied;",
    "export const copied = (result: z.infer<typeof copySchema>): string => result.applied + result.character;",
  ].join("\n"),
};

test("a key of an extended schema checked against its own type does not read the base's key", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, EXTENDED_OTHER);
  expect(fieldRows(report.unwired, "fields.ts")).toEqual(["Fields.character never-read"]);
});
