import type { CLSMetric } from "web-vitals/attribution";

type EntryBase = Pick<PerformanceEntry, "entryType" | "startTime" | "duration">;
type Rect = Pick<DOMRectReadOnly, "x" | "y" | "width" | "height">;
interface TaskAttributionEntry extends PerformanceEntry {
  readonly containerType: string;
  readonly containerSrc: string;
  readonly containerId: string;
  readonly containerName: string;
}

// The Long Tasks API is absent from the native DOM declarations.
interface LongTaskEntry extends PerformanceEntry {
  readonly attribution: readonly TaskAttributionEntry[];
}

type Script = Pick<
  PerformanceScriptTiming,
  | "startTime"
  | "duration"
  | "executionStart"
  | "invokerType"
  | "windowAttribution"
  | "sourceCharPosition"
  | "pauseDuration"
  | "forcedStyleAndLayoutDuration"
  | "invoker"
  | "sourceFunctionName"
> & { readonly source: string };

export type SerializedPerformanceEntry = EntryBase &
  (
    | {
        readonly kind: "layout-shift";
        readonly value: number;
        readonly hadRecentInput: boolean;
        readonly sources: readonly { readonly target: string; readonly previousRect: Rect; readonly currentRect: Rect }[];
      }
    | {
        readonly kind: "event";
        readonly event: string;
        readonly target: string;
        readonly interactionId: number;
        readonly processingStart: number;
        readonly processingEnd: number;
        readonly cancelable: boolean;
      }
    | { readonly kind: "largest-contentful-paint"; readonly target: string; readonly renderTime: number; readonly loadTime: number; readonly size: number }
    | {
        readonly kind: "long-animation-frame";
        readonly renderStart: number;
        readonly styleAndLayoutStart: number;
        readonly blockingDuration: number;
        readonly firstUIEventTimestamp: number;
        readonly scripts: readonly Script[];
      }
    | {
        readonly kind: "navigation";
        readonly navigationType: string;
        readonly responseStart: number;
        readonly responseEnd: number;
        readonly domInteractive: number;
        readonly domContentLoadedEventEnd: number;
        readonly loadEventEnd: number;
      }
    | {
        readonly kind: "resource";
        readonly initiatorType: string;
        readonly responseStart: number;
        readonly responseEnd: number;
        readonly transferSize: number;
        readonly encodedBodySize: number;
        readonly decodedBodySize: number;
      }
    | {
        readonly kind: "longtask";
        readonly attribution: readonly {
          readonly containerType: string;
          readonly hasContainerId: boolean;
          readonly hasContainerName: boolean;
          readonly hasContainerSource: boolean;
        }[];
      }
    | { readonly kind: "other" }
  );

/** A structural path identifies the actual element without copying owner text, attribute values, or resource URLs. */
export function diagnosticTarget(node: Node | null): string {
  let element = node instanceof Element ? node : node?.parentElement;
  if (element === null || element === undefined) {
    return "unavailable";
  }
  const path: string[] = [];
  while (element !== null) {
    const tag = element.tagName.toLowerCase();
    const siblings = element.parentElement?.children;
    const position =
      siblings === undefined
        ? 1
        : Array.from(siblings)
            .filter((sibling) => sibling.tagName.toLowerCase() === tag)
            .indexOf(element) + 1;
    path.unshift(`${tag}:nth-of-type(${String(position)})`);
    const root = element.getRootNode();
    if (element.parentElement === null && root instanceof ShadowRoot) {
      path.unshift(`${diagnosticTarget(root.host)} >>>`);
    }
    element = element.parentElement;
  }
  return path.join(" > ").replace(" >>> > ", " >>> ");
}

function rect({ x, y, width, height }: DOMRectReadOnly): Rect {
  return { x, y, width, height };
}

