// The per-message action cluster: Edit / Hide-from-AI / Delete / Fork / Copy, always available on a
// canon row (the streaming row is a separate component with no actions). Edit/Hide/Fork apply only to
// user/assistant rows — a system row is a room notice, not authored prose. This row does not re-derive
// author-or-host authority client-side; a caller without permission gets the verb's own NOT_FOUND. Edit
// doesn't mutate here — it only flips the external edit-draft store's mode.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Copy, Eye, EyeOff, GitFork, Icon, Pencil, Trash2 } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { startEditingMessage } from "#state";
import {
  MESSAGE_ACTION_ICON_CLASS,
  messageActionsRevealClass,
} from "../lib/message-actions-reveal";

interface HideVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly hidden: boolean;
}

interface DeleteVars {
  readonly chatId: ChatId;
  readonly messageIds: MessageId[];
}

interface ForkVars {
  readonly chatId: ChatId;
  readonly throughSeq: number;
}

const useHideMutation = createEntityMutation<HideVars, unknown>({
  options: (trpc) => trpc.chat.setMessageHidden.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't change that message's visibility.",
});

const useDeleteMutation = createEntityMutation<DeleteVars, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete that message.",
});

const useForkMutation = createEntityMutation<ForkVars, { chat: { id: ChatId } }>({
  options: (trpc) => trpc.chat.forkChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't fork this chat.",
});

function isEditableRole(role: MessageView["role"]): boolean {
  return role === "user" || role === "assistant";
}

export interface MessageActionsRowProps {
  readonly message: MessageView;
  /** Optional — a caller without it still forks + notifies, just doesn't switch the active chat. */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  readonly messageActions?: "expanded" | "hover" | undefined;
}

export function MessageActionsRow({
  message,
  onChatForked,
  messageActions,
}: MessageActionsRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const hide = useHideMutation({ trpc, invalidation });
  const remove = useDeleteMutation({ trpc, invalidation });
  const fork = useForkMutation({ trpc, invalidation });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { chatId, id: messageId, role, content, excludedFromPrompt } = message;
  const editable = isEditableRole(role);

  const onEdit = (): void => {
    startEditingMessage(messageId, content);
  };

  const onToggleHidden = (): void => {
    if (hide.isPending) {
      return;
    }
    hide.mutate({ chatId, messageId, hidden: !excludedFromPrompt });
  };

  const onDelete = (): void => {
    if (remove.isPending) {
      return;
    }
    remove.mutate({ chatId, messageIds: [messageId] });
    setDeleteOpen(false);
  };

  const onFork = async (): Promise<void> => {
    if (fork.isPending) {
      return;
    }
    try {
      const result = await fork.mutateAsync({ chatId, throughSeq: message.seq });
      onChatForked?.(result.chat.id);
      notify.success("Forked to a new chat.");
    } catch {
      // The sticky mutation error + the global errorToast already surfaced the failure.
    }
  };

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
      notify.success("Copied to clipboard.");
    } catch {
      notify.error("Couldn't copy to clipboard.");
    }
  };

  return (
    <Row
      gap="field"
      align="center"
      justify="end"
      data-slot="message-actions-row"
      className={messageActionsRevealClass(messageActions)}
    >
      {editable ? (
        <Button intent="ghost" size="icon" aria-label="Edit message" onClick={onEdit}>
          <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Pencil} size="sm" />
        </Button>
      ) : null}
      {editable ? (
        <Button
          intent="ghost"
          size="icon"
          loading={hide.isPending}
          aria-label={excludedFromPrompt ? "Unhide from AI" : "Hide from AI"}
          onClick={onToggleHidden}
        >
          <Icon
            className={MESSAGE_ACTION_ICON_CLASS}
            icon={excludedFromPrompt ? EyeOff : Eye}
            size="sm"
          />
        </Button>
      ) : null}
      {editable ? (
        <Button
          intent="ghost"
          size="icon"
          loading={fork.isPending}
          aria-label="Fork chat here"
          onClick={(): void => void onFork()}
        >
          <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={GitFork} size="sm" />
        </Button>
      ) : null}
      <Button
        intent="ghost"
        size="icon"
        aria-label="Copy message"
        onClick={(): void => void onCopy()}
      >
        <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Copy} size="sm" />
      </Button>
      <Button
        intent="ghost"
        size="icon"
        loading={remove.isPending}
        aria-label="Delete message"
        onClick={(): void => setDeleteOpen(true)}
      >
        <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Trash2} size="sm" />
      </Button>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this message?"
        description="This can't be undone."
        confirmLabel="Delete"
        onConfirm={onDelete}
      />
    </Row>
  );
}
