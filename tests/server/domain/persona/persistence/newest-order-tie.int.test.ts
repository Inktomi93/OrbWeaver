// A persona read that lists by creation time breaks a same-instant tie by id, newest id first, so a list cannot
// shuffle between reads: the personas connected to a character, and the characters connected to a persona.
// @subject packages/server/src/domain/persona/persistence/queries.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";

const TIED = ["A", "B", "C", "D"] as const;

test("personas connected to a character, and characters connected to a persona, list newest id first when created in one instant", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  // No clock step between the mints, so only the tie-break orders them.
  const personas = await Promise.all(TIED.map((tag) => caller.persona.create({ input: { name: `Tied ${tag}`, description: "Minted in one instant." } })));
  const characters = await Promise.all(
    TIED.map((tag) =>
      caller.character.create({ input: createCharacterSchema.parse({ handle: `tied-${tag.toLowerCase()}`, name: `Tied ${tag}`, description: "" }) }),
    ),
  );
  const [hub] = characters;
  const [anchor] = personas;
  if (hub === undefined || anchor === undefined) {
    throw new Error("the tied rows were not minted");
  }
  for (const persona of personas) {
    await caller.persona.connectToCharacter({ characterId: hub.id, personaId: persona.id });
  }
  for (const character of characters) {
    await caller.persona.connectToCharacter({ characterId: character.id, personaId: anchor.id });
  }

  const personaIds = (await caller.persona.listConnectedToCharacter({ characterId: hub.id })).map((persona) => persona.id);
  const characterIds = (await caller.persona.listConnectedCharacters({ personaId: anchor.id })).map((character) => character.id);

  expect(personaIds).toEqual(
    personas
      .map((persona) => persona.id)
      .toSorted()
      .toReversed(),
  );
  expect(characterIds).toEqual(
    characters
      .map((character) => character.id)
      .toSorted()
      .toReversed(),
  );
});
