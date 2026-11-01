// A device that attaches to the chat room with no cursor while a turn streams receives that turn so far, in one
// fold, then the live tail, through the real socket and under each viewer's scope.
// @subject packages/server/src/transport/trpc/stream/sources/chat.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  captureCookieAuth,
  connectDevice,
  createCorpusProviderExecution,
  createServerHarness,
  seedChatInvite,
  seedCorpusActors,
  seedInvitedChatParticipant,
} from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreProse } from "../../../domain/chat/engine/core-physical.ts";
import { signedInMember } from "../../../entry/_auth-roots.ts";

const THOUGHT = "Weighing the witness. ";
const SECRET_HEAD = "ledger-truth-";
const SECRET_TAIL = "held-past-the-join";
/** The hidden span opens before the join and closes after it: a read that loses the scrub state leaks the tail. */
const BEFORE_JOIN = ["The opening ", "stays public. ", '<lie character="Witness" truth="', SECRET_HEAD];
const AFTER_JOIN = [`${SECRET_TAIL}"/>`, " The close", " lands live."];
const FULL_TEXT = [...BEFORE_JOIN, ...AFTER_JOIN].join("");
const OPENING = "The opening stays public.";
const HOST_PASSWORD = "a-real-late-join-host-password";

interface Frame {
  readonly chatId: ChatId;
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** One device's real multiplexed socket, read frame by frame as the browser reads it. */
interface Device {
  readonly socketId: string;
  readonly frames: readonly Frame[];
  readonly attach: () => Promise<void>;
  readonly waitFor: (done: (frames: readonly Frame[]) => boolean) => Promise<void>;
  readonly close: () => Promise<void>;
}

async function openDevice(root: ServerTestHarness, userId: UserId, cookie: string, chatId: ChatId): Promise<Device> {
  const { socketId } = streamConnectInputSchema.parse({ socketId: root.ids.uuid() });
  const address = new URL("http://localhost/api/trpc/stream.connect");
  address.searchParams.set("input", JSON.stringify({ socketId }));
  const stop = new AbortController();
  const response = await root.http.request(address, { headers: { cookie, accept: "text/event-stream" }, signal: stop.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("the socket omitted its stream");
  }
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let pending = "";
  const controls: (string | undefined)[] = [];
  const pull = async (): Promise<void> => {
    const next = await reader.read();
    if (next.done) {
      throw new Error("the socket ended before its delivery barrier");
    }
    pending += decoder.decode(next.value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines.filter((candidate) => candidate.startsWith("data: {"))) {
      const frame = JSON.parse(line.slice("data: ".length)) as { readonly channel?: string; readonly type?: string } & Frame;
      if (frame.channel === "chat") {
        frames.push(frame);
      } else {
        controls.push(frame.type);
      }
    }
  };
  while (!controls.includes("serverReady")) {
    await pull();
  }
  return {
    socketId,
    frames,
    attach: async (): Promise<void> => {
      const caller = await root.internalCallerFor(userId);
      await caller.stream.attach({ socketId, ref: { channel: "chat", chatId } });
    },
    waitFor: async (done): Promise<void> => {
      while (!done(frames)) {
        await pull();
      }
    },
    close: async (): Promise<void> => {
      stop.abort();
      await reader.cancel().catch(() => undefined);
    },
  };
}

/** The provider's reply bytes: the opening tokens now, the rest when the test releases them. */
function heldReply(): { readonly release: () => void; readonly fail: () => void; readonly respond: () => Response } {
  const released = Promise.withResolvers<boolean>();
  const encoder = new TextEncoder();
  const line = (body: string): Uint8Array => encoder.encode(`${body}\n\n`);
  const frame = (delta: Record<string, string>): Uint8Array => line(`data: ${JSON.stringify({ choices: [{ delta }] })}`);
  return {
    release: (): void => released.resolve(true),
    fail: (): void => released.resolve(false),
    respond: (): Response =>
      new Response(
        new ReadableStream<Uint8Array>({
          async start(controller): Promise<void> {
            controller.enqueue(frame({ ["reasoning_content"]: THOUGHT }));
            for (const content of BEFORE_JOIN) {
              controller.enqueue(frame({ content }));
            }
            if (!(await released.promise)) {
              controller.error(new Error("the scripted provider dropped the stream"));
              return;
            }
            for (const content of AFTER_JOIN) {
              controller.enqueue(frame({ content }));
            }
            controller.enqueue(line(terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })));
            controller.enqueue(line("data: [DONE]"));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  };
}

type Reply = ReturnType<typeof heldReply>;

interface Room extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly chatId: ChatId;
  readonly host: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly hostCookie: string;
  /** The reply the next provider request streams. */
  readonly reply: () => Reply;
  /** Arm a fresh held reply for the next turn. */
  readonly rearm: () => void;
  /** Answer every later provider request at once with this finished text. */
  readonly answerWith: (text: string) => void;
  readonly send: () => Promise<unknown>;
  /** Wait until `count` tokens stand in the room's log. */
  readonly tokensLogged: (count?: number) => Promise<void>;
}

async function openRoom(): Promise<Room> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: FULL_TEXT,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  let reply = heldReply();
  const root = await createServerHarness({
    startJobs: false,
    env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      return request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions") ? reply.respond() : await provider.execute(request);
    },
  });
  const { owner: host } = await seedCorpusActors(root);
  const connection = await root.services.connection.create({
    principal: host,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, reasoning: { mode: "adaptive", enabled: true } },
      features: { detectServer: false, reasoningKeys: ["reasoning_content"] },
    },
  });
  await (await root.internalCallerFor(host.userId)).connection.setBinding({ task: "chat", connectionId: connection.id });
  const hostCookie = (await captureCookieAuth(root, host, HOST_PASSWORD)).cookie;
  const card = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle: "late-join-witness", name: "Witness", description: "A hidden-span witness." }),
  });
  const chatId = (await root.services.chat.startChat({ principal: host, characterIds: [card.id], opening: "none" })).chat.id;
  const presence = new AbortController();
  await connectDevice(root, host.userId, presence.signal);
  return {
    root,
    chatId,
    host,
    hostCookie,
    reply: (): Reply => reply,
    rearm: (): void => {
      reply = heldReply();
    },
    answerWith: (text): void => {
      reply = { ...reply, respond: (): Response => coreProse(text) };
    },
    send: () => root.services.chat.send({ principal: host, chatId, content: "Begin the witness turn." }),
    tokensLogged: async (count = BEFORE_JOIN.length + 1): Promise<void> => {
      await expect
        .poll(async () => {
          const log = await root.services.chat.replayChatEvents({ principal: host, chatId });
          return log.filter(({ event }) => event.type === "delta").length;
        })
        .toBe(count);
    },
    [Symbol.asyncDispose]: async (): Promise<void> => {
      presence.abort();
      await root[Symbol.asyncDispose]();
    },
  };
}

