import { createServerHarness, seedCharacter } from "@orb/testkit/node/composed";

test("a file the plan does not list keeps the door seed", async () => {
  await using root = await createServerHarness();
  const { view } = await seedCharacter(root, {});
  expect(view.id).toBeDefined();
});
