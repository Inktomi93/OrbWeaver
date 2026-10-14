// Client-owned projections derive their production wire/input homes; computed presentation data stays local.

import type { IpCertificateRefusal, RelayBinaryRefusal, ShareRefusal, SignInModeView } from "@orb/contracts/identity";
import type { EffectiveAppConfig } from "@orb/contracts/settings";

export type ShareFactsView = Pick<SignInModeView, "mode"> &
  Pick<EffectiveAppConfig, "localMultiUser" | "discreetLogin"> & { readonly refusal: ShareStartFailure["code"] | null };

export type PreconditionRow = Readonly<{ id: (typeof SHARE_PRECONDITIONS)[number]; verdict: (typeof PRECONDITION_VERDICTS)[number] }>;

export type IpCertificateRefusalView = Omit<ShareStartFailure, "code"> & { readonly code: IpCertificateRefusal };

export const SHARE_PRECONDITIONS = ["mode", "owner", "seating", "relay"] as const;

export type SharePrecondition = (typeof SHARE_PRECONDITIONS)[number];

export const PRECONDITION_VERDICTS = ["met", "unmet", "waiting", "unchecked", "refused"] as const;

export type PreconditionVerdict = (typeof PRECONDITION_VERDICTS)[number];

export type ShareStartRefusal = ShareRefusal | RelayBinaryRefusal;

export interface ShareStartFailure {
  readonly code: ShareStartRefusal;
  readonly message: string;
}

export interface IpCertificateFormValues {
  readonly address: string;
  readonly httpsPort: number | null;
  readonly challengePort: number | null;
}
