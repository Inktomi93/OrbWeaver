// The infra adapters the sessions domain builds its password verifier and id-token cipher from.

import type { SessionsCryptoOps } from "#domain/sessions";
import { createPasswordHasher } from "#infra/auth";
import { createSecretBox } from "#infra/crypto";

/** The one wiring of the sessions crypto ops; every root that builds a sessions service passes it. */
export const SESSIONS_CRYPTO: SessionsCryptoOps = { createPasswordHasher, createSecretBox };
