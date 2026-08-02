// backends/kit/retry — deterministic backoff (injected RNG + clock) and the pre-commit guarantee: once a
// delta has streamed, NO retry happens (a replay would duplicate tokens for the UI). Plus the TRACE landing
// proof: every retry decision must reach the per-request trace ring (a succeed-on-attempt-3 turn is otherwise
// just an unexplained slow span, and the thrown error cannot say WHY the loop stopped).

import { getTraceByRequestId, initTracing, withRequestSpan } from "@orb/server/foundation/observability";
import { ProviderError } from "@orb/server/infra/providers";
import { computeBackoffMs, runWithPreCommitRetry } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const serverErr = (): ProviderError => new ProviderError({ kind: "server", retryable: true, message: "boom" });

describe("computeBackoffMs — deterministic with injected RNG/clock", () => {
  test("exponential growth, jitter centered at random()=0.5 (jitter factor 1.0)", () => {
    const opts = { baseMs: 500, maxMs: 60_000, random: (): number => 0.5 };
    expect(computeBackoffMs(1, serverErr(), opts)).toBe(500);
    expect(computeBackoffMs(2, serverErr(), opts)).toBe(1000);
    expect(computeBackoffMs(3, serverErr(), opts)).toBe(2000);
  });

  test("jitter band: random()=0 → 0.8x, random()=1 → 1.2x", () => {
    expect(computeBackoffMs(1, serverErr(), { baseMs: 500, random: (): number => 0 })).toBe(400);
    expect(computeBackoffMs(1, serverErr(), { baseMs: 500, random: (): number => 1 })).toBe(600);
  });

  test("caps any single sleep at maxMs", () => {
    expect(computeBackoffMs(10, serverErr(), { baseMs: 500, maxMs: 8000, random: (): number => 0.5 })).toBe(8000);
  });

  test("honors a NEAR rate-limit resetsAt when a clock is injected", () => {
    const err = new ProviderError({
      kind: "rate_limit",
      retryable: true,
      message: "rl",
      resetsAt: 5000,
    });
    const ms = computeBackoffMs(1, err, { maxMs: 30_000, now: (): number => 1000 });
    expect(ms).toBe(4000);
  });

  test("a FAR resetsAt (>30s away) falls back to exponential backoff", () => {
    const err = new ProviderError({
      kind: "rate_limit",
      retryable: true,
      message: "rl",
      resetsAt: 41_000,
    });
    const ms = computeBackoffMs(1, err, {
      baseMs: 500,
      maxMs: 60_000,
      now: (): number => 1000,
      random: (): number => 0.5,
    });
    expect(ms).toBe(500);
  });

  test("without an injected clock, the resetsAt shortcut is skipped (no raw clock read)", () => {
    const err = new ProviderError({
      kind: "rate_limit",
      retryable: true,
      message: "rl",
      resetsAt: 5000,
    });
    expect(computeBackoffMs(1, err, { baseMs: 500, random: (): number => 0.5 })).toBe(500);
  });
});

describe("the pre-commit retry loop", () => {
  const fast = { baseMs: 0, maxMs: 0, random: (): number => 0.5 };

  test("returns the op result on first success (no retry)", async () => {
    let calls = 0;
    const result = await runWithPreCommitRetry(
      (): Promise<string> => {
        calls += 1;
        return Promise.resolve("ok");
      },
      serverErr,
      fast,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries a retryable failure then succeeds", async () => {
    let calls = 0;
    const result = await runWithPreCommitRetry(
      (): Promise<string> => {
        calls += 1;
        if (calls < 2) {
          throw new Error("transient");
        }
        return Promise.resolve("recovered");
      },
      serverErr,
      fast,
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(2);
  });

  test("does NOT retry after a delta has committed (replay would duplicate tokens)", async () => {
    let calls = 0;
    await expect(
      runWithPreCommitRetry(
        (markCommitted): Promise<never> => {
          calls += 1;
          markCommitted();
          throw new Error("mid-stream failure");
        },
        serverErr,
        fast,
      ),
    ).rejects.toThrow("mid-stream failure");
    expect(calls).toBe(1);
  });

  test("does NOT retry a non-retryable classification", async () => {
    let calls = 0;
    const classifyFatal = (): ProviderError => new ProviderError({ kind: "auth_failed", retryable: false, message: "401" });
    await expect(
      runWithPreCommitRetry(
        (): Promise<never> => {
          calls += 1;
          throw new Error("bad key");
        },
        classifyFatal,
        fast,
      ),
    ).rejects.toThrow("bad key");
    expect(calls).toBe(1);
  });

  test("exhausts maxAttempts then throws the last error", async () => {
    let calls = 0;
    await expect(
      runWithPreCommitRetry(
        (): Promise<never> => {
          calls += 1;
          throw new Error("always down");
        },
        serverErr,
        { ...fast, maxAttempts: 2 },
      ),
    ).rejects.toThrow("always down");
    expect(calls).toBe(2);
  });

  test("an aborted signal interrupts the backoff with a ProviderError(aborted)", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      runWithPreCommitRetry(
        (): Promise<never> => {
          throw new Error("transient");
        },
        serverErr,
        { baseMs: 100, maxMs: 100, random: (): number => 0.5, signal: ac.signal },
      ),
    ).rejects.toMatchObject({ kind: "aborted" });
  });
});

