// biome-ignore-all lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
//
// Seed-frame shape + determinism + the init-frame shape guard (providers.md Esoteric §3). The shape is
// load-bearing: full frames resume, an assistant-first seed gets a synthetic user stub, and identical
// canon under the same sessionId rebuilds byte-identically (so the prompt cache survives a reseed).

import { assertInitFrameShape } from "@orb/server/infra/providers/backends/agent-sdk";
import {
  buildSeedFrames,
  GREETING_USER_STUB,
  isBranchDivergence,
  seedSessionId,
  sessionContainsSeedPrefix,
  sessionMatchesSeed,
  toSeedTurns,
} from "@orb/server/infra/providers/backends/agent-sdk/session";
import { describe } from "vitest";
import { expect, test } from "../../../../../../support/fixtures";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_SESSION_ID_RE = /missing session_id/u;
const MISSING_API_KEY_SOURCE_RE = /missing apiKeySource/u;
const UUID_V4_SHAPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u;

interface FrameShape {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  sessionId?: string;
  message: { role: string; content: Array<{ type: string; text: string }> };
}

const asFrame = (entry: unknown): FrameShape => entry as FrameShape;

describe("buildSeedFrames — the validated full-frame shape", () => {
  test("produces full, user-first, parent-chained frames carrying the metadata bundle", () => {
    const frames = buildSeedFrames(
      [
        { role: "user", content: "hello there" },
        { role: "assistant", content: "hi, traveler" },
      ],
      SESSION_ID,
    );
    expect(frames).toHaveLength(2);

    const first = asFrame(frames[0]);
    expect(first.type).toBe("user");
    expect(first.message.content[0]?.text).toBe("hello there");
    expect(first.parentUuid).toBeNull();
    expect(typeof first.uuid).toBe("string");
    expect(first.sessionId).toBe(SESSION_ID);
    expect(typeof first.timestamp).toBe("string");

    const second = asFrame(frames[1]);
    expect(second.type).toBe("assistant");
    expect(second.message.content[0]?.text).toBe("hi, traveler");
    // The chain links the assistant frame to the user frame's uuid.
    expect(second.parentUuid).toBe(first.uuid);
  });

  test("the same canon under the same sessionId rebuilds BYTE-IDENTICALLY (prompt-cache survival)", () => {
    const canon = [
      { role: "user" as const, content: "deterministic" },
      { role: "assistant" as const, content: "stable" },
    ];
    expect(buildSeedFrames(canon, SESSION_ID)).toStrictEqual(buildSeedFrames(canon, SESSION_ID));
  });
});

describe("toSeedTurns — the assistant-first stub + system-drop rules", () => {
  test("an ASSISTANT-FIRST canon gets the synthetic user stub prefixed (resume needs user-first)", () => {
    const seed = toSeedTurns([{ role: "assistant", content: "a lone greeting" }]);
    expect(seed[0]).toStrictEqual({ role: "user", content: GREETING_USER_STUB });
    expect(seed[1]?.role).toBe("assistant");
  });

  test("a USER-FIRST canon is NOT stub-prefixed", () => {
    const seed = toSeedTurns([{ role: "user", content: "opening line" }]);
    expect(seed[0]?.role).toBe("user");
    expect(seed[0]?.content).toBe("opening line");
    expect(seed).toHaveLength(1);
  });

  test("system rows are dropped (they ride in the assembled system prompt, not the transcript)", () => {
    const seed = toSeedTurns([
      { role: "system", content: "be terse" },
      { role: "user", content: "go" },
    ]);
    expect(seed).toStrictEqual([{ role: "user", content: "go", model: null }]);
  });

  test("an empty (no user/assistant) canon yields no seed", () => {
    expect(toSeedTurns([{ role: "system", content: "only system" }])).toStrictEqual([]);
  });
});

// A store entry hand-built without importing the sealed SDK types (mirror store.test's pattern).
type Entry = Parameters<typeof sessionMatchesSeed>[0][number];
const asEntry = (e: unknown): Entry => e as Entry;

