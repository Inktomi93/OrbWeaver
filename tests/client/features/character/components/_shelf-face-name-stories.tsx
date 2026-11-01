import { ID_PREFIX } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import type { ReactElement } from "react";
import type { ShelfFace } from "#client/features/character/components/character-shelf.tsx";
import { CharacterShelf } from "#client/features/character/components/character-shelf.tsx";

const ids = createSeededIds(FIXTURE_ID_CURSOR);

/** The production shelf with one starred face that has a room behind it, opened by the given door. */
export function ShelfFaceNameStory({
  door,
  face,
}: {
  readonly door: "open" | "resume";
  readonly face: Pick<ShelfFace, "caption" | "name" | "stamp">;
}): ReactElement {
  const faces: readonly ShelfFace[] = [
    { id: ids.typeId(ID_PREFIX.character), avatarHash: null, starred: true, lastChatId: ids.typeId(ID_PREFIX.chat), ...face },
  ];
  return (
    <CtClientProviders>
      <CharacterShelf door={door} faces={faces} label="Shelf" legend={null} onOpen={(): void => undefined} />
    </CtClientProviders>
  );
}
