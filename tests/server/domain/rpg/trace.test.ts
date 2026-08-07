// domain/rpg/trace — the R-OBS flight-recorder RING. Pure + injected-clock, so this pins the parts the
// composed-real int test (`tests/server/entry/compose/rpg.int.test.ts`, "R-OBS composed-real") cannot reach
// cheaply: the bounded drop, the stamping, and — the load-bearing half — that a filter on a key an event does
// NOT carry EXCLUDES it rather than silently matching. `/api/_debug/rpg/traces?turnId=` is only trustworthy
// because of that: a turn's trace must not quietly include another turn's mount.

import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRpgTraceRecorder } from "@orb/server/domain/rpg";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT_A = castId<ChatId>("chat_robs_a");
const CHAT_B = castId<ChatId>("chat_robs_b");
const TURN_1 = castId<ChatTurnId>("chat_turn_robs_1");
const TURN_2 = castId<ChatTurnId>("chat_turn_robs_2");

const AT = 1_700_000_000_000;

function recorder(limit?: number): ReturnType<typeof createRpgTraceRecorder> {
  return createRpgTraceRecorder({ now: () => AT, ...(limit === undefined ? {} : { limit }) });
}

describe("createRpgTraceRecorder", () => {
  test("stamps a monotonic seq + the injected clock (the emitter never reads a clock)", () => {
    const rec = recorder();
    rec.sink({ phase: "mount", chatId: CHAT_A, toolNames: ["update_scene"] });
    rec.sink({ phase: "bus", chatId: CHAT_A, type: "snapshotPatched" });

    expect(rec.recent().map((record) => record.seq)).toEqual([1, 2]);
    expect(rec.recent().map((record) => record.at)).toEqual([AT, AT]);
  });

  test("the ring is BOUNDED — the oldest record drops past the limit (no table, D75 ephemera)", () => {
    const rec = recorder(2);
    rec.sink({ phase: "mount", chatId: CHAT_A, toolNames: ["a"] });
    rec.sink({ phase: "mount", chatId: CHAT_A, toolNames: ["b"] });
    rec.sink({ phase: "mount", chatId: CHAT_A, toolNames: ["c"] });

    const kept = rec.recent().map((record) => (record.event.phase === "mount" ? record.event.toolNames : []));
    expect(kept).toEqual([["b"], ["c"]]);
  });

  test("a chatId filter keeps one game's stream out of another's", () => {
    const rec = recorder();
    rec.sink({ phase: "bus", chatId: CHAT_A, type: "snapshotPatched" });
    rec.sink({ phase: "bus", chatId: CHAT_B, type: "snapshotPatched" });

    expect(rec.recent({ chatId: CHAT_A })).toHaveLength(1);
    expect(rec.recent({ chatId: CHAT_B })).toHaveLength(1);
  });

  test("a turnId filter EXCLUDES an event that carries no turnId — never a silent match", () => {
    // The mount runs before the turn resolves an id, and a bus emit is chat-scoped. If either leaked into a
    // turn-filtered read, "show me this turn" would quietly answer with another turn's evidence.
    const rec = recorder();
    rec.sink({ phase: "mount", chatId: CHAT_A, toolNames: ["update_scene"] });
    rec.sink({ phase: "bus", chatId: CHAT_A, type: "snapshotPatched" });
    rec.sink({ phase: "flush", chatId: CHAT_A, turnId: TURN_1, path: "folded", fallbackReason: null });
    rec.sink({ phase: "flush", chatId: CHAT_A, turnId: TURN_2, path: "tool-round", fallbackReason: "no-terminal-channel" });

    expect(rec.recent({ turnId: TURN_1 }).map((record) => record.event.phase)).toEqual(["flush"]);
    expect(rec.recent({ turnId: TURN_2 })).toHaveLength(1);
  });

  test("limit tails the MOST RECENT matches, after filtering (not the first N of the ring)", () => {
    const rec = recorder();
    rec.sink({ phase: "bus", chatId: CHAT_B, type: "snapshotPatched" });
    rec.sink({ phase: "flush", chatId: CHAT_A, turnId: TURN_1, path: "folded", fallbackReason: null });
    rec.sink({ phase: "flush", chatId: CHAT_A, turnId: TURN_2, path: "folded", fallbackReason: null });

    const tail = rec.recent({ chatId: CHAT_A, limit: 1 });
    expect(tail).toHaveLength(1);
    expect(tail[0]?.event).toMatchObject({ turnId: TURN_2 });
  });
});
