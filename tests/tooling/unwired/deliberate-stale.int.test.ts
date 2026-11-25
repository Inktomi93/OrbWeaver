// A deliberate entry goes stale when its file, home or member leaves the tree, or when no consuming scan applies it;
// the excused-nothing check judges only reports one root and HEAD wrote.
import { expect, test } from "@orb/testkit/tooling";
import type { ConsumerReport, DeliberateEntry } from "../../../tooling/src/unwired/deliberate.ts";
import { deliberateLabel, excusedNothing, staleDeliberate } from "../../../tooling/src/unwired/deliberate.ts";

const KEPT = "packages/a/src/kept.ts";
const REASON = "D266: a planted reason";

test("an entry whose file, home or member is gone is stale by that kind; one the tree still declares is not", { timeout: 60_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    [KEPT]: [
      "declare function sqliteTable(name: string, columns: object): object;",
      "declare function text(): string;",
      "export interface Kept { readonly here: string }",
      'export const table = sqliteTable("t", { id: text() });',
      "export type Picked = Omit<Kept, never>;",
      "export class Held { spare(): number { return 1; } }",
    ].join("\n"),
    "packages/a/src/sdk/index.ts": "export {};",
  });
  const stale: readonly DeliberateEntry[] = [
    { file: "packages/a/src/gone.ts", home: "Kept", member: "here", reason: REASON },
    { file: KEPT, home: "Gone", member: null, reason: REASON },
    { file: KEPT, home: "Kept", member: "gone", reason: REASON },
    { file: KEPT, home: "table", member: "gone", reason: REASON },
    { directory: "packages/a/src/empty/", reason: REASON },
  ];
  // the twins: the same file, homes and kinds the tree still declares, and a home whose members a referred type holds
  const kept: readonly DeliberateEntry[] = [
    { file: KEPT, home: "Kept", member: "here", reason: REASON },
    { file: KEPT, home: "Kept", member: null, reason: REASON },
    { file: KEPT, home: "table", member: "id", reason: REASON },
    { file: KEPT, home: "Held", member: "spare", reason: REASON },
    { file: KEPT, home: "Picked", member: "here", reason: REASON },
    { directory: "packages/a/src/sdk/", reason: REASON },
  ];
  expect(staleDeliberate(root, [...stale, ...kept])).toEqual([
    { entry: "packages/a/src/gone.ts:Kept.here", stale: "file-gone" },
    { entry: `${KEPT}:Gone.*`, stale: "home-gone" },
    { entry: `${KEPT}:Kept.gone`, stale: "member-gone" },
    { entry: `${KEPT}:table.gone`, stale: "member-gone" },
    { entry: "packages/a/src/empty/", stale: "file-gone" },
  ]);
});

test("an entry no consumer applied excuses nothing; a missing, unmarked or other-HEAD report leaves the list unjudged", () => {
  const applied: DeliberateEntry = { file: KEPT, home: "Kept", member: "here", reason: REASON };
  const idle: DeliberateEntry = { file: KEPT, home: "Kept", member: "spare", reason: REASON };
  const current = { root: "/tree", head: "abc" };
  const reports: readonly ConsumerReport[] = [
    { path: "reports/unwired/graph.json", run: { ...current, applied: [deliberateLabel(applied)] } },
    { path: "reports/unwired/codes.json", run: { ...current, applied: [] } },
  ];
  expect(excusedNothing([applied, idle], reports, current)).toEqual({ stale: [{ entry: `${KEPT}:Kept.spare`, stale: "excuses-nothing" }], unjudged: [] });
  const missing = [...reports, { path: "reports/unwired/params.json", run: null }];
  expect(excusedNothing([applied, idle], missing, current)).toEqual({ stale: [], unjudged: ["reports/unwired/params.json"] });
  const moved = [...reports, { path: "out/shapes.json", run: { root: "/tree", head: "def", applied: [] } }];
  expect(excusedNothing([applied, idle], moved, current)).toEqual({ stale: [], unjudged: ["out/shapes.json"] });
});
