import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import {
  blockHash,
  blockSpeakerIds,
  renderTranscript,
  sliceBlocks,
  speakerLabel,
} from "../../../../../../../packages/server/src/domain/chat/memory/build/substrate/transcript";
import type { MsgRow } from "../../../../../../../packages/server/src/domain/chat/memory/types";

const aria = castId<CharacterId>("character_aria");
const cole = castId<CharacterId>("character_cole");
const nate = castId<UserId>("user_nate");

function row(seq: number, over: Partial<MsgRow> = {}): MsgRow {
  return {
    seq,
    role: "assistant",
    characterId: aria,
    authorUserId: null,
    content: `m${seq}`,
    ...over,
  };
}

describe("memory/build/substrate/transcript", () => {
  test("sliceBlocks yields only COMPLETE fixed-width blocks (the trailing partial is dropped)", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(i + 1));
    const blocks = sliceBlocks(rows, 2);
    expect(blocks).toHaveLength(2); // 5 / 2 → 2 complete blocks, last msg dropped
    expect(blocks[0]).toMatchObject({ blockIdx: 0, seqStart: 1, seqEnd: 2 });
    expect(blocks[1]).toMatchObject({ blockIdx: 1, seqStart: 3, seqEnd: 4 });
  });

  test("speakerLabel resolves a character name, else a role label", () => {
    const names = new Map<CharacterId, string>([[aria, "Aria"]]);
    expect(speakerLabel(row(1), names)).toBe("Aria");
    expect(speakerLabel(row(1, { characterId: cole }), names)).toBe(cole); // unknown → id fallback
    expect(speakerLabel(row(1, { characterId: null, authorUserId: nate }), names)).toBe("User");
    expect(
      speakerLabel(row(1, { characterId: null, authorUserId: null, role: "system" }), names),
    ).toBe("System");
  });

  test("renderTranscript renders Label: body lines oldest→newest", () => {
    const names = new Map<CharacterId, string>([[aria, "Aria"]]);
    const out = renderTranscript([row(1), row(2, { content: "hi" })], names);
    expect(out).toBe("Aria: m1\nAria: hi");
  });

  test("blockHash is deterministic + name-INDEPENDENT but re-attribution-SENSITIVE", () => {
    const names1 = new Map<CharacterId, string>([[aria, "Aria"]]);
    const names2 = new Map<CharacterId, string>([[aria, "Renamed"]]);
    const rows = [row(1), row(2)];
    const h = blockHash("0:0", rows);
    // a rename does NOT change the hash (it folds the stable id, not the name)
    expect(blockHash("0:0", rows)).toBe(h);
    expect(renderTranscript(rows, names1)).not.toBe(renderTranscript(rows, names2)); // names differ…
    // …but a genuine re-attribution (different characterId) DOES bust the hash
    const reattributed = [row(1, { characterId: cole }), row(2)];
    expect(blockHash("0:0", reattributed)).not.toBe(h);
  });

  test("blockHash folds the scope prefix (shared vs scoped buckets stay distinct)", () => {
    const rows = [row(1), row(2)];
    expect(blockHash(":0:0", rows)).not.toBe(blockHash(`${aria}:0:0`, rows));
  });

  test("blockSpeakerIds returns distinct character ids in first-seen order", () => {
    const rows = [
      row(1, { characterId: aria }),
      row(2, { characterId: cole }),
      row(3, { characterId: aria }),
    ];
    expect(blockSpeakerIds(rows)).toEqual([aria, cole]);
  });
});
