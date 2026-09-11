// Per-page CDP Network capture. Raw protocol events stay memory-only; Snap's HAR serializer is the sole
// disk boundary and redacts them before writing. This shares the diagnostic CDP session and page lifecycle.
import type { CDPSession, Page } from "@playwright/test";
import { exactScope } from "./artifact-scope.ts";
import type { BrowserNetworkRecord, BrowserNetworkRequestExtra, BrowserNetworkResponseExtra, DiagnosticWindow } from "./browser-contract.ts";
import { normalizeBrowserNetworkRequest, normalizeBrowserNetworkRequestExtra, normalizeBrowserNetworkResponseExtra } from "./browser-contract.ts";
import type { BrowserEvidenceRetentionReceipt } from "./browser-evidence-ring.ts";
import { BoundedEvidenceRing, BoundedLatestMap, BROWSER_EVIDENCE_SOURCES } from "./browser-evidence-ring.ts";
import type { NetworkExtraKind } from "./browser-network-extra.ts";
import { PendingNetworkExtras } from "./browser-network-extra.ts";
import { normalizeBrowserNetworkResponse } from "./browser-network-normalize.ts";
import { budget } from "./load-budget.ts";

const MAX_BODY_BYTES = 1_048_576;
const BODY_READ_TIMEOUT_BASE_MS = 5000;
const BODY_READ_TIMEOUT_MS = budget(BODY_READ_TIMEOUT_BASE_MS);
export const BROWSER_NETWORK_COMPLETED_CAP = 8192;
export const BROWSER_NETWORK_PENDING_EXTRA_CAP = 2048;
const TEXT_MIME = /(?:^text\/|json|javascript|xml|x-www-form-urlencoded|graphql)/iu;

export interface BrowserNetworkLimits {
  readonly completed?: number;
  readonly pendingExtra?: number;
  readonly bodyReadTimeoutMs?: number;
}

interface NetworkIdentity {
  readonly contextIndex: number;
  readonly pageIndex: number;
  readonly window: DiagnosticWindow;
}

type MutableNetworkRecord = {
  -readonly [K in keyof BrowserNetworkRecord]: BrowserNetworkRecord[K];
};

interface NetworkController {
  readonly cdp: CDPSession;
  readonly completed: BoundedEvidenceRing<MutableNetworkRecord>;
  readonly identity: NetworkIdentity;
  readonly chains: Map<string, MutableNetworkRecord[]>;
  readonly extras: PendingNetworkExtras;
  readonly bodyFilters: Set<string>;
  readonly pending: Set<Promise<void>>;
  readonly pendingRecords: Set<MutableNetworkRecord>;
  readonly closedRequestIds: BoundedLatestMap<string, true>;
  readonly bodyReadTimeoutMs: number;
}

const CONTROLLERS = new WeakMap<Page, NetworkController>();

function chainFor(controller: NetworkController, requestId: string): MutableNetworkRecord[] {
  const existing = controller.chains.get(requestId);
  if (existing !== undefined) {
    return existing;
  }
  const chain: MutableNetworkRecord[] = [];
  controller.chains.set(requestId, chain);
  return chain;
}

function current(controller: NetworkController, requestId: string): MutableNetworkRecord | null {
  return controller.chains.get(requestId)?.at(-1) ?? null;
}

type NormalizedNetworkExtra = BrowserNetworkRequestExtra | BrowserNetworkResponseExtra;

function assignExtra(controller: NetworkController, requestId: string, kind: NetworkExtraKind, event: NormalizedNetworkExtra): void {
  const target = controller.chains.get(requestId)?.find((record) => record[kind] === null);
  if (target !== undefined) {
    if (kind === "requestExtra") {
      target.requestExtra = event as BrowserNetworkRequestExtra;
    } else {
      target.responseExtra = event as BrowserNetworkResponseExtra;
    }
    return;
  }
  if (controller.closedRequestIds.has(requestId)) {
    return;
  }
  controller.extras.assign({
    requestId,
    kind,
    event,
    scope: exactScope(controller.identity.contextIndex, controller.identity.pageIndex, controller.identity.window.value),
    isActive: (id) => controller.chains.has(id),
  });
}

