#!/usr/bin/env tsx
/**
 * pnpm motion-audit <route> [flags]        (tsx scripts/probes/motion-audit.ts)
 *
 * Smoothness ground-truth harness. Boots headless chromium against the running dev stack
 * (`pnpm stack start` first), throttles the CPU 4× (so the frame budget is meaningful, not
 * masked by dev-machine headroom), drives an interaction window (a --selector click, or just
 * sits on the route while entry animations run), and reads two kinds of signal:
 *
 *   • __orb.motion() / __orb.animations() — the IN-PAGE observers (motion-stats.ts): LoAF ring
 *     (blockingDuration, styleAndLayoutStart), CLS, and any animation that isn't compositor-clean.
 *   • A CDP performance TRACE across the window — the ground-truth "Percent Dropped Frames": the fraction
 *     of PipelineReporter frames with state=STATE_DROPPED && affects_smoothness=true. This is the number
 *     the eye reads as "janky" but no in-page API exposes.
 *
 * HEADLESS CAVEAT (read before trusting a number): a headless chromium has NO real vsync / GPU present
 * loop, so the PRESENTED-frame accounting is only fully trustworthy in a GPU/headful lane. Headless-RELIABLE
 * signals: LoAF blockingDuration, styleAndLayoutStart>0, CLS, and compositor-clean classification — these
 * come from real main-thread work and are honest headless. Dropped-frame % is the DEEP-AUDIT signal: treat
 * it as directional here and confirm a borderline case with `--vnc` (headful) or a GPU runner.
 *
 * PASS/FAIL budget (any breach fails the exit code):
 *   • a LoAF in-window with styleAndLayoutStart>0 (style/layout ran inside the frame — a forced reflow /
 *     non-compositor animation) ;
 *   • worst LoAF blockingDuration > 50ms ;
 *   • CLS > 0.1 ;
 *   • any active animation with compositorClean:false.
 *   (dropped-frame % is reported and fails at >5%, but see the headless caveat — it's advisory here.)
 *
 * USAGE
 *   pnpm stack start
 *   pnpm motion-audit /                                  # sit on the route, audit entry motion
 *   pnpm motion-audit /chats --selector '[data-testid=drawer-toggle]'   # click, then audit the window
 *   pnpm motion-audit / --url http://localhost:5173/x    # override the full URL
 *   Flags: --base <url> · --url <full-url> · --selector <sel> (click to open the window) ·
 *          --window <ms> (interaction/observation window, default 2500) · --viewport WxH · --vnc (headful,
 *          for a trustworthy dropped-frame %) · --no-throttle (skip the 4× CPU throttle)
 */
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { ProbeSession } from "./_kit/browser.ts";
import { buildUrl, DEFAULT_BASE, launchProbeSession, settle } from "./_kit/browser.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport } from "./_kit/flags.ts";
import { print, printResult } from "./_kit/result.ts";

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_WINDOW_MS = 2500;
const NAV_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 10_000;
const STEP_TIMEOUT_MS = 5000;
const MOUNT_SETTLE_MS = 500;
// 4× CPU throttle so a frame budget is real — a dev machine's headroom masks jank that a user's phone won't.
const CPU_THROTTLE_RATE = 4;
// The budget thresholds (documented in the header). ms unless noted.
const BLOCKING_BUDGET_MS = 50;
const CLS_BUDGET = 0.1;
const DROPPED_FRAME_BUDGET_PCT = 5;
const PCT = 100;

type Args = {
  route: string;
  url: string | null;
  base: string;
  selector: string | null;
  windowMs: number;
  viewport: Viewport;
  vnc: boolean;
  throttle: boolean;
};

