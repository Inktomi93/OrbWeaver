// One room with a turn held mid-stream by a scripted provider, and real sockets read as the browser reads them.

import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { ChatId, Handle, TagId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { decodeStreamChunk } from "@orb/testkit/iso";
import { expect } from "@orb/testkit/node";
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
import { z } from "zod";
import { coreFrame, coreProse, coreSse } from "../../../domain/chat/engine/core-physical.ts";
import { signedInMember } from "../../../entry/_auth-roots.ts";

export const THOUGHT = "Weighing the witness. ";
export const SECRET_HEAD = "ledger-truth-";
export const SECRET_TAIL = "held-past-the-join";
/** The hidden span opens before the join and closes after it: a read that loses the scrub state leaks the tail. */
export const BEFORE_JOIN = ["The opening ", "stays public. ", '<lie character="Witness" truth="', SECRET_HEAD];
export const AFTER_JOIN = [`${SECRET_TAIL}"/>`, " The close", " lands live."];
/** The tokens a held reply streams before it waits: the reasoning, then the text. */
export const tokenCount = BEFORE_JOIN.length + 1;
export const FULL_TEXT = [...BEFORE_JOIN, ...AFTER_JOIN].join("");
export const OPENING = "The opening stays public.";
const HOST_PASSWORD = "a-real-late-join-host-password";

const frameSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat), seq: z.number(), event: z.custom<ChatBusEvent>() });
const wireEnvelopeSchema = z.object({
  channel: z.string().optional(),
  type: z.string().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  ref: z.object({ channel: z.string() }).optional(),
  cursor: z.number().nullable().optional(),
  event: z.object({ type: z.string().optional(), tagId: typeIdSchema(ID_PREFIX.tag).optional() }).optional(),
});

