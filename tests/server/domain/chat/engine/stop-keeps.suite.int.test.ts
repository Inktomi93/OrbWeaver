// The caller's Stop keeps what streamed: the text so far commits as the reply, marked stopped on its terminal
// reason, with the cut call's spend estimated. A Stop before any prose keeps nothing, and the kept reply reads
// as an ordinary message to every member on every delivery path.
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/engine/pipeline.ts
// @subject packages/server/src/domain/chat/engine/round.ts

import type { ChatBusEvent, MessageView, TurnAbortReason } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, readRoomCanon } from "@orb/testkit/node/composed";
import { TAIL_ROSTER } from "../verbs/turn-lifetimes-roster.ts";
import type { CoreWireReply } from "./core-physical.ts";
import { coreFrame, coreHeldReply, coreHttpRoom, corePartialReply, coreProse } from "./core-physical.ts";

const KEPT = "The lantern gutters as the door";
const USER_STOP = "user" satisfies TurnAbortReason;

type Outcome = Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["send"]>>;

/** Start a turn, wait until `streamedText` has reached the room's bus, press Stop, and return what settled. */
async function stopOnceStreamed(
  h: ChatRoot,
  streamedText: string,
  start: () => Promise<Outcome>,
): Promise<{ readonly outcome: Outcome; readonly events: readonly ChatBusEvent[] }> {
  const events: ChatBusEvent[] = [];
  const seen = Promise.withResolvers<void>();
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId !== h.chatId) {
        return;
      }
      events.push(event);
      if (event.type === "delta" && event.delta.kind === "text" && event.delta.text.includes(streamedText)) {
        seen.resolve();
      }
    }),
  );
  const running = start();
  const settled = Promise.allSettled([running]);
  try {
    await Promise.race([
      seen.promise,
      running.then(() => {
        throw new Error("the turn settled before its streamed text reached the bus");
      }),
    ]);
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    const outcome = await running;
    await h.root.settleBackground();
    return { outcome, events: [...events] };
  } finally {
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    await settled;
  }
}

function lastAssistant(rows: readonly MessageView[]): MessageView {
  const row = rows.findLast(({ role }) => role === "assistant");
  if (row === undefined) {
    throw new Error("the room holds no assistant row");
  }
  return row;
}

function send(h: ChatRoot): () => Promise<Outcome> {
  return () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Tell me what you see." });
}

function textFrame(text: string): string {
  return coreFrame({ choices: [{ delta: { content: text } }] });
}

test("a Stop after streamed text commits it as the reply, marked stopped, with the cut call's spend estimated", async () => {
  const partial = corePartialReply([textFrame(KEPT)]);
  await using h = await coreHttpRoom([partial.respond]);
  const { outcome, events } = await stopOnceStreamed(h, KEPT, send(h));
  await partial.closed;
  expect(outcome).toMatchObject({ aborted: true, abortReason: USER_STOP });
  expect(outcome.messages.map(({ role, content }) => [role, content])).toEqual([
    ["user", "Tell me what you see."],
    ["assistant", KEPT],
  ]);
  const rows = await readRoomCanon(h.root, h.owner, h.chatId);
  expect(rows.map(({ role }) => role)).toEqual(["user", "assistant"]);
  const kept = lastAssistant(rows);
  expect(kept).toMatchObject({
    content: KEPT,
    finishReason: null,
    terminalReason: USER_STOP,
    tokenProvenance: "estimated",
    costUsd: null,
    costProvenance: "unrecorded",
  });
  expect(kept.model).not.toBeNull();
  expect(kept.tokensIn).toBeGreaterThan(0);
  expect(kept.tokensOut).toBeGreaterThan(0);
  const types = events.map(({ type }) => type);
  expect(types).toContain("messageCommitted");
  expect(types).not.toContain("turnCompleted");
  expect(types.indexOf("messageCommitted")).toBeLessThan(types.indexOf("turnAborted"));
  expect(events.filter((event) => event.type === "turnAborted")).toMatchObject([{ reason: USER_STOP }]);
  // The live stats write agrees with a rebuild from canon, so the estimated spend is a real accounting row.
  const live = await h.root.services.stats.overview(h.owner.userId);
  expect(live?.tokensOut).toBe(kept.tokensOut);
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await h.root.services.stats.overview(h.owner.userId)).toEqual(live);
});

test("a Stop before any text keeps no reply, while the user's own line stays", async () => {
  const held = coreHeldReply();
  await using h = await coreHttpRoom([held.respond]);
  const running = send(h)();
  const settled = Promise.allSettled([running]);
  try {
    await held.reached;
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    const outcome = await running;
    expect(outcome).toMatchObject({ aborted: true, abortReason: USER_STOP });
    expect(outcome.messages.map(({ role }) => role)).toEqual(["user"]);
    expect((await readRoomCanon(h.root, h.owner, h.chatId)).map(({ role }) => role)).toEqual(["user"]);
  } finally {
    held.release();
    await settled;
  }
});

