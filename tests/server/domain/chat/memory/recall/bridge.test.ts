import type { CharacterId, ChatDigestId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { computeBridge } from "../../../../../../packages/server/src/domain/chat/memory/recall/bridge";
import type {
  DigestRow,
  MemoryScope,
} from "../../../../../../packages/server/src/domain/chat/memory/types";
import { expect, test } from "../../../../../support/fixtures";

const chatId = castId<ChatId>("chat_b");
// The shared bucket keys to the synthetic group-as-character (a real CharacterId — inv 8, no `''` sentinel).
const groupChar = castId<CharacterId>("character_group");
const scope: MemoryScope = { chatId, scopedCharacterId: groupChar, isGroup: false };

function dr(tier: number, blockIdx: number): DigestRow {
  return {
    id: castId<ChatDigestId>(`chat_digest_${tier}_${blockIdx}`),
    scopedCharacterId: groupChar,
    isGroup: false,
    tier,
    blockIdx,
    text: `[a${tier}.${blockIdx}]`,
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
      { chatId, tier: 1, blockIdx: 0, scopedCharacterId: groupChar },
      { chatId, tier: 0, blockIdx: 2, scopedCharacterId: groupChar },
      { chatId, tier: 0, blockIdx: 3, scopedCharacterId: groupChar },
    ]);
    // the tier-0 blocks 0 + 1 are COVERED by tier-1 block 0 → never also surfaced (uncovered-only).
    expect(keys.some((k) => k.tier === 0 && k.blockIdx <= 1)).toBe(false);
  });

  test("short chat (everything fits the fine zone) → all tier-0, chronological", () => {
    const keys = computeBridge(scope, [dr(0, 0), dr(0, 1)], 8);
    expect(keys).toEqual([
      { chatId, tier: 0, blockIdx: 0, scopedCharacterId: groupChar },
      { chatId, tier: 0, blockIdx: 1, scopedCharacterId: groupChar },
    ]);
  });

  test("no tier-0 digests (nothing aged out) → empty bridge — the protected tip is never surfaced", () => {
    expect(computeBridge(scope, [], 8)).toEqual([]);
  });
});

describe("memory/recall/bridge — adversarial coverage (uncovered-only depth, boundedness, gaps)", () => {
  /** Build the full digest pyramid for `tier0Count` tier-0 blocks under `fanOut` (every complete higher-tier
   *  group present), so the bridge can pick the COARSEST non-overlapping cover. */
  function pyramid(tier0Count: number, fanOut: number, maxTier: number): DigestRow[] {
    const rows: DigestRow[] = [];
    for (let tier = 0; tier <= maxTier; tier += 1) {
      const span = fanOut ** tier;
      const count = Math.floor(tier0Count / span);
      for (let b = 0; b < count; b += 1) {
        rows.push(dr(tier, b));
      }
    }
    return rows;
  }

  test("tier-2 cover: a tier-2 digest hides the tier-1 AND tier-0 digests inside its span (highest-tier-first)", () => {
    // fanOut 2: tier-0 0..5, tier-1 0..2, tier-2 0 (covers tier-0 0..3). lastTier0=5 → fine zone [4,5].
    // The coarse zone [0,4) is covered by the SINGLE tier-2 block 0 — neither tier-1 nor tier-0 inside it surfaces.
    const digests = [
      dr(0, 0),
      dr(0, 1),
      dr(0, 2),
      dr(0, 3),
      dr(0, 4),
      dr(0, 5),
      dr(1, 0),
      dr(1, 1),
      dr(1, 2),
      dr(2, 0),
    ];
    const keys = computeBridge(scope, digests, 2);
    expect(keys).toEqual([
      { chatId, tier: 2, blockIdx: 0, scopedCharacterId: groupChar },
      { chatId, tier: 0, blockIdx: 4, scopedCharacterId: groupChar },
      { chatId, tier: 0, blockIdx: 5, scopedCharacterId: groupChar },
    ]);
    // uncovered-only across DEPTH: nothing tier-0 ≤3 and NO tier-1 surfaces (all inside the tier-2 span / fine zone).
    expect(keys.some((k) => k.tier === 0 && k.blockIdx <= 3)).toBe(false);
    expect(keys.some((k) => k.tier === 1)).toBe(false);
  });

  test("the pool stays BOUNDED (~log) as the chat grows — doubling tier-0 blocks adds ~1 key, not 2x", () => {
    // The whole point of the bridge (§5): the injected story-so-far is roughly constant no matter the chat length.
    const eight = computeBridge(scope, pyramid(8, 2, 3), 2); // 8 tier-0 blocks
    const sixteen = computeBridge(scope, pyramid(16, 2, 3), 2); // 16 tier-0 blocks
    expect(eight).toHaveLength(4); // [T3? no — T2.0, T1.2, t0.6, t0.7]
    expect(sixteen).toHaveLength(5); // [T3.0, T2.2, T1.6, t0.14, t0.15]
    // sub-linear: 2x the chat is NOT 2x the pool (a p+=1 / lost-uncovered-only mutation would blow this to ~16).
    expect(sixteen.length).toBeLessThan(eight.length * 2);
    expect(sixteen.length).toBeLessThan(8); // ≪ the 16 raw tier-0 digests
  });

  test("a hole in the coarse zone with no covering higher tier is SKIPPED (no crash, no phantom key)", () => {
    // tier-0 {0, 2, 3} (block 1 deleted), no higher tier. fine zone [2,3]; coarse [0,2): block 0 emits, block 1
    // has no digest at any tier → the gap is skipped (the `highestCoveringTier === null` branch).
    const keys = computeBridge(scope, [dr(0, 0), dr(0, 2), dr(0, 3)], 2);
    expect(keys).toEqual([
      { chatId, tier: 0, blockIdx: 0, scopedCharacterId: groupChar },
      { chatId, tier: 0, blockIdx: 2, scopedCharacterId: groupChar },
      { chatId, tier: 0, blockIdx: 3, scopedCharacterId: groupChar },
    ]);
    expect(keys.some((k) => k.blockIdx === 1)).toBe(false);
  });
});
