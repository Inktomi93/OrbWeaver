// The vt-crossfade channel of `--motion-goto`: a view transition started inside the window is sampled per frame
// and judged. The planted defect is the old snapshot's shorter fade without a held end value, so it returns to
// full opacity while the new one is still fading in. Every page runs under snap's own `--cpu-throttle`.

import { createServer } from "node:http";
import { expect, test } from "@orb/testkit/tooling";
import type { Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import { timingCapability } from "../../../../tooling/src/floor/host/timing-capability.ts";
import { motionExit } from "../../../../tooling/src/snap/lib/motion-verdict.ts";
import { crossfadeGaps, judgeCrossfade } from "../../../../tooling/src/snap/lib/vt-crossfade.ts";
import { runMotionWindow } from "../../../../tooling/src/snap/ops/arms/motion-nav.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { applyLoadEmulation } from "../../../../tooling/src/snap/ops/session.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { listeningAddress } from "../../_server-address.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(120_000);
const WINDOW_MS = 1200;
const SHORT_WINDOW_MS = 400;
const OLD_FADE_MS = 150;
const NEW_FADE_MS = 450;
const LONG_FADE_MS = 4000;
/** Inside both fades, so a second intent lands mid-transition. */
const INTERRUPT_AT_MS = 120;
const HIGH_LOAD = ["--cpu-throttle", "6"] as const;

const SWAP = 'document.getElementById("pane").classList.toggle("on")';
/** How each page's `nav.section` starts its transitions. */
const NAV = {
  single: `document.startViewTransition(()=>${SWAP});`,
  // Two starts in one task: the first is skipped before it animates, and nothing handles its rejection.
  superseded: `document.startViewTransition(()=>${SWAP}); document.startViewTransition(()=>${SWAP});`,
  overlap: `document.startViewTransition(()=>${SWAP}); setTimeout(()=>document.startViewTransition(()=>${SWAP}), ${String(INTERRUPT_AT_MS)});`,
  skip: `const t=document.startViewTransition(()=>${SWAP}); setTimeout(()=>t.skipTransition(), ${String(INTERRUPT_AT_MS)});`,
} as const;

interface PlantedPage {
  readonly fill: "both" | "none";
  readonly nav: keyof typeof NAV;
  readonly newFadeMs?: number;
}

/** The app's capture shape: the root is not captured, one named pane is, and `nav.section` swaps it inside a
 *  view transition. */
function app({ fill, nav, newFadeMs = NEW_FADE_MS }: PlantedPage): string {
  return `<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8">
<style>
:root{view-transition-name:none}
#pane{view-transition-name:pane;width:300px;height:200px;background:#369}
#pane.on{background:#c63}
::view-transition-old(pane){animation-duration:${String(OLD_FADE_MS)}ms;animation-fill-mode:${fill}}
::view-transition-new(pane){animation-duration:${String(newFadeMs)}ms;animation-fill-mode:both}
</style>
<script>
globalThis.__orb={
  motion:()=>({loafs:[],cls:0,virtualizedCls:0,nonVirtualizedCls:0,observedCls:0,
    observedVirtualizedCls:0,observedNonVirtualizedCls:0,worstBlocking:0,worstShift:0}),
  animations:()=>[], flags:()=>[], resetEvidence:()=>{}, motionFlaggersSettled:()=>true,
  setMotionAuditDropTrackingPaused:()=>{}, consoleErrors:()=>({records:[],dropped:0,cap:128}),
  nav:{section:async()=>{${NAV[nav]} return {ok:true};}}
};
</script></head><body><div id="pane"></div></body></html>`;
}

const NATIVE_START = `Object.prototype.hasOwnProperty.call(document, "startViewTransition") === false && String(document.startViewTransition).includes("[native code]")`;

interface Measured {
  readonly window: Awaited<ReturnType<typeof runMotionWindow>>;
  readonly pageErrors: readonly string[];
  readonly nativeAfter: boolean;
}

async function withPlantedPage<T>(planted: PlantedPage, run: (page: Page) => Promise<T>): Promise<T> {
  const html = app(planted);
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
    return await run(page);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function measureUnderLoad(planted: PlantedPage, windowMs = WINDOW_MS): Promise<Measured> {
  return await withPlantedPage(planted, async (page) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const window = await runMotionWindow(page, await page.context().newCDPSession(page), { selector: null, goto: "chats", windowMs }, null);
    return { window, pageErrors, nativeAfter: await page.evaluate<boolean>(NATIVE_START) };
  });
}

test("an old snapshot that returns to full opacity mid-fade fails vt-crossfade under load; a held fade passes", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const flicker = await measureUnderLoad({ fill: "none", nav: "single" });
  const clean = await measureUnderLoad({ fill: "both", nav: "single" });

  // The positive control: the clean fade was sampled and judged, so its pass is not an empty window.
  const cleanJudgement = judgeCrossfade(clean.window.crossfade);
  expect(clean.window.crossfade.transitions.map((transition) => transition.outcome)).toEqual(["finished"]);
  expect(cleanJudgement).toEqual({ verdict: "pass", problems: [] });

  const judgement = judgeCrossfade(flicker.window.crossfade);
  expect(judgement.verdict).toBe("fail");
  expect(judgement.problems).toContainEqual(
    expect.objectContaining({ metric: "vt-crossfade-opacity-return", subject: "::view-transition-old(pane)", kind: "failure" }),
  );
  expect(judgement.problems).toContainEqual(expect.objectContaining({ metric: "vt-crossfade-end-state", subject: "::view-transition-old(pane)" }));
  // The new snapshot faded in cleanly on both pages, so the channel names only the snapshot that flickered.
  expect(judgement.problems.map((row) => row.subject)).not.toContain("::view-transition-new(pane)");
});