function takePendingRequestExtra(controller: NetworkController, requestId: string): BrowserNetworkRequestExtra | null {
  return controller.extras.take(requestId, "requestExtra") as BrowserNetworkRequestExtra | null;
}

function takePendingResponseExtra(controller: NetworkController, requestId: string): BrowserNetworkResponseExtra | null {
  return controller.extras.take(requestId, "responseExtra") as BrowserNetworkResponseExtra | null;
}

function matchesBody(controller: NetworkController, record: BrowserNetworkRecord): boolean {
  const url = record.request.url.toLowerCase();
  return [...controller.bodyFilters].some((filter) => url.includes(filter));
}

const BODY_READ_TIMEOUT = Symbol("browser-network-body-read-timeout");

async function boundedBodyRead<T>(read: Promise<T>, timeoutMs: number): Promise<T> {
  const { promise: expired, reject } = Promise.withResolvers<never>();
  const timeout = setTimeout(() => reject(BODY_READ_TIMEOUT), timeoutMs);
  try {
    return await Promise.race([read, expired]);
  } finally {
    clearTimeout(timeout);
  }
}

function responseBodyFailureReason(error: unknown, record: BrowserNetworkRecord): "evicted" | "failed" | "timeout" {
  if (error === BODY_READ_TIMEOUT) {
    return "timeout";
  }
  return record.failed === null ? "evicted" : "failed";
}

async function readSelectedRequestBody(controller: NetworkController, record: MutableNetworkRecord): Promise<void> {
  const hasPostData = record.request.hasPostData || record.request.postData !== null;
  if (!hasPostData || record.requestBody !== null) {
    return;
  }
  const inline = record.request.postData;
  if (inline !== null) {
    record.requestBody = {
      text: inline.slice(0, MAX_BODY_BYTES),
      unavailableReason: null,
      truncatedAt: inline.length > MAX_BODY_BYTES ? MAX_BODY_BYTES : null,
    };
    return;
  }
  // @orb-waive caught-failure-ownership(error): a failed or timed-out CDP request-body read is retained as an explicit unavailableReason and serialized as a HAR omission. Ends if the reason stops reaching the HAR.
  try {
    const result = await boundedBodyRead(controller.cdp.send("Network.getRequestPostData", { requestId: record.requestId }), controller.bodyReadTimeoutMs);
    record.requestBody = {
      text: result.postData.slice(0, MAX_BODY_BYTES),
      unavailableReason: null,
      truncatedAt: result.postData.length > MAX_BODY_BYTES ? MAX_BODY_BYTES : null,
    };
  } catch (error) {
    record.requestBody = { text: null, unavailableReason: error === BODY_READ_TIMEOUT ? "timeout" : "unavailable", truncatedAt: null };
  }
}

async function readSelectedResponseBody(controller: NetworkController, record: MutableNetworkRecord): Promise<void> {
  if (record.responseBody !== null || record.finished === null) {
    return;
  }
  const mimeType = record.response?.mimeType ?? "";
  if (!TEXT_MIME.test(mimeType)) {
    record.responseBody = { text: null, base64Encoded: false, unavailableReason: "mime-not-text", truncatedAt: null };
    return;
  }
  if (record.finished.encodedDataLength > MAX_BODY_BYTES) {
    record.responseBody = { text: null, base64Encoded: false, unavailableReason: "body-too-large", truncatedAt: MAX_BODY_BYTES };
    return;
  }
  // @orb-waive caught-failure-ownership(error): a failed or timed-out CDP response-body read is retained as timeout/evicted/failed and serialized as a HAR omission. Ends if the reason stops reaching the HAR.
  try {
    const result = await boundedBodyRead(controller.cdp.send("Network.getResponseBody", { requestId: record.requestId }), controller.bodyReadTimeoutMs);
    record.responseBody = {
      text: result.body.slice(0, MAX_BODY_BYTES),
      base64Encoded: result.base64Encoded,
      unavailableReason: null,
      truncatedAt: result.body.length > MAX_BODY_BYTES ? MAX_BODY_BYTES : null,
    };
  } catch (error) {
    record.responseBody = { text: null, base64Encoded: false, unavailableReason: responseBodyFailureReason(error, record), truncatedAt: null };
  }
}

