//
// Seed-frame shape + determinism + the init-frame shape guard (providers.md Esoteric §3). The shape is
// load-bearing: full frames resume, an assistant-first seed gets a synthetic user stub, and identical
// canon under the same sessionId rebuilds byte-identically (so the prompt cache survives a reseed).

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
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
import { expect, test } from "../../../../../../support/fixtures.ts";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_SESSION_ID_RE = /missing session_id/u;
const MISSING_API_KEY_SOURCE_RE = /missing apiKeySource/u;
const UUID_V4_SHAPE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u;

interface FrameShape {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;
  // @orb-waive brand-in-name-position(sessionId): the Claude Agent SDK's OWN chat-session id (its `session_id` wire field) — a NAME COLLISION with our BFF `SessionId = TypeIdOf<"session">`, a different wire's id that merely shares the spelling. Ends if this position ever carries one of our session rows, or if the field is renamed `sdkSessionId` (which would dissolve this marker).
  sessionId?: string;
  message: { role: string; content: Record<string, unknown>[] };
}

const asFrame = (entry: unknown): FrameShape => entry as FrameShape;

/** A text-only seed turn. The seed vocabulary is content BLOCKS since #1605 (a tool exchange rides as a real
 *  `tool_use`/`tool_result` pair), so a prose turn is a one-element text block array. */
function t(role: "user" | "assistant", text: string): { role: "user" | "assistant"; content: [{ type: "text"; text: string }] } {
  return { role, content: [{ type: "text", text }] };
}

describe("buildSeedFrames — the validated full-frame shape", () => {
  test("produces full, user-first, parent-chained frames carrying the metadata bundle", () => {
    const frames = buildSeedFrames([t("user", "hello there"), t("assistant", "hi, traveler")], SESSION_ID);
    expect(frames).toHaveLength(2);

    const first = asFrame(frames[0]);
    expect(first.type).toBe("user");
    expect(first.message.content[0]?.["text"]).toBe("hello there");
    expect(first.parentUuid).toBeNull();
    expect(typeof first.uuid).toBe("string");
    expect(first.sessionId).toBe(SESSION_ID);
    expect(typeof first.timestamp).toBe("string");

    const second = asFrame(frames[1]);
    expect(second.type).toBe("assistant");
    expect(second.message.content[0]?.["text"]).toBe("hi, traveler");
    // The chain links the assistant frame to the user frame's uuid.
    expect(second.parentUuid).toBe(first.uuid);
  });

  test("the same canon under the same sessionId rebuilds BYTE-IDENTICALLY (prompt-cache survival)", () => {
    const canon = [t("user", "deterministic"), t("assistant", "stable")];
    expect(buildSeedFrames(canon, SESSION_ID)).toStrictEqual(buildSeedFrames(canon, SESSION_ID));
  });
});

// #1605 — THE TOOL EXCHANGE IS REAL BLOCKS ON THE FRAME. The compose seam decides WHICH exchanges may ride
// structurally (both halves present, adjacent and parseable); this is the other half — the SDK's own spelling
// (`tool_use` / `tool_result`, `input`, `tool_use_id`) is minted here and nowhere else, and the comparator has
// to survive it. The trap the arm walked into: the comparator projected `type === "text"` only, so a
// tool_result block projected to NOTHING and a seeded exchange compared equal to a session that never held
// one — a false MATCH (resume a transcript that is not this one) in one direction and a false divergence
// (reseed every turn) in the other.
describe("buildSeedFrames — the tool exchange rides as real SDK blocks", () => {
  const call = { type: "tool-call" as const, toolCallId: "toolu_1", name: "fetch", arguments: '{"url":"https://x"}' };
  const result = { type: "tool-result" as const, toolCallId: "toolu_1", content: "the sky is blue" };
  const exchange = [
    t("user", "what colour is the sky?"),
    { role: "assistant" as const, content: [{ type: "text" as const, text: "looking" }, call] },
    { role: "user" as const, content: [result] },
  ];

  test("a tool-call becomes a tool_use block with the id intact; a tool-result becomes tool_result with tool_use_id", () => {
    const frames = buildSeedFrames(exchange, SESSION_ID);
    const assistant = asFrame(frames[1]);
    expect(assistant.message.content[0]).toStrictEqual({ type: "text", text: "looking" });
    // The Anthropic spelling — `input` is the PARSED object, never the raw argument string.
    expect(assistant.message.content[1]).toStrictEqual({ type: "tool_use", id: "toolu_1", name: "fetch", input: { url: "https://x" } });
    const toolTurn = asFrame(frames[2]);
    expect(toolTurn.type).toBe("user");
    // Read by key rather than declared: the wire's own vocabulary is snake_case and an object literal would
    // need a lint suppression to say so.
    const resultBlock = toolTurn.message.content[0] ?? {};
    expect(resultBlock["type"]).toBe("tool_result");
    expect(resultBlock["tool_use_id"]).toBe("toolu_1");
    expect(resultBlock["content"]).toBe("the sky is blue");
  });

  test("an errored result carries is_error; an EMPTY result carries a host marker, never an empty body", () => {
    const frames = buildSeedFrames(
      [
        t("user", "go"),
        { role: "assistant" as const, content: [call] },
        { role: "user" as const, content: [{ type: "tool-result" as const, toolCallId: "toolu_1", content: "", isError: true }] },
      ],
      SESSION_ID,
    );
    const block = asFrame(frames[2]).message.content[0] ?? {};
    expect(block["tool_use_id"]).toBe("toolu_1");
    expect(block["content"]).toBe("[no output]");
    expect(block["is_error"]).toBe(true);
  });

  test("the frames a tool exchange produces MATCH their own seed (the comparator survives non-text blocks)", () => {
    expect(sessionMatchesSeed(buildSeedFrames(exchange, SESSION_ID), exchange)).toBe(true);
  });

  test("a session holding the exchange does NOT match a seed that lost it — the tool blocks carry identity", () => {
    const withoutTools = [t("user", "what colour is the sky?"), t("assistant", "looking")];
    expect(sessionMatchesSeed(buildSeedFrames(exchange, SESSION_ID), withoutTools)).toBe(false);
  });

  test("a DIFFERENT exchange (another call id) is a different lineage", () => {
    const other = [
      t("user", "what colour is the sky?"),
      {
        role: "assistant" as const,
        content: [
          { type: "text" as const, text: "looking" },
          { ...call, toolCallId: "toolu_2" },
        ],
      },
      { role: "user" as const, content: [{ ...result, toolCallId: "toolu_2" }] },
    ];
    expect(seedSessionId(castId<ChatId>("chat-1"), other)).not.toBe(seedSessionId(castId<ChatId>("chat-1"), exchange));
  });
});

