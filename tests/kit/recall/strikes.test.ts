// A player's strike names a span of the story: it matches every bucket's digest of that span by tier and endpoints,
// never by grid position alone, and any summary at its tier or above whose span shares a turn with the strike's is
// left out beside it.
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ResolvedStrike, StrikeCandidate } from "@orb/kit/recall";
import { matchStrikes, resolveStrikeSpan } from "@orb/kit/recall";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createSeededIds();
const shared = mintTypeId(ID_PREFIX.character, ids.next);
const scout = mintTypeId(ID_PREFIX.character, ids.next);
const messages = Array.from({ length: 9 }, () => mintTypeId(ID_PREFIX.message, ids.next));
const FAN_OUT = 2;

function msg(index: number): (typeof messages)[number] {
  const id = messages[index];
  if (id === undefined) {
    throw new Error(`no message ${index}`);
  }
  return id;
}

/** A tier-0 digest over messages `2·blockIdx` and `2·blockIdx + 1` (seq = index), or a consolidation over its
 *  children's span. */
function digest(
  tier: number,
  blockIdx: number,
  options: { readonly bucket?: typeof shared; readonly hash?: string; readonly unresolved?: boolean } = {},
): StrikeCandidate {
  const width = 2 * FAN_OUT ** tier;
  const bucket = options.bucket ?? shared;
  const first = blockIdx * width;
  const last = first + width - 1;
  return {
    tier,
    blockIdx,
    scopedCharacterId: bucket,
    contentHash: options.hash ?? `hash-${bucket}-${tier}-${blockIdx}`,
    span: options.unresolved === true ? null : { startId: msg(first), endId: msg(last) },
    seqSpan: options.unresolved === true ? null : { seqStart: first, seqEnd: last },
  };
}

function strikeOn(row: StrikeCandidate, bucket: typeof shared | null = null): ResolvedStrike {
  if (row.span === null || row.seqSpan === null) {
    throw new Error("a strike is made on a resolved item");
  }
  return {
    scopedCharacterId: bucket,
    tier: row.tier,
    messageStartId: row.span.startId,
    messageEndId: row.span.endId,
    contentHash: row.contentHash,
    seqSpan: row.seqSpan,
  };
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
  const match = matchStrikes([sibling, scene, arc, otherArc, scoutScene, scoutArc, scoutSibling], [strike]);
  expect([...match.struck]).toEqual([
    [scene, strike],
    [scoutScene, strike],
  ]);
  expect([...match.coversStruck]).toEqual([
    [arc, strike],
    [scoutArc, strike],
  ]);
});

test("a longer summary over a struck span is left out even when no summary of the scene itself is pooled", () => {
  // The build dropped the scene's own summary and kept the consolidation built from it.
  const arc = digest(1, 0);
  const strike = strikeOn(digest(0, 1));
  const match = matchStrikes([arc, digest(1, 1)], [strike]);
  expect(match.struck.size).toBe(0);
  expect([...match.coversStruck]).toEqual([[arc, strike]]);
});

test("a strike made on a scoped summary leaves the shared summary of the same span out too", () => {
  const scoutScene = digest(0, 0, { bucket: scout });
  const sharedScene = digest(0, 0);
  const sharedNext = digest(0, 1);
  const scoutStrike = strikeOn(scoutScene, scout);
  expect([...matchStrikes([sharedScene, scoutScene, sharedNext], [scoutStrike]).struck.keys()]).toEqual([sharedScene, scoutScene]);
});

test("a re-digested scene with the same endpoints is still struck, and an unresolved span falls back to the stored hash", () => {
  const before = digest(0, 2);
  const strike = strikeOn(before);
  const edited = digest(0, 2, { hash: "hash-after-edit" });
  const reEmbedded = digest(0, 2, { unresolved: true });
  expect([...matchStrikes([edited], [strike]).struck.keys()]).toEqual([edited]);
  expect([...matchStrikes([reEmbedded], [strike]).struck.keys()]).toEqual([reEmbedded]);
  // Unresolved and re-hashed: nothing ties the row to the strike, so nothing is suppressed.
  const lost = digest(0, 2, { unresolved: true, hash: "hash-after-edit" });
  expect(matchStrikes([lost], [strike]).struck.size).toBe(0);
});

