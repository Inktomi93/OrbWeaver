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

// A rejected id's issue message reaches the server log (a failed tRPC output parse logs its ZodError), so it
// must never echo the value: a producer bug that maps a secret into an id field would otherwise print the
// secret. typeid-js's own messages echo it on three paths — a prefix mismatch (up to the last `_`), a prefix
// with invalid characters, and an empty prefix (the whole value).
test("typeIdSchema's issue message never echoes the rejected value", () => {
  const schema = typeIdSchema(ID_PREFIX.persona);
  const secretShaped = ["sk_live_secretkey_01jz0000000000000000000000", "sk-live-9f2c4d1e_01jz0000000000000000000000", "_sk-live-plaintext-key-4d1e"];
  for (const value of secretShaped) {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["Invalid persona id"]);
    expect(JSON.stringify(result.error?.issues)).not.toContain("sk");
  }
});

test("brandedId accepts only non-empty strings", () => {
  const schema = brandedId<ChatId>();
  expect(schema.safeParse("").success).toBe(false);
  expect(schema.safeParse("anything").success).toBe(true);
  expect(schema.safeParse(42).success).toBe(false);
  expect(schema.safeParse({ wrong: true }).success).toBe(false);
  expect(schema.parse("anything")).toBe("anything");
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