// One handler per flag (Record dispatch, snap.ts house style) — keeps parseArgs flat under the
// cognitive-complexity cap instead of a long else-if chain.
type FlagHandler = (args: Args, rest: string[]) => void;
const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--url": (a, rest) => {
    a.url = rest.shift() ?? null;
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
  },
  "--selector": (a, rest) => {
    a.selector = rest.shift() ?? null;
  },
  "--window": (a, rest) => {
    a.windowMs = Number(rest.shift() ?? String(DEFAULT_WINDOW_MS)) || DEFAULT_WINDOW_MS;
  },
  "--viewport": (a, rest) => {
    a.viewport = parseViewport(rest.shift() ?? "") ?? a.viewport;
  },
  "--vnc": (a) => {
    a.vnc = true;
  },
  "--no-throttle": (a) => {
    a.throttle = false;
  },
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    url: null,
    base: DEFAULT_BASE,
    selector: null,
    windowMs: DEFAULT_WINDOW_MS,
    viewport: DEFAULT_VIEWPORT,
    vnc: false,
    throttle: true,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    const handler = FLAG_HANDLERS[tok];
    if (handler !== undefined) {
      handler(args, rest);
    } else if (tok.startsWith("--")) {
      print(`UNKNOWN FLAG ${tok} (ignored)`);
    } else {
      args.route = tok;
    }
  }
  return args;
}

// ── The in-page motion snapshot shapes (mirror motion-stats.ts — the probe reads them via __orb) ──
type LoafRecord = {
  readonly startTime: number;
  readonly duration: number;
  readonly blockingDuration: number;
  readonly styleAndLayoutStart: number;
  readonly scripts: ReadonlyArray<{ sourceURL: string; duration: number }>;
};
type MotionSnapshot = {
  readonly loafs: readonly LoafRecord[];
  readonly cls: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
};
type AnimationRecord = {
  readonly target: string;
  readonly properties: readonly string[];
  readonly compositorClean: boolean;
};

async function readMotion(page: Page): Promise<MotionSnapshot | null> {
  return (await page.evaluate("globalThis.__orb ? globalThis.__orb.motion() : null")) as MotionSnapshot | null;
}
async function readAnimations(page: Page): Promise<readonly AnimationRecord[]> {
  return (await page.evaluate("globalThis.__orb ? globalThis.__orb.animations() : []")) as readonly AnimationRecord[];
}

// ── CDP performance trace → Percent Dropped Frames ────────────────────────────────────────────────
// PipelineReporter events carry the frame's lifecycle; the fraction with args.state=STATE_DROPPED
// and args.affects_smoothness=true is the ground-truth "smooth?" number.
type TraceEvent = {
  readonly name?: string;
  readonly args?: {
    readonly state?: string;
    readonly affects_smoothness?: boolean;
  };
};

function droppedFramePct(events: readonly TraceEvent[]): {
  total: number;
  dropped: number;
  pct: number;
} {
  const frames = events.filter((e) => e.name === "PipelineReporter");
  const dropped = frames.filter((e) => e.args?.state === "STATE_DROPPED" && e.args.affects_smoothness === true).length;
  const total = frames.length;
  const pct = total === 0 ? 0 : Number(((dropped / total) * PCT).toFixed(2));
  return { total, dropped, pct };
}

type AuditData = {
  readonly motion: MotionSnapshot | null;
  readonly animations: readonly AnimationRecord[];
  readonly frames: { total: number; dropped: number; pct: number };
  readonly pageErrors: readonly string[];
  readonly stepFailed: boolean;
};

async function runAudit(page: Page, cdp: Awaited<ReturnType<ProbeSession["context"]["newCDPSession"]>>, opts: Args): Promise<AuditData> {
  const traceEvents: TraceEvent[] = [];
  cdp.on("Tracing.dataCollected", (e: { value: TraceEvent[] }) => {
    traceEvents.push(...e.value);
  });
  await cdp.send("Tracing.start", {
    categories: "benchmark,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents",
  });

  let stepFailed = false;
  if (opts.selector !== null) {
    try {
      const loc = page.locator(opts.selector).first();
      await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
      await loc.click({ timeout: STEP_TIMEOUT_MS });
    } catch (e) {
      stepFailed = true;
      print(`STEP FAILED  click ${opts.selector}: ${errorMessage(e)}`);
    }
  }
  // The observation window — entry animations / the clicked transition play out here.
  await settle(page, opts.windowMs);

  await cdp.send("Tracing.end");
  await new Promise<void>((resolve) => {
    cdp.once("Tracing.tracingComplete", () => resolve());
  });

  return {
    motion: await readMotion(page),
    animations: await readAnimations(page),
    frames: droppedFramePct(traceEvents),
    pageErrors: [],
    stepFailed,
  };
}

