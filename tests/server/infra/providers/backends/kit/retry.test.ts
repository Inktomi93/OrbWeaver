// backends/kit/retry — deterministic backoff (injected RNG + clock) and the pre-commit guarantee: once a
// delta has streamed, NO retry happens (a replay would duplicate tokens for the UI).

import { ProviderError } from "@orb/server/infra/providers";
import { computeBackoffMs, runWithPreCommitRetry } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const serverErr = (): ProviderError =>
  new ProviderError({ kind: "server", retryable: true, message: "boom" });

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
    expect(
      computeBackoffMs(10, serverErr(), { baseMs: 500, maxMs: 8000, random: (): number => 0.5 }),
    ).toBe(8000);
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
    const classifyFatal = (): ProviderError =>
      new ProviderError({ kind: "auth_failed", retryable: false, message: "401" });
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
