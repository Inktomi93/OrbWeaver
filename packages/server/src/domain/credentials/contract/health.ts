import type { UserCredentialId } from "@orb/kit/ids";

export interface CredentialHealthCache extends Disposable {
  readonly getLastHealthCheck: (credentialId: UserCredentialId) => number | undefined;
  readonly rememberHealthCheck: (credentialId: UserCredentialId, now: number) => void;
  readonly recordHealthStrike: (credentialId: UserCredentialId) => number;
  readonly clearHealthStrikes: (credentialId: UserCredentialId) => void;
}

/** Cooldown claims and consecutive failure streaks belong to one application graph. */
export interface CredentialHealthThrottle extends Disposable {
  readonly beginProbe: (credentialId: UserCredentialId, now: number) => number | null;
  readonly recordStrike: (credentialId: UserCredentialId) => { readonly strikes: number; readonly limitHit: boolean };
  readonly resetStrikes: (credentialId: UserCredentialId) => void;
}
