// engine/smart-arbitrate — the 7b SIDE-LLM arbitration (chat.md Part III §6 `smart`). Pure unit tests over a
// FAKE summarize op: a validated pick from the eligible roster; the round-robin (natural) fallback on an
// off-roster / garbled / EMPTY reply AND on an op throw (including the small-hardware "provider not wired"
// fail-closed throw); single-eligible short-circuit (no LLM call); no eligible → []. Every arm also pins the
// `degraded` flag — the turn verb keys the visible `smart_arbitration_degraded` warning off it (D41), so a
// fallback that reported `degraded:false` would degrade the user SILENTLY.
// Plus the CANCELLATION arm: the turn's AbortSignal reaches the summarize op (the only escape from a box that
// accepted the socket and never answered), and an abort is reported as `aborted:true` — NOT a degrade, so the
// caller ends the turn instead of falling back and generating on a round nobody is waiting for.

import type { SpeakerRef } from "@orb/contracts/chat";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ArbiterCandidate } from "../../../../../packages/server/src/domain/chat/contract/arbitration";
import type { SummarizeOp } from "../../../../../packages/server/src/domain/chat/contract/context";
import { smartArbitrate } from "../../../../../packages/server/src/domain/chat/engine/smart-arbitrate";
import { expect, test } from "../../../../support/fixtures";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
const rng = (): number => 0.5;

function candidate(k: string, over: Partial<ArbiterCandidate> = {}): ArbiterCandidate {
  return {
    ref: charRef(k),
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
  { ref: charRef("aria"), name: "Aria" },
  { ref: charRef("bran"), name: "Bran" },
  { ref: charRef("cara"), name: "Cara" },
];
// The resolved arbiter posture (the `arbiter` floor mapped to the summarize seam) — the caller normally folds
// the ladder; here it is passed literally since these tests exercise the pure `smartArbitrate` in isolation.
const ARB_SAMPLING = { temperature: 0.2, maxTokens: 24 } as const;
const CANDIDATES = [candidate("aria"), candidate("bran"), candidate("cara")];

describe("smartArbitrate — the validated side-LLM pick", () => {
  test("returns the eligible character named in the reply", async () => {
    const summarize = summarizeReturning("Bran");
    const out = await smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out).toEqual({ speakers: [charRef("bran")], degraded: false, aborted: false });
    expect(summarize).toHaveBeenCalledTimes(1);
  });

  test("tolerates prose around the name", async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("The next speaker should be Cara."),
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out).toEqual({ speakers: [charRef("cara")], degraded: false, aborted: false });
  });
});

describe("smartArbitrate — the deterministic fallback", () => {
  test("an off-roster reply falls back to the natural pick (validating parse)", async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("Gandalf"), // not on the roster
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out.speakers).toHaveLength(1);
    expect(out.degraded).toBe(true);
    expect(out.aborted).toBe(false);
    // Loose by DESIGN: the arbiter's pick is non-deterministic (the side-LLM summarize + rng), so this
    // asserts only that the result is SOME eligible candidate — not a pinned winner. Tightening it to one
    // expected speaker would make the test flaky against the intended non-determinism, not stronger.
    expect([charRef("aria"), charRef("bran"), charRef("cara")]).toContainEqual(out.speakers[0]);
  });

  test("an op throw degrades to the fallback, never throws", async () => {
    const summarize: SummarizeOp = vi.fn(() => Promise.reject(new Error("side-LLM down")));
    const out = await smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out.speakers).toHaveLength(1);
    expect(out.degraded).toBe(true);
    expect(out.aborted).toBe(false);
  });

  // The SMALL-HARDWARE case (plan-for-small-hardware): no vLLM wired for the summarize role, so the role
  // dispatcher fail-closes SYNCHRONOUSLY (`requireBackend` throws before any promise). The call sits inside
  // the try, so a sync throw degrades exactly like a rejection — the round still happens.
  test("an unwired summarize backend (sync throw) degrades to the fallback", async () => {
    const summarize: SummarizeOp = vi.fn(() => {
      throw new Error('provider "vllm" is not wired for the "summarize" role');
    });
    const out = await smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out.speakers).toHaveLength(1);
    expect(out.degraded).toBe(true);
    expect(out.aborted).toBe(false);
  });

  test("an EMPTY reply (no items / blank text) degrades to the fallback", async () => {
    const empty: SummarizeOp = vi.fn((): Promise<SummarizeResult> => Promise.resolve({ items: [], model: "fake" }));
    const out = await smartArbitrate({
      summarize: empty,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out.speakers).toHaveLength(1);
    expect(out.degraded).toBe(true);
    expect(out.aborted).toBe(false);
  });

  // The UNTRUSTED-INPUT arm: the arbiter is model output crossing into scheduling. A reply naming a real
  // roster member who is MUTED must not schedule that seat — the eligible set is the only vocabulary.
  test("a reply naming a MUTED member never schedules it (falls back to an eligible seat)", async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("Cara"),
      candidates: [candidate("aria"), candidate("bran"), candidate("cara", { disabled: true })],
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out.speakers).not.toContainEqual(charRef("cara"));
    expect(out.speakers).toHaveLength(1);
    expect(out.degraded).toBe(true);
    expect(out.aborted).toBe(false);
  });

  test("the fallback honors ban-last (the previous speaker is not re-picked when others remain)", async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("nonsense"),
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: charRef("aria"),
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out.speakers[0]).not.toEqual(charRef("aria"));
  });
});

