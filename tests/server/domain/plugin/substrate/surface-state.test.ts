// domain/plugin/substrate/surface-state — the in-memory per-(pluginId, surfaceId, chatId?) UI-surface STATE
// plane. Pins the DoS bound the store owns: distinct-KEY count per plugin (mirroring storage.kv's 256-key
// discipline). Without it a resident plugin could loop `setState(freshId, 16 KiB)` forever and grow the DOMAIN's
// Node heap unbounded (a host OOM affecting every tenant — #707 Finding B; NOT an isolation break, the key is
// server-resolved). The per-surface BYTE cap + the per-plugin sweep are pinned alongside.
//
// ROW 777 adds the chatId dimension, and the two properties it introduces are pinned here because neither is
// visible from the store's signature: (a) a room-keyed row and the plugin-wide row are DIFFERENT rows with no
// fallback in either direction — a room-scoped read of a plugin that only published room-wide must answer
// `null`, or a per-room widget silently shows another room's numbers; (b) the key cap counts ROOMS too, which
// is the consequence board row 778 is parked on and is therefore worth having a test say out loud.

import type { ChatId, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createPluginSurfaceStateStore, PLUGIN_SURFACE_STATE_MAX_KEYS } from "../../../../../packages/server/src/domain/plugin/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PLUGIN_A = castId<PluginId>("plugin_a000000000000000000001");
const PLUGIN_B = castId<PluginId>("plugin_b000000000000000000002");
const ROOM_1 = castId<ChatId>("chat_0000000000000000000001");
const ROOM_2 = castId<ChatId>("chat_0000000000000000000002");

describe("createPluginSurfaceStateStore — per-plugin distinct-KEY cap (#707 Finding B)", () => {
  test("N distinct surfaceIds each add an entry up to the cap; a NEW surfaceId PAST the cap is refused", () => {
    // RED-FIRST (2026-08-25, against unmodified source): the store capped only per-surface BYTES, never the COUNT
    // of distinct surfaceId keys — so this loop grew the Map without bound and the (cap+1)th set did NOT throw.
    const store = createPluginSurfaceStateStore();
    // Fill exactly to the cap — every one a NEW distinct surfaceId, each landing an entry (the growth the DoS
    // exploited: one Map key per fresh id).
    for (let i = 0; i < PLUGIN_SURFACE_STATE_MAX_KEYS; i++) {
      store.set(PLUGIN_A, `s${i}`, null, { v: i });
    }
    // Every filled key is readable — proof the entries actually landed (not silently dropped).
    expect(store.get(PLUGIN_A, "s0", null)).toEqual({ v: 0 });
    expect(store.get(PLUGIN_A, `s${PLUGIN_SURFACE_STATE_MAX_KEYS - 1}`, null)).toEqual({ v: PLUGIN_SURFACE_STATE_MAX_KEYS - 1 });
    // The (cap+1)th NEW surfaceId is REFUSED — the bound the membrane contains as a rejected guest promise.
    expect(() => store.set(PLUGIN_A, "one_too_many", null, { v: 1 })).toThrow("state cap");
  });

  test("overwriting an EXISTING surface at the cap always proceeds (only a NEW key consumes a slot)", () => {
    const store = createPluginSurfaceStateStore();
    for (let i = 0; i < PLUGIN_SURFACE_STATE_MAX_KEYS; i++) {
      store.set(PLUGIN_A, `s${i}`, null, { v: i });
    }
    // Re-publishing an already-stored surface's state is not a new slot — it must not be refused.
    expect(() => store.set(PLUGIN_A, "s0", null, { v: 999 })).not.toThrow();
    expect(store.get(PLUGIN_A, "s0", null)).toEqual({ v: 999 });
  });

  test("the cap is PER-PLUGIN — plugin B is unaffected by plugin A filling its own quota", () => {
    const store = createPluginSurfaceStateStore();
    for (let i = 0; i < PLUGIN_SURFACE_STATE_MAX_KEYS; i++) {
      store.set(PLUGIN_A, `s${i}`, null, { v: i });
    }
    // A different plugin's keys are counted separately — A's full quota does not starve B.
    expect(() => store.set(PLUGIN_B, "s0", null, { v: 0 })).not.toThrow();
    // And clearing A frees A's slots so a new A surface is admittable again.
    store.clearForPlugin(PLUGIN_A);
    expect(() => store.set(PLUGIN_A, "fresh", null, { v: 0 })).not.toThrow();
  });
});

