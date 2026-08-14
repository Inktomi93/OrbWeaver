// The autosave save-driver circuit breaker (create-autosave-entity-form's oscillation backstop,
// the save-driver circuit-breaker contract). Pure + clock-injected, so headless: pins the edit-free-submit count,
// the sliding window, the edit-clears-the-run signal, and the house default. Deterministic via an
// injected `now` (the fake-timers substitute — the breaker holds no real timers of its own).

import { describe } from "vitest";
import { createSaveCircuitBreaker, DEFAULT_SAVE_BREAKER } from "../../../packages/client/src/forms/save-circuit-breaker.ts";
import { expect, test } from "../../support/fixtures.ts";

/** A hand-cranked clock — the breaker's only time source, so the whole thing is deterministic. */
function fakeClock(): { readonly now: () => number; readonly advance: (ms: number) => void } {
  let t = 1_000_000;
  return {
    now: (): number => t,
    advance: (ms): void => {
      t += ms;
    },
  };
}

describe("createSaveCircuitBreaker", () => {
  test("trips only once edit-free submits EXCEED the limit inside the window", () => {
    const clock = fakeClock();
    const breaker = createSaveCircuitBreaker({ limit: 3, windowMs: 1000, now: clock.now });

    // The first `limit` submits are allowed (each 1ms apart, all inside the window).
    for (let i = 0; i < 3; i += 1) {
      clock.advance(1);
      expect(breaker.shouldTrip()).toBe(false);
    }
    // The (limit+1)-th edit-free submit inside the window trips.
    clock.advance(1);
    expect(breaker.shouldTrip()).toBe(true);
  });

  test("a real user edit clears the edit-free run, so a fast typist never trips", () => {
    const clock = fakeClock();
    const breaker = createSaveCircuitBreaker({ limit: 2, windowMs: 1000, now: clock.now });

    // Interleave a submit and an edit repeatedly: every submit is preceded by a genuine edit, so the
    // edit-free count never climbs past 1 — the human-typing case, never a trip.
    for (let i = 0; i < 10; i += 1) {
      breaker.onEdit();
      clock.advance(5);
      expect(breaker.shouldTrip()).toBe(false);
    }
  });

  test("submits older than the window fall out of the count (sliding window)", () => {
    const clock = fakeClock();
    const breaker = createSaveCircuitBreaker({ limit: 2, windowMs: 1000, now: clock.now });

    // Two submits, then wait the window out — the two age off before the next burst.
    expect(breaker.shouldTrip()).toBe(false);
    expect(breaker.shouldTrip()).toBe(false);
    clock.advance(2000);
    // A fresh burst of `limit` submits is still fine (the old two are outside the window now).
    expect(breaker.shouldTrip()).toBe(false);
    expect(breaker.shouldTrip()).toBe(false);
    // The third in this window trips.
    expect(breaker.shouldTrip()).toBe(true);
  });

  test("reset clears the run (a reseed / entity switch starts clean)", () => {
    const clock = fakeClock();
    const breaker = createSaveCircuitBreaker({ limit: 2, windowMs: 1000, now: clock.now });

    breaker.shouldTrip();
    breaker.shouldTrip();
    breaker.reset();
    // Post-reset, the count starts from zero again.
    expect(breaker.shouldTrip()).toBe(false);
    expect(breaker.shouldTrip()).toBe(false);
    expect(breaker.shouldTrip()).toBe(true);
  });

  test("the house default is 5 edit-free submits inside 10s", () => {
    expect(DEFAULT_SAVE_BREAKER).toEqual({ limit: 5, windowMs: 10_000 });
  });
});
