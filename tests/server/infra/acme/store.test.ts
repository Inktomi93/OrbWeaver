// infra/acme/store — the IP certificate's files under the secrets directory (D269): owner-only, and a stored
// certificate read back only for its own address and its own key.

import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IP_CERTIFICATE_FILE_NAMES } from "@orb/server/foundation/data-layout";
import type { IssuedCertificate } from "@orb/server/infra/acme";
import { createCertificateStore } from "@orb/server/infra/acme";
import { afterEach, beforeEach, describe } from "vitest";
import { createFrozenClock } from "../../../support/clock.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { ipCertificatePem } from "../../../support/node/x509.ts";

const ADDRESS = "81.2.69.160";
const LIFETIME_MS = 160 * 3_600_000;
const PERMISSION_BITS = 0o777;

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ip-cert-store-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function issued(address: string): IssuedCertificate {
  const clock = createFrozenClock();
  const leaf = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const ca = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const certificatePem = ipCertificatePem({
    address,
    subjectPublicKey: leaf.publicKey,
    issuerKey: ca.privateKey,
    issuerName: "Store Test CA",
    serial: 7,
    notBefore: clock.now(),
    notAfter: clock.now() + LIFETIME_MS,
  });
  return {
    certificatePem,
    keyPem: leaf.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    notBefore: clock.now(),
    notAfter: clock.now() + LIFETIME_MS,
  };
}

describe("createCertificateStore", () => {
  test("every file it writes is owner-only", async () => {
    const store = createCertificateStore(dir);
    await store.saveAccountKey("ACCOUNT KEY PEM");
    await store.saveCertificate(issued(ADDRESS));
    for (const name of Object.values(IP_CERTIFICATE_FILE_NAMES)) {
      // biome-ignore lint/suspicious/noBitwiseOperators: a permission mask is a bitwise AND.
      expect({ name, mode: (await stat(join(dir, name))).mode & PERMISSION_BITS }).toEqual({ name, mode: 0o600 });
    }
    await expect(store.loadAccountKey()).resolves.toBe("ACCOUNT KEY PEM");
  });

  test("a stored certificate reads back for its address with its validity", async () => {
    const store = createCertificateStore(dir);
    const certificate = issued(ADDRESS);
    await store.saveCertificate(certificate);
    await expect(store.loadCertificate(ADDRESS)).resolves.toEqual(certificate);
  });

  test("a stored certificate for another address, or beside another key, reads as absent", async () => {
    const store = createCertificateStore(dir);
    await store.saveCertificate(issued(ADDRESS));
    await expect(store.loadCertificate("81.2.69.161")).resolves.toBeNull();
    const other = issued(ADDRESS);
    await store.saveCertificate({ ...issued(ADDRESS), keyPem: other.keyPem });
    await expect(store.loadCertificate(ADDRESS)).resolves.toBeNull();
  });

  test("removeCertificate deletes the certificate and its key and keeps the account key", async () => {
    const store = createCertificateStore(dir);
    await store.saveAccountKey("ACCOUNT KEY PEM");
    await store.saveCertificate(issued(ADDRESS));
    await store.removeCertificate();
    await expect(store.loadCertificate(ADDRESS)).resolves.toBeNull();
    await expect(stat(join(dir, IP_CERTIFICATE_FILE_NAMES.certificateKey))).rejects.toThrow();
    await expect(store.loadAccountKey()).resolves.toBe("ACCOUNT KEY PEM");
  });
});
