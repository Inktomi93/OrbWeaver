// character-card — one library row: avatar + name + the accepted (non-hidden-on-card) tag chips, plus an
// "Archived" badge when applicable (`character.list` returns archived rows too — persistence/queries.ts —
// so the row stays honest about it rather than silently hiding data). Pure leaf, no data fetching (props
// in, `onToggleSelect` out) — composed ONLY from `@orb/ui` primitives (compose-only, UI-Primitives §13).

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
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
  /** Toggles the row's local selected/highlighted state — a stub today (no editor exists yet; the
   *  character-detail/editor surface is a later task). */
  readonly onToggleSelect: (id: string) => void;
}

/** One character row — the library list's `renderItem` output (see `<VirtualList>` in the surface). */
export function CharacterCard({
  character,
  selected,
  onToggleSelect,
}: CharacterCardProps): ReactElement {
  const visibleTags = character.tags.filter((tag) => !tag.isHiddenOnCard);
  const hasChips = character.archived || visibleTags.length > 0;
  // `exactOptionalPropertyTypes`: `src?: string` rejects an explicit `undefined` — omit the prop
  // entirely (rather than pass `src={undefined}`) so a missing avatar falls through to the fallback.
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };

  return (
    <Card
      aria-pressed={selected}
      data-selected={selected ? "" : undefined}
      interactive={true}
      onClick={(): void => onToggleSelect(character.id)}
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
      </Row>
    </Card>
  );
}
