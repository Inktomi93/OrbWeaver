import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { buildRecallQuery, recallQueryWindow } from "@orb/kit/recall";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createSeededIds();
const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
const scopedCharacterId = mintTypeId(ID_PREFIX.character, ids.next);
const KNOBS = { queryWindow: 2, mode: "mixB", keywordMatch: true, minScore: 0.4, retrieveK: 5, rerankTo: 2 } as const;

test("the chat scope, the egocentric bucket and each resolved knob ride the query", () => {
  const query = buildRecallQuery(KNOBS, { chatId, scopedCharacterId }, "Aria: b\nAria: c");
  expect(query).toEqual({
    scope: { chat: chatId },
    queryText: "Aria: b\nAria: c",
    scopedCharacterId,
    mode: "mixB",
    keywordMatch: true,
    minScore: 0.4,
    retrieveK: 5,
    rerankTo: 2,
  });
});

test("the query carries no candidate restriction; the caller layers the bridge on", () => {
  expect("candidates" in buildRecallQuery(KNOBS, { chatId, scopedCharacterId }, "text")).toBe(false);
});

test("the window is the last queryWindow turns, oldest first, and a window past the history is all of it", () => {
  const recent = ["a", "b", "c"];
  expect(recallQueryWindow(recent, 2)).toEqual(["b", "c"]);
  expect(recallQueryWindow(recent, 1)).toEqual(["c"]);
  expect(recallQueryWindow(recent, 10)).toEqual(["a", "b", "c"]);
  expect(recallQueryWindow([], 3)).toEqual([]);
});
