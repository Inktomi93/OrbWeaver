import type { UserCredentialId, UserId } from "@orb/kit/ids";

export type CredentialOwned = (ownerId: UserId, credentialId: UserCredentialId) => Promise<boolean>;
