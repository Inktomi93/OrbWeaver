import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { AppearancePatch, SettingsShimEvidence } from "./appearance.ts";
import type { Viewport } from "./argv.ts";
import type { BrowserEnvironmentContract } from "./browser-environment.ts";
import type { BoundedEvidenceRing, BoundedLatestMap, BrowserEvidenceRetentionBatch } from "./browser-evidence-ring.ts";
import type { RedactedRequestUrl } from "./browser-request-url.ts";
import type { ThemeRequest } from "./theme.ts";

export interface CapturedRequest {
  method: string;
  url: string;
  status: number | null;
  failed: string | null;
  /** Playwright resourceType (document/xhr/fetch/image/…) — annotates failures. */
  type: string;
}

export interface CapturedConsole {
  readonly type: string;
  readonly text: string;
  readonly location: { readonly url: string; readonly line: number; readonly column: number } | null;
  readonly line: string;
}

export interface BrowserPageError {
  readonly kind: "runtime" | "instrument";
  readonly name: string | null;
  readonly message: string;
  readonly stack: string | null;
}

export function runtimePageError(error: Error): BrowserPageError {
  return { kind: "runtime", name: error.name, message: error.message, stack: error.stack ?? null };
}

export function instrumentPageError(message: string): BrowserPageError {
  return { kind: "instrument", name: null, message, stack: null };
}

export function pageErrorText(error: BrowserPageError): string {
  if (error.kind === "instrument") {
    return `INSTRUMENT ERROR: ${error.message}`;
  }
  return `${error.name ?? "Error"}: ${error.message}${error.stack === null ? "" : `\n${error.stack}`}`;
}

export const DIAGNOSTIC_LEVELS = ["verbose", "info", "warning", "error"] as const;
export type DiagnosticLevel = (typeof DIAGNOSTIC_LEVELS)[number];

export const DIAGNOSTIC_ORIGINS = ["page-console", "page-error", "browser-log", "audits", "orb-console-ring", "instrument-limit"] as const;
export type DiagnosticOrigin = (typeof DIAGNOSTIC_ORIGINS)[number];
export type BrowserDiagnosticDetails = object | string | number | boolean;
export type BrowserDiagnosticStack = BrowserDiagnosticDetails;

export interface BrowserDiagnostic {
  readonly origin: DiagnosticOrigin;
  readonly source: string;
  readonly level: DiagnosticLevel;
  readonly category: string | null;
  readonly text: string;
  readonly timestamp: number;
  readonly location: { readonly url: string; readonly line: number; readonly column: number | null } | null;
  readonly stack: BrowserDiagnosticStack | null;
  readonly requestId: string | null;
  readonly issueCode: string | null;
  readonly details: BrowserDiagnosticDetails | null;
  readonly backendNodeId: number | null;
  readonly contextIndex: number;
  readonly pageIndex: number;
  readonly evidenceWindow: number;
  readonly raw: unknown;
}

export interface DiagnosticWindow {
  value: number;
}

export interface OrbConsoleCompleteness {
  readonly contextIndex: number;
  readonly pageIndex: number;
  readonly evidenceWindow: number;
  readonly records: number;
  readonly dropped: number;
  readonly cap: number;
  readonly complete: boolean;
}

export interface LocalStorageSeed {
  readonly key: string;
  readonly value: string;
}

export interface BrowserEvidenceChannels {
  readonly contextIndex: number;
  readonly console: BoundedEvidenceRing<CapturedConsole>;
  readonly pageErrors: BoundedEvidenceRing<BrowserPageError>;
  readonly diagnostics: BoundedEvidenceRing<BrowserDiagnostic>;
  readonly diagnosticCompleteness: BoundedEvidenceRing<OrbConsoleCompleteness>;
  readonly requestSummary: BoundedLatestMap<RedactedRequestUrl, CapturedRequest>;
  readonly retention: () => BrowserEvidenceRetentionBatch;
}

export interface BrowserEvidenceLimits {
  readonly console?: number;
  readonly pageErrors?: number;
  readonly diagnostics?: number;
  readonly diagnosticCompleteness?: number;
  readonly requestSummary?: number;
  readonly networkCompleted?: number;
  readonly networkPendingExtra?: number;
  readonly networkBodyReadTimeoutMs?: number;
}

