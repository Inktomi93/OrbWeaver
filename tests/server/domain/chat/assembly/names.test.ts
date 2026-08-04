// SHAPE shaper: applyNamesBehavior (chat.md Part II §3 rule 5 — the trusted out-of-band Name: label).
import { describe } from "vitest";
import { applyNamesBehavior } from "../../../../../packages/server/src/domain/chat/assembly/names.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const SPEAKERS = { user: "User", assistant: "Aria" };

describe("applyNamesBehavior", () => {
  test('"none" strips names + drops authorName/name fields', () => {
    expect(applyNamesBehavior([{ role: "user", content: "u1", authorName: "OldPersona" }], "none", SPEAKERS)).toEqual([{ role: "user", content: "u1" }]);
  });

  test('"default" solo prefixes nothing → byte-identical (Part III §12 inv 1)', () => {
    const h = [
      { role: "assistant" as const, content: "greeting", authorName: "Aria" },
      { role: "user" as const, content: "u1", authorName: "User" },
    ];
    expect(applyNamesBehavior(h, "default", SPEAKERS, { multiCharacter: false })).toEqual([
      { role: "assistant", content: "greeting" },
      { role: "user", content: "u1" },
    ]);
  });

  test('"default" prefixes a user turn authored under a since-switched persona', () => {
    expect(applyNamesBehavior([{ role: "user", content: "hi", authorName: "Alt" }], "default", SPEAKERS, { multiCharacter: false })).toEqual([
      { role: "user", content: "Alt: hi" },
    ]);
  });

  test('"default" + multiCharacter prefixes assistant rows with their character name', () => {
    expect(
      applyNamesBehavior(
        [
          { role: "assistant", content: "greeting", authorName: "Aria" },
          { role: "assistant", content: "line", authorName: "Kai" },
        ],
        "default",
        SPEAKERS,
        { multiCharacter: true },
      ),
    ).toEqual([
      { role: "assistant", content: "Aria: greeting" },
      { role: "assistant", content: "Kai: line" },
    ]);
  });

  test('"default" + multiCharacter does NOT prefix an unattributed assistant row', () => {
    expect(applyNamesBehavior([{ role: "assistant", content: "x", authorName: null }], "default", SPEAKERS, { multiCharacter: true })).toEqual([
      { role: "assistant", content: "x" },
    ]);
  });

  test('"content" always prefixes author (falling back to the active speaker)', () => {
    expect(
      applyNamesBehavior(
        [
          { role: "user", content: "u1" },
          { role: "assistant", content: "a1", authorName: "Kai" },
        ],
        "content",
        SPEAKERS,
      ),
    ).toEqual([
      { role: "user", content: "User: u1" },
      { role: "assistant", content: "Kai: a1" },
    ]);
  });

  test('"completion" sets the OpenAI-spec name field when nothing downstream has to merge', () => {
    // `mergesAdjacent: false` — a backend that tolerates adjacent same-role rows. The out-of-band field is
    // the better shape there: the speaker never enters the content bytes.
    expect(applyNamesBehavior([{ role: "user", content: "u1", authorName: "Alt" }], "completion", SPEAKERS, { mergesAdjacent: false })).toEqual([
      { role: "user", content: "u1", name: "Alt" },
    ]);
  });

  test('"completion" INLINES the speaker when the strategy merges (ST pass 1: fold the name, then delete it)', () => {
    // The default — the unset `roleHandlingFloor` clamps to `strict`, so this is what ships. A surviving
    // `name` field would block `squashSameRole` and hand a strict provider the adjacent same-role pair it
    // rejects; it also let a demoted instruction inherit the player's name after a merge. ST folds the name
    // into content and deletes it before squashing for exactly this reason.
    expect(applyNamesBehavior([{ role: "user", content: "u1", authorName: "Alt" }], "completion", SPEAKERS)).toEqual([
      { role: "user", content: "Alt: u1", messageId: undefined },
    ]);
  });
});

describe("applyNamesBehavior — system rows are the operator channel, never labeled", () => {
  const h = [{ role: "system" as const, content: "GM note" }];
  test("every mode passes a system row through untouched (no prefix, no completion name)", () => {
    expect(applyNamesBehavior(h, "content", SPEAKERS)).toEqual([{ role: "system", content: "GM note" }]);
    expect(applyNamesBehavior(h, "completion", SPEAKERS)).toEqual([{ role: "system", content: "GM note" }]);
    expect(applyNamesBehavior(h, "none", SPEAKERS)).toEqual([{ role: "system", content: "GM note" }]);
    expect(applyNamesBehavior(h, "default", SPEAKERS)).toEqual([{ role: "system", content: "GM note" }]);
  });
});
