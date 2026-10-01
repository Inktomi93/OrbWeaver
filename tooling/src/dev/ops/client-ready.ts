import type { Page, Response } from "@playwright/test";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "gh workflow run contributor.yml");

/** @public The contributor workflow's browser settle; mirrored delayed-module tests exercise the real browser. */
export async function awaitDevClientReady(page: Page, url: string, deadline: number): Promise<Response | null> {
  const remaining = (): number => Math.max(1, deadline - Date.now());
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: remaining() });
  if (response !== null && !response.ok()) {
    throw new Error(`client navigation returned HTTP ${String(response.status())}`);
  }
  const marker = page.locator("html[data-app-ready]");
  await marker.waitFor({ state: "attached", timeout: remaining() });
  const readiness = await marker.getAttribute("data-app-ready");
  print(`Client readiness ${JSON.stringify({ readiness })}`);
  if (readiness !== "") {
    // Reloading a degraded document restarts the cold route and can prevent its late reads from settling.
    await page.locator('html[data-app-ready=""]').waitFor({ state: "attached", timeout: remaining() });
    print(`Client readiness ${JSON.stringify({ readiness: "" })}`);
  }
  return response;
}