function scriptTiming(entry: PerformanceScriptTiming): Script {
  const {
    startTime,
    duration,
    executionStart,
    invokerType,
    windowAttribution,
    sourceCharPosition,
    pauseDuration,
    forcedStyleAndLayoutDuration,
    invoker,
    sourceFunctionName,
  } = entry;
  return {
    startTime,
    duration,
    executionStart,
    invokerType,
    windowAttribution,
    sourceCharPosition,
    pauseDuration,
    forcedStyleAndLayoutDuration,
    invoker,
    sourceFunctionName,
    source: diagnosticSource(entry.sourceURL),
  };
}

function diagnosticSource(source: string): string {
  if (source === "") {
    return "unavailable";
  }
  const url = new URL(source, location.href);
  return ["http:", "https:", "file:"].includes(url.protocol) ? `${url.protocol}//${url.host}${url.pathname}` : url.protocol;
}

/** Copy native entry fields explicitly; native JSON and DOM-node serialization lose attribution. */
export function serializePerformanceEntry(entry: PerformanceEntry): SerializedPerformanceEntry {
  const base = { entryType: entry.entryType, startTime: entry.startTime, duration: entry.duration };
  switch (entry.entryType) {
    case "layout-shift": {
      const shift = entry as CLSMetric["entries"][number];
      return {
        ...base,
        kind: "layout-shift",
        value: shift.value,
        hadRecentInput: shift.hadRecentInput,
        sources: shift.sources.map(({ node, previousRect, currentRect }) => ({
          target: diagnosticTarget(node),
          previousRect: rect(previousRect),
          currentRect: rect(currentRect),
        })),
      };
    }
    case "event": {
      const event = entry as PerformanceEventTiming;
      return {
        ...base,
        kind: "event",
        event: event.name,
        target: diagnosticTarget(event.target),
        interactionId: event.interactionId,
        processingStart: event.processingStart,
        processingEnd: event.processingEnd,
        cancelable: event.cancelable,
      };
    }
    case "largest-contentful-paint": {
      const paint = entry as LargestContentfulPaint;
      return {
        ...base,
        kind: "largest-contentful-paint",
        target: diagnosticTarget(paint.element),
        renderTime: paint.renderTime,
        loadTime: paint.loadTime,
        size: paint.size,
      };
    }
    case "long-animation-frame": {
      const frame = entry as PerformanceLongAnimationFrameTiming;
      return {
        ...base,
        kind: "long-animation-frame",
        renderStart: frame.renderStart,
        styleAndLayoutStart: frame.styleAndLayoutStart,
        blockingDuration: frame.blockingDuration,
        firstUIEventTimestamp: frame.firstUIEventTimestamp,
        scripts: frame.scripts.map(scriptTiming),
      };
    }
    case "navigation": {
      const navigation = entry as PerformanceNavigationTiming;
      return {
        ...base,
        kind: "navigation",
        navigationType: navigation.type,
        responseStart: navigation.responseStart,
        responseEnd: navigation.responseEnd,
        domInteractive: navigation.domInteractive,
        domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
        loadEventEnd: navigation.loadEventEnd,
      };
    }
    case "resource": {
      const resource = entry as PerformanceResourceTiming;
      return {
        ...base,
        kind: "resource",
        initiatorType: resource.initiatorType,
        responseStart: resource.responseStart,
        responseEnd: resource.responseEnd,
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize,
        decodedBodySize: resource.decodedBodySize,
      };
    }
    case "longtask": {
      const task = entry as LongTaskEntry;
      return {
        ...base,
        kind: "longtask",
        attribution: task.attribution.map(({ containerType, containerId, containerName, containerSrc }) => ({
          containerType,
          hasContainerId: containerId !== "",
          hasContainerName: containerName !== "",
          hasContainerSource: containerSrc !== "",
        })),
      };
    }
    default:
      return { ...base, kind: "other" };
  }
}

/** Keep the serialized browser functions together so the Node-side initializer needs no DOM runtime. */
export function performanceEntrySource(): string {
  return [diagnosticTarget, rect, diagnosticSource, scriptTiming, serializePerformanceEntry].map((fn) => fn.toString()).join("\n");
}
