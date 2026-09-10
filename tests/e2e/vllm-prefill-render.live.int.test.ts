/**
 * @module-tag live
 */
// @live THE PREFILL RENDER PROOF (#287) — the measurement `VLLM_TURNS.assistantPrefill: true` and the
// surface's `reasoning_dropped_for_prefill` warning REST ON, executable. Opt-in (E2E_LIVE=1), mirroring the
// `@live` convention: the default battery collects this file and skips every suite, so `pnpm test` never
// needs a GPU. Run with:
//   E2E_LIVE=1 pnpm exec vitest run --config vitest.config.ts tests/e2e/vllm-prefill-render.live.int.test.ts
//
// THE INSTRUMENT IS `/tokenize`, deliberately: it runs the SAME chat template the completion path runs and
// returns the rendered token strings without generating — so the assertions are about the RENDER, which is
// where the capability actually lives, and they cost nothing. Only the last suite generates (two tiny
// seed-pinned turns, max_tokens 40), because "the reply lands in the wrong channel" is not visible in a render.
//
// WHAT IT PINS, and why each is load-bearing:
//   1. WITHOUT the flags a delivered trailing-assistant row renders CLOSED + a fresh assistant header — the
//      fence a GROUP round depends on (an assistant-last conversation must open a NEW turn). This is also the
//      exact render that made the pre-2026-08-19 `assistantPrefill:false` cell honest.
//   2. WITH `continue_final_message` + `add_generation_prompt:false` it renders OPEN — the model continues the
//      row it was handed. This is the flip.
//   3. A BARE-CONTENT prefill gets the template's injected, already-CLOSED `<think></think>` scaffold (this
//      checkpoint EOSes an assistant turn that lacks one), with thinking off AND on.
//   4. …which is why thinking must be dropped on a content prefill: told `enable_thinking:true`, vLLM's qwen3
//      reasoning parser classifies the whole continuation as reasoning until a `</think>` that never comes.
//      `content: null`. The surface's warning exists for exactly this.
//
// It runs against whatever checkpoint the gen slot serves. A FAILURE here is a real finding either way: the
// template lost the continuation arm (the capability cell is now a lie) or the checkpoint changed under it.

import { env as orbEnv } from "@orb/server/foundation/env";
import { describe, expect, test } from "vitest";

const BASE = `http://${orbEnv.VLLM_ENGINE_HOST}:${orbEnv.VLLM_GEN_PORT}`;
const RENDER_TIMEOUT_MS = 60_000;
const TURN_TIMEOUT_MS = 300_000;

const PREFILL_TEXT = "The rain fell";
const MESSAGES = [
  { role: "system", content: "You are Aria, terse." },
  { role: "user", content: "Tell me about the rain." },
  { role: "assistant", content: PREFILL_TEXT },
];
// Built from ENTRIES, like every other vendor-spelled blob in the suites: these are literal snake_case ENGINE
// field names (the exact bytes the wire takes), not JS identifiers, so object literals would trip naming.
//
// The two flags travel together or not at all — vLLM refuses `continue_final_message` alongside a true
// `add_generation_prompt`, and the template's arm reads BOTH.
const CONTINUE_FLAGS: Record<string, unknown> = Object.fromEntries([
  ["continue_final_message", true],
  ["add_generation_prompt", false],
]);
const THINKING_KWARGS: Record<string, unknown> = Object.fromEntries([
  [
    "chat_template_kwargs",
    Object.fromEntries([
      ["enable_thinking", true],
      ["reasoning_effort", "low"],
    ]),
  ],
]);
/** The content-prefill render fingerprint: one assistant header, the template's CLOSED think scaffold, then
 *  the delivered text with nothing after it. */
const CLOSED_SCAFFOLD_TAIL_RE = /<\|im_start\|>assistant\n<think>\s*<\/think>\s*The rain fell$/u;

/** The gen slot's served model id (the engine owns it — never a hardcoded checkpoint name here). */
async function servedModel(): Promise<string> {
  const res = await fetch(`${BASE}/v1/models`);
  const body = (await res.json()) as { data?: { id?: string }[] };
  const id = body.data?.[0]?.id;
  if (id === undefined) {
    throw new Error(`gen engine at ${BASE} served no model id`);
  }
  return id;
}

/** vLLM's `/tokenize` reply — the rendered prompt as token strings. */
interface TokenizeReply {
  // biome-ignore lint/style/useNamingConvention: the literal vLLM response field (snake_case by protocol).
  readonly token_strs?: string[];
}
/** One chat-completions reply, narrowed to the two channels the reasoning parser splits it into. */
interface CompletionReply {
  readonly choices?: {
    readonly message?: {
      readonly content?: string | null;
      /** vLLM 0.26 names the reasoning channel `reasoning`; older builds used `reasoning_content`. BOTH are
       *  read (new name first) — the same dual read the vLLM chat surface does on the streaming deltas, for
       *  the same reason: a single-name read silently sees an empty channel and the assertion inverts. */
      readonly reasoning?: string | null;
      // biome-ignore lint/style/useNamingConvention: the literal vLLM response field (snake_case by protocol).
      readonly reasoning_content?: string | null;
    };
  }[];
}

