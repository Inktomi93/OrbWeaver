import { decodePersonaCollisionChoices, encodePersonaCollisionChoices, personaCollisionChoiceFor } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("choices round-trip through the multipart values, including a name that contains a colon", () => {
  const choices = { nate: "keep-both", "re: eve": "merge" } as const;
  expect(decodePersonaCollisionChoices(encodePersonaCollisionChoices(choices))).toEqual(choices);
});

test("a persona named __proto__ keeps its choice as an own key instead of vanishing into the prototype", () => {
  const decoded = decodePersonaCollisionChoices(["keep-both:__proto__"]);

  expect(decoded === null ? false : Object.hasOwn(decoded, "__proto__")).toBe(true);
  expect(decoded === null ? undefined : Object.entries(decoded)).toEqual([["__proto__", "keep-both"]]);
});

test("choice lookup reads own keys only: 'constructor' is unlisted (merge), a listed name keeps its answer", () => {
  expect(personaCollisionChoiceFor({}, "constructor")).toBe("merge");
  expect(personaCollisionChoiceFor(undefined, "toString")).toBe("merge");
  expect(personaCollisionChoiceFor({ nate: "keep-both" }, "nate")).toBe("keep-both");
});

test("a malformed value refuses the whole set instead of dropping to a default", () => {
  expect(decodePersonaCollisionChoices(["merge:nate", "swap:eve"])).toBeNull();
  expect(decodePersonaCollisionChoices(["merge"])).toBeNull();
});
