// The guided-generations wand: the composer's current draft text becomes the guidance param, the item
// fires, the composer clears. ONE menu across draft + committed (no separate reduced-mode surface — the
// draft renders the SAME four items with the not-yet-applicable ones DISABLED, never a swapped sibling
// menu): Guided response / swipe / continue / Impersonate. "Guided response" is the one action a draft
// CAN take — it routes to `fireOpening` (chat.startChat, opening:"generate") pre-commit and to
// `fireResponse` (chat.generate) once committed, same user intent (steer the next AI turn) either side of
// the promotion. swipe/continue need a tail assistant turn to target; impersonate needs a committed chat —
// all three disable on a draft (and swipe/continue also disable on a committed chat with no assistant tail).

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, WandSparkles } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { DRAFT_UNLOCK_AFTER_SEND, NEEDS_ASSISTANT_REPLY, testId, WAND_NEEDS_TEXT } from "#lib";
import type { ChatHandle, DraftSeed } from "#state";
import { isCommitted, useTurnPhase } from "#state";
import { useGuidedActions } from "../hooks/use-guided-actions";
import { ImpersonateSubmenu } from "./impersonate-submenu";

export interface ComposerWandProps {
  readonly handle: ChatHandle;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed?: DraftSeed | undefined;
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
  /** True while the composer's own Send is in flight, so the wand can't fire a guided action against a
   *  still-populated draft during the send's pre-commit window. */
  readonly busy?: boolean | undefined;
}

export function ComposerWand({ handle, value, onChange, draftSeed, onCommitted, busy = false }: ComposerWandProps): ReactElement {
  const committed = isCommitted(handle);
  const chatId = committed ? handle.id : null;
  const phase = useTurnPhase(chatId);
  const turnBusy = phase === "pending" || phase === "streaming" || phase === "stopping";
  const guided = useGuidedActions({ handle, draftSeed, onCommitted });

  const trimmed = value.trim();
  const hasText = trimmed.length > 0;
  const canOpen = hasText && !turnBusy && !guided.isPending && !busy;
  // The disabled trigger explains itself on hover (owner: "when it's disabled on hover tell why"). The
  // empty-composer case is the FIRST thing a user sees on a fresh draft — name the unlock (type a message).
  // A busy/pending disablement is transient (a turn is running) — no persistent reason to surface there.
  const triggerReason = hasText ? undefined : WAND_NEEDS_TEXT;
  // A tail assistant slot to target — never present on a draft (no canon), so swipe/continue disable there.
  const canTargetTail = committed && guided.tailAssistantMessageId !== null;
  // The primary steer: a draft opens the chat (chat.startChat) with the steer; a committed chat generates
  // the next turn (chat.generate). Same item, same intent, phase picks the verb — no swapped sibling item.
  const firePrimarySteer = committed ? guided.fireResponse : guided.fireOpening;
  // Every disabled item names its unlock condition on hover (owner: "when it's disabled on hover tell why").
  // A draft unlocks on the first send; a committed chat with no assistant tail needs an assistant reply.
  const draftReason = committed ? undefined : DRAFT_UNLOCK_AFTER_SEND;
  const tailReason = canTargetTail ? undefined : (draftReason ?? NEEDS_ASSISTANT_REPLY);

  const fireAndClear = (run: (input: string) => void): void => {
    run(trimmed);
    onChange("");
  };

  return (
    <Menu>
      <MenuTrigger
        disabled={!canOpen}
        aria-label="Guided generations"
        data-testid={testId("composerWand")}
        render={
          // focusableWhenDisabled ⇒ Base UI renders aria-disabled (not native `disabled`), so the button
          // stays hoverable and the `title` reason surfaces on hover; the click stays a guarded no-op.
          <Button type="button" intent="ghost" size="icon" focusableWhenDisabled={true} title={triggerReason}>
            <Icon icon={WandSparkles} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        <MenuItem onClick={(): void => fireAndClear(firePrimarySteer)}>Guided response</MenuItem>
        <MenuItem disabled={!canTargetTail} title={tailReason} onClick={(): void => fireAndClear(guided.fireSwipe)}>
          Guided swipe
        </MenuItem>
        <MenuItem disabled={!canTargetTail} title={tailReason} onClick={(): void => fireAndClear(guided.fireContinue)}>
          Guided continue
        </MenuItem>
        {/* Impersonate needs a committed chat's turn machinery — disabled (never swapped away) on a draft. */}
        <ImpersonateSubmenu
          disabled={!committed}
          reason={draftReason}
          onPick={(person): void => fireAndClear((input) => guided.fireImpersonate(input, person))}
        />
      </MenuPopup>
    </Menu>
  );
}
