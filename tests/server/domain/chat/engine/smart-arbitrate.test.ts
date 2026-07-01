// engine/smart-arbitrate — the 7b SIDE-LLM arbitration (chat.md Part III §6 `smart`). Pure unit tests over a
// FAKE summarize op: a validated pick from the eligible roster; the round-robin (natural) fallback on an
// off-roster / garbled reply AND on an op throw; single-eligible short-circuit (no LLM call); no eligible → [].

import type { SummarizeResult } from "@orb/contracts/providers";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ArbiterCandidate } from "../../../../../packages/server/src/domain/chat/contract/arbitration";
import type { SummarizeOp } from "../../../../../packages/server/src/domain/chat/contract/context";
import { smartArbitrate } from "../../../../../packages/server/src/domain/chat/engine/smart-arbitrate";
import { expect, test } from "../../../../support/fixtures";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const rng = (): number => 0.5;

function candidate(k: string, over: Partial<ArbiterCandidate> = {}): ArbiterCandidate {
  return {
    characterId: cid(k),
    talkativeness: over.talkativeness ?? 0.5,
    disabled: over.disabled ?? false,
    leftSeq: over.leftSeq ?? null,
  };
}

/** A scripted summarize op returning `text` as the single item. */
function summarizeReturning(text: string): SummarizeOp {
  return vi.fn(
    (): Promise<SummarizeResult> =>
      Promise.resolve({
        items: [{ text, usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }],
        model: "fake",
      }),
  );
}

const CAST = [
  { characterId: cid("aria"), name: "Aria" },
  { characterId: cid("bran"), name: "Bran" },
  { characterId: cid("cara"), name: "Cara" },
];
const CANDIDATES = [candidate("aria"), candidate("bran"), candidate("cara")];

describe("smartArbitrate — the validated side-LLM pick", () => {
  test("returns the eligible character named in the reply", async () => {
    const summarize = summarizeReturning("Bran");
    const out = await smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeakerId: null,
      rng,
    });
    expect(out).toEqual([cid("bran")]);
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  test("tolerates prose around the name", async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("The next speaker should be Cara."),
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeakerId: null,
      rng,
    });
    expect(out).toEqual([cid("cara")]);
  });
});

describe("smartArbitrate — the deterministic fallback", () => {
  test("an off-roster reply falls back to the natural pick (validating parse)", async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("Gandalf"), // not on the roster
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeakerId: null,
      rng,
    });
    expect(out).toHaveLength(1);
    expect([cid("aria"), cid("bran"), cid("cara")]).toContainEqual(out[0]);
  });

  test("an op throw degrades to the fallback, never throws", async () => {
    const summarize: SummarizeOp = vi.fn(() => Promise.reject(new Error("side-LLM down")));
    const out = await smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeakerId: null,
      rng,
    });
    expect(out).toHaveLength(1);
  });

  test("the fallback honors ban-last (the previous speaker is not re-picked when others remain)", async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("nonsense"),
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeakerId: cid("aria"),
      rng,
    });
    expect(out[0]).not.toBe(cid("aria"));
  });
});

describe("smartArbitrate — short-circuits (no LLM call)", () => {
  test("single eligible character → returns it WITHOUT calling summarize", async () => {
    const summarize = summarizeReturning("Aria");
    const out = await smartArbitrate({
      summarize,
      candidates: [
        candidate("aria"),
        candidate("bran", { disabled: true }),
        candidate("cara", { leftSeq: 3 }),
      ],
      castNames: CAST,
      recentHistory: "...",
      lastSpeakerId: null,
      rng,
    });
    expect(out).toEqual([cid("aria")]);
    expect(summarize).not.toHaveBeenCalled();
  });

  test("no eligible character → [] (the driver maps this to no-eligible)", async () => {
    const summarize = summarizeReturning("Aria");
    const out = await smartArbitrate({
      summarize,
      candidates: [candidate("aria", { disabled: true })],
      castNames: CAST,
      recentHistory: "...",
      lastSpeakerId: null,
      rng,
    });
    expect(out).toEqual([]);
    expect(summarize).not.toHaveBeenCalled();
  });
});
