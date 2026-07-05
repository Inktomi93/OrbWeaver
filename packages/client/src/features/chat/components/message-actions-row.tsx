// The per-message ACTION cluster (scout brief "message-actions/edit-in-place"): Edit · Hide-from-AI ·
// Delete · Fork · Copy, always-available on a canon row (message-row.tsx never renders a streaming
// row — that's the separate ghost-message-row.tsx — so "non-streaming rows only" is true by
// construction, no turn-phase check needed here). A later appearance-pref task may collapse this to
// hover/expanded chrome; for now every row shows it, same posture as SwipeStrip.
//
// GATING per row kind (author-or-host authority mirrors the domain verbs' own gates, but this row does
// NOT re-derive authority client-side — a caller without permission simply gets the verb's leak-free
// NOT_FOUND, same as every other mutation in this feature):
//   • Edit    — user + assistant rows (a system row is a room notice, not user-authored prose to
//     inline-edit here).
//   • Hide    — user + assistant rows (per the build brief).
//   • Fork    — user + assistant rows (per the build brief; forking "at" a system-only tail is an
//     unlikely path and the brief scopes fork to the same two roles as hide).
//   • Delete  — every role (author-or-host per-slot; the server gate is the real authority).
//   • Copy    — every role (pure client, no mutation).
//
// Each mutation goes through `createEntityMutation` (module scope, §13.1) — the swipe-strip.tsx
// precedent for a `components/` leaf owning its own mutations rather than a `hooks/` file. Edit doesn't
// mutate here at all: it only flips the external edit-draft store's mode (state/message-edit-draft) —
// message-row.tsx reads that flag and swaps in `<MessageEditTextarea>`, which owns the actual
// `chat.editMessage` call. Hide/Delete/Fork rely on the bus's `messageHidden`/`messagesDeleted`/
// `chatCreated` re-folds (already wired) for the eventual cache refresh; `invalidates` is the
// settle-time backstop, never a manual cache patch.
//
// FORK NAVIGATION SEAM — genuinely absent, not invented (report per the build brief): `forkChat`
// returns the new `ChatDetail` (id + all), but there is no prop path from this row up to
// `ChatRoomSurface`'s `setHandle`/`onChatStarted` (surfaces/chat-room-surface.tsx — off-limits to this
// lane, and its `onChatStarted` callback is only threaded from the composer's OWN draft→committed
// promotion, not from deep inside the message-list's row tree). So Fork here can create the new chat
// and tell the user it happened (`notify.success`, `chat.listChats` invalidated so any chat-list
// surface will show it), but it CANNOT navigate the user there. A real "switch the active pane to
// chat X" seam needs a shell-level current-chat concern (or an `onForked` callback threaded down
// through `MessageListSurface`/`ChatRoomSurface`) — out of this lane's file set.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@orb/ui/alert-dialog";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' re-export of the lucide-react glyphs (external .d.ts); tsc resolves the barrel (same class as swipe-strip.tsx).
import { Copy, Eye, EyeOff, GitFork, Icon, Pencil, Trash2 } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { createEntityMutation, useTRPC } from "#data";
import { notify } from "#lib";
import { startEditingMessage } from "#state";
import { useInvalidation } from "../hooks/use-invalidation";

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

// Module-scope factories → stable hook identities (§13.1). Every settle reconciles through the
// central invalidation seam; the bus's own re-fold (messageHidden/messagesDeleted/chatCreated) is the
// primary path, this is the backstop, same posture as swipe-strip.tsx.
const useHideMutation = createEntityMutation<HideVars, unknown>({
  options: (trpc) => trpc.chat.setMessageHidden.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listMessages.pathFilter(),
  ],
  errorToast: "Couldn't change that message's visibility.",
});

const useDeleteMutation = createEntityMutation<DeleteVars, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listMessages.pathFilter(),
  ],
  errorToast: "Couldn't delete that message.",
});

const useForkMutation = createEntityMutation<ForkVars, { chat: { id: ChatId } }>({
  options: (trpc) => trpc.chat.forkChat.mutationOptions(),
  invalidates: (trpc) => [trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't fork this chat.",
});

/** Roles the Edit/Hide/Fork actions apply to — a system row is a room notice, not authored prose. */
function isEditableRole(role: MessageView["role"]): boolean {
  return role === "user" || role === "assistant";
}

export interface MessageActionsRowProps {
  readonly message: MessageView;
}

/** The always-available per-message action affordance: Edit · Hide-from-AI · Delete · Fork · Copy. */
export function MessageActionsRow({ message }: MessageActionsRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const hide = useHideMutation({ trpc, invalidation });
  const remove = useDeleteMutation({ trpc, invalidation });
  const fork = useForkMutation({ trpc, invalidation });

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
  };

  const onFork = async (): Promise<void> => {
    if (fork.isPending) {
      return;
    }
    try {
      const result = await fork.mutateAsync({ chatId, throughSeq: message.seq });
      // No navigation seam from here (see file header) — tell the user it happened; they switch to
      // it via whatever chat-list surface lands next (`chat.listChats` is invalidated above).
      notify.success(`Forked to a new chat (${result.chat.id}).`);
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
    <Row gap="field" align="center" data-slot="message-actions-row">
      {editable ? (
        <Button intent="ghost" size="icon" aria-label="Edit message" onClick={onEdit}>
          <Icon icon={Pencil} size="sm" />
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
          <Icon icon={excludedFromPrompt ? EyeOff : Eye} size="sm" />
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
          <Icon icon={GitFork} size="sm" />
        </Button>
      ) : null}
      <Button
        intent="ghost"
        size="icon"
        aria-label="Copy message"
        onClick={(): void => void onCopy()}
      >
        <Icon icon={Copy} size="sm" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              intent="ghost"
              size="icon"
              loading={remove.isPending}
              aria-label="Delete message"
            >
              <Icon icon={Trash2} size="sm" />
            </Button>
          }
        />
        <AlertDialogPopup>
          <AlertDialogTitle>Delete this message?</AlertDialogTitle>
          <AlertDialogActions>
            <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
            <AlertDialogClose
              render={
                <Button intent="destructive" onClick={onDelete}>
                  Delete
                </Button>
              }
            />
          </AlertDialogActions>
        </AlertDialogPopup>
      </AlertDialog>
    </Row>
  );
}
