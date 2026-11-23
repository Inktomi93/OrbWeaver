// Reads that reach a member through a key, a twin or a flow: a lookup keyed by a parameter reads what its callers pass,
// a zod schema's keys are its satisfied type's members (an inline union's arms and an `extend` literal's too), a function
// filling a function slot pairs its parameters, and a JSX attribute's value fills the prop it is handed to.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, JSX_NAMESPACE, labelsIn, ZOD_MODULE } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/keys.ts`;
const JSX_FILE = `${GRAPH_SOURCE}/select.tsx`;
const source = (lines: readonly string[]): Record<string, string> => ({ [FILE]: lines.join("\n") });
const bare = (labels: readonly string[]): readonly string[] => labels.map((label) => label.split("  ")[0] ?? label);

test("a lookup keyed by a parameter reads the keys its callers pass, through a caller that hands its own on", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Labels { readonly a: string; readonly b: string; readonly c: string }",
      "declare const LABELS: Labels;",
      "const label = (key: keyof Labels): string => LABELS[key];",
      "const forward = (key: keyof Labels): string => label(key);",
      'export const shown = (): string => forward("a") + label("b");',
    ]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Labels.c"]);
});

test("a zod schema's keys are the members of the type it satisfies", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface User { readonly name: string; readonly age: number }",
      "export const userSchema = z.strictObject({ name: z.string(), age: z.number() }) satisfies z.ZodType<User>;",
      "export const nameOf = (user: z.infer<typeof userSchema>): string => user.name;",
    ]),
  });
  // a schema key names a member of the parsed value and writes none, so the twin's unread member is untouched
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["User.age"]);
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual([]);
});

test("an inline union schema twins each arm's keys with the union's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      'export interface A { readonly kind: "a"; readonly left: string }',
      'export interface B { readonly kind: "b"; readonly right: string }',
      "export const eitherSchema = z.union([z.strictObject({ kind: z.string(), left: z.string() }), z.strictObject({ kind: z.string(), right: z.string() })]) satisfies z.ZodType<A | B>;",
      'export const leftOf = (value: z.infer<typeof eitherSchema>): string => ("left" in value ? value.left : value.kind);',
    ]),
  });
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["B.right"]);
});

test("an extended schema twins its extend literal's keys with the type it satisfies", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Base { readonly id: string }",
      "export interface View extends Base { readonly count: number; readonly hidden: number }",
      "export const baseSchema = z.strictObject({ id: z.string() }) satisfies z.ZodType<Base>;",
      "export const viewSchema = baseSchema.extend({ count: z.number(), hidden: z.number() }) satisfies z.ZodType<View>;",
      "export const countOf = (view: z.infer<typeof viewSchema>): number => view.count;",
    ]),
  });
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["Base.id", "View.hidden"]);
});

// The twin is zod's: a type of the same name declared anywhere else spells a satisfies check and twins nothing.
test("a satisfies reference twins only through zod's ZodType, never a local type of that name", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      'import type { ZodType as Imported } from "zod";',
      "type ZodType<T> = { readonly _output: T };",
      "export interface Twinned { readonly count: number; readonly hidden: number }",
      "export interface Aliased { readonly count: number; readonly hidden: number }",
      "export interface Local { readonly count: number; readonly hidden: number }",
      "export const twinnedSchema = z.strictObject({ count: z.number(), hidden: z.number() }) satisfies z.ZodType<Twinned>;",
      "export const aliasedSchema = z.strictObject({ count: z.number(), hidden: z.number() }) satisfies Imported<Aliased>;",
      "export const localSchema = z.strictObject({ count: z.number(), hidden: z.number() }) satisfies ZodType<Local>;",
      "export const counts = (a: z.infer<typeof twinnedSchema>, b: z.infer<typeof aliasedSchema>, c: z.infer<typeof localSchema>): number => a.count + b.count + c.count;",
    ]),
  });
  // a twinned key is judged at its type, so the twin's read of `count` reaches it; the local check twins nothing, so its
  // read lands on the schema key and the type's members stay untouched
  expect({ untouched: bare(labelsIn(scan, "member-untouched", FILE)), validated: bare(labelsIn(scan, "member-validated", FILE)) }).toEqual({
    untouched: ["ZodType._output", "Twinned.hidden", "Aliased.hidden", "Local.count", "Local.hidden"],
    validated: ["localSchema.hidden"],
  });
});

