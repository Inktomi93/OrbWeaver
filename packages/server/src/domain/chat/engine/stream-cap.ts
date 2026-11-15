// The stream stop for one turn: a reply whose streamed text passes `MESSAGE_TEXT_MAX_CHARS` ends its provider call.
//
// The commit builders already refuse an over-cap body, but a runaway model would cost memory and one durable
// `chat_events` row per delta for its whole run before the commit could refuse it. This counts the raw streamed
// text and reasoning, stops passing deltas on once either passes the cap, and aborts the turn's own signal, which is
// the engine's one in-turn stop. `failure` hands the engine's catch the named refusal in place of the provider's
// abort error. A continue counts from the stored body it extends.
import type { ChatDeltaEvent } from "@orb/contracts/chat";
import { MESSAGE_TEXT_MAX_CHARS } from "@orb/contracts/chat";
import type { TurnPersist } from "../contract/results.ts";
import { messageTooLongError } from "../persistence/canon-write.ts";

export interface StreamCap {
  /** The turn's signal with this stop composed onto it. */
  readonly signal: AbortSignal;
  /** `onDelta` that counts each delta first and passes on none once the reply is over the cap. */
  readonly guard: (onDelta: (delta: ChatDeltaEvent) => void) => (delta: ChatDeltaEvent) => void;
  /** The refusal to surface for `err`: the cap's own error once it fired, else `err` unchanged. */
  readonly failure: (err: unknown) => unknown;
}

interface StoredText {
  readonly content: string;
  readonly reasoning: string | null;
}

/** `target` is the turn's slot target; only a continue's stored body counts toward the reply. */
export function createStreamCap(turnSignal: AbortSignal, persist: TurnPersist, target: StoredText | null): StreamCap {
  const stop = new AbortController();
  const extended = persist.mode === "continue" ? target : null;
  let content = extended?.content.length ?? 0;
  let reasoning = extended?.reasoning?.length ?? 0;
  const admit = (delta: ChatDeltaEvent): boolean => {
    if (stop.signal.aborted) {
      return false;
    }
    if (delta.kind === "text") {
      content += delta.text.length;
    } else {
      reasoning += delta.text.length;
    }
    if (content > MESSAGE_TEXT_MAX_CHARS) {
      stop.abort(messageTooLongError("content", content));
    } else if (reasoning > MESSAGE_TEXT_MAX_CHARS) {
      stop.abort(messageTooLongError("reasoning", reasoning));
    }
    return !stop.signal.aborted;
  };
  return {
    signal: AbortSignal.any([turnSignal, stop.signal]),
    guard:
      (onDelta) =>
      (delta): void => {
        if (admit(delta)) {
          onDelta(delta);
        }
      },
    failure: (err): unknown => (stop.signal.aborted ? stop.signal.reason : err),
  };
}
