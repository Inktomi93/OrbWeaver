/**
 * @module-tag live
 */
// @live MEMORY RECALL@K FLOOR — real embeddings, opt-in (E2E_LIVE=1), mirroring the `backend-matrix.live`
// convention: the default battery COLLECTS this file but every suite is skip-gated, so a routine `pnpm test`
// touches no engine. Run with:
//   E2E_LIVE=1 pnpm exec vitest run tests/e2e/memory-recall-eval.live.int.test.ts
//
// WHAT IT PROVES that the deterministic tier cannot (#251): that REAL SENTENCE EMBEDDINGS of real scene prose
// retrieve the right scene for a human-written query. The deterministic tier
// (`tests/server/domain/chat/memory/recall/recall-eval.int.test.ts`) owns the regression net over fixture
// vectors — it can prove the ranking MACHINERY is correct and nothing at all about whether the embedding
// space is. This tier is the drift detector: a swapped embed model, a changed instruction prefix, a pooling
// regression, or a dimension change shows up here as a recall@k drop and nowhere else.
//
// EMBED + RERANK ONLY — no generative turn (no summarizer, no chat model): the labels are HAND-WRITTEN below,
// not model-produced, so this suite costs one embed call per document plus one per query, and never touches
// the gen engine.
//
// The floor is a FLOOR, not a snapshot. A real space is allowed to shuffle near-ties; it is not allowed to
// lose the scene entirely. recall@1 is asserted at 5/6 and recall@3 at 6/6 — a miss on either is a REAL
// retrieval regression worth a human look, which is the whole point of having a number.

import type { EmbedResult } from "@orb/contracts/providers";
import type { MemoryQueryOptions, ScoredBlock } from "@orb/contracts/search";
import type { Db } from "@orb/db";
import type { CharacterId, Handle, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env as orbEnv } from "@orb/server/foundation/env";
import { createBackendRegistry, createProviderExecutor } from "@orb/server/infra/providers";
import { beforeAll, describe } from "vitest";
import { recallMemory } from "../../packages/server/src/domain/chat/memory/recall/recall.ts";
import type { MsgRow } from "../../packages/server/src/domain/chat/memory/types.ts";
import { makeChatContext, seedCharacter, seedChat, seedUser } from "../server/domain/chat/_support.ts";
import { GROUP_CHAR, seedSegment, sharedScope } from "../server/domain/chat/memory/_support.ts";
import { makeSearch, seedChatDigest } from "../server/domain/search/_support.ts";
import { freshDb } from "../support/db.ts";
import { makeResolvedCredential } from "../support/factories/resolved-connection.ts";
import { expect, test } from "../support/fixtures.ts";

const EMBED_TIMEOUT_MS = 120_000;

/** The labeled corpus: six DISTINCT scenes as a digest body would actually read (the distilled anchor +
 *  facts shape `{{memory}}` renders), so the vectors under test are vectors of real prose. */
const SCENES = [
  { blockIdx: 0, text: "[the bath house] Mara and Niko share the steaming pool at the inn, trading stories until the water goes cold." },
  { blockIdx: 1, text: "[the night market] Haggling over lantern oil with a one-eyed merchant; Niko overpays and pretends he did not." },
  { blockIdx: 2, text: "[the duel on the bridge] Mara wins the bout, disarming the mercenary captain with a turn of the wrist." },
  { blockIdx: 3, text: "[the roadside shrine] An offering of rice and copper left for the road spirits before the pass." },
  { blockIdx: 4, text: "[the storm] The caravan shelters under a cliff overhang while hail strips the leaves from the trees." },
  { blockIdx: 5, text: "[the farewell] Niko rides north alone at dawn, leaving his cloak folded on the saddle." },
] as const;

/** The labeled queries — a human's words for the scene, never the scene's own words. `expect` is the ONE
 *  right answer, chosen by reading the corpus (the forensics' checkable-answer method). */
