import "./composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { characterSnapshots, characters } from "@orb/db";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { seedCharacterHistory, seedCreatedCharacter } from "./factories/character.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("root-bound producers retain real writes, ownership refusal and observation spies", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const create = vi.spyOn(root.services.character, "create");
  const input = createCharacterSchema.parse({ handle: "composed-producer", name: "Composed witness", description: "A real production card." });
  const produced = await seedCreatedCharacter(root, { principal, input });
  expect(create).toHaveBeenCalledWith({ principal, input });
  expect(await root.db.select().from(characters).where(eq(characters.id, produced.view.id)).get()).toEqual(produced.row);
  expect(produced.row).toMatchObject({ ownerId: root.ownerId, createdAt: root.clock.now(), updatedAt: root.clock.now() });
  const history = await seedCharacterHistory(root, { principal, characterId: produced.row.id });
  expect(history.row.characterId).toBe(produced.row.id);
  expect(history.ref.id).toBe(history.row.id);
  const before = await root.db.select().from(characterSnapshots);
  const foreign = await root.actor();
  await expect(seedCharacterHistory(root, { principal: await root.principalFor(foreign.id), characterId: produced.row.id })).rejects.toThrow();
  expect(await root.db.select().from(characterSnapshots)).toEqual(before);
});
