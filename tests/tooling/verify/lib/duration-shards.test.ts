import { readFileSync } from "node:fs";
import { z } from "zod";
import { balanceNativeFiles, requireNativeSelection } from "../../../../tooling/src/verify/lib/duration-shards.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const baseline = z
  .object({ node: z.array(z.object({ file: z.string(), durationMs: z.number() })), ct: z.array(z.object({ file: z.string(), durationMs: z.number() })) })
  .parse(JSON.parse(readFileSync("tooling/ci-duration-weights.json", "utf8")));
for (const [runner, count] of [
  ["node", 3],
  ["ct", 5],
] as const) {
  test(`${runner} real duration baseline spreads heavy files deterministically and closes membership`, () => {
    const weights = baseline[runner];
    const files = weights.map((row) => row.file);
    const plan = balanceNativeFiles(files, weights, { index: 1, count });
    const heavy = [...weights]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, count)
      .map((row) => row.file);
    expect(new Set(heavy.map((file) => plan.shards.findIndex((shard) => shard.includes(file)))).size).toBe(count);
    expect(plan.shards.flat().sort()).toEqual(files.sort());
    expect(balanceNativeFiles([...files].reverse(), weights, { index: count, count }).shards).toEqual(plan.shards);
    const durations = new Map(weights.map((row) => [row.file, row.durationMs]));
    const sums = plan.shards.map((shard) => shard.reduce((total, file) => total + (durations.get(file) ?? 0), 0));
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThan(Math.max(...weights.map((row) => row.durationMs)));
  });
}
test("new native files are retained, dead baseline files are excluded, duplicate or widened native selections refuse", () => {
  const weights = [
    { file: "heavy", durationMs: 100 },
    { file: "light", durationMs: 1 },
    { file: "deleted", durationMs: 1000 },
  ];
  const plan = balanceNativeFiles(["heavy", "light", "new"], weights, { index: 1, count: 2 });
  expect(plan.shards.flat().sort()).toEqual(["heavy", "light", "new"].sort());
  expect(() => requireNativeSelection(plan.selected, [...plan.selected, "foreign"])).toThrow(/widens/u);
  expect(() => requireNativeSelection(plan.selected, [])).toThrow(/empty|overlaps/u);
  expect(() => balanceNativeFiles(["heavy", "heavy"], weights, { index: 1, count: 2 })).toThrow(/duplicated/u);
});