export interface Frame {
  readonly chatId: ChatId;
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** A signed-in account, with or without a chair in the room. */
export interface Account {
  readonly id: UserId;
  readonly cookie: string;
}

const heldChair: unique symbol = Symbol("held chair");

/** An account that holds a chair in the room. Only this file mints one, so `openDevice` cannot hand an outsider `frames`. */
export interface Seat extends Account {
  readonly [heldChair]: true;
}

/** One device's real multiplexed socket, read frame by frame as the browser reads it. */
export interface Device {
  readonly socketId: ReturnType<typeof streamConnectInputSchema.parse>["socketId"];
  readonly frames: readonly Frame[];
  /** The cursor each `roomLagged` notice carried, in arrival order. */
  readonly lagCursors: readonly (number | null)[];
  /** Every `user` room event the socket delivered, in arrival order: its type and the tag it names, if any. */
  readonly userEvents: readonly { readonly type: string; readonly tagId?: TagId }[];
  readonly attach: () => Promise<void>;
  readonly waitFor: (done: (frames: readonly Frame[]) => boolean) => Promise<void>;
  readonly close: () => Promise<void>;
}

/** The socket of an account with no chair. It has no `frames`: nothing moves a socket's bytes into a list until a read
 *  pulls them, so a list read with no pull is empty whatever the server sent. */
export interface OutsiderDevice {
  /** Attach the room and the account's own `user` room, and return once the socket confirms both. */
  readonly attach: () => Promise<void>;
  /** Every chat frame the socket delivered ahead of a fresh barrier: a `createTag` by this account, whose `tagsChanged`
   *  rides the `user` room. The socket drains one queue in order, so the read covers everything queued before the verb
   *  ran. Each room has its own pump into that queue, and the chat pump can lag, so a frame it queues late falls after
   *  this read: pair it with a frame from the chat pump itself, as `takeChair` gives. A room fault rejects the read, so a
   *  dead pump cannot pass for a refusal. */
  readonly drained: () => Promise<readonly Frame[]>;
  /** Seat this account, and read the same socket as a seated device from here on. */
  readonly takeChair: () => Promise<Device>;
  readonly close: () => Promise<void>;
}

/** What one socket has delivered so far, by lane. */
interface SocketLog {
  readonly frames: Frame[];
  readonly lagCursors: (number | null)[];
  readonly userEvents: { readonly type: string; readonly tagId?: TagId }[];
  readonly controls: Set<string | undefined>;
  readonly attachedChannels: Set<string>;
  readonly barrierTagIds: Set<TagId>;
}

interface RoomSocket extends Pick<Device, "socketId" | "close"> {
  readonly log: SocketLog;
  readonly pullUntil: (done: () => boolean) => Promise<void>;
}

function logControl(log: SocketLog, envelope: z.infer<typeof wireEnvelopeSchema>): void {
  log.controls.add(envelope.type);
  if (envelope.type === "roomLagged") {
    log.lagCursors.push(envelope.cursor ?? null);
  }
  if (envelope.type === "roomFailed") {
    throw new Error(`the ${envelope.ref?.channel} room failed with ${envelope.code}: ${envelope.message}`);
  }
  if (envelope.type === "attached" && envelope.ref !== undefined) {
    log.attachedChannels.add(envelope.ref.channel);
  }
}

function logWireLine(log: SocketLog, line: string): void {
  const raw: unknown = JSON.parse(line.slice("data: ".length));
  const envelope = wireEnvelopeSchema.parse(raw);
  if (envelope.channel === "chat") {
    log.frames.push(frameSchema.parse(raw));
  } else if (envelope.channel !== "user") {
    logControl(log, envelope);
  } else {
    const { type = "", tagId } = envelope.event ?? {};
    log.userEvents.push(tagId === undefined ? { type } : { type, tagId });
    if (tagId !== undefined) {
      log.barrierTagIds.add(tagId);
    }
  }
}

async function openSocket(root: ServerTestHarness, account: Account): Promise<RoomSocket> {
  const { socketId } = streamConnectInputSchema.parse({ socketId: root.ids.uuid() });
  const address = new URL("http://localhost/api/trpc/stream.connect");
  address.searchParams.set("input", JSON.stringify({ socketId }));
  const stop = new AbortController();
  const response = await root.http.request(address, { headers: { cookie: account.cookie, accept: "text/event-stream" }, signal: stop.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("the socket omitted its stream");
  }
  const decoder = new TextDecoder();
  const log: SocketLog = { frames: [], lagCursors: [], userEvents: [], controls: new Set(), attachedChannels: new Set(), barrierTagIds: new Set() };
  let pending = "";
  const pull = async (): Promise<void> => {
    const next = await reader.read();
    if (next.done) {
      throw new Error("the socket ended before its delivery barrier");
    }
    pending += decodeStreamChunk(decoder, next.value);
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines.filter((candidate) => candidate.startsWith("data: {"))) {
      logWireLine(log, line);
    }
  };
  const pullUntil = async (done: () => boolean): Promise<void> => {
    while (!done()) {
      await pull();
    }
  };
  await pullUntil(() => log.controls.has("serverReady"));
  return {
    socketId,
    log,
    pullUntil,
    close: async (): Promise<void> => {
      stop.abort();
      await reader.cancel().catch(() => undefined);
    },
  };
}

function seatedDevice(room: Room, socket: RoomSocket, seat: Seat): Device {
  return {
    socketId: socket.socketId,
    frames: socket.log.frames,
    lagCursors: socket.log.lagCursors,
    userEvents: socket.log.userEvents,
    attach: async (): Promise<void> => {
      const caller = await room.root.internalCallerFor(seat.id);
      await caller.stream.attach({ socketId: socket.socketId, ref: { channel: "chat", chatId: room.chatId } });
    },
    waitFor: (done) => socket.pullUntil(() => done(socket.log.frames)),
    close: socket.close,
  };
}

export async function openDevice(room: Room, seat: Seat): Promise<Device> {
  return seatedDevice(room, await openSocket(room.root, seat), seat);
}

export async function openOutsider(room: Room, account: Account): Promise<OutsiderDevice> {
  const socket = await openSocket(room.root, account);
  const { socketId, log } = socket;
  return {
    attach: async (): Promise<void> => {
      const caller = await room.root.internalCallerFor(account.id);
      await caller.stream.attach({ socketId, ref: { channel: "chat", chatId: room.chatId } });
      await caller.stream.attach({ socketId, ref: { channel: "user" } });
      await socket.pullUntil(() => log.attachedChannels.has("chat") && log.attachedChannels.has("user"));
    },
    drained: async (): Promise<readonly Frame[]> => {
      const caller = await room.root.internalCallerFor(account.id);
      const barrier = await caller.tag.createTag({ input: { name: `delivery-barrier-${room.root.ids.uuid()}` } });
      await socket.pullUntil(() => log.barrierTagIds.has(barrier.id));
      return [...log.frames];
    },
    takeChair: async (): Promise<Device> => seatedDevice(room, socket, await seatAccount(room, account)),
    close: socket.close,
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

export interface Room extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly chatId: ChatId;
  readonly host: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly hostSeat: Seat;
  /** The reply the next provider request streams. */
  readonly reply: () => Reply;
  /** Arm a fresh held reply for the next turn. */
  readonly rearm: () => void;
  /** Answer every later provider request at once with this finished text. */
  readonly answerWith: (text: string) => void;
  /** Answer every later provider request at once with these tokens, one stream frame each, ending on `finishReason`. */
  readonly answerInChunks: (chunks: readonly string[], finishReason?: string) => void;
  /** The bytes of every chat completion request so far: what the model actually received. */
  readonly prompts: () => readonly string[];
  readonly send: () => Promise<unknown>;
  /** Wait until `count` tokens stand in the room's log. */
  readonly tokensLogged: (count?: number) => Promise<void>;
}

export async function openRoom(): Promise<Room> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: FULL_TEXT,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  let reply = heldReply();
  const prompts: string[] = [];
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      logLevel: "warn",
      startJobs: false,
      env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" },
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
          return await provider.execute(request);
        }
        prompts.push(await request.text());
        return reply.respond();
      },
    }),
  );
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
  construction.defer(() => presence.abort());
  const lifetime = construction.move();
  return {
    root,
    chatId,
    host,
    hostSeat: { id: host.userId, cookie: hostCookie, [heldChair]: true },
    reply: (): Reply => reply,
    rearm: (): void => {
      reply = heldReply();
    },
    answerWith: (text): void => {
      reply = { ...reply, respond: (): Response => coreProse(text) };
    },
    answerInChunks: (chunks, finishReason): void => {
      const usage = terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 }, ...(finishReason === undefined ? {} : { finishReason }) });
      reply = { ...reply, respond: (): Response => coreSse([...chunks.map((content) => coreFrame({ choices: [{ delta: { content } }] })), usage]) };
    },
    prompts: () => prompts,
    send: () => root.services.chat.send({ principal: host, chatId, content: "Begin the witness turn." }),
    tokensLogged: async (count = tokenCount): Promise<void> => {
      await expect
        .poll(async () => {
          const log = await root.services.chat.replayChatEvents({ principal: host, chatId });
          return log.filter(({ event }) => event.type === "delta").length;
        })
        .toBe(count);
    },
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