test("a value a schema validates is sent to no receiver; a default the schema returns fills its output", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Row { readonly name: string; readonly spare: string }",
      "export interface Fallback { readonly name: string; readonly unused: string }",
      'const FALLBACK: Fallback = { name: "anon", unused: "x" };',
      "export const rowSchema = z.strictObject({ name: z.string() }).default(FALLBACK);",
      "export const nameOf = (row: Row): string => rowSchema.parse(row).name;",
    ]),
  });
  // parse takes unknown, so a hand-off would send Row whole; the default's name is read through the output it fills
  expect(bare(labelsIn(scan, "member-sent-only", FILE))).toEqual([]);
  expect(bare(labelsIn(scan, "member-untouched", FILE))).toEqual(["Row.name", "Row.spare"]);
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["Fallback.unused"]);
});

// The flows ruling: every call zod declares takes its arguments as schema input, so no argument is sent to a receiver,
// whether a validator takes it, a builder takes its options or a refinement takes its check and options.
test("no argument of any zod call is a send", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...ZOD_MODULE,
    ...source([
      'import { z } from "zod";',
      "export interface Row { readonly name: string; readonly spare: string }",
      "export interface BuildOptions { readonly error: string; readonly spare: number }",
      "export interface RefineOptions { readonly error: string; readonly spare: number }",
      'const BUILD: BuildOptions = { error: "bad", spare: 1 };',
      'const REFINE: RefineOptions = { error: "short", spare: 2 };',
      "export const rowSchema = z.strictObject({ name: z.string() }, BUILD).refine((row) => row.name.length > 0, REFINE);",
      "export const valid = (row: Row): boolean => rowSchema.safeParse(row).success;",
    ]),
  });
  expect({
    sent: bare(labelsIn(scan, "member-sent-only", FILE)),
    untouched: bare(labelsIn(scan, "member-untouched", FILE)),
    written: bare(labelsIn(scan, "member-write-only", FILE)),
  }).toEqual({
    sent: [],
    untouched: ["Row.name", "Row.spare"],
    written: ["BuildOptions.error", "BuildOptions.spare", "RefineOptions.error", "RefineOptions.spare"],
  });
});

// A row spread into a fresh literal and carried through a library generic still fills the typed slot it lands in.
test("a spread row a generic carries into a typed slot fills that slot's members", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Plan { readonly seats: ReadonlyMap<string, readonly { readonly chatId: string; readonly forked: boolean }[]> }",
      "declare function all<T>(): T[];",
      "export function plan(): Plan {",
      "  const rows = all<{ cid: string; chatId: string; forked: number; spare: number }>();",
      "  const seats = Map.groupBy(rows.map((row) => ({ ...row, forked: row.forked === 1 })), (row) => row.cid);",
      "  return { seats };",
      "}",
    ]),
  );
  // the seat's chatId has no reader, and the row's chatId deletes with it, so the slot holds the one row; the row's spare
  // fills no slot, and the spread literal's own forked writes the seat's (the plan itself is returned to no reader)
  expect({ untouched: labelsIn(scan, "member-untouched", FILE), written: labelsIn(scan, "member-write-only", FILE) }).toEqual({
    untouched: ["Plan.seats.chatId", "plan.rows.spare"],
    written: ["Plan.seats", "Plan.seats.forked"],
  });
});

test("a function filling a function slot pairs its parameter with the slot's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Event { readonly id: string; readonly extra: string }",
      "export interface Handlers { readonly on: (event: Event) => void }",
      "export interface Mine { readonly id: string; readonly other: string }",
      "const handle = (mine: Mine): void => void mine.id;",
      "export const handlers: Handlers = { on: handle };",
    ]),
  );
  expect(labelsIn(scan, "member-untouched", FILE)).toEqual(["Event.extra", "Mine.other"]);
});

test("a JSX attribute's value fills the prop it is handed to", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    {
      [JSX_FILE]: [
        JSX_NAMESPACE,
        "export interface Option { readonly value: string; readonly label: string }",
        "export interface SelectProps { readonly items: readonly Option[] }",
        "const Select = (props: SelectProps): JSX.Element => <ul>{props.items.map((item) => item.label)}</ul>;",
        "export interface Entry { readonly value: string; readonly label: string; readonly note: string }",
        "declare const ITEMS: readonly Entry[];",
        "export const page = (): JSX.Element => <Select items={ITEMS} />;",
      ].join("\n"),
    },
    { jsx: true },
  );
  // Entry.value fills Option.value, which requires it: the one row is the prop's, and the two delete together
  expect(labelsIn(scan, "member-untouched", JSX_FILE)).toEqual(["Option.value", "Entry.note"]);
});
