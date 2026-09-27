// The check every certificate passes before it is served or stored: its leaf names the address as an iPAddress SAN,
// matches the private key beside it, and is parseable. node:crypto's X509Certificate does the reading.

import { createPrivateKey, X509Certificate } from "node:crypto";
import type { CertificateCheck } from "./contract.ts";

/** The leaf's validity (epoch ms) when `certificatePem` covers `address` and pairs with `keyPem`; else the reason. */
export function checkIpCertificate(certificatePem: string, keyPem: string, address: string): CertificateCheck {
  let leaf: X509Certificate;
  try {
    leaf = new X509Certificate(certificatePem);
    if (leaf.checkIP(address) === undefined) {
      return { ok: false, reason: `the certificate does not name ${address}` };
    }
    if (!leaf.checkPrivateKey(createPrivateKey(keyPem))) {
      return { ok: false, reason: "the certificate does not match its private key" };
    }
  } catch (err) {
    return { ok: false, reason: `the certificate or its key could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, notBefore: leaf.validFromDate.getTime(), notAfter: leaf.validToDate.getTime() };
}
