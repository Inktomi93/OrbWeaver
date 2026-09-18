// The one page-scoped CDP capture transaction for Snap's heap arm. Cleanup failures stay coupled to the
// primary capture failure, and detaching the CDP transport never closes the owning BrowserContext/page.
import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import type { CDPSession, Page } from "@playwright/test";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { HeapBrowserIdentity, HeapTargetIdentity } from "../contract/heap.ts";
import { heapBrowserContextIdSchema, heapTargetIdSchema } from "../contract/heap.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --heap <label>");

export interface CapturedRawHeapIdentity {
  readonly browser: HeapBrowserIdentity;
  readonly target: Omit<HeapTargetIdentity, "contextIndex" | "pageIndex">;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`HEAP CAPTURE REFUSED: CDP ${label} was absent`);
  }
  return value;
}

function combineCaptureFailures(primary: unknown | null, cleanup: readonly unknown[]): void {
  const failures = [...(primary === null ? [] : [primary]), ...cleanup];
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, "heap capture and cleanup both failed");
  }
}

export async function captureRawHeap(page: Page, path: string): Promise<CapturedRawHeapIdentity> {
  let cdp: CDPSession | null = null;
  let primary: unknown | null = null;
  const cleanup: unknown[] = [];
  const stream = createWriteStream(path, { flags: "wx" });
  const completed = finished(stream);
  let browser: HeapBrowserIdentity | null = null;
  let target: CapturedRawHeapIdentity["target"] | null = null;
  const onChunk = (event: { readonly chunk?: unknown }): void => {
    if (typeof event.chunk === "string") {
      stream.write(event.chunk);
    }
  };
  // The three cleanup catches in the finally block bind DISTINCT names on purpose: a waiver binds by
  // carrier containment and then by exact token, and this outer try's carrier holds every catch nested
  // inside it, so a second `error` in there would make the marker below over-broad and suppress nothing
  // (tooling/src/verify/lib/caught-failure.ts, "The anchor is the position").
  // @orb-waive caught-failure-ownership(error): the primary capture failure is retained and combineCaptureFailures always rethrows it after cleanup, alone or inside the AggregateError with the cleanup failures. Ends if combineCaptureFailures stops throwing the retained primary.
  try {
    cdp = await page.context().newCDPSession(page);
    const version = await cdp.send("Browser.getVersion");
    const targetResult = await cdp.send("Target.getTargetInfo");
    const targetInfo = targetResult.targetInfo;
    browser = {
      product: stringField(version.product, "Browser.getVersion.product"),
      protocolVersion: stringField(version.protocolVersion, "Browser.getVersion.protocolVersion"),
      revision: stringField(version.revision, "Browser.getVersion.revision"),
      userAgent: stringField(version.userAgent, "Browser.getVersion.userAgent"),
      jsVersion: stringField(version.jsVersion, "Browser.getVersion.jsVersion"),
    };
    target = {
      targetId: heapTargetIdSchema.parse(stringField(targetInfo.targetId, "Target.getTargetInfo.targetId")),
      browserContextId: typeof targetInfo.browserContextId === "string" ? heapBrowserContextIdSchema.parse(targetInfo.browserContextId) : null,
      url: stringField(targetInfo.url, "Target.getTargetInfo.url"),
      title: typeof targetInfo.title === "string" ? targetInfo.title : "",
    };
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  } catch (error) {
    primary = error;
  } finally {
    if (cdp !== null) {
      cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
      // @orb-waive caught-failure-ownership(disableError): disable failure is retained in cleanup and combined after stream settlement. Ends if cleanup stops reaching combineCaptureFailures.
      try {
        await cdp.send("HeapProfiler.disable");
      } catch (disableError) {
        cleanup.push(disableError);
      }
      // @orb-waive caught-failure-ownership(detachError): detach failure is retained in cleanup and combined after stream settlement; the arm never closes the owner context. Ends if cleanup stops reaching combineCaptureFailures.
      try {
        await cdp.detach();
      } catch (detachError) {
        cleanup.push(detachError);
      }
    }
    stream.end();
    // @orb-waive caught-failure-ownership(streamError): stream failure is retained in cleanup and combined with the CDP failures. Ends if cleanup stops reaching combineCaptureFailures.
    try {
      await completed;
    } catch (streamError) {
      cleanup.push(streamError);
    }
  }
  combineCaptureFailures(primary, cleanup);
  if (browser === null || target === null) {
    throw new Error("HEAP CAPTURE REFUSED: capture completed without browser/target identity");
  }
  return { browser, target };
}
