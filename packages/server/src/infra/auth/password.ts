// Local-password hashing for AUTH_MODE=local (mint side — consumed by the entry login route + admin's
// createUser/resetPassword, NOT by `resolve` which reads the cookie). Self-contained `node:crypto`
// scrypt with a per-user random salt; every hash carries its own salt (no shared server salt → two
// users with the same password get different hashes; a stolen DB can't be rainbow-tabled). The verify
// compare is constant-time.
//
// Stored format is one self-describing string (no separate salt column): `scrypt$<saltB64>$<hashB64>`.
// The algo prefix leaves room to migrate the KDF (verify branches on prefix; lazy re-hash on login).
//
// DI idiom (mirrors infra/crypto's createSecretBox / createTokenHasher): the SESSION_SECRET PEPPER
// arrives as a CONSTRUCTOR param — this module does NOT read env. entry/ builds the live one with
// `createPasswordHasher(env.SESSION_SECRET)`. An unset pepper ⇒ a DISABLED hasher (hash/verify throw at
// CALL time); AUTH_MODE=local env-refines SESSION_SECRET as required, so the throw guards misconfig.
// Rotating SESSION_SECRET invalidates all local passwords (same blast radius as session invalidation).

import type { ScryptOptions } from "node:crypto";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const ALGO = "scrypt";
const HMAC_ALGORITHM = "sha256";
const SALT_BYTES = 16;
const KEY_LEN = 64;
// Pin scrypt cost EXPLICITLY (not Node's defaults — a runtime default shift would silently weaken or
// break existing verifies). N=2^15 / r=8 / p=1 = OWASP 2023 baseline (~64 MB); maxmem leaves headroom.
const SCRYPT_N = 32_768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM_BYTES = 134_217_728; // 128 MiB (128 * 1024 * 1024)
const SCRYPT_OPTIONS: ScryptOptions = {
  // biome-ignore lint/style/useNamingConvention: `N` is the canonical scrypt cost parameter name (RFC 7914).
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: SCRYPT_MAXMEM_BYTES,
};
// The cleartext floor enforced at the hashing boundary (mirrors env `LOCAL_INITIAL_PASSWORD.min(8)`).
export const MIN_PASSWORD_LENGTH = 8;
const STORED_PARTS = 3;

/** A well-formed all-zero dummy hash for the login CONSTANT-TIME floor: an unknown handle / SSO-only
 *  (null hash) row verifies against THIS so scrypt still runs, defeating the username-enumeration timing
 *  oracle. All-zero bytes can never match a real (peppered+salted) password — it just burns KDF time. */
export const DUMMY_PASSWORD_HASH = `${ALGO}$${Buffer.alloc(SALT_BYTES).toString("base64")}$${Buffer.alloc(
  KEY_LEN,
).toString("base64")}`;

// promisify(scryptCb) loses the ScryptOptions overload — wrap manually so callers can pin cost.
function scrypt(
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derived) =>
      err ? reject(err) : resolve(derived),
    );
  });
}

/** The local-password hashing seam; constructed at entry/ with the SESSION_SECRET pepper and injected
 *  into the login route + admin user verbs. */
export interface PasswordHasher {
  /** false when no pepper is configured → hash/verify throw at call time. */
  readonly enabled: boolean;
  /** Hash a cleartext password into the self-contained `scrypt$salt$hash` form. Throws if too short. */
  hash: (plain: string) => Promise<string>;
  /** Constant-time verify of a cleartext password against a stored value. false (never throws) for a
   *  null/empty/malformed stored value or any mismatch — so a nullable `passwordHash` passes straight
   *  in and an SSO-only (null-hash) row simply fails to log in. */
  verify: (plain: string, stored: string | null | undefined) => Promise<boolean>;
}

/** Build a PasswordHasher over the SESSION_SECRET pepper, or a disabled hasher when no pepper is set. */
export function createPasswordHasher(pepperSecret: string | null | undefined): PasswordHasher {
  const secret =
    pepperSecret !== null && pepperSecret !== undefined && pepperSecret.length > 0
      ? pepperSecret
      : null;

  // HMAC the cleartext with the pepper before scrypt, so a stolen DB alone can't brute-force offline.
  function pepper(plain: string): Buffer {
    if (secret === null) {
      throw new Error(
        "SESSION_SECRET is not configured but is required for password hashing/verification " +
          "(AUTH_MODE=local). Set SESSION_SECRET in the deployment env.",
      );
    }
    return Buffer.from(
      createHmac(HMAC_ALGORITHM, secret).update(plain.normalize()).digest("base64"),
      "utf8",
    );
  }

  return {
    enabled: secret !== null,
    async hash(plain: string): Promise<string> {
      const normalized = plain.normalize();
      if (normalized.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      const salt = randomBytes(SALT_BYTES);
      const derived = await scrypt(pepper(normalized), salt, KEY_LEN, SCRYPT_OPTIONS);
      return `${ALGO}$${salt.toString("base64")}$${derived.toString("base64")}`;
    },
    async verify(plain: string, stored: string | null | undefined): Promise<boolean> {
      if (stored === null || stored === undefined || stored.length === 0) {
        return false;
      }
      const parts = stored.split("$");
      if (parts.length !== STORED_PARTS || parts[0] !== ALGO) {
        return false;
      }
      const [, saltB64, hashB64] = parts as [string, string, string];
      let salt: Buffer;
      let expected: Buffer;
      try {
        salt = Buffer.from(saltB64, "base64");
        expected = Buffer.from(hashB64, "base64");
      } catch {
        return false;
      }
      // Pin the derive length to our own KEY_LEN — a malformed/oversized stored hash can never steer
      // scrypt toward maxmem; a row whose hash isn't KEY_LEN bytes can't have come from hash().
      if (expected.length !== KEY_LEN) {
        return false;
      }
      const derived = await scrypt(pepper(plain), salt, KEY_LEN, SCRYPT_OPTIONS);
      return timingSafeEqual(derived, expected);
    },
  };
}
