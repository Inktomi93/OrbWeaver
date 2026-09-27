// The IP certificate's files in the secrets directory (D269), each owner-only through `infra/crypto`'s secret files.
// A stored certificate is read back only when it still names the address and pairs with its stored key.

import { join } from "node:path";
import { IP_CERTIFICATE_FILE_NAMES } from "#foundation/data-layout";
import { readSecretFile, removeSecretFile, writeSecretFile } from "#infra/crypto";
import { checkIpCertificate } from "./certificate.ts";
import type { CertificateStore, IssuedCertificate } from "./contract.ts";

/** The store over `secretsDir`, the data layout's `secrets/` slot. */
export function createCertificateStore(secretsDir: string): CertificateStore {
  const accountKeyPath = join(secretsDir, IP_CERTIFICATE_FILE_NAMES.accountKey);
  const certificatePath = join(secretsDir, IP_CERTIFICATE_FILE_NAMES.certificate);
  const certificateKeyPath = join(secretsDir, IP_CERTIFICATE_FILE_NAMES.certificateKey);
  return {
    loadAccountKey: () => readSecretFile(accountKeyPath),
    saveAccountKey: (pem) => writeSecretFile(accountKeyPath, pem),
    loadCertificate: async (address): Promise<IssuedCertificate | null> => {
      const [certificatePem, keyPem] = await Promise.all([readSecretFile(certificatePath), readSecretFile(certificateKeyPath)]);
      if (certificatePem === null || keyPem === null) {
        return null;
      }
      const check = checkIpCertificate(certificatePem, keyPem, address);
      return check.ok ? { certificatePem, keyPem, notBefore: check.notBefore, notAfter: check.notAfter } : null;
    },
    // The key first: a crash between the two writes leaves a pair that fails the load check and is ordered again.
    saveCertificate: async (certificate): Promise<void> => {
      await writeSecretFile(certificateKeyPath, certificate.keyPem);
      await writeSecretFile(certificatePath, certificate.certificatePem);
    },
    removeCertificate: async (): Promise<void> => {
      await removeSecretFile(certificatePath);
      await removeSecretFile(certificateKeyPath);
    },
  };
}
