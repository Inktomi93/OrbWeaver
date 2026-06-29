// SHAPE shaper: applyNamesBehavior (chat.md Part II §3 rule 5 — the trusted out-of-band Name: label).
import { describe, expect, test } from "vitest";
import { applyNamesBehavior } from "../../../../../packages/server/src/domain/chat/assembly/names";

const SPEAKERS = { user: "User", assistant: "Aria" };

describe("applyNamesBehavior", () => {
  test('"none" strips names + drops authorName/name fields', () => {
    expect(
      applyNamesBehavior(
        [{ role: "user", content: "u1", authorName: "OldPersona" }],
        "none",
        SPEAKERS,
      ),
    ).toEqual([{ role: "user", content: "u1" }]);
  });

  test('"default" solo prefixes nothing → byte-identical (Part III §12 inv 1)', () => {
    const h = [
      { role: "assistant" as const, content: "greeting", authorName: "Aria" },
      { role: "user" as const, content: "u1", authorName: "User" },
    ];
    expect(applyNamesBehavior(h, "default", SPEAKERS, false)).toEqual([
      { role: "assistant", content: "greeting" },
      { role: "user", content: "u1" },
    ]);
  });

  test('"default" prefixes a user turn authored under a since-switched persona', () => {
    expect(
      applyNamesBehavior(
        [{ role: "user", content: "hi", authorName: "Alt" }],
        "default",
        SPEAKERS,
        false,
      ),
    ).toEqual([{ role: "user", content: "Alt: hi" }]);
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
        true,
      ),
    ).toEqual([
      { role: "assistant", content: "Aria: greeting" },
      { role: "assistant", content: "Kai: line" },
    ]);
  });

  test('"default" + multiCharacter does NOT prefix an unattributed assistant row', () => {
    expect(
      applyNamesBehavior(
        [{ role: "assistant", content: "x", authorName: null }],
        "default",
        SPEAKERS,
        true,
      ),
    ).toEqual([{ role: "assistant", content: "x" }]);
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

  test('"completion" sets the OpenAI-spec name field; content untouched', () => {
    expect(
      applyNamesBehavior(
        [{ role: "user", content: "u1", authorName: "Alt" }],
        "completion",
        SPEAKERS,
      ),
    ).toEqual([{ role: "user", content: "u1", name: "Alt" }]);
  });
});
