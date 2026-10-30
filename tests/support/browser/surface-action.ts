import type { Page, TestInfo } from "@playwright/test";
import { test } from "@playwright/test";
import { attachNativeFile } from "../node/native-attachments.ts";
import type { SerializedPerformanceEntry } from "./performance-entry.ts";
import { publishSurfaceInventory } from "./surface-inventory.ts";

export interface SurfaceActionWindow {
  readonly timeOrigin: number;
  readonly startTime: number;
  readonly readyAt: number;
  readonly collectedAt: number;
  readonly duration: number;
  readonly supportedEntryTypes: readonly string[];
  readonly entries: readonly SerializedPerformanceEntry[];
}

/** Attach an action's browser-time window independently of cumulative document Core Web Vitals. */
export async function surfaceAction(
  info: TestInfo,
  { name, page, action, ready }: { readonly name: string; readonly page: Page; readonly action: () => Promise<void>; readonly ready: () => Promise<void> },
): Promise<SurfaceActionWindow> {
  return await test.step(`Action: ${name}`, async (step) => {
    const start = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, startTime: performance.now() }));
    let phase = "action";
    try {
      await action();
      phase = "ready";
      await ready();
    } catch (error) {
      try {
        await publishAction(info, name, "failed", `The declared ${phase} phase did not complete; inspect the native failure`);
        const failure = await captureWindow(page, start);
        await attachNativeFile(info, step, `${name}-failed-action-window`, {
          body: JSON.stringify({ phase, error: String(error), window: failure }, null, 2),
          contentType: "application/json",
        });
      } catch (captureError) {
        info.annotations.push({ type: "action-evidence-unavailable", description: `${phase}: ${String(captureError)}` });
      }
      throw error;
    }
    const window = await captureWindow(page, start);
    await attachNativeFile(info, step, `${name}-action-window`, { body: JSON.stringify(window, null, 2), contentType: "application/json" });
    if (window.status !== "same-document") {
      await publishAction(info, name, "failed", "Document crossing or missing instrumentation refused action-window collection");
      throw new Error("Action window crossed a document navigation or lost instrumentation; inspect document metrics and the action-window artifact");
    }
    await publishAction(info, name, "visited", "The declared semantic readiness witness completed");
    return window;
  });
}

async function publishAction(info: TestInfo, name: string, disposition: "visited" | "failed", reason: string): Promise<void> {
  await publishSurfaceInventory(info, {
    name: `Action: ${name}`,
    expected: [{ id: name, kind: "action" }],
    observations: [{ id: name, kind: "action", disposition, reason }],
  });
}

async function captureWindow(
  page: Page,
  start: { readonly timeOrigin: number; readonly startTime: number },
): Promise<
  | (SurfaceActionWindow & { readonly status: "same-document" })
  | { readonly status: "cross-document-or-uninstrumented"; readonly start: typeof start; readonly currentTimeOrigin: number; readonly readyAt: number }
> {
  return await page.evaluate(async (from) => {
    const readyAt = performance.now();
    // Event Timing and LoAF publish after paint; publication does not extend semantic readiness.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const collectedAt = performance.now();
    const store = globalThis.__surfaceVitals;
    if (store === undefined || store.timeOrigin !== from.timeOrigin) {
      return { status: "cross-document-or-uninstrumented" as const, start: from, currentTimeOrigin: performance.timeOrigin, readyAt };
    }
    for (const observer of store.observers) {
      store.entries.push(...observer.takeRecords());
    }
    return {
      status: "same-document" as const,
      ...from,
      readyAt,
      collectedAt,
      duration: readyAt - from.startTime,
      supportedEntryTypes: store.supportedEntryTypes,
      entries: store.entries.filter((entry) => entry.startTime + entry.duration >= from.startTime && entry.startTime <= readyAt).map(store.serializeEntry),
    };
  }, start);
}
