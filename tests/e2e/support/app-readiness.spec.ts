import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./chat-room.ts";

test("readiness requires settled reads, not the degraded fallback marker", async ({ page }) => {
  await page.setContent('<html data-app-ready=""><body>Settled</body></html>');
  await waitForAppReady(page);
  await page.locator("html").evaluate((html) => html.setAttribute("data-app-ready", "degraded"));
  await expect(waitForAppReady(page, 100)).rejects.toThrow(/degraded/u);
});

test("a failed boot names the Vite import error rather than only a missing marker", async ({ page }) => {
  await page.setContent("<vite-error-overlay></vite-error-overlay>");
  await page.locator("vite-error-overlay").evaluate((overlay) => {
    const root = overlay.attachShadow({ mode: "open" });
    root.innerHTML = '<span class="message-body">Failed to resolve import ./missing-boot.ts</span>';
  });
  await expect(waitForAppReady(page, 100)).rejects.toThrow(/Failed to resolve import \.\/missing-boot\.ts/u);
});

test("a degraded boot can recover when its actual reads settle", async ({ page }) => {
  await page.setContent('<html data-app-ready="degraded"><body>Waiting for reads</body></html>');
  const ready = waitForAppReady(page, 1000);
  await page.locator("html").evaluate((html) => html.setAttribute("data-app-ready", ""));
  await ready;
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "");
});

test("an auth boundary is named and never mistaken for app readiness", async ({ page }) => {
  await page.setContent("<form><label>Username<input></label><button>Sign in</button></form>");
  await expect(waitForAppReady(page, 100)).rejects.toThrow(/Sign in/u);
});

test("diagnostic capture failure preserves the original readiness assertion", async ({ page }) => {
  await page.setContent('<html data-app-ready=""><body>Settled</body></html>');
  await waitForAppReady(page);
  await page.close();
  await expect(waitForAppReady(page, 100)).rejects.toMatchObject({
    message: expect.stringContaining("diagnostic capture failed"),
    cause: { message: expect.stringContaining("toHaveAttribute") },
  });
});
