// A rebuild replaces an owner's rollups, and a delete retires canon from them, only while the canon it read is still the
// canon: a live write that lands between the read and the batch rolls the batch back and the read runs again, and a
// writer that outpaces every attempt gets a retry-later refusal with the live totals left as the live writes made them.
// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/stats/persistence/retire-canon.ts
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
import { TURN_ABORTED_OP_CODE } from "@orb/contracts/chat";
import type { OwnerStatsView } from "@orb/contracts/stats";
import { CANON_RETIREMENT_ATTEMPTS, STATS_REBUILD_ATTEMPTS } from "@orb/contracts/stats";
import { DomainUnavailableError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot, HeldDb } from "@orb/testkit/node/composed";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { textRoom } from "../../chat/scenario-physical.ts";

// Both batches open with this guard: it rewrites the owner's canon version only while the snapshot still holds.
const CANON_GUARD = /^insert into "stats_canon_versions".*\(SELECT COALESCE\(\(SELECT version FROM stats_canon_versions/u;

async function overview(h: ChatRoot): Promise<Omit<OwnerStatsView, "computedAt"> | undefined> {
  const view = await h.root.services.stats.overview(h.owner.userId);
  if (view === null) {
    return undefined;
  }
  const { computedAt: _computedAt, ...rest } = view;
  return rest;
}

/** Park every guarded batch `act` sends, land a live write in the room under it, then let it go; returns how many
 *  batches were raced and how `act` ended. */
async function outrun(held: Pick<HeldDb, "hold">, h: ChatRoot, act: () => Promise<unknown>): Promise<{ readonly raced: number; readonly error: unknown }> {
  let gate = held.hold(CANON_GUARD);
  const outcome = act().then(
    () => null,
    (error: unknown) => error,
  );
  let raced = 0;
  try {
    for (;;) {
      const step = await Promise.race([gate.reached.then(() => "held" as const), outcome.then(() => "settled" as const)]);
      if (step === "settled") {
        return { raced, error: await outcome };
      }
      gate.disarm();
      raced += 1;
      await h.root.app.chatRpgOps.postNarratorMessage(h.chatId, `The scene moves ${raced}.`);
      const parked = gate;
      gate = held.hold(CANON_GUARD);
      parked.release();
    }
  } finally {
    gate.release();
  }
}

async function spokenRoom(held: Pick<HeldDb, "db">): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await textRoom(["The first answer."], { server: { db: held.db } }));
  expect((await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Speak." })).aborted).toBe(false);
  await h.root.settleBackground();
  construction.move();
  return h;
}

test("a rebuild that a live write outruns on every attempt refuses with retry later and leaves the live totals", async () => {
  using held = await freshHeldDb();
  await using h = await spokenRoom(held);

  const { raced, error } = await outrun(held, h, () => h.root.services.stats.reconcile(h.owner.userId));
  expect(error).toBeInstanceOf(DomainUnavailableError);
  expect(raced).toBe(STATS_REBUILD_ATTEMPTS);
  const live = await overview(h);
  // Each racing narrator line is a turn the live writes counted.
  expect(live).toMatchObject({ userTurns: 1, assistantTurns: 1 + raced });
  // Control: with no writer racing it, the same rebuild commits and agrees with the live totals the refusal kept.
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await overview(h)).toEqual(live);
});

test("a room delete that a live write outruns on every attempt refuses with retry later and keeps the room and its totals", async () => {
  using held = await freshHeldDb();
  await using h = await spokenRoom(held);

  const { raced, error } = await outrun(held, h, () => h.root.services.chat.delete({ principal: h.owner, chatId: h.chatId }));
  expect(error).toMatchObject({ code: TURN_ABORTED_OP_CODE });
  expect(raced).toBe(CANON_RETIREMENT_ATTEMPTS);
  expect((await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.length).toBeGreaterThan(0);
  const live = await overview(h);
  expect(live).toMatchObject({ chats: 1, userTurns: 1, assistantTurns: 1 + raced });
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await overview(h)).toEqual(live);

  // Control: with no writer racing it, the same delete commits and takes the room out of the totals.
  await h.root.services.chat.delete({ principal: h.owner, chatId: h.chatId });
  expect(await overview(h)).toMatchObject({ chats: 0, userTurns: 0, assistantTurns: 0 });
});
