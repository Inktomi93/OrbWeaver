// The cast-bar add-member affordance: a trailing "+" (host-only) opening an anchored Popover picker of
// characters not already in the roster. Picking a row adds it and keeps the popover open for more. A
// popover, not a modal-slot entry — this is a small anchored picker, not a rail/topbar interrupt. Source-
// agnostic over an onAdd(id) callback: committed wires chat.addCharacterToChat, draft wires the
// addDraftCharacter store write. The Command picker body is the shared `CharacterPicker` composite.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the chat-list-surface.tsx precedent).
import { Icon, UserPlus } from "@orb/ui/icons";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { CharacterPicker } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { addDraftCharacter } from "#state";
import { useAddCharacterToChat } from "../hooks/use-roster-mutations";

function AddMemberShell({
  existingCharacterIds,
  onAdd,
}: {
  readonly existingCharacterIds: readonly CharacterId[];
  readonly onAdd: (id: CharacterId) => void;
}): ReactElement {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button intent="ghost" size="icon" aria-label="Add a character">
                  <Icon icon={UserPlus} size="sm" />
                </Button>
              }
            />
          }
        />
        <TooltipPopup side="top">Add a character</TooltipPopup>
      </Tooltip>
      <PopoverPopup>
        <CharacterPicker
          emptyText="No other characters to add."
          excludeIds={existingCharacterIds}
          label="Add a character"
          onSelect={onAdd}
          placeholder="Search characters…"
        />
      </PopoverPopup>
    </Popover>
  );
}

export interface AddMemberPopoverProps {
  readonly chatId: ChatId;
  readonly existingCharacterIds: readonly CharacterId[];
}

export function AddMemberPopover({
  chatId,
  existingCharacterIds,
}: AddMemberPopoverProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const add = useAddCharacterToChat({ trpc, invalidation });
  return (
    <AddMemberShell
      existingCharacterIds={existingCharacterIds}
      onAdd={(id): void => add.mutate({ chatId, characterId: id })}
    />
  );
}

export interface DraftAddMemberPopoverProps {
  readonly draftKey: string;
  readonly existingCharacterIds: readonly CharacterId[];
}

export function DraftAddMemberPopover({
  draftKey,
  existingCharacterIds,
}: DraftAddMemberPopoverProps): ReactElement {
  return (
    <AddMemberShell
      existingCharacterIds={existingCharacterIds}
      onAdd={(id): void => addDraftCharacter(draftKey, id)}
    />
  );
}
