// The settled row's reasoning disclosure with its author-or-host controls: Edit (inline field, explicit Save,
// Escape cancels) and Clear (behind a confirm). `canEdit` is the row's UX gate only; `chat.editReasoning` and
// `chat.clearReasoning` decide authority, and a deception-active room never sends a member the reasoning, so
// this block (and its controls) never mounts for one.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Check, Eraser, Icon, Pencil, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import {
  MESSAGE_REASONING_CANCEL_NAME,
  MESSAGE_REASONING_CLEAR_CONFIRM,
  MESSAGE_REASONING_CLEAR_DESCRIPTION,
  MESSAGE_REASONING_CLEAR_NAME,
  MESSAGE_REASONING_CLEAR_TITLE,
  MESSAGE_REASONING_EDIT_NAME,
  MESSAGE_REASONING_NAME,
  MESSAGE_REASONING_SAVE_NAME,
} from "../lib/message-action-names.ts";
import { ReasoningBlock } from "./reasoning-block.tsx";

interface ReasoningVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

interface EditReasoningVars extends ReasoningVars {
  readonly reasoning: string;
}

const useEditReasoningMutation = createEntityMutation<EditReasoningVars, unknown>({
  options: (trpc) => trpc.chat.editReasoning.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that reasoning.",
});

const useClearReasoningMutation = createEntityMutation<ReasoningVars, unknown>({
  options: (trpc) => trpc.chat.clearReasoning.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't clear that reasoning.",
});

/** The inline field. The draft is local state: it lives for one open field on one row, unlike the message
 *  editor's, which must survive a windowed row's remount. */
function ReasoningEditor({ message, onDone }: { readonly message: MessageView; readonly onDone: () => void }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const edit = useEditReasoningMutation({ trpc, invalidation });
  const stored = message.reasoning ?? "";
  const [draft, setDraft] = useState(stored);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const blank = draft.trim().length === 0;

  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (el === null) {
      return;
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const save = async (): Promise<void> => {
    if (edit.isPending || blank) {
      return;
    }
    if (draft === stored) {
      onDone();
      return;
    }
    // the rejection comes from `useEditReasoningMutation`'s mutateAsync, whose errorToast is the surface; the field stays open so the draft survives a retry.
    try {
      await edit.mutateAsync({ chatId: message.chatId, messageId: message.id, reasoning: draft });
      onDone();
    } catch {
      // Stay in the field so the reader can retry without retyping.
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDone();
    }
  };

  return (
    <Stack gap="field" data-slot="message-reasoning-editor" className="inline-full">
      <Textarea
        ref={fieldRef}
        className="inline-full"
        aria-label={MESSAGE_REASONING_EDIT_NAME}
        value={draft}
        onChange={(e): void => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={edit.isPending}
      />
      <Row gap="field" justify="end">
        <Button type="button" intent="ghost" size="sm" disabled={edit.isPending} aria-label={MESSAGE_REASONING_CANCEL_NAME} onClick={onDone}>
          <Icon icon={X} size="sm" />
        </Button>
        <Button
          type="button"
          intent="secondary"
          size="sm"
          loading={edit.isPending}
          disabled={blank}
          aria-label={MESSAGE_REASONING_SAVE_NAME}
          onClick={(): void => void save().catch(globalThis.reportError)}
        >
          <Icon icon={Check} size="sm" />
        </Button>
      </Row>
    </Stack>
  );
}

export interface MessageReasoningProps {
  readonly message: MessageView;
  /** The reasoning after the display macro pass; the editor works on the stored bytes, never this. */
  readonly displayText: string;
  readonly showIcon: boolean;
  /** The viewer is the message's author or the room host. */
  readonly canEdit: boolean;
}

export function MessageReasoning({ message, displayText, showIcon, canEdit }: MessageReasoningProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const clear = useClearReasoningMutation({ trpc, invalidation });
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (editing) {
    return <ReasoningEditor message={message} onDone={(): void => setEditing(false)} />;
  }

  return (
    <Stack gap="field" data-slot="message-reasoning">
      <ReasoningBlock reasoning={displayText} thinking={false} label={MESSAGE_REASONING_NAME} showIcon={showIcon} />
      {canEdit ? (
        <Row gap="field" justify="end">
          <Button type="button" intent="ghost" size="sm" aria-label={MESSAGE_REASONING_EDIT_NAME} onClick={(): void => setEditing(true)}>
            <Icon icon={Pencil} size="sm" />
          </Button>
          <Button type="button" intent="ghost" size="sm" aria-label={MESSAGE_REASONING_CLEAR_NAME} onClick={(): void => setConfirmOpen(true)}>
            <Icon icon={Eraser} size="sm" />
          </Button>
        </Row>
      ) : null}
      {confirmOpen ? (
        <ConfirmDialog
          title={MESSAGE_REASONING_CLEAR_TITLE}
          description={MESSAGE_REASONING_CLEAR_DESCRIPTION}
          confirmLabel={MESSAGE_REASONING_CLEAR_CONFIRM}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          confirmLoading={clear.isPending}
          onConfirm={(): Promise<void> => clear.mutateAsync({ chatId: message.chatId, messageId: message.id }).then(() => undefined)}
        />
      ) : null}
    </Stack>
  );
}
