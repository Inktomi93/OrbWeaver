// Live collapse helpers preserve ranked representatives; block keys retain egocentric identity.
import type { BlockKey } from "@orb/contracts/search";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { blockKeyStr, collapseByContentHash, collapseSegmentChunks } from "../../../../../packages/server/src/domain/search/substrate/dedupe.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_a");
const CHAR_X = castId<CharacterId>("character_x");
const CHAR_Y = castId<CharacterId>("character_y");

function key(over: Partial<BlockKey> = {}): BlockKey {
  return { chatId: CHAT, tier: 0, blockIdx: 0, scopedCharacterId: CHAR_X, ...over };
}

describe("blockKeyStr", () => {
  test("is stable + includes every key field", () => {
    expect(blockKeyStr(key({ tier: 1, blockIdx: 3, scopedCharacterId: CHAR_Y }))).toBe("chat_a|1|3|character_y");
    expect(blockKeyStr(key({ scopedCharacterId: CHAR_X }))).not.toBe(blockKeyStr(key({ scopedCharacterId: CHAR_Y })));
  });
});

describe("collapseSegmentChunks", () => {
  test("keeps each block's best-ranked chunk and its complete source identity", () => {
    const ranked = [
      { chatId: CHAT, blockIdx: 1, chunkIdx: 1, rowId: mintTypeId(ID_PREFIX.chatSegment), score: 0.1 },
      { chatId: CHAT, blockIdx: 1, chunkIdx: 0, rowId: mintTypeId(ID_PREFIX.chatSegment), score: 0.2 },
      { chatId: mintTypeId(ID_PREFIX.chat), blockIdx: 1, chunkIdx: 0, rowId: mintTypeId(ID_PREFIX.chatSegment), score: 0.3 },
      { chatId: CHAT, blockIdx: 2, chunkIdx: 0, rowId: mintTypeId(ID_PREFIX.chatSegment), score: 0.4 },
    ];
    expect(collapseSegmentChunks(ranked)).toEqual([ranked[0], ranked[2], ranked[3]]);
  });
});

describe("collapseByContentHash", () => {
  test("keeps the first (best-ranked) row per content hash", () => {
    const out = collapseByContentHash([
      { contentHash: "h1", tag: "a" },
      { contentHash: "h1", tag: "b" },
      { contentHash: "h2", tag: "c" },
    ]);
    expect(out.map((r) => r.tag)).toEqual(["a", "c"]);
  });
});
