// engine/rerank-pick — Smart's default speaker pick over an injected rerank role. Scores are injected, so these
// pin the rules, not a model's quality: a name in the last line wins, else the best-ranked character with the
// last speaker out; any score scale ranks the same; the documents fit the bound model's window; an unbound or
// failing role degrades to natural with the flag the turn verb turns into a warning.

import type { SpeakerRef } from "@orb/contracts/chat";
import type { RerankCapability } from "@orb/contracts/inference";
import type { RerankDocument } from "@orb/contracts/role-clients";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ArbiterCandidate, SpeakerReranker, TranscriptLine } from "../../../../../packages/server/src/domain/chat/contract/arbitration.ts";
import { personaSummaryOf, rerankPick } from "../../../../../packages/server/src/domain/chat/engine/rerank-pick.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const ref = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
const KEYS = ["aria", "bran", "cara"] as const;
const candidate = (k: string): ArbiterCandidate => ({ ref: ref(k), talkativeness: 0.5, disabled: false, leftSeq: null });
const CANDIDATES = KEYS.map(candidate);
const SPEAKERS = [
  { ref: ref("aria"), name: "Aria" },
  { ref: ref("bran"), name: "Bran" },
  { ref: ref("cara"), name: "Cara" },
];
const PERSONAS = new Map(KEYS.map((k) => [cid(k), `${k} is a traveller with a long and winding story`] as const));
const WIDE: RerankCapability = { maxInputTokens: 8192, input: ["text"], instructionAware: false };

/** A rerank role scoring each document by the character it names; records what it was sent. */
function fakeReranker(
  scores: Readonly<Record<string, number>>,
  capability: RerankCapability = WIDE,
): { op: () => Promise<SpeakerReranker>; sent: RerankDocument[][] } {
  const sent: RerankDocument[][] = [];
  const op = (): Promise<SpeakerReranker> =>
    Promise.resolve({
      capability,
      rerank: (_query: string, documents: RerankDocument[]) => {
        sent.push(documents);
        // Deliberately unsorted: the pick must rank, not trust the order it was handed.
        const hits = documents.map((d) => ({ id: d.id, score: scores[d.id.replace("c:character_", "")] ?? Number.NEGATIVE_INFINITY })).reverse();
        return Promise.resolve({ hits, model: "fake", usage: { totalTokens: null } });
      },
    });
  return { op, sent };
}

const line = (text: string, speaker: string | null = "Sam", characterId: CharacterId | null = null): TranscriptLine => ({
  speakerName: speaker,
  text,
  characterId,
});

function pick(over: Partial<Parameters<typeof rerankPick>[0]> & Pick<Parameters<typeof rerankPick>[0], "reranker">): ReturnType<typeof rerankPick> {
  return rerankPick({
    candidates: CANDIDATES,
    speakerCandidates: SPEAKERS,
    personas: PERSONAS,
    lastLine: line("what do we do now?"),
    lastSpeaker: null,
    rng: () => 0.5,
    ...over,
  });
}

describe("rerankPick — the rules over injected scores", () => {
  test("the best-ranked character speaks, on any score scale", async () => {
    // Negative logits: the least negative ranks first. No threshold may read these as "all bad".
    const logits = fakeReranker({ aria: -9.1, bran: -0.4, cara: -3 });
    expect(await pick({ reranker: logits.op })).toEqual({ speakers: [ref("bran")], degraded: false, aborted: false });
    const unit = fakeReranker({ aria: 0.91, bran: 0.2, cara: 0.03 });
    expect((await pick({ reranker: unit.op })).speakers).toEqual([ref("aria")]);
  });

  test("the last speaker sits out when the round bans it, and may answer when it does not", async () => {
    const scores = fakeReranker({ aria: 5, bran: 1, cara: 0 });
    expect((await pick({ reranker: scores.op, lastSpeaker: ref("aria") })).speakers).toEqual([ref("bran")]);
    expect((await pick({ reranker: scores.op, lastSpeaker: ref("aria"), banLast: false })).speakers).toEqual([ref("aria")]);
  });

  test("a character named in the last line wins over the ranking and the ban, whoever wrote the line", async () => {
    const scores = fakeReranker({ aria: 5, bran: 1, cara: 0 });
    const byHuman = await pick({ reranker: scores.op, lastLine: line("Cara, what do you think?"), lastSpeaker: ref("cara") });
    expect(byHuman.speakers).toEqual([ref("cara")]);
    const byCharacter = await pick({ reranker: scores.op, lastLine: line("Bran, take the lead.", "Aria", cid("aria")), lastSpeaker: ref("aria") });
    expect(byCharacter.speakers).toEqual([ref("bran")]);
    expect(scores.sent).toHaveLength(0);
  });

  test("a character naming itself is not an address", async () => {
    const scores = fakeReranker({ aria: 0, bran: 3, cara: 1 });
    const out = await pick({ reranker: scores.op, lastLine: line("I am Aria, and I am tired.", "Aria", cid("aria")), lastSpeaker: ref("aria") });
    expect(out.speakers).toEqual([ref("bran")]);
  });

  test("an unbound or failing role degrades to natural; a lone eligible character needs no call", async () => {
    expect(await pick({ reranker: () => Promise.resolve(null) })).toMatchObject({ degraded: true, aborted: false });
    expect(await pick({ reranker: () => Promise.reject(new Error("rerank down")) })).toMatchObject({ degraded: true, aborted: false });
    const scores = fakeReranker({ aria: 1 });
    expect(await pick({ reranker: scores.op, candidates: [candidate("aria")] })).toEqual({ speakers: [ref("aria")], degraded: false, aborted: false });
    expect(await pick({ reranker: scores.op, candidates: [] })).toEqual({ speakers: [], degraded: false, aborted: false });
    expect(scores.sent).toHaveLength(0);
  });
});

