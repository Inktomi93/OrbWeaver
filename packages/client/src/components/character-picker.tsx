// CharacterPicker is client-shared: it owns the QueryBoundary, character.list read, and Command body; each
// caller owns its outer Popover or modal chrome. It uses the tRPC seam, not character-feature internals.
//
// The search is a debounced server predicate over the whole library (owner ruling 2026-08-13). cmdk also
// narrows the loaded page to keep keyboard highlighting coherent while a request is in flight. Browsing is
// a keyset infinite query with no maxPages: evicting head pages makes earlier rows unrecoverable; the list
// max-height bounds its DOM cost (#157).
//
// The tail loads on pointer scroll and when KeyboardTailLoader sees the roving highlight reach the last
// loaded row (#334). Keyboard reachability must not depend on scrollIntoView firing onScroll. This
// supersedes the footer Load more button, which was previously moved out of the listbox to avoid
// announcing it as a character option. The footer retains the server totalCount and Clear affordance.
//
// Exclusions apply after each server page because character.list has no arbitrary-id exclusion input.
// Filtered pages advance until a remaining row provides a scrollable tail or the walk exhausts; a rejected
// tail exposes error/retry beside retained pages.
//
// The owner ruled this client-shared, not @orb/ui: it wires client data/state seams. The name
// CharacterPicker reflects its character-shaped rows rather than a speculative EntityPicker abstraction.

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, useActiveCommandValue } from "@orb/ui/command";
import { Check, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode, UIEvent } from "react";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import type { Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { useDebouncedValue, useFocusOnSwap } from "#lib";
import { QueryBoundary } from "./query-boundary.tsx";

/** Rows per page. With a server predicate behind the box this is a page of the MATCHES, not a slice of the
 *  library taken before the question was asked — and since #157 it is a PAGE of a keyset walk, not the
 *  whole list the picker is willing to show. */
const PICKER_PAGE_LIMIT = 100;

/** How close to the bottom (px) a scroll gets before the next page is asked for. One row's worth of slack,
 *  so the fetch starts while the last rows are still being read rather than after the list dead-ends. */
const TAIL_FETCH_SLACK_PX = 96;
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
  /** Fired with the character's branded id on select. The display NAME and PORTRAIT ride along: a consumer
   *  that has to echo the choice back (a filter chip, a face on a strip) would otherwise re-read the library
   *  to find out what it just picked — and would guess wrong for anyone outside its own page of it. The row
   *  already has both; handing them over is what let the chats pane retire its whole-library portrait map
   *  (#192). A handler that wants only the id/name simply declares fewer parameters. */
  readonly onSelect: (id: CharacterId, name: string, avatarHash: string | null) => void;
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
  /**
   * The OWNER's surface-box id (#885/#1748). This picker is mounted by EIGHT owners, so it can never mint a
   * key of its own — one literal here would hand all eight the same remembered box, the copy-paste collision
   * the `query-boundary-reservation` gate's duplicate arm reds and which its literal census could not see
   * through a shared composite. Each owner mints its own; omitted, the boundary reserves nothing, as before.
   */
  readonly reserveKey?: string | undefined;
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
    // THE KEY IS THE CALLER'S (#1748 — the pass-through design §1.4 prescribed). The ruling that this file
    // may not mint one SURVIVES: eight owners, one literal, one box for all of them. What changed is that
    // every owner now supplies its own, so the reservation is reachable without the collision.
    <QueryBoundary
      fallback={<SkeletonRows count={props.skeletonCount ?? DEFAULT_SKELETON_ROW_COUNT} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the character library" onRetry={retry} />}
      {...(props.reserveKey === undefined ? {} : { reserveKey: props.reserveKey })}
    >
      <CharacterPickerBody {...props} />
    </QueryBoundary>
  );
}

