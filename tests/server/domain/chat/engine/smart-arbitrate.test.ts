// engine/smart-arbitrate — Smart's Utility-model pick over a FAKE summarize op. Pins what the model is told (the
// human players, one capped line per candidate, how often each spoke, talkativeness, the scene, a clipped
// history with the last line whole), the short-circuits that spend no call (a lone eligible character, names in
// the last line), the roster-validating parse (comma list or JSON array, unknown names ignored, the cap), and the
// `natural` fallback with `degraded:true` the turn verb turns into a warning (D41). Plus CANCELLATION: the turn's
// AbortSignal reaches the op, and an abort is `aborted:true`, never a degrade.

import type { AssemblePersona, SpeakerRef } from "@orb/contracts/chat";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ArbiterCandidate, TranscriptLine } from "../../../../../packages/server/src/domain/chat/contract/arbitration.ts";
import { smartArbitrate } from "../../../../../packages/server/src/domain/chat/engine/smart-arbitrate.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });

function candidate(k: string, over: Partial<ArbiterCandidate> = {}): ArbiterCandidate {
  return {
    ref: charRef(k),
    talkativeness: over.talkativeness ?? 0.5,
    disabled: over.disabled ?? false,
    leftSeq: over.leftSeq ?? null,
  };
}

/** A scripted summarize op returning `text` as the single item. */
function summarizeReturning(text: string): RoleClientsWithSignal["summarize"] {
  return vi.fn(
    (): Promise<SummarizeResult> =>
      Promise.resolve({
        items: [{ text, usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }],
        model: "fake",
      }),
  );
}

/** The user prompt the op was handed on its one call. */
function promptOf(summarize: RoleClientsWithSignal["summarize"]): string {
  const calls = vi.mocked(summarize).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0]?.[0][0]?.userPrompt ?? "";
}

const SPEAKER_CANDIDATES = [
  { ref: charRef("aria"), name: "Aria" },
  { ref: charRef("bran"), name: "Bran" },
  { ref: charRef("cara"), name: "Cara" },
  { ref: charRef("dov"), name: "Dov" },
];
// The resolved arbiter posture, passed literally since these tests exercise the pure `smartArbitrate`.
const ARB_SAMPLING = { temperature: 0.2, maxOutputTokens: 24 } as const;
const CANDIDATES = [candidate("aria"), candidate("bran"), candidate("cara")];
const persona = (name: string): AssemblePersona => ({ name, description: "" });
const human = (name: string, text: string): TranscriptLine => ({ speakerName: name, text, characterId: null });
const said = (k: string, text: string): TranscriptLine => ({
  speakerName: SPEAKER_CANDIDATES.find((s) => s.ref.characterId === cid(k))?.name ?? k,
  text,
  characterId: cid(k),
});

function arbitrate(
  over: Partial<Parameters<typeof smartArbitrate>[0]> & Pick<Parameters<typeof smartArbitrate>[0], "summarize">,
): ReturnType<typeof smartArbitrate> {
  return smartArbitrate({
    candidates: CANDIDATES,
    speakerCandidates: SPEAKER_CANDIDATES,
    characterLines: new Map<CharacterId, string>(),
    transcript: [human("Sam", "what now?")],
    room: {},
    lastSpeaker: null,
    rng: () => 0.5,
    sampling: ARB_SAMPLING,
    prose: {},
    ...over,
  });
}

