import type { MemoryRecallRecorder } from "#domain/chat";
import type { MemoryRecallInspector } from "#foundation/observability";

/** Project the debug query onto the recall recorder's supported filters. */
export function createMemoryRecallInspector(recorder: MemoryRecallRecorder): MemoryRecallInspector {
  return {
    recent: (filter) =>
      recorder.recent({
        ...(filter.chatId === undefined ? {} : { chatId: filter.chatId }),
        ...(filter.limit === undefined ? {} : { limit: filter.limit }),
      }),
  };
}
