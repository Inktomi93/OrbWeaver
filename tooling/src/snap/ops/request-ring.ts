// The Snap request substrate: one bounded, lifetime-owned ring per ProbeSession, installed before the
// caller can navigate. Run arms are readers of this ring; they never add page listeners.
import { errorMessage } from "@orb/kit/error-message";
import type { BrowserContext, Page, Request, Response } from "@playwright/test";
import type { ProbeContext, ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type {
  RequestBodyOutcome,
  RequestBodyRetentionReason,
  RequestLogEntry,
  RequestRingReceipt,
  RequestSizesEvidence,
  RequestWindowReceipt,
} from "../contract/request-log.ts";
import { matchesRequestFilter, REQUEST_BODY_BUDGET_BYTES, REQUEST_BODY_CAP_BYTES, REQUEST_RING_CAPACITY } from "../lib/request-log.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --requests");

const TIMING_ABSENT = -1;
const JSON_CONTENT_TYPE = "application/json";

export interface RequestRingLimits {
  readonly capacity: number;
  readonly bodyCapBytes: number;
  readonly bodyBudgetBytes: number;
}

export interface RequestRingRead {
  readonly total: number;
  readonly entries: readonly RequestLogEntry[];
  readonly body: RequestBodyOutcome | null;
  readonly window: RequestWindowReceipt;
  readonly ring: RequestRingReceipt;
}

interface RetainedBody {
  readonly kind: "captured";
  readonly contentType: string;
  readonly bytes: number;
  readonly text: string;
}

interface RejectedBody {
  readonly kind: "not-retained";
  readonly reason: RequestBodyRetentionReason;
  readonly contentType: string | null;
  readonly bytes: number | null;
}

type StoredBody = RetainedBody | RejectedBody;

interface MutableEntry {
  readonly request: Request;
  readonly index: number;
  readonly method: string;
  readonly url: string;
  readonly resourceType: string;
  status: number | null;
  failed: string | null;
  sizes: RequestSizesEvidence | null;
  durationMs: number | null;
  body: StoredBody | null;
  sizesWork: Promise<void> | null;
  bodyWork: Promise<void> | null;
}

const DEFAULT_LIMITS: RequestRingLimits = {
  capacity: REQUEST_RING_CAPACITY,
  bodyCapBytes: REQUEST_BODY_CAP_BYTES,
  bodyBudgetBytes: REQUEST_BODY_BUDGET_BYTES,
};

function contentTypeOf(response: Response): string | null {
  const raw = response.headers()["content-type"];
  return raw === undefined ? null : (raw.split(";", 1)[0]?.trim().toLowerCase() ?? null);
}

function publicEntry(entry: MutableEntry): RequestLogEntry {
  return {
    index: entry.index,
    method: entry.method,
    url: entry.url,
    resourceType: entry.resourceType,
    status: entry.status,
    failed: entry.failed,
    sizes: entry.sizes,
    durationMs: entry.durationMs,
  };
}

function emptyReasons(): Record<RequestBodyRetentionReason, number> {
  return {
    "ineligible-content-type": 0,
    "over-entry-cap": 0,
    "over-aggregate-budget": 0,
    "evicted-before-read": 0,
    "read-error": 0,
  };
}

export class RequestRing {
  readonly #limits: RequestRingLimits;
  readonly #entries: MutableEntry[] = [];
  readonly #byRequest = new Map<Request, MutableEntry>();
  readonly #pages = new WeakSet<Page>();
  readonly #contexts = new WeakSet<BrowserContext>();
  readonly #notRetained = emptyReasons();
  #nextIndex = 0;
  #checkpoint = 0;
  #evicted = 0;
  #bodyRetainedBytes = 0;
  #bodiesCaptured = 0;
  readonly #bodyFilters = new Map<string, number>();

  constructor(limits: Partial<RequestRingLimits> = {}) {
    this.#limits = { ...DEFAULT_LIMITS, ...limits };
    if (this.#limits.capacity < 1 || this.#limits.bodyCapBytes < 0 || this.#limits.bodyBudgetBytes < 0) {
      throw new Error("request ring limits must be non-negative and capacity must be positive");
    }
  }

  checkpoint(): number {
    return this.#checkpoint;
  }

  markCheckpoint(): number {
    this.#checkpoint = this.#nextIndex;
    return this.#checkpoint;
  }