describe("smartArbitrate — what the model is told", () => {
  test("the prompt names the human players and never offers them as candidates", async () => {
    const summarize = summarizeReturning("Bran");
    await arbitrate({
      summarize,
      room: { activePersona: persona("Sam"), people: [persona("Jun")] },
      transcript: [human("Rowan", "Anyone?"), said("aria", "Here."), human("Sam", "Bran, the map?")],
      candidates: [candidate("aria"), candidate("bran")],
      // The line names Bran by NAME, which would short-circuit; this pin is about the prompt, so make it ambiguous.
      speakerCandidates: [
        { ref: charRef("aria"), name: "Aria Bran" },
        { ref: charRef("bran"), name: "Bran" },
      ],
    });
    const prompt = promptOf(summarize);
    expect(prompt).toContain("Human players (never choose them): Sam, Jun, Rowan\n");
    const candidates = prompt.slice(prompt.indexOf("Candidates:"), prompt.indexOf("Recent conversation:"));
    expect(candidates).not.toMatch(/Sam|Jun|Rowan/u);
  });

  test("a reply naming a human player schedules nobody from it (falls back, loudly)", async () => {
    const out = await arbitrate({ summarize: summarizeReturning("Sam"), room: { activePersona: persona("Sam") } });
    expect(out.degraded).toBe(true);
    expect(out.speakers).toHaveLength(1);
  });

  test("each candidate carries its shared line, capped; a blank line leaves the name alone", async () => {
    const summarize = summarizeReturning("Aria");
    const long = `Aria keeps the lighthouse. ${"She remembers every ship that ever passed the point. ".repeat(20)}`;
    await arbitrate({ summarize, characterLines: new Map([[cid("aria"), long]]) });
    const prompt = promptOf(summarize);
    const ariaRow = prompt.split("\n").find((l) => l.startsWith("- Aria: ")) ?? "";
    expect(ariaRow).toContain("Aria keeps the lighthouse.");
    expect(ariaRow.length).toBeLessThan(long.length / 4);
    expect(prompt).toMatch(/^- Bran \(spoke/mu);
  });

  test("speaking counts over the window and the last speaker; replying to its OWN line is banned", async () => {
    const summarize = summarizeReturning("Bran");
    await arbitrate({
      summarize,
      transcript: [said("aria", "One."), said("bran", "Two."), human("Sam", "and?"), said("aria", "Three.")],
      lastSpeaker: charRef("aria"),
    });
    const prompt = promptOf(summarize);
    expect(prompt).toContain("- Bran (spoke 1 of the last 4 lines,");
    expect(prompt).toContain("- Cara (spoke 0 of the last 4 lines,");
    expect(prompt).not.toMatch(/^- Aria/mu);
    expect(prompt).toContain("Spoke last: Aria");
  });

  test("after a human line the last speaker stays a candidate: they are often exactly who was asked", async () => {
    const summarize = summarizeReturning("Aria");
    const out = await arbitrate({
      summarize,
      transcript: [said("aria", "The coffee is new."), human("Sam", "why does it taste different?")],
      lastSpeaker: charRef("aria"),
    });
    expect(promptOf(summarize)).toContain("- Aria (spoke 1 of the last 2 lines,");
    expect(out).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
  });

  test("ban-last lifts when the room allows self-responses: the last speaker stays a candidate", async () => {
    const summarize = summarizeReturning("Aria");
    const out = await arbitrate({ summarize, transcript: [said("aria", "One."), said("aria", "Two.")], lastSpeaker: charRef("aria"), banLast: false });
    expect(promptOf(summarize)).toContain("- Aria (spoke 2 of the last 2 lines,");
    expect(out).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
  });

  test("talkativeness reads as the Group tab's percent", async () => {
    const summarize = summarizeReturning("Aria");
    await arbitrate({ summarize, candidates: [candidate("aria", { talkativeness: 0.25 }), candidate("bran", { talkativeness: 1 })] });
    const prompt = promptOf(summarize);
    expect(prompt).toMatch(/^- Aria \(.*talkativeness 25%\)$/mu);
    expect(prompt).toMatch(/^- Bran \(.*talkativeness 100%\)$/mu);
  });

  test("the scene line is the game's location and time, else the room's scenario, else absent", async () => {
    const game = summarizeReturning("Aria");
    await arbitrate({
      summarize: game,
      room: {
        rpgMacros: { rpgSceneState: "Scene: The old mill · day 3 · dusk · rain\nStory: Act 1\nPresent: the miller" },
        roomOverrides: { scenario: "ignored" },
      },
    });
    expect(promptOf(game)).toMatch(/^Scene: The old mill · day 3 · dusk · rain$/mu);

    const plain = summarizeReturning("Aria");
    await arbitrate({ summarize: plain, room: { roomOverrides: { scenario: "A storm traps everyone in the inn." } } });
    expect(promptOf(plain)).toMatch(/^Scene: A storm traps everyone in the inn\.$/mu);

    const bare = summarizeReturning("Aria");
    await arbitrate({ summarize: bare, room: { rpgMacros: { rpgSceneState: "Story: Act 1" } } });
    expect(promptOf(bare)).not.toContain("Scene:");
  });

  test("history keeps the last line whole and clips every older line", async () => {
    const summarize = summarizeReturning("Aria");
    const older = `Old ${"x".repeat(2000)}`;
    const latest = `New ${"y".repeat(2000)}`;
    await arbitrate({ summarize, transcript: [said("bran", older), human("Sam", latest)] });
    const prompt = promptOf(summarize);
    const olderRow = prompt.split("\n").find((l) => l.startsWith("Bran: Old")) ?? "";
    expect(olderRow.endsWith("…")).toBe(true);
    expect(olderRow.length).toBeLessThan(400);
    expect(prompt).toContain(`Sam: ${latest}`);
  });
});

describe("smartArbitrate — the roster-validating parse", () => {
  const four = [...CANDIDATES, candidate("dov")];

  test("a comma list keeps the model's order; a JSON array works the same", async () => {
    expect((await arbitrate({ summarize: summarizeReturning("Cara, Aria") })).speakers).toEqual([charRef("cara"), charRef("aria")]);
    expect((await arbitrate({ summarize: summarizeReturning('["bran", "Cara"]') })).speakers).toEqual([charRef("bran"), charRef("cara")]);
  });

  test("an id resolves like a name; unknown and repeated names are ignored", async () => {
    const out = await arbitrate({ summarize: summarizeReturning(`Gandalf, ${cid("bran")}, bran, Aria`) });
    expect(out).toEqual({ speakers: [charRef("bran"), charRef("aria")], degraded: false, aborted: false });
  });

  test("the responder cap holds however many the model names", async () => {
    const out = await arbitrate({ summarize: summarizeReturning("Aria, Bran, Cara, Dov"), candidates: four });
    expect(out.speakers).toEqual([charRef("aria"), charRef("bran"), charRef("cara")]);
  });

  test("tolerates prose around a name", async () => {
    expect(await arbitrate({ summarize: summarizeReturning("The next speaker should be Cara.") })).toEqual({
      speakers: [charRef("cara")],
      degraded: false,
      aborted: false,
    });
  });
});

// #1439 — the whole-word test is the shared Unicode-aware `includesWholeName`: a short Cyrillic/CJK name inside a
// longer word is no hit, so the arbiter never schedules a speaker the model did not name.
describe("smartArbitrate — the parse is Unicode-aware", () => {
  const uniSpeakers = [
    { ref: charRef("cyr"), name: "Аня" },
    { ref: charRef("cjk"), name: "結衣" },
  ];

  async function pick(text: string): Promise<SpeakerRef | undefined> {
    const out = await arbitrate({ summarize: summarizeReturning(text), candidates: [candidate("cyr"), candidate("cjk")], speakerCandidates: uniSpeakers });
    return out.degraded ? undefined : out.speakers[0];
  }

  test("a Unicode name named on its own is the validated pick", async () => {
    await expect(pick("Аня")).resolves.toEqual(charRef("cyr"));
    await expect(pick("結衣")).resolves.toEqual(charRef("cjk"));
  });

  test("the SAME name buried inside a longer Unicode word is NOT a hit (it degrades instead)", async () => {
    await expect(pick("Анятолия")).resolves.toBeUndefined();
  });
});

describe("smartArbitrate — whole-word roster match (F9)", () => {
  const ariSpeakers = [
    { ref: charRef("ari"), name: "Ari" },
    { ref: charRef("bran"), name: "Bran" },
  ];
  const ariCandidates = [candidate("ari"), candidate("bran")];

  test('"Arianna" does NOT match the eligible "Ari" (substring is rejected → fallback)', async () => {
    const out = await arbitrate({
      summarize: summarizeReturning("Arianna"),
      candidates: ariCandidates,
      speakerCandidates: ariSpeakers,
      // ban-last → the fallback avoids Ari, proving no substring match
      lastSpeaker: charRef("ari"),
      banLast: true,
      transcript: [said("ari", "Hm.")],
    });
    expect(out).toEqual({ speakers: [charRef("bran")], degraded: true, aborted: false });
  });

  test('a whole-word "Ari." (trailing punctuation) still matches', async () => {
    const out = await arbitrate({ summarize: summarizeReturning("Next: Ari."), candidates: ariCandidates, speakerCandidates: ariSpeakers });
    expect(out).toEqual({ speakers: [charRef("ari")], degraded: false, aborted: false });
  });
});

describe("smartArbitrate — the deterministic fallback", () => {
  test("an off-roster reply falls back to the natural pick, flagged degraded", async () => {
    const out = await arbitrate({ summarize: summarizeReturning("Gandalf") });
    expect(out.speakers).toHaveLength(1);
    expect(out.degraded).toBe(true);
    expect(out.aborted).toBe(false);
    expect([charRef("aria"), charRef("bran"), charRef("cara")]).toContainEqual(out.speakers[0]);
  });

  test("the fallback answers the character the human named: a word mention leads the natural pick", async () => {
    const out = await arbitrate({ summarize: summarizeReturning("Gandalf"), mentionedIds: [cid("cara")] });
    expect(out).toEqual({ speakers: [charRef("cara")], degraded: true, aborted: false });
  });

  test("an op throw, a synchronous unwired throw, and an EMPTY or blank reply all degrade, never throw", async () => {
    const replies: RoleClientsWithSignal["summarize"][] = [
      vi.fn(() => Promise.reject(new Error("side-LLM down"))),
      vi.fn(() => {
        throw new Error('provider "vllm" is not wired for the "summarize" role');
      }),
      vi.fn((): Promise<SummarizeResult> => Promise.resolve({ items: [], model: "fake" })),
      summarizeReturning("   "),
      summarizeReturning("[}"),
    ];
    for (const summarize of replies) {
      const out = await arbitrate({ summarize });
      expect(out.speakers).toHaveLength(1);
      expect(out).toMatchObject({ degraded: true, aborted: false });
    }
  });

  // The UNTRUSTED-INPUT arm: model output crossing into scheduling. A muted member is not on the roster it may name.
  test("a reply naming a MUTED member never schedules it (falls back to an eligible seat)", async () => {
    const out = await arbitrate({
      summarize: summarizeReturning("Cara"),
      candidates: [candidate("aria"), candidate("bran"), candidate("cara", { disabled: true })],
    });
    expect(out.speakers).not.toContainEqual(charRef("cara"));
    expect(out).toMatchObject({ degraded: true, aborted: false });
  });

  test("the fallback honors ban-last (the previous speaker is not re-picked when others remain)", async () => {
    const out = await arbitrate({ summarize: summarizeReturning("nonsense"), lastSpeaker: charRef("aria") });
    expect(out.speakers[0]).not.toEqual(charRef("aria"));
  });
});

describe("smartArbitrate — short-circuits (no model call)", () => {
  test("single eligible character → returns it WITHOUT calling summarize, and nothing degraded", async () => {
    const summarize = summarizeReturning("Aria");
    const out = await arbitrate({ summarize, candidates: [candidate("aria"), candidate("bran", { disabled: true }), candidate("cara", { leftSeq: 3 })] });
    expect(out).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
    expect(summarize).not.toHaveBeenCalled();
  });

  test("no eligible character → [] (the driver maps this to no-eligible)", async () => {
    const summarize = summarizeReturning("Aria");
    expect(await arbitrate({ summarize, candidates: [candidate("aria", { disabled: true })] })).toEqual({ speakers: [], degraded: false, aborted: false });
    expect(summarize).not.toHaveBeenCalled();
  });

  test("characters the last line names answer in mention order, whoever wrote it, even the last speaker", async () => {
    const summarize = summarizeReturning("Aria");
    const byHuman = await arbitrate({ summarize, transcript: [human("Sam", "Cara?")] });
    expect(byHuman).toEqual({ speakers: [charRef("cara")], degraded: false, aborted: false });
    const byCharacter = await arbitrate({ summarize, transcript: [said("aria", "Cara, then Bran: report.")], lastSpeaker: charRef("bran") });
    expect(byCharacter.speakers).toEqual([charRef("cara"), charRef("bran")]);
    expect(summarize).not.toHaveBeenCalled();
  });

  test("a muted mention is dropped; a line naming only muted characters asks the model as if none was named", async () => {
    const summarize = summarizeReturning("Aria");
    const roster = [candidate("aria"), candidate("bran"), candidate("cara", { disabled: true })];
    const mixed = await arbitrate({ summarize, candidates: roster, transcript: [human("Sam", "Cara and Bran, look!")] });
    expect(mixed.speakers).toEqual([charRef("bran")]);
    expect(summarize).not.toHaveBeenCalled();

    const mutedOnly = await arbitrate({ summarize, candidates: roster, transcript: [human("Sam", "Cara, look!")] });
    expect(mutedOnly).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
    expect(summarize).toHaveBeenCalledTimes(1);
  });
});

describe("smartArbitrate — cancellation (a HANG is not a failure)", () => {
  // Identity-asserted so a fresh controller (which would abort nothing) fails.
  test("threads the turn's AbortSignal into the summarize call", async () => {
    const controller = new AbortController();
    const seen: (AbortSignal | undefined)[] = [];
    const summarize: RoleClientsWithSignal["summarize"] = vi.fn((_inputs, opts): Promise<SummarizeResult> => {
      seen.push(opts?.signal);
      return Promise.resolve({ items: [{ text: "Bran", usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }], model: "fake" });
    });
    const out = await arbitrate({ summarize, signal: controller.signal });
    expect(seen).toEqual([controller.signal]);
    expect(out).toEqual({ speakers: [charRef("bran")], degraded: false, aborted: false });
  });

  // THE HANG: the op settles only when the signal fires. A degrade here would generate a reply the user cancelled.
  test("an abort mid-call terminates the arbitration with aborted:true (no speaker, no degrade)", async () => {
    const controller = new AbortController();
    let observed: AbortSignal | undefined;
    const summarize: RoleClientsWithSignal["summarize"] = vi.fn((_inputs, opts): Promise<SummarizeResult> => {
      observed = opts?.signal;
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    });
    const pending = arbitrate({ summarize, signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ speakers: [], degraded: false, aborted: true });
    expect(observed).toBe(controller.signal);
  });

  test("a pre-aborted signal short-circuits without calling summarize, even when the last line names someone", async () => {
    const summarize = summarizeReturning("Bran");
    const out = await arbitrate({ summarize, signal: AbortSignal.abort(), transcript: [human("Sam", "Cara?")] });
    expect(out).toEqual({ speakers: [], degraded: false, aborted: true });
    expect(summarize).not.toHaveBeenCalled();
  });

  test("a NON-abort failure with a LIVE signal still degrades (never aborts)", async () => {
    const out = await arbitrate({ summarize: vi.fn(() => Promise.reject(new Error("side-LLM down"))), signal: new AbortController().signal });
    expect(out).toMatchObject({ degraded: true, aborted: false });
  });
});

// PROSE-1 census 75 — the arbiter prompt is a per-USER slot resolved against the ROOM HOST.
describe("the arbiter prompt is a prose slot", () => {
  test("no override ⇒ the shipped default rides the summarize call", async () => {
    const summarize = summarizeReturning("Bran");
    await arbitrate({ summarize });
    expect(summarize).toHaveBeenCalledWith([{ systemPrompt: PROSE_SLOTS["chat.arbiter.system"].text, userPrompt: expect.any(String) }], expect.anything());
  });

  test("a host override REPLACES the arbiter prompt on the wire", async () => {
    const summarize = summarizeReturning("Bran");
    await arbitrate({ summarize, prose: { "chat.arbiter.system": { text: "Pick whoever is angriest.", baseVersion: 1 } } });
    expect(summarize).toHaveBeenCalledWith([{ systemPrompt: "Pick whoever is angriest.", userPrompt: expect.any(String) }], expect.anything());
  });
});
