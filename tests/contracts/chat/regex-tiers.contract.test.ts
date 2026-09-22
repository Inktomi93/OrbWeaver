import { characterRegexTierKey, regexTierAllowSchema } from "@orb/contracts/chat";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("regex tier allows are sparse overrides: one fixed or character key parses without filling siblings", () => {
  const characterKey = characterRegexTierKey(mintTypeId(ID_PREFIX.character));
  expect(regexTierAllowSchema.parse({ global: false })).toEqual({ global: false });
  expect(regexTierAllowSchema.parse({ [characterKey]: true })).toEqual({ [characterKey]: true });
  expect(regexTierAllowSchema.parse({})).toEqual({});
});

test("regex tier allows still refuse keys the room cannot address", () => {
  expect(regexTierAllowSchema.safeParse({ unknown: false }).success).toBe(false);
  expect(regexTierAllowSchema.safeParse({ "character:not-a-typeid": false }).success).toBe(false);
});
