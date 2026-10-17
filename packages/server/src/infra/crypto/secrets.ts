import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Sealed, SecretBox } from "./contract.ts";

// AES-256-GCM encryption-at-rest for per-user secrets. Exposed as an injectable SecretBox (the project's
// DI idiom) so the credentials store/resolver receive it and tests can supply a known key; the
// composition root (entry/) builds the env-backed one from the key `resolveCredentialsKey` (./key) resolves
// and `entry/boot/boot-secrets.ts` settles. UNSET/invalid key ⇒ a DISABLED box (encrypt/decrypt throw at CALL time;
// the store rejects writes) — degrade, NEVER throw at boot.
//
// The AAD belt: encrypt/decrypt CARRY the `aad` parameter and bind it into the GCM tag; this box NEVER
// derives the value — `domain/credentials` supplies `${userId}|${provider}` from its single aadFor()
// site. A row lifted into another (userId, provider) slot fails tag verification — a
// loud GCM error, not a silent wrong decrypt. The string MUST stay byte-identical across any refactor;
// this box is the wrong place to "normalize" it. A fresh 12-byte IV is generated per encrypt (never
// reuse an IV with a key).

const GCM_ALGORITHM = "aes-256-gcm";
// GCM's standard/recommended IV length is 12 bytes (96 bits).
const IV_BYTES = 12;

/** Build a SecretBox over a 32-byte key, or a disabled box when `key` is null (no valid key configured).
 *  The disabled box never throws here — only at encrypt/decrypt CALL time. */
export function createSecretBox(key: Buffer | null): SecretBox {
  return {
    enabled: key !== null,
    encrypt(plaintext: string, aad: string): Sealed {
      if (!key) {
        throw new Error("CREDENTIALS_KEY is not set; per-user credential encryption is disabled.");
      }
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(GCM_ALGORITHM, key, iv);
      cipher.setAAD(Buffer.from(aad, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
      };
    },
    decrypt(sealed: Sealed, aad: string): string {
      if (!key) {
        throw new Error("CREDENTIALS_KEY is not set; cannot decrypt a per-user credential.");
      }
      const decipher = createDecipheriv(GCM_ALGORITHM, key, Buffer.from(sealed.iv, "base64"));
      decipher.setAAD(Buffer.from(aad, "utf8"));
      decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
      // final() throws if the tag/AAD/key don't verify — a wrong key or a lifted row fails LOUDLY.
      return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
    },
  };
}

export type { Sealed, SecretBox } from "./contract.ts";
