// Scoped network execution keeps all admission in the infra owner; only physical edges vary.

import type { TimerScheduler } from "@orb/kit/time";
import type { buildConnector } from "undici";

export const ENDPOINT_ADMISSIONS = ["public", "admitted", "refused", "invalid"] as const;

export const ANY_HOST: unique symbol = Symbol("safeFetch.ANY_HOST");

export const EGRESS_BLOCK_REASONS = [
  "scheme",
  "credentials",
  "host-not-allowed",
  "ip-literal",
  "private-address",
  "unresolvable",
  "too-many-redirects",
  "deadline",
  "content-type", // step 6: the terminal response's content-type is not in the allowlist
  "too-large", // the streamed body exceeded maxBytes (the decompression-bomb bound)
  "consumed", // the single-use bytes() reader was invoked twice
] as const;
export type EgressBlockReason = (typeof EGRESS_BLOCK_REASONS)[number];

export interface SafeFetchOptions {
  /** REQUIRED. A host allowlist (exact "api.chub.ai" or a leading-dot suffix ".chub.ai" that matches
   *  any subdomain but NEVER the bare apex), checked case-insensitively at the start URL and on EVERY
   *  redirect hop; OR the {@link ANY_HOST} sentinel (the named no-allowlist escape for the
   *  provider-returned-URL / arbitrary-URL classes — IP denial still runs). */
  readonly allowedHosts: readonly string[] | typeof ANY_HOST;
  readonly method?: "GET" | "POST";
  /** Forwarded on same-origin hops; credential-class headers + the body are STRIPPED on any cross-origin
   *  redirect. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  /** Hard cap on response bytes read (post-decode — the cap IS the decompression-bomb bound). Default 5 MB. */
  readonly maxBytes?: number;
  /** Max redirect hops. Default 3. 0 = a redirect is an error. */
  readonly maxRedirects?: number;
  /** If set, the response content-type (major/minor, params ignored) must match one entry. */
  readonly allowedContentTypes?: readonly string[];
  /** Total request deadline (connect + headers + redirects). Default 15_000 ms — S5. */
  readonly deadlineMs?: number;
  /** Caller cancellation, composed with the deadline. */
  readonly signal?: AbortSignal;
}

export interface SafeFetchResult {
  /** Final response URL after safeFetch's validated redirect chain. Optional only for injected test doubles. */
  readonly url?: string;
  readonly status: number;
  readonly headers: Headers;
  readonly contentType: string | null;
  /** Single-use capped reader (throws on reuse; throws the moment maxBytes is exceeded). Reading fully
   *  releases the socket + closes the pinned Agent — a caller that reads never needs {@link dispose}. */
  readonly bytes: () => Promise<Uint8Array>;
  /** Release the response WITHOUT reading it — cancels the body (socket back to the pool) and destroys the
   *  pinned per-request Agent. Idempotent + no-op once `bytes()` has run. Every early-return/abandon path
   *  (a non-2xx status the caller drops, a throw before reading) calls this (`res.dispose?.()`) so an
   *  upstream failure storm can't leak Agents until the deadline timer fires. OPTIONAL because only the real
   *  network-backed result carries an Agent/socket to release; a test stub has nothing to dispose, so a
   *  `dispose?.()` call is a correct no-op there rather than forcing every fake to stub it. */
  readonly dispose?: () => void;
}

export interface PinnedDownloadLimits {
  readonly allowedHosts: readonly string[];
  readonly maxBytes: number;
  readonly deadlineMs: number;
}

export type EgressResolver = (host: string) => Promise<readonly string[]>;

export interface ScopedEgressOptions {
  readonly fetch?: typeof fetch | undefined;
  readonly resolver?: EgressResolver;
  /** The physical dial: every connector this egress builds comes from here, so a script replaces the socket and keeps the address judgment. */
  readonly buildConnector?: typeof buildConnector;
  readonly timers?: TimerScheduler;
}

export interface ScopedEgress extends AsyncDisposable {
  readonly cancel: () => void;
  readonly publishPrivateEndpointAllowlist: (entries: readonly string[]) => void;
  readonly endpointAdmission: (baseUrl: string) => (typeof ENDPOINT_ADMISSIONS)[number];
  readonly resolvedEndpointAdmission: (baseUrl: string) => Promise<(typeof ENDPOINT_ADMISSIONS)[number]>;
  readonly safeFetch: (url: string | URL, options: SafeFetchOptions) => Promise<SafeFetchResult>;
  readonly fetchImageBytes: (url: string, maxBytes?: number, signal?: AbortSignal) => Promise<Uint8Array | null>;
  readonly fetchWebDocument: (url: string) => Promise<Uint8Array>;
  readonly fetchPluginBundle: (url: string) => Promise<Uint8Array>;
  readonly fetchPinnedDownload: (url: string, limits: PinnedDownloadLimits) => Promise<Response>;
  readonly configuredEndpointFetch: typeof fetch;
}