/** Print the human report + the RESULT line, return the exit code. */
function report(url: string, opts: Args, data: AuditData): number {
  const { motion, animations, frames, pageErrors, stepFailed } = data;
  const worstBlocking = motion === null ? 0 : motion.worstBlocking;
  const cls = motion === null ? 0 : motion.cls;
  const layoutInFrame = (motion === null ? [] : motion.loafs).filter((l) => l.styleAndLayoutStart > 0);
  const dirtyAnimations = animations.filter((a) => !a.compositorClean);

  print(`URL         ${url}`);
  print(`window      ${opts.windowMs}ms · cpu-throttle ${opts.throttle ? `${CPU_THROTTLE_RATE}×` : "off"}`);
  print(`headless    ${opts.vnc ? "no (headful — dropped-frame % trustworthy)" : "yes (dropped-frame % ADVISORY — no real vsync)"}`);
  print(`LoAF        ${motion?.loafs.length ?? 0} in ring · worst blockingDuration ${worstBlocking}ms · ${layoutInFrame.length} with style/layout in-frame`);
  print(`CLS         ${cls}`);
  print(`frames      ${frames.dropped}/${frames.total} dropped-smoothness (${frames.pct}%)`);
  print(`animations  ${animations.length} active · ${dirtyAnimations.length} NOT compositor-clean`);
  for (const a of dirtyAnimations) {
    print(`  ✗ ${a.target}  animates [${a.properties.join(", ")}] — non-compositor prop (jank risk)`);
  }
  for (const l of layoutInFrame) {
    print(`  ✗ LoAF @${l.startTime}ms  blocking ${l.blockingDuration}ms, style/layout in-frame`);
  }
  if (pageErrors.length > 0) {
    print("");
    print("--- page errors ---");
    for (const e of pageErrors) {
      print(e);
    }
  }

  const budgetFails =
    layoutInFrame.length > 0 || worstBlocking > BLOCKING_BUDGET_MS || cls > CLS_BUDGET || dirtyAnimations.length > 0 || frames.pct > DROPPED_FRAME_BUDGET_PCT;
  const pass = !(budgetFails || stepFailed || pageErrors.length > 0);

  printResult("motion-audit", [
    ["verdict", pass ? "PASS" : "FAIL"],
    ["dropped-frames", `${frames.pct}%`],
    ["worst-blocking", `${worstBlocking}ms`],
    ["cls", cls],
    ["loaf-style-in-frame", layoutInFrame.length],
    ["dirty-animations", dirtyAnimations.length],
    ["page-errors", pageErrors.length],
  ]);
  return pass ? 0 : 1;
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const url = opts.url ?? buildUrl(opts.base, opts.route);

  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    colorScheme: null,
    reducedMotion: false, // a motion probe wants the REAL animations
    localStorage: [],
  });
  const { page } = session;
  const cdp = await session.context.newCDPSession(page);

  if (opts.throttle) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
  }

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })
    .catch(() => undefined);
  await settle(page, MOUNT_SETTLE_MS);

  const data = await runAudit(page, cdp, opts);
  const withErrors: AuditData = { ...data, pageErrors: [...session.pageErrors] };
  await session.context.close();
  await session.browser.close();

  return report(url, opts, withErrors);
}

void main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    print(`motion-audit failed: ${errorMessage(err)}`);
    process.exit(1);
  },
);
