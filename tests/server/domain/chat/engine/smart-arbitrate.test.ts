// engine/smart-arbitrate — Smart's Utility-model pick over a FAKE structured arbiter. Pins what the model is told
// (the human players, one capped line per candidate, how often each spoke, talkativeness, the scene, a clipped
// history with the last line whole), the response schema (an enum of the round's candidate names only, within every
// wire's limits), the short-circuits that spend no call (a lone eligible character, names in the last line), how a
// payload maps to refs, and the `natural` fallback with `degraded:true` the turn verb turns into a warning (D41).
// Plus CANCELLATION: the turn's AbortSignal reaches the call, and an abort is `aborted:true`, never a degrade.

import type { SpeakerRef } from "@orb/contracts/chat";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ArbiterCandidate, SpeakerArbiter, TranscriptLine } from "../../../../../packages/server/src/domain/chat/contract/arbitration.ts";
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

const replyOf = (text: string): SummarizeResult => ({ items: [{ text, usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }], model: "fake" });

/** A structured arbiter whose every call answers `payload` (a `{responders}` object, or raw text for a broken
 *  backend). */
function arbiterAnswering(payload: unknown): SpeakerArbiter["structured"] {
  return vi.fn((): Promise<SummarizeResult> => Promise.resolve(replyOf(typeof payload === "string" ? payload : JSON.stringify(payload))));
}

const bound =
  (structured: SpeakerArbiter["structured"]): (() => Promise<SpeakerArbiter>) =>
  (): Promise<SpeakerArbiter> =>
    Promise.resolve({ structured });

/** The one call's arguments. */
function callOf(structured: SpeakerArbiter["structured"]): Parameters<SpeakerArbiter["structured"]> {
  const calls = vi.mocked(structured).mock.calls;
  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) {
    throw new Error("no call");
  }
  return call;
}

const promptOf = (structured: SpeakerArbiter["structured"]): string => callOf(structured)[0][0]?.userPrompt ?? "";

const SPEAKER_CANDIDATES = [
  { ref: charRef("aria"), name: "Aria" },
  { ref: charRef("bran"), name: "Bran" },
  { ref: charRef("cara"), name: "Cara" },
  { ref: charRef("dov"), name: "Dov" },
];
// The arbiter posture under task defaults (`SIDE_GEN_POSTURES.arbiter`) — the caller normally folds the role
// preset over it; these tests exercise the pure `smartArbitrate` in isolation.
const ARB_SAMPLING = SIDE_GEN_POSTURES.arbiter;
const CANDIDATES = [candidate("aria"), candidate("bran"), candidate("cara")];
const human = (name: string, text: string): TranscriptLine => ({ speakerName: name, text, characterId: null });
const said = (k: string, text: string): TranscriptLine => ({
  speakerName: SPEAKER_CANDIDATES.find((s) => s.ref.characterId === cid(k))?.name ?? k,
  text,
  characterId: cid(k),
});

function arbitrate(
  over: Partial<Parameters<typeof smartArbitrate>[0]> & { readonly structured?: SpeakerArbiter["structured"] },
): ReturnType<typeof smartArbitrate> {
  const { structured, ...rest } = over;
  return smartArbitrate({
    arbiter: bound(structured ?? arbiterAnswering({ responders: ["Aria"] })),
    candidates: CANDIDATES,
    speakerCandidates: SPEAKER_CANDIDATES,
    characterLines: new Map<CharacterId, string>(),
    transcript: [human("Sam", "what now?")],
    humanNames: ["Sam"],
    room: {},
    lastSpeaker: null,
    rng: () => 0.5,
    sampling: ARB_SAMPLING,
    prose: {},
    ...rest,
  });
}

/** Every JSON Schema node in `schema`, depth first. */
function nodesOf(schema: unknown): Record<string, unknown>[] {
  if (typeof schema !== "object" || schema === null) {
    return [];
  }
  const node = schema as Record<string, unknown>;
  return [node, ...Object.values(node).flatMap((v) => (Array.isArray(v) ? v.flatMap(nodesOf) : nodesOf(v)))];
}

