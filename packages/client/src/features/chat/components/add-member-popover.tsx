// The cast-bar add-member affordance: a trailing "+" (host-only) opening an anchored Popover picker of
// characters not already in the roster. Picking a row adds it and keeps the popover open for more. A
// popover, not a modal-slot entry — this is a small anchored picker, not a rail/topbar interrupt. Source-
// agnostic over an onAdd(id) callback: committed wires chat.addCharacterToChat, draft wires the
// addDraftCharacter store write.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the chat-list-surface.tsx precedent).
import { Icon, UserPlus } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { addDraftCharacter } from "#state";
import { useAddCharacterToChat } from "../hooks/use-roster-mutations";
import { initialsForAttribution } from "../lib/attribution";

const PICKER_PAGE_LIMIT = 100;
const SKELETON_ROW_COUNT = 5;

type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

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
        <QueryBoundary
          fallback={<SkeletonRows count={SKELETON_ROW_COUNT} />}
          renderError={(_error, retry): ReactElement => (
            <QueryErrorState label="the character library" onRetry={retry} />
          )}
        >
          <PickerBody existingCharacterIds={existingCharacterIds} onAdd={onAdd} />
        </QueryBoundary>
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

function PickerBody({
  existingCharacterIds,
  onAdd,
}: {
  readonly existingCharacterIds: readonly CharacterId[];
  readonly onAdd: (id: CharacterId) => void;
}): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(
    trpc.character.list.queryOptions({ limit: PICKER_PAGE_LIMIT }),
  );
  const existing = new Set<string>(existingCharacterIds);
  const candidates = page.items.filter((c) => !existing.has(c.id));

  return (
    <Command label="Add a character" className="min-h-0">
      <CommandInput aria-label="Search characters" placeholder="Search characters…" />
      <CommandList className="max-h-80">
        <CommandEmpty>No other characters to add.</CommandEmpty>
        {candidates.map((character) => (
          <AddRow character={character} key={character.id} onAdd={onAdd} />
        ))}
      </CommandList>
    </Command>
  );
}

interface AddRowProps {
  readonly character: CharacterListItem;
  readonly onAdd: (id: CharacterId) => void;
}

function AddRow({ character, onAdd }: AddRowProps): ReactElement {
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  return (
    <CommandItem
      keywords={[character.name]}
      onSelect={(): void => onAdd(castId<CharacterId>(character.id))}
      value={character.id}
    >
      <Row align="center" className="min-w-0 flex-1" gap="row">
        <Avatar fallbackDelay={0} hueSeed={character.id} shape="square" size="sm" {...avatarSrc}>
          {initialsForAttribution(character.name)}
        </Avatar>
        <Text as="span" className="min-w-0 flex-1 truncate">
          {character.name}
        </Text>
      </Row>
    </CommandItem>
  );
}
