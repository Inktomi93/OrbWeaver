// Edit-in-place's textarea half — swapped in for MessageContent while a row is editing. The mode flag
// and in-progress text both live in the external message-edit-draft store, never useState: the chat
// surface does not keepMounted editing rows, so a component-local draft would silently drop on a
// scroll-driven unmount/remount.

import type { MessageView } from "@orb/contracts/chat";
import { Button } from "@orb/ui/button";
import { Check, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";
import { useInvalidation, useTRPC } from "#data";
import { viewerTimeZone } from "#lib";
import { cancelEditingMessage, setMessageEditDraft, useMessageEditDraftText } from "#state";
import { useEditMessageMutation } from "../hooks/use-message-mutations.ts";
import { CHAT_CANCEL_EDIT_NAME, CHAT_SAVE_EDIT_NAME } from "../lib/chat-surface-names.ts";
import { MESSAGE_EDIT_NAME } from "../lib/message-action-names.ts";
import type { MoveNeighbours } from "../lib/move-neighbours.ts";
import { MessageMoveArrows } from "./message-move-arrows.tsx";

export interface MessageEditTextareaProps {
  readonly message: MessageView;
  /** The host's Move up / Move down ride this toolbar; absent ⇒ no arrows. The verb is host-only, so only the
   *  host's row passes it. */
  readonly moveNeighbours?: MoveNeighbours | undefined;
}

export function MessageEditTextarea({ message, moveNeighbours }: MessageEditTextareaProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editMessage = useEditMessageMutation({ trpc, invalidation });
  const text = useMessageEditDraftText(message.id);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el === null) {
      return;
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const cancel = (): void => {
    cancelEditingMessage(message.id);
  };

  const save = async (): Promise<void> => {
    if (editMessage.isPending || text.length === 0) {
      return;
    }
    if (text === message.content) {
      cancel();
      return;
    }
    // the rejection comes from `useEditMessageMutation`'s mutateAsync (same file), whose errorToast "Couldn't save that edit." is the surface; staying in edit mode preserves the draft. Ends if the mutation drops its errorToast.
    try {
      await editMessage.mutateAsync({
        chatId: message.chatId,
        messageId: message.id,
        content: text,
        timeZone: viewerTimeZone(),
      });
      cancelEditingMessage(message.id);
    } catch {
      // Stay in edit mode so the user can retry without retyping.
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      save().catch(globalThis.reportError);
    }
  };

  return (
    // `w-full` on both boxes is the other half of #245's footprint: the bubble keeps the width it had in
    // read mode (`renderSingleBubble`'s reservation) and the editor FILLS it. Without it the `Textarea`'s
    // native `field-sizing: content` sizes to the raw text — which is exactly how a two-word reply's box
    // snapped 107px narrower the moment the reader clicked Edit.
    <Stack gap="field" data-slot="message-edit-textarea" className="inline-full">
      <Textarea
        ref={textareaRef}
        className="inline-full"
        aria-label={MESSAGE_EDIT_NAME}
        value={text}
        onChange={(e): void => setMessageEditDraft(message.id, e.target.value)}
        onKeyDown={onKeyDown}
        disabled={editMessage.isPending}
      />
      <Row gap="field" align="center" justify="end">
        {moveNeighbours === undefined ? null : <MessageMoveArrows message={message} neighbours={moveNeighbours} />}
        <Button type="button" variant="ghost" size="sm" disabled={editMessage.isPending} aria-label={CHAT_CANCEL_EDIT_NAME} onClick={cancel}>
          <Icon icon={X} size="sm" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={editMessage.isPending}
          disabled={text.length === 0}
          aria-label={CHAT_SAVE_EDIT_NAME}
          onClick={(): void => void save().catch(globalThis.reportError)}
        >
          <Icon icon={Check} size="sm" />
        </Button>
      </Row>
    </Stack>
  );
}
