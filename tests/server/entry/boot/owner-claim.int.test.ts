// The oidc boot step hands the owner claim URL to the operator, judged on the owner row the real sessions service reads.
// @subject packages/server/src/entry/boot/owner-claim.ts
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { announceOwnerClaim, removeOwnerClaimFileOnSpend } from "@orb/server/entry/boot";
import { createConfiguredOidc } from "@orb/server/entry/compose";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/helpers";

const ALLOWLIST = ["https://orb.example.com/api/auth/oidc/callback", "http://localhost:8788/api/auth/oidc/callback"];
const OWNER_ONLY = 0o600;
const PERMISSION_BITS = 0o777;

interface Line {
  readonly fields: Record<string, unknown>;
  readonly msg: string;
}

async function claimFile(): Promise<{ readonly path: string; readonly [Symbol.asyncDispose]: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "orb-owner-claim-"));
  return { path: join(dir, "secrets", "owner_claim_url"), [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }) };
}

function recordingLog(): { readonly log: { readonly warn: (fields: Record<string, unknown>, msg: string) => void }; readonly lines: Line[] } {
  const lines: Line[] = [];
  return { log: { warn: (fields, msg): void => void lines.push({ fields, msg }) }, lines };
}

async function configuredClaim(root: ServerTestHarness): Promise<Awaited<ReturnType<typeof createConfiguredOidc>>> {
  return await createConfiguredOidc({
    db: databaseHandle(root.db),
    logger: root.logger,
    rings: root.rings,
    now: root.clock.now,
    built: root.app,
    settings: NATIVE_OIDC_SETTINGS,
    scheduleInterval: root.timers.interval,
  });
}

test.each([
  ["no owner row", false],
  ["an owner row with no subject", true],
])("%s → a live claim URL in an owner-only file, and no log line carries it", async (_label, ownerRow) => {
  await using root = await createServerHarness();
  await using oidc = await configuredClaim(root);
  await using file = await claimFile();
  expect((await root.app.sessions.loadUserById(root.ownerId))?.externalId).toBeNull();
  const { log, lines } = recordingLog();
  await announceOwnerClaim({
    log,
    sessions: root.app.sessions,
    ownerId: ownerRow ? root.ownerId : undefined,
    ownerClaim: oidc.ownerClaim,
    redirectAllowlist: ALLOWLIST,
    claimUrlFile: file.path,
    inContainer: true,
  });
  const url = new URL((await readFile(file.path, "utf8")).trim());
  expect(url.origin + url.pathname).toBe("https://orb.example.com/api/auth/oidc/login");
  const code = url.searchParams.get("ownerClaim") ?? "";
  expect(oidc.ownerClaim.hold("state-a", code)).toBe(true);
  // biome-ignore lint/suspicious/noBitwiseOperators: a permission mask is a bitwise AND.
  expect((await stat(file.path)).mode & PERMISSION_BITS).toBe(OWNER_ONLY);
  expect(lines.map((line) => line.fields["ownerClaimFile"])).toEqual([file.path]);
  expect(JSON.stringify(lines)).not.toContain(code);
});

test("a bound owner → no code is issued, nothing is printed, and a stale claim file is removed", async () => {
  await using root = await createServerHarness();
  const subject = brandedId("ExternalId").parse("idp|owner");
  const owner = await root.principalFor(root.ownerId);
  await root.app.sessions.provisionIdentity({ externalId: subject, handle: owner.handle, groups: [], email: null }, { ownerClaimProven: true });
  expect((await root.app.sessions.loadUserById(root.ownerId))?.externalId).toBe(subject);
  await using oidc = await configuredClaim(root);
  await using file = await claimFile();
  await mkdir(dirname(file.path), { recursive: true });
  await writeFile(file.path, "a code from an earlier boot\n");
  const { log, lines } = recordingLog();
  await announceOwnerClaim({
    log,
    sessions: root.app.sessions,
    ownerId: root.ownerId,
    ownerClaim: oidc.ownerClaim,
    redirectAllowlist: ALLOWLIST,
    claimUrlFile: file.path,
    inContainer: false,
  });
  expect(lines).toEqual([]);
  expect(oidc.ownerClaim.redeem("state-a")).toBe(false);
  expect(existsSync(file.path)).toBe(false);
});

test("the callback that spends the code removes the claim file; a redeem that spends nothing leaves it", async () => {
  await using root = await createServerHarness();
  await using oidc = await configuredClaim(root);
  await using file = await claimFile();
  const spending = removeOwnerClaimFileOnSpend(oidc.ownerClaim, file.path, root.app.newOpaqueId, { logger: root.logger, traces: root.rings.traces });
  const unclaimed: UserId | undefined = undefined;
  await announceOwnerClaim({
    log: recordingLog().log,
    sessions: root.app.sessions,
    ownerId: unclaimed,
    ownerClaim: spending,
    redirectAllowlist: ALLOWLIST,
    claimUrlFile: file.path,
    inContainer: true,
  });
  const code = new URL((await readFile(file.path, "utf8")).trim()).searchParams.get("ownerClaim") ?? "";
  expect(spending.redeem("state-never-held")).toBe(false);
  expect(existsSync(file.path)).toBe(true);
  expect(spending.hold("state-a", code)).toBe(true);
  expect(spending.redeem("state-a")).toBe(true);
  await expect.poll(() => existsSync(file.path)).toBe(false);
});
