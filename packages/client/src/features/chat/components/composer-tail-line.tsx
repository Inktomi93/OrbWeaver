// The line under the composer about the room's unanswered tail (`lib/composer-tail-line.ts` decides what it says).
// It reads the roster and the transcript tail the room already holds live, so it moves when someone writes, leaves
// or replies. It stands down while a reply runs and while another composer line states a fault.
// Its action is `useReplyToTail`, whose header says why it is not `generate`.

import type { ChatId } from "@orb/kit/ids";
import { InlineAction } from "@orb/ui/inline-action";
import { Container } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { roomRosterOptions, roomTailOptions, useTRPC } from "#data";
import { useReplyToTail } from "../hooks/use-reply-to-tail.ts";
import { Track } from "../lib/chat-track.tsx";
import { composerTailState } from "../lib/composer-tail-line.ts";

export interface ComposerTailLineProps {
  readonly chatId: ChatId;
  /** False while a reply runs, a send is in flight, or another line under the composer states a fault. */
  readonly idle: boolean;
}

export function ComposerTailLine({ chatId, idle }: ComposerTailLineProps): ReactElement | null {
  const trpc = useTRPC();
  const reply = useReplyToTail(chatId);
  const { data: chat } = useQuery(roomRosterOptions(trpc, { chatId }));
  const { data: page } = useQuery(roomTailOptions(trpc, { chatId }));
  if (!idle || reply.isPending || chat === undefined || page === undefined) {
    return null;
  }
  const state = composerTailState({ group: chat.group, participants: chat.participants, viewerUserId: chat.viewerUserId, rows: page.messages });
  if (state.kind === "none") {
    return null;
  }
  const { text, action } = state;
  return (
    // The other composer lines' track and fill: every line takes the same place under the composer.
    <Track of={Container} track="composer" className="shrink-0" ground="card">
      <Text
        as="p"
        voice="quiet"
        className="min-inline-0"
        inset="control"
        cap="prose"
        wrap="word"
        role="status"
        data-slot="composer-tail"
        data-state={state.kind}
      >
        {text}
        {action === undefined ? null : (
          <>
            {" "}
            <InlineAction variant="link" onClick={reply.reply} step="body" type="button">
              {action}
            </InlineAction>
          </>
        )}
      </Text>
    </Track>
  );
}
