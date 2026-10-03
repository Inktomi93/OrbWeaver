// entry/boot/owner-claim — the oidc boot step that hands the owner claim URL to the operator. Pins: an unclaimed
// owner gets a live code whose URL sits on the configured origin in an owner-only file, and no log line carries it;
// a claimed owner gets no code, no line and no file; the callback that spends the code removes the file.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { OwnerClaimAnnouncement } from "@orb/server/entry/boot";
import { announceOwnerClaim, removeOwnerClaimFileOnSpend } from "@orb/server/entry/boot";
import { createOwnerClaimCode } from "@orb/server/infra/auth";
import { afterEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER_ID = castId<UserId>("owner-row");
const ALLOWLIST = ["https://orb.example.com/api/auth/oidc/callback", "http://localhost:8788/api/auth/oidc/callback"];
const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;

interface Line {
  readonly fields: Record<string, unknown>;
  readonly msg: string;
}

const tmpDirs: string[] = [];
function claimFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "orb-owner-claim-"));
  tmpDirs.push(dir);
  return join(dir, "secrets", "owner_claim_url");
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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
  ])("%s → a live claim URL in an owner-only file, and no log line carries it", async (_label, ownerId, sessions) => {
    const claim = createOwnerClaimCode();
    const file = claimFile();
    const { log, lines } = recordingLog();
    await announceOwnerClaim({ log, sessions, ownerId, ownerClaim: claim, redirectAllowlist: ALLOWLIST, claimUrlFile: file, inContainer: true });

    const url = new URL(readFileSync(file, "utf-8").trim());
    expect(url.origin + url.pathname).toBe("https://orb.example.com/api/auth/oidc/login");
    const code = url.searchParams.get("ownerClaim") ?? "";
    expect(claim.hold("state-a", code)).toBe(true);
    // biome-ignore lint/suspicious/noBitwiseOperators: a permission mask is a bitwise AND.
    expect(statSync(file).mode & PERMISSION_BITS).toBe(OWNER_ONLY);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.fields["ownerClaimFile"]).toBe(file);
    const logged = JSON.stringify(lines);
    expect(logged).not.toContain(code);
    expect(logged).not.toContain(url.href);
  });

  test("a bound owner → no code is issued, nothing is printed, and a stale claim file is removed", async () => {
    const claim = createOwnerClaimCode();
    const file = claimFile();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "a code from an earlier boot\n");
    const { log, lines } = recordingLog();
    await announceOwnerClaim({
      log,
      sessions: ownerRow(castId<ExternalId>("idp|owner")),
      ownerId: OWNER_ID,
      ownerClaim: claim,
      redirectAllowlist: ALLOWLIST,
      claimUrlFile: file,
      inContainer: false,
    });
    expect(lines).toEqual([]);
    expect(claim.redeem("state-a")).toBe(false);
    expect(existsSync(file)).toBe(false);
  });
});

describe("removeOwnerClaimFileOnSpend", () => {
  test("the callback that spends the code removes the claim file; a redeem that spends nothing leaves it", async () => {
    const file = claimFile();
    const spending = removeOwnerClaimFileOnSpend(createOwnerClaimCode(), file);
    await announceOwnerClaim({
      log: recordingLog().log,
      sessions: ownerRow(null),
      ownerId: undefined,
      ownerClaim: spending,
      redirectAllowlist: ALLOWLIST,
      claimUrlFile: file,
      inContainer: true,
    });
    const code = new URL(readFileSync(file, "utf-8").trim()).searchParams.get("ownerClaim") ?? "";

    expect(spending.redeem("state-never-held")).toBe(false);
    expect(existsSync(file)).toBe(true);

    expect(spending.hold("state-a", code)).toBe(true);
    expect(spending.redeem("state-a")).toBe(true);
    await expect.poll(() => existsSync(file)).toBe(false);
  });
});
