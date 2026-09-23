// S1 — the BEHAVIOR half of the in-chat control seam: busy is
// resolved PER MODE, in ONE place, for every control the band renders. Nothing else in the client decides
// whether a control is operable.
//
// The three modes are three different facts, and conflating them is the defect this module exists to
// prevent (the `:::choices` block disables on the turn phase because every one of its options SENDS — a
// compose-mode chip disabled the same way would be refusing to write a draft, which is always legal, and an
// `execute` control disabled by the turn phase would be refusing a front-door verb call because somebody
// else's reply is streaming):
//
//   send    → the click IS the member's next turn ⇒ disabled while one is in flight, reason on `title`.
//   compose → the click seeds their composer draft ⇒ NEVER disabled.
//   execute → the click is a verb call ⇒ disabled ONLY while its own mutation pends (the source's flag).
//
// The dispatch is an exhaustive `switch` closed by `assertNeverMode`: a new `CHAT_CONTROL_MODES` member
// fails `tsc` here until it declares what makes it busy (§5.5 string-union dispatch discipline).

import type { ChatControlAction } from "#lib";
import { CHOICE_WAIT_FOR_TURN, CONTROL_ACTION_RUNNING } from "#lib";

/** What the host knows that a control cannot know for itself: whether this room owes a turn right now. */
export interface ChatControlTurnState {
  /** A turn is pending/streaming/stopping, OR the band's own send is in flight. */
  readonly turnBusy: boolean;
}

/** The resolved operability of ONE action. `reason` is non-null exactly when `disabled` is true — a
 *  disabled affordance ALWAYS names its unlock (the house rule: never a silent grey button). */
export interface ChatControlAvailability {
  readonly disabled: boolean;
  readonly reason: string | null;
}

const OPERABLE: ChatControlAvailability = { disabled: false, reason: null };

function blocked(reason: string): ChatControlAvailability {
  return { disabled: true, reason };
}

function assertNeverMode(action: never): ChatControlAvailability {
  throw new Error(`chat-control: unhandled action mode ${JSON.stringify(action)}`);
}

/** Resolves ONE action's operability against the room's turn state. Total over the mode axis. */
export function resolveControlAvailability(action: ChatControlAction, turn: ChatControlTurnState): ChatControlAvailability {
  switch (action.mode) {
    case "send": {
      return turn.turnBusy ? blocked(CHOICE_WAIT_FOR_TURN) : OPERABLE;
    }
    case "compose": {
      return OPERABLE;
    }
    case "execute": {
      return action.pending ? blocked(CONTROL_ACTION_RUNNING) : OPERABLE;
    }
    default: {
      return assertNeverMode(action);
    }
  }
}
