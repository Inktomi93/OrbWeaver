// A card carries references to the world books of the library it was exported from. The import links the ones this
// library holds and counts the ones it does not, so the owner can tell a card that came whole from one whose books did not travel.
// @subject packages/server/src/domain/import/verbs/import-character.ts
// @subject packages/server/src/domain/import/loader/import-card-batch.ts

import { ATTACHED_BOOKS_WIRE_KEY } from "@orb/contracts/character";
import { createBookSchema } from "@orb/contracts/world-info";
import { ID_PREFIX } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { harness, importThroughDialog } from "./_st-tree-door.ts";

function cardCarrying(name: string, bookIds: readonly string[]): string {
  return JSON.stringify({
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: {
      name,
      description: `${name} keeps the light.`,
      ["first_mes"]: "The lamp is lit.",
      [ATTACHED_BOOKS_WIRE_KEY]: bookIds.map((worldBookId) => ({ worldBookId, role: "primary" })),
    },
  });
}

test("a card pointing at a book this library does not hold counts it as not linked, and a held book is not counted", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const held = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Harbor Lore" }) });
  const absent = root.idSource.typeId(ID_PREFIX.worldBook);

  const missing = await importThroughDialog(root, "missing.json", cardCarrying("Missing", [absent]));
  expect(present(missing.imported[0]).attachedBooksSkipped).toBe(1);

  const linked = await importThroughDialog(root, "linked.json", cardCarrying("Linked", [held.id]));
  expect(present(linked.imported[0]).attachedBooksSkipped).toBe(0);

  const mixed = await importThroughDialog(root, "mixed.json", cardCarrying("Mixed", [held.id, absent]));
  expect(present(mixed.imported[0]).attachedBooksSkipped).toBe(1);
});
