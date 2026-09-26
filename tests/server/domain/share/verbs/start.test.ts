// share.start — the owner gate, then the preconditions in order, each refusing with its code before the relay is touched,
// then the seating a public link needs, then the relay.

import { DomainForbiddenError, DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, LIVE_SOCKETS, LOCAL_SETUP_URL, shareHarness } from "../_support.ts";

describe("share.start", () => {
  test("under single-user it refuses with share_single_user and never touches the relay", async () => {
    const h = shareHarness({ authMode: "single-user" });
    await expect(h.share.start({ principal: caller("owner") })).rejects.toMatchObject({ code: "share_single_user" });
    expect(h.calls).toEqual([]);
  });

  test("under forward-header it refuses with share_forward_header, since a relayed visitor would arrive from a trusted loopback peer", async () => {
    const h = shareHarness({ authMode: "forward-header" });
    await expect(h.share.start({ principal: caller("owner") })).rejects.toMatchObject({ code: "share_forward_header" });
    expect(h.calls).toEqual([]);
  });

  test("with an unclaimed owner it refuses, names the local setup, and never starts the relay", async () => {
    const h = shareHarness({ authMode: "local", ownerNeedsPassword: true });
    const refusal = h.share.start({ principal: caller("owner") });
    await expect(refusal).rejects.toBeInstanceOf(DomainOperationError);
    await expect(refusal).rejects.toMatchObject({ code: "share_owner_unclaimed", message: expect.stringContaining(`Open ${LOCAL_SETUP_URL} on this machine`) });
    expect(h.calls).toEqual(["ownerNeedsPassword"]);
  });

  test("control: once the owner is claimed, start turns the seating on, runs the relay and audits the owner", async () => {
    const h = shareHarness({ authMode: "local", ownerNeedsPassword: true });
    h.claimOwner();
    await expect(h.share.start({ principal: caller("owner") })).resolves.toEqual({
      relay: { state: "starting", relay: "quick", restartAfter: null },
      liveSocketCount: LIVE_SOCKETS,
      publicAddresses: [],
    });
    expect(h.calls).toEqual(["ownerNeedsPassword", "enableSeating", "relay.start"]);
    expect(h.audits).toEqual([{ actorUserId: caller("owner").userId, action: "share.start", entityType: "server", metadata: { relay: "starting" } }]);
  });

  test("under oidc it refuses with share_oidc naming the public address, and never reads the owner or touches the relay", async () => {
    const address = "https://orb.example.com";
    const h = shareHarness({ authMode: "oidc", ownerNeedsPassword: true, publicAddresses: [address] });
    await expect(h.share.start({ principal: caller("owner") })).rejects.toMatchObject({ code: "share_oidc", message: expect.stringContaining(address) });
    expect(h.calls).toEqual([]);
  });

  test("an admin and a user are refused before any precondition is read or the relay is touched", async () => {
    for (const role of ["admin", "user"] as const) {
      const h = shareHarness({ authMode: "local" });
      await expect(h.share.start({ principal: caller(role) })).rejects.toBeInstanceOf(DomainForbiddenError);
      expect(h.calls, role).toEqual([]);
      expect(h.audits, role).toEqual([]);
    }
  });

  test("a relay binary refusal reaches the owner with its code, and nothing is audited", async () => {
    const h = shareHarness({ authMode: "local", startError: new DomainOperationError("relay_binary_checksum_mismatch", "not the pinned bytes") });
    await expect(h.share.start({ principal: caller("owner") })).rejects.toMatchObject({ code: "relay_binary_checksum_mismatch" });
    expect(h.audits).toEqual([]);
    // A relay that never started leaves the seating as it found it.
    expect(h.calls.slice(-3)).toEqual(["enableSeating", "relay.start", "restoreSeating"]);
  });
});
