// engine/engine — THE FAULT ROW in the wire-outcome ring (`/api/_debug/wire/outcomes`).
//
// THE DEFECT THIS PINS (docs/design/streaming-shape-churn.md §7.5, reproduced 3/3 on a live stack): a
// 110-second agent-sdk turn ended `terminalReason:"api_error"`, logged loudly to pino — and the outcome ring
// read `{"count":0}`. `recordTurnOutcome` had exactly ONE call site, AFTER `runTurnPipeline` resolves, so a
// turn that THREW could not leave a row by construction. The one case a reader actually hunts was the one
// case the recorder could not see.
//
// WHY A `.suite.`: the outcome arm self-gates on `isWireCaptureEnabled()` (the gating asymmetry
// `wire-capture.ts` documents — it has no compose seam to ride), and that reads the FROZEN `env` singleton
// parsed at import. `vi.hoisted` runs before this file's imports and `isolate: true` gives the file its own
// module graph, so `WIRE_CAPTURE=on` applies here and nowhere else. It also has no single-source mirror,
// which the `test-layout` property-suite exemption covers.

import process from "node:process";
import type { AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { ProviderError } from "@orb/inference";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { recentTurnOutcomes } from "@orb/server/foundation/observability";
import { afterAll, beforeEach, describe, vi } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import type { TurnPrep, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeRecallResult, makeChatContext, seedChat, stubRunCompaction, testConnection } from "../_support.ts";

// biome-ignore-start lint/style/noProcessEnv: this file DRIVES the env parse by crafting process.env before the module graph loads — the same seam `tests/server/foundation/observability/debug/wire-capture.suite.test.ts` uses.
// biome-ignore-start lint/correctness/noProcessGlobal: the `vi.hoisted` body below runs before this file's import bindings exist, so the `node:process` import is unreachable from it — `globalThis.process` is the only handle available at that point (the rest of the file uses the import).
const PREVIOUS_WIRE_CAPTURE = vi.hoisted((): string | undefined => {
  const previous = globalThis.process.env["WIRE_CAPTURE"];
  globalThis.process.env["WIRE_CAPTURE"] = "on";
  return previous;
});
// biome-ignore-end lint/correctness/noProcessGlobal: end of the block above

// NOT PINNED HERE, deliberately: that `captureTurnFault`'s recorder call is wrapped so a ring failure can
// never mask the turn's own error (emits-are-total). The recorder is a module singleton with NO composition
// seam by design (the gating asymmetry `wire-capture.ts` documents), so the only way to make it fail from a
// test is `vi.mock` on an internal module — which `test-mock-doctrine` bans outright ("fake at the edges,
// inject at the composition root"), and there is no edge to fake. An earlier draft of this file did exactly
// that and the gate refused it. The guard stays (it is the cheap half of a rule the constitution states);
// its proof is the code, not a test, and that is a real limit rather than a skipped one.

// `pool: "forks"` reuses a process across FILES and process.env is process-wide even though the module graph
// is not — hand the flag back or the next file in this worker records outcomes it never asked for.
afterAll(() => {
  if (PREVIOUS_WIRE_CAPTURE === undefined) {
    Reflect.deleteProperty(process.env, "WIRE_CAPTURE");
  } else {
    process.env["WIRE_CAPTURE"] = PREVIOUS_WIRE_CAPTURE;
  }
});
// biome-ignore-end lint/style/noProcessEnv: end of the block above

const HOST = castId<UserId>("user_host");

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  recentMessages: [],
};

function prepOf(chatId: ChatId, over: Partial<TurnPrep> = {}): TurnPrep {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection: testConnection(),
    triggeredBy: HOST,
    funderUserId: HOST,
    runAsUserId: HOST,
    kind: "send",
    intent: { effort: "high" },
    speakerCharacterId: null,
    ...over,
  };
}

/** A turn that streams a little and then dies mid-flight with `err` — the realistic provider-fault shape. */
function throwingTurn(err: unknown): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: "partial" };
      throw err;
    })();
}

