// chat.ts — the chat role's request/result vocab. The runtime logic is `normalizeFinishReason`: the ONE
// cross-backend stop/finish/status → normalized signal. We lock every documented raw → normalized
// mapping, the case-insensitive fold, the null/empty passthrough, and the "never silently a stop"
// fallback (an unrecognized non-null value → "other", not "stop").

import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { HISTORY_ROLES, NORMALIZED_FINISH_REASONS, normalizeFinishReason } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

describe("normalizeFinishReason — the cross-backend finish-reason map", () => {
  test("maps every documented raw dialect onto the normalized vocab", () => {
    for (const raw of ["end_turn", "stop", "stop_sequence", "completed"]) {
      expect(normalizeFinishReason(raw)).toBe("stop");
    }
    for (const raw of ["max_tokens", "length", "max_output_tokens", "model_context_window_exceeded"]) {
      expect(normalizeFinishReason(raw)).toBe("length");
    }
    for (const raw of ["content_filter", "refusal"]) {
      expect(normalizeFinishReason(raw)).toBe("filter");
    }
    for (const raw of ["tool_use", "tool_calls", "function_call"]) {
      expect(normalizeFinishReason(raw)).toBe("tool");
    }
  });

  test("folds case before lookup (provider dialects vary in casing)", () => {
    expect(normalizeFinishReason("END_TURN")).toBe("stop");
    expect(normalizeFinishReason("Tool_Calls")).toBe("tool");
  });

  test("null / undefined / empty in → null out (no reason reported)", () => {
    expect(normalizeFinishReason(null)).toBeNull();
    expect(normalizeFinishReason(undefined)).toBeNull();
    expect(normalizeFinishReason("")).toBeNull();
  });

  test("an unrecognized non-null value → 'other' (never silently a 'stop')", () => {
    expect(normalizeFinishReason("some_new_reason")).toBe("other");
  });

  test("NORMALIZED_FINISH_REASONS enumerates exactly the five normalized values", () => {
    expect([...NORMALIZED_FINISH_REASONS]).toStrictEqual(["stop", "length", "filter", "tool", "other"]);
  });
});

describe("HISTORY_ROLES — the D48 wire-axis role tuple (tool-use-design/02 §1)", () => {
  test("is exactly user/assistant/tool/system — tool + wire-system exist ONLY on the wire axis", () => {
    // `system` joined the tuple with the capability-gated mid-conversation system injection
    // (`turns.midConversationSystem`) — a depth-0 splice row each translator delivers over its wire's
    // own system-authority channel. `systemPrompt` remains the home of the system PROMPT.
    expect([...HISTORY_ROLES]).toStrictEqual(["user", "assistant", "tool", "system"]);
  });

  test("stays a DISTINCT axis from kit MESSAGE_ROLES (persisted roles gain no 'tool')", () => {
    // `tool` is a materialized wire message, never a persisted slot role (D48).
    expect(MESSAGE_ROLES).not.toContain("tool");
  });
});
