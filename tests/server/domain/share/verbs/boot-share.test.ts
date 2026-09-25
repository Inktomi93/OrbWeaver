// share.startAtBoot / resumeAfterOwnerClaim — the `SHARE_RELAY` start runs the same preconditions with no caller. A start
// refused for an unclaimed owner waits for the first-run claim; every other refusal is final for this process.

import { DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { LOCAL_SETUP_URL, shareHarness } from "../_support.ts";

describe("share boot start", () => {
  test("with an unclaimed owner it refuses, names the local setup, and starts nothing; the claim then starts it", async () => {
    const h = shareHarness({ authMode: "local", ownerNeedsPassword: true });
    const refused = await h.share.startAtBoot();
    expect(refused).toMatchObject({ kind: "refused", refusal: { code: "share_owner_unclaimed" } });
    expect(refused.kind === "refused" ? refused.refusal.message : "").toContain(`Open ${LOCAL_SETUP_URL} on this machine`);
    expect(h.calls).not.toContain("relay.start");
    expect(h.calls).not.toContain("enableSeating");

    h.claimOwner();
    await expect(h.share.resumeAfterOwnerClaim()).resolves.toEqual({ kind: "started", relay: { state: "starting", relay: "quick", restartAfter: null } });
    // The launcher's share skips no step the card runs: the seating goes on before the relay.
    expect(h.calls.filter((call) => call === "enableSeating" || call === "relay.start")).toEqual(["enableSeating", "relay.start"]);
  });

  test("a claim with no boot start waiting starts nothing", async () => {
    const h = shareHarness({ authMode: "local" });
    await expect(h.share.resumeAfterOwnerClaim()).resolves.toEqual({ kind: "not_waiting" });
    expect(h.calls).toEqual([]);
  });

  test("a boot start refused for its mode is not resumed by a later claim", async () => {
    const h = shareHarness({ authMode: "single-user" });
    await expect(h.share.startAtBoot()).resolves.toMatchObject({ kind: "refused", refusal: { code: "share_single_user" } });
    await expect(h.share.resumeAfterOwnerClaim()).resolves.toEqual({ kind: "not_waiting" });
    expect(h.calls).toEqual([]);
  });

  test("a relay binary refusal at boot is reported with its code, not thrown", async () => {
    const h = shareHarness({ authMode: "local", startError: new DomainOperationError("relay_platform_unsupported", "no build") });
    await expect(h.share.startAtBoot()).resolves.toEqual({ kind: "failed", code: "relay_platform_unsupported", message: "no build" });
    expect(h.calls.slice(-3)).toEqual(["enableSeating", "relay.start", "restoreSeating"]);
  });

  test("once started, a later claim does not start a second relay", async () => {
    const h = shareHarness({ authMode: "local" });
    await h.share.startAtBoot();
    await expect(h.share.resumeAfterOwnerClaim()).resolves.toEqual({ kind: "not_waiting" });
    expect(h.calls.filter((call) => call === "relay.start")).toHaveLength(1);
  });
});
