// share.enableIpCertificate — owner only (D269). The preconditions refuse before anything is stored or ordered; a
// passing choice is stored canonical, as the owner, then handed to the controller and audited.

import { DomainForbiddenError, DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, shareHarness } from "../_support.ts";

const SETTING = { address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 } as const;

describe("share.enableIpCertificate", () => {
  test("the owner's choice is stored as the owner, the certificate starts, and the status carries it", async () => {
    const h = shareHarness({ authMode: "local" });
    const status = await h.share.enableIpCertificate({ principal: caller("owner"), setting: SETTING });
    expect(status.certificate).toEqual({ state: "obtaining", setting: SETTING });
    expect(h.savedSettings).toEqual([{ by: caller("owner"), setting: SETTING }]);
    expect(h.calls).toEqual(["ownerNeedsPassword", "saveCertificateSetting 81.2.69.160", "certificate.enable 81.2.69.160"]);
    expect(h.audits.at(-1)).toEqual({
      actorUserId: caller("owner").userId,
      action: "share.enableIpCertificate",
      entityType: "server",
      metadata: { address: SETTING.address, httpsPort: SETTING.httpsPort, challengePort: SETTING.challengePort, state: "obtaining" },
    });
  });

  test("a LAN or CGNAT address is refused with a coded error, and nothing is stored or ordered", async () => {
    for (const address of ["192.168.1.20", "100.64.3.4", "10.0.0.8"]) {
      const h = shareHarness({ authMode: "local" });
      const refusal = h.share.enableIpCertificate({ principal: caller("owner"), setting: { ...SETTING, address } });
      await expect(refusal).rejects.toBeInstanceOf(DomainOperationError);
      await expect(refusal).rejects.toMatchObject({ code: "ip_certificate_not_public" });
      expect(h.savedSettings).toEqual([]);
      expect(h.calls.filter((call) => call.startsWith("certificate."))).toEqual([]);
      expect(h.audits).toEqual([]);
    }
  });

  test("under forward-header the choice is refused, because the https hop would be trusted to name the user", async () => {
    const h = shareHarness({ authMode: "forward-header" });
    await expect(h.share.enableIpCertificate({ principal: caller("owner"), setting: SETTING })).rejects.toMatchObject({ code: "ip_certificate_mode" });
    expect(h.savedSettings).toEqual([]);
  });

  test("an admin and a user are refused before any precondition runs", async () => {
    for (const role of ["admin", "user"] as const) {
      const h = shareHarness({ authMode: "local" });
      await expect(h.share.enableIpCertificate({ principal: caller(role), setting: SETTING })).rejects.toBeInstanceOf(DomainForbiddenError);
      expect(h.calls, role).toEqual([]);
    }
  });

  test("control: an IPv6 address is stored in its canonical spelling", async () => {
    const h = shareHarness({ authMode: "local" });
    await h.share.enableIpCertificate({ principal: caller("owner"), setting: { ...SETTING, address: "2A00:1450:4001:080B::200E" } });
    expect(h.savedSettings[0]?.setting?.address).toBe("2a00:1450:4001:80b::200e");
  });
});
