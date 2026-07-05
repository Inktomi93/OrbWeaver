// The guided-generations WAND (chat-surface-lane task #27) — the USER's ephemeral steering, a composer
// dropdown over BUILT substrate (`@orb/kit/guided`'s resolver, `contracts/preset`'s `GuidedActionKind` +
// the guided-actions config, the chat domain verbs impersonate/continueTurn/swipe/generate). Distinct
// from crew's PERSISTENT guides (chat-crew CW6, Wave 3, `chat_injections` auto-refresh) — this is a
// one-turn, no-crew steer: the composer's CURRENT DRAFT TEXT becomes the guidance param, the item fires,
// the composer clears (mirrors Send's own `send(value); onChange("")` shape, composer.tsx).
//
// Branch on the `ChatHandle` DISCRIMINANT (never an ambient boolean, UI-Gates §11.3) — the dispatch
// itself lives in `hooks/use-guided-actions.ts` (there is no server-side per-kind registry to call
// through; see that file's header):
//   • COMMITTED — four items: Guided response / Guided swipe / Guided continue / Impersonate (a
//     1st/2nd/3rd-person submenu). Swipe/continue are individually disabled when the transcript has no
//     tail ASSISTANT slot to target (an empty room / a mid-turn tail) — the same "last assistant message
//     only" gate the swipe strip itself applies.
//   • DRAFT — the degenerate "Guide the opening" (no committed turn exists yet; the steer rides the
//     founding `generate` opening instead — see the hook's header).
// The trigger itself gates on a non-empty draft + not mid-flight (a live turn OR one of the wand's own
// mutations already in flight) — same posture as the Send button's own `disabled={!canSubmitText ||
// isPending}` (composer.tsx).

import { GUIDED_IMPERSONATE_PERSONS } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the composer.tsx precedent).
import { Icon, WandSparkles } from "@orb/ui/icons";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@orb/ui/menu";
import type { ReactElement } from "react";
import { testId } from "#lib";
import type { ChatHandle, DraftSeed } from "#state";
import { isCommitted, useTurnPhase } from "#state";
import { useGuidedActions } from "../hooks/use-guided-actions";

/** Label per {@link GUIDED_IMPERSONATE_PERSONS} word — a `Record` dispatch (spine §5.5), never an
 *  inline switch, so a new person word fails `tsc` here instead of silently rendering nothing. */
const PERSON_LABEL: Record<(typeof GUIDED_IMPERSONATE_PERSONS)[number], string> = {
  first: "1st person",
  second: "2nd person",
  third: "3rd person",
};

export interface ComposerWandProps {
  readonly handle: ChatHandle;
  /** The composer's controlled draft text — ALSO the guidance param (see the file header). */
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed?: DraftSeed | undefined;
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
}

/** The composer's wand trigger + dropdown — guided response/swipe/continue/impersonate (committed) or
 *  the degenerate "Guide the opening" (draft). */
export function ComposerWand({
  handle,
  value,
  onChange,
  draftSeed,
  onCommitted,
}: ComposerWandProps): ReactElement {
  const chatId = isCommitted(handle) ? handle.id : null;
  const phase = useTurnPhase(chatId);
  // Mid-flight = a live turn (mirrors composer.tsx's own `showStop` phases) OR one of the wand's own
  // mutations still in flight (firing a second guided action before the first settles would race).
  const turnBusy = phase === "pending" || phase === "streaming" || phase === "stopping";
  const guided = useGuidedActions({ handle, draftSeed, onCommitted });

  const trimmed = value.trim();
  const canOpen = trimmed.length > 0 && !turnBusy && !guided.isPending;
  const canTargetTail = guided.tailAssistantMessageId !== null;

  /** Fire a guided action against the CURRENT draft, then clear it — the Send-button precedent
   *  (composer.tsx: `sendMessage.send(value); onChange("")`), not a wait-for-settle clear. */
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
          <Button type="button" intent="ghost" size="icon">
            <Icon icon={WandSparkles} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        {isCommitted(handle) ? (
          <>
            <MenuItem onClick={(): void => fireAndClear(guided.fireResponse)}>
              Guided response
            </MenuItem>
            <MenuItem
              disabled={!canTargetTail}
              onClick={(): void => fireAndClear(guided.fireSwipe)}
            >
              Guided swipe
            </MenuItem>
            <MenuItem
              disabled={!canTargetTail}
              onClick={(): void => fireAndClear(guided.fireContinue)}
            >
              Guided continue
            </MenuItem>
            <MenuSubmenuRoot>
              <MenuSubmenuTrigger>Impersonate</MenuSubmenuTrigger>
              <MenuPopup>
                {GUIDED_IMPERSONATE_PERSONS.map((person) => (
                  <MenuItem
                    key={person}
                    onClick={(): void =>
                      fireAndClear((input) => guided.fireImpersonate(input, person))
                    }
                  >
                    {PERSON_LABEL[person]}
                  </MenuItem>
                ))}
              </MenuPopup>
            </MenuSubmenuRoot>
          </>
        ) : (
          <MenuItem onClick={(): void => fireAndClear(guided.fireOpening)}>
            Guide the opening
          </MenuItem>
        )}
      </MenuPopup>
    </Menu>
  );
}
