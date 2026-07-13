// Edit-in-place's textarea half — swapped in for MessageContent while a row is editing. The mode flag
// and in-progress text both live in the external message-edit-draft store, never useState: the chat
// surface does not keepMounted editing rows, so a component-local draft would silently drop on a
// scroll-driven unmount/remount. An optional onSave overrides the chat.editMessage verb path (the draft
// greeting seam, which persists sync to the draft-config store instead).

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' re-export of the lucide-react glyphs (external .d.ts); tsc resolves the barrel (same class as swipe-strip.tsx).
import { Check, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useLayoutEffect, useRef } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { cancelEditingMessage, setMessageEditDraft, useMessageEditDraftText } from "#state";

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
      void save();
    }
  };

  return (
    <Stack gap="field" data-slot="message-edit-textarea">
      <Textarea
        ref={textareaRef}
        aria-label="Edit message"
        value={text}
        onChange={(e): void => setMessageEditDraft(message.id, e.target.value)}
        onKeyDown={onKeyDown}
        disabled={editMessage.isPending}
      />
      <Row gap="field" justify="end">
        <Button
          type="button"
          intent="ghost"
          size="sm"
          disabled={editMessage.isPending}
          aria-label="Cancel edit"
          onClick={cancel}
        >
          <Icon icon={X} size="sm" />
        </Button>
        <Button
          type="button"
          intent="primary"
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