async function seatAccount(room: Room, account: Account): Promise<Seat> {
  const guest = await room.root.principalFor(account.id);
  const invite = await seedChatInvite(room.root, { principal: room.host, chatId: room.chatId, input: { invitedHandle: guest.handle } });
  await seedInvitedChatParticipant(room.root, { principal: guest, inviteId: invite.invite.id });
  return { ...account, [heldChair]: true };
}

export async function admit(room: Room, handle: string): Promise<Seat> {
  return await seatAccount(room, await signedInMember(room.root, castId<Handle>(handle)));
}

/** The stored member stamps, read through the host's verbatim replay: each text token's stamp, or the token itself
 *  where the producer stamped it identical. */
export async function storedMemberBytes(room: Room): Promise<string> {
  const log = await room.root.services.chat.replayChatEvents({ principal: room.host, chatId: room.chatId });
  return log.flatMap(({ event }) => (event.type === "delta" && event.delta.kind === "text" ? [event.memberText ?? event.delta.text] : [])).join("");
}

export type Guest = Awaited<ReturnType<Room["root"]["principalFor"]>>;

/** The member-facing planes that carry any of the secret. */
export async function leaks(room: Room, device: Device, guest: Guest): Promise<readonly string[]> {
  const planes = {
    live: JSON.stringify(device.frames),
    stored: await storedMemberBytes(room),
    replay: JSON.stringify(await room.root.services.chat.replayChatEvents({ principal: guest, chatId: room.chatId })),
  };
  return Object.entries(planes)
    .filter(([, bytes]) => bytes.includes(SECRET_HEAD) || bytes.includes(SECRET_TAIL))
    .map(([plane]) => plane);
}

/** A seated member's device, attached before a host turn stops inside its hidden span. */
export async function memberWatching(room: Room, handle: string): Promise<{ readonly device: Device; readonly guest: Guest }> {
  const seat = await admit(room, handle);
  const device = await openDevice(room, seat);
  await device.attach();
  await device.waitFor((frames) => frames.length > 0);
  return { device, guest: await room.root.principalFor(seat.id) };
}

export const typesOf = (frames: readonly Frame[]): readonly string[] => frames.map(({ event }) => event.type);
export const channelOf = (frames: readonly Frame[], kind: "text" | "reasoning"): string =>
  frames.flatMap(({ event }) => (event.type === "delta" && event.delta.kind === kind ? [event.delta.text] : [])).join("");
export const textOf = (frames: readonly Frame[]): string => channelOf(frames, "text");
export const ended = (frames: readonly Frame[]): boolean => typesOf(frames).some((type) => type === "turnCompleted" || type === "turnAborted");
