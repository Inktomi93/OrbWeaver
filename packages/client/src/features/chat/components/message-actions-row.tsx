// The per-message action cluster: Edit / Fork inline, with Hide-from-AI / Copy / View-wire-trace / Delete
// under a ⋯ menu (D66 A3 collapse — north-star ui-cohesion §4 N3). Only a canon row renders it (the streaming
// row is a separate component with no actions). Edit/Hide/Fork apply only to user/assistant rows — a system row
// is a room notice, not authored prose. This row does not re-derive author-or-host authority client-side; a
// caller without permission gets the verb's own NOT_FOUND. Edit doesn't mutate here — it only flips the
// external edit-draft store's mode. The whole cluster's rest/reveal posture is `messageActionsRevealClass`
// (one home); the ⋯ arm is the sanctioned `RowActionsMenu` composite, which owns Delete's ConfirmDialog.
//
// WIREBTN (owner nit, 2026-08-03) — "View wire trace…" LIVES HERE, not on the metadata row. RAWVIEW grafted
// the host-only per-variant wire trigger onto `MessageMetadataRow` because that was the only per-VARIANT
// surface built at the time; the result was a lone quiet button under every message, outside the row-action
// grammar (D62 §12 — the kebab IS the action home). It is an action on this reply, so it is a menu item.
//
// WHY THE DIALOG IS A SIBLING OF THE MENU, NOT A CHILD: `MenuPopup` portals through `BaseMenu.Portal` with no
// `keepMounted`, and a `MenuItem` click closes the menu — a dialog rendered inside the popup would unmount in
// the same tick it was asked to open. `RowActionsMenu` already solves exactly this for its destructive item
// (the item is a child, the `ConfirmDialog` is a sibling); the wire viewer follows that precedent, which is
// also why the `open` state has to live in THIS component rather than in a split-out trigger file.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Code, Copy, Eye, EyeOff, GitFork, Icon, Pencil, Redo2, Undo2 } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useState } from "react";
import { RowActionsMenu } from "#components";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { NEEDS_CONTINUATION, notify, testId } from "#lib";
import { startEditingMessage } from "#state";
import { MESSAGE_ACTION_ICON_CLASS, messageActionsRevealClass } from "../lib/message-actions-reveal";
import { VariantWireViewer } from "./variant-wire-viewer";

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

interface ContinueRestoreVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
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

// Undo/revert the last continuation on THIS reply's shown swipe (F2). Bus-driven like the other row
// mutations — the verb emits `messageCommitted`, the surface refetches; no manual cache write here.
const useUndoContinueMutation = createEntityMutation<ContinueRestoreVars, unknown>({
  options: (trpc) => trpc.chat.undoContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't undo the continuation.",
});

const useRevertContinueMutation = createEntityMutation<ContinueRestoreVars, unknown>({
  options: (trpc) => trpc.chat.revertContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't re-apply the continuation.",
});

function isEditableRole(role: MessageView["role"]): boolean {
  return role === "user" || role === "assistant";
}

export interface MessageActionsRowProps {
  readonly message: MessageView;
  /** Optional — a caller without it still forks + notifies, just doesn't switch the active chat. */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  readonly messageActions?: "expanded" | "hover" | undefined;
  /** WIREBTN — the viewer holds the room HOST role (`ChatDetail.viewerIsHost`). Gates "View wire trace…":
   *  `chat.getVariantWire` is `requireHost` server-side, so a member is never offered an item that would only
   *  ever refuse — and is never told the plane exists. Absent ⇒ NOT host (fail-closed: a caller that forgets
   *  to thread it hides the item rather than exposing it). The server gate is the AUTHORITY; this is UX. */
  readonly viewerIsHost?: boolean | undefined;
}

