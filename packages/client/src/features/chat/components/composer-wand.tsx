// The guided-generations wand: the composer's current draft text becomes the guidance param, the item
// fires, the composer clears. Committed shows four items (Guided response/swipe/continue/Impersonate);
// swipe/continue disable when the transcript has no tail assistant slot to target. Draft shows the
// degenerate "Guide the opening" instead.

import { GUIDED_IMPERSONATE_PERSONS } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, WandSparkles } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { testId } from "#lib";
import type { ChatHandle, DraftSeed } from "#state";
import { isCommitted, useTurnPhase } from "#state";
import { useGuidedActions } from "../hooks/use-guided-actions";

const PERSON_LABEL: Record<(typeof GUIDED_IMPERSONATE_PERSONS)[number], string> = {
  first: "1st person",
  second: "2nd person",
  third: "3rd person",
};

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
  const chatId = isCommitted(handle) ? handle.id : null;
  const phase = useTurnPhase(chatId);
  const turnBusy = phase === "pending" || phase === "streaming" || phase === "stopping";
  const guided = useGuidedActions({ handle, draftSeed, onCommitted });

  const trimmed = value.trim();
  const canOpen = trimmed.length > 0 && !turnBusy && !guided.isPending && !busy;
  const canTargetTail = guided.tailAssistantMessageId !== null;

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
            <MenuItem onClick={(): void => fireAndClear(guided.fireResponse)}>Guided response</MenuItem>
            <MenuItem disabled={!canTargetTail} onClick={(): void => fireAndClear(guided.fireSwipe)}>
              Guided swipe
            </MenuItem>
            <MenuItem disabled={!canTargetTail} onClick={(): void => fireAndClear(guided.fireContinue)}>
              Guided continue
            </MenuItem>
            <MenuSubmenuRoot>
              <MenuSubmenuTrigger>Impersonate</MenuSubmenuTrigger>
              <MenuPopup>
                {GUIDED_IMPERSONATE_PERSONS.map((person) => (
                  <MenuItem key={person} onClick={(): void => fireAndClear((input) => guided.fireImpersonate(input, person))}>
                    {PERSON_LABEL[person]}
                  </MenuItem>
                ))}
              </MenuPopup>
            </MenuSubmenuRoot>
          </>
        ) : (
          <MenuItem onClick={(): void => fireAndClear(guided.fireOpening)}>Guide the opening</MenuItem>
        )}
      </MenuPopup>
    </Menu>
  );
}
