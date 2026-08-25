// domain/plugin/substrate/surface-state — the in-memory per-(pluginId, surfaceId) UI-surface STATE plane.
// Pins the DoS bound the store owns: distinct-surfaceId KEY count per plugin (mirroring storage.kv's 256-key
// discipline). Without it a resident plugin could loop `setState(freshId, 16 KiB)` forever and grow the DOMAIN's
// Node heap unbounded (a host OOM affecting every tenant — #707 Finding B; NOT an isolation break, the key is
// server-resolved `pluginId:surfaceId`). The per-surface BYTE cap + the per-plugin sweep are pinned alongside.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createPluginSurfaceStateStore, PLUGIN_SURFACE_STATE_MAX_KEYS } from "../../../../../packages/server/src/domain/plugin/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PLUGIN_A = castId<PluginId>("plugin_a000000000000000000001");
const PLUGIN_B = castId<PluginId>("plugin_b000000000000000000002");

describe("createPluginSurfaceStateStore — per-plugin distinct-surfaceId KEY cap (#707 Finding B)", () => {
  test("N distinct surfaceIds each add an entry up to the cap; a NEW surfaceId PAST the cap is refused", () => {
    // RED-FIRST (2026-08-25, against unmodified source): the store capped only per-surface BYTES, never the COUNT
    // of distinct surfaceId keys — so this loop grew the Map without bound and the (cap+1)th set did NOT throw.
    const store = createPluginSurfaceStateStore();
    // Fill exactly to the cap — every one a NEW distinct surfaceId, each landing an entry (the growth the DoS
    // exploited: one Map key per fresh id).
    for (let i = 0; i < PLUGIN_SURFACE_STATE_MAX_KEYS; i++) {
      store.set(PLUGIN_A, `s${i}`, { v: i });
    }
    // Every filled key is readable — proof the entries actually landed (not silently dropped).
    expect(store.get(PLUGIN_A, "s0")).toEqual({ v: 0 });
    expect(store.get(PLUGIN_A, `s${PLUGIN_SURFACE_STATE_MAX_KEYS - 1}`)).toEqual({ v: PLUGIN_SURFACE_STATE_MAX_KEYS - 1 });
    // The (cap+1)th NEW surfaceId is REFUSED — the bound the membrane contains as a rejected guest promise.
    expect(() => store.set(PLUGIN_A, "one_too_many", { v: 1 })).toThrow("surface state cap");
  });

  test("overwriting an EXISTING surface at the cap always proceeds (only a NEW key consumes a slot)", () => {
    const store = createPluginSurfaceStateStore();
    for (let i = 0; i < PLUGIN_SURFACE_STATE_MAX_KEYS; i++) {
      store.set(PLUGIN_A, `s${i}`, { v: i });
    }
    // Re-publishing an already-stored surface's state is not a new slot — it must not be refused.
    expect(() => store.set(PLUGIN_A, "s0", { v: 999 })).not.toThrow();
    expect(store.get(PLUGIN_A, "s0")).toEqual({ v: 999 });
  });

  test("the cap is PER-PLUGIN — plugin B is unaffected by plugin A filling its own quota", () => {
    const store = createPluginSurfaceStateStore();
    for (let i = 0; i < PLUGIN_SURFACE_STATE_MAX_KEYS; i++) {
      store.set(PLUGIN_A, `s${i}`, { v: i });
    }
    // A different plugin's keys are counted separately — A's full quota does not starve B.
    expect(() => store.set(PLUGIN_B, "s0", { v: 0 })).not.toThrow();
    // And clearing A frees A's slots so a new A surface is admittable again.
    store.clearForPlugin(PLUGIN_A);
    expect(() => store.set(PLUGIN_A, "fresh", { v: 0 })).not.toThrow();
  });
});
