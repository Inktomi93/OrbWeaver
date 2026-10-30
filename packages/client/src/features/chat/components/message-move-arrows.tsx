// The host's Move up / Move down arrows in the message edit toolbar. `chat.moveMessage` takes the TARGET slot's
// seq: the verb lands the row before that slot when moving up and after it when moving down, so each arrow sends
// its neighbour's seq. A neighbour outside the loaded rows is read from the paging query's own cursor at click
// time, so an arrow is disabled only where no row exists in that direction. Both arrows disable, and refuse,
// while a turn is generating in the room. The verb is host-only, and the caller mounts these for the host alone.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronUp, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { isLiveTurnPhase, useTurnPhase } from "#state";
import { MESSAGE_MOVE_DOWN_NAME, MESSAGE_MOVE_UP_NAME } from "../lib/message-action-names.ts";
import type { MoveNeighbours } from "../lib/move-neighbours.ts";
import { moveReasons } from "../lib/move-neighbours.ts";

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

export interface MessageMoveArrowsProps {
  readonly message: MessageView;
  readonly neighbours: MoveNeighbours;
}

export function MessageMoveArrows({ message, neighbours }: MessageMoveArrowsProps): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();
  const move = useMoveMessageMutation({ trpc, invalidation });
  const generating = isLiveTurnPhase(useTurnPhase(message.chatId));
  const upReasonId = useId();
  const downReasonId = useId();
  const reasons = moveReasons(neighbours, generating);
  // Both arrows can share one reason (a running turn); it is drawn once and both describe themselves by it.
  const sharedReason = reasons.up !== undefined && reasons.up === reasons.down;
  const downDescriptionId = sharedReason ? upReasonId : downReasonId;

  // An unloaded neighbour is the row adjacent to this one in canon, so the cursor read asks for exactly one.
  const unloadedNeighbourSeq = async (direction: "before" | "after"): Promise<number | null> => {
    const page = await queryClient.query({
      ...trpc.chat.listMessages.queryOptions({ chatId: message.chatId, cursor: { kind: direction, seq: message.seq }, limit: 1 }),
      staleTime: 0,
    });
    return (direction === "before" ? page.messages.at(-1) : page.messages[0])?.seq ?? null;
  };

  const moveTo = async (direction: "before" | "after", loadedSeq: number | null): Promise<void> => {
    if (generating || move.isPending) {
      return;
    }
    const toSeq = loadedSeq ?? (await unloadedNeighbourSeq(direction));
    if (toSeq === null) {
      return;
    }
    await move.mutateAsync({ chatId: message.chatId, messageId: message.id, toSeq });
  };
  // the rejection comes from `useMoveMessageMutation`'s mutateAsync, whose errorToast is the surface; a failed neighbour read reaches the global reporter.
  const run = (direction: "before" | "after", loadedSeq: number | null): void => void moveTo(direction, loadedSeq).catch(globalThis.reportError);

  return (
    <Row gap="field" align="center" data-slot="message-move-arrows">
      <Button
        type="button"
        intent="ghost"
        size="sm"
        disabled={reasons.up !== undefined}
        aria-label={MESSAGE_MOVE_UP_NAME}
        aria-describedby={reasons.up === undefined ? undefined : upReasonId}
        onClick={(): void => run("before", neighbours.previousSeq)}
      >
        <Icon icon={ChevronUp} size="sm" />
      </Button>
      <Button
        type="button"
        intent="ghost"
        size="sm"
        disabled={reasons.down !== undefined}
        aria-label={MESSAGE_MOVE_DOWN_NAME}
        aria-describedby={reasons.down === undefined ? undefined : downDescriptionId}
        onClick={(): void => run("after", neighbours.nextSeq)}
      >
        <Icon icon={ChevronDown} size="sm" />
      </Button>
      {reasons.up === undefined ? null : (
        <Text id={upReasonId} voice="gloss">
          {reasons.up}
        </Text>
      )}
      {reasons.down === undefined || sharedReason ? null : (
        <Text id={downReasonId} voice="gloss">
          {reasons.down}
        </Text>
      )}
    </Row>
  );
}
