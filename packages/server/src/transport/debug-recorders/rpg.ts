import type { ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RpgTraceRecorder } from "#domain/rpg";
import type { RpgTraceInspector } from "#foundation/observability";

/** Adapt debug query strings to the RPG recorder's branded turn filter. */
export function createRpgTraceInspector(recorder: RpgTraceRecorder): RpgTraceInspector {
  return {
    recent: (filter) =>
      recorder.recent({
        ...(filter.chatId === undefined ? {} : { chatId: filter.chatId }),
        ...(filter.turnId === undefined ? {} : { turnId: castId<ChatTurnId>(filter.turnId) }),
        ...(filter.limit === undefined ? {} : { limit: filter.limit }),
      }),
  };
}
