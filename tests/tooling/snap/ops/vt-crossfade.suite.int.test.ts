// The vt-crossfade channel of `--motion-goto`: a view transition started inside the window is sampled per frame
// and judged. The planted defect is the old snapshot's shorter fade without a held end value, so it returns to
// full opacity while the new one is still fading in. Both pages run under snap's own `--cpu-throttle`.

import { createServer } from "node:http";
import { expect, test } from "@orb/testkit/tooling";
import type { Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import { judgeCrossfade } from "../../../../tooling/src/snap/lib/vt-crossfade.ts";
import { runMotionWindow } from "../../../../tooling/src/snap/ops/arms/motion-nav.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { applyLoadEmulation } from "../../../../tooling/src/snap/ops/session.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { listeningAddress } from "../../_server-address.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(120_000);
const WINDOW_MS = 1200;
const OLD_FADE_MS = 150;
const NEW_FADE_MS = 450;
const HIGH_LOAD = ["--cpu-throttle", "6"] as const;

/** The app's capture shape: the root is not captured, one named pane is, and `nav.section` swaps it inside a
 *  view transition. `fill` is the old snapshot's fill mode, the only difference between the two pages. */
function app(fill: "both" | "none"): string {
  return `<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8">
<style>
:root{view-transition-name:none}
#pane{view-transition-name:pane;width:300px;height:200px;background:#369}
#pane.on{background:#c63}
::view-transition-old(pane){animation-duration:${String(OLD_FADE_MS)}ms;animation-fill-mode:${fill}}
::view-transition-new(pane){animation-duration:${String(NEW_FADE_MS)}ms;animation-fill-mode:both}
</style>
<script>
globalThis.__orb={
  motion:()=>({loafs:[],cls:0,virtualizedCls:0,nonVirtualizedCls:0,observedCls:0,
    observedVirtualizedCls:0,observedNonVirtualizedCls:0,worstBlocking:0,worstShift:0}),
  animations:()=>[], flags:()=>[], resetEvidence:()=>{}, motionFlaggersSettled:()=>true,
  setMotionAuditDropTrackingPaused:()=>{}, consoleErrors:()=>({records:[],dropped:0,cap:128}),
  nav:{section:async()=>{document.startViewTransition(()=>document.getElementById("pane").classList.add("on"));return {ok:true};}}
};
</script></head><body><div id="pane"></div></body></html>`;
}

async function measureUnderLoad(fill: "both" | "none"): Promise<Awaited<ReturnType<typeof runMotionWindow>>> {
  const html = app(fill);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page: Page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto(`http://127.0.0.1:${String(listeningAddress(server).port)}/`);
    const applied = await applyLoadEmulation({ contexts: [{ context: page.context() }] }, parseSnapArgs(["/", ...HIGH_LOAD]));
    expect(applied.cpuRate).toBe(Number(HIGH_LOAD[1]));
    return await runMotionWindow(page, await page.context().newCDPSession(page), { selector: null, goto: "chats", windowMs: WINDOW_MS }, null);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("an old snapshot that returns to full opacity mid-fade fails vt-crossfade under load; a held fade passes", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const flicker = await measureUnderLoad("none");
  const clean = await measureUnderLoad("both");

  // The positive control: the clean fade was sampled and judged, so its pass is not an empty window.
  const cleanJudgement = judgeCrossfade(clean.crossfade);
  expect(clean.crossfade.transitions.map((transition) => transition.outcome)).toEqual(["finished"]);
  expect(cleanJudgement).toEqual({ verdict: "pass", problems: [] });

  const judgement = judgeCrossfade(flicker.crossfade);
  expect(judgement.verdict).toBe("fail");
  expect(judgement.problems).toContainEqual(
    expect.objectContaining({ metric: "vt-crossfade-opacity-return", subject: "::view-transition-old(pane)", kind: "failure" }),
  );
  expect(judgement.problems).toContainEqual(expect.objectContaining({ metric: "vt-crossfade-end-state", subject: "::view-transition-old(pane)" }));
  // The new snapshot faded in cleanly on both pages, so the channel names only the snapshot that flickered.
  expect(judgement.problems.map((row) => row.subject)).not.toContain("::view-transition-new(pane)");
});
