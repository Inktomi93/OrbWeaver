// Unit: the Share card's view-model. The row verdicts, which row a start refusal lands on, the link memory that
// raises the "link changed" notice, the poll interval per state, and the IP certificate's refusal and poll (D269).

import type { AuthMode, RelayStatus } from "@orb/contracts/identity";
import { AUTH_MODES, IP_CERTIFICATE_REFUSALS, RELAY_BINARY_REFUSALS, SHARE_REFUSALS } from "@orb/contracts/identity";
import { describe } from "vitest";
import type { ShareFactsView } from "../../../../../packages/client/src/features/user-admin/lib/share-model.ts";
import {
  canStartSharing,
  dismissLinkChange,
  EMPTY_SHARE_LINK_MEMORY,
  ipCertificateRefusal,
  refusalRow,
  rememberShareLink,
  sharePollMs,
  sharePreconditions,
  shareStartFailure,
  shareStatusPollMs,
  shareView,
} from "../../../../../packages/client/src/features/user-admin/lib/share-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const READY_LOCAL: ShareFactsView = { mode: "local", localMultiUser: true, discreetLogin: true, refusal: null };

function verdicts(facts: ShareFactsView): Record<string, string> {
  return Object.fromEntries(sharePreconditions(facts).map((row) => [row.id, row.verdict]));
}

const FIRST: RelayStatus = { state: "up", relay: "quick", url: "https://first.trycloudflare.com" };
const SECOND: RelayStatus = { state: "up", relay: "quick", url: "https://second.trycloudflare.com" };

describe("sharePreconditions", () => {
  test("a ready local box has every row met except the relay, which the server checks on start", () => {
    expect(verdicts(READY_LOCAL)).toStrictEqual({ mode: "met", owner: "met", seating: "met", relay: "unchecked" });
    expect(canStartSharing(sharePreconditions(READY_LOCAL))).toBe(true);
  });

  test.each(["single-user", "forward-header", "oidc"] satisfies AuthMode[])("%s holds the mode row and the owner row waits on it", (mode) => {
    const facts = { ...READY_LOCAL, mode };
    expect(verdicts(facts)).toMatchObject({ mode: "unmet", owner: "waiting" });
    expect(canStartSharing(sharePreconditions(facts))).toBe(false);
  });

  test.each([
    [false, true],
    [true, false],
    [false, false],
  ])("local with multi-user %s and discreet login %s holds the seating row", (localMultiUser, discreetLogin) => {
    const facts = { ...READY_LOCAL, localMultiUser, discreetLogin };
    expect(verdicts(facts)["seating"]).toBe("unmet");
    expect(canStartSharing(sharePreconditions(facts))).toBe(false);
  });

  test("a server refusal marks its row refused and never holds the next start, which re-checks it", () => {
    const unclaimed = { ...READY_LOCAL, refusal: "share_owner_unclaimed" } as const;
    expect(verdicts(unclaimed)["owner"]).toBe("refused");
    expect(canStartSharing(sharePreconditions(unclaimed))).toBe(true);
    const download = { ...READY_LOCAL, refusal: "relay_binary_download_failed" } as const;
    expect(verdicts(download)["relay"]).toBe("refused");
    expect(canStartSharing(sharePreconditions(download))).toBe(true);
  });

  test("every mode yields the four rows in order", () => {
    for (const mode of AUTH_MODES) {
      expect(sharePreconditions({ ...READY_LOCAL, mode }).map((row) => row.id)).toStrictEqual(["mode", "owner", "seating", "relay"]);
    }
  });
});

describe("refusalRow", () => {
  test("the relay binary refusals land on the relay row", () => {
    for (const code of RELAY_BINARY_REFUSALS) {
      expect(refusalRow(code)).toBe("relay");
    }
  });

  test("the mode refusals land on the mode row and the unclaimed owner on the owner row", () => {
    expect(refusalRow("share_single_user")).toBe("mode");
    expect(refusalRow("share_forward_header")).toBe("mode");
    expect(refusalRow("share_owner_unclaimed")).toBe("owner");
  });
});

describe("shareStartFailure", () => {
  function wireError(reason: string, message: string): Error {
    return Object.assign(new Error(message), { data: { code: "BAD_REQUEST", httpStatus: 400, reason } });
  }

  test("every coded share refusal comes back with the server's sentence", () => {
    for (const code of [...SHARE_REFUSALS, ...RELAY_BINARY_REFUSALS]) {
      expect(shareStartFailure(wireError(code, `sentence for ${code}`))).toStrictEqual({ code, message: `sentence for ${code}` });
    }
  });

  test("an uncoded or foreign failure is not a refusal, so the toast reports it", () => {
    expect(shareStartFailure(wireError("restart_unsupervised", "no supervisor"))).toBeNull();
    expect(shareStartFailure(new Error("network down"))).toBeNull();
    expect(shareStartFailure(null)).toBeNull();
  });
});

