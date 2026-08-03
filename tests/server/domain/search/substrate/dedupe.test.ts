// substrate: dedupe — the pure post-rank collapse helpers. Asserts the block-key string identity, that
// dedupeRankedBlocks keeps the better-RANKED representative (input is best-first) and — crucially (inv 5/8)
// — does NOT collapse two blocks that share `(chatId, tier, blockIdx)` but differ in `scopedCharacterId`
// (two egocentric POVs of the same scene), and that collapseByContentHash collapses fork/import copies.

import type { BlockKey } from "@orb/contracts/search";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { blockKeyStr, collapseByContentHash, dedupeRankedBlocks } from "../../../../../packages/server/src/domain/search/substrate/dedupe.ts";
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
  });
});

describe("dedupeRankedBlocks", () => {
  test("keeps the first (best-ranked) row per block key", () => {
    const out = dedupeRankedBlocks([
      { blockKey: key(), lens: "digest" },
      { blockKey: key(), lens: "segment" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.lens).toBe("digest");
  });

  test("does NOT collapse two POVs of the same scene (differ only in scopedCharacterId)", () => {
    const out = dedupeRankedBlocks([{ blockKey: key({ scopedCharacterId: CHAR_X }) }, { blockKey: key({ scopedCharacterId: CHAR_Y }) }]);
    expect(out).toHaveLength(2);
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