const QUERIES = [
  { text: "when did they bathe together?", expectBlockIdx: 0 },
  { text: "buying fuel for the lamps", expectBlockIdx: 1 },
  { text: "the swordfight over the river", expectBlockIdx: 2 },
  { text: "leaving an offering to the spirits", expectBlockIdx: 3 },
  { text: "taking cover from the hail", expectBlockIdx: 4 },
  { text: "when Niko left", expectBlockIdx: 5 },
] as const;

const RECALL_AT_1_FLOOR = 5;
const RECALL_AT_3_FLOOR = 6;

let db: Db;
let chatId: Awaited<ReturnType<typeof seedChat>>;
let embedModel = "";
/** query text → its REAL embedding, pre-computed in `beforeAll` (the search harness's embedder seam is
 *  synchronous, and a live embed is not — so the async half happens once, up front). */
const queryVectors = new Map<string, Float32Array>();

async function embedAll(inputs: readonly string[], inputType: "query" | "document"): Promise<EmbedResult> {
  const { backends } = createBackendRegistry({ now: () => Date.now(), vllmDisabled: false });
  const executor = createProviderExecutor({ backends });
  // The deployment's OWN resolved embed model (the `backend-matrix.live` precedent for reading `orbEnv`) —
  // never a hardcoded id, so the floor is measured against whatever the box actually serves.
  return await executor.embed({ credential: makeResolvedCredential("vllm"), model: castId<ModelId>(orbEnv.VLLM_EMBED_MODEL), input: [...inputs], inputType });
}

