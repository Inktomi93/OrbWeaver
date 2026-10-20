// share.stop — owner only; ends the relay and audits it.
// @subject packages/server/src/domain/share/verbs/stop.ts

import { DomainForbiddenError } from "@orb/kit/errors";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { caller, LIVE_SOCKETS, shareHarness } from "../_support.ts";

describe("share.stop", () => {
  test("the owner stops the relay, reads it off, and the stop is audited", async () => {
    const db = await freshDb();
    const h = shareHarness({ authMode: "local" });
    await h.share.start({ principal: await caller(db, "owner") });
    await expect(h.share.stop({ principal: await caller(db, "owner") })).resolves.toEqual({
      relay: { state: "off" },
      liveSocketCount: LIVE_SOCKETS,
      publicAddresses: [],
      certificate: { state: "off" },
    });
    expect(h.calls.at(-1)).toBe("relay.stop");
    expect(h.audits.at(-1)).toEqual({ actorUserId: (await caller(db, "owner")).userId, action: "share.stop", entityType: "server" });
  });

  test("an admin and a user are refused and the relay keeps running", async () => {
    const db = await freshDb();
    for (const role of ["admin", "user"] as const) {
      const h = shareHarness({ authMode: "local" });
      await h.share.start({ principal: await caller(db, "owner") });
      await expect(h.share.stop({ principal: await caller(db, role) })).rejects.toBeInstanceOf(DomainForbiddenError);
      expect(h.calls, role).not.toContain("relay.stop");
    }
  });
});
