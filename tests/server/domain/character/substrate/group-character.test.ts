// domain/character/substrate/group-character — pins the reserved `__group__<chatId>` handle namespace: the
// mint's own handle format, the reserved-prefix detector every user create/update refuses against, and that
// the synthetic card is marked `synthetic` nowhere in its own literal fields (buildGroupCard's shape is
// exercised by the mint verb; here we pin the two handle predicates that gate user input against it).

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { buildGroupCard, groupHandle, isReservedGroupHandle } from "../../../../../packages/server/src/domain/character/substrate/group-character.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("groupHandle / isReservedGroupHandle", () => {
  test("groupHandle mints `__group__<chatId>` and that handle IS reserved", () => {
    const chatId = castId<ChatId>("chat_x");
    const handle = groupHandle(chatId);
    expect(handle).toBe(`__group__${chatId}`);
    expect(isReservedGroupHandle(handle)).toBe(true);
  });

  test("two different chats mint two DISJOINT handles", () => {
    const a = groupHandle(castId<ChatId>("chat_a"));
    const b = groupHandle(castId<ChatId>("chat_b"));
    expect(a).not.toBe(b);
  });

  test("an ordinary user-authored handle is NOT reserved — the refusal only fires on the exact prefix", () => {
    expect(isReservedGroupHandle(castId("my_character"))).toBe(false);
    expect(isReservedGroupHandle(castId("group_but_not_reserved"))).toBe(false);
  });

  test("a handle merely containing the prefix mid-string is not reserved — it must START with it", () => {
    expect(isReservedGroupHandle(castId("prefix__group__chat_x"))).toBe(false);
  });
});

describe("buildGroupCard", () => {
  test("the minimal card carries no greeting and no avatar — a never-rendered memory bucket", () => {
    const card = buildGroupCard();
    expect(card.name).toBe("Group");
    expect(card.greetings).toEqual([]);
    expect(card.avatarAssetId).toBeNull();
  });
});
