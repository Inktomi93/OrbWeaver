// healToChatDefault — the agent-sdk model heal (connection.md routing.ts:136-147). A valid shortlist id
// passes; a null/non-shortlist id heals to the system default.

import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { describe, expect, test } from "vitest";
import { healToChatDefault } from "../../../../../packages/server/src/domain/connection/substrate/heal-model.ts";

describe("healToChatDefault", () => {
  test("null heals to the curated default", () => {
    expect(healToChatDefault(null)).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  test("a valid shortlist id passes through", () => {
    expect(healToChatDefault("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  test("a non-shortlist id heals to the curated default", () => {
    expect(healToChatDefault("openai/gpt-5")).toBe(DEFAULT_CHAT_MODEL_ID);
  });
});