test("a re-sliced block at the struck position is not struck, but is left out while it holds a struck turn", () => {
  const original = digest(0, 1);
  const strike = strikeOn(original);
  const resliced = (seqStart: number, seqEnd: number): StrikeCandidate => ({
    ...original,
    contentHash: `hash-reslice-${seqStart}`,
    span: { startId: msg(seqStart), endId: msg(seqEnd) },
    seqSpan: { seqStart, seqEnd },
  });
  // An earlier hide moved the grid by one message: block 1 now covers messages 3 and 4, half the struck scene.
  const shifted = resliced(3, 4);
  const shiftedMatch = matchStrikes([shifted], [strike]);
  expect(shiftedMatch.struck.size).toBe(0);
  expect([...shiftedMatch.coversStruck]).toEqual([[shifted, strike]]);
  // Moved clear of the scene, the block at the struck position holds none of it and stays.
  const clear = matchStrikes([resliced(4, 5)], [strike]);
  expect(clear.struck.size + clear.coversStruck.size).toBe(0);
  // The positive control: the same row with the original span is struck.
  expect(matchStrikes([original], [strike]).struck.size).toBe(1);
});

test("after a block size change, every same-tier block holding a struck turn is left out, and its neighbours stay", () => {
  const strike = strikeOn(digest(0, 1));
  const block = (size: number, blockIdx: number): StrikeCandidate => {
    const first = blockIdx * size;
    const last = first + size - 1;
    return {
      tier: 0,
      blockIdx,
      scopedCharacterId: shared,
      contentHash: `hash-size-${size}-${blockIdx}`,
      span: { startId: msg(first), endId: msg(last) },
      seqSpan: { seqStart: first, seqEnd: last },
    };
  };
  // Smaller blocks: one message each, two of them inside the struck span.
  const halves = [2, 3].map((blockIdx) => block(1, blockIdx));
  const match = matchStrikes([block(1, 1), ...halves, block(1, 4)], [strike]);
  expect(match.struck.size).toBe(0);
  expect([...match.coversStruck.keys()]).toEqual(halves);
  // Larger blocks of three: the struck span straddles two, each also holding an unstruck turn; the third holds none.
  const thirds = [0, 1, 2].map((blockIdx) => block(3, blockIdx));
  expect([...matchStrikes(thirds, [strike]).coversStruck.keys()]).toEqual(thirds.slice(0, 2));
});

test("a strike on part of a block leaves out the same-tier block that closed around it, and only that block", () => {
  // A fork carried the strike onto the one struck turn it copied into a block still open at the fork.
  const closed = digest(0, 1);
  const partial: ResolvedStrike = { ...strikeOn(closed), contentHash: "hash-of-the-room's-summary", messageEndId: msg(2), seqSpan: { seqStart: 2, seqEnd: 2 } };
  const match = matchStrikes([digest(0, 0), closed, digest(0, 2)], [partial]);
  expect(match.struck.size).toBe(0);
  expect([...match.coversStruck]).toEqual([[closed, partial]]);
});

test("a struck consolidation leaves its children eligible", () => {
  const arc = digest(1, 0);
  const children = [digest(0, 0), digest(0, 1)];
  const match = matchStrikes([...children, arc], [strikeOn(arc)]);
  expect([...match.struck.keys()]).toEqual([arc]);
  expect(match.coversStruck.size).toBe(0);
});

test("a strike's span takes each live endpoint's seq, falls back to the stored seq for a gone one, and stays ordered", () => {
  const stored = { seqStart: 4, seqEnd: 7 };
  // Both endpoints live after a reorder: the live seqs win over what was stored.
  expect(resolveStrikeSpan(stored, { seqStart: 5, seqEnd: 9 })).toEqual({ seqStart: 5, seqEnd: 9 });
  // A member deleted the first message: the span keeps its stored start, so the surviving struck turns stay inside it.
  expect(resolveStrikeSpan(stored, { seqStart: undefined, seqEnd: 7 })).toEqual(stored);
  expect(resolveStrikeSpan(stored, { seqStart: undefined, seqEnd: undefined })).toEqual(stored);
  // A reorder carried the live end below the gone start's stored seq: the span orders its ends rather than inverting.
  expect(resolveStrikeSpan(stored, { seqStart: undefined, seqEnd: 2 })).toEqual({ seqStart: 2, seqEnd: 4 });
});
