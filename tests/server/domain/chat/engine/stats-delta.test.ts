// engine/stats-delta — the StatsDelta builders (the same kit/stats-tally primitives as reconcile → no drift).

import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { utcDay, wordCount } from "@orb/kit/stats-tally";
import { describe } from "vitest";
import {
  assistantTurnDelta,
  userMessageDelta,
} from "../../../../../packages/server/src/domain/chat/engine/stats-delta";
import { expect, test } from "../../../../support/fixtures";

const OWNER = castId<UserId>("user_host");
const ARIA = castId<CharacterId>("character_aria");
const NOW = 1_750_000_000_000;

describe("assistantTurnDelta", () => {
  test("owner-attributed, one assistant turn, words via the shared tally", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: {
        content: "two words",
        model: "opus",
        provider: "anthropic",
        tokensIn: 5,
        tokensOut: 9,
      },
      now: NOW,
    });
    expect(d.ownerId).toBe(OWNER);
    expect(d.characterId).toBe(ARIA);
    expect(d.day).toBe(utcDay(NOW));
    expect(d.assistantTurns).toBe(1);
    expect(d.assistantWords).toBe(wordCount("two words"));
    expect(d.tokensIn).toBe(5);
    expect(d.tokensOut).toBe(9);
    // DAILY slice is decoupled but credited for the message stream.
    expect(d.dailyTokensIn).toBe(5);
    // MODEL slice present (model set).
    expect(d.model).toBe("opus");
    expect(d.modelGenerations).toBe(1);
    expect(d.modelTokensIn).toBe(5);
  });

  test("no model → no model slice (apply skips model_stats)", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi" },
      now: NOW,
    });
    expect(d.model).toBeNull();
    expect(d.modelGenerations).toBeUndefined();
    expect(d.modelTokensIn).toBeUndefined();
  });

  test("reasoning present → reasoningGenerations counted", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi", reasoning: "thinking" },
      now: NOW,
    });
    expect(d.reasoningGenerations).toBe(1);
  });

  test("absent economics stay absent (sparse patch — never a fabricated zero)", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi" },
      now: NOW,
    });
    expect(d.tokensIn).toBeUndefined();
    expect(d.costUsd).toBeUndefined();
    expect(d.reasoningGenerations).toBeUndefined();
  });
});

describe("userMessageDelta", () => {
  test("one user turn, words via the tally, no model", () => {
    const d = userMessageDelta({
      ownerId: OWNER,
      characterId: ARIA,
      content: "hello there",
      now: NOW,
    });
    expect(d.userTurns).toBe(1);
    expect(d.userWords).toBe(wordCount("hello there"));
    expect(d.model).toBeNull();
    expect(d.day).toBe(utcDay(NOW));
  });
});