async function admit(room: Room, handle: string): Promise<{ readonly id: UserId; readonly cookie: string }> {
  const seat = await signedInMember(room.root, castId<Handle>(handle));
  const guest = await room.root.principalFor(seat.id);
  const invite = await seedChatInvite(room.root, { principal: room.host, chatId: room.chatId, input: { invitedHandle: guest.handle } });
  await seedInvitedChatParticipant(room.root, { principal: guest, inviteId: invite.invite.id });
  return seat;
}

const typesOf = (frames: readonly Frame[]): readonly string[] => frames.map(({ event }) => event.type);
const channelOf = (frames: readonly Frame[], kind: "text" | "reasoning"): string =>
  frames.flatMap(({ event }) => (event.type === "delta" && event.delta.kind === kind ? [event.delta.text] : [])).join("");
const textOf = (frames: readonly Frame[]): string => channelOf(frames, "text");
const ended = (frames: readonly Frame[]): boolean => typesOf(frames).some((type) => type === "turnCompleted" || type === "turnAborted");

// A reload, a second tab and a second device reach the server as this one attach: a fresh socket with no cursor.
test("a device with no cursor shows the turn so far at once, then the live tail, with one copy of every token", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames) === BEFORE_JOIN.join(""));
    const types = typesOf(device.frames);
    expect(types[0]).toBe("chatOpened");
    expect(types.indexOf("turnStarted")).toBeGreaterThan(0);
    expect(types.indexOf("turnStarted")).toBeLessThan(types.indexOf("delta"));
    // One fold per channel, however many tokens it covers: the reasoning run, then the text run.
    expect(device.frames.filter(({ event }) => event.type === "delta").map(({ event }) => event.type === "delta" && event.delta.kind)).toEqual([
      "reasoning",
      "text",
    ]);
    expect(channelOf(device.frames, "reasoning")).toBe(THOUGHT);

    room.reply().release();
    await turn;
    await device.waitFor(ended);
    expect(textOf(device.frames)).toBe(FULL_TEXT);
    expect(channelOf(device.frames, "reasoning")).toBe(THOUGHT);
    const seqs = device.frames.filter(({ event }) => event.type !== "chatOpened").map(({ seq }) => seq);
    expect(seqs).toEqual([...new Set(seqs)].toSorted((a, b) => a - b));
  } finally {
    await device.close();
  }
});

