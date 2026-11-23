// The graph's member rows split by the deliberate and judged lists the way every unwired scan splits its rows.
import { expect, test } from "@orb/testkit/tooling";
import { scanGraph } from "../../../tooling/src/unwired/index.ts";
import { GRAPH_SOURCE, graphTree, JUDGED_WORK, judgedExpected, judgedOutcome, labelsIn, plantJudged } from "./_planted.ts";

const FILE = `${GRAPH_SOURCE}/row.ts`;
const quiet = (): undefined => undefined;
const TREE = {
  [FILE]: [
    "export interface Row { readonly live: string; readonly kept: string; readonly owned: string; readonly lapsed: string }",
    'export const row: Row = { live: "l", kept: "k", owned: "o", lapsed: "x" };',
    "export const read = (value: Row): string => value.live;",
  ].join("\n"),
  ...JUDGED_WORK,
};

test("a member the deliberate list names reports apart with its reason, keyed as the fields scan keys it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree(graphTree(TREE));
  const reason = "a planted outside reader";
  const scan = await scanGraph(root, quiet, undefined, { deliberate: [{ file: FILE, home: "Row", member: "kept", reason }], judged: [] });
  expect(scan.members.deliberate.map(({ key, bucket, reason: why }) => [key, bucket, why])).toEqual([[`${FILE}:Row.kept`, "member-write-only", reason]]);
  expect(scan.members.unwired.map(({ member }) => member)).toEqual(["owned", "lapsed"]);
  // the analysis keeps every row: the split is a view over it
  expect(labelsIn(scan, "member-write-only", FILE)).toEqual(["Row.kept", "Row.owned", "Row.lapsed"]);
});

// A row an open item owns reports apart with its item; an entry whose item is done or whose row no longer reports is
// stale, and the done item's row reports as unwired again.
test("a judged member row reports apart with its open item, and an entry for a done item or a gone row is stale", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantedTree(graphTree(TREE));
  const first = await scanGraph(root, quiet);
  const judged = plantJudged(first.members, "Row.owned", "Row.lapsed");
  const scan = await scanGraph(root, quiet, undefined, { deliberate: [], judged });
  expect(judgedOutcome(scan.members, "Row.owned", "Row.lapsed")).toEqual(judgedExpected("Row.owned", "Row.lapsed"));
});
