import { useTRPC } from "@orb/client/data";
import type { TagView } from "@orb/contracts/tag";
import type { CharacterId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { CharacterTagsRow } from "#client/features/character/components/character-tags-row.tsx";

function Row({ characterId, tags }: { readonly characterId: CharacterId; readonly tags: readonly TagView[] }): ReactElement {
  return <CharacterTagsRow characterId={characterId} tags={tags} trpc={useTRPC()} />;
}

/** The character editor's tag row on its own, over the accepted tags it is handed. */
export function CharacterTagsRowStory({ characterId, tags }: { readonly characterId: CharacterId; readonly tags: readonly TagView[] }): ReactElement {
  return (
    <CtClientProviders>
      <Row characterId={characterId} tags={tags} />
    </CtClientProviders>
  );
}