test("the window hands the page its native startViewTransition back", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const measured = await measureUnderLoad({ fill: "both", nav: "single" });
  expect(measured.window.crossfade.transitions).toHaveLength(1);
  expect(measured.nativeAfter).toBe(true);
});

test("a superseded transition nobody handles still reaches page errors through the sampled window", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  // The positive control: the page itself raises the rejection with no sampler installed.
  const native = await withPlantedPage({ fill: "both", nav: "superseded" }, async (page) => {
    const raised = page.waitForEvent("pageerror");
    await page.evaluate("globalThis.__orb.nav.section()");
    return (await raised).message;
  });

  const measured = await measureUnderLoad({ fill: "both", nav: "superseded" });
  expect(measured.window.crossfade.transitions.map((transition) => transition.outcome)).toEqual(["skipped", "finished"]);
  expect(measured.pageErrors).toContain(native);
});

test("a transition cut off mid-fade is interrupted, not a failed fade", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const overlap = await measureUnderLoad({ fill: "both", nav: "overlap" });
  expect(overlap.window.crossfade.transitions.map((transition) => transition.outcome)).toEqual(["interrupted", "finished"]);
  // The second transition ran to its end, so the window is judged on it alone.
  expect(judgeCrossfade(overlap.window.crossfade)).toEqual({ verdict: "pass", problems: [] });

  const skipped = await measureUnderLoad({ fill: "both", nav: "skip" });
  expect(skipped.window.crossfade.transitions.map((transition) => transition.outcome)).toEqual(["interrupted"]);
  expect(judgeCrossfade(skipped.window.crossfade).verdict).toBe("unjudged");
});

test("a fade the window could not see to its end refuses the motion run instead of passing", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const measured = await measureUnderLoad({ fill: "both", nav: "single", newFadeMs: LONG_FADE_MS }, SHORT_WINDOW_MS);
  expect(measured.window.crossfade.transitions.map((transition) => transition.outcome)).toEqual(["unfinished"]);
  expect(judgeCrossfade(measured.window.crossfade).verdict).toBe("unjudged");

  const gaps = crossfadeGaps(measured.window.crossfade);
  expect(gaps.map((gap) => gap.evidence)).toEqual(["a judged view-transition crossfade"]);
  expect(motionExit(true, { gaps, pass: true, timing: timingCapability({}), loadSuspect: null }, EXIT.clean)).toBe(EXIT.toolError);
});
