import { expect, test } from "@orb/testkit/node";
import { personaWithPlayer } from "#client/features/persona/lib/persona-copy.ts";

test("a persona names the player behind its seat, and says the name once when the two match", () => {
  const apart = personaWithPlayer("Captain", "Nate 2");
  expect(apart).toContain("Captain");
  expect(apart).toContain("Nate 2");
  expect(personaWithPlayer("Nate 2", "Nate 2")).toBe("Nate 2");
});