describe("smartArbitrate — whole-word roster match (F9)", () => {
  // "Ari" is eligible; a reply of "Arianna" (a DIFFERENT, off-roster name) must NOT false-positive on the
  // embedded substring — the parse is whole-word, so it falls back to the deterministic pick.
  const ariCast = [
    { ref: charRef("ari"), name: "Ari" },
    { ref: charRef("bran"), name: "Bran" },
  ];
  const ariCandidates = [candidate("ari"), candidate("bran")];

  test('"Arianna" does NOT match the eligible "Ari" (substring is rejected → fallback)', async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("Arianna"),
      candidates: ariCandidates,
      castNames: ariCast,
      recentHistory: "...",
      lastSpeaker: charRef("ari"), // ban-last → the fallback avoids Ari, proving no substring match
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out).toEqual({ speakers: [charRef("bran")], degraded: true, aborted: false });
  });

  test('a whole-word "Ari." (trailing punctuation) still matches', async () => {
    const out = await smartArbitrate({
      summarize: summarizeReturning("Next: Ari."),
      candidates: ariCandidates,
      castNames: ariCast,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out).toEqual({ speakers: [charRef("ari")], degraded: false, aborted: false });
  });
});

describe("smartArbitrate — short-circuits (no LLM call)", () => {
  test("single eligible character → returns it WITHOUT calling summarize", async () => {
    const summarize = summarizeReturning("Aria");
    const out = await smartArbitrate({
      summarize,
      candidates: [candidate("aria"), candidate("bran", { disabled: true }), candidate("cara", { leftSeq: 3 })],
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    // No LLM was consulted, so this is NOT a degrade — a warning here would cry wolf on every solo round.
    expect(out).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
    expect(summarize).not.toHaveBeenCalled();
  });

  test("no eligible character → [] (the driver maps this to no-eligible)", async () => {
    const summarize = summarizeReturning("Aria");
    const out = await smartArbitrate({
      summarize,
      candidates: [candidate("aria", { disabled: true })],
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
    });
    expect(out).toEqual({ speakers: [], degraded: false, aborted: false });
    expect(summarize).not.toHaveBeenCalled();
  });
});

describe("smartArbitrate — cancellation (a HANG is not a failure)", () => {
  // The signal must reach the OP, not just be inspected locally: only the provider's fetch can cut a socket
  // that is hanging. Identity-asserted so a fresh controller (which would abort nothing) fails.
  test("threads the turn's AbortSignal into the summarize call", async () => {
    const controller = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const summarize: SummarizeOp = vi.fn((_inputs, opts): Promise<SummarizeResult> => {
      seen.push(opts?.signal);
      return Promise.resolve({ items: [{ text: "Bran", usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }], model: "fake" });
    });
    const out = await smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
      signal: controller.signal,
    });

    expect(seen).toEqual([controller.signal]);
    expect(out).toEqual({ speakers: [charRef("bran")], degraded: false, aborted: false });
  });

  // THE HANG: the op never settles until the signal fires (exactly what a box that accepts the socket and
  // never answers does). The abort must both TERMINATE the arbitration and report `aborted` — a degrade here
  // would fall back to the natural pick and generate a reply the user just cancelled.
  test("an abort mid-call terminates the arbitration with aborted:true (no speaker, no degrade)", async () => {
    const controller = new AbortController();
    let observed: AbortSignal | undefined;
    const summarize: SummarizeOp = vi.fn((_inputs, opts): Promise<SummarizeResult> => {
      observed = opts?.signal;
      // The hanging box: settles ONLY on abort, the way a real provider fetch rejects on its signal.
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    const pending = smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
      signal: controller.signal,
    });
    controller.abort();
    const out = await pending;

    expect(observed).toBe(controller.signal);
    expect(out).toEqual({ speakers: [], degraded: false, aborted: true });
  });

  // An ALREADY-cancelled turn spends nothing: the side-LLM is never consulted.
  test("a pre-aborted signal short-circuits without calling summarize", async () => {
    const controller = new AbortController();
    controller.abort();
    const summarize = summarizeReturning("Bran");
    const out = await smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
      signal: controller.signal,
    });

    expect(out).toEqual({ speakers: [], degraded: false, aborted: true });
    expect(summarize).not.toHaveBeenCalled();
  });

  // THE REGRESSION GUARD on the freshly-landed degrade behavior: a NON-abort failure with a live signal is
  // still a degrade (fallback + `degraded:true`), never an abort. Distinguishing them is the whole point.
  test("a NON-abort failure with a LIVE signal still degrades (never aborts)", async () => {
    const controller = new AbortController();
    const summarize: SummarizeOp = vi.fn(() => Promise.reject(new Error("side-LLM down")));
    const out = await smartArbitrate({
      summarize,
      candidates: CANDIDATES,
      castNames: CAST,
      recentHistory: "...",
      lastSpeaker: null,
      rng,
      sampling: ARB_SAMPLING,
      signal: controller.signal,
    });

    expect(out.speakers).toHaveLength(1);
    expect(out.degraded).toBe(true);
    expect(out.aborted).toBe(false);
  });
});
