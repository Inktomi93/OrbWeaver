import { decodePersonaCollisionChoices, encodePersonaCollisionChoices } from "@orb/contracts/import";
import { expect, test } from "../../support/fixtures.ts";

test("choices round-trip through the multipart values, including a name that contains a colon", () => {
  const choices = { nate: "keep-both", "re: eve": "merge" } as const;
  expect(decodePersonaCollisionChoices(encodePersonaCollisionChoices(choices))).toEqual(choices);
});

test("a malformed value refuses the whole set instead of dropping to a default", () => {
  expect(decodePersonaCollisionChoices(["merge:nate", "swap:eve"])).toBeNull();
  expect(decodePersonaCollisionChoices(["merge"])).toBeNull();
});
