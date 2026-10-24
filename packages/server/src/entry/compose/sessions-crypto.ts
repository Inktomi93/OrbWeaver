// The production pair the sessions domain builds its password verifier and id-token cipher from.

import type { SessionsCryptoOps } from "#domain/sessions";
import { createPasswordHasher } from "#infra/auth";
import { createSecretBox } from "#infra/crypto";

/**
 * The sessions crypto ops every root that builds a sessions service receives as a dependency.
 *
 * @remarks Nominal on purpose: the protected brand and the private constructor mean an object literal, a spread
 * copy, a subclass or an outside `new` is not a `SessionsCrypto`, so no root type-checks while handing
 * the sessions domain a pair other than the production hasher and secret box. A test may still wrap a method of
 * the instance in a spy.
 */
export class SessionsCrypto implements SessionsCryptoOps {
  protected readonly nominalBrand = true;
  readonly createPasswordHasher: SessionsCryptoOps["createPasswordHasher"] = createPasswordHasher;
  readonly createSecretBox: SessionsCryptoOps["createSecretBox"] = createSecretBox;

  private constructor() {}

  /** A fresh instance per root, so one root's spy never reaches another root's graph. */
  static production(): SessionsCrypto {
    return new SessionsCrypto();
  }
}
