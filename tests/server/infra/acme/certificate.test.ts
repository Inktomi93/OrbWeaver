// infra/acme/certificate — the check every IP certificate passes before it is served or stored (D269): its leaf names
// the address as an iPAddress SAN and pairs with its key, and any other certificate is refused with a reason.

import type { KeyObject } from "node:crypto";
import { generateKeyPairSync } from "node:crypto";
import { checkIpCertificate } from "@orb/server/infra/acme";
import { describe } from "vitest";
import { createFrozenClock } from "../../../support/clock.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { ipCertificatePem } from "../../../support/node/x509.ts";

const ADDRESS = "81.2.69.160";
const IPV6_ADDRESS = "2a00:1450:4001:80b::200e";
const LIFETIME_MS = 160 * 3_600_000;
const clock = createFrozenClock();
const NOT_BEFORE = clock.now();
const NOT_AFTER = NOT_BEFORE + LIFETIME_MS;

interface Pair {
  readonly certificatePem: string;
  readonly keyPem: string;
}

function keyPair(): { readonly privateKey: KeyObject; readonly publicKey: KeyObject } {
  return generateKeyPairSync("ec", { namedCurve: "P-256" });
}

function pemOf(key: KeyObject): string {
  return key.export({ type: "pkcs8", format: "pem" }).toString();
}

function issued(address: string): Pair {
  const leaf = keyPair();
  const ca = keyPair();
  const certificatePem = ipCertificatePem({
    address,
    subjectPublicKey: leaf.publicKey,
    issuerKey: ca.privateKey,
    issuerName: "Check Test CA",
    serial: 3,
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
  });
  return { certificatePem, keyPem: pemOf(leaf.privateKey) };
}

describe("checkIpCertificate", () => {
  test("a certificate that names the address and pairs with its key passes with its validity", () => {
    const pair = issued(ADDRESS);
    expect(checkIpCertificate(pair.certificatePem, pair.keyPem, ADDRESS)).toEqual({ ok: true, notBefore: NOT_BEFORE, notAfter: NOT_AFTER });
  });

  test("an IPv6 certificate passes for its own address", () => {
    const pair = issued(IPV6_ADDRESS);
    expect(checkIpCertificate(pair.certificatePem, pair.keyPem, IPV6_ADDRESS)).toMatchObject({ ok: true });
  });

  test("a certificate for another address is refused and names the address it lacks", () => {
    const pair = issued(ADDRESS);
    expect(checkIpCertificate(pair.certificatePem, pair.keyPem, "81.2.69.161")).toEqual({ ok: false, reason: "the certificate does not name 81.2.69.161" });
  });

  test("a certificate beside another key is refused", () => {
    const pair = issued(ADDRESS);
    const stranger = pemOf(keyPair().privateKey);
    expect(checkIpCertificate(pair.certificatePem, stranger, ADDRESS)).toEqual({ ok: false, reason: "the certificate does not match its private key" });
  });

  test("an unreadable certificate or key is refused as unreadable, never thrown", () => {
    const pair = issued(ADDRESS);
    for (const [certificatePem, keyPem] of [
      ["not a certificate", pair.keyPem],
      [pair.certificatePem, "not a key"],
    ] as const) {
      expect(checkIpCertificate(certificatePem, keyPem, ADDRESS)).toEqual({
        ok: false,
        reason: expect.stringMatching(/^the certificate or its key could not be read: ./u),
      });
    }
  });
});
