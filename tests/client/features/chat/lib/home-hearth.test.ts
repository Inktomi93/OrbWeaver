// Mirror unit test for features/chat/lib/home-hearth: which room Home resumes, and when an account is on its first run.

import type { ParticipantRole } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { isFirstRun, splitHearth } from "../../../../../packages/client/src/features/chat/lib/home-hearth.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function room(
  id: string,
  viewerLastTurnAt: number | null,
  viewerRole: ParticipantRole = "host",
): { readonly id: ChatId; readonly viewerLastTurnAt: number | null; readonly viewerRole: ParticipantRole } {
  return { id: castId<ChatId>(id), viewerLastTurnAt, viewerRole };
}

describe("splitHearth", () => {
  test("the hero is the room the viewer spoke in last, even below a busier room; the rest keep page order", () => {
    const busy = room("chat_busy", null);
    const older = room("chat_older", 1000);
    const mine = room("chat_mine", 3000);
    const { hearth, rest } = splitHearth([busy, older, mine]);
    expect(hearth?.id).toBe(mine.id);
    expect(rest.map((r) => r.id)).toEqual([busy.id, older.id]);
  });

  test("with no room the viewer spoke in, the hero is the newest room", () => {
    const { hearth, rest } = splitHearth([room("chat_a", null), room("chat_b", null)]);
    expect(hearth?.id).toBe("chat_a");
    expect(rest.map((r) => r.id)).toEqual(["chat_b"]);
  });

  // A friend who just joined through an invite has their own example rooms too, all newer than nothing they typed:
  // the room someone brought them into is the one Home points at.
  test("with no room the viewer spoke in, a room they were invited into leads their own newer rooms", () => {
    const { hearth, rest } = splitHearth([room("chat_seeded", null), room("chat_joined", null, "member"), room("chat_other", null)]);
    expect(hearth?.id).toBe("chat_joined");
    expect(rest.map((r) => r.id)).toEqual(["chat_seeded", "chat_other"]);
  });

  test("an empty page has no hero", () => {
    expect(splitHearth([])).toEqual({ hearth: undefined, rest: [] });
  });
});

describe("isFirstRun", () => {
  test("rooms and no turn is a first run; a turn, or no rooms at all, is not", () => {
    expect(isFirstRun({ totalCount: 1, viewerLastTurnAt: null })).toBe(true);
    expect(isFirstRun({ totalCount: 1, viewerLastTurnAt: 5 })).toBe(false);
    expect(isFirstRun({ totalCount: 0, viewerLastTurnAt: null })).toBe(false);
  });
});
