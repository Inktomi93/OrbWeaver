// The owner rulings the site-role reader and the analysis hold (tooling/src/unwired/graph/roles.ts header, analyse.ts
// header): a bump writes and reads only where its value is used, a logical assignment reads and writes, an escape is a
// send that a flow carries on as a send, and what another world does to a member only annotates it.
import { expect, test } from "@orb/testkit/tooling";
import { GRAPH_SOURCE, graphScan, labelsIn, WORLD } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/roles.ts`;
const source = (lines: readonly string[]): Record<string, string> => ({ [FILE]: lines.join("\n") });

test("a bump whose value is discarded only writes; one whose value is used reads too, and ??= always reads", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface C { n: number; m: number; w: number; k: number; q: number; z?: number }",
      "export const c: C = { n: 0, m: 0, w: 0, k: 0, q: 0 };",
      "export const step = (): void => {",
      "  c.n++;",
      "  c.m += 1;",
      "  for (let i = 0; i < 1; c.w++) {",
      "    i++;",
      "  }",
      "  c.z ??= 1;",
      "};",
      "export const next = (): number => c.k++;",
      "export const grown = (): number => (c.q += 1);",
    ]),
  );
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual(["C.n", "C.m", "C.w"]);
});

// A destructuring assignment's key reads the source's member; the slot it names is the store. `O.b` is the control the
// pattern does not name.
test("a destructuring-assignment pattern's key reads the source member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface O { readonly a: string; readonly b: string }",
      'export const o: O = { a: "1", b: "2" };',
      "export const taken = (): string => {",
      '  let local = "";',
      "  ({ a: local } = o);",
      "  return local;",
      "};",
    ]),
  );
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual(["O.b"]);
});

// `json` takes `unknown`, so `wrap` sends its `Slot` whole, and `go` hands a `Val` into that slot: the send carries
// to `Val.a` as a send, never a read. `Val.b`, which the slot does not name, is only written.
test("an escape carried across a flow stays a send on the member it reaches", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(
    plantedTree,
    source([
      "export interface Slot { readonly a: string }",
      "export interface Val { readonly a: string; readonly b: string }",
      "declare function json(value: unknown): string;",
      "const wrap = (slot: Slot): string => json(slot);",
      "export const go = (value: Val): string => wrap(value);",
      'export const made: Val = { a: "1", b: "2" };',
    ]),
  );
  expect(labelsIn(scan, "member-sent-only", FILE)).toEqual(["Slot.a", "Val.a"]);
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual(["Val.b"]);
});

// `probe.ts` sits outside the product: its read of `T.a` and its key use of `U.a` leave both write-only, each noted
// with what the other world did. `T.b` is the control nothing outside touches.
test("a read or a key use outside the product only annotates a product member", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...source([
      "export interface T { readonly a: string; readonly b: string }",
      'export const t: T = { a: "1", b: "2" };',
      "export interface U { readonly a: string }",
      'export const u: U = { a: "1" };',
    ]),
    "tsconfig.world-browser.json": JSON.stringify({ extends: `./${WORLD}`, include: ["probe.ts"] }),
    "probe.ts": [`import { t, type U } from "./${FILE}";`, "export const seen = t.a;", 'export type Keyed = U["a"];'].join("\n"),
  });
  const notes = scan.analysis["member-write-only"]
    .filter(({ label }) => label.startsWith(`${FILE}:`))
    .map(({ label, note }) => [label.slice(FILE.length + 1), note]);
  expect(notes).toEqual([
    ["T.a", expect.stringContaining("read outside the product: tests or tooling")],
    ["T.b", expect.stringMatching(/^written at /u)],
    ["U.a", expect.stringContaining("named as a key outside the product: tests or tooling")],
  ]);
});

// `__orb` is the dev bridge: our own `declare global` publishes it, so a tooling read through the global is a product
// read and `Bridge.foo` leaves the buckets. `Bridge.bar`, which nothing reads, stays sent; `Plain.p`, read from tooling
// without the global, stays write-only with the outside note.
test("a dev-bridge member read only from tooling through the global counts as read", { timeout: 120_000 }, async ({ plantedTree }) => {
  const scan = await graphScan(plantedTree, {
    ...source([
      "export interface Bridge { readonly foo: string; readonly bar: string }",
      "declare global {",
      "  var __orb: Bridge | undefined;",
      "}",
      "export const install = (bridge: Bridge): void => {",
      "  globalThis.__orb = bridge;",
      "};",
      'export const made: Bridge = { foo: "f", bar: "b" };',
      "export interface Plain { readonly p: string }",
      'export const plain: Plain = { p: "1" };',
    ]),
    "tsconfig.world-browser.json": JSON.stringify({ extends: `./${WORLD}`, include: ["probe.ts"] }),
    "probe.ts": [`import { plain } from "./${FILE}";`, "export const seen = globalThis.__orb?.foo;", "export const shown = plain.p;"].join("\n"),
  });
  const judged = (bucket: "member-sent-only" | "member-write-only"): readonly (readonly [string, string | null])[] =>
    scan.analysis[bucket].filter(({ label }) => label.startsWith(`${FILE}:`)).map(({ label, note }) => [label.slice(FILE.length + 1), note]);
  expect(judged("member-sent-only").map(([label]) => label)).toEqual(["Bridge.bar"]);
  expect(judged("member-write-only")).toEqual([["Plain.p", expect.stringContaining("read outside the product: tests or tooling")]]);
});
