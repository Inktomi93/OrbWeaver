// substrate/notify-floor — the plugin notify capability's per-(plugin,chat) cooldown. Pins: a first post
// admits, a second within the window refuses, distinct chats/plugins are independent buckets, and the
// window reopens once the cooldown elapses (over an injected clock, never a real one).

import type { ChatId, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createNotifyFloor, PLUGIN_NOTIFY_FLOOR_MAX_ENTRIES } from "../../../../../packages/server/src/domain/plugin/substrate/notify-floor.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PLUGIN_A = castId<PluginId>("plugin_a");
const CHAT_A = castId<ChatId>("chat_a");

function clockAt(startMs: number): { now: () => number; advance: (ms: number) => void } {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number): void => {
      t += ms;
    },
  };
}

describe("createNotifyFloor", () => {
  test("a first post always admits", () => {
    const floor = createNotifyFloor(clockAt(0).now);
    expect(() => floor.admit(PLUGIN_A, CHAT_A)).not.toThrow();
  });

  test("a second post within the 60s window refuses, naming the cooldown", () => {
    const clock = clockAt(0);
    const floor = createNotifyFloor(clock.now);
    floor.admit(PLUGIN_A, CHAT_A);
    clock.advance(1000);
    expect(() => floor.admit(PLUGIN_A, CHAT_A)).toThrow(/limited to one notice per/);
  });

  test("distinct chats (or plugins) are independent buckets — one refusal never blocks the other", () => {
    const clock = clockAt(0);
    const floor = createNotifyFloor(clock.now);
    const otherChat = castId<ChatId>("chat_b");
    floor.admit(PLUGIN_A, CHAT_A);
    expect(() => floor.admit(PLUGIN_A, otherChat)).not.toThrow();
  });

  test("the window reopens once the cooldown fully elapses", () => {
    const clock = clockAt(0);
    const floor = createNotifyFloor(clock.now);
    floor.admit(PLUGIN_A, CHAT_A);
    clock.advance(60_000);
    expect(() => floor.admit(PLUGIN_A, CHAT_A)).not.toThrow();
  });

  // ── THE MAP IS BOUNDED, AND THE BOUND IS REAL ──────────────────────────────────────────────────────────────
  // The sweep at 1024 entries only deleted entries whose cooldown had ELAPSED, so a plugin posting into many
  // distinct rooms INSIDE one window swept nothing and grew the map without limit — an unbounded per-process
  // allocation a guest drives. The bound is now a hard cap with LRU eviction, and this pin states its honest
  // cost: past the cap the OLDEST tracked pair is forgotten, so its next notice admits again. That is the
  // trade the bound buys, and it is stated here rather than discovered.
  test("past the cap the OLDEST (plugin, chat) pair is evicted — the map cannot grow without limit", () => {
    const clock = clockAt(0);
    const floor = createNotifyFloor(clock.now);
    const chatAt = (i: number): ChatId => castId<ChatId>(`chat_${String(i)}`);

    // The pair that must fall off the end.
    floor.admit(PLUGIN_A, chatAt(0));
    // …then a full cap's worth of DISTINCT rooms, all inside the cooldown window (nothing is sweepable).
    for (let i = 1; i <= PLUGIN_NOTIFY_FLOOR_MAX_ENTRIES; i += 1) {
      floor.admit(PLUGIN_A, chatAt(i));
    }

    // The oldest entry was evicted, so its cooldown is no longer tracked…
    expect(() => floor.admit(PLUGIN_A, chatAt(0))).not.toThrow();
    // …while the most RECENT pair is still held to the floor (eviction is LRU, not a flush).
    expect(() => floor.admit(PLUGIN_A, chatAt(PLUGIN_NOTIFY_FLOOR_MAX_ENTRIES))).toThrow(/limited to one notice per/);
  });
});
