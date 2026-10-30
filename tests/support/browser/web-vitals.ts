import type { Page } from "@playwright/test";
import type { CLSAttribution, FCPAttribution, INPAttribution, LCPAttribution, MetricWithAttribution, TTFBAttribution } from "web-vitals/attribution";
import type { SerializedPerformanceEntry } from "./performance-entry.ts";
import { diagnosticTarget, performanceEntrySource, serializePerformanceEntry } from "./performance-entry.ts";

type DiagnosticFields<T, K extends keyof T> = { readonly [P in K]: T[P] | undefined };

interface MetricSample extends Pick<MetricWithAttribution, "name" | "value" | "rating" | "id" | "navigationType"> {
  readonly delta: number;
  readonly callbackAt: number;
  readonly entries: readonly SerializedPerformanceEntry[];
  readonly attribution:
    | (DiagnosticFields<CLSAttribution, "largestShiftTarget" | "largestShiftTime" | "largestShiftValue" | "loadState"> & {
        readonly largestShiftEntry: SerializedPerformanceEntry | undefined;
      })
    | (DiagnosticFields<
        INPAttribution,
        | "interactionTarget"
        | "interactionTime"
        | "interactionType"
        | "inputDelay"
        | "processingDuration"
        | "presentationDelay"
        | "loadState"
        | "nextPaintTime"
        | "totalScriptDuration"
        | "totalStyleAndLayoutDuration"
        | "totalPaintDuration"
        | "totalUnattributedDuration"
      > & { readonly processedEventEntries: readonly SerializedPerformanceEntry[]; readonly longAnimationFrameEntries: readonly SerializedPerformanceEntry[] })
    | (DiagnosticFields<LCPAttribution, "target" | "timeToFirstByte" | "resourceLoadDelay" | "resourceLoadDuration" | "elementRenderDelay"> & {
        readonly lcpEntry: SerializedPerformanceEntry | undefined;
        readonly resourceEntry: SerializedPerformanceEntry | undefined;
      })
    | DiagnosticFields<FCPAttribution, "timeToFirstByte" | "firstByteToFCP" | "loadState">
    | DiagnosticFields<TTFBAttribution, "waitingDuration" | "cacheDuration" | "dnsDuration" | "connectionDuration" | "requestDuration">;
}

function sample(metric: MetricWithAttribution): MetricSample {
  const common = {
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    callbackAt: performance.now(),
    rating: metric.rating,
    id: metric.id,
    navigationType: metric.navigationType,
    entries: metric.entries.map(serializePerformanceEntry),
  };
  switch (metric.name) {
    case "CLS": {
      const { largestShiftTarget, largestShiftTime, largestShiftValue, loadState, largestShiftEntry } = metric.attribution;
      return {
        ...common,
        attribution: {
          largestShiftTarget,
          largestShiftTime,
          largestShiftValue,
          loadState,
          largestShiftEntry: largestShiftEntry === undefined ? undefined : serializePerformanceEntry(largestShiftEntry),
        },
      };
    }
    case "INP": {
      const {
        interactionTarget,
        interactionTime,
        interactionType,
        inputDelay,
        processingDuration,
        presentationDelay,
        loadState,
        nextPaintTime,
        totalScriptDuration,
        totalStyleAndLayoutDuration,
        totalPaintDuration,
        totalUnattributedDuration,
        processedEventEntries,
        longAnimationFrameEntries,
      } = metric.attribution;
      return {
        ...common,
        attribution: {
          interactionTarget,
          interactionTime,
          interactionType,
          inputDelay,
          processingDuration,
          presentationDelay,
          loadState,
          nextPaintTime,
          totalScriptDuration,
          totalStyleAndLayoutDuration,
          totalPaintDuration,
          totalUnattributedDuration,
          processedEventEntries: processedEventEntries.map(serializePerformanceEntry),
          longAnimationFrameEntries: longAnimationFrameEntries.map(serializePerformanceEntry),
        },
      };
    }
    case "LCP": {
      const { target, timeToFirstByte, resourceLoadDelay, resourceLoadDuration, elementRenderDelay, lcpEntry, lcpResourceEntry } = metric.attribution;
      return {
        ...common,
        attribution: {
          target,
          timeToFirstByte,
          resourceLoadDelay,
          resourceLoadDuration,
          elementRenderDelay,
          lcpEntry: lcpEntry === undefined ? undefined : serializePerformanceEntry(lcpEntry),
          resourceEntry: lcpResourceEntry === undefined ? undefined : serializePerformanceEntry(lcpResourceEntry),
        },
      };
    }
    case "FCP": {
      const { timeToFirstByte, firstByteToFCP, loadState } = metric.attribution;
      return { ...common, attribution: { timeToFirstByte, firstByteToFCP, loadState } };
    }
    case "TTFB": {
      const { waitingDuration, cacheDuration, dnsDuration, connectionDuration, requestDuration } = metric.attribution;
      return { ...common, attribution: { waitingDuration, cacheDuration, dnsDuration, connectionDuration, requestDuration } };
    }
  }
}

