import type { ChatId } from "@orb/kit/ids";
import { brandedId, castId, ID_PREFIX, mintTypeId, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("mintTypeId produces a prefixed TypeID", () => {
  const id = mintTypeId(ID_PREFIX.chat);
  expect(id.startsWith("chat_")).toBe(true);
});

test("mintTypeId values are unique", () => {
  const a = mintTypeId(ID_PREFIX.message);
  const b = mintTypeId(ID_PREFIX.message);
  expect(a).not.toBe(b);
});

test("typeIdSchema accepts a matching prefix and rejects a mismatched one", () => {
  const schema = typeIdSchema(ID_PREFIX.persona);
  const good = mintTypeId(ID_PREFIX.persona);
  expect(schema.safeParse(good).success).toBe(true);

  const wrong = mintTypeId(ID_PREFIX.chat);
  expect(schema.safeParse(wrong).success).toBe(false);

  expect(schema.safeParse("not-a-typeid").success).toBe(false);
});

test("brandedId accepts only non-empty strings", () => {
  const schema = brandedId<ChatId>();
  expect(schema.safeParse("").success).toBe(false);
  expect(schema.safeParse("anything").success).toBe(true);
  expect(schema.safeParse(42).success).toBe(false);
  expect(schema.safeParse({ wrong: true }).success).toBe(false);
});

test("castId brands without altering the runtime value", () => {
  const raw: string = mintTypeId(ID_PREFIX.chat);
  const branded = castId<ChatId>(raw);
  expect(branded).toBe(raw);
});

test("D-schema brands: no character_version; per-type duplicate pairs; new roster prefixes", () => {
  // D28: the version table is gone.
  expect(Object.values(ID_PREFIX)).not.toContain("character_version");
  // D24: per-type duplicate-pair tables.
  expect(ID_PREFIX.duplicateCharacterPair).toBe("duplicate_character_pair");
  expect(ID_PREFIX.duplicateChatPair).toBe("duplicate_chat_pair");
  // D28 / D16 additions.
  expect(ID_PREFIX.characterSnapshot).toBe("character_snapshot");
  expect(ID_PREFIX.chatInvite).toBe("chat_invite");
  expect(ID_PREFIX.pendingTurn).toBe("pending_turn");
  expect(ID_PREFIX.notification).toBe("notification");
});
