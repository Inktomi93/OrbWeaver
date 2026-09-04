// The one HAR 1.2 serializer. Its only input is correlated CDP Network evidence; the Playwright request
// summary ring is intentionally absent. Raw protocol strings cross the redaction door before this module
// constructs anything that may be written to a run slot.
import { writeFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type {
  BrowserNetworkCookie,
  BrowserNetworkHeader,
  BrowserNetworkRecord,
  BrowserNetworkResponse,
  BrowserNetworkTiming,
} from "../../_shared/browser-contract.ts";
import { browserEvidenceRetentionBatchSchema, retentionBatch } from "../../_shared/browser-evidence-ring.ts";
import { networkRecordsForPages, networkRetentionForPages } from "../../_shared/browser-network.ts";
import type { NetworkBodyInput, NetworkCookieInput, RawNetworkEvidence } from "../contract/har-redaction.ts";
import { redactNetworkEvidence } from "./har-redaction.ts";
import type { NetworkHarWriteReceipt } from "./network-har-receipt.ts";
import { networkHarReceipt } from "./network-har-receipt.ts";

const MS_PER_SECOND = 1000;

function responseFor(record: BrowserNetworkRecord): BrowserNetworkResponse {
  if (record.response !== null) {
    return record.response;
  }
  const statusText = record.failed === null ? "" : record.failed.errorText;
  return {
    status: 0,
    statusText,
    headers: [],
    mimeType: "application/octet-stream",
    protocol: "unknown",
    timing: null,
    fromDiskCache: false,
    fromServiceWorker: false,
    fromPrefetchCache: false,
    connectionId: 0,
    remoteIPAddress: "",
    remotePort: -1,
    securityState: "unknown",
    securityDetails: null,
  };
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function text(value: unknown, key: string, fallback = ""): string {
  const result = field(value, key);
  return typeof result === "string" ? result : fallback;
}

function setCookies(headers: readonly BrowserNetworkHeader[]): readonly NetworkCookieInput[] {
  return headers
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .flatMap(({ value }) => {
      const [pair, ...attributes] = value.split(";");
      const separator = pair?.indexOf("=") ?? -1;
      if (pair === undefined || separator <= 0) {
        return [];
      }
      const attributeMap = new Map(
        attributes.map((attribute) => {
          const [name, ...rest] = attribute.trim().split("=");
          return [name?.toLowerCase() ?? "", rest.join("=")] as const;
        }),
      );
      return [
        {
          name: pair.slice(0, separator).trim(),
          value: pair.slice(separator + 1),
          path: attributeMap.get("path") ?? "/",
          domain: attributeMap.get("domain") ?? "",
          httpOnly: attributeMap.has("httponly"),
          secure: attributeMap.has("secure"),
          sameSite: attributeMap.get("samesite") ?? "",
        },
      ];
    });
}

function headerValue(headers: readonly BrowserNetworkHeader[], wanted: string): string | null {
  return headers.find((header) => header.name.toLowerCase() === wanted)?.value ?? null;
}

function cookies(value: readonly BrowserNetworkCookie[]): readonly NetworkCookieInput[] {
  return value;
}

function requestBodyInput(record: BrowserNetworkRecord): NetworkBodyInput {
  const captured = record.requestBody;
  if (captured === null) {
    return {
      mimeType: headerValue(record.requestExtra?.headers ?? record.request.headers, "content-type"),
      sizeBytes: null,
      unavailableReason: "not-selected",
    };
  }
  return {
    mimeType: headerValue(record.requestExtra?.headers ?? record.request.headers, "content-type"),
    text: captured.text,
    sizeBytes: captured.text === null ? null : Buffer.byteLength(captured.text),
    ...(captured.unavailableReason === null ? {} : { unavailableReason: captured.unavailableReason }),
  };
}

function responseBodyInput(record: BrowserNetworkRecord): NetworkBodyInput {
  const captured = record.responseBody;
  const mimeType = responseFor(record).mimeType;
  if (captured === null) {
    return { mimeType, sizeBytes: record.dataLength > 0 ? record.dataLength : null, unavailableReason: "not-selected" };
  }
  const reason = captured.unavailableReason;
  const redactionReason = reason === "body-too-large" || reason === "mime-not-text" ? "unavailable" : reason;
  return {
    mimeType,
    text: captured.text,
    base64Encoded: captured.base64Encoded,
    sizeBytes: record.dataLength > 0 ? record.dataLength : null,
    ...(redactionReason === null ? {} : { unavailableReason: redactionReason }),
  };
}

function rawEvidence(record: BrowserNetworkRecord): RawNetworkEvidence {
  return {
    url: record.request.url,
    requestHeaders: record.requestExtra?.headers ?? record.request.headers,
    requestCookies: cookies(record.requestExtra?.cookies ?? []),
    postData: requestBodyInput(record),
    responseHeaders: record.responseExtra?.headers ?? responseFor(record).headers,
    responseCookies: setCookies(record.responseExtra?.headers ?? []),
    responseContent: responseBodyInput(record),
  };
}

function safeUrl(value: string, base?: string): string {
  if (value === "") {
    return value;
  }
  const absolute = base === undefined ? value : new URL(value, base).toString();
  return redactNetworkEvidence({ url: absolute }).url;
}

function timingValue(timing: BrowserNetworkTiming | null, start: keyof BrowserNetworkTiming, end: keyof BrowserNetworkTiming): number {
  const from = timing?.[start] ?? -1;
  const to = timing?.[end] ?? -1;
  return from >= 0 && to >= from ? to - from : -1;
}

function timings(record: BrowserNetworkRecord): Record<string, number> {
  const timing = responseFor(record).timing;
  const send = timingValue(timing, "sendStart", "sendEnd");
  const receiveHeadersEnd = timing === null ? -1 : timing.receiveHeadersEnd;
  const sendEnd = timing === null ? -1 : timing.sendEnd;
  const receive = receiveHeadersEnd >= 0 ? Math.max(0, (endTimestamp(record) - record.startedMonotonicTime) * MS_PER_SECOND - receiveHeadersEnd) : -1;
  const firstStart = [timing?.proxyStart, timing?.dnsStart, timing?.connectStart, timing?.sendStart].find((value) => value !== undefined && value >= 0) ?? -1;
  return {
    blocked: firstStart,
    dns: timingValue(timing, "dnsStart", "dnsEnd"),
    connect: timingValue(timing, "connectStart", "connectEnd"),
    ssl: timingValue(timing, "sslStart", "sslEnd"),
    send,
    wait: sendEnd >= 0 && receiveHeadersEnd >= sendEnd ? receiveHeadersEnd - sendEnd : -1,
    receive,
  };
}

function endTimestamp(record: BrowserNetworkRecord): number {
  if (record.finished !== null) {
    return record.finished.timestamp;
  }
  if (record.failed !== null) {
    return record.failed.timestamp;
  }
  return record.startedMonotonicTime;
}

function collectionLimit(record: BrowserNetworkRecord): Record<string, unknown> | null {
  const body = record.responseBody;
  if (body === null) {
    return null;
  }
  if (body.unavailableReason === "body-too-large" || body.unavailableReason === "mime-not-text") {
    return { reason: body.unavailableReason, limitBytes: body.truncatedAt };
  }
  return body.truncatedAt === null ? null : { reason: "truncated", limitBytes: body.truncatedAt };
}

function headerSize(headersText: string | null | undefined): number {
  return headersText === null || headersText === undefined ? -1 : Buffer.byteLength(headersText);
}

function encodedSize(record: BrowserNetworkRecord): number {
  return record.finished === null ? record.encodedDataLength : record.finished.encodedDataLength;
}

function responseContent(record: BrowserNetworkRecord, safe: ReturnType<typeof redactNetworkEvidence>): Record<string, unknown> {
  const content = safe.response.content;
  if (content === null) {
    return {
      size: record.dataLength > 0 ? record.dataLength : encodedSize(record),
      mimeType: responseFor(record).mimeType,
      _orbMeasuredLimit: null,
      _orbOmission: { reason: "unavailable", limitBytes: null },
      _orbCollectionLimit: collectionLimit(record),
    };
  }
  return {
    size: record.dataLength > 0 ? record.dataLength : encodedSize(record),
    mimeType: responseFor(record).mimeType,
    ...(content.text === null ? {} : { text: content.text }),
    ...(content.encoding === null ? {} : { encoding: content.encoding }),
    _orbMeasuredLimit: content._orbMeasuredLimit,
    _orbOmission: content.omission,
    _orbCollectionLimit: collectionLimit(record),
  };
}

function requestBodySize(safe: ReturnType<typeof redactNetworkEvidence>): number {
  return safe.request.postData === null ? -1 : (safe.request.postData._orbMeasuredLimit.inputBytes ?? -1);
}

function requestPostData(record: BrowserNetworkRecord, safe: ReturnType<typeof redactNetworkEvidence>): Record<string, unknown> {
  if (safe.request.postData === null) {
    return {};
  }
  const truncatedAt = record.requestBody?.truncatedAt;
  return {
    postData: {
      ...safe.request.postData,
      _orbCollectionLimit: truncatedAt === null || truncatedAt === undefined ? null : { reason: "truncated", limitBytes: truncatedAt },
    },
  };
}

function entry(record: BrowserNetworkRecord): Record<string, unknown> {
  const safe = redactNetworkEvidence(rawEvidence(record));
  const response = responseFor(record);
  const responseStatus = record.responseExtra === null ? response.status : record.responseExtra.statusCode;
  const requestHeaders = safe.request.headers;
  const responseHeaders = safe.response.headers;
  const location = responseHeaders.find((header) => header.name.toLowerCase() === "location")?.value ?? "";
  const totalMs = Math.max(0, (endTimestamp(record) - record.startedMonotonicTime) * MS_PER_SECOND);
  const encoded = encodedSize(record);
  return {
    pageref: `page-c${record.contextIndex}-p${record.pageIndex}`,
    startedDateTime: new Date(record.startedWallTime * MS_PER_SECOND).toISOString(),
    time: totalMs,
    request: {
      method: record.request.method,
      url: safe.url,
      httpVersion: response.protocol,
      headers: requestHeaders,
      queryString: safe.query,
      cookies: safe.request.cookies,
      headersSize: headerSize(record.requestExtra?.headersText),
      bodySize: requestBodySize(safe),
      ...requestPostData(record, safe),
    },
    response: {
      status: responseStatus,
      statusText: response.statusText,
      httpVersion: response.protocol,
      headers: responseHeaders,
      cookies: safe.response.cookies,
      content: responseContent(record, safe),
      redirectURL: location === "" ? "" : safeUrl(location, safe.url),
      headersSize: headerSize(record.responseExtra?.headersText),
      bodySize: encoded >= 0 ? encoded : -1,
      _fromDiskCache: response.fromDiskCache,
      _fromServiceWorker: response.fromServiceWorker,
      _fromPrefetchCache: response.fromPrefetchCache,
      _protocol: response.protocol,
      _connectionId: response.connectionId,
      _remoteIPAddress: response.remoteIPAddress,
      _remotePort: response.remotePort,
      _securityState: response.securityState,
      _securityDetails: response.securityDetails,
    },
    cache: {},
    timings: timings(record),
    serverIPAddress: response.remoteIPAddress,
    connection: String(response.connectionId),
    _orb: {
      requestId: record.requestId,
      generation: record.generation,
      contextIndex: record.contextIndex,
      pageIndex: record.pageIndex,
      evidenceWindow: record.evidenceWindow,
      resourceType: record.resourceType,
      documentUrl: safeUrl(record.documentUrl),
      initiatorType: record.initiatorType,
      failure: record.failed,
      redirectTo: record.redirectTo === null ? null : safeUrl(record.redirectTo),
      measuredLimit: safe._orbMeasuredLimit,
    },
  };
}

interface NetworkPageOwner {
  readonly contexts: readonly { readonly pages: readonly Page[] }[];
}

function uniquePages(session: NetworkPageOwner): readonly Page[] {
  return [...new Set(session.contexts.flatMap((context) => context.pages))];
}

export function assertCompleteNetworkHar(value: unknown): asserts value is { readonly log: { readonly entries: readonly unknown[] } } {
  const log = field(value, "log");
  const entries = field(log, "entries");
  const pages = field(log, "pages");
  if (text(log, "version") !== "1.2" || typeof field(log, "creator") !== "object" || !Array.isArray(pages) || !Array.isArray(entries) || entries.length === 0) {
    throw new Error("INSTRUMENT ERROR: CDP HAR population is empty; request summary fallback is forbidden");
  }
  if (!browserEvidenceRetentionBatchSchema.safeParse(field(log, "_orbRetention")).success) {
    throw new Error("INSTRUMENT ERROR: CDP HAR has no valid browser retention receipt");
  }
  const pageIds = new Set(pages.map((page) => text(page, "id")).filter((id) => id !== ""));
  for (const candidate of entries) {
    if (!completeEntry(candidate, pageIds)) {
      throw new Error("INSTRUMENT ERROR: refused incomplete shallow HAR entry; CDP headers/timings/request identity are required");
    }
  }
}

function finiteFields(value: unknown, keys: readonly string[]): boolean {
  return keys.every((key) => typeof field(value, key) === "number" && Number.isFinite(field(value, key)));
}

function stringFields(value: unknown, keys: readonly string[]): boolean {
  return keys.every((key) => typeof field(value, key) === "string");
}

function ownFields(value: unknown, keys: readonly string[]): boolean {
  return typeof value === "object" && value !== null && keys.every((key) => Object.hasOwn(value, key));
}

function completeEntry(candidate: unknown, pageIds: ReadonlySet<string>): boolean {
  const request = field(candidate, "request");
  const response = field(candidate, "response");
  const content = field(response, "content");
  const timing = field(candidate, "timings");
  const orb = field(candidate, "_orb");
  const pageref = text(candidate, "pageref");
  const started = text(candidate, "startedDateTime");
  const requestArrays = ["headers", "queryString", "cookies"].every((key) => Array.isArray(field(request, key)));
  const responseArrays = ["headers", "cookies"].every((key) => Array.isArray(field(response, key)));
  const requestCore = stringFields(request, ["method", "url", "httpVersion"]) && requestArrays && finiteFields(request, ["headersSize", "bodySize"]);
  const responseCore =
    stringFields(response, ["statusText", "httpVersion", "redirectURL"]) &&
    responseArrays &&
    finiteFields(response, ["status", "headersSize", "bodySize"]) &&
    typeof content === "object" &&
    content !== null &&
    stringFields(content, ["mimeType"]) &&
    finiteFields(content, ["size"]) &&
    ownFields(content, ["_orbMeasuredLimit", "_orbOmission", "_orbCollectionLimit"]);
  const timingCore = finiteFields(timing, ["blocked", "dns", "connect", "ssl", "send", "wait", "receive"]);
  const identityCore =
    text(orb, "requestId") !== "" &&
    finiteFields(orb, ["generation", "contextIndex", "pageIndex", "evidenceWindow"]) &&
    ownFields(orb, ["failure", "measuredLimit", "redirectTo"]);
  return (
    pageref !== "" &&
    pageIds.has(pageref) &&
    started !== "" &&
    !Number.isNaN(Date.parse(started)) &&
    finiteFields(candidate, ["time"]) &&
    requestCore &&
    responseCore &&
    typeof field(candidate, "cache") === "object" &&
    timingCore &&
    identityCore
  );
}

export async function buildNetworkHar(session: NetworkPageOwner): Promise<Record<string, unknown>> {
  const pages = uniquePages(session);
  const records = await networkRecordsForPages(pages);
  const retention = retentionBatch(networkRetentionForPages(pages));
  const entries = records.map(entry);
  const pageStarts = new Map<string, number>();
  for (const record of records) {
    const id = `page-c${record.contextIndex}-p${record.pageIndex}`;
    pageStarts.set(id, Math.min(pageStarts.get(id) ?? record.startedWallTime, record.startedWallTime));
  }
  const value = {
    log: {
      version: "1.2",
      creator: { name: "orbweaver-snap-cdp", version: "1" },
      _orbRetention: retention,
      pages: [...pageStarts].map(([id, started]) => ({ id, startedDateTime: new Date(started * MS_PER_SECOND).toISOString(), title: id, pageTimings: {} })),
      entries,
    },
  };
  assertCompleteNetworkHar(value);
  return value;
}

export async function writeNetworkHar(session: NetworkPageOwner, path: string): Promise<NetworkHarWriteReceipt> {
  const har = await buildNetworkHar(session);
  await writeFile(path, `${JSON.stringify(har, null, 2)}\n`);
  return networkHarReceipt(har);
}
