// decryptSealed — the credential-decryption trust boundary. A crypto failure becomes one typed,
// non-retryable configuration error; neither the thrown error nor its pino record retains sealed bytes,
// AAD, key material, or the raw crypto cause.

import { getLog } from "@orb/server/foundation/observability";
import type { SecretBox } from "@orb/server/infra/crypto";
import { describe, vi } from "vitest";
import { CredentialsDecryptError } from "../../../../../packages/server/src/domain/credentials/contract/errors.ts";
import { decryptSealed } from "../../../../../packages/server/src/domain/credentials/substrate/decrypt.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("decryptSealed", () => {
  test("fails typed + non-retryable and scrubs short/overlapping sealed values from error and log serialization", () => {
    const secrets = {
      ciphertext: "cannot",
      iv: "cannot be",
      tag: "matching",
    };
    const aad = "user_secret|custom_openai";
    const rawCause = `crypto rejected ${secrets.ciphertext} / ${secrets.iv} / ${secrets.tag} / ${aad} / key-material-raw`;
    const box: SecretBox = {
      enabled: true,
      encrypt: () => secrets,
      decrypt: (): never => {
        throw new Error(rawCause);
      },
    };
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);

    let caught: unknown;
    try {
      decryptSealed(box, secrets, aad);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CredentialsDecryptError);
    expect(caught).toMatchObject({ code: "credential_decrypt_failed", retryable: false });
    const serializedError = `${(caught as Error).message} ${JSON.stringify(caught)}`;
    const serializedLog = JSON.stringify(errorSpy.mock.calls);
    for (const secret of [...Object.values(secrets), aad, "key-material-raw"]) {
      expect(serializedError).not.toContain(secret);
      expect(serializedLog).not.toContain(secret);
    }
    expect((caught as Error).cause).toBeUndefined();
    expect(serializedLog).toContain("credential_decrypt_failed");
    errorSpy.mockRestore();
  });
});
