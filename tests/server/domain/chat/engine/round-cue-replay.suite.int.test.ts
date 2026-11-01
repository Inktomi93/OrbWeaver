// @subject packages/server/src/domain/chat/engine/round.ts
// A cue replays in the role it was delivered in, observed on the actual Anthropic converter, not a prepared-turn double.

import { expect, test } from "@orb/testkit/node";
import { OPENING_HISTORY, OPENING_OWNER_LINE, room } from "./round-cue-replay.fixtures.ts";

test("a cue replays in the role it was delivered in after the carry changes mid-chat", async () => {
  await using fixture = await room();
  const firstRound = await fixture.round("off");
  expect(firstRound.aborted).toBe(false);
  expect(firstRound.messages.filter(({ role }) => role === "assistant")).toHaveLength(2);
  const secondRound = await fixture.round("conversation");
  expect(secondRound.aborted).toBe(false);
  expect(secondRound.messages.filter(({ role }) => role === "assistant")).toHaveLength(2);
  const requests = await fixture.inputs();
  expect(requests).toHaveLength(4);
  const before = requests[0] ?? [];
  expect(before.slice(0, 2)).toEqual(OPENING_HISTORY);
  expect(before[2]).toMatchObject({ role: "user", content: [{ type: "text", text: expect.stringContaining(OPENING_OWNER_LINE) }] });
  expect(before.at(-1)).toMatchObject({ role: "user" });
  expect(requests[2]?.slice(0, before.length)).toEqual(before);
  expect(requests[3]?.slice(0, before.length)).toEqual(before);
});
