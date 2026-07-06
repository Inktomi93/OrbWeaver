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
// FORK NAVIGATION SEAM — now WIRED (the active-chat store closed the gap the earlier note called for).
// `forkChat` returns the new chat's id; the `onChatForked` callback threads UP through
// `MessageRow`/`MessageListSurface`/`ChatRoomSurface` from the route, which maps it to the active-chat
// store's `selectChat` — the SAME landing the chat-list select + the new-chat flow use (one seam, unified
// at state, §5.1). Optional: a caller that hasn't wired it (e.g. a CT of the row alone) still forks +
// notifies; only navigation is skipped.

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
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { startEditingMessage } from "#state";

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
// BUS-DRIVEN (mutation-vs-bus rule, invalidation.ts): both act on the OPEN chat, and their verbs emit a
// canon event on it — setMessageHidden → messageHidden, deleteMessages → messagesDeleted (both → chatReads)
// — delivered by the active subscription → the seam refetches. `invalidates` empty; the removed keys were a
// redundant backstop. (Fork is DIFFERENT — it creates a chat you're not yet subscribed to; it keeps below.)
const useHideMutation = createEntityMutation<HideVars, unknown>({
  options: (trpc) => trpc.chat.setMessageHidden.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't change that message's visibility.",
});

const useDeleteMutation = createEntityMutation<DeleteVars, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't delete that message.",
});

// KEEP: `forkChat` emits `chatCreated` on a NEW chat the caller is NOT subscribed to (like startChat), so
// the bus can't refresh the list here — the mutation-side `listChats` invalidate is the only refresh.
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
  /** Navigate to the forked chat once `forkChat` resolves (the route maps this to `selectChat`).
   *  Optional — a row without it still forks + notifies, just doesn't switch the active chat. */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
}

/** The always-available per-message action affordance: Edit · Hide-from-AI · Delete · Fork · Copy. */
export function MessageActionsRow({ message, onChatForked }: MessageActionsRowProps): ReactElement {
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
      // Navigate to the fork (the wired seam — see file header), then confirm. A caller without the
      // callback still forks (`chat.listChats` is invalidated above so any list refreshes) + notifies.
      onChatForked?.(result.chat.id);
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
    // UIP-305 progressive disclosure (§4.3 rule 4): the action cluster rests hidden (opacity-0 +
    // pointer-events-none), revealed on row hover (`group-hover`, the message-row `group` hook) AND on
    // keyboard focus within it (`group-focus-within` — the gate-relevant keyboard-parity half), and is
    // ALWAYS visible on a coarse pointer (`pointer-coarse:` — a capability variant, not a viewport one,
    // so it's compose-legal per the no-media-queries-in-features carve-out). Right-aligned under the
    // bubble edge (`justify-end`), quiet metadata voice — not a full-width toolbar.
    <Row
      gap="field"
      align="center"
      justify="end"
      data-slot="message-actions-row"
      className="pointer-events-none opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
    >
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
