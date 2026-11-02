// One room with a turn held mid-stream by a scripted provider, and real sockets read as the browser reads them.

import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
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

export interface Frame {
  readonly chatId: ChatId;
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** One device's real multiplexed socket, read frame by frame as the browser reads it. */
export interface Device {
  readonly socketId: string;
  readonly frames: readonly Frame[];
  readonly attach: () => Promise<void>;
  readonly waitFor: (done: (frames: readonly Frame[]) => boolean) => Promise<void>;
  readonly close: () => Promise<void>;
}

export async function openDevice(root: ServerTestHarness, userId: UserId, cookie: string, chatId: ChatId): Promise<Device> {
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
    pending += decodeStreamChunk(decoder, next.value);
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines.filter((candidate) => candidate.startsWith("data: {"))) {
      const raw: unknown = JSON.parse(line.slice("data: ".length));
      const envelope = z.object({ channel: z.string().optional(), type: z.string().optional() }).parse(raw);
      if (envelope.channel === "chat") {
        frames.push(frameSchema.parse(raw));
      } else {
        controls.push(envelope.type);
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

export interface Room extends AsyncDisposable {
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
  const root = await createServerHarness({
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
    [Symbol.asyncDispose]: async (): Promise<void> => {
      presence.abort();
      await root[Symbol.asyncDispose]();
    },
  };
}

export async function admit(room: Room, handle: string): Promise<{ readonly id: UserId; readonly cookie: string }> {
  const seat = await signedInMember(room.root, castId<Handle>(handle));
  const guest = await room.root.principalFor(seat.id);
  const invite = await seedChatInvite(room.root, { principal: room.host, chatId: room.chatId, input: { invitedHandle: guest.handle } });
  await seedInvitedChatParticipant(room.root, { principal: guest, inviteId: invite.invite.id });
  return seat;
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
  const device = await openDevice(room.root, seat.id, seat.cookie, room.chatId);
  await device.attach();
  await device.waitFor((frames) => frames.length > 0);
  return { device, guest: await room.root.principalFor(seat.id) };
}

export const typesOf = (frames: readonly Frame[]): readonly string[] => frames.map(({ event }) => event.type);
export const channelOf = (frames: readonly Frame[], kind: "text" | "reasoning"): string =>
  frames.flatMap(({ event }) => (event.type === "delta" && event.delta.kind === kind ? [event.delta.text] : [])).join("");
export const textOf = (frames: readonly Frame[]): string => channelOf(frames, "text");
export const ended = (frames: readonly Frame[]): boolean => typesOf(frames).some((type) => type === "turnCompleted" || type === "turnAborted");