/** POST a JSON body to the gen engine and parse the reply. */
async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: await servedModel(), messages: MESSAGES, ...body }),
  });
  return (await res.json()) as T;
}

/** The RENDERED prompt for these messages + flags, reassembled from `/tokenize`'s token strings. */
async function render(extra: Record<string, unknown>): Promise<string> {
  const body = await post<TokenizeReply>("/tokenize", { ...Object.fromEntries([["return_token_strs", true]]), ...extra });
  const tokens = body.token_strs;
  if (tokens === undefined) {
    throw new Error(`/tokenize returned no token_strs: ${JSON.stringify(body).slice(0, 300)}`);
  }
  // The tokenizer's byte-level marks for newline/space — restored so the assertions read as the prompt text.
  return tokens.join("").replaceAll("Ċ", "\n").replaceAll("Ġ", " ");
}

/** One tiny seed-pinned continuation; returns the two channels the reasoning parser splits the reply into. */
async function continueTurn(extra: Record<string, unknown>): Promise<{ content: string | null; reasoning: string | null }> {
  const sampling = Object.fromEntries([
    ["temperature", 0],
    ["seed", 7],
    ["max_tokens", 40],
  ]);
  const body = await post<CompletionReply>("/v1/chat/completions", { ...CONTINUE_FLAGS, ...sampling, ...extra });
  const message = body.choices?.[0]?.message;
  return { content: message?.content ?? null, reasoning: message?.reasoning ?? message?.reasoning_content ?? null };
}

describe("@live vLLM prefill RENDER — the two arms of the assistantPrefill measurement (#287)", () => {
  test(
    "WITHOUT the flags: the trailing assistant row is CLOSED and a fresh assistant header follows (the group-turn fence)",
    async () => {
      const prompt = await render({});
      expect(prompt).toContain("The rain fell<|im_end|>");
      // A fresh turn opens after it — the delivered row became history, which is what a group round needs.
      expect(prompt.slice(prompt.indexOf("The rain fell"))).toContain("<|im_start|>assistant");
      expect(prompt.endsWith("The rain fell")).toBe(false);
    },
    RENDER_TIMEOUT_MS,
  );

  test(
    "WITH the flags: the render ENDS on the delivered text — no `<|im_end|>`, no fresh header (the prefill)",
    async () => {
      const prompt = await render(CONTINUE_FLAGS);
      expect(prompt.endsWith("The rain fell")).toBe(true);
      // Exactly one assistant block: the delivered row IS the open turn.
      expect(prompt.split("<|im_start|>assistant").length - 1).toBe(1);
    },
    RENDER_TIMEOUT_MS,
  );

  test(
    "a CONTENT prefill carries the template's injected, already-CLOSED think scaffold — with thinking OFF and ON",
    async () => {
      const off = await render(CONTINUE_FLAGS);
      const on = await render({ ...CONTINUE_FLAGS, ...THINKING_KWARGS });
      for (const prompt of [off, on]) {
        // The scaffold sits between the assistant header and the delivered text: the model is structurally
        // done reasoning before it writes a token (this checkpoint EOSes an assistant turn lacking one).
        expect(prompt).toMatch(CLOSED_SCAFFOLD_TAIL_RE);
      }
      // …and thinking ON is not a no-op elsewhere: the effort instruction really did reach the render, so the
      // closed scaffold above is the TEMPLATE's decision, not a dropped kwarg.
      expect(on).toContain("Reasoning effort is set to low");
    },
    RENDER_TIMEOUT_MS,
  );
});

describe("@live vLLM prefill × thinking — the channel measurement behind `reasoning_dropped_for_prefill`", () => {
  test(
    "thinking OFF: the continuation lands in `content` (a usable reply)",
    async () => {
      const { content } = await continueTurn({});
      expect(content?.length ?? 0).toBeGreaterThan(0);
      // A CONTINUATION, not a re-generation: the model must not restate the prefill it was handed.
      expect(content).not.toContain("The rain fell");
    },
    TURN_TIMEOUT_MS,
  );

  test(
    "thinking ON: the identical turn returns NO content — the whole continuation is captured as reasoning",
    async () => {
      const { content, reasoning } = await continueTurn(THINKING_KWARGS);
      expect(content === null || content.length === 0).toBe(true);
      expect(reasoning?.length ?? 0).toBeGreaterThan(0);
    },
    TURN_TIMEOUT_MS,
  );
});
