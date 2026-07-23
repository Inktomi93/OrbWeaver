// Runner test: expressions-sprite-sheet — the sprite-sheet generation pass (expressions-design/03 §3.3). Thin
// wrapper: it delegates the whole bulk pass to `ctx.env.expressions.runSpriteSheetJob` (the implementation
// lives in domain/expressions) and returns its `SpriteSheetJobResult` verbatim — never a db reach from here.

import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import { expressionsSpriteSheetRunner } from "../../../../../packages/server/src/domain/workloads/runners/expressions-sprite-sheet.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeEnv, makeRunnerContext } from "../_support.ts";

const PARAMS = {
  characterId: castId<CharacterId>("character_ada"),
  labels: ["joy", "anger"],
  matte: "flood" as const,
  ownerId: castId<UserId>("user_owner"),
};

describe("expressions-sprite-sheet runner", () => {
  test("delegates the pass to the injected env and returns its result", async () => {
    const result = { written: 2, labels: ["joy", "anger"], sheetAssetId: castId<AssetId>("asset_sheet"), model: "m", costUsd: 0.02 };
    const env = fakeEnv({ expressions: { runSpriteSheetJob: vi.fn(() => Promise.resolve(result)) } });
    const report = vi.fn();
    const signal = new AbortController().signal;

    const out = await expressionsSpriteSheetRunner(makeRunnerContext(env), PARAMS, report, signal);

    expect(out).toBe(result);
    expect(env.expressions.runSpriteSheetJob).toHaveBeenCalledWith(PARAMS, report, signal);
  });
});
