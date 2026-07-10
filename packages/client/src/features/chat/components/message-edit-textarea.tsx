// Edit-in-place's textarea half (the per-message ACTION cluster's edit affordance; scout brief
// "edit-in-place"). `message-row.tsx` swaps this in for `<MessageContent>` while
// `useIsEditingMessage(message.id)` is true — the mode flag + the in-progress TEXT both live in the
// EXTERNAL `state/message-edit-draft` store, never `useState` (FINAL-Chats §6.3 mandates an external
// edit-draft store: `@orb/ui/message-list` now ships the PD-119 `keepMounted` predicate, but the chat
// surface does NOT pin editing rows with it, so a component-local draft would silently drop on a
// scroll-driven unmount/remount).
//
// Keyboard: Enter (no Shift) saves, Esc cancels (discards the draft, reverts to the read-only body),
// Shift+Enter inserts a newline (the Textarea's native behavior — only plain Enter is intercepted),
// same contract as the composer's own `onKeyDown` (components/composer.tsx).
//
// Save fires `chat.editMessage` directly (module-scope `createEntityMutation`, the swipe-strip.tsx
// precedent for a mutation living in a `components/` leaf rather than `hooks/`); on success the draft
// is cleared (exits edit mode) — the bus's `messageEdited` re-fold (already wired,
// data/bus/apply-chat-bus-event.ts → invalidate) is what refreshes the row's rendered content, this
// component never patches the query cache itself. A failed save leaves the textarea (and the draft)
// in place so the user can retry without losing their edit; the mutation's `errorToast` config
// surfaces the failure through the one global `notify` seam.
//
// THE PLUGGABLE SAVE SEAM (decision #3 — the draft greeting): an optional `onSave` OVERRIDES the verb
// path. A draft greeting has no server row, so `message-row.tsx` passes `onSave={setDraftGreeting}` —
// the same edit UI, keyboard, and focus behavior, but the text lands in the draft-config store (sync,
// no mutation) instead of `chat.editMessage`. Empty IS allowed on this path (it clears to the card
// default at commit, per draft-config-store). Absent `onSave` ⇒ the unchanged committed verb path.
//
// SCROLL PRESERVATION (neo precedent, `reference/neo-tavern` message-edit-textarea.tsx): neo manually
// wrote `el.style.height = "auto"` then `scrollHeight`-remeasured on every keystroke, and had to
// capture/restore the scroll ancestor's `scrollTop` around that JS-driven collapse-then-regrow (its
// own "gotcha" — the collapse-to-auto step is what jumped the scroll). `@orb/ui/textarea` grows via
// native CSS `field-sizing: content` (D54 — deliberately NO JS measuring), which has no collapse step
// to compensate for; porting neo's scrollTop dance here would be dead code re-solving a problem this
// primitive doesn't have. What IS ported: autofocus + caret-to-end on entering edit mode (a genuine UX
// decision, orthogonal to the resize mechanism).

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

// Module-scope factory → a stable hook identity (§13.1). BUS-DRIVEN: `editMessage` emits messageEdited
// (→ chatReads) on the OPEN chat, delivered by the active subscription → the seam refetches. `busDriven`
// — re-invalidating those keys was a redundant backstop (the mutation-vs-bus rule, invalidation.ts).
const useEditMessageMutation = createEntityMutation<EditMessageVars, unknown>({
  options: (trpc) => trpc.chat.editMessage.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that edit.",
});

export interface MessageEditTextareaProps {
  readonly message: MessageView;
  /** The pluggable save seam (decision #3): when present, save persists the text HERE (e.g. the draft
   *  greeting → `setDraftGreeting`) instead of firing the `chat.editMessage` verb. Empty is allowed on
   *  this path. Absent ⇒ the committed verb path (the default). */
  readonly onSave?: ((text: string) => void) | undefined;
}

/** The in-place edit textarea — replaces a row's read-only body while it is in edit mode. */
export function MessageEditTextarea({ message, onSave }: MessageEditTextareaProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const editMessage = useEditMessageMutation({ trpc, invalidation });
  const text = useMessageEditDraftText(message.id);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autofocus + caret-to-end on entering edit mode (neo precedent, see file header) — mount-only.
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
      // The pluggable seam (draft greeting): persist locally, exit edit mode. Empty allowed (clears to
      // the card default at commit). Sync — no mutation, so no pending/error chrome to await.
      onSave(text);
      cancelEditingMessage(message.id);
      return;
    }
    if (editMessage.isPending || text.length === 0) {
      return; // the server rejects empty content; nothing to save yet
    }
    if (text === message.content) {
      cancel(); // no-op edit — just return to read-only without firing the mutation
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
      // The sticky mutation error + the global errorToast already surfaced the failure — stay in
      // edit mode (and keep the draft) so the user can retry without retyping.
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
    // Shift+Enter: the Textarea's native newline insertion, untouched.
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