describe("sessionMatchesSeed — the resume-gate comparator", () => {
  const canon = [
    { role: "user" as const, content: "v1" },
    { role: "assistant" as const, content: "r1" },
  ];

  test("a session holding exactly the seeded frames MATCHES (resume)", () => {
    expect(sessionMatchesSeed(buildSeedFrames(canon, SESSION_ID), canon)).toBe(true);
  });

  test("changed content does NOT match (edit → reseed)", () => {
    const frames = buildSeedFrames([{ role: "user", content: "v2" }], SESSION_ID);
    expect(sessionMatchesSeed(frames, [{ role: "user", content: "v1" }])).toBe(false);
  });

  test("a session holding MORE than the seed does NOT match (a swipe's rejected reply)", () => {
    const frames = buildSeedFrames([...canon, { role: "user", content: "u2" }, { role: "assistant", content: "rejected" }], SESSION_ID);
    expect(sessionMatchesSeed(frames, [...canon, { role: "user", content: "u2" }])).toBe(false);
  });

  test("SDK-split assistant frames merge back into ONE reply (per-block frames, thinking excluded)", () => {
    const entries = [
      asEntry({ type: "user", uuid: "u1", message: { role: "user", content: "hello" } }),
      asEntry({
        type: "assistant",
        uuid: "a1",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "hmm" },
            { type: "text", text: "par" },
          ],
        },
      }),
      asEntry({
        type: "assistant",
        uuid: "a2",
        message: { role: "assistant", content: [{ type: "text", text: "t two" }] },
      }),
    ];
    expect(
      sessionMatchesSeed(entries, [
        { role: "user", content: "hello" },
        { role: "assistant", content: "part two" },
      ]),
    ).toBe(true);
  });

  test("a multi-row user tail matches the ONE joined stored frame (the prompt-tail join)", () => {
    const entries = [
      asEntry({ type: "user", uuid: "u1", message: { role: "user", content: "a\n\nb" } }),
      asEntry({
        type: "assistant",
        uuid: "a1",
        message: { role: "assistant", content: [{ type: "text", text: "r" }] },
      }),
    ];
    expect(
      sessionMatchesSeed(entries, [
        { role: "user", content: "a" },
        { role: "user", content: "b" },
        { role: "assistant", content: "r" },
      ]),
    ).toBe(true);
  });

  test("trailing whitespace is identity-neutral (the runner trims replies; mirrored frames don't)", () => {
    const entries = [
      asEntry({ type: "user", uuid: "u1", message: { role: "user", content: "go" } }),
      asEntry({
        type: "assistant",
        uuid: "a1",
        message: { role: "assistant", content: [{ type: "text", text: "done\n" }] },
      }),
    ];
    expect(
      sessionMatchesSeed(entries, [
        { role: "user", content: "go" },
        { role: "assistant", content: "done" },
      ]),
    ).toBe(true);
  });

  test("non-transcript frames (summary rows, isMeta user rows) are identity-neutral", () => {
    const entries = [
      asEntry({ type: "user", uuid: "u1", message: { role: "user", content: "go" } }),
      asEntry({ type: "summary", uuid: "s1", summary: "bookkeeping" }),
      asEntry({
        type: "user",
        uuid: "m1",
        isMeta: true,
        message: { role: "user", content: "caveat noise" },
      }),
      asEntry({
        type: "assistant",
        uuid: "a1",
        message: { role: "assistant", content: [{ type: "text", text: "done" }] },
      }),
    ];
    expect(
      sessionMatchesSeed(entries, [
        { role: "user", content: "go" },
        { role: "assistant", content: "done" },
      ]),
    ).toBe(true);
  });
});

describe("isBranchDivergence — swipe/edit (shared-prefix) vs unrelated divergence", () => {
  const canon = [
    { role: "user" as const, content: "u1" },
    { role: "assistant" as const, content: "r1" },
  ];

  test("a swipe (shared prefix, then a diverged tail) IS a branch", () => {
    // Stored = canon + a rejected reply; the new seed keeps canon's prefix but swaps the tail.
    const stored = buildSeedFrames([...canon, { role: "user", content: "u2" }, { role: "assistant", content: "rejected" }], SESSION_ID);
    const swipe = [...canon, { role: "user" as const, content: "u2" }, { role: "assistant" as const, content: "kept" }];
    expect(isBranchDivergence(stored, swipe)).toBe(true);
  });

  test("an edit of a MIDDLE turn (shares the leading run) IS a branch", () => {
    const stored = buildSeedFrames(canon, SESSION_ID);
    const edited = [
      { role: "user" as const, content: "u1" },
      { role: "assistant" as const, content: "r1 EDITED" },
    ];
    expect(isBranchDivergence(stored, edited)).toBe(true);
  });

  test("a fully-unrelated transcript (no shared leading run) is NOT a branch", () => {
    const stored = buildSeedFrames(canon, SESSION_ID);
    const unrelated = [
      { role: "user" as const, content: "totally different" },
      { role: "assistant" as const, content: "elsewhere" },
    ];
    expect(isBranchDivergence(stored, unrelated)).toBe(false);
  });

  test("a first-turn edit (diverges at the very first run) is NOT a branch", () => {
    const stored = buildSeedFrames(canon, SESSION_ID);
    const editedFirst = [
      { role: "user" as const, content: "u1 EDITED" },
      { role: "assistant" as const, content: "r1" },
    ];
    expect(isBranchDivergence(stored, editedFirst)).toBe(false);
  });
});

