import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroNameContext, RowPersonaName } from "@orb/kit/macro";
import { estimateTokens, safeTokenWindow } from "@orb/kit/tokens";
import { describe } from "vitest";
import {
  chunkBlockForEmbedWindow,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  fitBlockToBudget,
  MAX_SEGMENT_CHUNKS_PER_BLOCK,
  SUMMARIZER_CONTEXT_FLOOR,
} from "../../../../../../../packages/server/src/domain/chat/memory/generate/substrate/token-guard.ts";
import { renderTranscript } from "../../../../../../../packages/server/src/domain/chat/memory/generate/substrate/transcript.ts";
import type { MsgRow, SummarizerBudget } from "../../../../../../../packages/server/src/domain/chat/memory/types.ts";
import { expect, test } from "../../../../../../support/fixtures.ts";

const aria = castId<CharacterId>("character_aria");
const names: RowMacroNameContext = {
  characterNamesById: new Map([[aria, { name: "Aria" }]]),
  personaNamesById: new Map<PersonaId, RowPersonaName>(),
};

/** The token-guard budget under test — the output reserve is the production default at every call site, so
 *  only the context + system-prompt halves vary per case. */
function budget(contextTokens: number, systemPromptTokens: number): SummarizerBudget {
  return { contextTokens, systemPromptTokens, outputReserveTokens: DEFAULT_OUTPUT_RESERVE_TOKENS };
}

function row(seq: number, content: string): MsgRow {
  return {
    seq,
    role: "assistant",
    kind: "standard",
    characterId: aria,
    authorUserId: null,
    personaId: null,
    content,
  };
}

describe("memory/generate/substrate/token-guard", () => {
  test("a block that fits the budget is returned unchanged", () => {
    const rows = [row(1, "hello"), row(2, "there")];
    expect(fitBlockToBudget(rows, names, budget(32_000, 100))).toEqual(rows);
  });

  test("trim-to-fit drops the OLDEST messages until the transcript fits (never truncates the tail)", () => {
    const rows = [row(1, "a".repeat(4000)), row(2, "short")];
    // A budget that fits "Aria: short" but not the giant oldest message ⇒ the oldest is dropped.
    const fitted = fitBlockToBudget(rows, names, budget(1100, 0));
    expect(fitted).not.toBeNull();
    expect(fitted?.map((r) => r.seq)).toEqual([2]);
  });

  test("skip-and-flag: when even the newest single message overflows, returns null (no silent truncation)", () => {
    const rows = [row(1, "a".repeat(4000)), row(2, "b".repeat(4000))];
    expect(fitBlockToBudget(rows, names, budget(64, 0))).toBeNull();
  });

  test("a non-positive budget (system prompt + reserve exceed the context) returns null", () => {
    expect(fitBlockToBudget([row(1, "x")], names, budget(100, 5000))).toBeNull();
  });

  test("the §10 context floor is a positive constant the build's soft-warning compares against", () => {
    expect(SUMMARIZER_CONTEXT_FLOOR).toBeGreaterThan(0);
  });
});

// THE CHUNKER (#172) — the segment counterpart of `fitBlockToBudget`, and deliberately NOT a fitter: a
// segment is verbatim ground truth, so an over-window block is CUT INTO PIECES, never trimmed or clamped
// ("if we are skimping out on messages that's a no go since this feeds the memory system", owner, #165).
describe("memory/generate/substrate/token-guard — chunkBlockForEmbedWindow", () => {
  test("a block that fits is ONE chunk carrying the whole block's span + the byte-identical transcript", () => {
    const rows = [row(1, "hello"), row(2, "there")];
    const chunks = chunkBlockForEmbedWindow(rows, names, 8192);
    expect(chunks).toEqual([{ chunkIdx: 0, seqStart: 1, seqEnd: 2, text: renderTranscript(rows, names) }]);
  });

  test("an over-window block cuts at MESSAGE boundaries — each chunk's span is exactly what its text holds", () => {
    const rows = [row(1, "a".repeat(2000)), row(2, "b".repeat(2000)), row(3, "c".repeat(2000))];
    // ~500 tokens per row; a 1000-token window fits ONE row per chunk (minus the headroom discount + the
    // scaffold reserve — 1000 × 0.7 − 64 = 636, #187).
    const chunks = chunkBlockForEmbedWindow(rows, names, 1000);
    expect(chunks).not.toBeNull();
    expect(chunks?.map((c) => [c.chunkIdx, c.seqStart, c.seqEnd])).toEqual([
      [0, 1, 1],
      [1, 2, 2],
      [2, 3, 3],
    ]);
    // SPAN HONESTY: chunk 1 holds message 2's body and nothing else.
    expect(chunks?.[1]?.text).toBe(`Aria: ${"b".repeat(2000)}`);
  });

  test("a SINGLE message bigger than the window is split into labelled pieces — nothing is dropped", () => {
    const body = "x".repeat(8000); // ~2000 tokens, well past the 700-token test window
    const chunks = chunkBlockForEmbedWindow([row(1, body)], names, 700);
    expect(chunks).not.toBeNull();
    expect((chunks ?? []).length).toBeGreaterThan(1);
    // Every piece re-carries the speaker label (an unlabelled tail would embed as anonymous prose)…
    expect((chunks ?? []).every((c) => c.text.startsWith("Aria: "))).toBe(true);
    // …and the pieces reassemble the body EXACTLY: chunking loses nothing.
    expect((chunks ?? []).map((c) => c.text.slice("Aria: ".length)).join("")).toBe(body);
    // The span stays honest at the finest granularity available: all pieces are message 1.
    expect((chunks ?? []).every((c) => c.seqStart === 1 && c.seqEnd === 1)).toBe(true);
  });

  test("every chunk fits the window (the guard's whole job)", () => {
    const rows = [row(1, "y".repeat(20_000)), row(2, "z".repeat(500))];
    const chunks = chunkBlockForEmbedWindow(rows, names, 700) ?? [];
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => estimateTokens(c.text) <= 700)).toBe(true);
  });

  test("past the PATHOLOGICAL ceiling the block is un-chunkable ⇒ null (the caller skips-and-records)", () => {
    // One message needing far more than MAX_SEGMENT_CHUNKS_PER_BLOCK pieces at this window.
    const rows = [row(1, "q".repeat(4000 * (MAX_SEGMENT_CHUNKS_PER_BLOCK + 4)))];
    expect(chunkBlockForEmbedWindow(rows, names, 700)).toBeNull();
  });

  test("a non-positive window (an absurd config) returns null rather than an empty vector set", () => {
    expect(chunkBlockForEmbedWindow([row(1, "x")], names, 8)).toBeNull();
  });

  // #187 — the chunk budget must clear the engine's REAL tokenizer, not just this estimator. Measured live
  // (Qwen3-VL-Embedding-2B, max_model_len 8192): 6 of the corpus's 30 largest blocks, cut to the estimator's
  // own `window - 64`, were refused HTTP 400 "at least 8193 input tokens" — the wall waiting behind the 120s
  // timeout this issue is about. So every chunk stays inside the HEADROOM-discounted window.
  test("every chunk fits the headroom-discounted window, not just the raw one (#187)", () => {
    const rows = [row(1, "y".repeat(20_000)), row(2, "z".repeat(500))];
    const chunks = chunkBlockForEmbedWindow(rows, names, 1000) ?? [];
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => estimateTokens(c.text) <= safeTokenWindow(1000))).toBe(true);
  });
});
