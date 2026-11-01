// `propertyIndex` is the fields, member and params scans' engine one. Reflections and links repeat across a large
// world, so a repeated shape costs one lookup and a repeated site lands once.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { Node } from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { API } from "@typescript/native/sync";
import { vi } from "vitest";
import { homeFiles, NativeWorld } from "../../../tooling/src/unwired/native.ts";
import type { PropertyFacts } from "../../../tooling/src/unwired/occurrences.ts";
import { joinFacts, propertyFacts, propertyIndex } from "../../../tooling/src/unwired/occurrences.ts";
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

test("one value and target shape is reflected once, and each differing shape on its own", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(SPREADS);
  using world = NativeWorld.open(root, WORLD);
  const properties = vi.spyOn(world.checker.getPropertiesOfType, "gen");
  propertyIndex(world);
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
    propertyIndex(world);
    const rounds = sent.mock.calls.length;
    sent.mockRestore();
    return rounds;
  };
  expect(await roundsFor(40)).toBe(await roundsFor(4));
});

test("each file is asked in its home world alone and the joined answer equals the union of every world's", { timeout: 120_000 }, async ({ plantedTree }) => {
  const worlds = ["packages/b/tsconfig.json", WORLD, "tsconfig.json"];
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/b/tsconfig.json": plantedTsconfig({ lib: LIB }),
    "tsconfig.json": plantedTsconfig({ lib: LIB, include: ["packages/*/src", "tests"] }),
    "packages/a/src/shape.ts": "export interface Shape { readonly title: string }\nexport interface Twin { readonly title: string }",
    "packages/b/src/use.ts":
      'import type { Shape, Twin } from "../../a/src/shape.ts";\nexport const hand = (shape: Shape): Twin => shape;\nexport const read = (twin: Twin): string => twin.title;',
    "tests/use.test.ts": 'import type { Shape } from "../packages/a/src/shape.ts";\nexport const read = (shape: Shape): string => shape.title;',
  });
  const homes = homeFiles(worlds, NativeWorld.fileLists(root, worlds));
  expect(homes.get(WORLD)).toEqual(new Set(["packages/a/src/shape.ts"]));
  expect(homes.get("packages/b/tsconfig.json")).toEqual(new Set(["packages/b/src/use.ts"]));
  expect(homes.get("tsconfig.json")).toEqual(new Set(["tests/use.test.ts"]));
  const sitesPerKey = (index: ReadonlyMap<string, readonly { readonly file: string; readonly position: number }[]>, into: Map<string, Set<string>>): void => {
    for (const [key, sites] of index) {
      into.set(key, new Set([...(into.get(key) ?? []), ...sites.map(({ file, position }) => `${file}:${position}`)]));
    }
  };
  const union = new Map<string, Set<string>>();
  const facts: PropertyFacts[] = [];
  for (const config of worlds) {
    using world = NativeWorld.open(root, config);
    sitesPerKey(propertyIndex(world), union);
    facts.push(propertyFacts(world, homes.get(config)));
  }
  const homed = new Map<string, Set<string>>();
  sitesPerKey(joinFacts(facts).index, homed);
  expect(homed).toEqual(union);
});

test("a site linked more than once lands in the index once", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(SPREADS);
  using world = NativeWorld.open(root, WORLD);
  const repeated = [...propertyIndex(world).values()].filter((sites) => new Set(sites.map(({ file, position }) => `${file}:${position}`)).size < sites.length);
  expect(repeated).toEqual([]);
});
