// The recall corpus with the memory rows its workers wrote, for the corpus publication and testkit self-tests.

import type { SeededRecallCorpus, SeedRecallCorpusOptions } from "../../corpus-actors.ts";
import { seedRecallCorpus } from "../../corpus-actors.ts";
import type { ServerTestHarness } from "../../server.ts";
import type { CapturedChatMemoryRows } from "../embedding-generation.ts";
import { captureChatMemoryRows } from "./embedding-generation.ts";

export interface SeededRecallCorpusRows extends SeededRecallCorpus {
  /** Digests and segments as the settled memory workloads left them, read before the recall turn. */
  readonly memory: CapturedChatMemoryRows;
}

/** {@link seedRecallCorpus}, capturing the room's memory rows between the settled workloads and the recall turn. */
export async function seedRecallCorpusRows(root: ServerTestHarness, options: Omit<SeedRecallCorpusOptions, "afterSettle">): Promise<SeededRecallCorpusRows> {
  let memory: CapturedChatMemoryRows | undefined;
  const corpus = await seedRecallCorpus(root, {
    ...options,
    afterSettle: async (chatId) => {
      memory = await captureChatMemoryRows(root.db, chatId);
      if (memory.digests.length === 0 || memory.segments.length === 0) {
        throw new Error("synthetic recall corpus workers produced no genuine digests or segments");
      }
    },
  });
  if (memory === undefined) {
    throw new Error("recall corpus returned without settling its memory workloads");
  }
  return { ...corpus, memory };
}
