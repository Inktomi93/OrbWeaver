import { rpgPatchSheetInputSchema } from "@orb/contracts/rpg";
import { mintTypeId } from "@orb/kit/ids";
import { PROTO_KEY } from "@orb/kit/objects";
import { expect, test } from "@orb/testkit/node";

// A sheet patch is client JSON, and JSON.parse keeps `__proto__` as an own key. The sheet merge writes each
// attribute by assignment, so that key must never reach it: the parsed record has to drop it before the verb.
function patchWith(attributes: string): unknown {
  return { chatId: mintTypeId("chat"), actorRef: { kind: "npc", npcKey: "mira" }, patch: { attributes: JSON.parse(attributes) } };
}

test("a sheet patch drops a __proto__ attribute at parse and keeps the scores beside it", () => {
  const raw = patchWith(`{"${PROTO_KEY}":5,"str":12}`);
  const parsed = rpgPatchSheetInputSchema.parse(raw);
  const attributes = parsed.patch.attributes ?? {};
  expect(Object.getOwnPropertyNames(attributes)).toEqual(["str"]);
  expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
});

test("inherited member names that a plain record can own stay legal attribute keys", () => {
  const parsed = rpgPatchSheetInputSchema.parse(patchWith('{"constructor":14,"toString":null}'));
  expect(parsed.patch.attributes).toEqual({ constructor: 14, toString: null });
});
