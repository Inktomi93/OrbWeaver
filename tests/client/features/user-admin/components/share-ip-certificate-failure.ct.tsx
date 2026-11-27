// Each way a certificate order fails (the authority cannot reach the challenge port, the authority refuses, the https
// port will not open) leaves the Share card in `failed` with its own guidance, and the line announced as the alert is that
// guidance, never the server's raw diagnostic (which stays on the card as secondary details). Production entry: the
// Multi-user admin section's Share card over a composed server whose fake authority and occupied port produce each failure
// for real. Layer: Playwright CT. Red: announcing the failure's message in the alert, or a guidance that points above.
import { createServer } from "node:net";
import type { IpCertificateFailureCode } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, ipCertificateSettingSchema } from "@orb/contracts/identity";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { claimShareOwner, createServerHarness } from "@orb/testkit/node/composed";
import { freeLoopbackPort, startFakeAcme } from "@orb/testkit/node/helpers";
import { ipCertificateFailureGuidance } from "#client/features/user-admin/lib/share-model.ts";
import type { AdminResetNamesStory } from "./_admin-action-groups-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-action-groups-stories/AdminResetNamesStory";
const ADDRESS = "81.2.69.160";
const TOKEN = "ct_ip_certificate_token";
const NOT_AFTER = FROZEN_AT_MS + 160 * 3_600_000;
const PROVOKED = ["validation_failed", "issuance_failed", "listener_failed"] as const satisfies readonly IpCertificateFailureCode[];

test.use({ viewport: { width: 1280, height: 900 } });

for (const code of PROVOKED) {
  test(`a ${code} certificate order leaves the Share card with that failure's own guidance`, async ({ page, mount }) => {
    await using owners = new AsyncDisposableStack();
    const challengePort = await freeLoopbackPort();
    // The authority fetches the challenge from the port it is told; the card's order names another, so the check cannot land.
    const authority = await startFakeAcme({
      challengePort: code === "validation_failed" ? await freeLoopbackPort() : challengePort,
      token: TOKEN,
      notBefore: FROZEN_AT_MS,
      notAfter: NOT_AFTER,
      ...(code === "issuance_failed"
        ? { refuseOrder: { type: "urn:ietf:params:acme:error:rejectedIdentifier", detail: "the authority refused this address" } }
        : {}),
    });
    owners.defer(authority.close);
    const harness = owners.use(
      await createServerHarness({
        env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" },
        bindHost: "0.0.0.0",
        allowPublicBind: true,
        share: { acme: { directoryUrl: authority.directoryUrl, polling: { attempts: 2, minMs: 1, maxMs: 2 } } },
      }),
    );
    await claimShareOwner(harness);
    const caller = await harness.internalCallerFor(harness.ownerId);
    const httpsPort = await freeLoopbackPort();
    if (code === "listener_failed") {
      const occupant = createServer();
      await new Promise<void>((resolve) => occupant.listen(httpsPort, "0.0.0.0", resolve));
      owners.defer(() => new Promise<void>((resolve) => occupant.close(() => resolve())));
    }
    await caller.share.enableIpCertificate(ipCertificateSettingSchema.parse({ address: ADDRESS, challengePort, httpsPort }));
    await harness.settleSharing();
    // The server's own status says which failure this is; the card is read against it.
    const { certificate } = await caller.share.status();
    if (certificate.state !== "failed") {
      throw new Error(`The order was expected to fail with ${code}, not leave the card ${certificate.state}`);
    }
    expect(certificate.failure.code).toBe(code);

    await page.route("**/api/auth/config", async (route) => {
      const response = await harness.http.request("/api/auth/config");
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await routeTrpc(
      page,
      serveCorpusProcedures(caller, [
        "sessions.me",
        "settings.getUserSettings",
        "settings.getAppSettingsWithOverrides",
        "admin.listUsers",
        "share.status",
        "share.signInMode",
      ]),
    );
    await mount<typeof AdminResetNamesStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });
    const failed = page.locator(`[data-ip-certificate-failure="${code}"]`);
    await expect(failed).toHaveCount(1);
    const guidance = ipCertificateFailureGuidance(code, certificate.setting);
    // The alert is what a screen reader hears: the fix, not the socket error.
    await expect(failed.getByRole("alert")).toContainText(guidance);
    await expect(failed.getByRole("alert")).not.toContainText(certificate.failure.message);
    await expect(failed.getByText(certificate.failure.message, { exact: false })).toBeVisible();
    // The port fields render below the failure, so the guidance never sends the person above it.
    await expect(failed.getByRole("alert")).not.toContainText("above");
    for (const other of PROVOKED.filter((candidate) => candidate !== code)) {
      await expect(page.getByText(ipCertificateFailureGuidance(other, certificate.setting), { exact: false })).toHaveCount(0);
    }
  });
}
