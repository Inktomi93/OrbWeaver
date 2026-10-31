import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { BlockKey } from "@orb/kit/recall";
import { blockKeyStr, formatMemory, inLiveWindow, LIVE_WINDOW_FULL_HISTORY_CUTOFF } from "@orb/kit/recall";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createSeededIds();
const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
const scopedCharacterId = mintTypeId(ID_PREFIX.character, ids.next);

function key(tier: number, blockIdx: number): BlockKey {
  return { chatId, tier, blockIdx, scopedCharacterId };
}

function rows(...entries: readonly (readonly [BlockKey, string])[]): Map<string, { text: string }> {
  return new Map(entries.map(([blockKey, text]) => [blockKeyStr(blockKey), { text }]));
}

test("each block's stored text is blank-line separated in the order given, and rendered says which keys contributed", () => {
  const out = formatMemory([key(0, 1), key(0, 0)], rows([key(0, 0), "[scene 0]\nkeywords: a"], [key(0, 1), "[scene 1]\nkeywords: b, c"]));
  expect(out.text).toBe("[scene 1]\nkeywords: b, c\n\n[scene 0]\nkeywords: a");
  expect(out.rendered).toEqual([key(0, 1), key(0, 0)]);
});

test("a key with no loaded row is dropped from the text and from rendered", () => {
  const out = formatMemory([key(0, 0), key(0, 9)], rows([key(0, 0), "[only]"]));
  expect(out).toEqual({ text: "[only]", rendered: [key(0, 0)] });
});

test("a blank body adds no empty block, and no keys give no text", () => {
  expect(formatMemory([key(0, 0)], rows([key(0, 0), "   "]))).toEqual({ text: "", rendered: [] });
  expect(formatMemory([], new Map())).toEqual({ text: "", rendered: [] });
});

test("the block identity names the chat, the grid position and the bucket", () => {
  const other = mintTypeId(ID_PREFIX.character, ids.next);
  expect(blockKeyStr(key(1, 2))).toBe(`${chatId}|1|2|${scopedCharacterId}`);
  expect(blockKeyStr({ ...key(1, 2), scopedCharacterId: other })).not.toBe(blockKeyStr(key(1, 2)));
});

test("a span starting at the cutoff is still in the live window, and strictly below it has aged out", () => {
  expect(inLiveWindow(9, 9)).toBe(true);
  expect(inLiveWindow(100, 9)).toBe(true);
  expect(inLiveWindow(8, 9)).toBe(false);
  expect(inLiveWindow(1, 50)).toBe(false);
});

test("the whole-history cutoff keeps every digest inside the live window", () => {
  expect(inLiveWindow(0, LIVE_WINDOW_FULL_HISTORY_CUTOFF)).toBe(true);
  expect(inLiveWindow(1_000_000, LIVE_WINDOW_FULL_HISTORY_CUTOFF)).toBe(true);
});
