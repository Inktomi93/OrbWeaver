import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createActiveTurns } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("releasing an aborted registration cannot hide the replacement turn from Stop", async ({ ids }) => {
  const source = createIdSource(ids.next);
  const chatId = source.typeId(ID_PREFIX.chat);
  const ownerId = source.userId();
  const otherId = source.userId();
  await using turns = createActiveTurns();
  using old = turns.register(chatId, ownerId);
  expect(turns.abort(chatId, ownerId)).toEqual({ aborted: 1, foreignInFlight: false });
  using replacement = turns.register(chatId, ownerId);
  old.release();
  expect(turns.abort(chatId, otherId)).toEqual({ aborted: 0, foreignInFlight: true });
  expect(replacement.signal.aborted).toBe(false);
  expect(turns.abort(chatId, ownerId)).toEqual({ aborted: 1, foreignInFlight: false });
  expect(replacement.signal.aborted).toBe(true);
});

test("owned turn teardown aborts and joins bodies even after they leave the public registry", async ({ ids }) => {
  const source = createIdSource(ids.next);
  const chatId = source.typeId(ID_PREFIX.chat);
  const ownerId = source.userId();
  await using turns = createActiveTurns();
  using running = turns.register(chatId, ownerId);
  turns.abort(chatId, ownerId);
  let settled = false;
  const closing = turns[Symbol.asyncDispose]().then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(running.signal.aborted).toBe(true);
  expect(settled).toBe(false);
  running.release();
  await closing;
  expect(settled).toBe(true);
  expect(() => turns.register(chatId, ownerId)).toThrow("closed active-turn registry");
});
