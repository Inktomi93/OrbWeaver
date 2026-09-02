// The evidence-window engine (#1095) — the shared "what does '~N minutes ago' honestly cover" primitive both
// halves of a bug report filter through. The pins here are the HONESTY clauses, because those are the ones a
// future "simplification" would quietly delete: the inclusive-around pad, and `truncatedAt` firing when the
// ring no longer reaches the requested start.

import { EVIDENCE_WINDOW_PAD_MS, resolveEvidenceWindow, sliceByWindow, wholeSource } from "@orb/kit/evidence-window";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const NOW = 1_760_000_000_000;
const MINUTE = 60_000;

interface Stamped {
  readonly at: number;
  readonly what: string;
}

const at = (entry: Stamped): number => entry.at;

describe("resolveEvidenceWindow", () => {
  test("no ask ⇒ no filtering at all (never an empty window)", () => {
    const window = resolveEvidenceWindow(NOW, null);
    expect(window).toEqual({ requestedFromAt: null, fromAt: null, padMs: EVIDENCE_WINDOW_PAD_MS, capturedAt: NOW, requestedMinutes: null });
  });

  test("a 5-minute ask resolves to a start 5 minutes back, PADDED a further minute on the leading edge", () => {
    const window = resolveEvidenceWindow(NOW, 5);
    expect(window.requestedFromAt).toBe(NOW - 5 * MINUTE);
    expect(window.fromAt).toBe(NOW - 5 * MINUTE - EVIDENCE_WINDOW_PAD_MS);
    expect(window.capturedAt).toBe(NOW);
  });

  test("a zero, negative or non-finite ask degrades to NO ask rather than to an empty window", () => {
    for (const ask of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveEvidenceWindow(NOW, ask).fromAt, `ask=${String(ask)}`).toBeNull();
    }
  });
});

describe("sliceByWindow", () => {
  test("keeps entries inside the padded window and drops the ones before it", () => {
    const window = resolveEvidenceWindow(NOW, 5);
    const entries: Stamped[] = [
      { at: NOW - 20 * MINUTE, what: "long before" },
      // Inside the PAD, i.e. before the literal requested start — the inclusive-around clause is what keeps it.
      { at: NOW - 5 * MINUTE - 30_000, what: "just before the ask" },
      { at: NOW - MINUTE, what: "inside" },
    ];
    const slice = sliceByWindow({ source: "test", entries, at, window, cap: 32 });
    expect(slice.entries.map((entry) => entry.what)).toEqual(["just before the ask", "inside"]);
    expect(slice.meta).toEqual({ source: "test", windowFilterable: true, cap: 32, held: 3, kept: 2, truncatedAt: null });
  });

  test("TRUNCATED: when the oldest HELD entry is newer than the requested start, the meta says where the ring begins", () => {
    // The ring already evicted everything older than 2 minutes ago; the owner asked about 30 minutes ago. The
    // filter alone would return a short, quiet-looking list — `truncatedAt` is what stops that reading as calm.
    const window = resolveEvidenceWindow(NOW, 30);
    const oldestHeld = NOW - 2 * MINUTE;
    const slice = sliceByWindow({
      source: "motion().shifts",
      entries: [
        { at: oldestHeld, what: "oldest survivor" },
        { at: NOW - MINUTE, what: "newer" },
      ],
      at,
      window,
      cap: 32,
    });
    expect(slice.meta.truncatedAt).toBe(oldestHeld);
    expect(slice.meta.kept).toBe(2);
  });

  test("no truncation claim when the ring DOES reach past the requested start", () => {
    const window = resolveEvidenceWindow(NOW, 5);
    const slice = sliceByWindow({ source: "test", entries: [{ at: NOW - 60 * MINUTE, what: "older than the ask" }], at, window, cap: 32 });
    expect(slice.meta.truncatedAt).toBeNull();
    expect(slice.meta.kept).toBe(0);
  });

  test("an EMPTY ring cannot claim truncation (nothing held ⇒ nothing to say about where it begins)", () => {
    const empty: readonly Stamped[] = [];
    const slice = sliceByWindow({ source: "test", entries: empty, at, window: resolveEvidenceWindow(NOW, 5), cap: 32 });
    expect(slice.meta).toEqual({ source: "test", windowFilterable: true, cap: 32, held: 0, kept: 0, truncatedAt: null });
  });

  test("carries a ring's own eviction tally when it has one", () => {
    const slice = sliceByWindow({
      source: "consoleErrors()",
      entries: [{ at: NOW, what: "x" }],
      at,
      window: resolveEvidenceWindow(NOW, null),
      cap: 128,
      dropped: 7,
    });
    expect(slice.meta.dropped).toBe(7);
  });

  test("COPIES — the slice must not alias a live ring the app keeps mutating", () => {
    const entries: Stamped[] = [{ at: NOW, what: "held" }];
    const slice = sliceByWindow({ source: "test", entries, at, window: resolveEvidenceWindow(NOW, null), cap: null });
    entries.length = 0;
    expect(slice.entries).toHaveLength(1);
  });
});

describe("wholeSource", () => {
  test("ships everything, states the reason, and claims no truncation", () => {
    const entries: Stamped[] = [{ at: NOW - 90 * MINUTE, what: "a first raise from long ago" }];
    const slice = wholeSource({ source: "flags()", entries, reason: "session-deduped first raise", cap: 128 });
    expect(slice.entries).toHaveLength(1);
    expect(slice.meta).toEqual({
      source: "flags()",
      windowFilterable: false,
      reason: "session-deduped first raise",
      cap: 128,
      held: 1,
      kept: 1,
      truncatedAt: null,
    });
  });

  test("COPIES, for the same reason sliceByWindow does", () => {
    const entries: Stamped[] = [{ at: NOW, what: "held" }];
    const slice = wholeSource({ source: "flags()", entries, reason: "r", cap: null });
    entries.length = 0;
    expect(slice.entries).toHaveLength(1);
  });
});