describe("toSeedTurns — the assistant-first stub + system-drop rules", () => {
  test("an ASSISTANT-FIRST canon gets the synthetic user stub prefixed (resume needs user-first)", () => {
    const seed = toSeedTurns([t("assistant", "a lone greeting")]);
    expect(seed[0]).toStrictEqual(t("user", GREETING_USER_STUB));
    expect(seed[1]?.role).toBe("assistant");
  });

  test("a USER-FIRST canon is NOT stub-prefixed", () => {
    const seed = toSeedTurns([t("user", "opening line")]);
    expect(seed[0]?.role).toBe("user");
    expect(seed[0]?.content).toStrictEqual([{ type: "text", text: "opening line" }]);
    expect(seed).toHaveLength(1);
  });

  test("system rows are dropped (they ride in the assembled system prompt, not the transcript)", () => {
    const seed = toSeedTurns([{ role: "system", content: [{ type: "text", text: "be terse" }] }, t("user", "go")]);
    expect(seed).toStrictEqual([{ ...t("user", "go"), model: null }]);
  });

  test("an empty (no user/assistant) canon yields no seed", () => {
    expect(toSeedTurns([{ role: "system", content: [{ type: "text", text: "only system" }] }])).toStrictEqual([]);
  });
});

// A store entry hand-built without importing the sealed SDK types (mirror store.test's pattern).
type Entry = Parameters<typeof sessionMatchesSeed>[0][number];
const asEntry = (e: unknown): Entry => e as Entry;

describe("sessionMatchesSeed — the resume-gate comparator", () => {
  const canon = [t("user", "v1"), t("assistant", "r1")];

  test("a session holding exactly the seeded frames MATCHES (resume)", () => {
    expect(sessionMatchesSeed(buildSeedFrames(canon, SESSION_ID), canon)).toBe(true);
  });

  test("changed content does NOT match (edit → reseed)", () => {
    const frames = buildSeedFrames([t("user", "v2")], SESSION_ID);
    expect(sessionMatchesSeed(frames, [t("user", "v1")])).toBe(false);
  });

  test("a session holding MORE than the seed does NOT match (a swipe's rejected reply)", () => {
    const frames = buildSeedFrames([...canon, t("user", "u2"), t("assistant", "rejected")], SESSION_ID);
    expect(sessionMatchesSeed(frames, [...canon, t("user", "u2")])).toBe(false);
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
    expect(sessionMatchesSeed(entries, [t("user", "hello"), t("assistant", "part two")])).toBe(true);
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
    expect(sessionMatchesSeed(entries, [t("user", "a"), t("user", "b"), t("assistant", "r")])).toBe(true);
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
    expect(sessionMatchesSeed(entries, [t("user", "go"), t("assistant", "done")])).toBe(true);
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
    expect(sessionMatchesSeed(entries, [t("user", "go"), t("assistant", "done")])).toBe(true);
  });
});

