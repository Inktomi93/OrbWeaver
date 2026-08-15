import { __resetRenderStats, recordRender, renderHeatmap } from "../../../packages/client/src/lib/render-stats.ts";
import { expect, test } from "../../support/fixtures.ts";

test("render evidence can be reset between driven checkpoints", () => {
  __resetRenderStats();
  recordRender("region:content", "mount", 8);
  recordRender("region:content", "update", 4);

  expect(renderHeatmap()).toEqual([{ id: "region:content", count: 2, mounts: 1, updates: 1, totalMs: 12, avgMs: 6, maxMs: 8 }]);

  __resetRenderStats();
  expect(renderHeatmap()).toEqual([]);
});
