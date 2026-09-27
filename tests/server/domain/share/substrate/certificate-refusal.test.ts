// domain/share/substrate/certificate-refusal — the IP certificate's preconditions (D269). A LAN, CGNAT or other
// non-public address is refused before any certificate authority is asked; so are the unsafe sign-in modes.

import type { AuthMode, IpCertificateSetting } from "@orb/contracts/identity";
import { describe } from "vitest";
import { canonicalAddress, certificateRefusal } from "../../../../../packages/server/src/domain/share/substrate/certificate-refusal.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const APP_PORT = 8788;
const SETTING: IpCertificateSetting = { address: "81.2.69.160", httpsPort: 8443, challengePort: 8080 };

function facts(
  options: { readonly authMode?: AuthMode; readonly ownerNeedsPassword?: boolean; readonly publicBind?: boolean; readonly loopbackUpstream?: boolean } = {},
): Parameters<typeof certificateRefusal>[0] {
  return {
    authMode: options.authMode ?? "local",
    ownerNeedsPassword: () => Promise.resolve(options.ownerNeedsPassword ?? false),
    localSetupUrl: () => "http://localhost:8788",
    publicAddresses: [],
    publicBind: options.publicBind ?? true,
    loopbackUpstream: options.loopbackUpstream ?? true,
    appPort: () => APP_PORT,
  };
}

describe("certificateRefusal", () => {
  test("LAN, CGNAT, loopback, link-local and reserved addresses are refused as not public", async () => {
    for (const address of [
      "192.168.1.20",
      "10.1.2.3",
      "172.20.0.4",
      "100.64.10.1",
      "127.0.0.1",
      "169.254.3.3",
      "fd12::1",
      "fe80::1",
      "::1",
      "203.0.113.4",
      "2001:db8::5",
    ]) {
      const result = await certificateRefusal(facts(), { ...SETTING, address });
      expect({ address, code: result.refusal?.code }).toEqual({ address, code: "ip_certificate_not_public" });
    }
  });

  test("a name, garbage and an IPv4-mapped IPv6 address are refused as not public", async () => {
    for (const address of ["example.com", "", "81.2.69", "::ffff:81.2.69.160", "081.2.69.160"]) {
      const result = await certificateRefusal(facts(), { ...SETTING, address });
      expect({ address, code: result.refusal?.code }).toEqual({ address, code: "ip_certificate_not_public" });
    }
  });

  test("every mode but local is refused first, and forward-header names why a loopback hop is unsafe", async () => {
    for (const authMode of ["single-user", "forward-header", "oidc"] as const) {
      const result = await certificateRefusal(facts({ authMode }), { ...SETTING, address: "192.168.1.1" });
      expect({ authMode, code: result.refusal?.code }).toEqual({ authMode, code: "ip_certificate_mode" });
    }
    const forward = await certificateRefusal(facts({ authMode: "forward-header" }), SETTING);
    expect(forward.refusal?.message).toContain("could claim any account");
  });

  test("an unclaimed owner is refused with this machine's setup address", async () => {
    const result = await certificateRefusal(facts({ ownerNeedsPassword: true }), SETTING);
    expect(result.refusal).toMatchObject({ code: "ip_certificate_owner_unclaimed" });
    expect(result.refusal?.message).toContain("http://localhost:8788");
  });

  test("a listener bound to this machine only is refused, because no router can forward to it", async () => {
    const result = await certificateRefusal(facts({ publicBind: false }), SETTING);
    expect(result.refusal?.code).toBe("ip_certificate_loopback_bind");
  });

  test("a listener bound to one named interface is refused: the https hop could not reach it over loopback", async () => {
    const result = await certificateRefusal(facts({ loopbackUpstream: false }), SETTING);
    expect(result.refusal?.code).toBe("ip_certificate_bind_address");
    expect(result.refusal?.message).toContain("BIND_HOST");
  });

  test("ports that collide with each other or with the app's own port are refused", async () => {
    for (const ports of [
      { httpsPort: 8443, challengePort: 8443 },
      { httpsPort: APP_PORT, challengePort: 8080 },
      { httpsPort: 8443, challengePort: APP_PORT },
    ]) {
      const result = await certificateRefusal(facts(), { ...SETTING, ...ports });
      expect({ ports, code: result.refusal?.code }).toEqual({ ports, code: "ip_certificate_ports" });
    }
  });

  test("control: a public address passes, trimmed, and an IPv6 one comes back in its canonical spelling", async () => {
    await expect(certificateRefusal(facts(), { ...SETTING, address: " 81.2.69.160 " })).resolves.toEqual({ refusal: null, setting: SETTING });
    await expect(certificateRefusal(facts(), { ...SETTING, address: "2A00:1450:4001:080B:0000:0000:0000:200E" })).resolves.toEqual({
      refusal: null,
      setting: { ...SETTING, address: "2a00:1450:4001:80b::200e" },
    });
  });
});

describe("canonicalAddress", () => {
  test("a dotted quad stays itself; IPv6 takes its compressed lower-case spelling; a mapped address is null", () => {
    expect(canonicalAddress("81.2.69.160")).toBe("81.2.69.160");
    expect(canonicalAddress("2606:4700:4700:0:0:0:0:1111")).toBe("2606:4700:4700::1111");
    expect(canonicalAddress("::ffff:1.2.3.4")).toBeNull();
    expect(canonicalAddress("not-an-ip")).toBeNull();
  });
});
