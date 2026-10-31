import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import type { ShelfFace } from "#client/features/character/components/character-shelf.tsx";
import { CharacterShelf } from "#client/features/character/components/character-shelf.tsx";

/** The production shelf with one starred face that has a room behind it, opened by the given door. */
export function ShelfFaceNameStory({
  door,
  face,
}: {
  readonly door: "open" | "resume";
  readonly face: Pick<ShelfFace, "caption" | "name" | "stamp">;
}): ReactElement {
  const faces: readonly ShelfFace[] = [
    { id: mintTypeId(ID_PREFIX.character), avatarHash: null, starred: true, lastChatId: mintTypeId(ID_PREFIX.chat), ...face },
  ];
  return (
    <CtClientProviders>
      <CharacterShelf door={door} faces={faces} label="Shelf" legend={null} onOpen={(): void => undefined} />
    </CtClientProviders>
  );
}