describe("smartArbitrate — the response schema", () => {
  test("the request's enum is the eligible candidates' names only: no human, no muted character", async () => {
    const structured = arbiterAnswering({ responders: ["Bran"] });
    await arbitrate({ structured, humanNames: ["Sam", "Jun"], candidates: [candidate("aria"), candidate("bran"), candidate("cara", { disabled: true })] });
    const format = callOf(structured)[1].responseFormat;
    const enums = nodesOf(format.schema).flatMap((n) => (Array.isArray(n["enum"]) ? [n["enum"]] : []));
    expect(enums).toEqual([["Aria", "Bran"]]);
  });

  test("the schema fits every wire's limits: no optional parameters and no unions (Anthropic allows 24 and 16)", async () => {
    const structured = arbiterAnswering({ responders: ["Bran"] });
    await arbitrate({ structured });
    const nodes = nodesOf(callOf(structured)[1].responseFormat.schema);
    const optionals = nodes.flatMap((n) => {
      const props = Object.keys((n["properties"] as Record<string, unknown> | undefined) ?? {});
      const required = (n["required"] as string[] | undefined) ?? [];
      return props.filter((p) => !required.includes(p));
    });
    const unions = nodes.filter((n) => "anyOf" in n || "oneOf" in n || Array.isArray(n["type"]));
    expect(optionals).toHaveLength(0);
    expect(unions).toHaveLength(0);
  });
});

describe("smartArbitrate — what the model is told", () => {
  test("the prompt names the human players, who are never candidates", async () => {
    const structured = arbiterAnswering({ responders: ["Bran"] });
    await arbitrate({ structured, humanNames: ["Sam", "Jun"], transcript: [said("aria", "Here."), human("Sam", "the map?")] });
    const prompt = promptOf(structured);
    expect(prompt).toContain("Human players: Sam, Jun\n");
    const candidates = prompt.slice(prompt.indexOf("Candidates:"), prompt.indexOf("Recent conversation:"));
    expect(candidates).not.toMatch(/Sam|Jun/u);
  });

  test("each candidate carries its shared line, capped; a blank line leaves the name alone", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const long = `Aria keeps the lighthouse. ${"She remembers every ship that ever passed the point. ".repeat(20)}`;
    await arbitrate({ structured, characterLines: new Map([[cid("aria"), long]]) });
    const prompt = promptOf(structured);
    const ariaRow = prompt.split("\n").find((l) => l.startsWith("- Aria: ")) ?? "";
    expect(ariaRow).toContain("Aria keeps the lighthouse.");
    expect(ariaRow.length).toBeLessThan(long.length / 4);
    expect(prompt).toMatch(/^- Bran \(spoke/mu);
  });

  test("speaking counts over the window and the last speaker; replying to its OWN line is banned", async () => {
    const structured = arbiterAnswering({ responders: ["Bran"] });
    await arbitrate({
      structured,
      transcript: [said("aria", "One."), said("bran", "Two."), human("Sam", "and?"), said("aria", "Three.")],
      lastSpeaker: charRef("aria"),
    });
    const prompt = promptOf(structured);
    expect(prompt).toContain("- Bran (spoke 1 of the last 4 lines,");
    expect(prompt).toContain("- Cara (spoke 0 of the last 4 lines,");
    expect(prompt).not.toMatch(/^- Aria/mu);
    expect(prompt).toContain("Spoke last: Aria");
  });

  test("after a human line the last speaker stays a candidate: they are often exactly who was asked", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const out = await arbitrate({
      structured,
      transcript: [said("aria", "The coffee is new."), human("Sam", "why does it taste different?")],
      lastSpeaker: charRef("aria"),
    });
    expect(promptOf(structured)).toContain("- Aria (spoke 1 of the last 2 lines,");
    expect(out).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
  });

  test("talkativeness reads as the Group tab's percent", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    await arbitrate({ structured, candidates: [candidate("aria", { talkativeness: 0.25 }), candidate("bran", { talkativeness: 1 })] });
    const prompt = promptOf(structured);
    expect(prompt).toMatch(/^- Aria \(.*talkativeness 25%\)$/mu);
    expect(prompt).toMatch(/^- Bran \(.*talkativeness 100%\)$/mu);
  });

  test("the scene line is the game's location and time, else the room's scenario, else absent", async () => {
    const game = arbiterAnswering({ responders: ["Aria"] });
    await arbitrate({
      structured: game,
      room: {
        rpgMacros: { rpgSceneState: "Scene: The old mill · day 3 · dusk · rain\nStory: Act 1\nPresent: the miller" },
        roomOverrides: { scenario: "ignored" },
      },
    });
    expect(promptOf(game)).toMatch(/^Scene: The old mill · day 3 · dusk · rain$/mu);

    const plain = arbiterAnswering({ responders: ["Aria"] });
    await arbitrate({ structured: plain, room: { roomOverrides: { scenario: "A storm traps everyone in the inn." } } });
    expect(promptOf(plain)).toMatch(/^Scene: A storm traps everyone in the inn\.$/mu);

    const bare = arbiterAnswering({ responders: ["Aria"] });
    await arbitrate({ structured: bare, room: { rpgMacros: { rpgSceneState: "Story: Act 1" } } });
    expect(promptOf(bare)).not.toContain("Scene:");
  });

  test("history keeps the last line whole and clips every older line", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const older = `Old ${"x".repeat(2000)}`;
    const latest = `New ${"y".repeat(2000)}`;
    await arbitrate({ structured, transcript: [said("bran", older), human("Sam", latest)] });
    const prompt = promptOf(structured);
    const olderRow = prompt.split("\n").find((l) => l.startsWith("Bran: Old")) ?? "";
    expect(olderRow.endsWith("…")).toBe(true);
    expect(olderRow.length).toBeLessThan(400);
    expect(prompt).toContain(`Sam: ${latest}`);
  });
});

