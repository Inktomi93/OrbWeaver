import "@orb/testkit/node/composed-real.ts";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ServicesResult } from "@orb/server/entry/compose";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

type ChatFrame = Parameters<Parameters<ServicesResult["liveBuses"]["chat"]["subscribeAllChatEvents"]>[0]>[0];
const FUTURE_WORKLOAD_MS = 10_000;

test("concurrent graphs with identical IDs neither deliver foreign room events nor dispose each other's channels", async () => {
  await using first = await createServerHarness();
  await using second = await createServerHarness();
  expect(first.ownerId).toBe(second.ownerId);
  const firstCaller = await first.internalCallerFor(first.ownerId);
  const secondCaller = await second.internalCallerFor(second.ownerId);
  const firstChat = (await firstCaller.chat.startChat({ characterIds: [] })).chat;
  const secondChat = (await secondCaller.chat.startChat({ characterIds: [] })).chat;
  expect(firstChat.id).toBe(secondChat.id);
  const input = createRegexScriptSchema.parse({ name: "owned", findRegex: "x", replaceString: "y", placement: [] });
  const firstScript = await firstCaller.regex.createScript({ input });
  const secondScript = await secondCaller.regex.createScript({ input });
  expect(firstScript.id).toBe(secondScript.id);
  await firstCaller.regex.attachToChat({ chatId: firstChat.id, scriptId: firstScript.id });
  await secondCaller.regex.attachToChat({ chatId: secondChat.id, scriptId: secondScript.id });
  await first.settleBackground();
  await second.settleBackground();

  const firstFrames: ChatFrame[] = [];
  const secondFrames: ChatFrame[] = [];
  const stopFirst = first.app.liveBuses.chat.subscribeAllChatEvents((frame) => firstFrames.push(frame));
  const stopSecond = second.app.liveBuses.chat.subscribeAllChatEvents((frame) => secondFrames.push(frame));
  try {
    await secondCaller.regex.updateScript({ scriptId: secondScript.id, input: { name: "second only" } });
    expect(firstFrames).toEqual([]);
    expect(secondFrames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: secondChat.id, entity: "regex" } }]);
    secondFrames.length = 0;
    await first[Symbol.asyncDispose]();
    await secondCaller.regex.updateScript({ scriptId: secondScript.id, input: { name: "still live" } });
    expect(firstFrames).toEqual([]);
    expect(secondFrames).toEqual([{ seq: null, event: { type: "roomEntityChanged", chatId: secondChat.id, entity: "regex" } }]);
    expect(() => first.app.liveBuses.chat.subscribeAllChatEvents(() => undefined)).toThrow();
  } finally {
    stopFirst();
    stopSecond();
  }
});

test("same-ID nested roots coalesce only their own bulk gesture and disposal cannot disable the other coalescer", async () => {
  await using first = await createServerHarness();
  await using second = await createServerHarness();
  const firstCaller = await first.internalCallerFor(first.ownerId);
  const secondCaller = await second.internalCallerFor(second.ownerId);
  const firstChat = (await firstCaller.chat.startChat({ characterIds: [] })).chat;
  const secondChat = (await secondCaller.chat.startChat({ characterIds: [] })).chat;
  expect(firstChat.id).toBe(secondChat.id);
  const input = createRegexScriptSchema.parse({ name: "bulk", findRegex: "x", replaceString: "y", placement: [] });
  const firstScript = await firstCaller.regex.createScript({ input });
  const secondScript = await secondCaller.regex.createScript({ input });
  expect(firstScript.id).toBe(secondScript.id);
  await firstCaller.regex.attachToChat({ chatId: firstChat.id, scriptId: firstScript.id });
  await secondCaller.regex.attachToChat({ chatId: secondChat.id, scriptId: secondScript.id });
  await Promise.all([first.settleBackground(), second.settleBackground()]);
  const firstFrames: ChatFrame[] = [];
  const secondFrames: ChatFrame[] = [];
  const stopFirst = first.app.liveBuses.chat.subscribeAllChatEvents((frame) => firstFrames.push(frame));
  const stopSecond = second.app.liveBuses.chat.subscribeAllChatEvents((frame) => secondFrames.push(frame));
  try {
    await first.app.liveBuses.quiet.withQuietBulkFanout(async () => {
      await firstCaller.regex.updateScript({ scriptId: firstScript.id, input: { name: "first 1" } });
      await first.settleBackground();
      await first.app.liveBuses.quiet.withQuietBulkFanout(async () => {
        await firstCaller.regex.updateScript({ scriptId: firstScript.id, input: { name: "first nested" } });
        await first.settleBackground();
      });
      await second.app.liveBuses.quiet.withQuietBulkFanout(async () => {
        await secondCaller.regex.updateScript({ scriptId: secondScript.id, input: { name: "second 1" } });
        await secondCaller.regex.updateScript({ scriptId: secondScript.id, input: { name: "second 2" } });
        await second.settleBackground();
      });
      await firstCaller.regex.updateScript({ scriptId: firstScript.id, input: { name: "first 3" } });
      await first.settleBackground();
    });
    const expected = Array.from({ length: 2 }, () => ({ seq: null, event: { type: "roomEntityChanged", chatId: firstChat.id, entity: "regex" } }));
    expect(firstFrames).toEqual(expected);
    expect(secondFrames).toEqual(expected);
    await first[Symbol.asyncDispose]();
    await expect(first.app.liveBuses.quiet.withQuietBulkFanout(async () => undefined)).rejects.toThrow("quiet fanout is disposed");
    secondFrames.length = 0;
    await second.app.liveBuses.quiet.withQuietBulkFanout(async () => {
      await secondCaller.regex.updateScript({ scriptId: secondScript.id, input: { name: "second after 1" } });
      await secondCaller.regex.updateScript({ scriptId: secondScript.id, input: { name: "second after 2" } });
      await second.settleBackground();
    });
    expect(secondFrames).toEqual(expected);
  } finally {
    stopFirst();
    stopSecond();
  }
});

