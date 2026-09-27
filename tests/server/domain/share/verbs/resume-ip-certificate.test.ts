// share.resumeIpCertificate — the boot start of a stored IP certificate choice (D269). It re-runs the preconditions,
// because the sign-in mode and the bind are env and may have changed since the owner chose.

import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { shareHarness } from "../_support.ts";

const SETTING = { address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 } as const;

describe("share.resumeIpCertificate", () => {
  test("no stored choice starts nothing", async () => {
    const h = shareHarness({ authMode: "local" });
    await expect(h.share.resumeIpCertificate()).resolves.toEqual({ kind: "not_configured" });
    expect(h.calls).toEqual([]);
  });

  test("a stored choice under the local mode starts the certificate", async () => {
    const h = shareHarness({ authMode: "local", certificateSetting: SETTING });
    await expect(h.share.resumeIpCertificate()).resolves.toEqual({ kind: "started", certificate: { state: "obtaining", setting: SETTING } });
    expect(h.calls).toEqual(["ownerNeedsPassword", "certificate.enable 81.2.69.160"]);
  });

  test("a stored choice under a mode switched to forward-header is refused and opens no https listener", async () => {
    const h = shareHarness({ authMode: "forward-header", certificateSetting: SETTING });
    await expect(h.share.resumeIpCertificate()).resolves.toMatchObject({ kind: "refused", refusal: { code: "ip_certificate_mode" } });
    expect(h.calls).toEqual([]);
  });

  test("a stored choice on a box now bound to loopback only is refused", async () => {
    const h = shareHarness({ authMode: "local", certificateSetting: SETTING, publicBind: false });
    await expect(h.share.resumeIpCertificate()).resolves.toMatchObject({ kind: "refused", refusal: { code: "ip_certificate_loopback_bind" } });
    expect(h.calls.filter((call) => call.startsWith("certificate."))).toEqual([]);
  });

  test("a stored choice on a box now bound to its public address alone is refused at boot", async () => {
    const h = shareHarness({ authMode: "local", certificateSetting: SETTING, loopbackUpstream: false });
    await expect(h.share.resumeIpCertificate()).resolves.toMatchObject({ kind: "refused", refusal: { code: "ip_certificate_bind_address" } });
    expect(h.calls.filter((call) => call.startsWith("certificate."))).toEqual([]);
  });

  test("a stored LAN address written through the generic settings door is refused at boot too", async () => {
    const h = shareHarness({ authMode: "local", certificateSetting: { ...SETTING, address: "192.168.1.20" } });
    await expect(h.share.resumeIpCertificate()).resolves.toMatchObject({ kind: "refused", refusal: { code: "ip_certificate_not_public" } });
    expect(h.calls.filter((call) => call.startsWith("certificate."))).toEqual([]);
  });
});
