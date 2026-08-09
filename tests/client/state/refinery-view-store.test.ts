// The refinery WALK store (view-back / operate-back — schema-renderer §16.1): the two pointers move
// independently and clear independently — walking is free, nothing here mutates server state.

import { __peekRefineryViewForTest, setRefineryArmedRewrite, setRefineryViewedRun } from "@orb/client/state";
import { expect, test } from "../../support/fixtures.ts";

test("viewed-run and armed-rewrite pointers move independently and clear to latest", () => {
  setRefineryViewedRun(null);
  setRefineryArmedRewrite(null);
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: null, armedRewriteRunId: null });

  setRefineryViewedRun("refinery_run_1");
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: "refinery_run_1", armedRewriteRunId: null });

  setRefineryArmedRewrite("refinery_run_2");
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: "refinery_run_1", armedRewriteRunId: "refinery_run_2" });

  setRefineryViewedRun(null);
  setRefineryArmedRewrite(null);
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: null, armedRewriteRunId: null });
});
