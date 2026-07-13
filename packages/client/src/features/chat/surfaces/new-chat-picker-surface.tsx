// The new-chat character picker: the modal body every "new chat" affordance opens first, so a
// characterless draft survives only as an explicit "Blank chat" pick. Renders @orb/ui/command (not
// createCollectionSurface — it's not virtualized, and cmdk owns search/filtering/keyboard nav for
// free). Multi-select keeps the palette open on select and toggles a trailing check per row, with a
// "Start chat with N" confirm item and a "Blank chat" escape hatch. Writes intent through #state module
// actions directly (startNewChat/setActiveSection/closeModal).

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@orb/ui/command";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the chat-list-surface.tsx precedent).
import { Check, Icon, MessagesSquare, Plus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { closeModal, setActiveSection, startNewChat } from "#state";
import { initialsForAttribution } from "../lib/attribution";

// A larger library needs server-side picker search (a follow-up) — TODO(server) add a search param.
const PICKER_PAGE_LIMIT = 100;
const SKELETON_ROW_COUNT = 6;

type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

export function NewChatPicker(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<SkeletonRows count={SKELETON_ROW_COUNT} />}
        renderError={(_error, retry): ReactElement => (
          <QueryErrorState label="the character library" onRetry={retry} />
        )}
      >
        <PickerBody />
      </QueryBoundary>
    </Stack>
  );
}

function PickerBody(): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(
    trpc.character.list.queryOptions({ limit: PICKER_PAGE_LIMIT }),
  );
  const characters = page.items;
  const [selected, setSelected] = useState<ReadonlySet<CharacterId>>(() => new Set<CharacterId>());

  const toggle = (id: CharacterId): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const found = (characterIds: readonly CharacterId[]): void => {
    startNewChat(characterIds.length > 0 ? { characterIds } : undefined);
    setActiveSection("chats");
    closeModal();
  };

  const selectedCount = selected.size;

  return (
    <Command label="Choose characters" onEscape={closeModal} className="min-h-0">
      <CommandInput aria-label="Search characters" placeholder="Search characters…" />
      <CommandList className="max-h-96">
        <CommandEmpty>No characters match.</CommandEmpty>

        <CommandGroup heading="Start">
          <CommandItem
            keywords={["start", "chat", "group"]}
            disabled={selectedCount === 0}
            onSelect={(): void => found([...selected])}
            value="__start__"
          >
            <Icon icon={MessagesSquare} size="sm" />
            {selectedCount === 0
              ? "Pick a character to start"
              : `Start chat with ${selectedCount} character${selectedCount === 1 ? "" : "s"}`}
          </CommandItem>
          <CommandItem
            keywords={["blank", "assistant", "solo"]}
            onSelect={(): void => found([])}
            value="__blank__"
          >
            <Icon icon={Plus} size="sm" />
            Blank chat
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Characters">
          {characters.map((character) => (
            <CharacterPickRow
              character={character}
              key={character.id}
              onToggle={toggle}
              selected={selected.has(castId<CharacterId>(character.id))}
            />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

interface CharacterPickRowProps {
  readonly character: CharacterListItem;
  readonly selected: boolean;
  readonly onToggle: (id: CharacterId) => void;
}

// keywords carries the display name so cmdk's value-based filter still matches what the user reads.
function CharacterPickRow({ character, selected, onToggle }: CharacterPickRowProps): ReactElement {
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  return (
    <CommandItem
      keywords={[character.name]}
      onSelect={(): void => onToggle(castId<CharacterId>(character.id))}
      value={character.id}
    >
      <Row align="center" gap="row" className="min-w-0 flex-1">
        <Avatar shape="square" size="sm" hueSeed={character.id} fallbackDelay={0} {...avatarSrc}>
          {initialsForAttribution(character.name)}
        </Avatar>
        <Text as="span" className="min-w-0 flex-1 truncate">
          {character.name}
        </Text>
        {selected ? <Icon icon={Check} size="sm" /> : null}
      </Row>
    </CommandItem>
  );
}
