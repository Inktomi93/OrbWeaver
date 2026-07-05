// The NEW-CHAT character picker (ux-flow-revamp J2 · D62 P4) — the modal body the route composes over
// the app-shell `newChat` slot (home-page.tsx `modals={{newChat: <NewChatPicker/>}}`). Every "new chat"
// affordance (chat-list "+", landing hero, ⌘K "New chat") opens THIS first: a characterless draft is no
// longer the default trapdoor — it survives only as an explicit "Blank chat" pick (rule 2).
//
// A SURFACE (not an anchor): the ModalHost provides the Dialog container (the shell's ONE dialog seam);
// this is the injected BODY — a containment CONSUMER that renders `<Command>` (never its own Dialog), so
// it lives in surfaces/ and stays surface-pure (the CommandPaletteSurface precedent for a modal body).
//
// MULTI-SELECT founds a group (J7 pulled forward): `startChat` takes `characterIds[]` and the client
// `DraftSeed` is already plural, so picking N characters seeds an N-cast draft. cmdk has no native
// multi-select — so we keep the palette open on select (cmdk is not its own overlay; it never closes
// itself) and toggle a trailing check per row, with a "Start chat with N" confirm item at the top of the
// list (enabled once ≥1 is picked) and a "Blank chat" escape hatch always available.
//
// PRIMITIVE CHOICE (why `@orb/ui/command`, NOT `createCollectionSurface`): a picker-with-search is the
// §13.2 `command` row — cmdk owns the search box, client-side filtering, and the roving-listbox keyboard
// nav for free. It renders every item into the DOM (it is not virtualized), so the infinite/virtualized
// `createCollectionSurface` machine is the wrong tool here (the same "wrong tool for this data shape"
// reasoning `chat-list-surface.tsx` gives for not virtualizing a membership list). We read ONE bounded
// page of `character.list` (a generous limit; cmdk filters within it) via `useSuspenseQuery` in a
// `<QueryBoundary>`; selection is plain local `Set` state. A larger library than one page is a follow-up
// (server-side picker search) — flagged, not faked.
//
// LEAF-WRITER (§5.1): the picker writes intent straight through the shared `#state` module actions
// (`startNewChat` + `setActiveSection` + `closeModal`) — the sanctioned "arbitrary leaf triggers a
// navigation via store writes" shape, never a `#features/*` import. It reads `character.list` via
// `trpc.*` (the cross-feature contract, not a feature import).

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
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
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, useTRPC } from "#data";
import { closeModal, setActiveSection, startNewChat } from "#state";
import { initialsForAttribution } from "../lib/attribution";

/** One bounded page of the library — cmdk filters within it. A larger library needs server-side picker
 *  search (a follow-up): TODO(server) add a `search` param to `character.list` for full coverage. */
const PICKER_PAGE_LIMIT = 100;
const SKELETON_ROW_COUNT = 6;

type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

/** The picker body — a suspense read of the first library page inside the modal's QueryBoundary. */
export function NewChatPicker(): ReactElement {
  return (
    <QueryBoundary
      fallback={<PickerSkeleton />}
      renderError={(_error, retry): ReactElement => <ErrorState onRetry={retry} />}
    >
      <PickerBody />
    </QueryBoundary>
  );
}

/** The suspending body — reads the library page, then the multi-select command list + confirm items. */
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

  // Found the chat + land in it (the ONE action path, §4.2 rule 4): seed the draft, flip to Chats,
  // close the modal. The route's `chats.content` then mounts the seeded draft room.
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

/** One character row — avatar · name · a trailing check when picked; select TOGGLES (keeps the list open,
 *  the multi-select mechanism). `keywords` carries the display name so cmdk's `value`-based filter still
 *  matches what the user reads (the CommandItem R6 footgun). */
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

/** The suspense-free loading skeleton (a search bar + a few placeholder rows, never a spinner flash). */
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
