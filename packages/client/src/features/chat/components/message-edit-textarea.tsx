// Edit-in-place's textarea half — swapped in for MessageContent while a row is editing. The mode flag
// and in-progress text both live in the external message-edit-draft store, never useState: the chat
// surface does not keepMounted editing rows, so a component-local draft would silently drop on a
// scroll-driven unmount/remount. An optional onSave overrides the chat.editMessage verb path (the draft
// greeting seam, which persists sync to the draft-config store instead).

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Check, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { cancelEditingMessage, setMessageEditDraft, useMessageEditDraftText } from "#state";
import { MESSAGE_EDIT_NAME } from "../lib/message-action-names.ts";

interface EditMessageVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly content: string;
}

const useEditMessageMutation = createEntityMutation<EditMessageVars, unknown>({
  options: (trpc) => trpc.chat.editMessage.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that edit.",
});

export interface MessageEditTextareaProps {
  readonly message: MessageView;
  /** Overrides the chat.editMessage verb path; empty is allowed on this path. */
  readonly onSave?: ((text: string) => void) | undefined;
}

export function MessageEditTextarea({ message, onSave }: MessageEditTextareaProps): ReactElement {
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
    if (onSave !== undefined) {
      onSave(text);
      cancelEditingMessage(message.id);
      return;
    }
    if (editMessage.isPending || text.length === 0) {
      return;
    }
    if (text === message.content) {
      cancel();
      return;
    }
    // @orb-waive caught-failure-ownership(catch): useEditMessageMutation carries errorToast "Couldn't save that edit." — the toast is the surface; staying in edit mode preserves the draft. Ends if the mutation drops its errorToast.
    try {
      await editMessage.mutateAsync({
        chatId: message.chatId,
        messageId: message.id,
        content: text,
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
      // @orb-waive caught-failure-ownership(save): save() already catches the mutation's own
      // errorToast-backed rejection internally; this outer catch is belt-and-suspenders. Ends if save() stops
      // catching its own rejection.
      save().catch(() => undefined); // save owns the mutation failure and preserves the draft.
    }
  };

  return (
    // `w-full` on both boxes is the other half of #245's footprint: the bubble keeps the width it had in
    // read mode (`renderSingleBubble`'s reservation) and the editor FILLS it. Without it the `Textarea`'s
    // native `field-sizing: content` sizes to the raw text — which is exactly how a two-word reply's box
    // snapped 107px narrower the moment the reader clicked Edit.
    <Stack gap="field" data-slot="message-edit-textarea" className="w-full">
      <Textarea
        ref={textareaRef}
        className="w-full"
        aria-label={MESSAGE_EDIT_NAME}
        value={text}
        onChange={(e): void => setMessageEditDraft(message.id, e.target.value)}
        onKeyDown={onKeyDown}
        disabled={editMessage.isPending}
      />
      <Row gap="field" justify="end">
        <Button type="button" intent="ghost" size="sm" disabled={editMessage.isPending} aria-label="Cancel edit" onClick={cancel}>
          <Icon icon={X} size="sm" />
        </Button>
        <Button
          type="button"
          intent="secondary"
          size="sm"
          loading={editMessage.isPending}
          disabled={onSave === undefined && text.length === 0}
          aria-label="Save edit"
          onClick={(): void => void save()}
        >
          <Icon icon={Check} size="sm" />
        </Button>
      </Row>
    </Stack>
  );
}
