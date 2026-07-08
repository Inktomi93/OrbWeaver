// character-detail-surface — the Characters CONTENT when a row is selected (ux-flow-revamp J9). Reads the
// full card via `character.get` (QueryBoundary + useSuspenseQuery — the appearance-settings-surface /
// message-list-surface canonical), maps the `CharacterDetail` wire shape to the pure `<CharacterDetailCard>`
// leaf, and wires the "Start chat" seam through the shared stores (startNewChat + setActiveSection — the
// SAME writer-only touch the library card uses; NO #features/chat import, per dep-cruiser
// client-feature-front-door). The route mounts this in the `characters` CONTENT slot when
// `selectedCharacterId` is set (home-page.tsx); a null selection falls back to CharacterLibraryWelcome.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { setActiveSection, startNewChat } from "#state";
import type { CharacterDetailItem } from "../components/character-detail-card";
import { CharacterDetailCard } from "../components/character-detail-card";

export interface CharacterDetailSurfaceProps {
  readonly characterId: CharacterId;
}

/** The character detail card, over `character.get` (suspense + error/loading via QueryBoundary). */
export function CharacterDetailSurface({ characterId }: CharacterDetailSurfaceProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading character…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load this character.{" "}
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Text>
      )}
    >
      <CharacterDetailBody characterId={characterId} />
    </QueryBoundary>
  );
}

/** Suspends on `character.get`, maps the detail to the card's pure prop shape, wires the chat seam. */
function CharacterDetailBody({ characterId }: CharacterDetailSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));

  // A11y focus restoration: when the detail card mounts, focus its container.
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  // The library → chat seam (UI-Arch §5.1) — seed a fresh draft, then flip the rail to Chats so the route
  // mounts the room. Identical to the library card's `startChatWith` (the shared-store writer-only touch).
  const startChatWith = (id: string): void => {
    startNewChat({ characterIds: [castId<CharacterId>(id)] });
    setActiveSection("chats");
  };

  // Map the CharacterDetail wire shape to the leaf's pure prop subset — only the fields the card renders.
  const character: CharacterDetailItem = {
    id: data.id,
    name: data.name,
    description: data.description,
    creatorNotes: data.creatorNotes,
    archived: data.archived,
    avatarHash: data.avatarHash,
    tags: data.tags,
  };

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full">
      <CharacterDetailCard character={character} onStartChat={startChatWith} />
    </Stack>
  );
}