describe("smartArbitrate — the structured reply", () => {
  test("the payload's names map to refs in its order, repeats dropped", async () => {
    const out = await arbitrate({ structured: arbiterAnswering({ responders: ["Cara", "Aria", "Cara"] }) });
    expect(out).toEqual({ speakers: [charRef("cara"), charRef("aria")], degraded: false, aborted: false });
  });

  test("the payload is capped: more than the responder cap is invalid and degrades after the one retry", async () => {
    const structured = arbiterAnswering({ responders: ["Aria", "Bran", "Cara", "Dov"] });
    const out = await arbitrate({ structured, candidates: [...CANDIDATES, candidate("dov")] });
    expect(out).toMatchObject({ degraded: true, aborted: false });
    expect(vi.mocked(structured).mock.calls).toHaveLength(2);
  });

  test("a name two candidates share resolves to the first of them in roster order", async () => {
    const twins = [
      { ref: charRef("aria"), name: "Guard" },
      { ref: charRef("bran"), name: "Guard" },
      { ref: charRef("cara"), name: "Cara" },
    ];
    const structured = arbiterAnswering({ responders: ["Guard"] });
    const out = await arbitrate({ structured, speakerCandidates: twins });
    expect(out.speakers).toEqual([charRef("aria")]);
    const enums = nodesOf(callOf(structured)[1].responseFormat.schema).flatMap((n) => (Array.isArray(n["enum"]) ? [n["enum"]] : []));
    expect(enums).toEqual([["Guard", "Cara"]]);
  });
});

describe("smartArbitrate — the visible fallback", () => {
  test("an unbound or unservable Utility row degrades to natural, with no call", async () => {
    const out = await arbitrate({ arbiter: () => Promise.resolve(null) });
    expect(out.speakers).toHaveLength(1);
    expect(out).toMatchObject({ degraded: true, aborted: false });
  });

  test("a throw, a synchronous unwired throw, an empty reply and an invalid payload all degrade, never throw", async () => {
    const replies: SpeakerArbiter["structured"][] = [
      vi.fn(() => Promise.reject(new Error("side-LLM down"))),
      vi.fn(() => {
        throw new Error('provider "vllm" is not wired for the "summarize" role');
      }),
      vi.fn((): Promise<SummarizeResult> => Promise.resolve({ items: [], model: "fake" })),
      arbiterAnswering({ responders: [] }),
      arbiterAnswering({ responders: ["Gandalf"] }),
    ];
    for (const structured of replies) {
      const out = await arbitrate({ structured });
      expect(out.speakers).toHaveLength(1);
      expect(out).toMatchObject({ degraded: true, aborted: false });
    }
  });

  test("the fallback answers the character the human named: a word mention leads the natural pick", async () => {
    const out = await arbitrate({ arbiter: () => Promise.resolve(null), mentionedIds: [cid("cara")] });
    expect(out).toEqual({ speakers: [charRef("cara")], degraded: true, aborted: false });
  });

  test("the fallback honors ban-last (the previous speaker is not re-picked when others remain)", async () => {
    const out = await arbitrate({ arbiter: () => Promise.resolve(null), lastSpeaker: charRef("aria") });
    expect(out.speakers[0]).not.toEqual(charRef("aria"));
  });
});