describe("rerankPick — an ambiguous or common-word name does not win outright", () => {
  const CastKeys = ["hale", "rook", "will", "aria"] as const;
  const Cast = [
    { ref: ref("hale"), name: "Captain Hale" },
    { ref: ref("rook"), name: "Captain Rook" },
    { ref: ref("will"), name: "Will" },
    { ref: ref("aria"), name: "Aria" },
  ];
  const castPick = (reranker: () => Promise<SpeakerReranker | null>, text: string): ReturnType<typeof rerankPick> =>
    pick({
      reranker,
      candidates: CastKeys.map(candidate),
      speakerCandidates: Cast,
      personas: new Map(CastKeys.map((k) => [cid(k), `${k} persona`] as const)),
      lastLine: line(text),
    });

  test("a title shared by two characters reranks within those two, not first-match", async () => {
    const scores = fakeReranker({ hale: 1, rook: 9, will: 100, aria: 100 });
    const out = await castPick(scores.op, "Captain, what do we do now?");
    expect(out.speakers).toEqual([ref("rook")]);
    expect(scores.sent).toHaveLength(1);
    expect(scores.sent[0]?.map((d) => d.text?.split(":")[0])).toEqual(["Captain Hale", "Captain Rook"]);
  });

  test("the fuller name still wins outright, and so does a unique capitalised name", async () => {
    const scores = fakeReranker({ hale: 0, rook: 9, will: 9, aria: 9 });
    expect((await castPick(scores.op, "Captain Hale, what now?")).speakers).toEqual([ref("hale")]);
    expect((await castPick(scores.op, "Will, come here.")).speakers).toEqual([ref("will")]);
    expect(scores.sent).toHaveLength(0);
  });

  test("a name that is also a lowercase common word does not win; the whole cast is reranked", async () => {
    const scores = fakeReranker({ hale: 1, rook: 2, will: 3, aria: 9 });
    const out = await castPick(scores.op, "we will find it together");
    expect(out.speakers).toEqual([ref("aria")]);
    expect(scores.sent[0]).toHaveLength(4);
  });
});

describe("rerankPick — documents fit the bound model's window", () => {
  test("a small window clips each persona and keeps the name; a large one sends it whole", async () => {
    const small = fakeReranker({ aria: 1 }, { maxInputTokens: 64, input: ["text"], instructionAware: false });
    await pick({ reranker: small.op, personas: new Map(KEYS.map((k) => [cid(k), `${k} ${"remembers every road and river ".repeat(20)}`] as const)) });
    const clipped = small.sent[0] ?? [];
    expect(clipped.map((d) => d.text?.split(":")[0])).toEqual(["Aria", "Bran", "Cara"]);
    expect(clipped.every((d) => (d.text?.length ?? 0) < 200)).toBe(true);

    const wide = fakeReranker({ aria: 1 });
    await pick({ reranker: wide.op });
    expect(wide.sent[0]?.map((d) => d.text)).toEqual(KEYS.map((k, i) => `${SPEAKERS[i]?.name}: ${k} is a traveller with a long and winding story`));
  });
});

describe("rerankPick — cancellation and persona text", () => {
  test("a turn aborted while the role is unbound is cancelled, not degraded to a natural pick", async () => {
    const controller = new AbortController();
    const out = await pick({
      reranker: () => {
        controller.abort();
        return Promise.resolve(null);
      },
      signal: controller.signal,
    });
    expect(out).toEqual({ speakers: [], degraded: false, aborted: true });
  });

  test("an already-aborted turn picks nobody, even when the last line names a character", async () => {
    const scores = fakeReranker({ aria: 1 });
    const out = await pick({ reranker: scores.op, lastLine: line("Cara, your turn."), signal: AbortSignal.abort() });
    expect(out).toEqual({ speakers: [], degraded: false, aborted: true });
    expect(scores.sent).toHaveLength(0);
  });

  test("a blank description falls back to the personality, macros rendered against the card's name", () => {
    const card = { name: "Aria", personality: "{{char}} is wry and patient" };
    expect(personaSummaryOf({ ...card, description: "" }, 0)).toBe("Aria is wry and patient");
    expect(personaSummaryOf({ ...card, description: "  \n " }, 0)).toBe("Aria is wry and patient");
    expect(personaSummaryOf({ ...card, description: "A keeper of lights" }, 0)).toBe("A keeper of lights");
    expect(personaSummaryOf({ name: "Aria", description: " ", personality: null }, 0)).toBe("");
  });
});
