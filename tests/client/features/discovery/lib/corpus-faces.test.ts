// Unit: the cluster-member → `<AvatarStack>` seat mapper (features/discovery/lib/corpus-faces). Two
// behaviors the CTs can only observe through a mount: a hash becomes the CAS blob URL for that hash, and a
// NULL hash OMITS `src` entirely rather than passing an empty/undefined one — the omission is what makes
// AvatarStack draw its hue-seeded initials instead of an <img> that can only 404. The slot budget is the
// caller's, and it slices rather than padding, because the member list is already a bounded display slice
// whose real total lives in the cluster's `size`.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { toFaceItems } from "../../../../../packages/client/src/features/discovery/lib/corpus-faces.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function member(name: string, avatarHash: string | null): { characterId: CharacterId; name: string; avatarHash: string | null } {
  return { characterId: castId<CharacterId>(`character_${name.toLowerCase()}`), name, avatarHash };
}

test("a hash becomes that blob's URL; a null hash omits src so the seat falls back to initials", () => {
  const items = toFaceItems([member("Sable", "cccc3333"), member("Morgatha", null)], 4);

  expect(items).toEqual([{ name: "Sable", src: "/api/blob/cccc3333" }, { name: "Morgatha" }]);
  // Not merely undefined: the KEY is absent, which is what `exactOptionalPropertyTypes` + AvatarStack's
  // `item.src === undefined` arm both read as "this seat has no portrait".
  expect(Object.hasOwn(items[1] ?? {}, "src")).toBe(false);
});

test("the caller's slot budget slices the display list and never pads it", () => {
  const members = [member("A", null), member("B", null), member("C", null)];

  expect(toFaceItems(members, 2).map((i) => i.name)).toEqual(["A", "B"]);
  expect(toFaceItems(members, 9)).toHaveLength(3);
});
