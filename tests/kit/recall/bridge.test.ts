import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { BridgeRow } from "@orb/kit/recall";
import { computeBridge, tier0RangeOf } from "@orb/kit/recall";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createSeededIds();
const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
const shared = mintTypeId(ID_PREFIX.character, ids.next);
const own = mintTypeId(ID_PREFIX.character, ids.next);
const scope = { chatId };

function row(tier: number, blockIdx: number, scopedCharacterId = shared): BridgeRow {
  return { tier, blockIdx, scopedCharacterId };
}

function key(
  tier: number,
  blockIdx: number,
  scopedCharacterId = shared,
): { chatId: typeof chatId; tier: number; blockIdx: number; scopedCharacterId: typeof shared } {
  return { chatId, tier, blockIdx, scopedCharacterId };
}

/** The full digest pyramid for `tier0Count` tier-0 blocks, so the bridge can pick the coarsest non-overlapping cover. */
function pyramid(tier0Count: number, fanOut: number, maxTier: number): BridgeRow[] {
  return Array.from({ length: maxTier + 1 }, (_, tier) =>
    Array.from({ length: Math.floor(tier0Count / fanOut ** tier) }, (_unused, block) => row(tier, block)),
  ).flat();
}

test("the coarse past is one higher-tier digest and the recent past stays tier 0", () => {
  const keys = computeBridge(scope, [row(0, 0), row(0, 1), row(0, 2), row(0, 3), row(1, 0), row(1, 1)], 2);
  expect(keys).toEqual([key(1, 0), key(0, 2), key(0, 3)]);
});

test("a short chat that fits the fine zone surfaces every tier-0 block in order", () => {
  expect(computeBridge(scope, [row(0, 0), row(0, 1)], 8)).toEqual([key(0, 0), key(0, 1)]);
  expect(computeBridge(scope, [], 8)).toEqual([]);
});

test("a tier-2 digest hides the tier-1 and tier-0 digests inside its span", () => {
  const digests = [row(0, 0), row(0, 1), row(0, 2), row(0, 3), row(0, 4), row(0, 5), row(1, 0), row(1, 1), row(1, 2), row(2, 0)];
  expect(computeBridge(scope, digests, 2)).toEqual([key(2, 0), key(0, 4), key(0, 5)]);
});

test("the pool grows by one key when the chat doubles, not by double", () => {
  const eight = computeBridge(scope, pyramid(8, 2, 3), 2);
  const sixteen = computeBridge(scope, pyramid(16, 2, 3), 2);
  expect(eight).toHaveLength(4);
  expect(sixteen).toHaveLength(5);
});

test("a hole with no covering digest at any tier is skipped", () => {
  expect(computeBridge(scope, [row(0, 0), row(0, 2), row(0, 3)], 2)).toEqual([key(0, 0), key(0, 2), key(0, 3)]);
});

test("two buckets both holding block 0 each keep their own key", () => {
  const keys = computeBridge(scope, [row(0, 0, shared), row(0, 0, own)], 8);
  expect(keys).toEqual([key(0, 0, shared), key(0, 0, own)]);
});

test("each bucket's coarse and fine zones come from its own digest set", () => {
  const digests = [row(0, 0), row(0, 1), row(0, 2), row(0, 3), row(1, 0), row(1, 1), row(0, 0, own)];
  expect(computeBridge(scope, digests, 2)).toEqual([key(1, 0), key(0, 2), key(0, 3), key(0, 0, own)]);
});

test("a tier-k digest at a block covers the tier-0 range the grid names", () => {
  expect(tier0RangeOf(2, 0, 5)).toEqual({ startIdx: 5, endIdx: 5 });
  expect(tier0RangeOf(2, 1, 3)).toEqual({ startIdx: 6, endIdx: 7 });
  expect(tier0RangeOf(4, 2, 1)).toEqual({ startIdx: 16, endIdx: 31 });
});