describe("memory recall@k — LIVE embed floor (#251)", () => {
  beforeAll(async () => {
    db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("owner"));
    await seedCharacter(db, owner, "group");
    chatId = await seedChat(db, "liveeval");

    const documents = await embedAll(
      SCENES.map((s) => s.text),
      "document",
    );
    embedModel = documents.model;
    for (const [i, scene] of SCENES.entries()) {
      const vector = documents.vectors[i];
      expect(vector, `the embed engine returned no vector for scene ${scene.blockIdx}`).not.toBeNull();
      await seedChatDigest(db, {
        chatId,
        scopedCharacterId: GROUP_CHAR,
        blockIdx: scene.blockIdx,
        text: scene.text,
        embedding: vector ?? new Float32Array(),
        model: embedModel,
      });
      // The verbatim span the live-window guard reads: block N covers seqs [4N+1, 4N+4].
      await seedSegment(db, { chatId, blockIdx: scene.blockIdx, seqStart: scene.blockIdx * 4 + 1, seqEnd: scene.blockIdx * 4 + 4 });
    }

    const queries = await embedAll(
      QUERIES.map((q) => q.text),
      "query",
    );
    for (const [i, query] of QUERIES.entries()) {
      const vector = queries.vectors[i];
      expect(vector, `the embed engine returned no vector for query "${query.text}"`).not.toBeNull();
      if (vector !== null && vector !== undefined) {
        queryVectors.set(query.text, vector);
      }
    }
  }, EMBED_TIMEOUT_MS);

  /** One recall through the REAL path (real cosine, real CSLS, real bridge candidacy) over the REAL vectors
   *  embedded above — only the embed CALL is pre-resolved, because the harness's embedder seam is sync. */
  async function recallFor(queryText: string, over?: { readonly liveWindowCutoffSeq?: number }): Promise<Awaited<ReturnType<typeof recallMemory>>["trace"]> {
    const search = makeSearch(db, {
      embedVector: (input: string): Float32Array<ArrayBuffer> | null => {
        const hit = [...queryVectors.entries()].find(([text]) => input.includes(text));
        return (hit?.[1] as Float32Array<ArrayBuffer> | undefined) ?? null;
      },
      embedModel,
    });
    const ctx = makeChatContext(db, {
      // #405 F3 — the eval binds a THROWING observer. On the LIVE tier this is the one that actually bites:
      // a real reranker that is down makes `digests` keep the vector order silently, and the run publishes
      // mixB numbers under a mixC label. An eval measures what it says it measures or it fails loudly.
      searchDigests: (query: MemoryQueryOptions): Promise<readonly ScoredBlock[]> =>
        search
          .digests(query, {
            onRerankUnavailable: (): never => {
              throw new Error("eval: the rerank degraded to vector order — this run would report mixB numbers as mixC");
            },
          })
          .then((hits) => hits.map((h) => ({ blockKey: h.blockKey, score: h.score, relevance: h.relevance }))),
    });
    const recent: MsgRow[] = [{ seq: 1, role: "user", kind: "standard", characterId: null, authorUserId: null, personaId: null, content: queryText }];
    const { trace } = await recallMemory(ctx, {
      scope: sharedScope(chatId),
      groupCharacterId: GROUP_CHAR,
      recent,
      names: new Map<CharacterId, string>(),
      config: { mode: "mixB", fanOut: 2, queryWindow: 4, minScore: 0.05 },
      ...(over?.liveWindowCutoffSeq === undefined ? {} : { liveWindowCutoffSeq: over.liveWindowCutoffSeq }),
    });
    return trace;
  }

  /** The ADMITTED block indexes in rank order. */
  async function rankedBlocks(queryText: string): Promise<readonly number[]> {
    const trace = await recallFor(queryText);
    return trace.candidates.filter((c) => c.verdict === "admitted").map((c) => c.blockIdx);
  }

  test(
    "recall@1 and recall@3 clear their floors over the labeled set",
    async () => {
      const results: { query: string; ranked: readonly number[]; expected: number }[] = [];
      for (const q of QUERIES) {
        const ranked = await rankedBlocks(q.text);
        results.push({ query: q.text, ranked, expected: q.expectBlockIdx });
      }
      const at1 = results.filter((r) => r.ranked.at(0) === r.expected);
      const at3 = results.filter((r) => r.ranked.slice(0, 3).includes(r.expected));
      // The misses are NAMED in the failure message: a bare "4 < 5" tells an operator nothing about which
      // query drifted, which is the one thing they need to judge whether the space moved or the labels are wrong.
      const missed1 = results.filter((r) => r.ranked.at(0) !== r.expected).map((r) => `${r.query} → ${String(r.ranked.at(0))} (want ${r.expected})`);
      expect(at1.length, `recall@1 misses: ${missed1.join(" · ")}`).toBeGreaterThanOrEqual(RECALL_AT_1_FLOOR);
      expect(
        at3.length,
        `recall@3 misses: ${results
          .filter((r) => !r.ranked.slice(0, 3).includes(r.expected))
          .map((r) => r.query)
          .join(" · ")}`,
      ).toBeGreaterThanOrEqual(RECALL_AT_3_FLOOR);
    },
    EMBED_TIMEOUT_MS,
  );

  test(
    "the recall TRACE explains the live result — every admitted block carries the relevance it won on",
    async () => {
      const trace = await recallFor("when did they bathe together?");
      const admitted = trace.candidates.filter((c) => c.verdict === "admitted");
      expect(admitted.length).toBeGreaterThan(0);
      for (const candidate of admitted) {
        expect(candidate.relevance).toBeGreaterThan(0);
        expect(candidate.rank).toBeGreaterThanOrEqual(0);
      }
      expect(trace.queryEmbedded).toBe(true);
      expect(trace.queryText).toContain("bathe");
    },
    EMBED_TIMEOUT_MS,
  );

  test(
    "the live-window guard operates over REAL vectors — everything in-window recalls NOTHING; nothing in-window recalls something (#314)",
    async () => {
      // Drift-robust by construction (no ranking or threshold assumption): a very LOW cutoff puts every scene
      // still inside this turn's live history window → `{{memory}}` must inject none of them; a very HIGH cutoff
      // ages them all out → recall proceeds normally. The guard's effect is thus visible end-to-end on the real
      // retrieval path without depending on WHICH scene the embedding space ranks first.
      const allInWindow = await recallFor("when Niko left", { liveWindowCutoffSeq: 1 });
      expect(allInWindow.surfaced).toBe(0);

      const noneInWindow = await recallFor("when Niko left", { liveWindowCutoffSeq: 10_000 });
      expect(noneInWindow.surfaced).toBeGreaterThan(0);
    },
    EMBED_TIMEOUT_MS,
  );
});
