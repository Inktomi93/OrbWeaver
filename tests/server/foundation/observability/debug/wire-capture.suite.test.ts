/**
 * @module-tag requires-process-chdir
 */
// foundation/observability/debug/wire-capture — WIRE-OUTCOMES (dogfood-tracking.md): the three owed pins the
// ring-mechanics suite (wire-capture.test.ts) doesn't cover, because they need the OUTCOME arm live:
//   1. an outcome is recorded for a REFUSED turn (empty content, finishReason populated) — the whole point of
//      the arm: a refusal used to leave zero server-side trace.
//   2. the spill rotates at the byte cap (mocked node:fs/promises — writing 32 MiB for real would be slow and
//      brittle; the mock controls what `stat` reports so the rotation branch is exercised deterministically).
//   3. the GATING ASYMMETRY the file header documents as a real decision, not a surprise: `recordWireCapture`
//      (the request sink) is unconditional — compose decides whether to call it — while `recordTurnOutcome`
//      self-gates on `isWireCaptureEnabled()` because it has no compose seam of its own.
//
// `isWireCaptureEnabled()` reads the frozen `env` singleton, so exercising the "capture ON" arm needs a fresh
// module graph under a controlled `process.env` — the same `vi.resetModules()` + dynamic-reimport pattern
// `tests/server/foundation/env/index.test.ts` uses, extended to reimport the observability barrel (which
// transitively reimports env) rather than env alone.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { budget } from "@orb/tooling/_shared/load-budget";
import { afterAll, afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT_A = castId<ChatId>("chat_a");

// EVERY test here pays a `vi.resetModules()` + dynamic `import("@orb/server/foundation/observability")` —
// a fresh transform of the WHOLE barrel's graph, not a cache hit. Measured cold (immediately after an edit
// anywhere in that graph, the shape the state-bleed fold hit): a single reimport ran 6.5-6.9s even at a
// modest ~1.5x load factor, and the fold that filed #1810 measured 48s cold vs 12s warm under heavier
// contention — both comfortably past the project's scaled 5s `testTimeout` default. `vi.setConfig`, not a
// hoisted `beforeAll` warm: each test needs its OWN fresh module graph (a different `WIRE_CAPTURE` env or a
// different `node:fs/promises` mock per test), so there is no shared warm import to hoist without changing
// what the suite proves.
vi.setConfig({ testTimeout: budget(60_000) });

const EMPTY_DIR = mkdtempSync(join(tmpdir(), "orb-wire-outcomes-"));
afterAll(() => {
  rmSync(EMPTY_DIR, { recursive: true, force: true });
});

/** Reimport the observability barrel under a controlled env — mirrors `reimportEnvWith` in
 *  `tests/server/foundation/env/index.test.ts`, but reimports the barrel that consumes `env` (wire-capture is
 *  a downstream module of the frozen env singleton, not env itself). */
// biome-ignore-start lint/style/noProcessEnv: this test DRIVES the env reimport by crafting process.env, the same seam `tests/server/foundation/env/index.test.ts` uses.
async function reimportWireCaptureWith(wireCapture: "on" | "off"): Promise<typeof import("@orb/server/foundation/observability")> {
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  process.env["VITEST"] = "1";
  process.env["WIRE_CAPTURE"] = wireCapture;
  vi.resetModules();
  const previousCwd = process.cwd();
  process.chdir(EMPTY_DIR);
  try {
    return await import("@orb/server/foundation/observability");
  } finally {
    process.chdir(previousCwd);
  }
}
// biome-ignore-end lint/style/noProcessEnv: end of the block above

describe("wire-capture OUTCOME arm + spill (WIRE-OUTCOMES)", () => {
  let snapshot: Record<string, string | undefined>;

  // biome-ignore-start lint/style/noProcessEnv: this test DRIVES the env reimport by crafting process.env, the same seam `tests/server/foundation/env/index.test.ts` uses.
  beforeEach(() => {
    snapshot = { ...process.env };
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    Object.assign(process.env, snapshot);
    vi.resetModules();
  });
  // biome-ignore-end lint/style/noProcessEnv: end of the block above

  test("with capture ON: an outcome is recorded for a REFUSED (zero-content) turn and reads back", async () => {
    const wc = await reimportWireCaptureWith("on");
    wc.resetWireCaptures();
    wc.recordTurnOutcome({
      chatId: CHAT_A,
      at: 0,
      model: "test-model",
      disposition: "completed",
      finishReason: "tool",
      stopReason: "tool_calls",
      terminalReason: null,
      contentChars: 0,
      reasoningChars: 42,
      tokensOut: 157,
      maxOutputTokens: 4096,
      modelCalls: 2,
      reasoningEffort: "medium",
      toolCalls: [{ name: "update_scene", args: '{"location":"the ford"}' }],
      warnings: [],
    });
    const [outcome] = wc.recentTurnOutcomes({ chatId: CHAT_A });
    expect(outcome).toMatchObject({
      chatId: CHAT_A,
      disposition: "completed",
      finishReason: "tool",
      stopReason: "tool_calls",
      contentChars: 0,
      // The DENOMINATOR for `tokensOut` (a sum across the turn's model calls) against `maxOutputTokens`
      // (a per-call ceiling) — without it a multi-call turn reads as an ignored output cap.
      modelCalls: 2,
      toolCalls: [{ name: "update_scene", args: '{"location":"the ford"}' }],
      warnings: [],
    });
  });

  test("GATING ASYMMETRY: with capture OFF, recordTurnOutcome self-gates to a no-op — recordWireCapture does NOT (compose decides)", async () => {
    const wc = await reimportWireCaptureWith("off");
    wc.resetWireCaptures();
    expect(wc.isWireCaptureEnabled()).toBe(false);

    wc.recordTurnOutcome({
      chatId: CHAT_A,
      at: 0,
      model: null,
      disposition: "completed",
      finishReason: "stop",
      stopReason: null,
      terminalReason: null,
      contentChars: 0,
      reasoningChars: 0,
      tokensOut: null,
      maxOutputTokens: null,
      modelCalls: null,
      reasoningEffort: null,
      toolCalls: [],
      warnings: [],
    });
    expect(wc.recentTurnOutcomes({ chatId: CHAT_A })).toHaveLength(0);

    // The request sink is UNCONDITIONAL — it writes whenever called, regardless of the flag. Compose is the
    // seam that decides whether to call it at all; the module itself carries no such gate.
    wc.recordWireCapture({ chatId: CHAT_A, api: "chat-completions", backend: "vllm", model: "m", at: 0, body: {} });
    expect(wc.recentWireCaptures({ chatId: CHAT_A })).toHaveLength(1);
  });

  test("spill rotates at the byte cap: exceeding it renames the current file before the next append", async () => {
    vi.resetModules();
    const rename = vi.fn().mockResolvedValue(undefined);
    const appendFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    // First stat call (before this record) reports the file already AT the cap, forcing rotation before append.
    const spillMaxBytes = 33_554_432;
    const stat = vi.fn().mockResolvedValue({ size: spillMaxBytes });
    vi.doMock("node:fs/promises", () => ({ appendFile, mkdir, rename, stat }));

    const wc = await reimportWireCaptureWith("on");
    wc.resetWireCaptures();
    wc.recordTurnOutcome({
      chatId: CHAT_A,
      at: 0,
      model: "m",
      disposition: "completed",
      finishReason: "stop",
      stopReason: null,
      terminalReason: null,
      contentChars: 5,
      reasoningChars: 0,
      tokensOut: 1,
      maxOutputTokens: null,
      modelCalls: 1,
      reasoningEffort: null,
      toolCalls: [],
      warnings: [],
    });
    // Spill is fire-and-forget (a chained promise); give the microtask queue a turn to run it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rename).toHaveBeenCalledTimes(1);
    expect(appendFile).toHaveBeenCalledTimes(1);
    vi.doUnmock("node:fs/promises");
  });
});
