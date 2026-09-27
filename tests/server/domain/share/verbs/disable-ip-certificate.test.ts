// share.disableIpCertificate — owner only (D269). The stored choice clears before https closes, so a crash between
// the two never brings the certificate back at the next boot.

import { DomainForbiddenError } from "@orb/kit/errors";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, shareHarness } from "../_support.ts";

const SETTING = { address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 } as const;

describe("share.disableIpCertificate", () => {
  test("the owner clears the choice first, then the certificate is disabled and the change audited", async () => {
    const h = shareHarness({ authMode: "local", certificateSetting: SETTING });
    await h.share.enableIpCertificate({ principal: caller("owner"), setting: SETTING });
    const status = await h.share.disableIpCertificate({ principal: caller("owner") });
    expect(status.certificate).toEqual({ state: "off" });
    expect(h.calls.slice(-2)).toEqual(["saveCertificateSetting null", "certificate.disable"]);
    expect(h.savedSettings.at(-1)).toEqual({ by: caller("owner"), setting: null });
    expect(h.audits.at(-1)).toEqual({ actorUserId: caller("owner").userId, action: "share.disableIpCertificate", entityType: "server" });
  });

  test("an admin and a user are refused, and the certificate keeps serving", async () => {
    for (const role of ["admin", "user"] as const) {
      const h = shareHarness({ authMode: "local" });
      await h.share.enableIpCertificate({ principal: caller("owner"), setting: SETTING });
      await expect(h.share.disableIpCertificate({ principal: caller(role) })).rejects.toBeInstanceOf(DomainForbiddenError);
      expect(h.calls, role).not.toContain("certificate.disable");
      expect(h.savedSettings.at(-1)?.setting, role).toEqual(SETTING);
    }
  });
});
