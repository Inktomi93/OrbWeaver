import type { Page, Request } from "@playwright/test";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "gh workflow run contributor.yml");

const MODULE_QUIET_MS = 500;

/** @public The contributor workflow's browser settle; mirrored delayed-module tests exercise the real browser. */
export async function awaitDevClientReady(page: Page, url: string, deadline: number): Promise<void> {
  const marker = page.locator("html[data-app-ready]");
  const remaining = (): number => Math.max(1, deadline - Date.now());
  const pending = new Set<Request>();
  let wake: (() => void) | undefined;
  let quietTimer: NodeJS.Timeout | undefined;
  const rescheduleQuiet = (): void => {
    clearTimeout(quietTimer);
    if (wake !== undefined && pending.size === 0) {
      quietTimer = setTimeout(() => wake?.(), MODULE_QUIET_MS);
    }
  };
  const started = (request: Request): void => {
    if (request.resourceType() === "script" || request.resourceType() === "stylesheet") {
      pending.add(request);
      rescheduleQuiet();
    }
  };
  const finished = (request: Request): void => {
    if (pending.delete(request)) {
      rescheduleQuiet();
    }
  };
  const drainModules = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        wake = undefined;
        clearTimeout(quietTimer);
        reject(new Error("client modules did not finish within the startup deadline"));
      }, remaining());
      wake = (): void => {
        clearTimeout(timeout);
        clearTimeout(quietTimer);
        wake = undefined;
        resolve();
      };
      // Download completion precedes discovery of a module's own imports.
      rescheduleQuiet();
    });
  };
  page.on("request", started);
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  try {
    for (let attempt = 0; Date.now() < deadline; attempt++) {
      // HTML commit precedes cold module evaluation; replacing that document aborts its unfinished bootstrap.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: remaining() });
      await marker.waitFor({ state: "attached", timeout: remaining() });
      const readiness = await marker.getAttribute("data-app-ready");
      print(`Client readiness ${JSON.stringify({ attempt, readiness })}`);
      if (readiness === "") {
        return;
      }
      // Finish cold route imports before replacing a one-shot degraded marker. Subscriptions are not modules.
      await drainModules();
    }
    throw new Error("client did not settle within the cold Vite startup deadline");
  } finally {
    clearTimeout(quietTimer);
    page.off("request", started);
    page.off("requestfinished", finished);
    page.off("requestfailed", finished);
  }
}
