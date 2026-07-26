// verbs/read/get-config-view — getConfigView (rpg-design/05 §4.8, §6.2). HOST-gated. Carries the knobs
// (`gmPresetId` / `extractionMode`) at their defaults on a fresh game.

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("getConfigView", () => {
  test("carries the knobs at their defaults (gmPresetId null, extractionMode reliable)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const config = await h.service.getConfigView({ principal: principal("host"), chatId });
    expect(config.gmPresetId).toBeNull(); // the knob default
    expect(config.extractionMode).toBe("reliable"); // the delivery-model knob default
  });
});