/** The complete contract for a browser launch or an extra isolated context on an owned browser. */
export interface ProbeLaunchOptions {
  readonly headless: boolean;
  readonly viewport: Viewport;
  /** Did the CALLER explicitly ask for this size? A size override is not a device change (#1668): with a
   *  `device` set, an explicit viewport WINDOWS the device (touch/DPR/UA/isMobile survive) instead of
   *  demoting it, and without this marker that ask is indistinguishable from the desktop default every
   *  caller carries. Absent ⇒ a device's own viewport wins, exactly as before. */
  readonly viewportExplicit?: boolean;
  readonly colorScheme: "light" | "dark" | null;
  readonly reducedMotion: boolean;
  readonly contrast?: "more" | "no-preference" | null;
  readonly reducedTransparency?: boolean;
  readonly localStorage: readonly LocalStorageSeed[];
  readonly recordVideoDir?: string;
  readonly device?: string | null;
  readonly deviceScaleFactor?: number;
  readonly pages?: number;
  readonly contexts?: number;
  readonly contextCookies?: readonly (string | null)[];
  readonly cookieDomain?: string;
  readonly appearance?: AppearancePatch | null;
  readonly theme?: ThemeRequest | null;
  readonly trace?: boolean;
  readonly persistentProfileDir?: string;
  readonly browserArgs?: readonly string[];
  /** Headers every request from every context carries, set on the context before its first page. */
  readonly extraHTTPHeaders?: Readonly<Record<string, string>>;
  /** Focused retention proofs inject small caps; production omits this and uses measured policy caps. */
  readonly evidenceLimits?: BrowserEvidenceLimits;
}

/** One isolated context's pages, capture rings, settings proof and requested environment identity. */
export interface ProbeContext {
  readonly context: BrowserContext;
  readonly pages: readonly Page[];
  readonly consoleLines: readonly string[];
  readonly consoleMessages: readonly CapturedConsole[];
  readonly pageErrors: readonly BrowserPageError[];
  readonly requests: ReadonlyMap<RedactedRequestUrl, CapturedRequest>;
  readonly diagnostics: readonly BrowserDiagnostic[];
  readonly diagnosticCompleteness: readonly OrbConsoleCompleteness[];
  readonly evidence: BrowserEvidenceChannels;
  readonly diagnosticWindow: DiagnosticWindow;
  readonly settingsEvidence: SettingsShimEvidence;
  readonly environmentContract: BrowserEnvironmentContract;
  /** False for a context another CDP connection owns; absent means this session owns it. */
  readonly owned?: boolean;
}

/** The browser owner plus its default context/page view and every context it is responsible for closing. */
export interface ProbeSession {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly pages: readonly Page[];
  readonly consoleLines: readonly string[];
  readonly consoleMessages: readonly CapturedConsole[];
  readonly pageErrors: readonly BrowserPageError[];
  readonly requests: ReadonlyMap<RedactedRequestUrl, CapturedRequest>;
  readonly diagnostics: readonly BrowserDiagnostic[];
  readonly diagnosticCompleteness: readonly OrbConsoleCompleteness[];
  readonly evidence: BrowserEvidenceChannels;
  readonly diagnosticWindow: DiagnosticWindow;
  readonly environmentContract: BrowserEnvironmentContract;
  readonly contexts: readonly ProbeContext[];
  readonly cleanup?: readonly (() => Promise<void>)[];
}

export interface BrowserNetworkHeader {
  readonly name: string;
  readonly value: string;
}

export interface BrowserNetworkCookie {
  readonly name: string;
  readonly value: string;
  readonly path: string;
  readonly domain: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: string;
}

export interface BrowserNetworkRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: readonly BrowserNetworkHeader[];
  readonly hasPostData: boolean;
  readonly postData: string | null;
}

export interface BrowserNetworkTiming {
  readonly proxyStart: number;
  readonly proxyEnd: number;
  readonly dnsStart: number;
  readonly dnsEnd: number;
  readonly connectStart: number;
  readonly connectEnd: number;
  readonly sslStart: number;
  readonly sslEnd: number;
  readonly sendStart: number;
  readonly sendEnd: number;
  readonly receiveHeadersStart: number;
  readonly receiveHeadersEnd: number;
}

export interface BrowserNetworkTimingInput extends BrowserNetworkTiming {
  readonly requestTime?: number;
}

export interface BrowserNetworkSecurityTimestamp {
  readonly status: string;
  readonly origin: string;
  readonly logDescription: string;
  readonly logId: string;
  readonly timestamp: number;
  readonly hashAlgorithm: string;
  readonly signatureAlgorithm: string;
  readonly signatureData: string;
}

export interface BrowserNetworkSecurityDetails {
  readonly protocol: string;
  readonly keyExchange: string;
  readonly keyExchangeGroup: string | null;
  readonly cipher: string;
  readonly mac: string | null;
  readonly certificateId: number;
  readonly subjectName: string;
  readonly sanList: readonly string[];
  readonly issuer: string;
  readonly validFrom: number;
  readonly validTo: number;
  readonly signedCertificateTimestampList: readonly BrowserNetworkSecurityTimestamp[];
  readonly certificateTransparencyCompliance: string;
  readonly serverSignatureAlgorithm: number | null;
  readonly encryptedClientHello: boolean;
}

export interface BrowserNetworkSecurityDetailsInput extends Omit<BrowserNetworkSecurityDetails, "keyExchangeGroup" | "mac" | "serverSignatureAlgorithm"> {
  readonly keyExchangeGroup?: string;
  readonly mac?: string;
  readonly serverSignatureAlgorithm?: number;
}

