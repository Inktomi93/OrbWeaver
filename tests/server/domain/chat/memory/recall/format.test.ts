import type { BlockKey } from "@orb/contracts/search";
import type { ChatDigestId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import {
  blockKeyStr,
  formatMemory,
} from "../../../../../../packages/server/src/domain/chat/memory/recall/format";
import type { DigestRow } from "../../../../../../packages/server/src/domain/chat/memory/types";

const chatId = castId<ChatId>("chat_f");

function key(tier: number, blockIdx: number): BlockKey {
  return { chatId, tier, blockIdx, scopedCharacterId: "" };
}
function dr(tier: number, blockIdx: number, anchor: string, keywords: string[]): DigestRow {
  return {
    id: castId<ChatDigestId>(`d_${tier}_${blockIdx}`),
    scopedCharacterId: "",
    isGroup: false,
    tier,
    blockIdx,
    contentHash: "h",
    topicAnchor: anchor,
    keywords,
  };
}

describe("memory/recall/format", () => {
  test("formats anchor + keywords per block, blank-line separated, in the given order", () => {
    const byKey = new Map([
      [blockKeyStr(key(0, 0)), dr(0, 0, "[scene 0]", ["a"])],
      [blockKeyStr(key(0, 1)), dr(0, 1, "[scene 1]", ["b", "c"])],
    ]);
    // ranked order: block 1 then block 0
    const out = formatMemory([key(0, 1), key(0, 0)], byKey);
    expect(out).toBe("[scene 1]\nkeywords: b, c\n\n[scene 0]\nkeywords: a");
  });

  test("a key with no loaded row is dropped (a hit outside the loaded scope)", () => {
    const byKey = new Map([[blockKeyStr(key(0, 0)), dr(0, 0, "[only]", [])]]);
    expect(formatMemory([key(0, 0), key(0, 9)], byKey)).toBe("[only]");
  });

  test("empty keys → empty string (no {{memory}} content)", () => {
    expect(formatMemory([], new Map())).toBe("");
  });
});
