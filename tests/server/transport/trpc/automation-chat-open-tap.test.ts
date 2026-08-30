// transport/trpc/automation-chat-open-tap — the D81 side-channel for the per-viewer `chatOpened`
// synthetic (never published on the durable chat bus, so the automation watcher cannot see it any other
// way). Three properties belong to this module and nothing else does: the sink is a BYTE-IDENTICAL no-op
// until wired (the stream generator calls it on every attach, wired or not), a wired sink receives the
// viewer identity ALONGSIDE the chat (a tap that dropped the viewer would fire rules for the wrong
// principal), and clearing it at teardown really detaches — a stale sink outliving its composition root
// is a leak into the next one.

import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import { notifyChatOpened, setChatOpenTap } from "../../../../packages/server/src/transport/trpc/automation-chat-open-tap.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_open");
const VIEWER = castId<UserId>("user_viewer");

// Module-scope sink: every test leaves it clear, exactly as the composition root's teardown does.
afterEach(() => {
  setChatOpenTap(null);
});

describe("automation-chat-open-tap", () => {
  test("is a silent no-op before the composition root wires it", () => {
    expect(() => {
      notifyChatOpened(CHAT, VIEWER);
    }).not.toThrow();
  });

  test("a wired sink receives the chat AND the viewer, once per attach", () => {
    const tap = vi.fn();
    setChatOpenTap(tap);

    notifyChatOpened(CHAT, VIEWER);
    // EVERY attach fires (reconnects included — the dispatch budget gates bound the refire), so a second
    // open is a second call, never a deduped one.
    notifyChatOpened(CHAT, VIEWER);

    expect(tap.mock.calls).toStrictEqual([
      [CHAT, VIEWER],
      [CHAT, VIEWER],
    ]);
  });

  test("clearing the tap detaches it — the next open reaches nobody", () => {
    const tap = vi.fn();
    setChatOpenTap(tap);
    notifyChatOpened(CHAT, VIEWER);

    setChatOpenTap(null);
    notifyChatOpened(CHAT, VIEWER);

    // POSITIVE CONTROL is the first call: the sink demonstrably fired before the clear, so the silence
    // after it is the CLEAR working rather than a tap that was never attached.
    expect(tap).toHaveBeenCalledTimes(1);
  });

  test("re-wiring REPLACES the sink rather than fanning to both", () => {
    const first = vi.fn();
    const second = vi.fn();
    setChatOpenTap(first);
    setChatOpenTap(second);

    notifyChatOpened(CHAT, VIEWER);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
