// share.status — owner only; the relay state and the live socket count the Share card shows.
// @subject packages/server/src/domain/share/verbs/status.ts

import { DomainForbiddenError } from "@orb/kit/errors";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { caller, LIVE_SOCKETS, shareHarness } from "../_support.ts";

describe("share.status", () => {
  test("the owner reads the relay state and the live socket count", async () => {
    const db = await freshDb();
    const h = shareHarness({ authMode: "local" });
    await expect(h.share.status({ principal: await caller(db, "owner") })).resolves.toEqual({
      relay: { state: "off" },
      liveSocketCount: LIVE_SOCKETS,
      publicAddresses: [],
      certificate: { state: "off" },
    });
    await h.share.start({ principal: await caller(db, "owner") });
    await expect(h.share.status({ principal: await caller(db, "owner") })).resolves.toEqual({
      relay: { state: "starting", relay: "quick", restartAfter: null },
      liveSocketCount: LIVE_SOCKETS,
      publicAddresses: [],
      certificate: { state: "off" },
    });
  });

  test("an admin and a user are refused, learning nothing about the relay", async () => {
    const db = await freshDb();
    for (const role of ["admin", "user"] as const) {
      const h = shareHarness({ authMode: "local" });
      await expect(h.share.status({ principal: await caller(db, role) })).rejects.toBeInstanceOf(DomainForbiddenError);
    }
  });
});
