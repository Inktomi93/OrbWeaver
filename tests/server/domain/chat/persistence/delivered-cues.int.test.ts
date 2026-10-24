// Each committed reply stores the cue it was delivered with (the cue and cueRole variant columns) and
// the next request replays it. The stored cue is a column no message view projects.
// @subject packages/server/src/domain/chat/engine/round.ts

import { messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { and, eq, gt, max } from "drizzle-orm";
import { OPENING_HISTORY, OPENING_OWNER_LINE, room, SIGNATURE, THINKING } from "../engine/round-cue-replay.fixtures.ts";

test("each committed reply carries its delivered cue, and every request opens with the one before it", async () => {
  await using fixture = await room();
  const { h } = fixture;
  const [head] = await h.root.db
    .select({ seq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.chatId, h.chatId));
  const firstRound = await fixture.round("conversation");
  expect(firstRound.aborted).toBe(false);
  expect(firstRound.messages.filter(({ role }) => role === "assistant")).toHaveLength(2);
  const first = await fixture.inputs();
  expect(first).toHaveLength(2);
  expect(first[0]?.slice(0, 3)).toEqual([...OPENING_HISTORY, { role: "user", content: [{ type: "text", text: OPENING_OWNER_LINE }] }]);
  const cues = await h.root.db
    .select({ cue: messageVariants.cue, role: messageVariants.cueRole, reasoning: messageVariants.reasoning })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant"), gt(messages.seq, head?.seq ?? 0)))
    .orderBy(messages.seq);
  expect(cues).toHaveLength(2);
  expect(cues.map(({ role }) => role)).toEqual(["turn-scoped-system", "user"]);
  expect(cues.every(({ reasoning }) => reasoning === THINKING)).toBe(true);
  for (const [index, cue] of cues.entries()) {
    if (cue.cue === null) {
      throw new Error("the actual signed group reply has no persisted delivered cue");
    }
    expect(JSON.stringify(first[index]?.at(-1))).toContain(cue.cue);
  }
  expect(first[0]?.at(-1)).toMatchObject({ role: "system", ["clear_at"]: "next_user_message" });
  expect(JSON.stringify(first[1])).toContain(SIGNATURE);
  const secondRound = await fixture.round("conversation");
  expect(secondRound.aborted).toBe(false);
  expect(secondRound.messages.filter(({ role }) => role === "assistant")).toHaveLength(2);
  const requests = await fixture.inputs();
  expect(requests).toHaveLength(4);
  for (const later of [1, 2, 3]) {
    const before = requests[later - 1] ?? [];
    expect(requests[later]?.slice(0, before.length), `request ${later} opens with request ${later - 1}`).toEqual(before);
  }
});