test("a member who opens the room inside a hidden span reads only the bytes the live stream gives a member", async () => {
  await using room = await openRoom();
  const member = await admit(room, "late-join-member");
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, member.id, member.cookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames).startsWith(OPENING));
    room.reply().release();
    await turn;
    await device.waitFor(ended);
    const bytes = JSON.stringify(device.frames);
    expect(bytes).not.toContain(SECRET_HEAD);
    expect(bytes).not.toContain(SECRET_TAIL);
    expect(textOf(device.frames)).toContain(OPENING);
    expect(textOf(device.frames)).toContain("The close lands live.");
  } finally {
    await device.close();
  }
});

test("a seat that holds no chair in the room gets no frame of the turn", async () => {
  await using room = await openRoom();
  const outsider = await signedInMember(room.root, castId<Handle>("late-join-outsider"));
  const seated = await admit(room, "late-join-seated");
  const turn = room.send();
  await room.tokensLogged();
  const stranger = await openDevice(room.root, outsider.id, outsider.cookie, room.chatId);
  const barrier = await openDevice(room.root, seated.id, seated.cookie, room.chatId);
  try {
    await stranger.attach();
    await barrier.attach();
    await barrier.waitFor((frames) => textOf(frames).length > 0);
    room.reply().release();
    await turn;
    await barrier.waitFor(ended);
    expect(stranger.frames).toEqual([]);
  } finally {
    await stranger.close();
    await barrier.close();
  }
});

test("a from-join member attaching while the host rerolls a pre-join row gets none of its tokens", async () => {
  await using room = await openRoom();
  const first = room.send();
  await room.tokensLogged();
  room.reply().release();
  const outcome = (await first) as { readonly messages: readonly { readonly id: string; readonly role: string }[] };
  const target = outcome.messages.find((message) => message.role === "assistant");
  if (target === undefined) {
    throw new Error("the first turn committed no assistant row");
  }
  await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content: "the join anchor" });
  const member = await admit(room, "late-join-floored");
  await room.root.services.chat.setMemberHistoryVisibility({ principal: room.host, chatId: room.chatId, userId: member.id, visibility: "from-join" });
  room.rearm();
  const swipe = room.root.services.chat.swipe({ principal: room.host, chatId: room.chatId, messageId: castId(target.id) });
  await room.tokensLogged(2 * (BEFORE_JOIN.length + 1) + AFTER_JOIN.length);
  const device = await openDevice(room.root, member.id, member.cookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => typesOf(frames).includes("turnStarted"));
    room.reply().release();
    await swipe;
    await device.waitFor(ended);
    expect(textOf(device.frames)).toBe("");
    expect(channelOf(device.frames, "reasoning")).toBe("");
  } finally {
    await device.close();
  }
});

test("a turn that aborts mid-replay closes the joiner's ghost, and a device arriving after it opens no ghost", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  const late = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames).length > 0);
    await room.root.services.chat.abort({ principal: room.host, chatId: room.chatId });
    room.reply().fail();
    await turn.catch(() => undefined);
    await device.waitFor(ended);
    await late.attach();
    await late.waitFor((frames) => frames.length > 0);
    await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content: "the barrier row" });
    await late.waitFor((frames) => typesOf(frames).includes("messageCommitted"));
    expect(typesOf(late.frames).filter((type) => type === "delta" || type === "turnStarted" || type === "turnAccepted")).toEqual([]);
  } finally {
    await device.close();
    await late.close();
  }
});

