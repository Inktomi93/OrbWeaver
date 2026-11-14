// A player's strike names a span of the story: it matches every bucket's digest of that span by tier and endpoints,
// never by grid position alone, and a consolidation built from a struck digest of its own bucket is left out beside it.
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RecallStrike, StrikeCandidate } from "@orb/kit/recall";
import { matchStrikes } from "@orb/kit/recall";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createSeededIds();
const shared = mintTypeId(ID_PREFIX.character, ids.next);
const scout = mintTypeId(ID_PREFIX.character, ids.next);
const messages = Array.from({ length: 8 }, () => mintTypeId(ID_PREFIX.message, ids.next));
const FAN_OUT = 2;
const GRID = { fanOut: FAN_OUT } as const;

function msg(index: number): (typeof messages)[number] {
  const id = messages[index];
  if (id === undefined) {
    throw new Error(`no message ${index}`);
  }
  return id;
}

/** A tier-0 digest over messages `2·blockIdx` and `2·blockIdx + 1`, or a consolidation over its children's span. */
function digest(
  tier: number,
  blockIdx: number,
  options: { readonly bucket?: typeof shared; readonly hash?: string; readonly unresolved?: boolean } = {},
): StrikeCandidate {
  const width = 2 * FAN_OUT ** tier;
  const bucket = options.bucket ?? shared;
  return {
    tier,
    blockIdx,
    scopedCharacterId: bucket,
    contentHash: options.hash ?? `hash-${bucket}-${tier}-${blockIdx}`,
    span: options.unresolved === true ? null : { startId: msg(blockIdx * width), endId: msg(blockIdx * width + width - 1) },
  };
}

function strikeOn(row: StrikeCandidate, bucket: typeof shared | null = null): RecallStrike {
  if (row.span === null) {
    throw new Error("a strike is made on a resolved item");
  }
  return { scopedCharacterId: bucket, tier: row.tier, messageStartId: row.span.startId, messageEndId: row.span.endId, contentHash: row.contentHash };
}

test("a strike matches every bucket's summary of its span and every consolidation over it, and the sibling scene stays", () => {
  const scene = digest(0, 1);
  const sibling = digest(0, 0);
  const arc = digest(1, 0);
  const otherArc = digest(1, 1);
  const scoutScene = digest(0, 1, { bucket: scout });
  const scoutArc = digest(1, 0, { bucket: scout });
  const scoutSibling = digest(0, 0, { bucket: scout });
  const strike = strikeOn(scene);
  const match = matchStrikes([sibling, scene, arc, otherArc, scoutScene, scoutArc, scoutSibling], [strike], GRID);
  expect([...match.struck]).toEqual([
    [scene, strike],
    [scoutScene, strike],
  ]);
  expect([...match.coversStruck]).toEqual([arc, scoutArc]);
});

test("a scoped consolidation over a block its character never witnessed does not retell that block, so it stays", () => {
  const sharedScene = digest(0, 0);
  // The scout joined after block 0: its bucket holds block 1 alone, and its consolidation was built from that child.
  const scoutLater = digest(0, 1, { bucket: scout });
  const scoutArc = digest(1, 0, { bucket: scout });
  const match = matchStrikes([sharedScene, scoutLater, scoutArc], [strikeOn(sharedScene)], GRID);
  expect([...match.struck.keys()]).toEqual([sharedScene]);
  expect(match.coversStruck.size).toBe(0);
});

test("a strike made on a scoped summary leaves the shared summary of the same span out too", () => {
  const scoutScene = digest(0, 0, { bucket: scout });
  const sharedScene = digest(0, 0);
  const sharedNext = digest(0, 1);
  const scoutStrike = strikeOn(scoutScene, scout);
  expect([...matchStrikes([sharedScene, scoutScene, sharedNext], [scoutStrike], GRID).struck.keys()]).toEqual([sharedScene, scoutScene]);
});

test("a re-digested scene with the same endpoints is still struck, and an unresolved span falls back to the stored hash", () => {
  const before = digest(0, 2);
  const strike = strikeOn(before);
  const edited = digest(0, 2, { hash: "hash-after-edit" });
  const reEmbedded = digest(0, 2, { unresolved: true });
  expect([...matchStrikes([edited], [strike], GRID).struck.keys()]).toEqual([edited]);
  expect([...matchStrikes([reEmbedded], [strike], GRID).struck.keys()]).toEqual([reEmbedded]);
  // Unresolved and re-hashed: nothing ties the row to the strike, so nothing is suppressed.
  const lost = digest(0, 2, { unresolved: true, hash: "hash-after-edit" });
  expect(matchStrikes([lost], [strike], GRID).struck.size).toBe(0);
});

test("a re-sliced block at the struck position is a different item and is not suppressed", () => {
  const original = digest(0, 1);
  const strike = strikeOn(original);
  // An earlier hide moved the grid by one message: block 1 now covers messages 3 and 4.
  const shifted: StrikeCandidate = { ...original, contentHash: "hash-reslice", span: { startId: msg(3), endId: msg(4) } };
  const match = matchStrikes([shifted], [strike], GRID);
  expect(match.struck.size).toBe(0);
  expect(match.coversStruck.size).toBe(0);
  // The positive control: the same row with the original span is struck.
  expect(matchStrikes([original], [strike], GRID).struck.size).toBe(1);
});

test("a struck consolidation leaves its children eligible", () => {
  const arc = digest(1, 0);
  const children = [digest(0, 0), digest(0, 1)];
  const match = matchStrikes([...children, arc], [strikeOn(arc)], GRID);
  expect([...match.struck.keys()]).toEqual([arc]);
  expect(match.coversStruck.size).toBe(0);
});
