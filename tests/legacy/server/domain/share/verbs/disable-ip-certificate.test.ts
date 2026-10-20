// share.disableIpCertificate — owner only (D275). The stored choice clears before https closes, so a crash between
// the two never brings the certificate back at the next boot.
// @subject packages/server/src/domain/share/verbs/disable-ip-certificate.ts

import { DomainForbiddenError } from "@orb/kit/errors";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { caller, shareHarness } from "../_support.ts";

const SETTING = { address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 } as const;

describe("share.disableIpCertificate", () => {
  test("the owner clears the choice first, then the certificate is disabled and the change audited", async () => {
    const db = await freshDb();
    const h = shareHarness({ authMode: "local", certificateSetting: SETTING });
    await h.share.enableIpCertificate({ principal: await caller(db, "owner"), setting: SETTING });
    const status = await h.share.disableIpCertificate({ principal: await caller(db, "owner") });
    expect(status.certificate).toEqual({ state: "off" });
    expect(h.calls.slice(-2)).toEqual(["saveCertificateSetting null", "certificate.disable"]);
    expect(h.savedSettings.at(-1)).toEqual({ by: await caller(db, "owner"), setting: null });
    expect(h.audits.at(-1)).toEqual({ actorUserId: (await caller(db, "owner")).userId, action: "share.disableIpCertificate", entityType: "server" });
  });

  test("an admin and a user are refused, and the certificate keeps serving", async () => {
    const db = await freshDb();
    for (const role of ["admin", "user"] as const) {
      const h = shareHarness({ authMode: "local" });
      await h.share.enableIpCertificate({ principal: await caller(db, "owner"), setting: SETTING });
      await expect(h.share.disableIpCertificate({ principal: await caller(db, role) })).rejects.toBeInstanceOf(DomainForbiddenError);
      expect(h.calls, role).not.toContain("certificate.disable");
      expect(h.savedSettings.at(-1)?.setting, role).toEqual(SETTING);
    }
  });
});
