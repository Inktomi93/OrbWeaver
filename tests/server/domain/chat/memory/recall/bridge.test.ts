import type { ChatDigestId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import { computeBridge } from "../../../../../../packages/server/src/domain/chat/memory/recall/bridge";
import type {
  DigestRow,
  MemoryScope,
} from "../../../../../../packages/server/src/domain/chat/memory/types";

const chatId = castId<ChatId>("chat_b");
const scope: MemoryScope = { chatId, scopedCharacterId: "", isGroup: false };

function dr(tier: number, blockIdx: number): DigestRow {
  return {
    id: castId<ChatDigestId>(`chat_digest_${tier}_${blockIdx}`),
    scopedCharacterId: "",
    isGroup: false,
    tier,
    blockIdx,
    contentHash: `h${tier}${blockIdx}`,
    topicAnchor: `[a${tier}.${blockIdx}]`,
    keywords: [],
  };
}

describe("memory/recall/bridge — tiered coverage", () => {
  test("coarse high-tier for the distant past + fine tier-0 for the recent past (uncovered-only)", () => {
    // fanOut=2: tier-0 blocks 0..3; tier-1 block 0 covers {0,1}, block 1 covers {2,3}.
    const digests = [dr(0, 0), dr(0, 1), dr(0, 2), dr(0, 3), dr(1, 0), dr(1, 1)];
    const keys = computeBridge(scope, digests, 2);
    // fine zone = last fanOut(2) tier-0 blocks → [2,3]; coarse [0,1] covered by ONE tier-1 digest.
    expect(keys).toEqual([
      { chatId, tier: 1, blockIdx: 0, scopedCharacterId: "" },
      { chatId, tier: 0, blockIdx: 2, scopedCharacterId: "" },
      { chatId, tier: 0, blockIdx: 3, scopedCharacterId: "" },
    ]);
    // the tier-0 blocks 0 + 1 are COVERED by tier-1 block 0 → never also surfaced (uncovered-only).
    expect(keys.some((k) => k.tier === 0 && k.blockIdx <= 1)).toBe(false);
  });

  test("short chat (everything fits the fine zone) → all tier-0, chronological", () => {
    const keys = computeBridge(scope, [dr(0, 0), dr(0, 1)], 8);
    expect(keys).toEqual([
      { chatId, tier: 0, blockIdx: 0, scopedCharacterId: "" },
      { chatId, tier: 0, blockIdx: 1, scopedCharacterId: "" },
    ]);
  });

  test("no tier-0 digests (nothing aged out) → empty bridge — the protected tip is never surfaced", () => {
    expect(computeBridge(scope, [], 8)).toEqual([]);
  });
});