export function MessageActionsRow({ message, onChatForked, messageActions, viewerIsHost = false }: MessageActionsRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const hide = useHideMutation({ trpc, invalidation });
  const remove = useDeleteMutation({ trpc, invalidation });
  const fork = useForkMutation({ trpc, invalidation });
  const undoContinue = useUndoContinueMutation({ trpc, invalidation });
  const revertContinue = useRevertContinueMutation({ trpc, invalidation });
  const [wireOpen, setWireOpen] = useState(false);

  const { chatId, id: messageId, role, content, excludedFromPrompt, hasContinuation } = message;
  const editable = isEditableRole(role);
  // Undo/revert target the continue snapshot, which only assistant replies carry. Phase-gated on the shown
  // swipe's snapshot presence (`hasContinuation`) — disabled-with-reason when absent, NEVER hidden (owner:
  // no reduced menus). Both stay enabled once a continuation exists (the snapshot is retained across an undo,
  // so revert re-applies it); the row simply toggles between the pre-continue and continued text.
  const showContinueRestore = role === "assistant";
  const continueRestoreReason = hasContinuation ? undefined : NEEDS_CONTINUATION;
  // A row whose shown swipe cannot HAVE a prompt gets no item at all: a `user` row is authored, never
  // generated (its variant's `promptSnapshot` is null by construction), and a `system` row is a room notice.
  // Absence here is a real answer — the assistant replies that DID generate are exactly the ones a host asks
  // "what did this send?" about. Not a disabled-with-reason item: this is APPLICABILITY, not a phase gate.
  const showWireTrace = viewerIsHost && role === "assistant";

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
      onChatForked?.(result.chat.id);
      notify.success("Forked to a new chat.");
    } catch {
      // The sticky mutation error + the global errorToast already surfaced the failure.
    }
  };

  const onUndoContinue = (): void => {
    if (undoContinue.isPending || !hasContinuation) {
      return;
    }
    undoContinue.mutate({ chatId, messageId });
  };

  const onRevertContinue = (): void => {
    if (revertContinue.isPending || !hasContinuation) {
      return;
    }
    revertContinue.mutate({ chatId, messageId });
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
    <Row gap="field" align="center" justify="end" data-slot="message-actions-row" className={messageActionsRevealClass(messageActions)}>
      {editable ? (
        <Button intent="ghost" size="icon" aria-label="Edit message" onClick={onEdit}>
          <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Pencil} size="sm" />
        </Button>
      ) : null}
      {editable ? (
        <Button intent="ghost" size="icon" loading={fork.isPending} aria-label="Fork chat here" onClick={(): void => void onFork()}>
          <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={GitFork} size="sm" />
        </Button>
      ) : null}
      <RowActionsMenu
        label="More message actions"
        destructive={{
          title: "Delete this message?",
          description: "This can't be undone.",
          confirmLabel: "Delete",
          onConfirm: onDelete,
        }}
      >
        {editable ? (
          <MenuItem onClick={onToggleHidden}>
            <Icon icon={excludedFromPrompt ? EyeOff : Eye} size="sm" />
            {excludedFromPrompt ? "Unhide from AI" : "Hide from AI"}
          </MenuItem>
        ) : null}
        <MenuItem onClick={(): void => void onCopy()}>
          <Icon icon={Copy} size="sm" />
          Copy
        </MenuItem>
        {/* The continue undo/redo pair (F2) — only on an assistant reply (the sole role that carries a
            continue snapshot), disabled-with-reason until a continue has run on the shown swipe. */}
        {showContinueRestore ? (
          <MenuItem disabled={!hasContinuation} title={continueRestoreReason} onClick={onUndoContinue}>
            <Icon icon={Undo2} size="sm" />
            Undo last continuation
          </MenuItem>
        ) : null}
        {showContinueRestore ? (
          <MenuItem disabled={!hasContinuation} title={continueRestoreReason} onClick={onRevertContinue}>
            <Icon icon={Redo2} size="sm" />
            Re-apply continuation
          </MenuItem>
        ) : null}
        {showWireTrace ? (
          <MenuItem data-testid={testId("variantWireTrigger")} onClick={(): void => setWireOpen(true)}>
            <Icon icon={Code} size="sm" />
            View wire trace…
          </MenuItem>
        ) : null}
      </RowActionsMenu>
      {/* Mounted only once opened — an unopened row builds no query key and no dialog subtree (the viewer's
          own read is `enabled: open`, so this is belt-and-braces on the same gate). */}
      {wireOpen ? <VariantWireViewer chatId={chatId} variantId={message.selectedVariantId} open={wireOpen} onOpenChange={setWireOpen} /> : null}
    </Row>
  );
}