export interface BrowserNetworkResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly BrowserNetworkHeader[];
  readonly mimeType: string;
  readonly protocol: string;
  readonly timing: BrowserNetworkTiming | null;
  readonly fromDiskCache: boolean;
  readonly fromServiceWorker: boolean;
  readonly fromPrefetchCache: boolean;
  readonly connectionId: number;
  readonly remoteIPAddress: string;
  readonly remotePort: number;
  readonly securityState: string;
  readonly securityDetails: BrowserNetworkSecurityDetails | null;
}

export interface BrowserNetworkRequestExtra {
  readonly headers: readonly BrowserNetworkHeader[];
  readonly cookies: readonly BrowserNetworkCookie[];
  readonly headersText: string | null;
}

export interface BrowserNetworkResponseExtra {
  readonly statusCode: number;
  readonly headers: readonly BrowserNetworkHeader[];
  readonly headersText: string | null;
}

export function normalizeBrowserNetworkHeaders(headers: Readonly<Record<string, string>> | undefined): readonly BrowserNetworkHeader[] {
  if (headers === undefined) {
    return [];
  }
  return Object.entries(headers).flatMap(([name, value]) =>
    typeof value === "string" ? value.split(/\r?\n/u).map((member) => ({ name, value: member })) : [],
  );
}

interface NetworkCookieInput {
  readonly name: string;
  readonly value: string;
  readonly path: string;
  readonly domain: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite?: string;
}

function normalizeNetworkCookies(cookies: readonly { readonly cookie: NetworkCookieInput }[] | undefined): readonly BrowserNetworkCookie[] {
  return (cookies ?? []).map(({ cookie }) => ({
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    domain: cookie.domain,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite ?? "",
  }));
}

export function normalizeBrowserNetworkRequest(request: {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly hasPostData?: boolean;
  readonly postData?: string;
}): BrowserNetworkRequest {
  return {
    url: request.url,
    method: request.method,
    headers: normalizeBrowserNetworkHeaders(request.headers),
    hasPostData: request.hasPostData === true,
    postData: request.postData ?? null,
  };
}

export function normalizeBrowserNetworkRequestExtra(input: {
  readonly headers: Readonly<Record<string, string>>;
  readonly associatedCookies?: readonly { readonly cookie: NetworkCookieInput }[];
  readonly headersText?: string;
}): BrowserNetworkRequestExtra {
  return {
    headers: normalizeBrowserNetworkHeaders(input.headers),
    cookies: normalizeNetworkCookies(input.associatedCookies),
    headersText: input.headersText ?? null,
  };
}

export function normalizeBrowserNetworkResponseExtra(input: {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly headersText?: string;
}): BrowserNetworkResponseExtra {
  return {
    statusCode: input.statusCode,
    headers: normalizeBrowserNetworkHeaders(input.headers),
    headersText: input.headersText ?? null,
  };
}

/** Normalized, memory-only CDP Network correlation. The typed handlers copy only fields consumed by
 * body selection and HAR; the HAR trust boundary redacts this shape before any artifact write. */
export interface BrowserNetworkRecord {
  readonly requestId: string;
  readonly generation: number;
  readonly contextIndex: number;
  readonly pageIndex: number;
  readonly evidenceWindow: number;
  readonly startedWallTime: number;
  readonly startedMonotonicTime: number;
  readonly resourceType: string | null;
  readonly documentUrl: string;
  readonly initiatorType: string;
  readonly request: BrowserNetworkRequest;
  readonly requestExtra: BrowserNetworkRequestExtra | null;
  readonly response: BrowserNetworkResponse | null;
  readonly responseExtra: BrowserNetworkResponseExtra | null;
  readonly finished: { readonly timestamp: number; readonly encodedDataLength: number } | null;
  readonly failed: { readonly timestamp: number; readonly errorText: string; readonly canceled: boolean; readonly blockedReason: string | null } | null;
  readonly dataLength: number;
  readonly encodedDataLength: number;
  readonly redirectTo: string | null;
  readonly requestBody: {
    readonly text: string | null;
    readonly unavailableReason: "failed" | "not-selected" | "timeout" | "unavailable" | null;
    readonly truncatedAt: number | null;
  } | null;
  readonly responseBody: {
    readonly text: string | null;
    readonly base64Encoded: boolean;
    readonly unavailableReason: "body-too-large" | "evicted" | "failed" | "mime-not-text" | "not-selected" | "timeout" | "unavailable" | null;
    readonly truncatedAt: number | null;
  } | null;
}

/** Environment identity supplied by a session registry row when a sibling attaches over CDP. */
export type ProbeAttachOptions = Pick<
  ProbeLaunchOptions,
  "viewport" | "device" | "colorScheme" | "reducedMotion" | "deviceScaleFactor" | "recordVideoDir" | "evidenceLimits"
> &
  Required<Pick<ProbeLaunchOptions, "contrast" | "reducedTransparency">>;
