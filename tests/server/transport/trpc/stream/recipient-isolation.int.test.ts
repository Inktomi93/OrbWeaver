import { declaredCapabilitySchema } from "@orb/contracts/inference";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { signInWithPassword } from "@orb/testkit/node/auth";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";

test("actual authenticated multiplexing enforces socket ownership and withholds foreign and pre-join replay/live bytes", async () => {
  await using harness = await createServerHarness({
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" },
    secretBoxKey: Buffer.alloc(32, 1),
  });
  const initialOwner = await harness.internalCallerFor(harness.ownerId);
  const handle = castId<Handle>("recipient-proof");
  const password = "a-real-recipient-password-through-production-login";
  const user = await initialOwner.admin.createUser({ handle, password });
  await initialOwner.settings.updateAppSettings({ partial: { localMultiUser: true } });
  const owner = await harness.internalCallerFor(harness.ownerId);
  const member = await harness.internalCallerFor(user.id);
  for (const [caller, userId] of [
    [owner, harness.ownerId],
    [member, user.id],
  ] as const) {
    const credential = await caller.credentials.add({ provider: "claude-sub", key: "recipient-control-physical-token", metadata: { auth: "oauthToken" } });
    const connection = await caller.connection.create({
      providerId: "claude-sub",
      credentialId: credential.id,
      baseUrl: null,
      model: "recipient-control-model",
      allowBackground: false,
      declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { output: { modalities: ["text"] } } }),
    });
    await harness.app.runtime.resolve({ task: "chat", connectionId: connection.id, principal: await harness.principalFor(userId), cachedFacts: true });
    await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  }
  const shared = (await owner.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const foreign = (await owner.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const own = (await member.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const hidden = await owner.chat.commitMessage({ chatId: shared.id, timeZone: UTC_TIME_ZONE, content: "pre-join-private-canon" });
  const anchor = await owner.chat.commitMessage({ chatId: shared.id, timeZone: UTC_TIME_ZONE, content: "inclusive-join-anchor" });
  const privateCanon = await owner.chat.commitMessage({ chatId: foreign.id, timeZone: UTC_TIME_ZONE, content: "foreign-private-canon" });
  const ownReplay = await member.chat.commitMessage({ chatId: own.id, timeZone: UTC_TIME_ZONE, content: "owned-replay-canon" });
  const hiddenMessage = hidden.messages[0];
  const anchorMessage = anchor.messages[0];
  const privateMessage = privateCanon.messages[0];
  const replayMessage = ownReplay.messages[0];
  if (hiddenMessage === undefined || anchorMessage === undefined || privateMessage === undefined || replayMessage === undefined) {
    throw new Error("the actual canon producers did not commit their scope controls");
  }
  const invitation = await owner.invites.createInvite({ chatId: shared.id, input: {} });
  const joined = await member.invites.redeemInvite({ token: invitation.token });
  expect(joined.participant.joinSeq).toBe(anchorMessage.seq);
  await owner.invites.setMemberHistoryVisibility({ chatId: shared.id, userId: user.id, visibility: "from-join" });
  const cookie = await signInWithPassword(harness, handle, password);
  const subscribed = new Set<ChatId>();
  const subscribe = harness.app.liveBuses.chat.subscribeChatEvents;
  const observation = vi.spyOn(harness.app.liveBuses.chat, "subscribeChatEvents").mockImplementation((chatId, signal): ReturnType<typeof subscribe> => {
    subscribed.add(chatId);
    return subscribe.call(harness.app.liveBuses.chat, chatId, signal);
  });
  const { socketId } = streamConnectInputSchema.parse({ socketId: harness.ids.uuid() });
  const address = new URL("http://localhost/api/trpc/stream.connect");
  address.searchParams.set("input", JSON.stringify({ socketId }));
  const stop = new AbortController();
  const response = await harness.http.request(address, { headers: { cookie, accept: "text/event-stream" }, signal: stop.signal });
  expect(response.status).toBe(200);
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("the actual authenticated subscription omitted its stream");
  }
  const decoder = new TextDecoder();
  let bytes = "";
  const readThrough = async (needle: string): Promise<void> => {
    while (!bytes.includes(needle)) {
      const next = await reader.read();
      if (next.done) {
        throw new Error("the actual subscription ended before its owned delivery barrier");
      }
      bytes += decoder.decode(next.value, { stream: true });
    }
  };
  let reading: Promise<void> | undefined;
  try {
    const first = await reader.read();
    expect(first.done).toBe(false);
    bytes += decoder.decode(first.value, { stream: true });
    await expect(owner.stream.attach({ socketId, ref: { channel: "chat", chatId: shared.id }, sinceSeq: 0 })).toThrowTRPCError("NOT_FOUND");
    // Draft-tolerant attachment accepts a known foreign ref but must never deliver its private canon.
    await member.stream.attach({ socketId, ref: { channel: "chat", chatId: foreign.id }, sinceSeq: 0 });
    await member.stream.attach({ socketId, ref: { channel: "chat", chatId: shared.id }, sinceSeq: 0 });
    await member.stream.attach({ socketId, ref: { channel: "chat", chatId: own.id }, sinceSeq: 0 });
    await expect.poll(() => subscribed.size).toBe(3);
    reading = readThrough(replayMessage.id);
    await reading;
    await owner.chat.editMessage({ chatId: shared.id, messageId: hiddenMessage.id, timeZone: UTC_TIME_ZONE, content: "pre-join-private-live-edit" });
    const privateLive = await owner.chat.commitMessage({ chatId: foreign.id, timeZone: UTC_TIME_ZONE, content: "foreign-private-live" });
    const visibleLive = await owner.chat.commitMessage({ chatId: shared.id, timeZone: UTC_TIME_ZONE, content: "post-join-visible-live" });
    const barrier = await member.chat.commitMessage({ chatId: own.id, timeZone: UTC_TIME_ZONE, content: "owned-live-delivery-barrier" });
    const barrierMessage = barrier.messages[0];
    const visibleMessage = visibleLive.messages[0];
    const privateLiveMessage = privateLive.messages[0];
    if (barrierMessage === undefined || visibleMessage === undefined || privateLiveMessage === undefined) {
      throw new Error("the actual live canon producers omitted their delivery barriers");
    }
    reading = readThrough(barrierMessage.id);
    await reading;
    reading = readThrough(visibleMessage.id);
    await reading;
    expect(bytes).toContain(replayMessage.id);
    expect(bytes).toContain("owned-replay-canon");
    expect(bytes).toContain("post-join-visible-live");
    expect(bytes).not.toContain(hiddenMessage.id);
    expect(bytes).not.toContain(privateMessage.id);
    expect(bytes).not.toContain(privateLiveMessage.id);
    expect(bytes).not.toContain("pre-join-private");
    expect(bytes).not.toContain("foreign-private");
  } finally {
    stop.abort();
    await Promise.allSettled([reading, reader.cancel()]);
    reader.releaseLock();
    observation.mockRestore();
  }
});
