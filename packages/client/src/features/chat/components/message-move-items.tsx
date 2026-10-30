// The host's Move up / Move down menu items. `chat.moveMessage` takes the TARGET slot's seq: the verb lands the
// row before that slot when moving up and after it when moving down, so each door sends its neighbour's seq.
// A null neighbour (an end of the loaded transcript) disables the door with its reason; the verb is host-only,
// and the caller mounts these for the host alone.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { ChevronDown, ChevronUp } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { DescribedMenuItem } from "#components";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { MESSAGE_MOVE_DOWN_NAME, MESSAGE_MOVE_DOWN_UNAVAILABLE, MESSAGE_MOVE_UP_NAME, MESSAGE_MOVE_UP_UNAVAILABLE } from "../lib/message-action-names.ts";

interface MoveVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly toSeq: number;
}

const useMoveMessageMutation = createEntityMutation<MoveVars, unknown>({
  options: (trpc) => trpc.chat.moveMessage.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't move that message.",
});

export interface MessageMoveItemsProps {
  readonly message: MessageView;
  /** The `seq` of the row above this one in the loaded transcript, or null at the top. */
  readonly previousSeq: number | null;
  /** The `seq` of the row below this one in the loaded transcript, or null at the bottom. */
  readonly nextSeq: number | null;
}

export function MessageMoveItems({ message, previousSeq, nextSeq }: MessageMoveItemsProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const move = useMoveMessageMutation({ trpc, invalidation });
  const moveTo = (toSeq: number | null): void => {
    if (toSeq === null || move.isPending) {
      return;
    }
    move.mutate({ chatId: message.chatId, messageId: message.id, toSeq });
  };
  return (
    <>
      <DescribedMenuItem
        detail={previousSeq === null ? MESSAGE_MOVE_UP_UNAVAILABLE : undefined}
        disabled={previousSeq === null}
        icon={ChevronUp}
        label={MESSAGE_MOVE_UP_NAME}
        onClick={(): void => moveTo(previousSeq)}
      />
      <DescribedMenuItem
        detail={nextSeq === null ? MESSAGE_MOVE_DOWN_UNAVAILABLE : undefined}
        disabled={nextSeq === null}
        icon={ChevronDown}
        label={MESSAGE_MOVE_DOWN_NAME}
        onClick={(): void => moveTo(nextSeq)}
      />
    </>
  );
}
