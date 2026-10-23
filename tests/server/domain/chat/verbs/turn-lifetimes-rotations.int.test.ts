// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/engine/auto-mode.ts
import { messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";
import { TAIL_ROSTER } from "./turn-lifetimes-roster.ts";

const ROTATIONS = [
  { title: "a real two-seat list round adds exactly two chained turns after the human round", seats: 2, policy: "list", self: false, extra: 2 },
  { title: "a real pooled chain rotates through all three seats with self responses disabled", seats: 3, policy: "pooled", self: false, extra: 3 },
  { title: "a real pooled chain retains all-seat rotation when self responses are enabled", seats: 3, policy: "pooled", self: true, extra: 3 },
] as const;

test.for(ROTATIONS)("$title", async (scene) => {
  const turns = scene.seats + scene.extra;
  await using h = await textRoom(
    Array.from({ length: turns }, (_, index) => `A whole completed beat ${index + 1}.`),
    {
      characters: TAIL_ROSTER.slice(0, scene.seats),
      group: { output: "per-speaker", policy: scene.policy, allowSelfResponses: scene.self, autoMode: true, autoModeMaxTurns: scene.extra, autoModeDelayMs: 0 },
    },
  );
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Keep the exchange moving." });
  expect(outcome.aborted).toBe(false);
  await h.root.settleBackground();
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon).toHaveLength(turns + 1);
  expect(canon.map(({ role }) => role)).toEqual(["user", ...Array.from({ length: turns }, () => "assistant")]);
  const roster = h.characters.map(({ id }) => id);
  expect(canon.filter(({ role }) => role === "assistant").map(({ characterId }) => characterId)).toEqual([...roster, ...roster]);
  expect(h.requests.filter(({ method }) => method === "POST")).toHaveLength(turns);
});
