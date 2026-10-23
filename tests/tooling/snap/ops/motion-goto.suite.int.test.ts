// tooling/snap/ops/arms/motion `--motion-goto` — the trace opens BEFORE the navigation, so the route's own fade is in
// the window. The old selector-less form runs the reach actions first and resets the in-page evidence, so a fade
// that a `--goto` started has finished or been discarded by the time the window opens: that is the control here.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@orb/testkit/tooling";
import { chromium } from "@playwright/test";
import { runNav } from "../../../../tooling/src/floor/instrument/nav.ts";
import { runAudit } from "../../../../tooling/src/motion-audit/ops/trace.ts";
import { runMotionWindow } from "../../../../tooling/src/snap/ops/arms/motion-nav.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(120_000);
const FADE_MS = 700;
const WINDOW_MS = 1200;
const MIN_FADE_FRAMES = 5;

// The app bridge the audit reads, with a section switch (`nav.goto`) that starts a compositor fade.
const APP = `<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8">
<style>#panel{width:300px;height:200px;background:#369;opacity:0.1;transition:opacity ${FADE_MS}ms linear;will-change:opacity}#panel.on{opacity:1}</style>
<script>
globalThis.__orb={
  motion:()=>({loafs:[],cls:0,virtualizedCls:0,nonVirtualizedCls:0,observedCls:0,
    observedVirtualizedCls:0,observedNonVirtualizedCls:0,worstBlocking:0,worstShift:0}),
  animations:()=>[], flags:()=>[], resetEvidence:()=>{}, motionFlaggersSettled:()=>true,
  setMotionAuditDropTrackingPaused:()=>{}, consoleErrors:()=>({records:[],dropped:0,cap:128}),
  nav:{section:async()=>{document.getElementById("panel").classList.add("on");return {ok:true};}}
};
</script></head><body><div id="panel"></div></body></html>`;

async function withApp<T>(
  run: (page: import("@playwright/test").Page, cdp: Awaited<ReturnType<import("@playwright/test").BrowserContext["newCDPSession"]>>) => Promise<T>,
): Promise<T> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(APP);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`http://127.0.0.1:${String(address.port)}/`);
    return await run(page, await page.context().newCDPSession(page));
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("a goto run inside the trace captures the fade; the same goto run before the window leaves it nearly empty", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  // The arm's own window runner, given the goto target the way `--motion-goto` does.
  const inside = await withApp((page, cdp) => runMotionWindow(page, cdp, { selector: null, goto: "chats", windowMs: WINDOW_MS }, null));
  // CONTROL: the old selector-less shape. The fade is over before the window opens; one stray idle frame is noise.
  const before = await withApp(async (page, cdp) => {
    await runNav(page, "goto", "chats");
    await page.waitForFunction('getComputedStyle(document.getElementById("panel")).opacity === "1"');
    return await runAudit(page, cdp, { selector: null, windowMs: WINDOW_MS }, null);
  });
  expect(inside.measuredInput).toBe(true);
  expect(inside.stepFailed).toBe(false);
  expect(before.measuredInput).toBe(false);
  expect(inside.frames.raw.total).toBeGreaterThan(MIN_FADE_FRAMES);
  expect(before.frames.raw.total).toBeLessThan(inside.frames.raw.total / 5);
});

test("--motion-goto is one --motion window, refuses --filmstrip and --matrix, and queues the goto target", () => {
  const parsed = parseSnapArgs(["/", "--motion-goto", "presets"]);
  expect(parsed.errors).toEqual([]);
  expect(parsed.motion).toBe(true);
  expect(parsed.actions).toContainEqual({ type: "step", action: { kind: "motion-click", selector: null, goto: "presets", page: 0 } });
  expect(parseSnapArgs(["/", "--motion-goto", "presets", "--filmstrip"]).errors).not.toEqual([]);
  expect(parseSnapArgs(["/", "--motion-goto", "presets", "--motion"]).errors).not.toEqual([]);
  expect(parseSnapArgs(["/", "--isolated", "--matrix", "--motion-goto", "presets"]).errors).not.toEqual([]);
});