async function readSelectedBodies(controller: NetworkController, record: MutableNetworkRecord): Promise<void> {
  if (!matchesBody(controller, record)) {
    return;
  }
  await readSelectedRequestBody(controller, record);
  await readSelectedResponseBody(controller, record);
}

function recordScope(record: BrowserNetworkRecord): ReturnType<typeof exactScope> {
  return exactScope(record.contextIndex, record.pageIndex, record.evidenceWindow);
}

function completeChain(controller: NetworkController, requestId: string): void {
  const chain = controller.chains.get(requestId);
  if (chain === undefined) {
    return;
  }
  controller.chains.delete(requestId);
  controller.extras.discard(requestId);
  const last = chain.at(-1);
  if (last !== undefined) {
    controller.closedRequestIds.set(requestId, true, recordScope(last));
  }
  for (const record of chain) {
    controller.completed.push(record, recordScope(record));
  }
}

function queueBodyRead(controller: NetworkController, record: MutableNetworkRecord, after?: () => void): void {
  controller.pendingRecords.add(record);
  const pending = readSelectedBodies(controller, record);
  controller.pending.add(pending);
  const finish = (): void => {
    controller.pendingRecords.delete(record);
    controller.pending.delete(pending);
    after?.();
    controller.completed.trim();
  };
  // @orb-waive caught-failure-ownership(pending): the original promise remains in controller.pending and networkRecordsForPages awaits it, so rejection still propagates; this continuation only releases retention state on either terminal. Ends if pending stops being awaited or this continuation owns the verdict.
  void pending.then(finish, finish);
}

export async function wirePageNetwork(cdp: CDPSession, page: Page, identity: NetworkIdentity, limits: BrowserNetworkLimits = {}): Promise<void> {
  const pendingRecords = new Set<MutableNetworkRecord>();
  const controller: NetworkController = {
    cdp,
    completed: new BoundedEvidenceRing<MutableNetworkRecord>(limits.completed ?? BROWSER_NETWORK_COMPLETED_CAP, {
      canEvict: (record) => !pendingRecords.has(record),
    }),
    identity,
    chains: new Map(),
    extras: new PendingNetworkExtras(limits.pendingExtra ?? BROWSER_NETWORK_PENDING_EXTRA_CAP),
    bodyFilters: new Set(),
    pending: new Set(),
    pendingRecords,
    closedRequestIds: new BoundedLatestMap<string, true>(limits.completed ?? BROWSER_NETWORK_COMPLETED_CAP),
    bodyReadTimeoutMs: limits.bodyReadTimeoutMs ?? BODY_READ_TIMEOUT_MS,
  };
  cdp.on("Network.requestWillBeSent", (event) => {
    const prior = current(controller, event.requestId);
    if (prior !== null && event.redirectResponse !== undefined) {
      prior.response ??= normalizeBrowserNetworkResponse(event.redirectResponse);
      prior.redirectTo = event.request.url;
      prior.finished ??= { timestamp: event.timestamp, encodedDataLength: event.redirectResponse.encodedDataLength };
    }
    const chain = chainFor(controller, event.requestId);
    const record: MutableNetworkRecord = {
      requestId: event.requestId,
      generation: chain.length,
      contextIndex: identity.contextIndex,
      pageIndex: identity.pageIndex,
      evidenceWindow: identity.window.value,
      startedWallTime: event.wallTime,
      startedMonotonicTime: event.timestamp,
      resourceType: event.type ?? null,
      documentUrl: event.documentURL,
      initiatorType: event.initiator.type,
      request: normalizeBrowserNetworkRequest(event.request),
      requestExtra: takePendingRequestExtra(controller, event.requestId),
      response: null,
      responseExtra: takePendingResponseExtra(controller, event.requestId),
      finished: null,
      failed: null,
      dataLength: 0,
      encodedDataLength: 0,
      redirectTo: null,
      requestBody: null,
      responseBody: null,
    };
    chain.push(record);
  });
  cdp.on("Network.requestWillBeSentExtraInfo", (event) => assignExtra(controller, event.requestId, "requestExtra", normalizeBrowserNetworkRequestExtra(event)));
  cdp.on("Network.responseReceived", (event) => {
    const record = current(controller, event.requestId);
    if (record !== null) {
      record.response = normalizeBrowserNetworkResponse(event.response);
      record.resourceType = event.type;
    }
  });
  cdp.on("Network.responseReceivedExtraInfo", (event) =>
    assignExtra(controller, event.requestId, "responseExtra", normalizeBrowserNetworkResponseExtra(event)),
  );
  cdp.on("Network.dataReceived", (event) => {
    const record = current(controller, event.requestId);
    if (record !== null) {
      record.dataLength += event.dataLength;
      record.encodedDataLength += event.encodedDataLength;
    }
  });
  cdp.on("Network.loadingFinished", (event) => {
    const record = current(controller, event.requestId);
    if (record !== null) {
      record.finished = { timestamp: event.timestamp, encodedDataLength: event.encodedDataLength };
      queueBodyRead(controller, record, () => completeChain(controller, event.requestId));
    }
  });
  cdp.on("Network.loadingFailed", (event) => {
    const record = current(controller, event.requestId);
    if (record !== null) {
      record.failed = {
        timestamp: event.timestamp,
        errorText: event.errorText,
        canceled: event.canceled === true,
        blockedReason: event.blockedReason ?? null,
      };
      record.responseBody = { text: null, base64Encoded: false, unavailableReason: "failed", truncatedAt: null };
      completeChain(controller, event.requestId);
    }
  });
  await cdp.send("Network.enable", { maxPostDataSize: MAX_BODY_BYTES });
  CONTROLLERS.set(page, controller);
}

