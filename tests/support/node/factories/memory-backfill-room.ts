// A chat root with memory on whose provider answers a summarize call with a digest the parser reads, so the memory
// backfill's estimate and its real sweep can be compared. `summaries` counts the summarize calls the provider served.
import { createCharacterSchema } from "@orb/contracts/character";
import { SUMMARIZE_TRANSCRIPT_MARKER } from "@orb/server/domain/chat";
import type { ChatRoot } from "../chat/composed.ts";
import { createChatRoot } from "../chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import { summaryReply } from "./summary-reply.ts";

/** Messages per tier-0 block: eight aged-out turns make four blocks. */
export const MEMORY_BACKFILL_BLOCK_SIZE = 2;

export interface MemoryBackfillRoom extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly summaries: () => number;
}

export const memoryBackfillLines = (count: number, tag: string): { readonly role: "assistant"; readonly content: string }[] =>
  Array.from({ length: count }, (_, index) => ({ role: "assistant" as const, content: `${tag} scene ${index + 1}: ${"orbital ledger ballast ".repeat(40)}` }));

export async function createMemoryBackfillRoom(
  options: { readonly transcript?: number; readonly characters?: readonly string[] } = {},
): Promise<MemoryBackfillRoom> {
  let summarized = 0;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: (body): string => {
      if (body.includes(SUMMARIZE_TRANSCRIPT_MARKER)) {
        summarized += 1;
        return summaryReply({ anchor: "An earlier ledger scene", facts: "The keeper remembers the earlier orbital ledger scene.", keywords: ["ledger"] });
      }
      return "The keeper nods.";
    },
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      server: { startJobs: false },
      providerFetch: physical.execute,
      memoryEnabled: true,
      memoryDefaults: { mode: "mixC", blockSize: MEMORY_BACKFILL_BLOCK_SIZE, verbatimWindow: 0, maxTier: 0 },
      characters: (options.characters ?? ["iris"]).map((name) => createCharacterSchema.parse({ handle: name, name, description: `${name} keeps the ledger.` })),
      transcript: memoryBackfillLines(options.transcript ?? 8, "Earlier"),
    }),
  );
  const lifetime = construction.move();
  return { h, summaries: () => summarized, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
