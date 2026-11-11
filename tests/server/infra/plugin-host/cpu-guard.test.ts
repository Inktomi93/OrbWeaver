// @subject packages/server/src/infra/plugin-host/cpu-guard.ts
// The window between spans reads as passed, so guest code a missed host site reaches there is ended at its first
// interrupt poll (D346). No production door calls the realm outside a span, so the missed site is planted here on a
// raw context.
import { expect, test } from "@orb/testkit/node";
import { PLUGIN_INVOCATION_CPU_MS } from "#server/infra/plugin-host/budgets.ts";
import { installCpuGuard, withinCpuWindow } from "#server/infra/plugin-host/cpu-guard.ts";
import { getPluginQuickJS } from "#server/infra/plugin-host/module.ts";

// Finite guest work, many interrupt polls long, that ends on its own when nothing interrupts it.
const FINITE_LOOP = "for (let i = 0; i < 10000000; i++) {}";

test("guest code the host reaches between spans is ended at its first poll, and the same code finishes inside a span", async () => {
  const quickjs = await getPluginQuickJS();
  using ctx = quickjs.newContext();
  installCpuGuard(ctx, PLUGIN_INVOCATION_CPU_MS);

  using inSpan = withinCpuWindow(ctx, () => ctx.evalCode(FINITE_LOOP));
  expect(inSpan.error).toBeUndefined();

  using missed = ctx.evalCode(FINITE_LOOP);
  expect(missed.error === undefined ? null : ctx.dump(missed.error)).toMatchObject({ name: "InternalError" });
});
