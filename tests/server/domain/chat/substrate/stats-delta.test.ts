// engine/stats-delta — the StatsDelta builders (the same kit/stats-tally primitives as reconcile → no drift).

import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { utcDay, wordCount } from "@orb/kit/stats-tally";
import { describe } from "vitest";
import { assistantTurnDelta, canonMessageDelta, userMessageDelta } from "../../../../../packages/server/src/domain/chat/substrate/stats-delta.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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
    expect(d.model).toBe("opus");
    expect(d.modelGenerations).toBe(1);
    expect(d.modelTokensIn).toBe(5);
  });

  // F8: `modelGenSamples` is gated on a present gen time — symmetric with the delete mirror. The engine
  // add-path supplies no `genTimeMs` (nor persisted gen bounds), so a `1` here inflated the counter (add +1
  // / delete −0) and diluted the gen-time average vs a rebuild.
  test("modelGenSamples is 0 when no gen time is present (add/delete symmetry)", () => {
    const add = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi", model: "opus", provider: "anthropic", tokensIn: 5, tokensOut: 9 },
      now: NOW,
    });
    expect(add.modelGenerations).toBe(1);
    expect(add.modelGenSamples).toBe(0);
    // The delete mirror over the SAME row (no persisted gen bounds) also yields 0 → no net drift.
    const del = canonMessageDelta({
      ownerId: OWNER,
      sign: -1,
      now: NOW,
      row: {
        characterId: ARIA,
        role: "assistant",
        createdAt: NOW,
        content: "hi",
        tokensIn: 5,
        tokensOut: 9,
        costUsd: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        contextWindow: null,
        genStartedAt: null,
        genFinishedAt: null,
        model: "opus",
        provider: "anthropic",
        reasoning: null,
        metadata: null,
        selectedIdx: null,
        variantCount: 1,
      },
    });
    expect(del.modelGenSamples).toBe(0);
    expect((add.modelGenSamples ?? 0) + (del.modelGenSamples ?? 0)).toBe(0);
  });

  test("modelGenSamples is 1 when a gen time IS present", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi", model: "opus", provider: "anthropic", genTimeMs: 1200 },
      now: NOW,
    });
    expect(d.modelGenSamples).toBe(1);
    expect(d.modelGenTimeMs).toBe(1200);
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

  test("an AGENT turn (characterId null) attributes to the HOST owner + skips character_stats (D60, doc 02 §4)", () => {
    // An agent-authored assistant row is host-funded (ownerId = runAsUserId, unchanged) but carries NO
    // characterId — so the owner/day/model grains credit the host while character_stats is skipped (apply
    // no-ops the char row on a null characterId). This is the LIVE twin of reconcile's `foldMessage` null-cid
    // skip — the drift-gate mirror.
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: null,
      economics: {
        content: "on my own",
        model: "opus",
        provider: "anthropic",
        tokensIn: 5,
        tokensOut: 9,
      },
      now: NOW,
    });
    expect(d.ownerId).toBe(OWNER); // the HOST funds it (D19)
    expect(d.characterId).toBeNull(); // no character_stats row
    expect(d.assistantTurns).toBe(1); // the owner still counts the turn
    expect(d.assistantWords).toBe(wordCount("on my own"));
    expect(d.model).toBe("opus"); // the host's box ran the model → model_stats still credited
    expect(d.modelGenerations).toBe(1);
  });

  test("reasoning present → reasoningGenerations counted (owner/char AND model grains)", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi", model: "opus", provider: "anthropic", reasoning: "thinking" },
      now: NOW,
    });
    expect(d.reasoningGenerations).toBe(1);
    // The MODEL grain must credit it too (apply-delta feeds `model_stats.reasoningGenerations` from
    // `modelReasoningGenerations`) — omitting it drifted the model row vs a reconcile on a reasoning turn.
    expect(d.modelReasoningGenerations).toBe(1);
  });

  test("whitespace-only reasoning → model reasoning NOT credited (trim predicate, matches the rebuild)", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi", model: "opus", provider: "anthropic", reasoning: "  \n  " },
      now: NOW,
    });
    expect(d.modelReasoningGenerations).toBeUndefined();
  });

  // F7: a WHITESPACE-ONLY reasoning trace (an empty thinking block with a newline) is NOT a generation — the
  // rebuild + every sibling builder gate on `trim().length > 0`. A bare `.length > 0` over-counted vs reconcile.
  test("whitespace-only reasoning → NOT counted (trim predicate, matches the rebuild)", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi", reasoning: "  \n  " },
      now: NOW,
    });
    expect(d.reasoningGenerations).toBeUndefined();
  });

  // F6: the context window → `owner_stats.maxContextTokens` (a MAX extremum, owner grain). The engine persists
  // `contextWindow` on every variant; the live turn delta MUST carry it or the column stays NULL until a
  // reconcile. The delete mirror (`canonMessageDelta`) already carries it — so the two agree on the max.
  test("contextWindow → maxContextTokens on the live turn delta", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi", contextWindow: 128_000 },
      now: NOW,
    });
    expect(d.maxContextTokens).toBe(128_000);
  });

  test("absent contextWindow → no maxContextTokens (sparse patch)", () => {
    const d = assistantTurnDelta({
      ownerId: OWNER,
      characterId: ARIA,
      economics: { content: "hi" },
      now: NOW,
    });
    expect(d.maxContextTokens).toBeUndefined();
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
