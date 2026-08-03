// healToChatDefault — the agent-sdk model heal (neo routing.ts:136-147). Tier-preserving: a stale/aliased
// id that still names a tier heals WITHIN that tier (never silently jumps to a different price/behavior
// tier); only a truly unrecognized id or `null` falls to the system default.

import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { getLog } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { healToChatDefault } from "../../../../../packages/server/src/domain/connection/substrate/heal-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("healToChatDefault", () => {
  test("null heals to the curated default", () => {
    expect(healToChatDefault(null)).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  test("a valid shortlist id passes through unchanged", () => {
    expect(healToChatDefault("claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(healToChatDefault(DEFAULT_CHAT_MODEL_ID)).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  test("a curated non-flagship (claude-sonnet-4-6) passes through — NEVER healed away (c656bc1b)", () => {
    // 4.6 was re-curated for its structured flag: a game/preset deliberately on 4.6 must STAY on 4.6 —
    // healing it to sonnet-5 would undo the exact fix the curation shipped.
    expect(healToChatDefault("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  test("REGRESSION: a STALE sonnet version heals within-tier to the flagship, not opus", () => {
    // The owner-reported bug class: a stale sonnet id must never fall all the way to
    // DEFAULT_CHAT_MODEL_ID (opus), silently upgrading a sonnet user to opus pricing/behavior.
    // `claude-sonnet-4-5` is genuinely uncurated, so it tier-heals to the flagship.
    expect(healToChatDefault("claude-sonnet-4-5")).toBe("claude-sonnet-5");
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

  test("an OR-prefixed dotted id resolves via getChatModel to ITS curated entry (not the flagship)", () => {
    expect(healToChatDefault("anthropic/claude-sonnet-4.6")).toBe("claude-sonnet-4-6");
  });

  test("a non-Claude id heals to the curated default (no false tier match)", () => {
    expect(healToChatDefault("gpt-4o")).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  test("a Claude-fork id does NOT false-match a tier (anchor discipline) and heals to default", () => {
    expect(healToChatDefault("some-org/claude-fork-sonnet")).toBe(DEFAULT_CHAT_MODEL_ID);
  });

  // Owner ruling 2026-07-21 (no SILENT failure): a genuinely-unrecognized model id (a typo'd/pasted
  // roleDefaults.chat.model) must WARN before defaulting — an operator sees it instead of a mysteriously-opus
  // turn — but must NOT throw (a data typo can't hard-fail the chat) and must NOT warn on recoverable/valid
  // cases (no log noise).
  test("an unrecognized model id WARNS before defaulting (ends the silence — never a throw)", () => {
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      expect(healToChatDefault("gpt-4o")).toBe(DEFAULT_CHAT_MODEL_ID);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [payload] = warnSpy.mock.calls[0] ?? [];
      expect(payload).toMatchObject({ requestedModel: "gpt-4o", fallback: DEFAULT_CHAT_MODEL_ID });
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("a recoverable/valid/null heal does NOT warn (the warning is precise, not noisy)", () => {
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      healToChatDefault(null); // deliberately unset — defaults quietly
      healToChatDefault("claude-sonnet-5"); // valid id
      healToChatDefault("claude-sonnet-4-6"); // stale-but-tier-detectable → heals within tier
      healToChatDefault("sonnet"); // bare family alias → tier heal
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
