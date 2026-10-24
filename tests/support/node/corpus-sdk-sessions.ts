// Native session membership comes from actual canon, resolution, Query and the connection-owned writer.
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { ChatResult, Resolved } from "@orb/inference";
import { toChatRequest } from "@orb/inference";
import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedCorpusAccount } from "./corpus-auth.ts";
import { CORPUS_SDK_EMPTY, CORPUS_SDK_HOLD, CORPUS_SDK_MODEL, CORPUS_SDK_QUERY, CORPUS_SDK_REUSE, CORPUS_SDK_TOKEN } from "./corpus-sdk-protocol.ts";
import type { createCorpusSdkExecution } from "./corpus-sdk-wire.ts";
import { seedUserConnection } from "./factories/connection.ts";
import { seedUserCredential } from "./factories/credentials.ts";
import { captureSdkSessionRows } from "./factories/rows.ts";
import type { ServerTestHarness } from "./server.ts";

type SdkRows = Awaited<ReturnType<typeof captureSdkSessionRows>>;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
interface SdkActor {
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly credential: Awaited<ReturnType<typeof seedUserCredential>>;
  readonly connection: Awaited<ReturnType<typeof seedUserConnection>>;
}
interface SdkCapture {
  readonly result: ChatResult;
  readonly rows: SdkRows;
}
interface CorpusSdkSessions extends SdkActor {
  readonly alternateConnection: Awaited<ReturnType<typeof seedUserConnection>>;
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly source: Awaited<ReturnType<ServerTestHarness["app"]["chatRpgOps"]["postNarratorMessage"]>>;
  readonly empty: SdkCapture & { readonly room: CorpusSdkSessions["room"] };
  readonly seeded: SdkCapture;
  readonly reused: SdkCapture;
  readonly rewound: SdkCapture;
  readonly branched: SdkCapture;
  readonly readopted: SdkCapture;
  readonly reseeded: SdkCapture;
  readonly restored: SdkCapture;
  readonly alternate: SdkCapture;
  readonly foreign: { readonly refusal: Error; readonly before: SdkRows; readonly after: SdkRows; readonly callsBefore: number; readonly callsAfter: number };
  readonly cancellation: Error;
  readonly receipts: ReturnType<typeof createCorpusSdkExecution>["receipts"];
  readonly exits: readonly Pick<ReturnType<typeof createCorpusSdkExecution>["children"][number], "exitCode" | "signalCode">[];
  readonly rows: SdkRows;
}

async function savedSdkConnection(root: ServerTestHarness, actor: Pick<SdkActor, "principal" | "credential">): ReturnType<typeof seedUserConnection> {
  return await seedUserConnection(root, {
    principal: actor.principal,
    providerId: "claude-sub",
    credentialId: actor.credential.view.id,
    baseUrl: null,
    model: CORPUS_SDK_MODEL,
    allowBackground: true,
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { input: ["text"] } }),
  });
}

/** Save a subscription connection through its actual actor, credential and binding admission. */
export async function seedCorpusSdkActor(root: ServerTestHarness): Promise<SdkActor> {
  const principal = await seedCorpusAccount(root);
  const credential = await seedUserCredential(root, { principal, provider: "claude-sub", key: CORPUS_SDK_TOKEN });
  const connection = await savedSdkConnection(root, { principal, credential });
  await root.services.connection.setBinding({ principal, task: "chat", connectionId: connection.id });
  return { principal, credential, connection };
}

