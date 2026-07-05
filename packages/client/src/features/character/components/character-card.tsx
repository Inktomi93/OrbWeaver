// character-card — one library row: avatar + name + the accepted (non-hidden-on-card) tag chips, plus an
// "Archived" badge when applicable (`character.list` returns archived rows too — persistence/queries.ts —
// so the row stays honest about it rather than silently hiding data). Pure leaf, no data fetching (props
// in, `onToggleSelect` out) — composed ONLY from `@orb/ui` primitives (compose-only, UI-Primitives §13).

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the character-library-surface.tsx precedent).
import { Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { MouseEvent, ReactElement } from "react";
import { initialsFor } from "../lib/initials";

export interface CharacterCardItem {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  /** CAS key (`assets` join) — null when no avatar is attached; the source, never `avatarAssetId`
   *  (the blob route is keyed by hash — `blobUrl` from \@orb/contracts/assets). */
  readonly avatarHash: string | null;
  /** The accepted canonical tags (pending suggestions already excluded upstream — CharacterSummary). */
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
}

export interface CharacterCardProps {
  readonly character: CharacterCardItem;
  readonly selected: boolean;
  /** DORMANT bulk-select seam (a future character-bulk-ops lane wires it, the message-selection precedent):
   *  toggles the row's checkbox membership. Unwired today — kept, not deleted (the box owner's don't-delete
   *  pre-wired-seams rule). Distinct from `onSelect` (which opens the detail card). */
  readonly onToggleSelect: (id: string) => void;
  /** Open this character's detail card in CONTENT (ux-flow-revamp J9) — the row's PRIMARY click. Writes the
   *  character-selection store; the route reads it and swaps CONTENT to the detail surface. */
  readonly onSelect: (id: string) => void;
  /** Start a new chat seeded with this character (the library → chat seam). Renders the primary
   *  "start chat" action; `stopPropagation` keeps it from also firing the card's select. */
  readonly onStartChat: (id: string) => void;
}

/** One character row — the library list's `renderItem` output (see `<VirtualList>` in the surface). */
// `onToggleSelect` is intentionally NOT destructured — it's the dormant bulk-select seam (kept on the
// interface for the future bulk-ops lane, unwired today). The card's primary click drives `onSelect`.
export function CharacterCard({
  character,
  selected,
  onSelect,
  onStartChat,
}: CharacterCardProps): ReactElement {
  const visibleTags = character.tags.filter((tag) => !tag.isHiddenOnCard);
  const hasChips = character.archived || visibleTags.length > 0;
  // `exactOptionalPropertyTypes`: `src?: string` rejects an explicit `undefined` — omit the prop
  // entirely (rather than pass `src={undefined}`) so a missing avatar falls through to the fallback.
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };

  // The card is itself a `role="button"` select target; the start-chat action is a nested real
  // <button>, so it stops propagation to fire ONLY the chat seam, never also the card's select.
  const startChat = (event: MouseEvent): void => {
    event.stopPropagation();
    onStartChat(character.id);
  };

  return (
    <Card
      aria-pressed={selected}
      data-selected={selected ? "" : undefined}
      interactive={true}
      onClick={(): void => onSelect(character.id)}
      padding="block"
    >
      <Row align="center" gap="row">
        <Avatar shape="square" size="lg" {...avatarSrc}>
          {initialsFor(character.name)}
        </Avatar>
        <Stack className="min-w-0 flex-1" gap="field">
          <Text as="span" className="truncate" weight="semibold">
            {character.name}
          </Text>
          {hasChips ? (
            <Row className="flex-wrap" gap="field">
              {character.archived ? (
                <Badge intent="warning" size="sm">
                  Archived
                </Badge>
              ) : null}
              {visibleTags.map((tag) => (
                <Badge key={tag.id} size="sm">
                  {tag.name}
                </Badge>
              ))}
            </Row>
          ) : null}
        </Stack>
        <Button
          type="button"
          intent="primary"
          size="icon"
          aria-label={`Start chat with ${character.name}`}
          onClick={startChat}
        >
          <Icon icon={MessagesSquare} size="sm" />
        </Button>
      </Row>
    </Card>
  );
}
