// character-detail-card — the Characters CONTENT hero when a row is selected (ux-flow-revamp J9): a
// read-only card over `character.get` — hero avatar + name + description + creator notes + tags, with a
// primary "Start chat" action and a DISABLED "Edit" affordance (the character editor is a later lane —
// §3 matrix row; do NOT fabricate one). Pure leaf, no data fetching (props in, callbacks out) — composed
// ONLY from `@orb/ui` primitives (compose-only, UI-Primitives §13). The surface (character-detail-surface)
// supplies the `character.get` read.
//
// FIELD HONESTY (J9: "leave TODOs for missing fields, don't invent"): `CharacterDetail` has no `tagline`
// field — the card shows `description` as the body and `creatorNotes` (when present) as a muted note; there
// is no invented one-liner. TODO(J9-followups): "Add to current chat" — the `addCharacterToChat` router
// verb + chat-side hook landed in L4, but wiring it from here needs the active committed chat's context
// (out of J9 scope); Edit → the character editor lane; a gallery/alt-greetings tab → the editor lane too.

import { blobUrl } from "@orb/contracts/assets";
import type { TagView } from "@orb/contracts/tag";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the character-card.tsx precedent).
import { Icon, MessagesSquare, Pencil } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { initialsFor } from "../lib/initials";

/** The subset of `CharacterDetail` (character.get) the detail card renders — a pure-render prop shape
 *  (the surface maps the tRPC output to this). Only the fields shown here; no invented ones. */
export interface CharacterDetailItem {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly creatorNotes: string | null;
  readonly archived: boolean;
  /** CAS key (`assets` join) — null when no avatar; the source, never `avatarAssetId` (blob route by hash). */
  readonly avatarHash: string | null;
  /** The accepted canonical tags (pending suggestions already excluded upstream — CharacterDetail.tags). */
  readonly tags: readonly Pick<TagView, "id" | "name" | "isHiddenOnCard">[];
}

export interface CharacterDetailCardProps {
  readonly character: CharacterDetailItem;
  /** Start a new chat seeded with this character (the library → chat seam) — the PRIMARY action. */
  readonly onStartChat: (id: string) => void;
}

/** The read-only character detail card — hero avatar, identity, description, tags, and actions. */
export function CharacterDetailCard({
  character,
  onStartChat,
}: CharacterDetailCardProps): ReactElement {
  const visibleTags = character.tags.filter((tag) => !tag.isHiddenOnCard);
  // `exactOptionalPropertyTypes`: omit `src` entirely (never pass `undefined`) so a missing avatar falls
  // through to the initials fallback (the character-card.tsx precedent).
  const avatarSrc = character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };

  return (
    <Stack className="mx-auto w-full max-w-(--container-cq-lg)" gap="section" padding="section">
      <Row align="center" gap="block">
        {/* `hueSeed={id}` matches the LIST row + favorites strip (they seed the id), so the same character
            resolves to the same fallback hue everywhere; the initials fallback is aria-hidden by the Avatar
            primitive, so they never leak into the accessible name. */}
        <Avatar hueSeed={character.id} shape="square" size="hero" {...avatarSrc}>
          {initialsFor(character.name)}
        </Avatar>
        <Stack className="min-w-0 flex-1" gap="field">
          <Row align="center" className="flex-wrap" gap="row">
            <Text size="headline" weight="semibold">
              {character.name}
            </Text>
            {character.archived ? (
              <Badge intent="warning" size="sm">
                Archived
              </Badge>
            ) : null}
          </Row>
          {visibleTags.length > 0 ? (
            <Row className="flex-wrap" gap="field">
              {visibleTags.map((tag) => (
                <Badge key={tag.id} size="sm">
                  {tag.name}
                </Badge>
              ))}
            </Row>
          ) : null}
        </Stack>
      </Row>

      {character.description === null ? null : (
        <Stack gap="field">
          <Text size="micro" weight="semibold" tone="muted" transform="caps">
            About
          </Text>
          <Text className="whitespace-pre-wrap">{character.description}</Text>
        </Stack>
      )}

      {character.creatorNotes === null ? null : (
        <Stack gap="field">
          <Text size="micro" weight="semibold" tone="muted" transform="caps">
            Creator notes
          </Text>
          <Text className="whitespace-pre-wrap" tone="muted">
            {character.creatorNotes}
          </Text>
        </Stack>
      )}

      <Row gap="row">
        <Button
          type="button"
          intent="primary"
          onClick={(): void => onStartChat(character.id)}
          aria-label={`Start chat with ${character.name}`}
        >
          <Icon icon={MessagesSquare} size="sm" />
          Start chat
        </Button>
        {/* Edit is DISABLED until the character-editor lane lands (do NOT fabricate an editor — §3). The
            tooltip anchor is a <span> wrapper, NOT the button: a natively-disabled button emits no hover
            events, so the span is what carries the "why" tooltip. */}
        <Tooltip>
          <TooltipTrigger render={<span />}>
            <Button type="button" intent="secondary" disabled={true}>
              <Icon icon={Pencil} size="sm" />
              Edit
            </Button>
          </TooltipTrigger>
          <TooltipPopup>The character editor lands in a later lane.</TooltipPopup>
        </Tooltip>
      </Row>
    </Stack>
  );
}