describe("sessionContainsSeedPrefix — the grown-superset re-adoption gate", () => {
  const canon = [
    { role: "user" as const, content: "u1" },
    { role: "assistant" as const, content: "r1" },
  ];

  test("an EXACT match is a prefix (the sessionMatchesSeed case is subsumed)", () => {
    expect(sessionContainsSeedPrefix(buildSeedFrames(canon, SESSION_ID), canon)).toBe(true);
  });

  test("a GROWN lineage (seed + SDK-appended turns) still contains the seed as a leading prefix", () => {
    // The live-append shape: canon ends on an assistant reply, so the SDK's growth is the NEXT distinct-role
    // turns (a user prompt + its reply) — a clean leading prefix, not folded into canon's trailing run.
    const grown = buildSeedFrames([...canon, { role: "user", content: "u2" }, { role: "assistant", content: "r2" }], SESSION_ID);
    // NOTE: `sessionMatchesSeed` (exact) is FALSE here — that mismatch is exactly why the old build re-forked.
    expect(sessionMatchesSeed(grown, canon)).toBe(false);
    expect(sessionContainsSeedPrefix(grown, canon)).toBe(true);
  });

  test("a DIVERGED lineage (same length, different tail) is NOT a prefix", () => {
    const stored = buildSeedFrames(
      [
        { role: "user", content: "u1" },
        { role: "assistant", content: "r1 DIFFERENT" },
      ],
      SESSION_ID,
    );
    expect(sessionContainsSeedPrefix(stored, canon)).toBe(false);
  });

  test("a stored transcript SHORTER than the seed is NOT a prefix (the seed can't be contained)", () => {
    const stored = buildSeedFrames([{ role: "user", content: "u1" }], SESSION_ID);
    expect(sessionContainsSeedPrefix(stored, canon)).toBe(false);
  });

  test("an EMPTY seed is never a prefix (nothing to re-adopt against)", () => {
    expect(sessionContainsSeedPrefix(buildSeedFrames(canon, SESSION_ID), [])).toBe(false);
  });
});

describe("seedSessionId — deterministic uuid-shaped session ids", () => {
  const seed = [{ role: "user" as const, content: "hello" }];

  test("uuid-v4-shaped (the SDK rejects arbitrary resume ids)", () => {
    expect(seedSessionId("chat-1", seed)).toMatch(UUID_V4_SHAPE_RE);
  });

  test("same chat + seed + salt → the same id; chat, seed, or salt changes it", () => {
    expect(seedSessionId("chat-1", seed)).toBe(seedSessionId("chat-1", seed));
    expect(seedSessionId("chat-2", seed)).not.toBe(seedSessionId("chat-1", seed));
    expect(seedSessionId("chat-1", [{ role: "user", content: "other" }])).not.toBe(seedSessionId("chat-1", seed));
    expect(seedSessionId("chat-1", seed, 1)).not.toBe(seedSessionId("chat-1", seed, 0));
  });
});

describe("assertInitFrameShape — the SHAPE GUARD", () => {
  test("a well-formed init frame passes", () => {
    expect(() => assertInitFrameShape({ session_id: "sess-1", apiKeySource: "oauth" })).not.toThrow();
  });

  test("a missing session_id throws loudly", () => {
    expect(() => assertInitFrameShape({ apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("an empty session_id throws loudly", () => {
    expect(() => assertInitFrameShape({ session_id: "", apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("a missing apiKeySource throws loudly", () => {
    expect(() => assertInitFrameShape({ session_id: "sess-1" })).toThrow(MISSING_API_KEY_SOURCE_RE);
  });
});
