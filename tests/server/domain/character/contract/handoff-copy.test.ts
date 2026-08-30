// domain/character/contract/handoff-copy — pins {@link handoffProvenance}, the file's one runtime
// behavior: the idempotency key BOTH the mint op and the find-before-mint lookup must spell identically
// (header: "a drifted key mints a duplicate library on every retry"). Everything else in this file is
// types/DI shapes, exercised through `tests/server/domain/chat/substrate/handoff-copy.int.test.ts`.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { handoffProvenance } from "../../../../../packages/server/src/domain/character/contract/handoff-copy.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("handoffProvenance", () => {
  test("the format is `handoff:<chatId>:<sourceCharacterId>` — the ONE spelling both the writer and finder use", () => {
    const chatId = castId<ChatId>("chat_x");
    const sourceCharacterId = castId<CharacterId>("character_x");
    expect(handoffProvenance(chatId, sourceCharacterId)).toBe(`handoff:${chatId}:${sourceCharacterId}`);
  });

  test("scoped by chatId: the SAME source card gifted through two different rooms yields two DISTINCT keys", () => {
    const sourceCharacterId = castId<CharacterId>("character_shared");
    const chatA = castId<ChatId>("chat_a");
    const chatB = castId<ChatId>("chat_b");
    expect(handoffProvenance(chatA, sourceCharacterId)).not.toBe(handoffProvenance(chatB, sourceCharacterId));
  });

  test("deterministic: the same (chatId, sourceCharacterId) pair always produces the identical key", () => {
    const chatId = castId<ChatId>("chat_repeat");
    const sourceCharacterId = castId<CharacterId>("character_repeat");
    expect(handoffProvenance(chatId, sourceCharacterId)).toBe(handoffProvenance(chatId, sourceCharacterId));
  });
});