// ── THE RETRY SPAN-EVENT LANDING PROOF (the standing observability law). Reads the SEALED trace back through
// the public read API — the same shape /api/_debug/traces serves.
/** Every span event on the request's sealed trace, in capture order. */
function traceEvents(requestId: string): { readonly name: string; readonly attributes: Record<string, string | number | boolean> }[] {
  const trace = getTraceByRequestId(requestId);
  if (trace === undefined) {
    throw new Error(`expected a sealed trace for request ${requestId}`);
  }
  return trace.spans.flatMap((s) => s.events.map((e) => ({ name: e.name, attributes: e.attributes ?? {} })));
}

describe("the retry loop ANNOTATES the request span (addSpanEvent landing proof)", () => {
  const fast = { baseMs: 0, maxMs: 0, random: (): number => 0.5 };

  test("each scheduled backoff lands provider.retry with its attempt + kind + delay", async () => {
    initTracing();
    const requestId = "obs-retry-then-succeed";
    let calls = 0;

    await withRequestSpan(requestId, "test provider call", {}, () =>
      runWithPreCommitRetry(
        (): Promise<string> => {
          calls += 1;
          if (calls < 3) {
            throw new Error("transient");
          }
          return Promise.resolve("recovered");
        },
        serverErr,
        fast,
      ),
    );

    // A run that SUCCEEDS on attempt 3 seals an ok span — the two retries beneath it exist only as events.
    const retries = traceEvents(requestId).filter((e) => e.name === "provider.retry");
    expect(retries.map((e) => e.attributes["attempt"])).toEqual([1, 2]);
    expect(retries[0]?.attributes).toMatchObject({ kind: "server", delayMs: 0 });
    expect(traceEvents(requestId).some((e) => e.name === "provider.retry.abandoned")).toBe(false);
  });

  test("a committed stream lands provider.retry.abandoned{reason:committed} — the fact the error cannot carry", async () => {
    initTracing();
    const requestId = "obs-retry-committed";

    await withRequestSpan(requestId, "test provider call", {}, async () => {
      await expect(
        runWithPreCommitRetry(
          (markCommitted): Promise<never> => {
            markCommitted();
            throw new Error("mid-stream failure");
          },
          serverErr,
          fast,
        ),
      ).rejects.toThrow("mid-stream failure");
    });

    const abandoned = traceEvents(requestId).filter((e) => e.name === "provider.retry.abandoned");
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]?.attributes).toMatchObject({ attempt: 1, kind: "server", reason: "committed" });
  });

  test("burning every attempt lands reason:exhausted, and a fatal classification lands reason:non-retryable", async () => {
    initTracing();
    const exhaustedId = "obs-retry-exhausted";
    await withRequestSpan(exhaustedId, "test provider call", {}, async () => {
      await expect(
        runWithPreCommitRetry(
          (): Promise<never> => {
            throw new Error("always down");
          },
          serverErr,
          { ...fast, maxAttempts: 2 },
        ),
      ).rejects.toThrow("always down");
    });
    const exhausted = traceEvents(exhaustedId);
    // One retry scheduled (attempt 1 → 2), then the give-up on the last attempt.
    expect(exhausted.filter((e) => e.name === "provider.retry")).toHaveLength(1);
    expect(exhausted.find((e) => e.name === "provider.retry.abandoned")?.attributes).toMatchObject({ attempt: 2, reason: "exhausted" });

    const fatalId = "obs-retry-non-retryable";
    const classifyFatal = (): ProviderError => new ProviderError({ kind: "auth_failed", retryable: false, message: "401" });
    await withRequestSpan(fatalId, "test provider call", {}, async () => {
      await expect(
        runWithPreCommitRetry(
          (): Promise<never> => {
            throw new Error("bad key");
          },
          classifyFatal,
          fast,
        ),
      ).rejects.toThrow("bad key");
    });
    expect(traceEvents(fatalId).find((e) => e.name === "provider.retry.abandoned")?.attributes).toMatchObject({
      attempt: 1,
      kind: "auth_failed",
      reason: "non-retryable",
    });
  });
});
