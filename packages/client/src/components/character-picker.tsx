// CharacterPicker — the client-shared searchable character-picker body (clone-audit item 3): the
// QueryBoundary(SkeletonRows/QueryErrorState) → useSuspenseQuery(character.list) → @orb/ui/command list of
// avatar+name rows shared by add-member-popover ↔ new-chat-picker-surface. The OUTER chrome differs (an
// anchored Popover vs a modal focus-stack) and stays with each consumer; this composite owns the query +
// the Command body. Reads characters through the tRPC seam (`trpc.character.list`), never a character-feature
// internal — so it is legal to consume from the chat feature.
//
// THE SEARCH IS THE SERVER'S (owner ruling 2026-08-13). This used to be ONE `limit: 100` recency page with
// cmdk filtering inside it: past the hundredth card a character was simply unreachable from the new-chat
// picker, and typing her name found nothing while she sat in the library — the owner hit exactly that. The
// typed value is now a DEBOUNCED `character.list` search param over the whole library, so the picker and the
// library answer the same question with the same predicate. cmdk's own value filter is left ON: it is a
// second, cheap narrowing of the page already in hand, and it keeps keyboard highlighting coherent while a
// new page is in flight.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — it wires #data/#state client seams). Named `CharacterPicker`
// (not the spec's generic "EntityPicker"): both consumers pick characters and the row is character-shaped
// (avatar+name); an honest name beats a speculative generalization (§13.9).

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
import { Check, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useDeferredValue, useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { useDebouncedValue, useFocusOnSwap } from "#lib";

/** Rows per page. With a server predicate behind the box this is a page of the MATCHES, not a slice of the
 *  library taken before the question was asked. */
const PICKER_PAGE_LIMIT = 100;
const DEFAULT_SKELETON_ROW_COUNT = 5;

/** Keystroke→request damper (the chats pane / library value). */
const SEARCH_DEBOUNCE_MS = 250;

type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

export interface CharacterPickerProps {
  /** The Command's accessible label + search-input aria. */
  readonly label: string;
  /** Search-input placeholder, e.g. "Search characters…". */
  readonly placeholder: string;
  /** Empty-list copy shown when nothing matches. */
  readonly emptyText: string;
  /** Fired with the character's branded id on select. The display NAME rides along: a consumer that has to
   *  echo the choice back (a filter chip, a breadcrumb) would otherwise re-read the library to find out what
   *  it just picked — and would guess wrong for anyone outside its own page of it. */
  readonly onSelect: (id: CharacterId, name: string) => void;
  /** Character ids to exclude from the list (e.g. current roster members). */
  readonly excludeIds?: readonly CharacterId[];
  /** Trailing per-row check for multi-select modes; omit for single-select (no adornment). */
  readonly isSelected?: (id: CharacterId) => boolean;
  /** A leading CommandGroup rendered before the character rows (e.g. Start/Blank actions). */
  readonly leadingGroup?: ReactNode;
  /** When set, the character rows sit under this CommandGroup heading. */
  readonly rowsHeading?: string;
  /** CommandList max-height utility (e.g. "max-h-80" / "max-h-96"). @defaultValue "max-h-80" */
  readonly listClassName?: string;
  /** Skeleton row count for the loading fallback. @defaultValue 5 */
  readonly skeletonCount?: number;
  /** Escape handler (modal consumers close on Esc). */
  readonly onEscape?: () => void;
  /** Put the caret in the search field as soon as the ROWS mount. Opt-in, because the two postures differ:
   *  an anchored popover whose only job is to search should land you in it (Base UI's own initial-focus
   *  cannot — at open time this body is still the suspense fallback, which has nothing tabbable in it), while
   *  a modal consumer runs its own focus-on-mount and the two would fight over the caret. */
  readonly autoFocusSearch?: boolean;
}

/** The searchable character picker body — a QueryBoundary + cmdk Command over `character.list`. */
export function CharacterPicker(props: CharacterPickerProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={props.skeletonCount ?? DEFAULT_SKELETON_ROW_COUNT} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the character library" onRetry={retry} />}
    >
      <CharacterPickerBody {...props} />
    </QueryBoundary>
  );
}

function CharacterPickerBody({
  label,
  placeholder,
  emptyText,
  onSelect,
  excludeIds,
  isSelected,
  leadingGroup,
  rowsHeading,
  listClassName,
  onEscape,
  autoFocusSearch = false,
}: CharacterPickerProps): ReactElement {
  const searchRef = useRef<HTMLInputElement>(null);
  // The SWAP hook, not the guarded one: this body mounts as the direct result of a user activation, and
  // the control that opened it is gone (or the popup has already taken focus), so the `<body>` guard would
  // decline exactly when the caret is wanted.
  useFocusOnSwap(searchRef, autoFocusSearch);
  const trpc = useTRPC();
  const [term, setTerm] = useState("");
  const settled = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MS);
  // DEFERRED on top of the debounce, and that is load-bearing with `useSuspenseQuery`: a deferred update is
  // a transition, so a new search keeps the CURRENT rows (and the caret) on screen while the next page
  // loads. Without it the changed query key suspends this body into the QueryBoundary's skeleton and the
  // search field is unmounted mid-keystroke.
  const search = useDeferredValue(settled);
  const { data: page } = useSuspenseQuery(trpc.character.list.queryOptions({ limit: PICKER_PAGE_LIMIT, ...(search === "" ? {} : { search }) }));
  const excluded = new Set<string>(excludeIds ?? []);
  const candidates = page.items.filter((c) => !excluded.has(c.id));

  const rows = candidates.map((character) => (
    <CharacterPickerRow character={character} key={character.id} onSelect={onSelect} {...(isSelected === undefined ? {} : { isSelected })} />
  ));

  return (
    <Command className="min-h-0" label={label} {...(onEscape === undefined ? {} : { onEscape })}>
      <CommandInput aria-label={placeholder} onValueChange={setTerm} placeholder={placeholder} ref={searchRef} value={term} />
      <CommandList className={listClassName ?? "max-h-80"}>
        <CommandEmpty>{emptyText}</CommandEmpty>
        {leadingGroup}
        {rowsHeading === undefined ? rows : <CommandGroup heading={rowsHeading}>{rows}</CommandGroup>}
      </CommandList>
    </Command>
  );
}

interface CharacterPickerRowProps {
  readonly character: CharacterListItem;
  readonly onSelect: (id: CharacterId, name: string) => void;
  readonly isSelected?: (id: CharacterId) => boolean;
}

// keywords carries the display name so cmdk's value-based filter still matches what the user reads.
function CharacterPickerRow({ character, onSelect, isSelected }: CharacterPickerRowProps): ReactElement {
  const id = castId<CharacterId>(character.id);
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  return (
    <CommandItem keywords={[character.name]} onSelect={(): void => onSelect(id, character.name)} value={character.id}>
      <Row align="center" className="min-w-0 flex-1" gap="row">
        <Avatar fallbackDelay={0} hueSeed={character.id} shape="square" size="sm" {...avatarSrc}>
          {initialsFor(character.name)}
        </Avatar>
        <Text as="span" className="min-w-0 flex-1 truncate">
          {character.name}
        </Text>
        {isSelected?.(id) === true ? <Icon icon={Check} size="sm" /> : null}
      </Row>
    </CommandItem>
  );
}
