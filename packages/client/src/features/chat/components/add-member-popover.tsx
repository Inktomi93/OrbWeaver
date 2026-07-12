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
//
// SOURCE-AGNOSTIC (the J2/J3 committed/draft dual-mode, mirroring roster-panel.tsx): the popover chrome +
// picker are PURE over an `onAdd(id)` callback — the committed `AddMemberPopover` wires it to the
// `chat.addCharacterToChat` verb; the `DraftAddMemberPopover` wires it to the `addDraftCharacter` store
// write (folded into the founding cast at commit, draft-commit.ts). Same picker, same look — only the
// SAVE seam differs; a draft has no server row to invalidate, so its verb is a synchronous store patch.

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

/** The shared picker shell — the "+" trigger, tooltip, and the QueryBoundary-wrapped list. Source-agnostic
 *  over an `onAdd(id)`; the committed + draft wrappers supply the SAVE seam + the already-in-roster set. */
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
  /** The characters already in the roster — excluded from the picker (no double-seat). */
  readonly existingCharacterIds: readonly CharacterId[];
}

/** The cast-bar "+" → an anchored character picker; picking adds the member (host-only affordance).
 *  COMMITTED variant: the save seam is the `chat.addCharacterToChat` verb (invalidates `getChat`). */
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
  /** The active draft's key — the `draft-config` partition the added members land in. */
  readonly draftKey: string;
  /** The draft's current founding cast (seed ∪ already-added) — excluded from the picker. */
  readonly existingCharacterIds: readonly CharacterId[];
}

/** The DRAFT-side "+" → the same anchored picker; picking writes `addDraftCharacter` (no server row yet —
 *  the added members fold into the founding cast at commit, draft-commit.ts). Host is implicit (a draft is
 *  authored by, and visible only to, its creator — draft-context-panel-surface.tsx). */
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
