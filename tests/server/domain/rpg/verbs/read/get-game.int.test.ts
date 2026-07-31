// verbs/read/get-game — getGame (rpg-design/05 §4.8, §6.2). The takeover's mode read + the honest-arms
// `trackersReadOnly` verdict.

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("getGame", () => {
  test("returns the mode/status + the honest-arms trackersReadOnly verdict + the default folded extractionMode", async () => {
    const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
    const view = await h.service.getGame({ principal: principal("host"), chatId });
    expect(view.mode).toBe("lite");
    expect(view.status).toBe("active");
    expect(view.trackersReadOnly).toBe(true);
    // The delivery-model knob rides the member view (the panel's freshness indicator reads it); a game is BORN
    // `folded` (owner ruling 2026-08-01), which is the ONE mode whose state is live AT COMMIT — so the default
    // view reports no freshness lag.
    expect(view.extractionMode).toBe("folded");
  });

  test("surfaces the cheap extractionMode after a host flips the delivery-model knob", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
    const view = await h.service.getGame({ principal: principal("host"), chatId });
    expect(view.extractionMode).toBe("cheap");
  });
});