function engineOver(database: Db, runChatTurn: ChatContext["runChatTurn"]): ReturnType<typeof createTurnEngine> {
  const ctx = makeChatContext(database, { runChatTurn });
  return createTurnEngine(ctx, {
    emit: (_event: ChatBusEvent): Promise<void> => Promise.resolve(),

    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons: () => Promise.resolve([]),
    recallMemory: () => Promise.resolve(fakeRecallResult("")),
    runCompaction: stubRunCompaction,
  });
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("a THROWN turn leaves a wire-outcome row (the §7.5 silent 500)", () => {
  test("a provider fault records disposition:'error' carrying the provider's OWN terminalReason", async () => {
    const chatId = await seedChat(db, "fault-provider");
    const engine = engineOver(
      db,
      throwingTurn(
        new ProviderError({
          kind: "server",
          retryable: true,
          message: "agent-sdk: result success-subtype flagged is_error",
          terminalReason: "api_error",
        }),
      ),
    );

    await expect(engine.runTurn(prepOf(chatId))).rejects.toThrow("is_error");

    const [row] = recentTurnOutcomes({ chatId });
    expect(row).toBeDefined();
    // `api_error` is the fact the provider layer already minted — threaded, never re-derived here. It is the
    // difference between "the turn vanished" and "the vendor errored on us".
    expect(row).toMatchObject({ chatId, disposition: "error", terminalReason: "api_error", contentChars: 0 });
    // The generation numbers are ABSENT, not zeroed: a faulted turn produced no `final` chunk, and a 0 here
    // would read as a measurement rather than a missing one.
    expect(row?.tokensOut).toBeNull();
    expect(row?.modelCalls).toBeNull();
    // The requested route still rides — the row must say WHICH model/effort died, not just that one did.
    expect(row?.model).toBe(testConnection().model);
    expect(row?.reasoningEffort).toBe("high");
  });

  test("a NON-provider fault (a DB/bug throw) still records, falling back to the lifecycle classification", async () => {
    const chatId = await seedChat(db, "fault-plain");
    const engine = engineOver(db, throwingTurn(new Error("model exploded")));

    await expect(engine.runTurn(prepOf(chatId))).rejects.toThrow("model exploded");

    // No `ProviderError` anywhere in the cause chain ⇒ no backend terminal string exists to thread, so the
    // row says the honest thing it does know rather than inventing a provider dialect.
    expect(recentTurnOutcomes({ chatId })[0]).toMatchObject({ disposition: "error", terminalReason: "error" });
  });

  test("a WRAPPED provider fault still yields its classification (the cause-chain walk)", async () => {
    const chatId = await seedChat(db, "fault-wrapped");
    const inner = new ProviderError({ kind: "rate_limit", retryable: true, message: "429" });
    const engine = engineOver(db, throwingTurn(new Error("bridge re-wrap", { cause: inner })));

    await expect(engine.runTurn(prepOf(chatId))).rejects.toThrow("bridge re-wrap");

    // No `terminalReason` on this one, so the normalized `kind` is the honest fallback — and a single-deref
    // reader would have found nothing at all.
    expect(recentTurnOutcomes({ chatId })[0]).toMatchObject({ disposition: "error", terminalReason: "rate_limit" });
  });

  test("a CALLER CANCEL is recorded as its own disposition, never conflated with a fault", async () => {
    const chatId = await seedChat(db, "fault-cancel");
    const controller = new AbortController();
    const cancelling: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "text", text: "partial" };
        controller.abort();
        const abortErr = new Error("aborted");
        abortErr.name = "AbortError";
        throw abortErr;
      })();
    const engine = engineOver(db, cancelling);

    // A cancel RETURNS the aborted outcome (an abort is an outcome, not an exception) — the ring row is the
    // only trace it leaves, and it must not read as a provider failure.
    await engine.runTurn(prepOf(chatId, { signal: controller.signal }));

    expect(recentTurnOutcomes({ chatId })[0]).toMatchObject({ disposition: "user", terminalReason: "user" });
  });

  test("the row is a PASSENGER — recording it never changes what the caller sees", async () => {
    const chatId = await seedChat(db, "fault-passenger");
    const boom = new ProviderError({ kind: "server", retryable: true, message: "agent-sdk exploded", terminalReason: "api_error" });
    const engine = engineOver(db, throwingTurn(boom));

    // The IDENTITY of the rejection, not just its message: the fault arm must not re-wrap, replace or
    // swallow the provider's own error on its way to the tRPC boundary.
    await expect(engine.runTurn(prepOf(chatId))).rejects.toBe(boom);
    expect(recentTurnOutcomes({ chatId })).toHaveLength(1);
  });
});

// #1440 — THE OPERATOR HALF of the provider-degradation surface. The user's `settings_adjusted` toast is
// deliberately RE-VOICED and carries no provider prose (the chat bus admits no unanchored free text), so if
// the ring did not keep the RAW warning, "which knob did this backend refuse, and what did it clamp to" would
// be unanswerable after the fact — exactly the diagnosis this ring exists for. No second store was minted:
// the warnings ride the outcome row the engine already writes on every resolved turn.
describe("a COMPLETED turn's wire-outcome row carries the raw provider warnings", () => {
  test("the runner's own code AND its operator prose survive to the ring", async () => {
    const chatId = await seedChat(db, "outcome-warnings");
    const engine = engineOver(db, () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "warning", code: "sampling_knob_dropped", knob: "topK", message: "topK ignored: model does not expose a topK range" };
        yield { kind: "text", text: "a reply" };
      })(),
    );

    await engine.runTurn(prepOf(chatId));

    const [row] = recentTurnOutcomes({ chatId });
    expect(row).toMatchObject({
      disposition: "completed",
      warnings: [{ code: "sampling_knob_dropped", message: "topK ignored: model does not expose a topK range" }],
    });
  });
});
