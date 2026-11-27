// Slots the unions scan reads through tooling/src/unwired/graph/union-slots.ts, each case with a twin member no producer
// builds, which keeps reporting.
import { expect, test } from "@orb/testkit/tooling";
import { unionsGraph } from "../../../tooling/src/unwired/index.ts";
import { graphTree } from "./_planted.ts";

const rows = async (plantedTree: (tree: Record<string, string>) => Promise<string>, files: Readonly<Record<string, string>>): Promise<readonly string[]> =>
  (await unionsGraph(await plantedTree(graphTree(files)), { deliberate: [], judged: [] }, () => undefined)).unwired
    .map(({ home, member }) => `${home}.${member}`)
    .toSorted();

// A package that augments the global Map and ReadonlyMap, as ts-reset does from node_modules, leaves them lib types:
// the annotation `ReadonlyMap<unknown, Cause>` is read, so the Map's entry builds `deadline`.
const AUGMENTED_MAP_TREE = {
  "node_modules/reset/package.json": JSON.stringify({ name: "reset", types: "index.d.ts" }),
  "node_modules/reset/index.d.ts": [
    "interface Map<K, V> {",
    "  has(value: K | (K & {})): boolean;",
    "}",
    "interface ReadonlyMap<K, V> {",
    "  has(value: K | (K & {})): boolean;",
    "}",
  ].join("\n"),
  "packages/a/src/reset.d.ts": 'import "reset";',
  "packages/a/src/causes.ts": [
    'const CAUSES = ["deadline", "budget", "compile"] as const;',
    "export type Cause = (typeof CAUSES)[number];",
    'const DEADLINE_CODE = "ERR_TIMEOUT";',
    'const CAUSE_BY_CODE: ReadonlyMap<unknown, Cause> = new Map([[DEADLINE_CODE, "deadline"]]);',
    'export const causeOf = (code: unknown): Cause => CAUSE_BY_CODE.get(code) ?? "compile";',
  ].join("\n"),
};

test("a Map an augmented library interface annotates still credits the tuple its type arguments trace to", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(await rows(plantedTree, AUGMENTED_MAP_TREE)).toEqual(["CAUSES.budget"]);
});

// A literal type argument the checker holds to a constraint spelled from the tuple: `Header<"train">` instantiates
// `R extends Reach`, so `{ reach: "train" }` builds Reach's `train`. `card` is the twin no one builds.
const TYPE_ARGUMENT_TREE = {
  "packages/a/src/reach.ts": [
    'const REACHES = ["card", "train", "none"] as const;',
    "export type Reach = (typeof REACHES)[number];",
    "export interface Header<R extends Reach = Reach> { readonly reach: R }",
    'export const TRAIN: Header<"train"> = { reach: "train" };',
    'export const NONE: Header = { reach: "none" };',
  ].join("\n"),
};

test("a literal type argument a tuple-spelled constraint checks builds the member it instantiates", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(await rows(plantedTree, TYPE_ARGUMENT_TREE)).toEqual(["REACHES.card"]);
});

// A switch on an unannotated const copy (`const code = warning.code`) of an object vocabulary's value hands each label on
// into a tuple's slot: a label the producer builds in that vocabulary (`{ code: "effort_dropped" }`) builds the tuple's
// member. `display_dropped` is the twin no producer builds.
const OBJECT_VOCABULARY_TREE = {
  "packages/a/src/warnings.ts": [
    'export const CODE = { effortDropped: "effort_dropped", displayDropped: "display_dropped" } as const;',
    "export type WarningCode = (typeof CODE)[keyof typeof CODE];",
    "export interface Warning { readonly code: WarningCode }",
    'export const warn = (): Warning => ({ code: "effort_dropped" });',
  ].join("\n"),
  "packages/a/src/adjust.ts": [
    'import { CODE, type Warning } from "./warnings.ts";',
    "const ADJUSTMENTS = [CODE.effortDropped, CODE.displayDropped] as const;",
    "type Adjustment = (typeof ADJUSTMENTS)[number];",
    "export interface Notice { readonly adjustment: Adjustment }",
    "export function toNotice(warning: Warning): Notice {",
    "  const code = warning.code;",
    "  switch (code) {",
    '    case "effort_dropped":',
    '    case "display_dropped":',
    "      return { adjustment: code };",
    "  }",
    "}",
  ].join("\n"),
};

test("a switch label handed on from an object vocabulary builds the member that vocabulary's producers build", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  expect(await rows(plantedTree, OBJECT_VOCABULARY_TREE)).toEqual(["ADJUSTMENTS.display_dropped"]);
});
