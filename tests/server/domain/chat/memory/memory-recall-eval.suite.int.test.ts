// MEMORY RETRIEVAL EVAL — the DETERMINISTIC tier (#251). Recall quality had zero tests: every existing recall
// suite injects a `searchDigests` fake that RETURNS THE ANSWER, so they prove the plumbing and nothing about
// whether the right memory comes back.
//
// This tier closes that WITHOUT a live engine: fixture VECTORS (committed as code — orthogonal-ish unit
// vectors, `tests/server/domain/search/_support.ts::vec`) stand in for embeddings, and the query embedder is
// scripted to map a labeled query onto its own vector. Everything DOWNSTREAM of the embedder is REAL: the
// libsql `vector_distance_cos` scan, the CSLS ordering, the minScore floor, memory's bridge candidacy, the
// witnessing/live-window guards, and the block formatting. So a regression in ranking, in the candidate
// restriction, or in the score→order mapping fails HERE, in the normal battery, with no model credits spent.
//
// The labeled set is the forensics' method in miniature ("shared bathing" → the bath scene): each query has
// ONE right answer chosen by a human, and the assertions are recall@k over that set — not a snapshot of
// whatever the code currently returns (which would pin a bug as correct).
//
// Its LIVE twin — the same shape against the real embed engine and real prose — is
// `tests/e2e/memory-recall-eval.live.int.test.ts` (E2E_LIVE=1). Deterministic tier owns the regression net;
// the live tier owns drift detection.
//
// A `.suite.int.test.ts` (the cross-cutting property spelling, `test-layout`) rather than a per-source
// mirror: the property under test spans `chat/memory/recall` AND `domain/search`'s cosine — retrieval QUALITY
// is not a fact about any one module, which is exactly why nothing owned it before.