export function selectNetworkBodies(pages: readonly Page[], filter: string): void {
  const normalized = filter.toLowerCase();
  for (const page of pages) {
    const controller = CONTROLLERS.get(page);
    if (controller === undefined) {
      continue;
    }
    controller.bodyFilters.add(normalized);
    const records = [...controller.completed.values(), ...[...controller.chains.values()].flat()];
    for (const record of records) {
      if (record.finished !== null && matchesBody(controller, record)) {
        queueBodyRead(controller, record);
      }
    }
  }
}

export async function networkRecordsForPages(pages: readonly Page[]): Promise<readonly BrowserNetworkRecord[]> {
  const controllers = pages.flatMap((page) => {
    const controller = CONTROLLERS.get(page);
    return controller === undefined ? [] : [controller];
  });
  await Promise.all(controllers.flatMap((controller) => [...controller.pending]));
  return controllers
    .flatMap((controller) => [...controller.completed.values(), ...[...controller.chains.values()].flat()])
    .sort((left, right) => left.startedMonotonicTime - right.startedMonotonicTime || left.generation - right.generation);
}

export function networkRetentionForPages(pages: readonly Page[]): readonly BrowserEvidenceRetentionReceipt[] {
  return pages.flatMap((page) => {
    const controller = CONTROLLERS.get(page);
    return controller === undefined ? [] : [...controller.completed.receipts(BROWSER_EVIDENCE_SOURCES.network), ...controller.extras.receipts()];
  });
}

export function __networkRetentionStateForTest(page: Page): {
  readonly completed: number;
  readonly active: number;
  readonly chains: number;
  readonly pendingRequestExtra: number;
  readonly pendingResponseExtra: number;
  readonly pendingBodies: number;
} | null {
  const controller = CONTROLLERS.get(page);
  return controller === undefined
    ? null
    : {
        completed: controller.completed.length,
        active: [...controller.chains.values()].reduce((total, chain) => total + chain.length, 0),
        chains: controller.chains.size,
        pendingRequestExtra: controller.extras.state().requestIds,
        pendingResponseExtra: controller.extras.state().responseIds,
        pendingBodies: controller.pending.size,
      };
}

export function __pushNetworkExtraForTest(page: Page, requestId: string, kind: "requestExtra" | "responseExtra"): void {
  const controller = CONTROLLERS.get(page);
  if (controller === undefined) {
    throw new Error("network controller is not installed");
  }
  assignExtra(
    controller,
    requestId,
    kind,
    kind === "requestExtra" ? { headers: [], cookies: [], headersText: null } : { statusCode: 0, headers: [], headersText: null },
  );
}

export function __clearNetworkExtrasForTest(page: Page): void {
  const controller = CONTROLLERS.get(page);
  if (controller === undefined) {
    throw new Error("network controller is not installed");
  }
  controller.extras.clear();
}
