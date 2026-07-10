// healToChatDefault — the agent-sdk model heal (neo routing.ts:136-147). Tier-preserving: a stale/aliased
// id that still names a tier heals WITHIN that tier (never silently jumps to a different price/behavior
// tier); only a truly unrecognized id or `null` falls to the system default.

import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { describe } from "vitest";
import { healToChatDefault } from "../../../../../packages/server/src/domain/connection/substrate/heal-model.ts";
import { expect, test } from "../../../../support/fixtures";

describe("healToChatDefault", () => {
  test("null heals to the curated default", () => {
    expect(healToChatDefault(null)).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  test("a valid shortlist id passes through unchanged", () => {
    expect(healToChatDefault("claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(healToChatDefault(DEFAULT_CHAT_MODEL_ID)).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  test("REGRESSION: a stale sonnet version heals to the CURRENT sonnet, not opus", () => {
    // The owner-reported bug: presets storing the pre-bump `claude-sonnet-4-6` id used to fall all the way
    // to DEFAULT_CHAT_MODEL_ID (opus), silently upgrading a sonnet user to opus pricing/behavior.
    expect(healToChatDefault("claude-sonnet-4-6")).toBe("claude-sonnet-5");
  });

  test("a stale/dated haiku variant heals to the curated haiku entry", () => {
    expect(healToChatDefault("claude-haiku-4-0")).toBe("claude-haiku-4-5-20251001");
  });

  test("a bare family alias heals to its tier's current entry (case-insensitive)", () => {
    expect(healToChatDefault("sonnet")).toBe("claude-sonnet-5");
    expect(healToChatDefault("Sonnet")).toBe("claude-sonnet-5");
    expect(healToChatDefault("haiku")).toBe("claude-haiku-4-5-20251001");
    expect(healToChatDefault("opus")).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  test("an OR-prefixed dotted id resolves via getChatModel to the current sonnet entry", () => {
    expect(healToChatDefault("anthropic/claude-sonnet-4.6")).toBe("claude-sonnet-5");
  });

  test("a non-Claude id heals to the curated default (no false tier match)", () => {
    expect(healToChatDefault("gpt-4o")).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  test("a Claude-fork id does NOT false-match a tier (anchor discipline) and heals to default", () => {
    expect(healToChatDefault("some-org/claude-fork-sonnet")).toBe(DEFAULT_CHAT_MODEL_ID);
  });
});