import type { MemoryQueryOptions, ScoredBlock } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import type { CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import type { MsgRow } from "../../../../../packages/server/src/domain/chat/memory/types.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_MODEL, makeSearch, seedChatDigest, vec } from "../../search/_support.ts";
import { makeChatContext, seedCharacter, seedChat, seedUser } from "../_support.ts";
import { GROUP_CHAR, seedSegment, sharedScope } from "./_support.ts";

/** THE LABELED CORPUS — six blocks, each a distinct "topic" pinned to its own basis dimension. The `text` is
 *  what `{{memory}}` renders, so an assertion can name the scene a human would name. */
const CORPUS = [
  { blockIdx: 0, topic: "bath", text: "[the bath house] Mara and Niko share the steaming pool." },
  { blockIdx: 1, topic: "market", text: "[the night market] Haggling over lantern oil." },
  { blockIdx: 2, topic: "duel", text: "[the duel] Mara wins the bout on the bridge." },
  { blockIdx: 3, topic: "shrine", text: "[the shrine] An offering left for the road spirits." },
  { blockIdx: 4, topic: "storm", text: "[the storm] The caravan shelters under the cliff." },
  { blockIdx: 5, topic: "farewell", text: "[the farewell] Niko rides north at dawn." },
] as const;

type Topic = (typeof CORPUS)[number]["topic"];

/** Each topic's fixture embedding: a unit vector on its own axis. Distinct axes ⇒ a query that leans on one
 *  axis is unambiguously closest to that topic — the "known right answer" the labeled set needs. */
function topicVector(topic: Topic): Float32Array<ArrayBuffer> {
  const axis = CORPUS.findIndex((c) => c.topic === topic);
  const components = new Array<number>(axis + 1).fill(0);
  components[axis] = 1;
  return vec(...components);
}

/** A QUERY's embedding: mostly its target topic, with a minority component on a decoy axis — a query is never
 *  a byte-identical copy of the document it should retrieve, and a ranking that only survives exact matches
 *  is not a ranking. */
function queryVector(target: Topic, decoy: Topic): Float32Array<ArrayBuffer> {
  const t = topicVector(target);
  const d = topicVector(decoy);
  const out = new Float32Array(t.length);
  for (let i = 0; i < t.length; i += 1) {
    out[i] = 0.9 * (t[i] ?? 0) + 0.3 * (d[i] ?? 0);
  }
  return out;
}

/** The labeled query set: the human-checkable half. `probe` is the marker the scripted embedder keys on (it
 *  rides the recent-message text recall assembles its query from). */
const LABELED = [
  { probe: "shared bathing", target: "bath", decoy: "storm", expectBlockIdx: 0 },
  { probe: "buying lamp fuel", target: "market", decoy: "duel", expectBlockIdx: 1 },
  { probe: "the fight on the bridge", target: "duel", decoy: "market", expectBlockIdx: 2 },
  { probe: "leaving an offering", target: "shrine", decoy: "farewell", expectBlockIdx: 3 },
  { probe: "sheltering from bad weather", target: "storm", decoy: "bath", expectBlockIdx: 4 },
  { probe: "riding away at dawn", target: "farewell", decoy: "shrine", expectBlockIdx: 5 },
] as const satisfies readonly { probe: string; target: Topic; decoy: Topic; expectBlockIdx: number }[];

/** A probe whose embedding lands on an axis NO corpus document occupies — the "nothing here is relevant"
 *  case, which is the one a retrieval system is most tempted to answer with its least-bad row. */
const OFF_CORPUS_PROBE = "an entirely unrelated subject";

let db: Db;
let chatId: Awaited<ReturnType<typeof seedChat>>;

beforeEach(async () => {
  db = await freshDb();
  const owner = await seedUser(db, castId<Handle>("owner"));
  await seedCharacter(db, owner, "group");
  chatId = await seedChat(db, "eval");
  for (const block of CORPUS) {
    // biome-ignore lint/performance/noAwaitInLoops: ordered fixture inserts.
    await seedChatDigest(db, {
      chatId,
      scopedCharacterId: GROUP_CHAR,
      blockIdx: block.blockIdx,
      text: block.text,
      embedding: topicVector(block.topic),
      model: EMBED_MODEL,
    });
    // The verbatim spans the live-window guard reads: block N covers seqs [4N+1, 4N+4].
    await seedSegment(db, { chatId, blockIdx: block.blockIdx, seqStart: block.blockIdx * 4 + 1, seqEnd: block.blockIdx * 4 + 4 });
  }
});

/** A chat context whose `searchDigests` is the REAL search domain over the REAL db — only the EMBEDDER is
 *  scripted (the sanctioned "fake at the edges" seam). This is the whole point of the tier: the cosine, the
 *  candidate restriction and the floor all execute for real. */
function evalContext(): ChatContext {
  const search = makeSearch(db, {
    embedVector: (input: string): Float32Array<ArrayBuffer> | null => {
      if (input.includes(OFF_CORPUS_PROBE)) {
        // A real vector on an UNOCCUPIED axis — not `null`, which is the embedder-filtered-the-query path and
        // would make `digests` refuse before any scan (a different fact from "nothing scored high enough").
        return vec(...new Array<number>(CORPUS.length).fill(0), 1);
      }
      const hit = LABELED.find((q) => input.includes(q.probe));
      return hit === undefined ? null : queryVector(hit.target, hit.decoy);
    },
  });
  return makeChatContext(db, {
    searchDigests: (query: MemoryQueryOptions): Promise<readonly ScoredBlock[]> =>
      search.digests(query).then((hits) => hits.map((h) => ({ blockKey: h.blockKey, score: h.score, relevance: h.relevance }))),
  });
}

/** Run one labeled query through recall and return the ADMITTED block indexes in rank order (the trace's own
 *  answer — the eval reads the same slice a host reads). */
async function rankedBlocks(probe: string, over?: { readonly liveWindowCutoffSeq?: number }): Promise<readonly number[]> {
  const recent: MsgRow[] = [{ seq: 100, role: "user", kind: "standard", characterId: null, authorUserId: null, personaId: null, content: probe }];
  const { trace } = await recallMemory(evalContext(), {
    scope: sharedScope(chatId),
    groupCharacterId: GROUP_CHAR,
    recent,
    names: new Map<CharacterId, string>(),
    config: { mode: "mixB", fanOut: 2, queryWindow: 4, minScore: 0.05 },
    ...(over?.liveWindowCutoffSeq === undefined ? {} : { liveWindowCutoffSeq: over.liveWindowCutoffSeq }),
  });
  return trace.candidates.filter((c) => c.verdict === "admitted").map((c) => c.blockIdx);
}

describe("memory retrieval eval — deterministic fixture-vector tier (#251)", () => {
  test("recall@1 is 6/6 over the labeled set — the right scene ranks FIRST for every query", async () => {
    const misses: string[] = [];
    for (const q of LABELED) {
      // biome-ignore lint/performance/noAwaitInLoops: the eval is a sequential sweep over the labeled set.
      const ranked = await rankedBlocks(q.probe);
      if (ranked.at(0) !== q.expectBlockIdx) {
        misses.push(`${q.probe} → ${String(ranked.at(0))} (want ${q.expectBlockIdx})`);
      }
    }
    expect(misses).toEqual([]);
  });

  test("recall@3 keeps the right scene in the head even with a decoy leaning on a rival axis", async () => {
    for (const q of LABELED) {
      // biome-ignore lint/performance/noAwaitInLoops: the eval is a sequential sweep over the labeled set.
      const ranked = await rankedBlocks(q.probe);
      expect(ranked.slice(0, 3)).toContain(q.expectBlockIdx);
    }
  });

  test("ordering is STABLE — the same query twice returns the same ranking (no set-iteration nondeterminism)", async () => {
    const first = await rankedBlocks("shared bathing");
    const second = await rankedBlocks("shared bathing");
    expect(second).toEqual(first);
    // …and the decoy axis is genuinely present: the storm scene ranks, just never above the bath scene.
    expect(first.at(0)).toBe(0);
    expect(first).toContain(4);
  });

  test("the LIVE WINDOW outranks relevance — the top-ranked scene is DROPPED while still verbatim (D55)", async () => {
    // The farewell scene is the LAST block (seqs 21-24) and the top hit for its own query. A cutoff at 21 puts
    // it inside this turn's live history window (`inLiveWindow`: seqStart >= cutoff), so `{{memory}}` must not
    // re-inject a scene the model is already reading in full — even though retrieval would rank it first.
    const unfiltered = await rankedBlocks("riding away at dawn");
    expect(unfiltered.at(0)).toBe(5);

    const filtered = await rankedBlocks("riding away at dawn", { liveWindowCutoffSeq: 21 });
    expect(filtered).not.toContain(5);
    // …and recall DEGRADES rather than collapsing: the rest of the corpus is still retrievable.
    expect(filtered.length).toBeGreaterThan(0);
  });

  test("the minScore floor bites: an off-corpus query surfaces NOTHING rather than the least-bad block", async () => {
    // `OFF_CORPUS_PROBE` embeds onto an axis NO document occupies ⇒ every cosine is ~0 ⇒ nothing clears the
    // floor. The failure this pins is the plausible-but-wrong one: returning the nearest block regardless,
    // which injects an unrelated scene and reads, from the outside, exactly like a good recall.
    const recent: MsgRow[] = [{ seq: 100, role: "user", kind: "standard", characterId: null, authorUserId: null, personaId: null, content: OFF_CORPUS_PROBE }];
    const { text, trace } = await recallMemory(evalContext(), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      recent,
      names: new Map<CharacterId, string>(),
      config: { mode: "mixB", fanOut: 2, queryWindow: 4, minScore: 0.05 },
    });
    expect(trace.queryEmbedded).toBe(true);
    expect(trace.surfaced).toBe(0);
    expect(text).toBe("");
    // Every candidate is accounted for BY NAME — the trace says "scanned and rejected", never nothing at all.
    expect(trace.candidates.every((c) => c.verdict === "below-floor")).toBe(true);
  });
});
