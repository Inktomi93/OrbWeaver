// The cast-bar ADD-MEMBER affordance (ux-flow-revamp J7) — a trailing "+" on the cast bar (host-only)
// opening a quiet anchored Popover picker of characters NOT already in the roster. Picking a row adds
// that character (`chat.addCharacterToChat` — the J7 router pass-through) and keeps the popover open so
// several can be added in a row; the cast bar re-renders as `getChat` invalidates.
//
// A POPOVER, not a MODAL_SLOTS entry (§4.2 rule 5): this is a small anchored picker off a content
// affordance, not a rail/topbar-triggered interrupt — so it does NOT belong in the shell modal registry
// (the new-chat picker, which IS rail/⌘K-reachable, does). Composes `@orb/ui/command` for the search +
// roving-listbox keyboard nav (the new-chat-picker precedent); reads ONE bounded `character.list` page
// (a larger library needs server-side picker search — the same follow-up flagged there).

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the chat-list-surface.tsx precedent).
import { Icon, UserPlus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useAddCharacterToChat } from "../hooks/use-roster-mutations";
import { initialsForAttribution } from "../lib/attribution";

const PICKER_PAGE_LIMIT = 100;
const SKELETON_ROW_COUNT = 5;

type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

export interface AddMemberPopoverProps {
  readonly chatId: ChatId;
  /** The characters already in the roster — excluded from the picker (no double-seat). */
  readonly existingCharacterIds: readonly CharacterId[];
}

/** The cast-bar "+" → an anchored character picker; picking adds the member (host-only affordance). */
export function AddMemberPopover({
  chatId,
  existingCharacterIds,
}: AddMemberPopoverProps): ReactElement {
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
          fallback={<PickerSkeleton />}
          renderError={(_error, retry): ReactElement => <ErrorState onRetry={retry} />}
        >
          <PickerBody chatId={chatId} existingCharacterIds={existingCharacterIds} />
        </QueryBoundary>
      </PopoverPopup>
    </Popover>
  );
}

function PickerBody({ chatId, existingCharacterIds }: AddMemberPopoverProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const add = useAddCharacterToChat({ trpc, invalidation });
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
          <AddRow
            character={character}
            key={character.id}
            onAdd={(id): void => add.mutate({ chatId, characterId: id })}
          />
        ))}
      </CommandList>
    </Command>
  );
}

interface AddRowProps {
  readonly character: CharacterListItem;
  readonly onAdd: (id: CharacterId) => void;
}

/** One candidate row — avatar · name; selecting adds it (the popover stays open for more). `keywords`
 *  carries the display name so cmdk's `value`-based filter still matches what the user reads. */
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

/** The suspense-free loading skeleton (a search bar + a few placeholder rows). */
function PickerSkeleton(): ReactElement {
  return (
    <Stack aria-busy={true} gap="row" padding="block">
      <Skeleton className="h-control-md w-full" />
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => i).map((i) => (
        <Skeleton className="h-control-lg w-full" key={i} />
      ))}
    </Stack>
  );
}

/** The read-error surface — the QueryBoundary retry actually refetches (the reset handshake). */
function ErrorState({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  return (
    <Stack align="center" gap="row" justify="center" padding="section">
      <Text tone="muted">Couldn't load the character library.</Text>
      <Button intent="ghost" onClick={onRetry}>
        Retry
      </Button>
    </Stack>
  );
}