/** A dedicated real actor keeps this cohort from changing existing owner's stats/library captures. */
export async function seedCorpusSdkSessions(root: ServerTestHarness, wire: ReturnType<typeof createCorpusSdkExecution>): Promise<CorpusSdkSessions> {
  const { principal, credential, connection } = await seedCorpusSdkActor(root);
  const caller = await root.internalCallerFor(principal.userId);
  const resolve = async (connectionId: UserConnectionId): Promise<Resolved<"chat">> => {
    const { resolved } = await root.app.runtime.resolve({ principal, connectionId, task: "chat", cachedFacts: true });
    if (resolved.task !== "chat") {
      throw new Error("native SDK corpus lost its actual chat task");
    }
    return { ...resolved, task: resolved.task };
  };
  const captured = (chatId: ChatId, connectionId = connection.id): ReturnType<typeof captureSdkSessionRows> =>
    captureSdkSessionRows(root.db, chatId, connectionId);
  const runCanon = async (chatId: ChatId, connectionId = connection.id): Promise<ChatResult> => {
    const history = (await caller.chat.listMessages({ chatId })).messages.map((message) => ({
      role: message.role,
      content: [{ type: "text" as const, text: message.content }],
    }));
    return await root.app.runtime.executor.runChatTurn(
      toChatRequest({
        connection: await resolve(connectionId),
        chatId,
        params: {},
        systemPrompt: { static: "", dynamic: "" },
        history,
      }),
    );
  };
  const emptyRoom = await caller.chat.startChat({ characterIds: [], opening: "none" });
  await caller.chat.commitMessage({ chatId: emptyRoom.chat.id, content: CORPUS_SDK_EMPTY, timeZone: UTC_TIME_ZONE });
  const emptyResult = await runCanon(emptyRoom.chat.id);
  const empty = { room: emptyRoom, result: emptyResult, rows: await captured(emptyRoom.chat.id) };

  const room = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const opening = await caller.chat.commitMessage({ chatId: room.chat.id, content: "The original SDK ledger begins.", timeZone: UTC_TIME_ZONE });
  const source = await root.app.chatRpgOps.postNarratorMessage(room.chat.id, "The original SDK branch is recorded.");
  await caller.chat.commitMessage({ chatId: room.chat.id, content: CORPUS_SDK_QUERY, timeZone: UTC_TIME_ZONE });
  const seeded = { result: await runCanon(room.chat.id), rows: await captured(room.chat.id) };
  const reused = {
    result: await root.app.runtime.executor.runChatTurn({
      api: "agent-sdk",
      connection: await resolve(connection.id),
      chatId: room.chat.id,
      prompt: CORPUS_SDK_REUSE,
      systemPrompt: { static: "", dynamic: "" },
      params: {},
    }),
    rows: await captured(room.chat.id),
  };
  const rewound = { result: await runCanon(room.chat.id), rows: await captured(room.chat.id) };
  await caller.chat.editMessage({
    chatId: room.chat.id,
    messageId: source.messageId,
    content: "The alternative SDK branch is recorded.",
    timeZone: UTC_TIME_ZONE,
  });
  const branched = { result: await runCanon(room.chat.id), rows: await captured(room.chat.id) };
  await caller.chat.editMessage({
    chatId: room.chat.id,
    messageId: source.messageId,
    content: "The original SDK branch is recorded.",
    timeZone: UTC_TIME_ZONE,
  });
  const readopted = { result: await runCanon(room.chat.id), rows: await captured(room.chat.id) };
  const firstUser = opening.messages[0];
  if (firstUser === undefined) {
    throw new Error("native SDK canon has no opening user identity");
  }
  await caller.chat.editMessage({ chatId: room.chat.id, messageId: firstUser.id, content: "An unrelated SDK ledger begins.", timeZone: UTC_TIME_ZONE });
  const reseeded = { result: await runCanon(room.chat.id), rows: await captured(room.chat.id) };
  await caller.chat.editMessage({ chatId: room.chat.id, messageId: firstUser.id, content: firstUser.content, timeZone: UTC_TIME_ZONE });
  const restored = { result: await runCanon(room.chat.id), rows: await captured(room.chat.id) };
  const alternateConnection = await savedSdkConnection(root, { principal, credential });
  const alternate = { result: await runCanon(room.chat.id, alternateConnection.id), rows: await captured(room.chat.id, alternateConnection.id) };
  const beforeForeign = await captured(room.chat.id);
  const callsBefore = wire.children.length;
  const foreign = await seedCorpusAccount(root);
  const refusal = await root.app.runtime.resolve({ principal: foreign, connectionId: connection.id, task: "chat", cachedFacts: true }).then(
    () => {
      throw new Error("foreign native SDK connection unexpectedly resolved");
    },
    (error: Error) => error,
  );
  const foreignCapture = { refusal, before: beforeForeign, after: await captured(room.chat.id), callsBefore, callsAfter: wire.children.length };
  const cancel = new AbortController();
  const cancelled = root.app.runtime.executor
    .runChatTurn({
      api: "agent-sdk",
      connection: await resolve(connection.id),
      chatId: emptyRoom.chat.id,
      prompt: CORPUS_SDK_HOLD,
      systemPrompt: { static: "", dynamic: "" },
      params: {},
      signal: cancel.signal,
    })
    .then(
      () => {
        throw new Error("cancelled native SDK corpus turn unexpectedly succeeded");
      },
      (error: Error) => error,
    );
  await wire.holding;
  cancel.abort();
  const cancellation = await cancelled;
  await wire.settle();
  await root.settleBackground();
  return {
    principal,
    credential,
    connection,
    alternateConnection,
    room,
    source,
    empty,
    seeded,
    reused,
    rewound,
    branched,
    readopted,
    reseeded,
    restored,
    alternate,
    foreign: foreignCapture,
    cancellation,
    receipts: [...wire.receipts],
    exits: wire.children.map((child) => ({ exitCode: child.exitCode, signalCode: child.signalCode })),
    rows: [...(await captured(room.chat.id)), ...(await captured(room.chat.id, alternateConnection.id))],
  };
}