describe("createPluginSurfaceStateStore — the ROOM dimension (row 777)", () => {
  test("the SAME surfaceId in two rooms holds two independent rows", () => {
    const store = createPluginSurfaceStateStore();
    store.set(PLUGIN_A, "widget", ROOM_1, { score: 1 });
    store.set(PLUGIN_A, "widget", ROOM_2, { score: 2 });
    expect(store.get(PLUGIN_A, "widget", ROOM_1)).toEqual({ score: 1 });
    expect(store.get(PLUGIN_A, "widget", ROOM_2)).toEqual({ score: 2 });
  });

  test("room-keyed and plugin-wide rows do not fall back to each other, in EITHER direction", () => {
    // The property that keeps a per-room widget honest. A room-scoped read finding the plugin-wide row would
    // show room 1's viewer a number published for "all your rooms"; a plugin-wide read finding a room row would
    // show a settings panel one arbitrary room's state. Both are the same bug and both must answer `null`.
    const store = createPluginSurfaceStateStore();
    store.set(PLUGIN_A, "widget", null, { scope: "plugin-wide" });
    expect(store.get(PLUGIN_A, "widget", ROOM_1)).toBeNull();

    const other = createPluginSurfaceStateStore();
    other.set(PLUGIN_A, "widget", ROOM_1, { scope: "room" });
    expect(other.get(PLUGIN_A, "widget", null)).toBeNull();
  });

  test("clearForPlugin sweeps a plugin's ROOM-keyed rows too — no ghost state survives a deactivate", () => {
    const store = createPluginSurfaceStateStore();
    store.set(PLUGIN_A, "widget", ROOM_1, { score: 1 });
    store.set(PLUGIN_A, "widget", null, { score: 0 });
    store.set(PLUGIN_B, "widget", ROOM_1, { score: 9 });
    store.clearForPlugin(PLUGIN_A);
    expect(store.get(PLUGIN_A, "widget", ROOM_1)).toBeNull();
    expect(store.get(PLUGIN_A, "widget", null)).toBeNull();
    // …and only A's. A deactivate is per-plugin, never a plane-wide wipe.
    expect(store.get(PLUGIN_B, "widget", ROOM_1)).toEqual({ score: 9 });
  });

  test("ROOMS consume key slots — the cap counts (surface, room) pairs (the row-778 consequence, stated)", () => {
    // This is not a defect being pinned, it is a KNOWN CONSEQUENCE being made visible: one surface published
    // into `cap` rooms exhausts the plugin's whole quota, so the (cap+1)th ROOM is refused exactly as the
    // (cap+1)th surface is. The bound is deliberately unchanged from #707 (64 x 16 KiB ~ 1 MiB of host heap per
    // plugin); widening it is board row 778, and this test is what would go red the day someone does.
    const store = createPluginSurfaceStateStore();
    for (let i = 0; i < PLUGIN_SURFACE_STATE_MAX_KEYS; i++) {
      store.set(PLUGIN_A, "widget", castId<ChatId>(`chat_${String(i).padStart(20, "0")}0`), { v: i });
    }
    expect(() => store.set(PLUGIN_A, "widget", ROOM_1, { v: 0 })).toThrow("state cap");
    // …and the plugin-wide row is a slot like any other, so it is refused too once the quota is gone.
    expect(() => store.set(PLUGIN_A, "widget", null, { v: 0 })).toThrow("state cap");
  });
});
