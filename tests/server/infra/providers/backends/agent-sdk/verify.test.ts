//
// assertInitFrameShape — the init-frame SHAPE GUARD (Tier-3b-Providers.md Esoteric §3). The SDK's system/init
// frame carries the `session_id` every later resume lookup is keyed by + `apiKeySource` (the sub-vs-key
// canary). A dropped/renamed field would silently corrupt a thousand session-id-keyed lookups, so the
// guard throws LOUDLY at the first turn instead. We lock that EVERY malformed shape (missing/empty/
// wrong-typed) throws, and a well-formed one passes.

import { assertInitFrameShape, classifyTerminalReason } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

const MISSING_SESSION_ID_RE = /missing session_id/u;
const MISSING_API_KEY_SOURCE_RE = /missing apiKeySource/u;

describe("assertInitFrameShape", () => {
  test("a well-formed init frame passes", () => {
    // biome-ignore lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
    expect(() => assertInitFrameShape({ session_id: "sess-1", apiKeySource: "oauth" })).not.toThrow();
  });

  test("a missing session_id throws loudly (points at an SDK shape change)", () => {
    expect(() => assertInitFrameShape({ apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("an empty-string session_id throws loudly (an empty id can't key a resume lookup)", () => {
    // biome-ignore lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
    expect(() => assertInitFrameShape({ session_id: "", apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("a non-string session_id throws loudly (the type, not just presence, is guarded)", () => {
    // biome-ignore lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
    expect(() => assertInitFrameShape({ session_id: 42, apiKeySource: "oauth" })).toThrow(MISSING_SESSION_ID_RE);
  });

  test("a missing apiKeySource throws loudly (the sub-vs-key canary is required)", () => {
    // biome-ignore lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
    expect(() => assertInitFrameShape({ session_id: "sess-1" })).toThrow(MISSING_API_KEY_SOURCE_RE);
  });

  test("a non-string apiKeySource throws loudly", () => {
    // biome-ignore lint/style/useNamingConvention: SDK init-frame wire fixtures use snake_case keys.
    expect(() => assertInitFrameShape({ session_id: "sess-1", apiKeySource: 1 })).toThrow(MISSING_API_KEY_SOURCE_RE);
  });

  test("a non-object message does not silently pass (it throws rather than orphan sessions)", () => {
    expect(() => assertInitFrameShape(null)).toThrow();
  });
});

// classifyTerminalReason — the loop-level SDK `TerminalReason` (19-member union, 0.3.206) → normalized
// kind + retryable. It rescues the ban-risk / context-overflow / input-error causes the 4-member subtype
// flattens. We lock one member per BUCKET (the buckets that share a mapping are asserted together).
describe("classifyTerminalReason", () => {
  test("blocking_limit → rate_limit, NON-retryable (a hard block — retrying courts the ban)", () => {
    expect(classifyTerminalReason("blocking_limit")).toEqual({
      kind: "rate_limit",
      retryable: false,
    });
  });

  test("rapid_refill_breaker → rate_limit, RETRYABLE (a transient breaker)", () => {
    expect(classifyTerminalReason("rapid_refill_breaker")).toEqual({
      kind: "rate_limit",
      retryable: true,
    });
  });

  test("prompt_too_long / image_error → invalid, non-retryable (a bad request, not a fault)", () => {
    const invalid = { kind: "invalid", retryable: false };
    expect(classifyTerminalReason("prompt_too_long")).toEqual(invalid);
    expect(classifyTerminalReason("image_error")).toEqual(invalid);
  });

  test("model_error → server, retryable (an upstream model fault)", () => {
    expect(classifyTerminalReason("model_error")).toEqual({ kind: "server", retryable: true });
  });

  test("the abort/hook/deferred/max-turns/background family → aborted, non-retryable", () => {
    for (const reason of [
      "aborted_streaming",
      "aborted_tools",
      "stop_hook_prevented",
      "hook_stopped",
      "tool_deferred",
      "max_turns",
      "background_requested",
    ] as const) {
      expect(classifyTerminalReason(reason)).toEqual({ kind: "aborted", retryable: false });
    }
  });

  test("completed on the error path → server (contradictory; treated as a transient fault)", () => {
    expect(classifyTerminalReason("completed")).toEqual({ kind: "server", retryable: true });
  });

  // ── The 6 members added in SDK 0.3.206 (union 13 → 19) ──────────────────────────────────────────

  test("api_error / turn_setup_failed / malformed_tool_use_exhausted → server, retryable (transient generation-side faults)", () => {
    const server = { kind: "server", retryable: true };
    expect(classifyTerminalReason("api_error")).toEqual(server);
    expect(classifyTerminalReason("turn_setup_failed")).toEqual(server);
    expect(classifyTerminalReason("malformed_tool_use_exhausted")).toEqual(server);
  });

  test("budget_exhausted → billing, NON-retryable (mirrors error_max_budget_usd — never auto-retry into spend)", () => {
    expect(classifyTerminalReason("budget_exhausted")).toEqual({
      kind: "billing",
      retryable: false,
    });
  });

  test("structured_output_retry_exhausted → invalid, non-retryable (mirrors error_max_structured_output_retries)", () => {
    expect(classifyTerminalReason("structured_output_retry_exhausted")).toEqual({
      kind: "invalid",
      retryable: false,
    });
  });

  test("tool_deferred_unavailable → invalid, non-retryable (a config mismatch, unlike tool_deferred's clean stop)", () => {
    expect(classifyTerminalReason("tool_deferred_unavailable")).toEqual({
      kind: "invalid",
      retryable: false,
    });
  });
});
