// The native checker's decision on planted worlds: a mutant fails by its own file's errors, and by an importer's
// errors only when it changed the file's declaration, the one surface an importer reads.
import { join } from "node:path";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { MutantEdit } from "../../../tooling/src/mutation-checker/index.ts";
import { MutantWorld } from "../../../tooling/src/mutation-checker/index.ts";

const WORLD = "tsconfig.json";
const LIB = "src/lib.ts";
const MID = "src/mid.ts";
const APP = "src/app.ts";

const LIB_TEXT = ["export function make(start: number) {", "  return { count: start + 1 };", "}"].join("\n");

const TREE = {
  [WORLD]: plantedTsconfig({ lib: ["ESNext"] }),
  [LIB]: LIB_TEXT,
  // Two hops from the mutated file: the middle file only forwards the inferred shape, so only the last one breaks.
  [MID]: ['import { make } from "./lib.ts";', "export const made = make(1);"].join("\n"),
  [APP]: ['import { made } from "./mid.ts";', "export const shown = made.count.toFixed(2);"].join("\n"),
};

// Stryker's zero-based line and column of the first `find` in the planted lib file.
function edit(root: string, find: string, replacement: string): MutantEdit {
  const at = LIB_TEXT.indexOf(find);
  const before = LIB_TEXT.slice(0, at).split("\n");
  const line = before.length - 1;
  const column = before.at(-1)?.length ?? 0;
  return { fileName: join(root, LIB), replacement, location: { start: { line, column }, end: { line, column: column + find.length } } };
}

test("a mutant that keeps its file and declaration whole passes after reading only its own file", async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  using world = MutantWorld.open(root, WORLD);
  const verdict = world.judge(edit(root, "start + 1", "start - 1"));
  expect(verdict).toEqual({ errors: [], checked: [join(root, LIB)] });
});

test("a mutant with a type error in its own file fails on that file alone", async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  using world = MutantWorld.open(root, WORLD);
  const verdict = world.judge(edit(root, "start + 1", "start.length"));
  expect(verdict.checked).toEqual([join(root, LIB)]);
  expect(verdict.errors.map(({ fileName }) => fileName)).toEqual([join(root, LIB)]);
});

test("a mutant that changes its declaration fails on the importer it breaks, two imports away", async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  using world = MutantWorld.open(root, WORLD);
  const verdict = world.judge(edit(root, "start + 1", "String(start)"));
  expect(new Set(verdict.checked)).toEqual(new Set([LIB, MID, APP].map((file) => join(root, file))));
  expect(verdict.errors.map(({ fileName }) => fileName)).toEqual([join(root, APP)]);
});

// Neither reader imports the mutated file: each reads the shape it augments through a global, or through the module it augments.
const FLAGS = "src/flags.ts";
const HOST = "src/host.ts";
const READER = "src/reader.ts";
const FLAGS_VALUE = "{ dark: true }";
const augmenting = (augmentation: readonly string[]): string => [`export const FLAGS = ${FLAGS_VALUE};`, ...augmentation].join("\n");
const AUGMENTED_WORLDS = [
  {
    name: "a global",
    flags: augmenting(["declare global {", "  interface OrbFlags {", "    readonly current: typeof FLAGS;", "  }", "}"]),
    reader: "export const dark = (flags: OrbFlags): boolean => flags.current.dark;",
  },
  {
    name: "a module",
    flags: augmenting(['declare module "./host.ts" {', "  interface HostShape {", "    readonly current: typeof FLAGS;", "  }", "}"]),
    reader: ['import type { HostShape } from "./host.ts";', "export const dark = (host: HostShape): boolean => host.current.dark;"].join("\n"),
  },
] as const;

test.for(AUGMENTED_WORLDS)("a mutant whose break shows only through $name it augments fails on the reader", async ({ flags, reader }, { plantedTree }) => {
  const root = await plantedTree({ [WORLD]: plantedTsconfig({ lib: ["ESNext"] }), [FLAGS]: flags, [HOST]: "export interface HostShape {}", [READER]: reader });
  using world = MutantWorld.open(root, WORLD);
  const before = flags.slice(0, flags.indexOf(FLAGS_VALUE)).split("\n");
  const start = { line: before.length - 1, column: before.at(-1)?.length ?? 0 };
  const verdict = world.judge({
    fileName: join(root, FLAGS),
    replacement: "{}",
    location: { start, end: { ...start, column: start.column + FLAGS_VALUE.length } },
  });
  expect(verdict.errors.map(({ fileName }) => fileName)).toEqual([join(root, READER)]);
});

test("a mutant outside the world's program passes unread", async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  using world = MutantWorld.open(root, WORLD);
  expect(world.judge({ ...edit(root, "start + 1", "start.length"), fileName: join(root, "elsewhere.ts") })).toEqual({ errors: [], checked: [] });
});
