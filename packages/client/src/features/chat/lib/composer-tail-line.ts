// What the line under the composer states about the room's tail. A wait-for-everyone room names who it still waits
// on, counted by the same `humansYetToWrite` the server's send reads, so the line and the reply agree. Any room whose
// last message is a person's with nothing answering it says so, with the reply action beside it: that is the state
// a Simple send leaves, and the one where a hand-started reply is the next step.
// The server waits on the seated humans whose accounts are enabled; this line counts the seated humans, because
// `ParticipantView.disabled` is the seat mute and the roster read carries no account state. The only gap is a
// disabled account the line still names, so it can over-name a member but never says ready while the server holds.

import type { GroupConfig, ParticipantView } from "@orb/contracts/chat";
import { humansYetToWrite } from "@orb/contracts/chat";
import type { UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { COMPOSER_GENERATE_REPLY_NAME } from "./composer-menu-names.ts";
import { NO_REPLY_YET_LEAD, REPLY_NOW_NAME, WAITING_VIEWER_WORD, waitingForLabel } from "./composer-tail-copy.ts";
import { filterCharacters, resolveHumanParticipants, SHARED_ROOM_FLOOR } from "./roster.ts";

/** One transcript row as the line reads it, oldest first. */
interface TailRow {
  readonly role: MessageRole;
  readonly authorUserId: UserId | null;
}

/** The line's state: its words and the name of its reply action. A waiting room offers the release only once someone
 *  has written, because a release is a reply to a line. */
export type ComposerTailState =
  | { readonly kind: "none" }
  | { readonly kind: "waiting" | "unanswered"; readonly text: string; readonly action: string | undefined };

const NONE: ComposerTailState = { kind: "none" };
const UNANSWERED: ComposerTailState = { kind: "unanswered", text: NO_REPLY_YET_LEAD, action: COMPOSER_GENERATE_REPLY_NAME };

export function composerTailState(args: {
  readonly group: GroupConfig;
  readonly participants: readonly ParticipantView[];
  readonly viewerUserId: UserId;
  readonly rows: readonly TailRow[];
}): ComposerTailState {
  const { group, participants, viewerUserId, rows } = args;
  if (!filterCharacters(participants).some((seat) => seat.leftSeq === null)) {
    return NONE;
  }
  const humans = resolveHumanParticipants(participants).flatMap((seat) => (seat.userId === null ? [] : [{ userId: seat.userId, name: seat.displayName }]));
  const answered = rows.at(-1)?.role !== "user";
  if (group.waitForEveryone && humans.length >= SHARED_ROOM_FLOOR) {
    const pending = new Set(
      humansYetToWrite(
        humans.map(({ userId }) => userId),
        rows,
      ),
    );
    if (pending.size > 0) {
      const names = humans.filter(({ userId }) => pending.has(userId)).map(({ userId, name }) => (userId === viewerUserId ? WAITING_VIEWER_WORD : name));
      return { kind: "waiting", text: waitingForLabel(names), action: answered ? undefined : REPLY_NOW_NAME };
    }
  }
  return answered ? NONE : UNANSWERED;
}
