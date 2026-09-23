// domain/plugin/substrate/ui-host-call-gate — the per-plugin CONCURRENCY belt on `plugin.uiHostCall`
// (U4, §9 "flood"; the D46 P2-F "from birth" lesson).
//
// The three properties a counter-belt can get wrong, each pinned: the ceiling actually bites; the scope is the
// PLUGIN (one plugin's flood must not starve a sibling); and the release is IDEMPOTENT — the server-side
// sibling counter's own header records that a drifting count admitted 36 of a 40-call burst, and a
// double-released slot drifts it in exactly that direction.

import { PLUGIN_UI_HOST_CALL_ARGS_MAX_BYTES, PLUGIN_UI_HOST_CALL_RESULT_MAX_BYTES } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { HOST_CALLS_IN_FLIGHT_MAX, HOST_FN_ARGS_MAX_BYTES, HOST_FN_RESULT_CAP_BYTES } from "@orb/server/infra/plugin-host";
import { describe } from "vitest";
import { createUiHostCallGate, UI_HOST_CALLS_IN_FLIGHT_MAX } from "../../../../../packages/server/src/domain/plugin/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PLUGIN_A = castId<PluginId>("plugin_a000000000000000000001");
const PLUGIN_B = castId<PluginId>("plugin_b000000000000000000002");

describe("createUiHostCallGate", () => {
  test("the MIRROR is exact — the client-proxy ceiling equals the server guest's in-flight ceiling", () => {
    // The cake bans the domain from value-importing infra, so the constant is RE-DECLARED rather than imported
    // (the same situation `PLUGIN_CRASH_DISABLE_THRESHOLD` records). A re-declared constant with no pin is a
    // number that drifts silently; this is the pin. If a future tuning changes one, it must change both.
    expect(UI_HOST_CALLS_IN_FLIGHT_MAX).toBe(HOST_CALLS_IN_FLIGHT_MAX);
  });

  test("the uiHostCall WIRE caps mirror the membrane's own arg/result ceilings", () => {
    // Same class of pin, different pair: `@orb/contracts` is BELOW `infra` in the cake and the client cannot
    // reach infra at all, so the Tier-C wire bounds are re-declared in contracts. This is the only place both
    // spellings are visible at once, which makes it the only place the equality can be enforced.
    expect(PLUGIN_UI_HOST_CALL_ARGS_MAX_BYTES).toBe(HOST_FN_ARGS_MAX_BYTES);
    expect(PLUGIN_UI_HOST_CALL_RESULT_MAX_BYTES).toBe(HOST_FN_RESULT_CAP_BYTES);
  });

  test("the ceiling bites: the (max+1)th concurrent call is REFUSED, not queued", () => {
    const gate = createUiHostCallGate();
    const releases = Array.from({ length: UI_HOST_CALLS_IN_FLIGHT_MAX }, () => gate.admit(PLUGIN_A));
    expect(releases).toHaveLength(UI_HOST_CALLS_IN_FLIGHT_MAX);
    // REFUSED, deliberately, not parked: a queue here would convert a hostile flood into unbounded host memory.
    expect(() => gate.admit(PLUGIN_A)).toThrow(/too many concurrent UI host calls/u);
    // …and releasing one frees exactly one slot.
    releases[0]?.();
    expect(() => gate.admit(PLUGIN_A)).not.toThrow();
  });

  test("the scope is PER-PLUGIN — a flooding plugin does not starve a well-behaved sibling", () => {
    const gate = createUiHostCallGate();
    for (let i = 0; i < UI_HOST_CALLS_IN_FLIGHT_MAX; i++) {
      gate.admit(PLUGIN_A);
    }
    expect(() => gate.admit(PLUGIN_B)).not.toThrow();
  });

  test("a release is IDEMPOTENT — a stray second call cannot drift the counter below zero", () => {
    // The failure this closes, measured on the server-side sibling (see its header): a counter that drifts DOWN
    // admits MORE than the ceiling, so the belt reads green while it is no longer a belt. Here: fill, release
    // one slot twice, and prove exactly ONE slot came back rather than two.
    const gate = createUiHostCallGate();
    const releases = Array.from({ length: UI_HOST_CALLS_IN_FLIGHT_MAX }, () => gate.admit(PLUGIN_A));
    const first = releases[0];
    if (first === undefined) {
      throw new Error("expected a release");
    }
    first();
    first();
    // ONE re-admit succeeds (the single genuinely-freed slot)…
    expect(() => gate.admit(PLUGIN_A)).not.toThrow();
    // …and the next is refused. A drifted counter would have admitted this one too.
    expect(() => gate.admit(PLUGIN_A)).toThrow(/too many concurrent UI host calls/u);
  });
});