test("same-ID RPG producers stay on their graph and disposal joins its subscriber without closing the sibling", async () => {
  await using first = await createServerHarness();
  await using second = await createServerHarness();
  const firstPrincipal = await first.principalFor(first.ownerId);
  const secondPrincipal = await second.principalFor(second.ownerId);
  const firstCaller = await first.internalCallerFor(first.ownerId);
  const secondCaller = await second.internalCallerFor(second.ownerId);
  const firstChat = (await firstCaller.chat.startChat({ characterIds: [] })).chat;
  const secondChat = (await secondCaller.chat.startChat({ characterIds: [] })).chat;
  expect(firstChat.id).toBe(secondChat.id);
  const abort = new AbortController();
  const firstStream = first.app.liveBuses.rpg.subscribeRpgEvents(firstChat.id, abort.signal)[Symbol.asyncIterator]();
  const secondStream = second.app.liveBuses.rpg.subscribeRpgEvents(secondChat.id, abort.signal)[Symbol.asyncIterator]();
  let firstDelivered = false;
  const firstNext = firstStream.next().then((frame) => {
    firstDelivered = true;
    return frame;
  });
  const secondNext = secondStream.next();
  try {
    const secondGame = await second.services.rpg.createGame({ principal: secondPrincipal, chatId: secondChat.id, mode: "lite" });
    expect((await secondNext).value).toEqual({ type: "gameChanged", chatId: secondChat.id });
    expect(firstDelivered).toBe(false);
    const firstGame = await first.services.rpg.createGame({ principal: firstPrincipal, chatId: firstChat.id, mode: "lite" });
    expect(firstGame.gameId).toBe(secondGame.gameId);
    expect((await firstNext).value).toEqual({ type: "gameChanged", chatId: firstChat.id });
    const stopped = expect(firstStream.next()).rejects.toMatchObject({ name: "AbortError" });
    await first[Symbol.asyncDispose]();
    await stopped;
    const stillLive = secondStream.next();
    await second.services.rpg.updateConfig({ principal: secondPrincipal, chatId: secondChat.id, patch: { steeringNote: "still live" } });
    expect((await stillLive).value).toEqual({ type: "gameChanged", chatId: secondChat.id });
  } finally {
    abort.abort();
    await Promise.allSettled([firstStream.return?.(), secondStream.return?.()]);
  }
});

test("same-ID workload cancellation keeps independent replay rings and disposing one graph clears only its ring", async () => {
  await using first = await createServerHarness();
  await using second = await createServerHarness();
  const firstPrincipal = await first.principalFor(first.ownerId);
  const secondPrincipal = await second.principalFor(second.ownerId);
  await Promise.all([first.settleBackground(), second.settleBackground()]);
  for (const [harness, principal] of [
    [first, firstPrincipal],
    [second, secondPrincipal],
  ] as const) {
    for (const row of await harness.services.workloads.list({ caller: principal, kind: "refresh-model-catalog" })) {
      await harness.services.workloads.cancel({ caller: principal, id: row.id });
    }
  }
  const firstRun = await first.services.workloads.start({
    caller: firstPrincipal,
    ownerId: first.ownerId,
    input: { kind: "refresh-model-catalog", params: {} },
    mode: "bulk",
    scheduledAt: first.clock.now() + FUTURE_WORKLOAD_MS,
  });
  const secondRun = await second.services.workloads.start({
    caller: secondPrincipal,
    ownerId: second.ownerId,
    input: { kind: "refresh-model-catalog", params: {} },
    mode: "bulk",
    scheduledAt: second.clock.now() + FUTURE_WORKLOAD_MS,
  });
  expect(firstRun.id).toBe(secondRun.id);
  const secondResult = await second.services.workloads.cancel({ caller: secondPrincipal, id: secondRun.id });
  expect(secondResult.status).toBe("cancelled");
  const expected = [{ type: "cancelled", workloadId: secondRun.id, kind: "refresh-model-catalog", at: second.clock.now() }];
  expect(first.app.liveBuses.workloads.getRecentWorkloadEvents(firstRun.id)).toEqual([]);
  expect(second.app.liveBuses.workloads.getRecentWorkloadEvents(secondRun.id)).toEqual(expected);
  await first.services.workloads.cancel({ caller: firstPrincipal, id: firstRun.id });
  expect(first.app.liveBuses.workloads.getRecentWorkloadEvents(firstRun.id)).toEqual(expected);
  await first[Symbol.asyncDispose]();
  expect(first.app.liveBuses.workloads.getRecentWorkloadEvents(firstRun.id)).toEqual([]);
  expect(second.app.liveBuses.workloads.getRecentWorkloadEvents(secondRun.id)).toEqual(expected);
  expect((await second.services.workloads.get({ caller: secondPrincipal, id: secondRun.id })).status).toBe("cancelled");
});