  beginBodyCapture(filter: string): () => void {
    this.#bodyFilters.set(filter, (this.#bodyFilters.get(filter) ?? 0) + 1);
    let active = true;
    return (): void => {
      if (!active) {
        return;
      }
      active = false;
      const remaining = (this.#bodyFilters.get(filter) ?? 1) - 1;
      if (remaining === 0) {
        this.#bodyFilters.delete(filter);
      } else {
        this.#bodyFilters.set(filter, remaining);
      }
    };
  }

  attachProbeContext(probe: ProbeContext): void {
    this.attachContext(probe.context);
    for (const page of probe.pages) {
      this.attachPage(page);
    }
  }

  attachContext(context: BrowserContext): void {
    if (this.#contexts.has(context)) {
      return;
    }
    this.#contexts.add(context);
    context.on("page", (page) => this.attachPage(page));
    for (const page of context.pages()) {
      this.attachPage(page);
    }
  }

  attachPage(page: Page): void {
    if (this.#pages.has(page)) {
      return;
    }
    this.#pages.add(page);
    page.on("request", (request) => this.#recordRequest(request));
    page.on("response", (response) => this.#queueResponse(response));
    page.on("requestfinished", (request) => this.#recordFinished(request));
    page.on("requestfailed", (request) => this.#recordFailed(request));
  }

  async read(start: number, bodyFilter: string | null): Promise<RequestRingRead> {
    const end = this.#nextIndex;
    const boundedStart = Math.min(Math.max(0, start), end);
    const first = this.#entries.at(0);
    const retainedStart = first === undefined ? end : first.index;
    const entries = this.#entries.filter((entry) => entry.index >= boundedStart && entry.index < end);
    if (bodyFilter !== null) {
      const selectedWork = entries
        .filter((entry) => matchesRequestFilter(entry.url, bodyFilter))
        .flatMap((entry) => [entry.sizesWork, entry.bodyWork].filter((work): work is Promise<void> => work !== null));
      await Promise.all(selectedWork);
    }
    const evicted = Math.max(0, Math.min(end, retainedStart) - boundedStart);
    return {
      total: end - boundedStart,
      entries: entries.map(publicEntry),
      body: bodyFilter === null ? null : this.#bodyOutcome(entries, bodyFilter),
      window: { start: boundedStart, end, retainedStart, evicted },
      ring: this.receipt(),
    };
  }

  receipt(): RequestRingReceipt {
    return {
      capacity: this.#limits.capacity,
      seen: this.#nextIndex,
      retained: this.#entries.length,
      evicted: this.#evicted,
      bodyCapBytes: this.#limits.bodyCapBytes,
      bodyBudgetBytes: this.#limits.bodyBudgetBytes,
      bodyRetainedBytes: this.#bodyRetainedBytes,
      bodiesCaptured: this.#bodiesCaptured,
      bodiesNotRetained: { ...this.#notRetained },
    };
  }

  entries(): Promise<readonly RequestLogEntry[]> {
    return Promise.resolve(this.#entries.map(publicEntry));
  }

  #recordRequest(request: Request): void {
    const entry: MutableEntry = {
      request,
      index: this.#nextIndex,
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      status: null,
      failed: null,
      sizes: null,
      durationMs: null,
      body: null,
      sizesWork: null,
      bodyWork: null,
    };
    this.#nextIndex += 1;
    this.#entries.push(entry);
    this.#byRequest.set(request, entry);
    while (this.#entries.length > this.#limits.capacity) {
      const removed = this.#entries.shift();
      if (removed === undefined) {
        break;
      }
      this.#byRequest.delete(removed.request);
      if (removed.body?.kind === "captured") {
        this.#bodyRetainedBytes -= removed.body.bytes;
      }
      this.#evicted += 1;
    }
  }

  #queueResponse(response: Response): void {
    const entry = this.#byRequest.get(response.request());
    if (entry === undefined) {
      this.#notRetained["evicted-before-read"] += 1;
      return;
    }
    entry.status = response.status();
    entry.sizesWork = this.#recordSizes(entry);
    if (![...this.#bodyFilters.keys()].some((filter) => matchesRequestFilter(entry.url, filter))) {
      return;
    }
    const contentType = contentTypeOf(response);
    if (contentType !== JSON_CONTENT_TYPE) {
      this.#reject(entry, "ineligible-content-type", contentType, null);
      return;
    }
    entry.bodyWork = this.#recordBody(entry, response, contentType);
  }

  async #recordSizes(entry: MutableEntry): Promise<void> {
    if (!this.#byRequest.has(entry.request)) {
      return;
    }
    // @orb-waive caught-failure-ownership(error): sizes=null plus the caught reason on
    // entry.failed are the exported request-row receipt. Ends if either evidence field stops being written.
    try {
      entry.sizes = await entry.request.sizes();
    } catch (error) {
      entry.sizes = null;
      entry.failed ??= `request sizes read failed: ${errorMessage(error)}`;
    }
    if (entry.body?.kind === "not-retained" && entry.body.bytes === null) {
      entry.body = { ...entry.body, bytes: entry.sizes?.responseBodySize ?? null };
    }
  }

  async #recordBody(entry: MutableEntry, response: Response, contentType: string): Promise<void> {
    // @orb-waive caught-failure-ownership(error): #reject persists the explicit read-error
    // receipt and the caught reason is also retained on the request row. Ends if either write disappears.
    try {
      const buffer = await response.body();
      const bytes = buffer.byteLength;
      if (bytes > this.#limits.bodyCapBytes) {
        this.#reject(entry, "over-entry-cap", contentType, bytes);
        return;
      }
      if (this.#bodyRetainedBytes + bytes > this.#limits.bodyBudgetBytes) {
        this.#reject(entry, "over-aggregate-budget", contentType, bytes);
        return;
      }
      if (!this.#byRequest.has(entry.request)) {
        this.#notRetained["evicted-before-read"] += 1;
        return;
      }
      entry.body = { kind: "captured", contentType, bytes, text: buffer.toString("utf8") };
      this.#bodyRetainedBytes += bytes;
      this.#bodiesCaptured += 1;
    } catch (error) {
      this.#reject(entry, "read-error", contentType, null);
      entry.failed ??= `response body read failed: ${errorMessage(error)}`;
    }
  }

  #reject(entry: MutableEntry, reason: RequestBodyRetentionReason, contentType: string | null, bytes: number | null): void {
    entry.body = { kind: "not-retained", reason, contentType, bytes };
    this.#notRetained[reason] += 1;
  }

  #recordFinished(request: Request): void {
    const entry = this.#byRequest.get(request);
    const timing = request.timing();
    if (entry !== undefined && timing.responseEnd > TIMING_ABSENT) {
      entry.durationMs = Math.round(timing.responseEnd);
    }
  }

  #recordFailed(request: Request): void {
    const entry = this.#byRequest.get(request);
    if (entry !== undefined) {
      const failure = request.failure();
      entry.failed = failure === null ? "failed" : failure.errorText;
    }
  }

  #bodyOutcome(entries: readonly MutableEntry[], filter: string): RequestBodyOutcome {
    const entry = entries.findLast((candidate) => matchesRequestFilter(candidate.url, filter));
    if (entry === undefined) {
      return { kind: "no-match", filter };
    }
    if (entry.body === null) {
      return { kind: "error", filter, url: entry.url, reason: entry.failed ?? "no response body was observed" };
    }
    if (entry.body.kind === "captured") {
      return { url: entry.url, ...entry.body };
    }
    return {
      url: entry.url,
      ...entry.body,
      bodyCapBytes: this.#limits.bodyCapBytes,
      bodyBudgetBytes: this.#limits.bodyBudgetBytes,
      bodyRetainedBytes: this.#bodyRetainedBytes,
    };
  }
}

const REQUEST_RINGS = new WeakMap<ProbeSession, RequestRing>();

export function installRequestRing(session: ProbeSession): RequestRing {
  const existing = REQUEST_RINGS.get(session);
  if (existing !== undefined) {
    return existing;
  }
  const ring = new RequestRing();
  for (const context of session.contexts) {
    ring.attachProbeContext(context);
  }
  REQUEST_RINGS.set(session, ring);
  return ring;
}

export function requestRingFor(session: ProbeSession): RequestRing {
  const ring = REQUEST_RINGS.get(session);
  if (ring === undefined) {
    throw new Error("INSTRUMENT ERROR: Snap request ring was not installed before navigation");
  }
  return ring;
}

export function adoptRequestRing(owner: ProbeSession, child: ProbeSession, context: ProbeContext): void {
  const ring = requestRingFor(owner);
  ring.attachProbeContext(context);
  REQUEST_RINGS.set(child, ring);
}
