// share.stop — owner only; ends the relay and audits it.

import { DomainForbiddenError } from "@orb/kit/errors";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, LIVE_SOCKETS, shareHarness } from "../_support.ts";

describe("share.stop", () => {
  test("the owner stops the relay, reads it off, and the stop is audited", async () => {
    const h = shareHarness({ authMode: "local" });
    await h.share.start({ principal: caller("owner") });
    await expect(h.share.stop({ principal: caller("owner") })).resolves.toEqual({ relay: { state: "off" }, liveSocketCount: LIVE_SOCKETS });
    expect(h.calls.at(-1)).toBe("relay.stop");
    expect(h.audits.at(-1)).toEqual({ actorUserId: caller("owner").userId, action: "share.stop", entityType: "server" });
  });

  test("an admin and a user are refused and the relay keeps running", async () => {
    for (const role of ["admin", "user"] as const) {
      const h = shareHarness({ authMode: "local" });
      await h.share.start({ principal: caller("owner") });
      await expect(h.share.stop({ principal: caller(role) })).rejects.toBeInstanceOf(DomainForbiddenError);
      expect(h.calls, role).not.toContain("relay.stop");
    }
  });
});
