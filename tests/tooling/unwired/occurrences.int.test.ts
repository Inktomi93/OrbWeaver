// `propertyIndex` is the fields, member and params scans' engine one. Reflections and links repeat across a large
// world, so a repeated shape costs one lookup and a repeated site lands once.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import type { Node } from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { API } from "@typescript/native/sync";
import { vi } from "vitest";
import { NativeWorld } from "../../../tooling/src/unwired/native.ts";
import { propertyIndex } from "../../../tooling/src/unwired/occurrences.ts";
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
  expect(properties).toHaveBeenCalledTimes(2);
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

test("a site linked more than once lands in the index once", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(SPREADS);
  using world = NativeWorld.open(root, WORLD);
  const repeated = [...propertyIndex(world).values()].filter((sites) => new Set(sites.map(({ file, position }) => `${file}:${position}`)).size < sites.length);
  expect(repeated).toEqual([]);
});
