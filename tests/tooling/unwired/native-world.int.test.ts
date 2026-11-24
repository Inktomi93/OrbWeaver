// The 7.1 API session the graph and brand-flow open: a repeated request crosses to the compiler once, a request generator
// cannot run a batch of its own, and each file is homed in one world.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { Node } from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { API } from "@typescript/native/sync";
import { vi } from "vitest";
import { homeFiles, NativeWorld } from "../../../tooling/src/unwired/native.ts";
import { LIB, WORLD } from "./_planted.ts";

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
