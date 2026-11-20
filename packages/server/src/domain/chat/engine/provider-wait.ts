// The provider's first-token wait for one turn, observed at the dispatch seam.
//
// The window opens when a request is pulled, not at `turnStarted`: that event fires before compaction, memory
// recall and assembly, so a timer from there would call a slow recall a slow provider. One watcher serves the
// whole turn (every tool round and the narrative recovery pass), so each phase is emitted at most once.
//
// It never ends a turn. The idle window in `@orb/inference` stays the only stall bound, so a large local model
// that is still loading keeps its turn however long the notice shows.
import type { ProviderWaitPhase } from "@orb/contracts/chat";
import type { ScheduleOp } from "@orb/kit/time";
import type { RunChatTurnOp } from "../contract/engine-context.ts";

/** How long a dispatched turn request may answer nothing before the room is told the provider is starting.
 *  @remarks Past a hosted provider's ordinary first-token latency, and well short of the point where a silent
 *  pending row reads as a hang. It only names the wait: the idle window alone ends a request, so a large local
 *  model that takes minutes to load keeps its turn. */
export const PROVIDER_WAIT_NOTICE_MS = 5000;

/** Wrap `run` so a dispatched request that answers nothing for {@link PROVIDER_WAIT_NOTICE_MS} reports `"waiting"`,
 *  and the first chunk after that reports `"started"`. A turn whose provider answers first reports nothing. */
export function watchProviderWait(run: RunChatTurnOp, schedule: ScheduleOp, emit: (phase: ProviderWaitPhase) => void): RunChatTurnOp {
  let answered = false;
  let waiting = false;
  return async function* watched(req) {
    if (answered) {
      yield* run(req);
      return;
    }
    const disarm = schedule((): void => {
      if (!(answered || waiting)) {
        waiting = true;
        emit("waiting");
      }
    }, PROVIDER_WAIT_NOTICE_MS);
    try {
      for await (const chunk of run(req)) {
        if (!answered) {
          answered = true;
          disarm();
          if (waiting) {
            emit("started");
          }
        }
        yield chunk;
      }
    } finally {
      disarm();
    }
  };
}