interface VitalsStore {
  readonly timeOrigin: number;
  readonly supportedEntryTypes: readonly string[];
  readonly samples: Partial<Record<MetricWithAttribution["name"], ReturnType<typeof sample>>>;
  readonly visibilityAtInit: DocumentVisibilityState;
  readonly entries: PerformanceEntry[];
  readonly observers: PerformanceObserver[];
  readonly pendingReports: Promise<void>[];
  readonly serializeEntry: typeof serializePerformanceEntry;
}

export interface WebVitalsEmission {
  readonly timeOrigin: number;
  readonly visibility: DocumentVisibilityState;
  readonly metric: MetricSample;
}

declare global {
  var webVitals: typeof import("web-vitals/attribution");
  var __surfaceVitals: VitalsStore | undefined;
  var __surfaceVitalsReport: ((emission: WebVitalsEmission) => Promise<void>) | undefined;
}

/** Serialize together with the vendor source before navigation; each document owns its observers. */
export function installWebVitals(): void {
  if (globalThis.top !== globalThis.self || globalThis.__surfaceVitals !== undefined) {
    return;
  }
  const store: VitalsStore = {
    timeOrigin: performance.timeOrigin,
    supportedEntryTypes: PerformanceObserver.supportedEntryTypes,
    samples: {},
    visibilityAtInit: document.visibilityState,
    entries: [],
    observers: [],
    pendingReports: [],
    serializeEntry: serializePerformanceEntry,
  };
  globalThis.__surfaceVitals = store;
  for (const type of ["layout-shift", "event", "longtask", "long-animation-frame"]) {
    if (store.supportedEntryTypes.includes(type)) {
      const observer = new PerformanceObserver((list) => store.entries.push(...list.getEntries()));
      observer.observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) });
      store.observers.push(observer);
    }
  }
  // The callback is serialized with this function, so it cannot close over module imports.
  const record = (metric: MetricWithAttribution): void => {
    const captured = sample(metric);
    store.samples[metric.name] = captured;
    const report = globalThis.__surfaceVitalsReport?.({ timeOrigin: store.timeOrigin, visibility: document.visibilityState, metric: captured });
    if (report !== undefined) {
      store.pendingReports.push(report);
    }
  };
  const options = {
    reportAllChanges: true,
    reportSoftNavs: false,
    generateTarget: diagnosticTarget,
  };
  globalThis.webVitals.onCLS(record, options);
  globalThis.webVitals.onINP(record, { ...options, durationThreshold: 16, includeProcessedEventEntries: true });
  globalThis.webVitals.onLCP(record, { ...options, resourceBufferSize: 50 });
  globalThis.webVitals.onFCP(record, options);
  globalThis.webVitals.onTTFB(record, options);
}

/** Build one initialization script so Playwright cannot reorder vendor loading and observer registration. */
export function webVitalsInitScript(source: string): string {
  // Playwright scopes initialization scripts; the vendor's var export is not a Window property.
  return `${source}\n;globalThis.webVitals = webVitals;\n;(() => { ${performanceEntrySource()}\nconst sample = ${sample.toString()}; (${installWebVitals.toString()})(); })();`;
}

/** Read cumulative page-visit metrics without converting missing callbacks into successful zero values. */
export async function readWebVitals(
  page: Page,
  includesPriorAuditOverhead = false,
): Promise<{
  readonly timeOrigin: number;
  readonly capturedAt: number;
  readonly lifetime: "document";
  readonly supportedEntryTypes: readonly string[];
  readonly visibilityAtInit: DocumentVisibilityState;
  readonly finalization: "provisional";
  readonly includesPriorAuditOverhead: boolean;
  readonly coverage: "top-document";
  readonly iframeMetrics: "unmeasured";
  readonly metrics: readonly { readonly name: string; readonly status: "unsupported" | "unmeasured" | "measured"; readonly metric?: MetricSample }[];
}> {
  return await page.evaluate((priorAuditOverhead) => {
    const store = globalThis.__surfaceVitals;
    if (store === undefined) {
      throw new Error("web-vitals observers were not installed before navigation");
    }
    const entries = [
      ["CLS", "layout-shift"],
      ["INP", "event"],
      ["LCP", "largest-contentful-paint"],
      ["FCP", "paint"],
      ["TTFB", "navigation"],
    ] as const;
    return {
      timeOrigin: store.timeOrigin,
      capturedAt: performance.now(),
      lifetime: "document" as const,
      supportedEntryTypes: store.supportedEntryTypes,
      visibilityAtInit: store.visibilityAtInit,
      finalization: "provisional" as const,
      includesPriorAuditOverhead: priorAuditOverhead,
      coverage: "top-document" as const,
      iframeMetrics: "unmeasured" as const,
      metrics: entries.map(([name, entry]) => {
        if (!store.supportedEntryTypes.includes(entry)) {
          return { name, status: "unsupported" as const };
        }
        const metric = store.samples[name];
        if (metric === undefined) {
          return { name, status: "unmeasured" as const };
        }
        return { name, status: "measured" as const, metric };
      }),
    };
  }, includesPriorAuditOverhead);
}

/** Await binding calls already emitted by the current document without pretending the visible visit has finalized. */
export async function drainWebVitals(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const store = globalThis.__surfaceVitals;
    if (store !== undefined) {
      await Promise.all(store.pendingReports);
    }
  });
}
