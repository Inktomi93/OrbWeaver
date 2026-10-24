import type { SeededCharacterRows } from "@orb/testkit/node/rows";
import { createServerHarness } from "@orb/testkit/node/composed";
import { captureTurnRows, seedCharacterRows } from "@orb/testkit/node/rows";

// seedCharacter stays in this comment and in "seedCharacter" strings.
type Seeded = Awaited<ReturnType<typeof seedCharacterRows>>;

test("stored character row", async () => {
  await using root = await createServerHarness();
  const seeded: SeededCharacterRows = await seedCharacterRows(root, { name: "seedCharacter" });
  const { row } = await seedCharacterRows(root, {});
  expect(row.id).toBe(seeded.row.id);
  expect(await captureTurnRows(root.db, seeded.turn)).toHaveLength(1);
  const settings = { seedCharacter: true };
  expect(settings.seedCharacter).toBe(true);
});
