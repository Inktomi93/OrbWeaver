import type { UserCredentialId, UserId } from "@orb/kit/ids";
import type { Sealed } from "#infra/crypto";

/** Private owner authority captured when the credential is decrypted, never a wire projection. */
export interface CapturedCredentialExecution {
  readonly ownerId: UserId;
  readonly credentialId: UserCredentialId;
  readonly sealed: Readonly<Sealed>;
}

/** One atomic strike result distinguishes a replaced owned key from a missing or foreign row. */
export interface CredentialExecutionStrike {
  readonly id: UserCredentialId;
  readonly applied: boolean;
}
