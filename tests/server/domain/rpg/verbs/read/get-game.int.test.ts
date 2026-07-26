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
  test("returns the mode/status + the honest-arms trackersReadOnly verdict", async () => {
    const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
    const view = await h.service.getGame({ principal: principal("host"), chatId });
    expect(view.mode).toBe("lite");
    expect(view.status).toBe("active");
    expect(view.trackersReadOnly).toBe(true);
  });
});
