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

import type { RoleClients } from "@orb/contracts/role-clients";
import type { MemoryQueryOptions, ScoredBlock } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import type { CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import type { MemoryConfig, MsgRow, WitnessInterval } from "../../../../../packages/server/src/domain/chat/memory/types.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { FakeRoleClientControls } from "../../search/_support.ts";
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

/** The labeled-set query embedder: map a query string onto its target topic's vector (with a decoy lean), or
 *  the off-corpus axis for {@link OFF_CORPUS_PROBE}. Extracted so the knob sweeps can reuse the SAME scripted
 *  embedder while overriding OTHER role-client seams (e.g. a scripted rerank for the mixC divergence proof). */
function labeledEmbedder(input: string): Float32Array<ArrayBuffer> | null {
  if (input.includes(OFF_CORPUS_PROBE)) {
    // A real vector on an UNOCCUPIED axis — not `null`, which is the embedder-filtered-the-query path and
    // would make `digests` refuse before any scan (a different fact from "nothing scored high enough").
    return vec(...new Array<number>(CORPUS.length).fill(0), 1);
  }
  const hit = LABELED.find((q) => input.includes(q.probe));
  return hit === undefined ? null : queryVector(hit.target, hit.decoy);
}

/** A chat context whose `searchDigests` is the REAL search domain over the REAL db, with the injected
 *  role-client seams (`embedVector`, optional scripted `rerank`) supplied by the caller. This is the whole
 *  point of the tier: the cosine, the candidate restriction and the floor all execute for real. */
function contextFor(controls: FakeRoleClientControls): ChatContext {
  const search = makeSearch(db, controls);
  return makeChatContext(db, {
    // #405 F3 — the eval binds a THROWING observer. `digests` degrades mixC→mixB honestly for production
    // (it keeps the vector order and fires this), but for an EVAL that silent fallback is the worst failure
    // mode there is: a dead reranker makes the run report mixB numbers under a mixC label with no tell.
    // An eval measures what it says it measures or it fails loudly.
    searchDigests: (query: Omit<MemoryQueryOptions, "ownerId">): Promise<readonly ScoredBlock[]> =>
      search
        .digests(query, {
          onRerankUnavailable: (): never => {
            throw new Error("eval: the rerank degraded to vector order — this run would report mixB numbers as mixC");
          },
        })
        .then((hits) => hits.map((h) => ({ blockKey: h.blockKey, score: h.score, relevance: h.relevance }))),
  });
}

/** The default eval context — the labeled embedder, the default (order-preserving) rerank. */
function evalContext(): ChatContext {
  return contextFor({ embedVector: labeledEmbedder });
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

type RecallTrace = Awaited<ReturnType<typeof recallMemory>>["trace"];

/** A recent-history `MsgRow` (the seed for the recall query text) — a plain user line carrying `content`. */
function msg(seq: number, content: string): MsgRow {
  return { seq, role: "user", kind: "standard", characterId: null, authorUserId: null, personaId: null, content };
}

/** The shared mixB knobs the #311 sweeps perturb ONE at a time (fanOut 2 matches the segment grid the
 *  fixtures seed; queryWindow 4 keeps a single-line `recent` fully inside the window; minScore 0.05 admits
 *  every on-axis hit). */
const BASE_CFG: MemoryConfig = { mode: "mixB", fanOut: 2, queryWindow: 4, minScore: 0.05 };

/** Run recall over the fixtures with an explicit config + recent window + optional guards, returning the full
 *  trace so a knob/boundary sweep can read count, order, `queryEmbedded`, and the per-candidate verdicts. */
async function traceFor(args: {
  readonly recent: readonly MsgRow[];
  readonly config: MemoryConfig;
  readonly ctx?: ChatContext;
  readonly liveWindowCutoffSeq?: number;
  readonly witnessing?: readonly WitnessInterval[];
}): Promise<RecallTrace> {
  const { trace } = await recallMemory(args.ctx ?? evalContext(), {
    scope: sharedScope(chatId),
    groupCharacterId: GROUP_CHAR,
    recent: args.recent,
    names: new Map<CharacterId, string>(),
    config: args.config,
    ...(args.liveWindowCutoffSeq === undefined ? {} : { liveWindowCutoffSeq: args.liveWindowCutoffSeq }),
    ...(args.witnessing === undefined ? {} : { witnessing: args.witnessing }),
  });
  return trace;
}

/** The ADMITTED block indexes in rank order (the trace's own answer). */
function admitted(trace: RecallTrace): readonly number[] {
  return trace.candidates.filter((c) => c.verdict === "admitted").map((c) => c.blockIdx);
}

describe("memory retrieval eval — deterministic fixture-vector tier (#251)", () => {
  test("recall@1 is 6/6 over the labeled set — the right scene ranks FIRST for every query", async () => {
    const misses: string[] = [];
    for (const q of LABELED) {
      const ranked = await rankedBlocks(q.probe);
      if (ranked.at(0) !== q.expectBlockIdx) {
        misses.push(`${q.probe} → ${String(ranked.at(0))} (want ${q.expectBlockIdx})`);
      }
    }
    expect(misses).toEqual([]);
  });

  test("recall@3 keeps the right scene in the head even with a decoy leaning on a rival axis", async () => {
    for (const q of LABELED) {
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// #311 — THE KNOBS, each proven by a PLANTED CONTROL that flips the outcome. A knob-sweep where both arms are
// green proves nothing (the value was accepted, not that it did anything); every assertion below contrasts two
// knob values that MUST diverge, so a knob silently stopping being wired FAILS here.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("recall knobs — each proven by a control that FLIPS the outcome (#311)", () => {
  test("mode `off` recalls NOTHING; the SAME fixtures under mixB recall something — the switch is load-bearing (recall.ts:57)", async () => {
    const off = await traceFor({ recent: [msg(100, "shared bathing")], config: { ...BASE_CFG, mode: "off" } });
    expect(off.surfaced).toBe(0);
    expect(off.poolSize).toBe(0);
    expect(off.note).toBe("mode off");

    // The control: identical fixtures + query, mode flipped to mixB → recall actually happens.
    const on = await traceFor({ recent: [msg(100, "shared bathing")], config: { ...BASE_CFG, mode: "mixB" } });
    expect(on.surfaced).toBeGreaterThan(0);
  });

  test("mixA / tiered are PURE-ASSEMBLY (no embed); mixA returns EVERY tier-0 block in order — diverging from mixB's one relevant scene", async () => {
    const a = await traceFor({ recent: [msg(100, "shared bathing")], config: { ...BASE_CFG, mode: "mixA" } });
    expect(a.queryEmbedded).toBe(false);
    expect(admitted(a)).toEqual([0, 1, 2, 3, 4, 5]);

    const tiered = await traceFor({ recent: [msg(100, "shared bathing")], config: { ...BASE_CFG, mode: "tiered" } });
    expect(tiered.queryEmbedded).toBe(false);

    // A retrieval mode embeds + returns the ONE relevant scene; a pure-assembly mode embeds nothing and returns
    // the whole corpus — the two mode families genuinely diverge on the same input.
    const b = await traceFor({ recent: [msg(100, "shared bathing")], config: { ...BASE_CFG, mode: "mixB" } });
    expect(b.queryEmbedded).toBe(true);
    expect(admitted(a)).not.toEqual(admitted(b));
  });

  test("mixB vs mixC DIVERGE on the same input — mixC routes through the cross-encoder rerank, mixB does not (digests.ts:86)", async () => {
    // A rerank that REVERSES the CSLS order — so any effect of the rerank stage is unmistakable in the output.
    const reversingRerank: RoleClients["rerank"] = (_query, documents) =>
      Promise.resolve({ hits: [...documents].reverse().map((d, i) => ({ id: d.id, score: i })), model: "test-rerank-model", usage: { totalTokens: null } });

    const b = admitted(
      await traceFor({ ctx: contextFor({ embedVector: labeledEmbedder }), recent: [msg(100, "shared bathing")], config: { ...BASE_CFG, mode: "mixB" } }),
    );
    const c = admitted(
      await traceFor({
        ctx: contextFor({ embedVector: labeledEmbedder, rerank: reversingRerank }),
        recent: [msg(100, "shared bathing")],
        config: { ...BASE_CFG, mode: "mixC" },
      }),
    );

    // Same candidates, same query — only the mode differs. mixB keeps CSLS order; mixC's rerank reordered it.
    expect(b.length).toBeGreaterThan(1);
    expect(c).toEqual([...b].reverse());
    expect(c).not.toEqual(b);
  });

  test("the queryWindow knob changes the effective query — a narrower window retrieves a DIFFERENT scene (query.ts:24)", async () => {
    // `recent` is oldest→newest: an earlier bath line, then a recent duel line. The query is the LAST
    // `queryWindow` messages, so the window size decides which scene the embedded query leans on.
    const recent = [msg(1, "shared bathing"), msg(2, "the fight on the bridge")];
    const narrow = admitted(await traceFor({ recent, config: { ...BASE_CFG, queryWindow: 1 } }));
    const wide = admitted(await traceFor({ recent, config: { ...BASE_CFG, queryWindow: 2 } }));

    expect(narrow.at(0)).toBe(2); // window=1 → only the recent duel line is in the query → the duel scene
    expect(wide.at(0)).toBe(0); // window=2 → the earlier bath line re-enters the window and dominates
    expect(narrow.at(0)).not.toBe(wide.at(0));
  });

  test("the retrieveK knob is a top-K retrieval CUT — retrieveK=1 keeps ONLY the top scene; raise it and the decoy returns (digests.ts)", async () => {
    // "shared bathing" → the bath scene (block 0) ranks first at ≈0.95, the storm decoy (block 4) second at
    // ≈0.32; minScore 0.05 admits BOTH. retrieveK cuts the ranked pool to its top-K, so it decides how many of
    // the admitted set actually reach the prompt — the neo "top retrieveK" retrieval count.
    const recent = [msg(100, "shared bathing")];
    const cut = admitted(await traceFor({ recent, config: { ...BASE_CFG, retrieveK: 1 } }));
    const wide = admitted(await traceFor({ recent, config: { ...BASE_CFG, retrieveK: 5 } }));
    expect(cut).toEqual([0]); // top-1 only — the storm decoy is scanned but past the cut
    expect(wide).toEqual([0, 4]); // retrieveK 5 ≥ 2 admitted ⇒ both the bath scene and the storm decoy
    expect(cut.length).not.toBe(wide.length); // the knob genuinely changes the surfaced count
  });

  test("the rerankTo knob is the mixC rerank CUT — rerankTo=1 keeps one after the cross-encoder; raise it and both survive (digests.ts:86)", async () => {
    // A rerank that REVERSES CSLS order, so the rerank stage's effect (and its cut) is unmistakable.
    const reversingRerank: RoleClients["rerank"] = (_query, documents) =>
      Promise.resolve({ hits: [...documents].reverse().map((d, i) => ({ id: d.id, score: i })), model: "test-rerank-model", usage: { totalTokens: null } });
    const recent = [msg(100, "shared bathing")];
    const one = admitted(
      await traceFor({
        ctx: contextFor({ embedVector: labeledEmbedder, rerank: reversingRerank }),
        recent,
        config: { ...BASE_CFG, mode: "mixC", rerankTo: 1 },
      }),
    );
    const both = admitted(
      await traceFor({
        ctx: contextFor({ embedVector: labeledEmbedder, rerank: reversingRerank }),
        recent,
        config: { ...BASE_CFG, mode: "mixC", rerankTo: 5 },
      }),
    );
    expect(one).toEqual([4]); // rerank reversed [0,4]→[4,0], cut to top-1 → [4]
    expect(both).toEqual([4, 0]); // rerankTo 5 ≥ 2 ⇒ both survive, in the reversed order
    expect(one.length).not.toBe(both.length); // the cut genuinely changes the surfaced count
  });

  test("the minScore floor is a GRADED count cut — raise it and exactly the strong match survives, raise it more and none do", async () => {
    // "shared bathing" → the bath scene at relevance ≈0.95, the storm decoy at ≈0.32, every other scene at 0.
    const recent = [msg(100, "shared bathing")];
    const low = admitted(await traceFor({ recent, config: { ...BASE_CFG, minScore: 0.05 } }));
    const mid = admitted(await traceFor({ recent, config: { ...BASE_CFG, minScore: 0.5 } }));
    const high = admitted(await traceFor({ recent, config: { ...BASE_CFG, minScore: 0.99 } }));

    expect(low).toEqual([0, 4]); // both the bath scene and the storm decoy clear a low floor
    expect(mid).toEqual([0]); // only the strong match clears 0.5 — exactly N=1
    expect(high).toEqual([]); // nothing clears 0.99 — exactly N=0
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// #321 / PD-35 — the experimental recencyBias boost that used to be pinned HERE was REMOVED with the knob
// (owner ruling 2026-08-22). The probe it existed to enable ran on the real corpus 2026-08-20 and found no
// human-relevance gain — same final top three at every bias in mixC, and a NET LOSS at a smaller retrieveK —
// so recall ordering is pure CSLS relevance again and there is no recency axis left to pin. The graded-boost
// crossover fixture (bath rel ≈0.949 vs the more-recent storm decoy ≈0.316) is preserved in the minScore-floor
// suite above, which is what it was really measuring.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// #330 P7 — the {{memory}} TEXT injects in CHRONOLOGICAL order for the embedding modes, while the trace keeps
// RETRIEVAL rank. A rank-ordered "story so far" reads as scrambled chronology to the model.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("mixB injection order — chronological TEXT, rank-ordered trace (#330 P7)", () => {
  test("a later block that RANKS first is injected AFTER the earlier decoy it outscored", async () => {
    // "sheltering from bad weather" → storm (block 4) target, bath (block 0) decoy: storm ranks first, both clear
    // the 0.05 floor. Retrieval rank is [4, 0]; chronological injection must be [0, 4].
    const { text, trace } = await recallMemory(evalContext(), {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      recent: [msg(100, "sheltering from bad weather")],
      names: new Map<CharacterId, string>(),
      config: { mode: "mixB", fanOut: 2, queryWindow: 4, minScore: 0.05 },
    });
    // The trace keeps RETRIEVAL rank — storm (4) first, bath decoy (0) second.
    expect(admitted(trace)).toEqual([4, 0]);
    // …but the injected TEXT reads oldest→newest: the bath scene (block 0) precedes the storm (block 4).
    const bathAt = text.indexOf("[the bath house]");
    const stormAt = text.indexOf("[the storm]");
    expect(bathAt).toBeGreaterThanOrEqual(0);
    expect(stormAt).toBeGreaterThan(bathAt);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// #314 — VALIDITY BOUNDARIES. These guards already exist; the coverage proves them by pinning the EXACT flip
// point of each — the boundary case on one side is excluded, one step over is included. (The build-side
// content-admission threshold the owner asked about is a separate finding — see the lane report; there is no
// content-quality floor to pin here, so none is invented.)
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("recall validity boundaries — each guard proven by a boundary case that FLIPS (#314)", () => {
  test("live-window guard boundary: a digest AT the cutoff is dropped, one seq PAST it is surfaced (window.ts inLiveWindow `>=`)", async () => {
    // The farewell scene is block 5, spanning seqs [21, 24] — its seqStart is 21.
    const atCutoff = admitted(await traceFor({ recent: [msg(100, "riding away at dawn")], config: BASE_CFG, liveWindowCutoffSeq: 21 }));
    expect(atCutoff).not.toContain(5); // seqStart 21 == cutoff 21 → still verbatim in the live window → dropped

    const pastCutoff = admitted(await traceFor({ recent: [msg(100, "riding away at dawn")], config: BASE_CFG, liveWindowCutoffSeq: 22 }));
    expect(pastCutoff).toContain(5); // seqStart 21 < cutoff 22 → aged out of the window → surfaced
  });

  test("witnessing horizon: a speaker cannot recall a scene past its LEAVE horizon; extend the horizon and the scene returns (recall.ts:73)", async () => {
    const recent = [msg(100, "riding away at dawn")]; // targets the farewell scene, block 5 (seqs 21-24)

    // Present only for seqs [1, 10): the farewell (seqs 21-24) is entirely past the leave point → unwitnessed.
    const leftEarly: readonly WitnessInterval[] = [{ joinSeq: 1, leftSeq: 10 }];
    const gone = admitted(await traceFor({ recent, config: BASE_CFG, witnessing: leftEarly }));
    expect(gone).not.toContain(5);

    // The control: same query, horizon extended to "still present" → the same scene is now recallable.
    const stayed: readonly WitnessInterval[] = [{ joinSeq: 1, leftSeq: null }];
    const seen = admitted(await traceFor({ recent, config: BASE_CFG, witnessing: stayed }));
    expect(seen).toContain(5);
  });
});
