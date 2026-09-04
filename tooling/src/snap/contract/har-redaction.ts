// The HAR redaction door's typed boundary. Runtime logic stays in lib/har-redaction.ts; these shapes
// let the CDP collector prove that only disk-safe evidence crosses into its HAR serializer.
export const REDACTED = "[REDACTED]";

export interface NetworkHeaderInput {
  readonly name: string;
  readonly value: string;
}

export type NetworkHeadersInput = readonly NetworkHeaderInput[] | Readonly<Record<string, string | readonly string[]>>;

export interface NetworkCookieInput {
  readonly name: string;
  readonly value: string;
  readonly path?: string;
  readonly domain?: string;
  readonly expires?: string;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: string;
}

const NETWORK_BODY_UNAVAILABLE_REASONS = ["evicted", "failed", "not-selected", "timeout", "unavailable"] as const;
type NetworkBodyUnavailableReason = (typeof NETWORK_BODY_UNAVAILABLE_REASONS)[number];

export interface NetworkBodyInput {
  readonly mimeType?: string | null;
  readonly text?: string | null;
  readonly value?: unknown;
  readonly base64Encoded?: boolean;
  readonly streaming?: boolean;
  readonly sizeBytes?: number | null;
  readonly encoding?: string | null;
  readonly unavailableReason?: NetworkBodyUnavailableReason;
}

export interface RawNetworkEvidence {
  readonly url: string;
  readonly requestHeaders?: NetworkHeadersInput;
  readonly requestCookies?: readonly NetworkCookieInput[];
  readonly postData?: NetworkBodyInput | undefined;
  readonly responseHeaders?: NetworkHeadersInput;
  readonly responseCookies?: readonly NetworkCookieInput[];
  readonly responseContent?: NetworkBodyInput | undefined;
}

export interface NetworkEvidenceLimits {
  readonly maxDepth: number;
  readonly maxFields: number;
  readonly maxStringBytes: number;
  readonly maxBodyBytes: number;
  readonly maxEntries: number;
  readonly maxUrlBytes: number;
}

export const NETWORK_LIMIT_KINDS = ["body", "cycle", "depth", "entries", "fields", "string", "unreadable", "unsupported"] as const;
type NetworkLimitKind = (typeof NETWORK_LIMIT_KINDS)[number];

export interface NetworkLimitEvent {
  readonly kind: NetworkLimitKind;
  readonly path: string;
  readonly original: number | null;
  readonly retained: number | null;
  readonly omitted: number | null;
}

export type RedactedJsonValue = null | boolean | number | string | readonly RedactedJsonValue[] | { readonly [key: string]: RedactedJsonValue };

export interface HarRedactionContext {
  readonly limits: NetworkEvidenceLimits;
  readonly events: NetworkLimitEvent[];
}

export interface HarJsonCursor extends HarRedactionContext {
  readonly path: string;
  readonly depth: number;
  readonly state: { fields: number };
  readonly active: WeakSet<object>;
}

export interface HarBodyContext extends HarRedactionContext {
  readonly input: NetworkBodyInput;
  readonly path: string;
  readonly rawMimeType: string | null;
  readonly mimeType: string | null;
  readonly encoding: string | null;
}

export interface DiskSafeNameValue {
  readonly name: string;
  readonly value: string;
}

export interface DiskSafeUrlEvidence {
  readonly url: string;
  readonly query: readonly DiskSafeNameValue[];
  readonly _orbMeasuredLimit: {
    readonly policy: NetworkEvidenceLimits;
    readonly events: readonly NetworkLimitEvent[];
  };
}

export interface DiskSafeCookie extends NetworkCookieInput {
  readonly value: typeof REDACTED;
}

const NETWORK_BODY_OMISSION_REASONS = [
  ...NETWORK_BODY_UNAVAILABLE_REASONS,
  "body-too-large",
  "invalid-base64",
  "malformed-form",
  "malformed-json",
  "mime-not-text",
  "non-utf8",
  "sanitized-body-too-large",
  "streaming",
] as const;
export type NetworkBodyOmissionReason = (typeof NETWORK_BODY_OMISSION_REASONS)[number];

export interface DiskSafeBody {
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly encoding: string | null;
  readonly text: string | null;
  readonly params: readonly DiskSafeNameValue[] | null;
  readonly omission: {
    readonly reason: NetworkBodyOmissionReason;
    readonly limitBytes: number | null;
  } | null;
  readonly _orbMeasuredLimit: {
    readonly inputBytes: number | null;
    readonly retainedBytes: number;
    readonly truncated: boolean;
  };
}

export interface DiskSafeNetworkEvidence {
  readonly url: string;
  readonly query: readonly DiskSafeNameValue[];
  readonly request: {
    readonly headers: readonly DiskSafeNameValue[];
    readonly cookies: readonly DiskSafeCookie[];
    readonly postData: DiskSafeBody | null;
  };
  readonly response: {
    readonly headers: readonly DiskSafeNameValue[];
    readonly cookies: readonly DiskSafeCookie[];
    readonly content: DiskSafeBody | null;
  };
  readonly _orbMeasuredLimit: {
    readonly policy: NetworkEvidenceLimits;
    readonly events: readonly NetworkLimitEvent[];
  };
}
