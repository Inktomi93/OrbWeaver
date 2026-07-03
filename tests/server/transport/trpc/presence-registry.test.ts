// presence-registry (PD-70) — the SSE ref-count that derives server-side liveness (chat.md Part III §4).
// Pins the two behaviors that make presence trustworthy for cast-gating: (1) the per-user ref-count over
// device connections (online until the LAST device disconnects), and (2) the grace-window debounce (a brief
// disconnect/reconnect never flickers a participant offline mid-round). Time is the INJECTED clock — the
// same determinism seam production wires — so the grace boundary is exact, never wall-clock-flaky.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PresenceRegistry } from "@orb/server/transport/trpc";
import { createPresenceRegistry } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

// The grace window baked into the registry (chat.md §4). Mirrored here to pin the exact boundary; a
// fully-disconnected user reads `online` for strictly less than this.
const GRACE_MS = 15_000;
const ALICE = castId<UserId>("user_alice");

// A registry over a hand-cranked clock — `advance` moves time so the grace boundary is deterministic.
function harness(): {
  registry: PresenceRegistry;
  advance: (ms: number) => void;
  at: () => number;
} {
  let clock = 1000;
  const registry = createPresenceRegistry(() => clock);
  return {
    registry,
    advance: (ms: number): void => {
      clock += ms;
    },
    at: (): number => clock,
  };
}

describe("presence-registry — SSE ref-count → server-derived liveness", () => {
  test("a never-connected user reads offline with no last-seen", () => {
    const { registry } = harness();
    expect(registry.read(ALICE)).toEqual({ userId: ALICE, online: false, lastSeenAt: null });
  });

  test("a live connection reads online (no last-seen stamp)", () => {
    const { registry } = harness();
    registry.connect(ALICE, new AbortController().signal);
    expect(registry.read(ALICE)).toEqual({ userId: ALICE, online: true, lastSeenAt: null });
  });

  test("ref-counts across devices — online until the LAST device disconnects", () => {
    const { registry } = harness();
    const a = new AbortController();
    const b = new AbortController();
    registry.connect(ALICE, a.signal);
    registry.connect(ALICE, b.signal);

    a.abort(); // one device gone, one still live
    expect(registry.read(ALICE).online).toBe(true);

    b.abort(); // last device gone → enters the grace window (still online for now)
    expect(registry.read(ALICE).online).toBe(true);
  });

  test("grace window — online through grace, then offline with the disconnect stamp", () => {
    const { registry, advance, at } = harness();
    const ac = new AbortController();
    registry.connect(ALICE, ac.signal);
    advance(5000);
    const disconnectedAt = at();
    ac.abort(); // last device leaves at `disconnectedAt`

    advance(GRACE_MS - 1); // strictly inside the window → still online, no stamp surfaced
    expect(registry.read(ALICE)).toEqual({ userId: ALICE, online: true, lastSeenAt: null });

    advance(1); // window elapsed → offline, last-seen surfaced
    expect(registry.read(ALICE)).toEqual({
      userId: ALICE,
      online: false,
      lastSeenAt: disconnectedAt,
    });
  });

  test("a reconnect inside the grace window returns to a clean online", () => {
    const { registry, advance } = harness();
    const first = new AbortController();
    registry.connect(ALICE, first.signal);
    first.abort();

    advance(1000); // still within grace
    registry.connect(ALICE, new AbortController().signal);
    expect(registry.read(ALICE)).toEqual({ userId: ALICE, online: true, lastSeenAt: null });
  });

  test("a pre-aborted signal releases immediately (no stuck ref-count)", () => {
    const { registry, advance } = harness();
    const ac = new AbortController();
    ac.abort(); // dead before connect
    registry.connect(ALICE, ac.signal);

    advance(GRACE_MS); // past grace: if the count had stuck at 1, this would still read online
    expect(registry.read(ALICE).online).toBe(false);
  });
});