function characterCountLabel(count: number): string {
  return count === 1 ? "1 character" : `${count} characters`;
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
  const listRef = useRef<HTMLDivElement>(null);
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
  const query = useSuspenseInfiniteQuery(
    trpc.character.list.infiniteQueryOptions(
      { limit: PICKER_PAGE_LIMIT, ...(search === "" ? {} : { search }) },
      // NO `maxPages` — the library surface's own ruling, for the same reason: windowing EVICTS head pages
      // unrecoverably, so rows vanish off the top of a deep walk. The DOM cost is bounded by the list's
      // max-height, and the rows are light summaries.
      { initialCursor: null, getNextPageParam: (lastPage) => lastPage.nextCursor, getPreviousPageParam: () => undefined },
    ),
  );
  const excluded = new Set<string>(excludeIds ?? []);
  const loaded = query.data.pages.flatMap((page) => page.items);
  const candidates = loaded.filter((c) => !excluded.has(c.id));
  const excludedLoadedCount = loaded.length - candidates.length;
  // The server's own COUNT over this exact scope (search included), off the newest page — never
  // `candidates.length`, which is "how far the walk has got", i.e. the number the footer contrasts it with.
  const totalCount = query.data.pages.at(-1)?.totalCount ?? candidates.length;

  // Destructured so the handlers close over exact slices rather than the fresh-proxy-per-render result.
  const { hasNextPage, isFetching, fetchNextPage } = query;
  const fetchMore = (): void => {
    if (hasNextPage && !isFetching) {
      // The retained-page error below owns the rejection; the promise is consumed so it cannot become an
      // unhandled rejection while TanStack exposes the same failure through `isFetchNextPageError`.
      fetchNextPage().catch(() => undefined);
    }
  };
  useEffect(() => {
    const list = listRef.current;
    const cannotScrollToTail = candidates.length === 0 || (list !== null && list.clientHeight > 0 && list.scrollHeight <= list.clientHeight);
    if (cannotScrollToTail && hasNextPage && !isFetching && !query.isFetchNextPageError) {
      fetchNextPage().catch(() => undefined);
    }
  }, [candidates.length, fetchNextPage, hasNextPage, isFetching, query.isFetchNextPageError]);
  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= TAIL_FETCH_SLACK_PX) {
      fetchMore();
    }
  };

  const rows = candidates.map((character) => (
    <CharacterPickerRow character={character} key={character.id} onSelect={onSelect} {...(isSelected === undefined ? {} : { isSelected })} />
  ));

  return (
    <Command className="min-h-0" label={label} {...(onEscape === undefined ? {} : { onEscape })}>
      <CommandInput aria-label={placeholder} onValueChange={setTerm} placeholder={placeholder} ref={searchRef} value={term} />
      <CommandList className={listClassName ?? "max-h-80"} onScroll={onScroll} ref={listRef}>
        <CommandEmpty>{emptyText}</CommandEmpty>
        {leadingGroup}
        {rowsHeading === undefined ? rows : <CommandGroup heading={rowsHeading}>{rows}</CommandGroup>}
      </CommandList>
      {/* The KEYBOARD path to the tail (no button — owner ruling 2026-08-19). Inside `<Command>` so it can
          read cmdk's active-item state; renders nothing. Fires the next-page load the moment the roving
          highlight reaches the last loaded row, so arrowing/Page-Down-ing to the bottom pulls more without a
          control pointer users never click. */}
      <KeyboardTailLoader lastLoadedValue={candidates.at(-1)?.id} onReachLast={fetchMore} />
      {/* THE FOOTER (header). Outside `CommandList` on purpose — inside it, every child is a member of a
          `role="listbox"`, which is what made the old paging control announce as a character. Rendered only
          when it has something to say: an exhausted walk with no search is a footer about nothing. Carries
          the honest count and CLEAR — the tail load itself is now keyboard/scroll-driven, no button. */}
      {hasNextPage || term !== "" || query.isFetchNextPageError || excludedLoadedCount > 0 ? (
        <Row align="center" className="border-border border-t" gap="row" padding="row">
          <Text as="span" voice="gloss">
            {excludedLoadedCount === 0 ? `Showing ${candidates.length} of ${totalCount}` : characterCountLabel(candidates.length)}
          </Text>
          <Row className="flex-1" gap="field" justify="end">
            {query.isFetchNextPageError ? (
              <>
                <Text role="alert" voice="gloss">
                  Couldn't load more characters.
                </Text>
                <Button intent="secondary" onClick={fetchMore} size="sm">
                  Retry loading more characters
                </Button>
              </>
            ) : null}
            {term === "" ? null : (
              <Button
                intent="ghost"
                onClick={(): void => {
                  setTerm("");
                  searchRef.current?.focus();
                }}
                size="sm"
              >
                Clear search
              </Button>
            )}
          </Row>
        </Row>
      ) : null}
    </Command>
  );
}

interface KeyboardTailLoaderProps {
  /** The `value` (character id) of the LAST loaded row, in the server walk order. `undefined` on an empty
   *  list. When cmdk's roving highlight lands here, the next page is asked for. */
  readonly lastLoadedValue: string | undefined;
  /** The guarded next-page fetch (a no-op while a page is in flight or the walk is exhausted). */
  readonly onReachLast: () => void;
}

/** The keyboard tail-load, as a child of `<Command>` so it can read cmdk's active-item state. Renders
 *  nothing. cmdk moves the highlight with Arrow/Page/Home/End and only `scrollIntoView({block:"nearest"})`s
 *  it — which fires the list's `onScroll` (the pointer tail-load) ONLY when the move actually scrolls the
 *  container. Loading on the STATE signal instead makes the tail reachable by keyboard with no dependence on
 *  scroll physics — the replacement for the removed "Load more" button (owner ruling 2026-08-19). */
function KeyboardTailLoader({ lastLoadedValue, onReachLast }: KeyboardTailLoaderProps): null {
  const active = useActiveCommandValue();
  useEffect(() => {
    if (lastLoadedValue !== undefined && active === lastLoadedValue) {
      onReachLast();
    }
  }, [active, lastLoadedValue, onReachLast]);
  return null;
}

interface CharacterPickerRowProps {
  readonly character: CharacterListItem;
  readonly onSelect: (id: CharacterId, name: string, avatarHash: string | null) => void;
  readonly isSelected?: (id: CharacterId) => boolean;
}

// keywords carries the display name so cmdk's value-based filter still matches what the user reads.
function CharacterPickerRow({ character, onSelect, isSelected }: CharacterPickerRowProps): ReactElement {
  const id = castId<CharacterId>(character.id);
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  return (
    <CommandItem keywords={[character.name]} onSelect={(): void => onSelect(id, character.name, character.avatarHash)} value={character.id}>
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