describe("rememberShareLink", () => {
  test("the first up is remembered without a change, and the same URL again changes nothing", () => {
    const first = rememberShareLink(EMPTY_SHARE_LINK_MEMORY, FIRST);
    expect(first).toStrictEqual({ lastUrl: "https://first.trycloudflare.com", changed: null });
    expect(rememberShareLink(first, FIRST)).toBe(first);
  });

  test("an up under a new URL records the change, across an off or a down in between", () => {
    const first = rememberShareLink(EMPTY_SHARE_LINK_MEMORY, FIRST);
    const afterOff = rememberShareLink(first, { state: "off" });
    const afterDown = rememberShareLink(afterOff, { state: "down", relay: "quick", reason: "exited", restarting: true });
    expect(afterDown).toBe(first);
    const second = rememberShareLink(afterDown, SECOND);
    expect(second).toStrictEqual({
      lastUrl: "https://second.trycloudflare.com",
      changed: { from: "https://first.trycloudflare.com", to: "https://second.trycloudflare.com" },
    });
  });

  test("dismissing clears the notice and keeps the URL, and dismissing nothing is a no-op", () => {
    const changed = rememberShareLink(rememberShareLink(EMPTY_SHARE_LINK_MEMORY, FIRST), SECOND);
    const dismissed = dismissLinkChange(changed);
    expect(dismissed).toStrictEqual({ lastUrl: "https://second.trycloudflare.com", changed: null });
    expect(dismissLinkChange(dismissed)).toBe(dismissed);
  });
});

describe("sharePollMs", () => {
  test("a transition polls faster than a live relay, which polls faster than a settled one", () => {
    const starting = sharePollMs({ state: "starting", relay: "quick", restartAfter: null });
    const restarting = sharePollMs({ state: "down", relay: "quick", reason: "exited", restarting: true });
    const up = sharePollMs(FIRST);
    const off = sharePollMs({ state: "off" });
    const gaveUp = sharePollMs({ state: "down", relay: "quick", reason: "launch_failed", restarting: false });
    expect(restarting).toBe(starting);
    expect(starting).toBeLessThan(up);
    expect(up).toBeLessThan(off);
    expect(gaveUp).toBe(off);
  });
});

describe("shareStatusPollMs", () => {
  const setting = { address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 };

  test("an IP certificate order polls as fast as a relay transition, even while the relay is off", () => {
    const starting = sharePollMs({ state: "starting", relay: "quick", restartAfter: null });
    expect(shareStatusPollMs({ relay: { state: "off" }, certificate: { state: "obtaining", setting } })).toBe(starting);
  });

  test("a settled certificate leaves the relay's own interval in charge", () => {
    expect(shareStatusPollMs({ relay: FIRST, certificate: { state: "failed", setting, failure: { code: "expired", message: "m" } } })).toBe(sharePollMs(FIRST));
    expect(shareStatusPollMs({ relay: { state: "off" }, certificate: { state: "off" } })).toBe(sharePollMs({ state: "off" }));
  });
});

describe("ipCertificateRefusal", () => {
  function wireError(reason: string, message: string): Error {
    return Object.assign(new Error(message), { data: { code: "BAD_REQUEST", httpStatus: 400, reason } });
  }

  test("every coded IP certificate refusal comes back with the server's sentence", () => {
    for (const code of IP_CERTIFICATE_REFUSALS) {
      expect(ipCertificateRefusal(wireError(code, `sentence for ${code}`))).toStrictEqual({ code, message: `sentence for ${code}` });
    }
  });

  test("a relay refusal or an uncoded failure is not a certificate refusal, so the toast reports it", () => {
    expect(ipCertificateRefusal(wireError("share_single_user", "relay sentence"))).toBeNull();
    expect(ipCertificateRefusal(new Error("network down"))).toBeNull();
    expect(ipCertificateRefusal(null)).toBeNull();
  });
});

describe("shareView", () => {
  test("a restart reads restarting from its death until the new link, whichever of its two states the poll caught", () => {
    expect(shareView({ state: "down", relay: "quick", reason: "exited", restarting: true })).toStrictEqual({ phase: "restarting", reason: "exited" });
    expect(shareView({ state: "starting", relay: "quick", restartAfter: "no_url" })).toStrictEqual({ phase: "restarting", reason: "no_url" });
    expect(shareView(SECOND)).toStrictEqual({ phase: "up", url: "https://second.trycloudflare.com" });
  });

  test("control: an owner's own start reads starting, and a relay that gave up reads stopped with its death", () => {
    expect(shareView({ state: "starting", relay: "quick", restartAfter: null })).toStrictEqual({ phase: "starting" });
    expect(shareView({ state: "down", relay: "quick", reason: "launch_failed", restarting: false })).toStrictEqual({
      phase: "stopped",
      reason: "launch_failed",
    });
    expect(shareView({ state: "off" })).toStrictEqual({ phase: "off" });
  });
});
