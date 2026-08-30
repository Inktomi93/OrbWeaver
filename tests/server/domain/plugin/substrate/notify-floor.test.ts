// substrate/notify-floor — the plugin notify capability's per-(plugin,chat) cooldown. Pins: a first post
// admits, a second within the window refuses, distinct chats/plugins are independent buckets, and the
// window reopens once the cooldown elapses (over an injected clock, never a real one).

import type { ChatId, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createNotifyFloor } from "../../../../../packages/server/src/domain/plugin/substrate/notify-floor.ts";
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
});
