import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroNameContext, RowPersonaName } from "@orb/kit/macro";
import { describe } from "vitest";
import { estimateTokens } from "@orb/kit/tokens";
import {
  chunkBlockForEmbedWindow,
  DEFAULT_OUTPUT_RESERVE_TOKENS,
  fitBlockToBudget,
  MAX_SEGMENT_CHUNKS_PER_BLOCK,
  SUMMARIZER_CONTEXT_FLOOR,
} from "../../../../../../../packages/server/src/domain/chat/memory/build/substrate/token-guard.ts";
import { renderTranscript } from "../../../../../../../packages/server/src/domain/chat/memory/build/substrate/transcript.ts";
import type { MsgRow } from "../../../../../../../packages/server/src/domain/chat/memory/types.ts";
import { expect, test } from "../../../../../../support/fixtures.ts";

const aria = castId<CharacterId>("character_aria");
const names: RowMacroNameContext = {
  characterNamesById: new Map([[aria, { name: "Aria" }]]),
  personaNamesById: new Map<PersonaId, RowPersonaName>(),
};

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

describe("memory/build/substrate/token-guard", () => {
  test("a block that fits the budget is returned unchanged", () => {
    const rows = [row(1, "hello"), row(2, "there")];
    expect(fitBlockToBudget(rows, names, 32_000, 100, DEFAULT_OUTPUT_RESERVE_TOKENS)).toEqual(rows);
  });

  test("trim-to-fit drops the OLDEST messages until the transcript fits (never truncates the tail)", () => {
    const rows = [row(1, "a".repeat(4000)), row(2, "short")];
    // A budget that fits "Aria: short" but not the giant oldest message ⇒ the oldest is dropped.
    const fitted = fitBlockToBudget(rows, names, 1100, 0, DEFAULT_OUTPUT_RESERVE_TOKENS);
    expect(fitted).not.toBeNull();
    expect(fitted?.map((r) => r.seq)).toEqual([2]);
  });

  test("skip-and-flag: when even the newest single message overflows, returns null (no silent truncation)", () => {
    const rows = [row(1, "a".repeat(4000)), row(2, "b".repeat(4000))];
    expect(fitBlockToBudget(rows, names, 64, 0, DEFAULT_OUTPUT_RESERVE_TOKENS)).toBeNull();
  });

  test("a non-positive budget (system prompt + reserve exceed the context) returns null", () => {
    expect(fitBlockToBudget([row(1, "x")], names, 100, 5000, DEFAULT_OUTPUT_RESERVE_TOKENS)).toBeNull();
  });

  test("the §10 context floor is a positive constant the build's soft-warning compares against", () => {
    expect(SUMMARIZER_CONTEXT_FLOOR).toBeGreaterThan(0);
  });
});

// THE CHUNKER (#172) — the segment counterpart of `fitBlockToBudget`, and deliberately NOT a fitter: a
// segment is verbatim ground truth, so an over-window block is CUT INTO PIECES, never trimmed or clamped
// ("if we are skimping out on messages that's a no go since this feeds the memory system", owner, #165).
describe("memory/build/substrate/token-guard — chunkBlockForEmbedWindow", () => {
  test("a block that fits is ONE chunk carrying the whole block's span + the byte-identical transcript", () => {
    const rows = [row(1, "hello"), row(2, "there")];
    const chunks = chunkBlockForEmbedWindow(rows, names, 8192);
    expect(chunks).toEqual([{ chunkIdx: 0, seqStart: 1, seqEnd: 2, text: renderTranscript(rows, names) }]);
  });

  test("an over-window block cuts at MESSAGE boundaries — each chunk's span is exactly what its text holds", () => {
    const rows = [row(1, "a".repeat(2000)), row(2, "b".repeat(2000)), row(3, "c".repeat(2000))];
    // ~500 tokens per row; a 700-token window fits ONE row per chunk (minus the scaffold reserve).
    const chunks = chunkBlockForEmbedWindow(rows, names, 700);
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
});
