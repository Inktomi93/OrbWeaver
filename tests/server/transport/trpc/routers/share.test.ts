// share router — layer 1 admits owner and admin, and the verb's owner gate refuses the admin with the same codeless
// FORBIDDEN a user gets. The service is the real one over a recording relay (`tests/server/domain/share/_support.ts`).

import type { UserRole } from "@orb/contracts/identity";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { LIVE_SOCKETS, shareHarness } from "../../../domain/share/_support.ts";
import { caller, makeContext, principal } from "../_support.ts";

function shareCaller(role: UserRole, harness = shareHarness({ authMode: "local" })): ReturnType<typeof caller>["share"] {
  return caller(makeContext({ auth: principal(role), services: { share: harness.share } })).share;
}

describe("share router", () => {
  test("a user is refused at layer 1, and nothing reaches the relay", async () => {
    const h = shareHarness({ authMode: "local" });
    const share = shareCaller("user", h);
    await expect(share.start()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(share.status()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(share.stop()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.calls).toEqual([]);
  });

  test("an admin passes layer 1 and gets the owner gate's FORBIDDEN, which carries no share state", async () => {
    const h = shareHarness({ authMode: "local", ownerNeedsPassword: true });
    const share = shareCaller("admin", h);
    for (const refusal of [share.start(), share.status(), share.stop()]) {
      await expect(refusal).rejects.toMatchObject({ code: "FORBIDDEN", message: "requires owner privilege" });
    }
    expect(h.calls).toEqual([]);
  });

  test("under single-user the owner's start is a BAD_REQUEST coded share_single_user", async () => {
    const share = shareCaller("owner", shareHarness({ authMode: "single-user" }));
    await expect(share.start()).rejects.toMatchObject({ code: "BAD_REQUEST", cause: { code: "share_single_user" } });
  });

  test("control: the owner starts, reads and stops the share", async () => {
    const share = shareCaller("owner");
    await expect(share.start()).resolves.toEqual({
      relay: { state: "starting", relay: "quick", restartAfter: null },
      liveSocketCount: LIVE_SOCKETS,
      publicAddresses: [],
    });
    await expect(share.status()).resolves.toEqual({
      relay: { state: "starting", relay: "quick", restartAfter: null },
      liveSocketCount: LIVE_SOCKETS,
      publicAddresses: [],
    });
    await expect(share.stop()).resolves.toEqual({ relay: { state: "off" }, liveSocketCount: LIVE_SOCKETS, publicAddresses: [] });
  });

  test("the strict output parser refuses a status carrying anything beyond its shape", async () => {
    const leaky = {
      status: () => Promise.resolve({ relay: { state: "off" as const }, liveSocketCount: 0, publicAddresses: [], ownerPasswordHash: "scrypt$…" }),
    };
    const share = caller(makeContext({ auth: principal("owner"), services: { share: leaky } })).share;
    await expect(share.status()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
