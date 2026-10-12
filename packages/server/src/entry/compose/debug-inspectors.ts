// The flight recorders' read halves, narrowed onto the debug routes' ports. Foundation's ports speak the raw
// query strings and learn no domain type; the turn-id brand is applied here, at the entry seam.

import type { ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MemoryRecallRecorder } from "#domain/chat";
import type { RpgTraceRecorder } from "#domain/rpg";
import type { MemoryRecallInspector, RpgTraceInspector } from "#foundation/observability";

export function createRpgTraceInspector(recorder: RpgTraceRecorder): RpgTraceInspector {
  return {
    // @orb-waive compose-wiring-only(recent): baselined when the gate landed; burn-down item 964.
    recent: (filter) =>
      recorder.recent({
        ...(filter.chatId === undefined ? {} : { chatId: filter.chatId }),
        ...(filter.turnId === undefined ? {} : { turnId: castId<ChatTurnId>(filter.turnId) }),
        ...(filter.limit === undefined ? {} : { limit: filter.limit }),
      }),
  };
}

export function createMemoryRecallInspector(recorder: MemoryRecallRecorder): MemoryRecallInspector {
  return {
    recent: (filter) =>
      recorder.recent({
        ...(filter.chatId === undefined ? {} : { chatId: filter.chatId }),
        ...(filter.limit === undefined ? {} : { limit: filter.limit }),
      }),
  };
}
