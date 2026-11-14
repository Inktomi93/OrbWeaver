// The avatar admission twin applies the store's byte cap, so an import preview never promises art the store then
// refuses.

import { ASSET_UPLOAD_REFUSAL_CODES } from "@orb/contracts/assets";
import { createAdmitsAvatar } from "@orb/server/domain/assets";
import { expect, test } from "@orb/testkit/node";
import { magicBytes, principal } from "@orb/testkit/node/helpers";

// A PNG head with its own tail: bytes the kind and magic checks admit, so only the cap can refuse them.
const avatarBytes = (tail: string): Uint8Array => Uint8Array.from([...magicBytes("png", 0), ...new TextEncoder().encode(tail)]);

test("the avatar check and the store refuse the same bytes over the cap and admit them at the cap", async ({ harness, services }): Promise<void> => {
  const actor = await principal(harness, (await harness.actor()).id);
  const bytes = avatarBytes("Avatar bytes the cap decides");
  const admitsAvatar = createAdmitsAvatar();

  expect(admitsAvatar({ bytes, maxBytes: bytes.byteLength - 1 })).toBe(false);
  await expect(
    services.assets.store({ principal: actor, bytes, kind: "avatar", mime: "image/png", enforceMagic: true, maxBytes: bytes.byteLength - 1 }),
  ).rejects.toMatchObject({ code: ASSET_UPLOAD_REFUSAL_CODES.tooLarge });

  expect(admitsAvatar({ bytes, maxBytes: bytes.byteLength })).toBe(true);
  const stored = await services.assets.store({ principal: actor, bytes, kind: "avatar", mime: "image/png", enforceMagic: true, maxBytes: bytes.byteLength });
  expect(stored.created).toBe(true);
});