test("the save pass rewrites a kept reply exactly as it rewrites a finished one", async () => {
  const partial = corePartialReply([textFrame(KEPT)]);
  await using h = await coreHttpRoom([partial.respond]);
  const script = await h.caller.regex.createScript({
    input: createRegexScriptSchema.parse({
      name: "lamp",
      findRegex: "lantern",
      replaceString: "lamp",
      targets: ["AI_OUTPUT"],
      passes: ["save"],
    }),
  });
  await h.caller.regex.attachGlobal({ scriptId: script.id });
  const { outcome } = await stopOnceStreamed(h, KEPT, send(h));
  expect(outcome.aborted).toBe(true);
  const kept = lastAssistant(await readRoomCanon(h.root, h.owner, h.chatId));
  expect(kept.content).toBe(KEPT.replace("lantern", "lamp"));
  expect(kept.content).not.toBe(KEPT);
});

test("a kept reply keeps the reasoning that streamed before the Stop", async () => {
  const thinking = "The door is the threat.";
  const partial = corePartialReply([coreFrame({ choices: [{ delta: { reasoning: thinking } }] }), textFrame(KEPT)]);
  await using h = await coreHttpRoom([partial.respond]);
  await stopOnceStreamed(h, KEPT, send(h));
  expect(lastAssistant(await readRoomCanon(h.root, h.owner, h.chatId))).toMatchObject({ content: KEPT, reasoning: thinking });
});

test("a kept reply starts no post-turn memory build, where a finished reply in the same room does", async () => {
  const partial = corePartialReply([textFrame(KEPT)]);
  await using h = await coreHttpRoom([(): Response => coreProse("The first reply finishes."), partial.respond], { memoryEnabled: true });
  const builds = (): number => h.root.observability.traces(200).filter((trace) => trace.rootName === "memory.turnCompleted").length;
  await send(h)();
  await h.root.settleBackground();
  expect(builds()).toBe(1);
  await stopOnceStreamed(h, KEPT, send(h));
  expect(builds()).toBe(1);
  expect(lastAssistant(await readRoomCanon(h.root, h.owner, h.chatId)).content).toBe(KEPT);
});

test("a Stop during a group round ends the round with the committed speaker and the kept reply", async () => {
  const partial = corePartialReply([textFrame(KEPT)]);
  const replies: readonly CoreWireReply[] = [(): Response => coreProse("Aria answers first."), partial.respond];
  await using h = await coreHttpRoom(replies, { characters: TAIL_ROSTER });
  const { outcome, events } = await stopOnceStreamed(h, KEPT, send(h));
  expect(outcome).toMatchObject({ aborted: true, abortReason: USER_STOP });
  expect(outcome.messages.map(({ content }) => content)).toEqual(["Tell me what you see.", "Aria answers first.", KEPT]);
  const rows = await readRoomCanon(h.root, h.owner, h.chatId);
  expect(rows.map(({ role, characterId }) => [role, characterId])).toEqual([
    ["user", null],
    ["assistant", h.characters[0]?.id],
    ["assistant", h.characters[1]?.id],
  ]);
  expect(events.filter(({ type }) => type === "turnStarted")).toHaveLength(2);
});

test("a co-member reads the kept reply at commit, on the live socket and on durable replay", async () => {
  const partial = corePartialReply([textFrame(KEPT)]);
  await using h = await coreHttpRoom([partial.respond]);
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  await h.root.settleBackground();
  const memberCaller = await h.root.internalCallerFor(member.userId);
  const { socketId } = streamConnectInputSchema.parse({ socketId: h.root.ids.uuid() });
  const stop = new AbortController();
  const frames = (await (await h.root.internalCallerFor(member.userId, stop.signal)).stream.connect({ socketId }))[Symbol.asyncIterator]();
  // The in-process caller yields tRPC's tracked envelope where its types promise the client's unwrapped frame, so
  // the case reads each frame as the bytes the socket would carry.
  const live: string[] = [];
  const aborted = JSON.stringify({ type: "turnAborted" }).slice(1, -1);
  try {
    await frames.next();
    await memberCaller.stream.attach({ socketId, ref: { channel: "chat", chatId: h.chatId } });
    await stopOnceStreamed(h, KEPT, send(h));
    for (let next = await frames.next(); !next.done; next = await frames.next()) {
      const frame = JSON.stringify(next.value);
      live.push(frame);
      if (frame.includes(aborted)) {
        break;
      }
    }
  } finally {
    stop.abort();
    await frames.return?.();
  }
  const committed = live.findIndex((frame) => frame.includes(JSON.stringify({ type: "messageCommitted" }).slice(1, -1)) && frame.includes(KEPT));
  expect(committed).toBeGreaterThanOrEqual(0);
  expect(committed).toBeLessThan(live.length - 1);
  expect(live.at(-1)).toContain(JSON.stringify({ reason: USER_STOP }).slice(1, -1));
  expect(lastAssistant((await h.root.services.chat.listMessages({ principal: member, chatId: h.chatId })).messages).content).toBe(KEPT);
  const replayed = (await h.root.services.chat.replayChatEvents({ principal: member, chatId: h.chatId })).map(({ event }) => event);
  const replayedTypes = replayed.map(({ type }) => type);
  expect(replayed.find((event) => event.type === "messageCommitted" && event.view?.role === "assistant")).toMatchObject({ view: { content: KEPT } });
  expect(replayedTypes.lastIndexOf("messageCommitted")).toBeLessThan(replayedTypes.lastIndexOf("turnAborted"));
});

