// verbs/read/get-game — getGame (docs/plans/rpg/design.md). The takeover's mode read + the honest-arms
// `trackersReadOnly` verdict + (EFF-3) the EFFECTIVE delivery the freshness pill renders instead of the knob.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, principal, seedLiteGame, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("getGame", () => {
  test("returns the mode/status + the honest-arms trackersReadOnly verdict + the default folded extractionMode", async () => {
    const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
    const view = await h.service.getGame({ principal: principal(castId<Handle>("host")), chatId });
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
    await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap" });
    const view = await h.service.getGame({ principal: principal(castId<Handle>("host")), chatId });
    expect(view.extractionMode).toBe("cheap");
  });

  test("EFF-3: a folded game on a wire that CAN fold reports the fold — knob and reality agree", async () => {
    const { chatId, h } = await seedLiteGame(db);
    const view = await h.service.getGame({ principal: principal(castId<Handle>("host")), chatId });
    expect(view.extractionMode).toBe("folded");
    expect(view.effectiveDelivery).toEqual({ path: "folded", fallbackReason: null });
  });

  test("EFF-3: a FOLD-GUARDED folded game reports the post-commit round it actually runs, with the reason", async () => {
    // The D112 (4) KNOWN GAP, at the seam that fixes it: the knob still SAYS folded (the host's choice is never
    // rewritten), but the view now carries what this room's wire actually does with it — so the panel can stop
    // claiming "Live" on a room that is a beat behind.
    const { chatId, h } = await seedLiteGame(db, { foldGuarded: true });
    const view = await h.service.getGame({ principal: principal(castId<Handle>("host")), chatId });
    expect(view.extractionMode).toBe("folded");
    expect(view.effectiveDelivery).toEqual({ path: "tool-round", fallbackReason: "local-engine-fold-guard" });
  });

  test("EFF-3: a readonly room delivers nothing — `none`, never a lag label the flush's F2 gate makes false", async () => {
    const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
    expect((await h.service.getGame({ principal: principal(castId<Handle>("host")), chatId })).effectiveDelivery).toEqual({
      path: "none",
      fallbackReason: null,
    });
  });
});
