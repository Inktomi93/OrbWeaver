// Members the runtime calls by their well-known name: toJSON, coercion, await's then, using's dispose, for-of's
// iterators and node:util's inspect hook. A class or a literal carrying one needs no lib heritage for it to count.
import { expect, test } from "@orb/testkit/tooling";
import { MEMBER_BUCKETS } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, labelsIn, NODE_TYPES } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/protocols.ts`;

test("a protocol member on a class or a literal counts as called; a member of another name does not", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    [FILE]: [
      "declare const inspect: { readonly custom: unique symbol };",
      "export class Money {",
      "  constructor(readonly cents: number) {}",
      "  toJSON(): number { return this.cents; }",
      "  valueOf(): number { return this.cents; }",
      '  toString(): string { return "m"; }',
      "  [Symbol.toPrimitive](): number { return 1; }",
      '  [inspect.custom](): string { return "m"; }',
      "  spare(): number { return 2; }",
      "}",
      "export class Handle { [Symbol.dispose](): void {} async [Symbol.asyncDispose](): Promise<void> {} }",
      "export const lazy = { then(done: (value: number) => void): void { done(1); }, other: 1, spare(): number { return 2; } };",
      "export const bag = { *[Symbol.iterator](): Iterator<number> { yield 1; }, async *[Symbol.asyncIterator](): AsyncIterator<number> { yield 1; }, spare(): number { return 3; } };",
      "export const shown = (): string => JSON.stringify(new Money(1)) + String(lazy.other);",
      "export const use = (): void => { using _h = new Handle(); for (const _x of bag) {} };",
    ].join("\n"),
  });
  expect(Object.fromEntries(MEMBER_BUCKETS.map((bucket) => [bucket, labelsIn(scan, bucket, FILE).map((label) => label.split("  ")[0])]))).toEqual({
    "member-write-only": [],
    "member-sent-only": ["Money.spare"],
    "member-untouched": ["lazy.spare", "bag.spare"],
    "member-read-only": [],
    "member-validated": [],
  });
});

test("a literal member that fills a library's declared member is the library's to call, and so are the reads in it", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const ring = `${GRAPH_SOURCE}/ring.ts`;
  const scan = await graphScan(plantedTree, {
    ...NODE_TYPES,
    "node_modules/@types/node/stream.d.ts": [
      'declare module "stream" {',
      "  interface WritableOptions { write?(chunk: any, encoding: string, callback: () => void): void }",
      "  class Writable { constructor(options?: WritableOptions); }",
      "}",
    ].join("\n"),
    [ring]: [
      '/// <reference path="../../../node_modules/@types/node/stream.d.ts" />',
      'import { Writable } from "stream";',
      "function ringStream(ring: string[], spare: string[]): Writable {",
      '  return new Writable({ write(chunk: string, _encoding, callback): void { ring.push(chunk); callback(); }, spare(): void { spare.push(""); } });',
      "}",
      "export function createLogger(ring: string[] | null): readonly Writable[] { return ring === null ? [] : [ringStream(ring, [])]; }",
      "createLogger([]);",
    ].join("\n"),
  });
  // spare fills no member of the options, so nothing calls it
  expect({ bindings: labelsIn(scan, "binding-read-only-by-dead", ring), untouched: labelsIn(scan, "member-untouched", ring) }).toEqual({
    bindings: [],
    untouched: ["ringStream.spare"],
  });
});
