// `pnpm unwired fields` takes its writes from the one site-role reader (tooling/src/unwired/graph/roles.ts): every
// store form it names writes the member.
import { expect, test } from "@orb/testkit/tooling";
import { fieldsScan, GRAPH_SOURCE } from "./_planted.ts";

// Each store form writes its member: a bump, a destructuring-assignment slot, a for-of target and an element-access
// store, and a class field's initializer. Each member is optional and read, so a store the scan misses reports it
// never-written; `Store.unset` is the control that nothing writes.
const STORES = {
  [`${GRAPH_SOURCE}/stores.ts`]: [
    "export interface Store {",
    "  bumped?: number;",
    "  pattern?: string;",
    "  looped?: string;",
    "  keyed?: string;",
    "  unset?: string;",
    "}",
    "export function makeStore(): Store {",
    "  return {};",
    "}",
    "const store = makeStore();",
    "export const fill = (source: { readonly p: string }, list: readonly string[]): void => {",
    "  store.bumped++;",
    "  ({ p: store.pattern } = source);",
    "  for (store.looped of list) {}",
    '  store["keyed"] = "k";',
    "};",
    "export class Box {",
    '  label?: string = "boxed";',
    "}",
    'export const boxLabel = new Box().label ?? "";',
    'export const shown = (): string => (store.bumped ?? 0).toFixed() + (store.pattern ?? "") + (store.looped ?? "") + (store.keyed ?? "") + (store.unset ?? "");',
  ].join("\n"),
};

test("a bump, a destructuring slot, a for-of target, an element-access store and a field initializer each write", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await fieldsScan(plantedTree, STORES);
  const planted = report.unwired.filter(({ file }) => file.endsWith("stores.ts"));
  expect(planted.map(({ home, member, kind }) => `${home}.${member} ${kind}`)).toEqual(["Store.unset never-written"]);
});

// A bump whose own value is used reads its member as well as storing into it; one whose value is dropped only stores.
// `Counter.tally` is only ever bumped and dropped, so it is the one member never read; `Counter.next` is the case.
const BUMPS = {
  [`${GRAPH_SOURCE}/bumps.ts`]: [
    "export interface Counter {",
    "  next: number;",
    "  tally: number;",
    "}",
    "export const counter = (): Counter => ({ next: 0, tally: 0 });",
    "export const take = (c: Counter): number => c.next++;",
    "export const tick = (c: Counter): void => {",
    "  c.tally++;",
    "};",
  ].join("\n"),
};

test("a bump whose value is used reads its member; a dropped bump only writes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, BUMPS);
  const planted = report.unwired.filter(({ file }) => file.endsWith("bumps.ts"));
  expect(planted.map(({ home, member, kind }) => `${home}.${member} ${kind}`)).toEqual(["Counter.tally never-read"]);
});