describe("isBranchDivergence — swipe/edit (shared-prefix) vs unrelated divergence", () => {
  const canon = [t("user", "u1"), t("assistant", "r1")];

  test("a swipe (shared prefix, then a diverged tail) IS a branch", () => {
    // Stored = canon + a rejected reply; the new seed keeps canon's prefix but swaps the tail.
    const stored = buildSeedFrames([...canon, t("user", "u2"), t("assistant", "rejected")], SESSION_ID);
    const swipe = [...canon, t("user", "u2"), t("assistant", "kept")];
    expect(isBranchDivergence(stored, swipe)).toBe(true);
  });

  test("an edit of a MIDDLE turn (shares the leading run) IS a branch", () => {
    const stored = buildSeedFrames(canon, SESSION_ID);
    const edited = [t("user", "u1"), t("assistant", "r1 EDITED")];
    expect(isBranchDivergence(stored, edited)).toBe(true);
  });

  test("a fully-unrelated transcript (no shared leading run) is NOT a branch", () => {
    const stored = buildSeedFrames(canon, SESSION_ID);
    const unrelated = [t("user", "totally different"), t("assistant", "elsewhere")];
    expect(isBranchDivergence(stored, unrelated)).toBe(false);
  });

  test("a first-turn edit (diverges at the very first run) is NOT a branch", () => {
    const stored = buildSeedFrames(canon, SESSION_ID);
    const editedFirst = [t("user", "u1 EDITED"), t("assistant", "r1")];
    expect(isBranchDivergence(stored, editedFirst)).toBe(false);
  });
});

describe("sessionContainsSeedPrefix — the grown-superset re-adoption gate", () => {
  const canon = [t("user", "u1"), t("assistant", "r1")];

  test("an EXACT match is a prefix (the sessionMatchesSeed case is subsumed)", () => {
    expect(sessionContainsSeedPrefix(buildSeedFrames(canon, SESSION_ID), canon)).toBe(true);
  });

  test("a GROWN lineage (seed + SDK-appended turns) still contains the seed as a leading prefix", () => {
    // The live-append shape: canon ends on an assistant reply, so the SDK's growth is the NEXT distinct-role
    // turns (a user prompt + its reply) — a clean leading prefix, not folded into canon's trailing run.
    const grown = buildSeedFrames([...canon, t("user", "u2"), t("assistant", "r2")], SESSION_ID);
    // NOTE: `sessionMatchesSeed` (exact) is FALSE here — that mismatch is exactly why the old build re-forked.
    expect(sessionMatchesSeed(grown, canon)).toBe(false);
    expect(sessionContainsSeedPrefix(grown, canon)).toBe(true);
  });

  test("a DIVERGED lineage (same length, different tail) is NOT a prefix", () => {
    const stored = buildSeedFrames([t("user", "u1"), t("assistant", "r1 DIFFERENT")], SESSION_ID);
    expect(sessionContainsSeedPrefix(stored, canon)).toBe(false);
  });

  test("a stored transcript SHORTER than the seed is NOT a prefix (the seed can't be contained)", () => {
    const stored = buildSeedFrames([t("user", "u1")], SESSION_ID);
    expect(sessionContainsSeedPrefix(stored, canon)).toBe(false);
  });

  test("an EMPTY seed is never a prefix (nothing to re-adopt against)", () => {
    expect(sessionContainsSeedPrefix(buildSeedFrames(canon, SESSION_ID), [])).toBe(false);
  });
});

describe("seedSessionId — deterministic uuid-shaped session ids", () => {
  const seed = [t("user", "hello")];

  test("uuid-v4-shaped (the SDK rejects arbitrary resume ids)", () => {
    expect(seedSessionId(castId<ChatId>("chat-1"), seed)).toMatch(UUID_V4_SHAPE_RE);
  });

  test("same chat + seed + salt → the same id; chat, seed, or salt changes it", () => {
    expect(seedSessionId(castId<ChatId>("chat-1"), seed)).toBe(seedSessionId(castId<ChatId>("chat-1"), seed));
    expect(seedSessionId(castId<ChatId>("chat-2"), seed)).not.toBe(seedSessionId(castId<ChatId>("chat-1"), seed));
    expect(seedSessionId(castId<ChatId>("chat-1"), [t("user", "other")])).not.toBe(seedSessionId(castId<ChatId>("chat-1"), seed));
    expect(seedSessionId(castId<ChatId>("chat-1"), seed, 1)).not.toBe(seedSessionId(castId<ChatId>("chat-1"), seed, 0));
  });
});

describe("assertInitFrameShape — the SHAPE GUARD", () => {
  test("a well-formed init frame passes", () => {
    // biome-ignore lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
    expect(() => assertInitFrameShape({ session_id: "sess-1", apiKeySource: "oauth" })).not.toThrow();
  });

  test("a missing session_id throws loudly", () => {
    expect(() => assertInitFrameShape({ apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("an empty session_id throws loudly", () => {
    // biome-ignore lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
    expect(() => assertInitFrameShape({ session_id: "", apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("a missing apiKeySource throws loudly", () => {
    // biome-ignore lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
    expect(() => assertInitFrameShape({ session_id: "sess-1" })).toThrow(MISSING_API_KEY_SOURCE_RE);
  });
});
