// engine/smart-arbitrate — Smart's Utility-model pick over a FAKE structured arbiter. Pins what the model is told
// (the human players, one capped line per candidate under its round label, how often each spoke, talkativeness, the
// scene, a history with older lines clipped and the last capped to the window), the response schema (an enum of the
// round's candidate labels only, within every wire's limits), the short-circuits that spend no call (a lone eligible
// character, unambiguous names in the last line), how a payload maps to refs, and the `natural` fallback with
// `degraded:true` the turn verb turns into a warning (D41).
// Plus CANCELLATION: the turn's AbortSignal reaches the call, and an abort is `aborted:true`, never a degrade.

import type { SpeakerRef } from "@orb/contracts/chat";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
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

/** A context window wide enough that no test line is clipped, and one small enough to clip a long line. */
const WIDE_WINDOW = 200_000;
const SMALL_WINDOW = 2048;

const bound =
  (structured: SpeakerArbiter["structured"]): (() => Promise<SpeakerArbiter>) =>
  (): Promise<SpeakerArbiter> =>
    Promise.resolve({ structured, contextTokens: WIDE_WINDOW });

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

  test("a reply longer than the cap (a wire that strips the array bounds) is trimmed, with no retry", async () => {
    const five = ["Aria", "Bran", "Cara", "Dov", "Eli"];
    const structured = arbiterAnswering({ responders: five });
    const out = await arbitrate({
      structured,
      candidates: [...CANDIDATES, candidate("dov"), candidate("eli")],
      speakerCandidates: [...SPEAKER_CANDIDATES, { ref: charRef("eli"), name: "Eli" }],
    });
    expect(out).toEqual({ speakers: [charRef("aria"), charRef("bran"), charRef("cara")], degraded: false, aborted: false });
    expect(vi.mocked(structured).mock.calls).toHaveLength(1);
    // The bounds still ride for the wires that enforce them.
    const arrays = nodesOf(callOf(structured)[1].responseFormat.schema).filter((n) => n["type"] === "array");
    expect(arrays).toEqual([expect.objectContaining({ minItems: 1, maxItems: 3 })]);
  });

  test("candidates sharing a name get distinct labels in roster order, and the second is pickable", async () => {
    const twins = [
      { ref: charRef("aria"), name: "Ann" },
      { ref: charRef("bran"), name: "Ann" },
      { ref: charRef("cara"), name: "Cara" },
    ];
    const structured = arbiterAnswering({ responders: ["Ann (2)"] });
    const out = await arbitrate({ structured, speakerCandidates: twins });
    expect(out).toEqual({ speakers: [charRef("bran")], degraded: false, aborted: false });
    const enums = nodesOf(callOf(structured)[1].responseFormat.schema).flatMap((n) => (Array.isArray(n["enum"]) ? [n["enum"]] : []));
    expect(enums).toEqual([["Ann", "Ann (2)", "Cara"]]);
    const prompt = promptOf(structured);
    expect(prompt).toMatch(/^- Ann \(spoke/mu);
    expect(prompt).toMatch(/^- Ann \(2\) \(spoke/mu);
  });

  const annRoster = [
    { ref: charRef("aria"), name: "Ann" },
    { ref: charRef("bran"), name: "Ann" },
    { ref: charRef("cara"), name: "Bo" },
  ];

  test("Spoke last names the second Ann by her own label, not the first Ann's name", async () => {
    // a2 spoke last but a human spoke after, so she stays a candidate.
    const structured = arbiterAnswering({ responders: ["Bo"] });
    await arbitrate({ structured, speakerCandidates: annRoster, transcript: [said("bran", "Hm."), human("Sam", "and then?")], lastSpeaker: charRef("bran") });
    expect(promptOf(structured)).toMatch(/^Spoke last: Ann \(2\)$/mu);
  });

  test("a label is fixed for the round: ban-last removing the second Ann leaves no one relabelled", async () => {
    // a2 replying to her own line is banned; the first Ann stays "Ann" and a2 is still "Ann (2)" in Spoke last.
    const structured = arbiterAnswering({ responders: ["Ann"] });
    const out = await arbitrate({ structured, speakerCandidates: annRoster, transcript: [said("bran", "Hm.")], lastSpeaker: charRef("bran") });
    const prompt = promptOf(structured);
    expect(prompt).toMatch(/^Spoke last: Ann \(2\)$/mu);
    expect(prompt).not.toMatch(/^- Ann \(2\)/mu);
    const enums = nodesOf(callOf(structured)[1].responseFormat.schema).flatMap((n) => (Array.isArray(n["enum"]) ? [n["enum"]] : []));
    expect(enums).toEqual([["Ann", "Bo"]]);
    expect(out.speakers).toEqual([charRef("aria")]);
  });

  test("labels never collide with a name that already reads like one: Ann, a literal 'Ann (2)', Ann are all pickable", async () => {
    const roster = [
      { ref: charRef("aria"), name: "Ann" },
      { ref: charRef("bran"), name: "Ann (2)" },
      { ref: charRef("cara"), name: "Ann" },
    ];
    for (const [label, key] of [
      ["Ann", "aria"],
      ["Ann (2)", "bran"],
      ["Ann (3)", "cara"],
    ] as const) {
      const structured = arbiterAnswering({ responders: [label] });
      const out = await arbitrate({ structured, speakerCandidates: roster });
      expect(out.speakers, label).toEqual([charRef(key)]);
      const enums = nodesOf(callOf(structured)[1].responseFormat.schema).flatMap((n) => (Array.isArray(n["enum"]) ? [n["enum"]] : []));
      expect(enums).toEqual([["Ann", "Ann (2)", "Ann (3)"]]);
    }
  });

  test("names differing only by case or spacing are numbered like duplicates, and each stays pickable", async () => {
    const roster = [
      { ref: charRef("aria"), name: "Ann " },
      { ref: charRef("bran"), name: "Ann" },
      { ref: charRef("cara"), name: "ann" },
    ];
    for (const [label, key] of [
      ["Ann", "aria"],
      ["Ann (2)", "bran"],
      ["ann (3)", "cara"],
    ] as const) {
      const structured = arbiterAnswering({ responders: [label] });
      const out = await arbitrate({ structured, speakerCandidates: roster });
      expect(out.speakers, label).toEqual([charRef(key)]);
      const enums = nodesOf(callOf(structured)[1].responseFormat.schema).flatMap((n) => (Array.isArray(n["enum"]) ? [n["enum"]] : []));
      expect(enums).toEqual([["Ann", "Ann (2)", "ann (3)"]]);
    }
  });

  test("older transcript lines carry the round labels, so two Anns' lines stay attributable", async () => {
    const structured = arbiterAnswering({ responders: ["Bo"] });
    await arbitrate({
      structured,
      speakerCandidates: annRoster,
      transcript: [
        { speakerName: "Ann", text: "First.", characterId: cid("aria") },
        { speakerName: "Ann", text: "Second.", characterId: cid("bran") },
        human("Sam", "and?"),
      ],
    });
    const prompt = promptOf(structured);
    expect(prompt).toMatch(/^Ann: First\.$/mu);
    expect(prompt).toMatch(/^Ann \(2\): Second\.$/mu);
    expect(prompt).toMatch(/^Sam: and\?$/mu);
  });

  test("no printed speaker tag reads as another seat's label: off-roster characters and players are numbered past the seats", async () => {
    const structured = arbiterAnswering({ responders: ["Bo"] });
    await arbitrate({
      structured,
      speakerCandidates: annRoster,
      humanNames: ["Sam", "Ann"],
      transcript: [
        { speakerName: "Ann (2)", text: "Gone now.", characterId: cid("dov") },
        { speakerName: "Ann", text: "Mine.", characterId: cid("bran") },
        human("Ann", "Hello."),
        human("Sam", "and?"),
      ],
    });
    const prompt = promptOf(structured);
    expect(prompt).toContain("Human players: Sam, Ann (3)\n");
    const history = prompt.slice(prompt.indexOf("Recent conversation:\n") + "Recent conversation:\n".length, prompt.indexOf("\n\nWho speaks next?"));
    expect(history.split("\n")).toEqual(["Ann (2) (2): Gone now.", "Ann (2): Mine.", "Ann (3): Hello.", "Sam: and?"]);
  });

  test("eligible characters that all have blank names leave nothing to pick from: a visible natural degrade, never a silent []", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const blank = CANDIDATES.map((c) => ({ ref: c.ref, name: "" }));
    const out = await arbitrate({ structured, speakerCandidates: blank });
    expect(out.speakers).toHaveLength(1);
    expect(out).toMatchObject({ degraded: true, aborted: false });
    expect(structured).not.toHaveBeenCalled();
  });

  test("a seat with a blank name is no candidate and is never numbered; it can still speak through Natural", async () => {
    const roster = [
      { ref: charRef("aria"), name: "" },
      { ref: charRef("bran"), name: "  " },
      { ref: charRef("cara"), name: "Cara" },
      { ref: charRef("dov"), name: "Dov" },
    ];
    const structured = arbiterAnswering({ responders: ["Dov"] });
    const seats = [...CANDIDATES, candidate("dov")];
    const out = await arbitrate({ structured, speakerCandidates: roster, candidates: seats });
    expect(out.speakers).toEqual([charRef("dov")]);
    const enums = nodesOf(callOf(structured)[1].responseFormat.schema).flatMap((n) => (Array.isArray(n["enum"]) ? [n["enum"]] : []));
    expect(enums).toEqual([["Cara", "Dov"]]);
    // The degrade still draws from every eligible seat, nameless ones included.
    const fallback = await arbitrate({ arbiter: () => Promise.resolve(null), speakerCandidates: roster, candidates: seats, mentionedIds: [cid("aria")] });
    expect(fallback).toEqual({ speakers: [charRef("aria")], degraded: true, aborted: false });
  });
});

