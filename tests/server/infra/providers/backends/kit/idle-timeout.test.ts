// @orb-waive-file test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
// backends/kit/idle-timeout — the rolling idle window: a stall (no chunk for the whole window) trips the
// abort; a chunk before the window resets it; the caller's cancel folds in. Driven with fake timers.

import { IDLE_TIMEOUT_MS, turnAbortSignal } from "@orb/server/infra/providers/backends/kit";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

describe("turnAbortSignal — rolling idle abort", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("trips the abort after a full idle window with no reset", () => {
    const { signal } = turnAbortSignal();
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });

  test("reset() restarts the window so a steady stream never trips it", () => {
    const { signal, reset, dispose } = turnAbortSignal();
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    reset();
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1);
    expect(signal.aborted).toBe(false);
    dispose();
  });

  test("dispose() clears the timer so a settled turn never aborts late", () => {
    const { signal, dispose } = turnAbortSignal();
    dispose();
    vi.advanceTimersByTime(IDLE_TIMEOUT_MS * 2);
    expect(signal.aborted).toBe(false);
  });

  test("a caller signal already aborted → the composed signal is aborted immediately", () => {
    const ac = new AbortController();
    ac.abort();
    const { signal } = turnAbortSignal(ac.signal);
    expect(signal.aborted).toBe(true);
  });

  test("a caller abort mid-stream propagates to the composed signal", () => {
    const ac = new AbortController();
    const { signal } = turnAbortSignal(ac.signal);
    expect(signal.aborted).toBe(false);
    ac.abort();
    expect(signal.aborted).toBe(true);
  });

  test("a custom idle window is honored", () => {
    const { signal } = turnAbortSignal(undefined, 1000);
    vi.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });
});
