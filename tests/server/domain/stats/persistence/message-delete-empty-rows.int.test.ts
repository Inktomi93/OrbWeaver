// Deleting messages leaves no empty timeline bucket and no empty model row: a rebuild from canon writes a row only for a
// grain something still lands on, so the live rollups drop a bucket or a model whose last turn was deleted and keep
// one that still holds another turn.
// @subject packages/server/src/domain/stats/persistence/retained-chat-accounting.ts
// @subject packages/server/src/domain/chat/substrate/stats-delta.ts
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
import type { ActivityBucket, ModelStatRow } from "@orb/contracts/stats";
import type { MessageId } from "@orb/kit/ids";
import { CALENDAR_BUCKET_MS } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { textRoom } from "../../chat/scenario-physical.ts";

interface Shown {
  readonly timeline: readonly ActivityBucket[];
  readonly models: readonly ModelStatRow[];
}

async function shown(h: ChatRoot): Promise<Shown> {
  const stats = h.root.services.stats;
  return { timeline: await stats.timeseries(h.owner.userId), models: await stats.byModel(h.owner.userId) };
}

/** A turn one bucket after the last clock read, so it lands in a timeline bucket of its own; returns its message ids. */
async function turnInNewBucket(h: ChatRoot, content: string): Promise<readonly MessageId[]> {
  h.root.clock.advance(CALENDAR_BUCKET_MS);
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content });
  await h.root.settleBackground();
  return outcome.messages.map((row) => row.id);
}

/** What the live writes left, then what a rebuild from canon gives. */
async function liveThenRebuilt(h: ChatRoot): Promise<{ readonly live: Shown; readonly rebuilt: Shown }> {
  const live = await shown(h);
  await h.root.services.stats.reconcile(h.owner.userId);
  return { live, rebuilt: await shown(h) };
}

test("deleting the only turn of a bucket and of a model leaves neither row, on the live path and after a rebuild", async () => {
  await using h = await textRoom(["The only answer."]);
  const turn = await turnInNewBucket(h, "Speak once.");
  const before = await shown(h);
  expect(before.models).toEqual([expect.objectContaining({ generations: 1 })]);

  h.root.clock.advance(CALENDAR_BUCKET_MS);
  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: h.chatId, messageIds: turn });

  const { live, rebuilt } = await liveThenRebuilt(h);
  // The room's own bucket stays, because its creation counts there; the turn's bucket and the model row are gone.
  expect(live.timeline).toHaveLength(before.timeline.length - 1);
  expect(live.timeline).toEqual([expect.objectContaining({ chatsCreated: 1, userTurns: 0, assistantTurns: 0 })]);
  expect(live.models).toEqual([]);
  expect(rebuilt).toEqual(live);
});

test("deleting one of two turns keeps the model row the other turn still fills, and drops only the emptied bucket", async () => {
  await using h = await textRoom(["The first answer.", "The second answer."]);
  await turnInNewBucket(h, "Speak once.");
  const second = await turnInNewBucket(h, "Speak twice.");
  const before = await shown(h);
  expect(before.models).toEqual([expect.objectContaining({ generations: 2 })]);

  h.root.clock.advance(CALENDAR_BUCKET_MS);
  await h.root.services.chat.deleteMessages({ principal: h.owner, chatId: h.chatId, messageIds: second });

  const { live, rebuilt } = await liveThenRebuilt(h);
  expect(live.timeline).toHaveLength(before.timeline.length - 1);
  expect(live.models).toEqual([expect.objectContaining({ generations: 1 })]);
  expect(rebuilt).toEqual(live);
});
