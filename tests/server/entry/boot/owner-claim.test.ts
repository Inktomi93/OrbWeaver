// entry/boot/owner-claim — the oidc boot step that prints the owner claim URL. Pins: an unclaimed owner (no row, or a
// row with no subject) gets a live code whose URL sits on the configured origin, and a claimed owner gets no code and
// no line, so a claimed box never prints a secret.

import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { OwnerClaimAnnouncement } from "@orb/server/entry/boot";
import { announceOwnerClaim } from "@orb/server/entry/boot";
import { createOwnerClaimCode } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("owner-row");
const ALLOWLIST = ["https://orb.example.com/api/auth/oidc/callback", "http://localhost:8788/api/auth/oidc/callback"];

interface Line {
  readonly fields: Record<string, unknown>;
  readonly msg: string;
}

function recordingLog(): { readonly log: OwnerClaimAnnouncement["log"]; readonly lines: Line[] } {
  const lines: Line[] = [];
  return { log: { warn: (fields, msg): void => void lines.push({ fields, msg }) }, lines };
}

function ownerRow(externalId: ExternalId | null): OwnerClaimAnnouncement["sessions"] {
  return { loadUserById: () => Promise.resolve({ role: "owner", handle: castId<Handle>("owner"), externalId, enabled: true }) };
}

describe("announceOwnerClaim", () => {
  test.each([
    ["no owner row", undefined, ownerRow(null)],
    ["an owner row with no subject", OWNER_ID, ownerRow(null)],
  ])("%s → a live code, printed once as a login URL on the configured origin", async (_label, ownerId, sessions) => {
    const claim = createOwnerClaimCode();
    const { log, lines } = recordingLog();
    await announceOwnerClaim({ log, sessions, ownerId, ownerClaim: claim, redirectAllowlist: ALLOWLIST });
    expect(lines).toHaveLength(1);
    const url = new URL(String(lines[0]?.fields["ownerClaimUrl"]));
    expect(url.origin + url.pathname).toBe("https://orb.example.com/api/auth/oidc/login");
    expect(claim.hold("state-a", url.searchParams.get("ownerClaim") ?? "")).toBe(true);
  });

  test("a bound owner → no code is issued and nothing is printed", async () => {
    const claim = createOwnerClaimCode();
    const { log, lines } = recordingLog();
    await announceOwnerClaim({ log, sessions: ownerRow(castId<ExternalId>("idp|owner")), ownerId: OWNER_ID, ownerClaim: claim, redirectAllowlist: ALLOWLIST });
    expect(lines).toEqual([]);
    expect(claim.redeem("state-a")).toBe(false);
  });
});