describe("smartArbitrate — short-circuits (no model call)", () => {
  test("single eligible character → returns it WITHOUT a call, and nothing degraded", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const out = await arbitrate({ structured, candidates: [candidate("aria"), candidate("bran", { disabled: true }), candidate("cara", { leftSeq: 3 })] });
    expect(out).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
    expect(structured).not.toHaveBeenCalled();
  });

  test("no eligible character → [] (the driver maps this to no-eligible)", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    expect(await arbitrate({ structured, candidates: [candidate("aria", { disabled: true })] })).toEqual({ speakers: [], degraded: false, aborted: false });
    expect(structured).not.toHaveBeenCalled();
  });

  test("characters the last line names answer in mention order, whoever wrote it, even the last speaker", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const byHuman = await arbitrate({ structured, transcript: [human("Sam", "Cara?")] });
    expect(byHuman).toEqual({ speakers: [charRef("cara")], degraded: false, aborted: false });
    const byCharacter = await arbitrate({ structured, transcript: [said("aria", "Cara, then Bran: report.")], lastSpeaker: charRef("bran") });
    expect(byCharacter.speakers).toEqual([charRef("cara"), charRef("bran")]);
    expect(structured).not.toHaveBeenCalled();
  });

  test("a muted mention is dropped; a line naming only muted characters asks the model as if none was named", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const roster = [candidate("aria"), candidate("bran"), candidate("cara", { disabled: true })];
    const mixed = await arbitrate({ structured, candidates: roster, transcript: [human("Sam", "Cara and Bran, look!")] });
    expect(mixed.speakers).toEqual([charRef("bran")]);
    expect(structured).not.toHaveBeenCalled();

    const mutedOnly = await arbitrate({ structured, candidates: roster, transcript: [human("Sam", "Cara, look!")] });
    expect(mutedOnly).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
    expect(structured).toHaveBeenCalledTimes(1);
  });

  test("a name a human player shares addresses the human, so the model decides; the whole name still short-circuits", async () => {
    const rook = [
      { ref: charRef("aria"), name: "Rook the Bard" },
      { ref: charRef("bran"), name: "Bryn" },
      { ref: charRef("cara"), name: "Cara" },
    ];
    const structured = arbiterAnswering({ responders: ["Cara"] });
    const toHuman = await arbitrate({ structured, speakerCandidates: rook, humanNames: ["Rook"], transcript: [said("bran", "Rook, your move.")] });
    expect(toHuman.speakers).toEqual([charRef("cara")]);
    expect(structured).toHaveBeenCalledTimes(1);

    const toBard = await arbitrate({ structured, speakerCandidates: rook, humanNames: ["Rook"], transcript: [said("bran", "Rook the Bard, your move.")] });
    expect(toBard).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
    expect(structured).toHaveBeenCalledTimes(1);
  });
});

describe("smartArbitrate — cancellation (a HANG is not a failure)", () => {
  // Identity-asserted so a fresh controller (which would abort nothing) fails.
  test("threads the turn's AbortSignal into the structured call", async () => {
    const controller = new AbortController();
    const structured = arbiterAnswering({ responders: ["Bran"] });
    const out = await arbitrate({ structured, signal: controller.signal });
    expect(callOf(structured)[1].signal).toBe(controller.signal);
    expect(out).toEqual({ speakers: [charRef("bran")], degraded: false, aborted: false });
  });

  // THE HANG: the call settles only when the signal fires. A degrade here would generate a reply the user cancelled.
  test("an abort mid-call terminates the arbitration with aborted:true (no speaker, no degrade)", async () => {
    const controller = new AbortController();
    const structured: SpeakerArbiter["structured"] = vi.fn(
      (_inputs, opts): Promise<SummarizeResult> =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    );
    const pending = arbitrate({ structured, signal: controller.signal });
    await vi.waitFor(() => expect(structured).toHaveBeenCalled());
    controller.abort();
    expect(await pending).toEqual({ speakers: [], degraded: false, aborted: true });
  });

  test("a pre-aborted signal short-circuits without a call, even when the last line names someone", async () => {
    const structured = arbiterAnswering({ responders: ["Bran"] });
    const out = await arbitrate({ structured, signal: AbortSignal.abort(), transcript: [human("Sam", "Cara?")] });
    expect(out).toEqual({ speakers: [], degraded: false, aborted: true });
    expect(structured).not.toHaveBeenCalled();
  });

  test("a NON-abort failure with a LIVE signal still degrades (never aborts)", async () => {
    const out = await arbitrate({ structured: vi.fn(() => Promise.reject(new Error("side-LLM down"))), signal: new AbortController().signal });
    expect(out).toMatchObject({ degraded: true, aborted: false });
  });
});

// PROSE-1 census 75 — the arbiter prompt is a per-USER slot resolved against the ROOM HOST.
describe("the arbiter prompt is a prose slot", () => {
  test("no override ⇒ the shipped default rides the call", async () => {
    const structured = arbiterAnswering({ responders: ["Bran"] });
    await arbitrate({ structured });
    expect(callOf(structured)[0][0]?.systemPrompt).toBe(PROSE_SLOTS["chat.arbiter.system"].text);
  });

  test("a host override REPLACES the arbiter prompt on the wire", async () => {
    const structured = arbiterAnswering({ responders: ["Bran"] });
    await arbitrate({ structured, prose: { "chat.arbiter.system": { text: "Pick whoever is angriest.", baseVersion: 1 } } });
    expect(callOf(structured)[0][0]?.systemPrompt).toBe("Pick whoever is angriest.");
  });
});
