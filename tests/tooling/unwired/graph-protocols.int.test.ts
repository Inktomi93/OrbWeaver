// Members the runtime calls by their well-known name: toJSON, coercion, await's then, using's dispose, for-of's
// iterators and node:util's inspect hook. A class or a literal carrying one needs no lib heritage for it to count.
import { expect, test } from "@orb/testkit/tooling";
import { MEMBER_BUCKETS } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphScan, labelsIn } from "./_planted.ts";

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
  });
});
