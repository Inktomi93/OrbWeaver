// The row → view mappers (pure). Pins the two load-bearing read-seam behaviors:
//   1. `isSystemDefault` is derived from the sentinel id (`id === SYSTEM_DEFAULT_PRESET_ID`), NOT
//      `ownerId IS NULL` — ownerless PACKAGED template rows are also un-owned but are NOT the default.
//   2. the LENIENT config parse: a garbage `params` blob is bounded to `{}` WITHOUT
//      degrading the whole config — the user's `sections` survive. (If `.catch({})` were dropped, the whole
//      preset would collapse to DEFAULT_PROMPT_CONFIG and the sections would be lost.)

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { presets } from "@orb/db";
import type { PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { toPresetDetail, toPresetSummary } from "../../../../../packages/server/src/domain/preset/substrate/views.ts";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT } from "../_support.ts";

type PresetRow = typeof presets.$inferSelect;

function row(overrides: Partial<PresetRow> = {}): PresetRow {
  return {
    id: castId<PresetId>("preset_row"),
    ownerId: castId<UserId>("user_owner"),
    name: "Roleplay",
    kind: "roleplay",
    config: DEFAULT_PROMPT_CONFIG,
    schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
    forkedFrom: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
    ...overrides,
  };
}

describe("toPresetSummary", () => {
  test("an owned row is not the system default", () => {
    expect(toPresetSummary(row()).isSystemDefault).toBe(false);
  });

  test("the sentinel row IS the system default", () => {
    expect(toPresetSummary(row({ id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null })).isSystemDefault).toBe(true);
  });

  test("an ownerless NON-sentinel row (a packaged template) is NOT the system default", () => {
    expect(toPresetSummary(row({ id: castId<PresetId>("preset_000000000000000000000rpggm"), ownerId: null })).isSystemDefault).toBe(false);
  });

  test("projects id/name/kind/dates", () => {
    const s = toPresetSummary(row({ name: "Assistant", kind: "assistant" }));
    expect(s).toMatchObject({ name: "Assistant", kind: "assistant", createdAt: FROZEN_AT });
  });

  test("carries the fork lineage verbatim (null for a born-here row)", () => {
    expect(toPresetSummary(row()).forkedFrom).toBe(null);
    expect(toPresetSummary(row({ forkedFrom: SYSTEM_DEFAULT_PRESET_ID })).forkedFrom).toBe(SYSTEM_DEFAULT_PRESET_ID);
  });
});

describe("toPresetDetail (lenient parse seam)", () => {
  test("a valid config round-trips through the detail view", () => {
    const d = toPresetDetail(row());
    expect(d.config.sections.length).toBe(DEFAULT_PROMPT_CONFIG.sections.length);
    expect(d.schemaVersion).toBe(DEFAULT_PROMPT_CONFIG.schemaVersion);
  });

  test("a garbage params blob is bounded to {} while sections survive (the .catch({}) bound)", () => {
    const corruptParams = {
      ...DEFAULT_PROMPT_CONFIG,
      params: { quality: "definitely-not-a-quality" },
    } as unknown as PromptConfig;
    const d = toPresetDetail(row({ config: corruptParams }));
    // sections preserved (NOT degraded to DEFAULT wholesale)…
    expect(d.config.sections.length).toBe(DEFAULT_PROMPT_CONFIG.sections.length);
    // …and the damage is bounded to params alone.
    expect(d.config.params).toEqual({});
  });
});
