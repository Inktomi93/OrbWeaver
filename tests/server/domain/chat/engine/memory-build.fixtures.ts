// A composed memory room whose turn returns its canon through listMessages and whose warnings come from the bus replay.

import type { ChatBusEvent, MessageView, TurnOutcome } from "@orb/contracts/chat";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { createSeededIds } from "@orb/testkit/iso";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";

const ids = createSeededIds();
export const LOG_SCAN_LIMIT = 100;

export interface MemoryTurnCapture {
  readonly outcome: TurnOutcome;
  readonly canon: readonly MessageView[];
}

export async function room(): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly turn: () => Promise<MemoryTurnCapture>;
    readonly warnings: () => Promise<Extract<ChatBusEvent, { type: "warning" }>[]>;
  }
> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body) =>
      body.includes("Transcript block:") ? "The remembered turn\nThe keeper remembers this conversation.\nKeywords: keeper" : "The real memory turn commits.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      providerFetch: physical.execute,
      server: { ids, logLevel: "warn" },
      memoryEnabled: true,
      group: { output: "per-speaker", policy: "list" },
      memoryDefaults: { mode: "mixC", blockSize: 2, verbatimWindow: 0, maxTier: 0 },
      transcript: [1, 2, 3].map((index) => ({ role: "assistant" as const, content: `The keeper's historical memory ${index}.` })),
    }),
  );
  const chatBinding = (await h.root.services.connection.listBindings({ principal: h.owner })).find(({ task }) => task === "chat")?.binding;
  if (chatBinding === undefined || chatBinding === null || chatBinding.connectionId === null) {
    throw new Error("the real memory room has no saved chat binding");
  }
  await h.root.services.connection.update({
    principal: h.owner,
    connectionId: chatBinding.connectionId,
    patch: { promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false } },
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the real memory room has no seated character");
  }

  const turn = async (): Promise<MemoryTurnCapture> => {
    const outcome = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
    await h.root.settleBackground();
    const canon = await readRoomCanon(h.root, h.owner, h.chatId);
    return { outcome, canon };
  };
  const warnings = async (): Promise<Extract<ChatBusEvent, { type: "warning" }>[]> =>
    (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).flatMap(({ event }) => (event.type === "warning" ? [event] : []));
  const lifetime = construction.move();
  return { h, turn, warnings, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