test("a continue completes a kept reply once; a second Stop during it keeps the longer text and completes nothing", async () => {
  const tail = " creaks open on its own.";
  const first = corePartialReply([textFrame(KEPT)]);
  const second = corePartialReply([textFrame(" swings")]);
  await using h = await coreHttpRoom([first.respond, (): Response => coreProse(tail), second.respond]);
  await stopOnceStreamed(h, KEPT, send(h));
  const kept = lastAssistant(await readRoomCanon(h.root, h.owner, h.chatId));
  const completions: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId && event.type === "turnCompleted") {
        completions.push(event);
      }
    }),
  );
  const continued = await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: kept.id });
  expect(continued.aborted).toBe(false);
  await h.root.settleBackground();
  const finished = lastAssistant(await readRoomCanon(h.root, h.owner, h.chatId));
  expect(finished.content.startsWith(KEPT)).toBe(true);
  expect(finished.content.endsWith(tail)).toBe(true);
  expect(finished.terminalReason).toBeNull();
  expect(completions).toMatchObject([{ intent: "continue", messageId: kept.id }]);
  await stopOnceStreamed(h, " swings", () => h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: kept.id }));
  const longer = lastAssistant(await readRoomCanon(h.root, h.owner, h.chatId));
  expect(longer.content.startsWith(finished.content)).toBe(true);
  expect(longer.content.endsWith(" swings")).toBe(true);
  expect(longer.terminalReason).toBe(USER_STOP);
  expect(completions).toHaveLength(1);
});

/** A folded game room: the state planes ride the character turn, so a completed reply runs exactly one state round. */
async function gameRoom(replies: readonly CoreWireReply[]): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await coreHttpRoom(replies));
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, silencesProse: false } },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  await h.root.services.rpg.createGame({ principal: h.owner, chatId: h.chatId, mode: "lite" });
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, extractionMode: "folded" });
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("a stopped game reply runs no state round; the continue that completes it runs exactly one, a stopped continue none", async () => {
  const partial = corePartialReply([textFrame(KEPT)]);
  const again = corePartialReply([textFrame(" Then silence")]);
  // The continue's state round is one more call; it records nothing, a quiet beat.
  await using h = await gameRoom([partial.respond, (): Response => coreProse(" creaks open."), (): Response => coreProse(""), again.respond]);
  const rounds = (name: string): number => h.root.observability.traces(200).filter((trace) => trace.rootName === name).length;
  await stopOnceStreamed(h, KEPT, () => h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId }));
  expect(rounds("rpg.turnAborted")).toBe(1);
  expect(rounds("rpg.turnCompleted")).toBe(0);
  const kept = lastAssistant(await readRoomCanon(h.root, h.owner, h.chatId));
  expect(kept).toMatchObject({ content: KEPT, terminalReason: USER_STOP });
  const continued = await h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: kept.id });
  expect(continued.aborted).toBe(false);
  await h.root.settleBackground();
  expect(rounds("rpg.turnCompleted")).toBe(1);
  expect(rounds("rpg.turnAborted")).toBe(1);
  await stopOnceStreamed(h, " Then silence", () => h.root.services.chat.continueTurn({ principal: h.owner, chatId: h.chatId, messageId: kept.id }));
  expect(lastAssistant(await readRoomCanon(h.root, h.owner, h.chatId)).content.endsWith(" Then silence")).toBe(true);
  expect(rounds("rpg.turnCompleted")).toBe(1);
  expect(rounds("rpg.turnAborted")).toBe(2);
});
