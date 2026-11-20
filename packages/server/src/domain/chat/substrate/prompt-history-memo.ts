// The per-room memo of the prompt-history leg (`assembly/history-regex`), for the context-fit preview every member's
// client asks for after each turn. Each room keeps only its last output: the key digests every input the leg read, so
// a changed room's next read misses and replaces it. The rooms are bounded, oldest read first out, so the memo holds
// the history copies of at most that many rooms.

import type { ChatId } from "@orb/kit/ids";
import type { PromptHistoryMemo, PromptHistoryMemos } from "../contract/regex.ts";

// How many rooms keep a remembered history at once. Each holds the prompt copy of its history.
const PROMPT_HISTORY_MEMO_ROOMS = 32;

interface Entry {
  readonly key: string;
  readonly contents: readonly string[];
}

export function createPromptHistoryMemos(): PromptHistoryMemos {
  const entries = new Map<ChatId, Entry>();
  const forRoom = (chatId: ChatId): PromptHistoryMemo => ({
    read: (key): readonly string[] | undefined => {
      const entry = entries.get(chatId);
      if (entry?.key !== key) {
        return;
      }
      // Re-insert so the Map's insertion order tracks the most recent read.
      entries.delete(chatId);
      entries.set(chatId, entry);
      return entry.contents;
    },
    write: (key, contents): void => {
      entries.delete(chatId);
      entries.set(chatId, { key, contents });
      for (const oldest of entries.keys()) {
        if (entries.size <= PROMPT_HISTORY_MEMO_ROOMS) {
          break;
        }
        entries.delete(oldest);
      }
    },
  });
  return { forRoom };
}
