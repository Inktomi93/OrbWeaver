// THE NOMINEE'S CONFIRM (#1762) — the disclosure step between a `handoff-nominated` inbox row's Accept and
// the verb that hands the room over.
//
// WHY IT EXISTS. Accepting was one press of a bare "Accept", and that press copies the departing host's
// property into the ACCEPTER'S OWN LIBRARY: their seated characters, the lore behind them, the game's GM
// voice, and this room's chat-tier REGEX SCRIPTS — executable find/replace rules that then run over the
// accepter's own text (#1739). Nothing said so anywhere on the receiving side. The nominee could read the
// giving side's checkbox label only if they were the one giving.
//
// THE COUNTS ARE THE NOTIFICATION'S, NOT A SECOND ASK. `payload.offer` is frozen at nominate by the same
// resolvers the accept executes (`domain/chat/substrate/handoff-copy.previewHandoffCopyPlan`), so this
// surface renders a number rather than deriving one — there is no client-side query here to disagree with
// the server, and no in-flight state to flash.
//
// IT LIVES ABOVE THE POPOVER, not inside the row. The bell's inbox is a Popover: a modal alert dialog opened
// from inside it would be unmounted the moment the popover closed, taking the decision with it. So the bell
// closes the popover and renders this beside it — which is also the shape the invite/consent arms already
// use (close, then act).
//
// ZERO IS A STATEMENT, never a blank body: "nothing is copied" is exactly what a nominee who is being handed
// a bare room needs to read, and an empty list would leave them guessing which of the two it meant.

import type { HandoffOfferContents } from "@orb/contracts/chat";
import type { ChatId, NotificationId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { ConfirmDialog } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useAcceptHostHandoff } from "../hooks/use-handoff-actions.ts";
import { useDismissNotification } from "../hooks/use-inbox.ts";

/** `n` of a thing, in the reader's words — the plural is spelled here so no line has to carry an `s` in a
 *  template. */
function countLine(n: number, singular: string, plural: string): string {
  return `${String(n)} ${n === 1 ? singular : plural}`;
}

/** The offer as lines, one per class that actually lands. Zero-count classes are ABSENT rather than
 *  rendered as "0 characters": a list of nothings reads like a gift and this list is read to decide. */
function offerLines(offer: HandoffOfferContents): string[] {
  const lines: string[] = [];
  if (offer.characters > 0) {
    lines.push(countLine(offer.characters, "character", "characters"));
  }
  if (offer.worldBooks > 0) {
    lines.push(countLine(offer.worldBooks, "world book", "world books"));
  }
  if (offer.regexScripts > 0) {
    // THE ONE LINE THAT SAYS WHAT THE THING DOES, because a regex script is the only member of the offer
    // that EXECUTES — on this room's prompts, its stored messages and what the reader sees.
    lines.push(`${countLine(offer.regexScripts, "regex script", "regex scripts")} — find/replace that runs on this chat's text`);
  }
  if (offer.gmPreset) {
    lines.push("The game's GM voice — the preset this room's turns speak with");
  }
  return lines;
}

export interface HandoffAcceptConfirmProps {
  /** The room being handed over — the accept verb's only input. */
  readonly chatId: ChatId;
  /** The inbox row to clear once the handoff lands. */
  readonly notificationId: NotificationId;
  /** What accepting copies, as the nomination froze it. */
  readonly offer: HandoffOfferContents;
  /** Cancelled, or settled — either way this surface is done. */
  readonly onClose: () => void;
  /** The handoff landed: the caller navigates to the room it just took over. */
  readonly onAccepted: (chatId: ChatId) => void;
}

/** The confirm itself. Open by construction — the bell mounts it only while a nomination is being decided,
 *  so its lifetime IS the decision. */
export function HandoffAcceptConfirm({ chatId, notificationId, offer, onClose, onAccepted }: HandoffAcceptConfirmProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const acceptHandoff = useAcceptHostHandoff({ trpc, invalidation });
  const dismiss = useDismissNotification({ trpc, invalidation });
  const lines = offerLines(offer);

  // RETURNING THE SETTLE MAKES THIS DIALOG THE RETRY SURFACE (#1563): a withdrawn nomination fails here,
  // in the dialog that asked, instead of vanishing behind a toast.
  const onConfirm = async (): Promise<void> => {
    await acceptHandoff.mutateAsync({ chatId });
    onAccepted(chatId);
    // THE DISMISS IS FIRE-AND-FORGET, and that is #1501's ruling rather than a swallow: the two writes are
    // not one transaction, and a failed CLEANUP must never re-open a decision that already succeeded (a
    // second accept can only fail). The mutation carries its own errorToast, which is the surface for it —
    // the `.catch` here only keeps a rejected cleanup from unhandling itself into the console.
    void dismiss.mutateAsync({ notificationId }).catch(() => undefined);
  };

  return (
    <ConfirmDialog
      body={
        lines.length === 0 ? null : (
          // A REAL LIST, not a stack of paragraphs (the world-info small-arm spelling): this IS an
          // enumeration of what is being handed over, and a screen reader that says "list, 4 items" tells
          // the nominee how much is in the offer before it reads any of it. `gap="row"` because the lines
          // WRAP at a dialog's width — at a tighter gap a wrapped tail reads as its own item.
          <Stack aria-label="What accepting copies into your library" data-slot="handoff-offer-contents" gap="row" role="list">
            {lines.map((line, index) => (
              <Text aria-posinset={index + 1} aria-setsize={lines.length} key={line} role="listitem" voice="label">
                {line}
              </Text>
            ))}
          </Stack>
        )
      }
      confirmIntent="primary"
      confirmLabel="Accept"
      description={
        lines.length === 0
          ? "You become the host of this chat. Nothing is copied into your library."
          : "You become the host of this chat, and these copies land in your library — yours to edit or delete afterwards. The current host keeps their originals."
      }
      onConfirm={onConfirm}
      onOpenChange={(next): void => {
        if (!next) {
          onClose();
        }
      }}
      open={true}
      title="Accept hosting this chat?"
    />
  );
}
