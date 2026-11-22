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
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["User.age"]);
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
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["B.right"]);
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
  expect(bare(labelsIn(scan, "member-write-only", FILE))).toEqual(["Base.id", "View.hidden"]);
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
  expect(labelsIn(scan, "member-untouched", JSX_FILE)).toEqual(["Option.value", "Entry.value", "Entry.note"]);
});
