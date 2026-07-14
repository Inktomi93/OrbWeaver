// CharacterPicker — the client-shared searchable character-picker body (clone-audit item 3): the
// QueryBoundary(SkeletonRows/QueryErrorState) → useSuspenseQuery(character.list) → @orb/ui/command list of
// avatar+name rows shared by add-member-popover ↔ new-chat-picker-surface. The OUTER chrome differs (an
// anchored Popover vs a modal focus-stack) and stays with each consumer; this composite owns the query +
// the Command body. Reads characters through the tRPC seam (`trpc.character.list`), never a character-feature
// internal — so it is legal to consume from the chat feature.
//
// OWNER RULING: lives client-shared (NOT @orb/ui — it wires #data/#state client seams). Named `CharacterPicker`
// (not the spec's generic "EntityPicker"): both consumers pick characters and the row is character-shaped
// (avatar+name); an honest name beats a speculative generalization (§13.9).

import { blobUrl } from "@orb/contracts/assets";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@orb/ui/command";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Check/Icon fine (the chat-list-surface.tsx precedent).
import { Check, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import type { Trpc } from "#data";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";

const PICKER_PAGE_LIMIT = 100;
const DEFAULT_SKELETON_ROW_COUNT = 5;

type CharacterListItem = inferOutput<Trpc["character"]["list"]>["items"][number];

export interface CharacterPickerProps {
  /** The Command's accessible label + search-input aria. */
  readonly label: string;
  /** Search-input placeholder, e.g. "Search characters…". */
  readonly placeholder: string;
  /** Empty-list copy shown when nothing matches. */
  readonly emptyText: string;
  /** Fired with the character's branded id on select. */
  readonly onSelect: (id: CharacterId) => void;
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
}

/** The searchable character picker body — a QueryBoundary + cmdk Command over `character.list`. */
export function CharacterPicker(props: CharacterPickerProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<SkeletonRows count={props.skeletonCount ?? DEFAULT_SKELETON_ROW_COUNT} />}
      renderError={(_error, retry): ReactElement => (
        <QueryErrorState label="the character library" onRetry={retry} />
      )}
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
}: CharacterPickerProps): ReactElement {
  const trpc = useTRPC();
  const { data: page } = useSuspenseQuery(
    trpc.character.list.queryOptions({ limit: PICKER_PAGE_LIMIT }),
  );
  const excluded = new Set<string>(excludeIds ?? []);
  const candidates = page.items.filter((c) => !excluded.has(c.id));

  const rows = candidates.map((character) => (
    <CharacterPickerRow
      character={character}
      key={character.id}
      onSelect={onSelect}
      {...(isSelected === undefined ? {} : { isSelected })}
    />
  ));

  return (
    <Command className="min-h-0" label={label} {...(onEscape === undefined ? {} : { onEscape })}>
      <CommandInput aria-label={placeholder} placeholder={placeholder} />
      <CommandList className={listClassName ?? "max-h-80"}>
        <CommandEmpty>{emptyText}</CommandEmpty>
        {leadingGroup}
        {rowsHeading === undefined ? (
          rows
        ) : (
          <CommandGroup heading={rowsHeading}>{rows}</CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

interface CharacterPickerRowProps {
  readonly character: CharacterListItem;
  readonly onSelect: (id: CharacterId) => void;
  readonly isSelected?: (id: CharacterId) => boolean;
}

// keywords carries the display name so cmdk's value-based filter still matches what the user reads.
function CharacterPickerRow({
  character,
  onSelect,
  isSelected,
}: CharacterPickerRowProps): ReactElement {
  const id = castId<CharacterId>(character.id);
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
  return (
    <CommandItem
      keywords={[character.name]}
      onSelect={(): void => onSelect(id)}
      value={character.id}
    >
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
