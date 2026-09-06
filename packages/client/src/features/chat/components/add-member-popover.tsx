// The character-bar add-member affordance: a trailing "+" (host-only) opening an anchored Popover picker of
// characters not already in the roster. Picking a row adds it and keeps the popover open for more. A
// popover, not a modal-slot entry — this is a small anchored picker, not a rail/topbar interrupt. The
// Command picker body is the shared `CharacterPicker` composite.
//
// The DRAFT twin (which wrote an `addDraftCharacter` store entry instead of the roster verb) is gone with
// draft mode (chat-creation-draft-mode-replacement.md §4.1, R1): every room has a roster to add into.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, UserPlus } from "@orb/ui/icons";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import type { ReactElement } from "react";
import { CharacterPicker } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useAddCharacterToChat } from "../hooks/use-roster-mutations.ts";

function AddMemberShell({
  existingCharacterIds,
  onAdd,
}: {
  readonly existingCharacterIds: readonly CharacterId[];
  readonly onAdd: (id: CharacterId) => void;
}): ReactElement {
  return (
    <Popover>
      {/* THE DOOR CARRIES ITS OWN WORD (#848). Icon-only, this trigger sat 4px from the labelled
          "Add cast…" in the CAST header — two person-glyph affordances in one row, one of them mute, and a
          first-timer could not predict which added a group and which added a person (side-eye 2026-08-30
          P2; #490-8 had established exactly ONE add-character door before B10 landed its sibling). The
          discriminator was a VISIBLE noun on each: "cast" vs "character" (the header is "Characters" now, #922).

          THE VISIBLE TEXT IS THE ACCESSIBLE NAME NOW, and it is the SAME STRING the `aria-label` carried —
          so WCAG 2.5.3 holds by construction (the visible label cannot fail to be contained in a name it
          IS) and no consumer's `getByRole("button", { name: "Add a character" })` moves. The Tooltip goes
          with the aria-label: a tooltip that repeats a visible label is noise, and it was only ever there
          because the trigger had no word of its own. */}
      <PopoverTrigger
        render={
          <Button intent="ghost" size="sm">
            <Icon icon={UserPlus} size="sm" />
            Add a character
          </Button>
        }
      />
      <PopoverPopup>
        <CharacterPicker
          autoFocusSearch={true}
          emptyText="No other characters to add."
          excludeIds={existingCharacterIds}
          label="Add a character"
          onSelect={onAdd}
          placeholder="Search characters…"
          reserveKey="chat.addMemberPicker"
        />
      </PopoverPopup>
    </Popover>
  );
}

export interface AddMemberPopoverProps {
  readonly chatId: ChatId;
  readonly existingCharacterIds: readonly CharacterId[];
}

export function AddMemberPopover({ chatId, existingCharacterIds }: AddMemberPopoverProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const add = useAddCharacterToChat({ trpc, invalidation });
  return <AddMemberShell existingCharacterIds={existingCharacterIds} onAdd={(id): void => add.mutate({ chatId, characterId: id })} />;
}
