// The refinery WALK store (view-back / operate-back — schema-renderer §16.1): the two pointers move
// independently and clear independently — walking is free, nothing here mutates server state.

import {
  __peekRefineryViewForTest,
  clearRefineryWorkbenchDoor,
  requestRefineryWorkbenchDoor,
  setRefineryArmedRewrite,
  setRefineryViewedRun,
} from "@orb/client/state";
import { expect, test } from "../../support/fixtures.ts";

test("viewed-run and armed-rewrite pointers move independently and clear to latest", () => {
  setRefineryViewedRun(null);
  setRefineryArmedRewrite(null);
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: null, armedRewriteRunId: null, requestedDoor: null });

  setRefineryViewedRun("refinery_run_1");
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: "refinery_run_1", armedRewriteRunId: null, requestedDoor: null });

  setRefineryArmedRewrite("refinery_run_2");
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: "refinery_run_1", armedRewriteRunId: "refinery_run_2", requestedDoor: null });

  setRefineryViewedRun(null);
  setRefineryArmedRewrite(null);
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: null, armedRewriteRunId: null, requestedDoor: null });
});

// The workbench-door REQUEST is a one-shot: the owning control acknowledges by clearing it. Both halves
// shipped referenced by ZERO test until #619 repaired clause C of `test-presence-client` (its mirror here is
// a `.test.ts`, and the clause only ever resolved `.ct.tsx`, so it silently judged nothing). The invariant
// the source comment states is exactly what must not regress: a door left set re-opens itself on the next
// unrelated render of its owner.
test("a workbench-door request is one-shot: it is spent by the owner's acknowledgement", () => {
  setRefineryViewedRun(null);
  setRefineryArmedRewrite(null);
  clearRefineryWorkbenchDoor();
  expect(__peekRefineryViewForTest().requestedDoor).toBeNull();

  requestRefineryWorkbenchDoor("scope");
  expect(__peekRefineryViewForTest().requestedDoor).toBe("scope");

  // A second request REPLACES rather than queues — the latest ask is the one the workbench honours.
  requestRefineryWorkbenchDoor("guidance");
  expect(__peekRefineryViewForTest().requestedDoor).toBe("guidance");

  // The acknowledgement spends it, and leaves the two walk pointers untouched.
  setRefineryViewedRun("refinery_run_9");
  clearRefineryWorkbenchDoor();
  expect(__peekRefineryViewForTest()).toEqual({ viewedRunId: "refinery_run_9", armedRewriteRunId: null, requestedDoor: null });

  setRefineryViewedRun(null);
});
