import type { SeededCharacter } from "@orb/testkit/node/composed";
import { captureTurnRows, createServerHarness, seedCharacter } from "@orb/testkit/node/composed";

// seedCharacter stays in this comment and in "seedCharacter" strings.
type Seeded = Awaited<ReturnType<typeof seedCharacter>>;

test("stored character row", async () => {
  await using root = await createServerHarness();
  const seeded: SeededCharacter = await seedCharacter(root, { name: "seedCharacter" });
  const { row } = await seedCharacter(root, {});
  expect(row.id).toBe(seeded.row.id);
  expect(await captureTurnRows(root.db, seeded.turn)).toHaveLength(1);
  const settings = { seedCharacter: true };
  expect(settings.seedCharacter).toBe(true);
});
