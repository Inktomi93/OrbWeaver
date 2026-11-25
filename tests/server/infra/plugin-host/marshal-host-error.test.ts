// @subject packages/server/src/infra/plugin-host/marshal.ts
// Building a host error calls the realm once, and past the window that call meets the interrupt. The failure is the
// guest's: it surfaces as `GuestCallFailure` holding the interrupt, never as a host throw, so every caller can hand the
// uncatchable exception back unchanged or release it. Between spans the window reads as passed (D346), so a build
// outside any span meets the interrupt within one poll period. No production door builds outside a span, so the
// build is planted here on a raw context.
import { expect, test } from "@orb/testkit/node";
import { PLUGIN_INVOCATION_CPU_MS } from "#server/infra/plugin-host/budgets.ts";
import { installCpuGuard, withinCpuWindow } from "#server/infra/plugin-host/cpu-guard.ts";
import { createGuestMarshal, GuestCallFailure } from "#server/infra/plugin-host/marshal.ts";
import { getPluginQuickJS } from "#server/infra/plugin-host/module.ts";

// Far past one interrupt poll period of builds, so the interrupt lands in one of them.
const BUILDS = 50_000;
const REFUSAL = { name: "PluginCapabilityError", message: "plugin capability not granted: ui.frame" };

test("a host error built past the window fails as the guest's interrupt, and the same build inside a span crosses with its name and message", async () => {
  const quickjs = await getPluginQuickJS();
  using ctx = quickjs.newContext();
  using marshal = createGuestMarshal(ctx);
  installCpuGuard(ctx, PLUGIN_INVOCATION_CPU_MS, null);

  using built = withinCpuWindow(ctx, () => marshal.newHostError(REFUSAL));
  expect(withinCpuWindow(ctx, () => marshal.fromSettledGuest(built))).toEqual({ kind: "value", value: REFUSAL });

  let failure: GuestCallFailure | null = null;
  for (let build = 0; build < BUILDS && failure === null; build += 1) {
    try {
      marshal.newHostError(REFUSAL).dispose();
    } catch (error) {
      if (!(error instanceof GuestCallFailure)) {
        throw error;
      }
      failure = error;
    }
  }
  if (failure === null) {
    throw new Error(`no build met the interrupt in ${String(BUILDS)} builds outside a span`);
  }
  using interrupt = failure.thrown;
  expect(ctx.dump(interrupt)).toMatchObject({ name: "InternalError" });
  // The rejection a refused async call answers with meets the same interrupt and hands it back, never a host throw.
  let rejection: ReturnType<typeof marshal.newHostError> | null = null;
  for (let build = 0; build < BUILDS && rejection === null; build += 1) {
    const result = marshal.rejectedWith(REFUSAL);
    if (result.error === undefined) {
      result.value.dispose();
    } else {
      rejection = result.error;
    }
  }
  using refused = rejection;
  expect(refused === null ? null : ctx.dump(refused)).toMatchObject({ name: "InternalError" });
});
