// Unit: the Share card's view-model. The row verdicts, which row a start refusal lands on, the link memory that
// raises the "link changed" notice, and the poll interval per state.

import type { AuthMode, RelayStatus } from "@orb/contracts/identity";
import { AUTH_MODES, RELAY_BINARY_REFUSALS, SHARE_REFUSALS } from "@orb/contracts/identity";
import { describe } from "vitest";
import type { ShareFactsView } from "../../../../../packages/client/src/features/user-admin/lib/share-model.ts";
import {
  canStartSharing,
  dismissLinkChange,
  EMPTY_SHARE_LINK_MEMORY,
  refusalRow,
  rememberShareLink,
  sharePollMs,
  sharePreconditions,
  shareStartFailure,
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

  test.each(["single-user", "forward-header"] satisfies AuthMode[])("%s holds the mode row and the owner row waits on it", (mode) => {
    const facts = { ...READY_LOCAL, mode };
    expect(verdicts(facts)).toMatchObject({ mode: "unmet", owner: "waiting" });
    expect(canStartSharing(sharePreconditions(facts))).toBe(false);
  });

  test("oidc needs neither an owner password nor the local seating settings", () => {
    const facts: ShareFactsView = { mode: "oidc", localMultiUser: false, discreetLogin: false, refusal: null };
    expect(verdicts(facts)).toStrictEqual({ mode: "met", owner: "met", seating: "met", relay: "unchecked" });
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
    const container = { ...READY_LOCAL, refusal: "share_in_container" } as const;
    expect(verdicts(container)["relay"]).toBe("refused");
    expect(canStartSharing(sharePreconditions(container))).toBe(true);
  });

  test("every mode yields the four rows in order", () => {
    for (const mode of AUTH_MODES) {
      expect(sharePreconditions({ ...READY_LOCAL, mode }).map((row) => row.id)).toStrictEqual(["mode", "owner", "seating", "relay"]);
    }
  });
});

describe("refusalRow", () => {
  test("the relay binary refusals and the container land on the relay row", () => {
    for (const code of RELAY_BINARY_REFUSALS) {
      expect(refusalRow(code)).toBe("relay");
    }
    expect(refusalRow("share_in_container")).toBe("relay");
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
    const starting = sharePollMs({ state: "starting", relay: "quick" });
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