test("a swipe in flight reaches a joiner as a swipe of its target, carrying only the new generation", async () => {
  await using room = await openRoom();
  const first = room.send();
  await room.tokensLogged();
  room.reply().release();
  const outcome = (await first) as { readonly messages: readonly { readonly id: string; readonly role: string }[] };
  const target = outcome.messages.find((message) => message.role === "assistant");
  if (target === undefined) {
    throw new Error("the first turn committed no assistant row");
  }
  room.rearm();
  const logged = BEFORE_JOIN.length + 1 + AFTER_JOIN.length;
  const swipe = room.root.services.chat.swipe({ principal: room.host, chatId: room.chatId, messageId: castId(target.id) });
  await room.tokensLogged(logged + BEFORE_JOIN.length + 1);
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames) === BEFORE_JOIN.join(""));
    const opened = device.frames.find(({ event }) => event.type === "turnStarted")?.event;
    expect(opened).toMatchObject({ intent: "swipe", targetMessageId: target.id });
    room.reply().release();
    await swipe;
    await device.waitFor(ended);
    expect(textOf(device.frames)).toBe(FULL_TEXT);
  } finally {
    await device.close();
  }
});

test("a refused send during a turn leaves a joiner the whole ghost", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  await room.send();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames) === BEFORE_JOIN.join(""));
    expect(typesOf(device.frames)).toContain("turnStarted");
    room.reply().release();
    await turn;
    await device.waitFor((frames) => textOf(frames) === FULL_TEXT);
  } finally {
    await device.close();
  }
});

test("a refused send inside a hidden span keeps the secret's tail from a member, live and on replay", async () => {
  await using room = await openRoom();
  const member = await admit(room, "late-join-refused");
  const guest = await room.root.principalFor(member.id);
  const device = await openDevice(room.root, member.id, member.cookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => frames.length > 0);
    const turn = room.send();
    await room.tokensLogged();
    await room.root.services.chat.send({ principal: guest, chatId: room.chatId, content: "A member speaks mid-span." });
    room.reply().release();
    await turn;
    await device.waitFor((frames) => textOf(frames).includes("The close lands live."));
    const replayed = await room.root.services.chat.replayChatEvents({ principal: guest, chatId: room.chatId });
    for (const bytes of [JSON.stringify(device.frames), JSON.stringify(replayed)]) {
      expect(bytes).not.toContain(SECRET_HEAD);
      expect(bytes).not.toContain(SECRET_TAIL);
    }
  } finally {
    await device.close();
  }
});

test("a generate finishing inside a send's hidden span keeps the secret's tail from a member, and a joiner keeps the send's ghost", async () => {
  await using room = await openRoom();
  const member = await admit(room, "late-join-generate");
  const guest = await room.root.principalFor(member.id);
  const watcher = await openDevice(room.root, member.id, member.cookie, room.chatId);
  try {
    await watcher.attach();
    await watcher.waitFor((frames) => frames.length > 0);
    const turn = room.send();
    await room.tokensLogged();
    const held = room.reply();
    room.answerWith("A side reply lands.");
    await room.root.services.chat.generate({ principal: room.host, chatId: room.chatId });
    const joiner = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
    try {
      await joiner.attach();
      await joiner.waitFor((frames) => textOf(frames).startsWith(BEFORE_JOIN.join("")));
      held.release();
      await turn;
      await watcher.waitFor((frames) => textOf(frames).includes("The close lands live."));
      await joiner.waitFor((frames) => textOf(frames).includes(FULL_TEXT));
    } finally {
      await joiner.close();
    }
    const replayed = await room.root.services.chat.replayChatEvents({ principal: guest, chatId: room.chatId });
    for (const bytes of [JSON.stringify(watcher.frames), JSON.stringify(replayed)]) {
      expect(bytes).not.toContain(SECRET_HEAD);
      expect(bytes).not.toContain(SECRET_TAIL);
    }
  } finally {
    await watcher.close();
  }
});

test("a device that drops after its attach notice reconnects at a floor that replays the turn's head", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  const revived = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames).length > 0);
    const floor = device.frames.find(({ event }) => event.type === "chatOpened")?.seq;
    const caller = await room.root.internalCallerFor(room.host.userId);
    await caller.stream.attach({ socketId: revived.socketId, ref: { channel: "chat", chatId: room.chatId }, sinceSeq: floor ?? null });
    await revived.waitFor((frames) => textOf(frames) === BEFORE_JOIN.join(""));
    expect(typesOf(revived.frames)).toContain("turnStarted");
    room.reply().release();
    await turn;
  } finally {
    await device.close();
    await revived.close();
  }
});

test("a joiner gets the turn's user row even when its own list predates it", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames).length > 0);
    const commit = device.frames.find(({ event }) => event.type === "messageCommitted")?.event;
    expect(commit).toMatchObject({ view: { role: "user" } });
    room.reply().release();
    await turn;
  } finally {
    await device.close();
  }
});
