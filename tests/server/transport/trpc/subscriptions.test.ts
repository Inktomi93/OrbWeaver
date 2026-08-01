// The SSE subscription typed-error wrapper (core/Tier-4-Transport.md §D2 / Esoteric #5). A subscription
// generator bypasses `domainErrorMiddleware` — the middleware returned its result long before the generator
// throws — so a typed `DomainError` escaping a stream would surface as a spurious 500 that
// `httpSubscriptionLink` silently retries forever with zero client callbacks. `withSubscriptionErrors` turns
// it into a TYPED TERMINAL FRAME instead, and re-throws anything that is not a domain error.
//
// This was an end-to-end test through `workloads.subscribe` until SSE-1 S5 deleted that procedure (the last
// staged fold — it is the `workloads` ROOM now). The wrapper did NOT go with it: it still wraps the ONE
// socket (`stream.connect`) for a genuine socket-level fault, and `chat.impersonateStream`, the permanently
// gate-exempt standalone subscription — whose end-to-end arm is pinned in `routers/chat.test.ts` ("a
// non-member gets a leak-free NOT_FOUND terminal FRAME"). What was missing was a test of the wrapper ITSELF,
// independent of whichever procedure happens to use it; that is what this is.

import { DomainNotFoundError } from "@orb/kit/errors";
import { withSubscriptionErrors } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

/** The parts of a tracked envelope (`[id, data, symbol]` server-side). */
function partsOf(envelope: unknown): { readonly id: string; readonly data: Record<string, unknown> } {
  const tuple = envelope as [string, Record<string, unknown>];
  return { id: tuple[0], data: tuple[1] };
}

/** A source that ships `events` and then throws. The wrapper re-yields a source envelope UNCHANGED (it only
 *  ever MINTS one, for the terminal frame), so the tuple shape is all this needs — and the tests package
 *  deliberately does not depend on `@trpc/server` to say so. Synchronous because nothing here awaits: a
 *  sync generator is a legal `yield*` source inside the wrapper's async one. */
function* yieldThen(events: readonly string[], throwing: unknown): Generator<unknown> {
  for (const [i, n] of events.entries()) {
    yield [String(i), { n }];
  }
  throw throwing;
}

/** The ONE cast, contained here: the envelope tuple is typed as the wrapper's OWN parameter type rather than
 *  re-spelled, because the tests package deliberately does not depend on `@trpc/server`. */
function wrap(source: Generator<unknown>): AsyncIterable<unknown> {
  // The wrapper re-yields a source envelope UNTOUCHED (it only MINTS one, for the terminal frame), so the
  // tuple shape is the whole contract here. FABRICATION-OK: there is no field for a change to break.
  return withSubscriptionErrors(source as unknown as Parameters<typeof withSubscriptionErrors>[0]);
}

async function drain(source: AsyncIterable<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const value of source) {
    out.push(value);
  }
  return out;
}

describe("withSubscriptionErrors", () => {
  test("a DomainError becomes a TYPED terminal frame after the frames that already shipped", async () => {
    const frames = await drain(wrap(yieldThen(["a", "b"], new DomainNotFoundError("workload", "workload_missing"))));

    expect(frames).toHaveLength(3);
    expect(partsOf(frames[0]).data).toEqual({ n: "a" });
    expect(partsOf(frames[1]).data).toEqual({ n: "b" });
    // The terminal frame is TYPED (a leak-free NOT_FOUND), not a raw 500 the link would retry blindly.
    expect(partsOf(frames[2]).data).toMatchObject({ __subscriptionError: true, code: "NOT_FOUND" });
  });

  test("the error frame is TRACKED like every other yield — a mix breaks the client's discriminant narrowing", async () => {
    const frames = await drain(wrap(yieldThen([], new DomainNotFoundError("workload", "gone"))));

    // …and its id is never a durable cursor, so a reconnect's `Last-Event-ID` cannot resume "from the error".
    expect(partsOf(frames[0]).id).toBe("__error__");
  });

  test("a NON-domain throw propagates — a genuine bug is not laundered into a tidy frame", async () => {
    const boom = new TypeError("cannot read properties of undefined");

    await expect(drain(wrap(yieldThen(["a"], boom)))).rejects.toThrow(boom);
  });
});
