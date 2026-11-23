// `constructionWrites` reads a world's writes for the optional inventory. Spreads repeat across a large world, so a
// repeated shape costs one lookup, and the compiler rounds stay flat as a type widens. The world's batches answer a
// repeated request once.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { Node } from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { API } from "@typescript/native/sync";
import { vi } from "vitest";
import { homeFiles, NativeWorld } from "../../../tooling/src/unwired/native.ts";
import { constructionWrites } from "../../../tooling/src/unwired/occurrences.ts";
import { LIB, WORLD } from "./_planted.ts";

const everyFile = (world: NativeWorld): ReadonlySet<string> => new Set(world.files.map((file) => world.siteOf(file).file));

const SPREADS = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/spreads.ts": [
    "export interface Source { readonly title: string }",
    "export interface Other { readonly name: string }",
    "export interface Target { readonly title: string; readonly name: string }",
    'const source: Source = { title: "t" };',
    'const other: Other = { name: "n" };',
    "export const first: Target = { ...source, ...other };",
    "export const second: Target = { ...source, ...other };",
    "export const third: Target = { ...source, ...other };",
    "export const titled = first.title + second.name;",
  ].join("\n"),
};

test("one value and target shape is reflected once, and each differing shape on its own", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(SPREADS);
  using world = NativeWorld.open(root, WORLD);
  const properties = vi.spyOn(world.checker.getPropertiesOfType, "gen");
  constructionWrites(world, everyFile(world));
  // Three sites spread two shapes: each shape is reflected once and compared with its target once, not once per site.
  expect(properties).toHaveBeenCalledTimes(4);
});

test("a request repeated in one round or a later batch crosses to the compiler once", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(SPREADS);
  using world = NativeWorld.open(root, WORLD);
  const [file] = world.files;
  const node = file?.statements[0] as Node;
  const sent = vi.spyOn(API.prototype, "batch");
  const ask = (): APIRequestGenerator<Type> => world.checker.getTypeAtLocation.gen(node);
  const [first, second] = world.batch([ask(), ask()]);
  const [later] = world.batch([ask()]);
  expect(sent.mock.calls.flat()).toHaveLength(1);
  expect(second?.id).toBe(first?.id);
  expect(later?.id).toBe(first?.id);
  sent.mockRestore();
});

test("a request generator that runs a batch of its own is refused, and the outer batch still settles", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(SPREADS);
  using world = NativeWorld.open(root, WORLD);
  const node = world.files[0]?.statements[0] as Node;
  function* nested(): APIRequestGenerator<Type> {
    world.batch([world.checker.getTypeAtLocation.gen(node)]);
    return yield* world.checker.getTypeAtLocation.gen(node);
  }
  function* releasing(): APIRequestGenerator<Type> {
    world.releaseAnswers();
    return yield* world.checker.getTypeAtLocation.gen(node);
  }
  expect(() => world.batch([nested()])).toThrow(/NativeWorld\.batch ran inside a request generator/u);
  expect(() => world.batch([releasing()])).toThrow(/NativeWorld\.releaseAnswers ran inside a request generator/u);
  // positive control: the same ask from outside a generator settles once the refusal has unwound
  expect(world.batch([world.checker.getTypeAtLocation.gen(node)])[0]?.id).toEqual(expect.any(Number));
});

test("the wider a type, the same number of compiler rounds", { timeout: 120_000 }, async ({ plantedTree }) => {
  const roundsFor = async (members: number): Promise<number> => {
    const names = Array.from({ length: members }, (_, at) => `m${at}: string`).join("; ");
    const root = await plantedTree({
      [WORLD]: plantedTsconfig({ lib: LIB }),
      "packages/a/src/wide.ts": [
        `export interface Wide { ${names} }`,
        `export interface Twin { ${names} }`,
        "export const hand = (wide: Wide): Twin => wide;",
        "export const spread = (wide: Wide): Twin => ({ ...wide });",
      ].join("\n"),
    });
    using world = NativeWorld.open(root, WORLD);
    const sent = vi.spyOn(API.prototype, "batch");
    constructionWrites(world, everyFile(world));
    const rounds = sent.mock.calls.length;
    sent.mockRestore();
    return rounds;
  };
  expect(await roundsFor(40)).toBe(await roundsFor(4));
});

test("each file is homed in the first world that names it a root, else the first that holds it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const worlds = ["packages/b/tsconfig.json", WORLD, "tsconfig.json"];
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/b/tsconfig.json": plantedTsconfig({ lib: LIB }),
    "tsconfig.json": plantedTsconfig({ lib: LIB, include: ["packages/*/src", "tests"] }),
    "packages/a/src/shape.ts": "export interface Shape { readonly title: string }",
    "packages/b/src/use.ts": 'import type { Shape } from "../../a/src/shape.ts";\nexport const read = (shape: Shape): string => shape.title;',
    "tests/use.test.ts": 'import type { Shape } from "../packages/a/src/shape.ts";\nexport const read = (shape: Shape): string => shape.title;',
  });
  const homes = homeFiles(worlds, NativeWorld.fileLists(root, worlds));
  expect(homes.get(WORLD)).toEqual(new Set(["packages/a/src/shape.ts"]));
  expect(homes.get("packages/b/tsconfig.json")).toEqual(new Set(["packages/b/src/use.ts"]));
  expect(homes.get("tsconfig.json")).toEqual(new Set(["tests/use.test.ts"]));
});
