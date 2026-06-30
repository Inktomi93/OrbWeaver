// biome-ignore-all lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
//
// assertInitFrameShape — the init-frame SHAPE GUARD (providers.md Esoteric §3). The SDK's system/init
// frame carries the `session_id` every later resume lookup is keyed by + `apiKeySource` (the sub-vs-key
// canary). A dropped/renamed field would silently corrupt a thousand session-id-keyed lookups, so the
// guard throws LOUDLY at the first turn instead. We lock that EVERY malformed shape (missing/empty/
// wrong-typed) throws, and a well-formed one passes.

import { assertInitFrameShape } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, expect, test } from "vitest";

const MISSING_SESSION_ID_RE = /missing session_id/u;
const MISSING_API_KEY_SOURCE_RE = /missing apiKeySource/u;

describe("assertInitFrameShape", () => {
  test("a well-formed init frame passes", () => {
    expect(() =>
      assertInitFrameShape({ session_id: "sess-1", apiKeySource: "oauth" }),
    ).not.toThrow();
  });

  test("a missing session_id throws loudly (points at an SDK shape change)", () => {
    expect(() => assertInitFrameShape({ apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("an empty-string session_id throws loudly (an empty id can't key a resume lookup)", () => {
    expect(() => assertInitFrameShape({ session_id: "", apiKeySource: "oauth" })).toThrow(
      MISSING_SESSION_ID_RE,
    );
  });

  test("a non-string session_id throws loudly (the type, not just presence, is guarded)", () => {
    expect(() => assertInitFrameShape({ session_id: 42, apiKeySource: "oauth" })).toThrow(
      MISSING_SESSION_ID_RE,
    );
  });

  test("a missing apiKeySource throws loudly (the sub-vs-key canary is required)", () => {
    expect(() => assertInitFrameShape({ session_id: "sess-1" })).toThrow(MISSING_API_KEY_SOURCE_RE);
  });

  test("a non-string apiKeySource throws loudly", () => {
    expect(() => assertInitFrameShape({ session_id: "sess-1", apiKeySource: 1 })).toThrow(
      MISSING_API_KEY_SOURCE_RE,
    );
  });

  test("a non-object message does not silently pass (it throws rather than orphan sessions)", () => {
    expect(() => assertInitFrameShape(null)).toThrow();
  });
});
