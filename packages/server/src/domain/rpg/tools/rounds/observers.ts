// The rpg flush's observability hooks and its bus emit: what the state round did on each turn, made visible in the
// log and (when tracing is on) the flight recorder. A deliberate outcome logs at debug or info; a degrade warns.

import { logger } from "#foundation/observability";
import { publishRpgEvent } from "#src/domain/rpg/bus.ts";
import type { RpgRoundObservers } from "#src/domain/rpg/contract/rounds.ts";
import type { FlushBarrierScheduleTimeout } from "#src/domain/rpg/contract/service.ts";
import type { RpgTraceSink } from "#src/domain/rpg/contract/trace.ts";
import { createRpgFlushBarrier } from "#src/domain/rpg/flush-barrier.ts";

/** The hooks, closed over the optional trace sink. Untraced, `emitBus` is `publishRpgEvent` verbatim. */
export function createRpgRoundObservers(
  trace: RpgTraceSink | undefined,
  scheduleTimeout?: FlushBarrierScheduleTimeout,
  emitBus: RpgRoundObservers["emitBus"] = publishRpgEvent,
): RpgRoundObservers {
  return {
    // The feature-root rpg bus emit (§4.9) — a verb/flush calls it after its durable write; fire-and-forget.
    // R-OBS taps it in passing: what the turn ANNOUNCED to the live panel is the other half of "did the write
    // reach the user", beside what it wrote.
    emitBus: (event): void => {
      trace?.({ phase: "bus", chatId: event.chatId, type: event.type });
      emitBus(event);
    },
    // OBSERVABILITY (R1): which state-round PATH each flush resolved to. A `folded` game that quietly fell back
    // to the post-commit round still writes correct state — and silently pays the second call the fold exists
    // to delete. `warn` on a fallback (something to look at), `debug` when the knob got what it asked for.
    onStateRoundPath: (info): void => {
      // R-OBS: the delivery FORK, per turn. A `folded` game quietly paying the second call forever is the
      // failure this event exists to make visible, and the ring is where it becomes queryable per chat.
      trace?.({ phase: "flush", chatId: info.chatId, turnId: info.turnId, path: info.path, fallbackReason: info.fallbackReason });
      const line = { event: "rpg.extraction.path", chatId: info.chatId, gameId: info.gameId, mode: info.mode, path: info.path };
      if (info.fallbackReason !== null) {
        logger.warn({ ...line, fallbackReason: info.fallbackReason }, "rpg folded turn could not mount its tools — fell back to the post-commit state round");
        return;
      }
      logger.debug(line, "rpg state round resolved");
    },
    // OBSERVABILITY (R1): the folded turn's PRE-commit tool mount threw and was swallowed to protect the
    // character turn. The turn shipped tool-less and its state falls to the post-commit round — correct, but a
    // game that silently stops folding is a game that silently starts paying twice again. This is the only
    // trace, so it is a WARN with the cause attached.
    onFoldBuildFailed: (info): void => {
      logger.warn(
        { event: "rpg.extraction.fold_build_failed", chatId: info.chatId, gameId: info.gameId, err: info.err },
        "rpg folded turn could not BUILD its tools — the turn ran tool-less; state falls to the post-commit round",
      );
    },
    // OBSERVABILITY: the caller pressed Stop and this flush refused to write (the cancellation ruling). A
    // deliberate, correct discard — `info`, not `warn` — but never SILENT: a cancelled round that threw away a
    // finished extraction (`discardedStagedWrites`) is the expensive case and must be countable.
    onStateRoundCancelled: (info): void => {
      logger.info(
        {
          event: "rpg.flush.cancelled",
          chatId: info.chatId,
          gameId: info.gameId,
          turnId: info.turnId,
          discardedStagedWrites: info.discardedStagedWrites,
        },
        "rpg flush CANCELLED (the caller aborted the turn) — no snapshot, no journal, no emits",
      );
    },
    // OBSERVABILITY (#1493): the WRITE BOUNDARY settled. `onStateRoundPath` above is a DISPATCH receipt, so
    // until this event nothing in the trail — log or trace ring — said the extraction was over, and the e2e
    // barrier that polled the `flush` phase was racing the write it claimed to wait for. `debug`, because a
    // settle is the normal end of every turn; the interesting arms (drop, cancel, fallback) keep their own
    // louder lines. The trace phase is what a barrier polls.
    onFlushSettled: (info): void => {
      trace?.({ phase: "flushed", chatId: info.chatId, turnId: info.turnId, outcome: info.outcome, droppedReason: info.droppedReason });
      logger.debug(
        { event: "rpg.flush.settled", chatId: info.chatId, gameId: info.gameId, turnId: info.turnId, outcome: info.outcome, droppedReason: info.droppedReason },
        "rpg state round settled",
      );
    },
    // OBSERVABILITY: the flush write-boundary DROP hook (the F1 backstop refusing a contract-invalid state).
    // A state round fired, produced applicable output, and the write contract rejected it — surface WHICH
    // field/why so a dark panel is root-causable from the provider trail (never a silent vanish).
    onFlushDropped: (info): void => {
      logger.warn(
        { event: "rpg.flush.dropped", chatId: info.chatId, gameId: info.gameId, variantId: info.variantId, reason: info.reason },
        "rpg flush DROPPED at the write-boundary backstop — extracted state was contract-invalid",
      );
    },
    // The per-chat FLUSH BARRIER (the race fix): the next turn's gather awaits this chat's in-flight flush before
    // reading the state its reminder assembles from. A hung flush releases the barrier (bounded) + logs — the
    // turn proceeds on last-known state, never a deadlock.
    flushBarrier: createRpgFlushBarrier(
      (info) => {
        logger.warn(
          { event: "rpg.flush.barrier_timeout", chatId: info.chatId },
          "rpg flush barrier timed out — the next turn proceeded on last-known state (a prior flush did not settle in time)",
        );
      },
      undefined,
      scheduleTimeout,
    ),
  };
}
