// infra/plugin-host/cpu-guard — the guest-CPU interrupt's own seam (#781). The end-to-end proof lives in the
// escape suite's post-invocation pump pin; this file owns the handler-window and bounded-pump mechanics.
//
// Every arm drives a REAL QuickJS context — the interrupt is a runtime behavior, and a fake would pin nothing.

import { getPluginQuickJS } from "@orb/server/infra/plugin-host";
import type { QuickJSContext } from "quickjs-emscripten-core";
import { isFail } from "quickjs-emscripten-core";
import { describe } from "vitest";
import { installCpuGuard, openCpuWindow, pumpGuestJobs } from "../../../../packages/server/src/infra/plugin-host/cpu-guard.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** Guest iterations that cost SECONDS of unbounded CPU (~2.3 s per 1e8 on this runtime) — far above every
 *  window below, so "interrupted" and "the loop simply finished" can never be confused. FINITE so a regressed
 *  run reports instead of hanging the suite. */
const RUNAWAY = "2e8";
/** A loop that finishes in tens of ms — what an UNBOUNDED span must be allowed to complete. */
const BRIEF = "1e6";
/** A window small enough that the runaway loop is preempted almost immediately. */
const TIGHT_WINDOW_MS = 50;

async function withContext(fn: (ctx: QuickJSContext) => void): Promise<void> {
  const mod = await getPluginQuickJS();
  const ctx = mod.newContext();
  try {
    fn(ctx);
  } finally {
    ctx.dispose();
  }
}

/** Run a guest loop and report how it ended: `"completed"`, or `"interrupted:<message>"`. */
function runGuestLoop(ctx: QuickJSContext, iterations: string): string {
  const result = ctx.evalCode(`for (var i = 0; i < ${iterations}; i++) {} 'completed'`);
  if (isFail(result)) {
    const dumped = ctx.dump(result.error) as { message?: unknown };
    result.error.dispose();
    return `interrupted:${String(dumped.message ?? "")}`;
  }
  const out = ctx.getString(result.value);
  result.value.dispose();
  return out;
}

describe("cpu-guard — the context-lifetime interrupt is a WINDOW, not an install/remove pair", () => {
  test("the installed handler is INERT until a window opens, and preempts inside one", async () => {
    await withContext((ctx) => {
      installCpuGuard(ctx, TIGHT_WINDOW_MS);
      // No window open: the handler is installed for the context's whole life and must not touch host-driven
      // bytecode outside a span (the inbound `JSON.parse` of a handler's args runs exactly there).
      expect(runGuestLoop(ctx, BRIEF)).toBe("completed");
      const close = openCpuWindow(ctx);
      expect(runGuestLoop(ctx, RUNAWAY)).toContain("interrupted");
      close();
      // ...and closing RESTORES the enclosing (absent) window rather than leaving the context preempted.
      expect(runGuestLoop(ctx, BRIEF)).toBe("completed");
    });
  }, 30_000);

  test("a NESTED window neither widens the enclosing budget nor blanks it on close", async () => {
    await withContext((ctx) => {
      installCpuGuard(ctx, TIGHT_WINDOW_MS);
      const closeOuter = openCpuWindow(ctx);
      // Spend the outer window.
      expect(runGuestLoop(ctx, RUNAWAY)).toContain("interrupted");
      // The nesting contract's teeth: an inner window opened while the outer one is already SPENT must not hand
      // the guest a fresh budget (`min(previous, now + budget)`). Without that, a job pump nested inside a live
      // invocation would refresh the CPU bound of the very invocation it runs under, once per host call.
      const closeInner = openCpuWindow(ctx);
      expect(runGuestLoop(ctx, BRIEF)).toContain("interrupted");
      closeInner();
      // And closing the inner one restores the OUTER deadline instead of clearing it — a `removeInterruptHandler`
      // here would have left the rest of the enclosing span unbounded.
      expect(runGuestLoop(ctx, BRIEF)).toContain("interrupted");
      closeOuter();
      expect(runGuestLoop(ctx, BRIEF)).toBe("completed");
    });
  }, 30_000);

  test("the pump preempts a runaway JOB, leaves the context usable, and disposes cleanly with jobs still queued", async () => {
    const mod = await getPluginQuickJS();
    const ctx = mod.newContext();
    const reached: string[] = [];
    const marker = ctx.newFunction("mark", (nameHandle) => {
      reached.push(ctx.getString(nameHandle));
      return ctx.undefined;
    });
    ctx.setProp(ctx.global, "mark", marker);
    const deferred = ctx.newPromise();
    ctx.setProp(ctx.global, "settleMe", deferred.handle);
    installCpuGuard(ctx, TIGHT_WINDOW_MS);
    // TWO reaction jobs: the interrupt aborts the first and `executePendingJobs` returns early, so the second is
    // left QUEUED — the state the context must still dispose cleanly from.
    const queued = ctx.evalCode(
      `settleMe.then(function () { mark('resumed'); for (var i = 0; i < ${RUNAWAY}; i++) {} mark('escaped'); });` +
        `settleMe.then(function () { for (var i = 0; i < ${RUNAWAY}; i++) {} }); 'queued'`,
    );
    if (isFail(queued)) {
      queued.error.dispose();
      throw new Error("failed to queue the guest continuations");
    }
    queued.value.dispose();
    const resolution = ctx.newString("ok");
    deferred.resolve(resolution);
    resolution.dispose();

    pumpGuestJobs(ctx);
    // The continuation RAN (not vacuous) and was preempted before the bytecode past its loop.
    expect(reached).toEqual(["resumed"]);
    // The context survives its own interrupt — the guest promise rejected, the realm did not die.
    expect(runGuestLoop(ctx, BRIEF)).toBe("completed");

    marker.dispose();
    deferred.dispose();
    ctx.dispose();
    // The dispose-abort this could have traded the DoS for (`list_empty(&rt->gc_obj_list)`) kills the PROCESS,
    // it does not throw — so the proof is that a fresh context on the SHARED WASM module still runs.
    const after = mod.newContext();
    try {
      expect(runGuestLoop(after, BRIEF)).toBe("completed");
    } finally {
      after.dispose();
    }
  }, 30_000);
});
