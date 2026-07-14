// The favorites strip — starred characters as a dense, horizontally-scrolling avatar row pinned at the
// LIST top. Click = select (open the editor) only; start-chat is the row's separate CTA. Not
// `@orb/ui/avatar-stack` (display-only, no per-item click) — composes clickable `<Avatar>`-in-`<Button>`
// controls instead.

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";

interface FavoriteCharacter {
  readonly id: string;
  readonly name: string;
  readonly avatarHash: string | null;
}

export interface CharacterFavoritesStripProps {
  readonly favorites: readonly FavoriteCharacter[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

/** The pinned favorites strip — renders nothing when the caller has no starred characters (data-driven,
 *  never an empty shell). */
export function CharacterFavoritesStrip({
  favorites,
  selectedId,
  onSelect,
}: CharacterFavoritesStripProps): ReactElement | null {
  if (favorites.length === 0) {
    return null;
  }
  return (
    <Row aria-label="Favorite characters" className="overflow-x-auto" gap="field" role="list">
      {favorites.map((character) => {
        const avatarSrc =
          character.avatarHash === null ? {} : { src: blobUrl(character.avatarHash) };
        return (
          <Button
            aria-current={selectedId === character.id ? "true" : undefined}
            aria-label={`Open ${character.name}`}
            className="shrink-0"
            intent="ghost"
            key={character.id}
            onClick={(): void => onSelect(character.id)}
            size="icon"
          >
            <Avatar hueSeed={character.id} shape="square" size="md" {...avatarSrc}>
              {initialsFor(character.name)}
            </Avatar>
          </Button>
        );
      })}
    </Row>
  );
}