describe("smartArbitrate — the line being answered fits the bound model", () => {
  test("a huge last line on a small window keeps its end, within half the safe window", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const huge = `START ${"filler ".repeat(5000)}what time is it, Sam?`;
    await arbitrate({
      arbiter: () => Promise.resolve({ structured, contextTokens: SMALL_WINDOW }),
      transcript: [human("Sam", huge)],
    });
    const row =
      promptOf(structured)
        .split("\n")
        .find((l) => l.startsWith("Sam: ")) ?? "";
    expect(row.endsWith("what time is it, Sam?")).toBe(true);
    expect(row).not.toContain("START");
    expect(estimateTokens(row)).toBeLessThanOrEqual(Math.floor(safeTokenWindow(SMALL_WINDOW) / 2) + estimateTokens("Sam: …"));
  });

  test("a last line that fits rides whole", async () => {
    const structured = arbiterAnswering({ responders: ["Aria"] });
    const long = `START ${"filler ".repeat(500)}end`;
    await arbitrate({ structured, transcript: [human("Sam", long)] });
    expect(promptOf(structured)).toContain(`Sam: ${long}`);
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

  test("one ambiguous name sends the whole line to the model, the clear names in it included", async () => {
    const grace = [
      { ref: charRef("aria"), name: "Grace" },
      { ref: charRef("bran"), name: "Bryn" },
      { ref: charRef("cara"), name: "Cara" },
    ];
    const structured = arbiterAnswering({ responders: ["Cara"] });
    const out = await arbitrate({ structured, speakerCandidates: grace, humanNames: ["Grace"], transcript: [said("cara", "Grace, Bryn, help me.")] });
    expect(structured).toHaveBeenCalledTimes(1);
    expect(out.speakers).toEqual([charRef("cara")]);
  });

  test("a player's name written as an ordinary word is no address: the named character answers with no call", async () => {
    const structured = arbiterAnswering({ responders: ["Cara"] });
    const grace = [
      { ref: charRef("aria"), name: "Mara" },
      { ref: charRef("bran"), name: "Grace" },
      { ref: charRef("cara"), name: "Cara" },
    ];
    const withGrace = await arbitrate({
      structured,
      speakerCandidates: grace,
      humanNames: ["Sam", "Grace"],
      transcript: [human("Sam", "Mara, move with grace.")],
    });
    expect(withGrace).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
    const will = [
      { ref: charRef("aria"), name: "Mara" },
      { ref: charRef("bran"), name: "Will" },
      { ref: charRef("cara"), name: "Cara" },
    ];
    const withWill = await arbitrate({
      structured,
      speakerCandidates: will,
      humanNames: ["Sam", "Will"],
      transcript: [human("Sam", "Mara, I will hold the door.")],
    });
    expect(withWill).toEqual({ speakers: [charRef("aria")], degraded: false, aborted: false });
    expect(structured).not.toHaveBeenCalled();

    // Written as a name, the shared name is still ambiguous and the model decides.
    const addressed = await arbitrate({ structured, speakerCandidates: grace, humanNames: ["Sam", "Grace"], transcript: [human("Sam", "Mara, Grace, go.")] });
    expect(addressed.speakers).toEqual([charRef("cara")]);
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
