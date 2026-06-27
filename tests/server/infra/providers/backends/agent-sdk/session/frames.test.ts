// biome-ignore-all lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
//
// Seed-frame shape + determinism + the init-frame shape guard (providers.md Esoteric §3). The shape is
// load-bearing: full frames resume, an assistant-first seed gets a synthetic user stub, and identical
// canon under the same sessionId rebuilds byte-identically (so the prompt cache survives a reseed).

import { assertInitFrameShape } from "@orb/server/infra/providers/backends/agent-sdk";
import {
  buildSeedFrames,
  GREETING_USER_STUB,
  seedFramesAreStale,
  toSeedTurns,
} from "@orb/server/infra/providers/backends/agent-sdk/session";
import { describe, expect, test } from "vitest";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_SESSION_ID_RE = /missing session_id/;
const MISSING_API_KEY_SOURCE_RE = /missing apiKeySource/;

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

describe("seedFramesAreStale — reseed-when-stale comparator", () => {
  const canon = [{ role: "user" as const, content: "v1" }];

  test("identical rebuilt frames are NOT stale (an unchanged reseed is a no-op)", () => {
    const a = buildSeedFrames(canon, SESSION_ID);
    const b = buildSeedFrames(canon, SESSION_ID);
    expect(seedFramesAreStale(a, b)).toBe(false);
  });

  test("changed content is stale", () => {
    const a = buildSeedFrames(canon, SESSION_ID);
    const b = buildSeedFrames([{ role: "user", content: "v2" }], SESSION_ID);
    expect(seedFramesAreStale(a, b)).toBe(true);
  });

  test("a changed length is stale", () => {
    const a = buildSeedFrames(canon, SESSION_ID);
    const b = buildSeedFrames(
      [
        { role: "user", content: "v1" },
        { role: "assistant", content: "more" },
      ],
      SESSION_ID,
    );
    expect(seedFramesAreStale(a, b)).toBe(true);
  });
});

describe("assertInitFrameShape — the SHAPE GUARD", () => {
  test("a well-formed init frame passes", () => {
    expect(() =>
      assertInitFrameShape({ session_id: "sess-1", apiKeySource: "oauth" }),
    ).not.toThrow();
  });

  test("a missing session_id throws loudly", () => {
    expect(() => assertInitFrameShape({ apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("an empty session_id throws loudly", () => {
    expect(() => assertInitFrameShape({ session_id: "", apiKeySource: "oauth" })).toThrow(
      MISSING_SESSION_ID_RE,
    );
  });

  test("a missing apiKeySource throws loudly", () => {
    expect(() => assertInitFrameShape({ session_id: "sess-1" })).toThrow(MISSING_API_KEY_SOURCE_RE);
  });
});
