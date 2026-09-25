// share.status — owner only; the relay state and the live socket count the Share card shows.

import { DomainForbiddenError } from "@orb/kit/errors";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, LIVE_SOCKETS, shareHarness } from "../_support.ts";

describe("share.status", () => {
  test("the owner reads the relay state and the live socket count", async () => {
    const h = shareHarness({ authMode: "local" });
    await expect(h.share.status({ principal: caller("owner") })).resolves.toEqual({ relay: { state: "off" }, liveSocketCount: LIVE_SOCKETS });
    await h.share.start({ principal: caller("owner") });
    await expect(h.share.status({ principal: caller("owner") })).resolves.toEqual({
      relay: { state: "starting", relay: "quick", restartAfter: null },
      liveSocketCount: LIVE_SOCKETS,
    });
  });

  test("an admin and a user are refused, learning nothing about the relay", async () => {
    for (const role of ["admin", "user"] as const) {
      const h = shareHarness({ authMode: "local" });
      await expect(h.share.status({ principal: caller(role) })).rejects.toBeInstanceOf(DomainForbiddenError);
    }
  });
});
