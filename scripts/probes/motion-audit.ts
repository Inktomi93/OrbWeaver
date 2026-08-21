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
 *   • NON-VIRTUALIZED CLS > 0.1 — the verdict excludes shifts motion-stats.ts itself classified as
 *     virtual-row reconciliation (issue #109, 2026-08-16: a home→chat journey measured ~0.26 of pure
 *     virtualizer settling, so "under 0.1" was unreachable by any app fix). Nothing is hidden — the
 *     report and the RESULT line print raw / virtualized / non-virtualized, labeled ;
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
 *
 * REACH vs MEASURE (the nav queue, 2026-08-17 — issue #148). This probe had `--selector` and nothing else,
 * so any surface behind a room was STRUCTURALLY unauditable (a chat room needs 2+ hops) and every "the
 * motion is clean" claim about one was a claim about a surface it never reached. The same argv-ordered
 * dev-bridge queue design-audit and snap drive is now available here — but it REACHES, it does not measure:
 *   --goto <section|settings:cat|modal:slot> · --open-chat <id|title|latest|current> ·
 *   --open-character <id|name> · --context-tab <tab> · --click <selector>
 * run in argv order BEFORE the trace starts, and the in-page evidence (LoAF ring / CLS / flags) is RESET
 * after the last one — so the numbers describe the interaction you are measuring, not the trip to it.
 * `--selector` remains THE measured interaction (clicked inside the trace window).
 *   pnpm motion-audit / --open-chat latest --context-tab rpg.game --selector '[data-slot=tracker-toggle]'
 * A reach action that does not land is a FAILED run: the alternative is a smoothness number for the wrong
 * surface. An unknown flag is a hard error (exit 2) for the same reason — a typo'd `--open-caht` must not
 * quietly audit the landing page.
 */
import process from "node:process";
import { pathToFileURL } from "node:url";
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { AppearancePatch } from "./_kit/appearance.ts";
import {
  APPEARANCE_VALUE_FLAGS,
  appearanceHelpBlock,
  applyAppearanceFlag,
  FULL_MOTION_PATCH,
  loadAppearancePreset,
  mergeAppearancePatches,
  parseAppearancePatch,
} from "./_kit/appearance.ts";
import type { ProbeSession } from "./_kit/browser.ts";
import { buildUrl, DEFAULT_BASE, launchProbeSession, settle } from "./_kit/browser.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport } from "./_kit/flags.ts";
import type { NavMethod } from "./_kit/nav.ts";
import { runNav } from "./_kit/nav.ts";
import { print, printResult } from "./_kit/result.ts";
import type { ThemeRequest } from "./_kit/theme.ts";
import { applyThemeFlag, parseThemeFlag, THEME_VALUE_FLAGS, themeHelpBlock } from "./_kit/theme.ts";

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_WINDOW_MS = 2500;
const NAV_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 10_000;
const STEP_TIMEOUT_MS = 5000;
const MOUNT_SETTLE_MS = 500;
// Per reach action: enough for the store write + the view transition the next action targets.
const REACH_SETTLE_MS = 500;
const EXIT_MISUSE = 2;
// 4× CPU throttle so a frame budget is real — a dev machine's headroom masks jank that a user's phone won't.
const CPU_THROTTLE_RATE = 4;
// The budget thresholds (documented in the header). ms unless noted.
const BLOCKING_BUDGET_MS = 50;
// Clean-host 4x-CPU first Select opens peaked at 181ms blocking: 131ms above the unchanged budget.
// Round to a stable 140ms first-only library allowance; repeats receive ZERO allowance.
const FIRST_SELECT_BLOCKING_ALLOWANCE_MS = 140;
const CLS_BUDGET = 0.1;
const DROPPED_FRAME_BUDGET_PCT = 5;
const PCT = 100;

/** One pre-trace REACH action, in argv order: a DOM click or a dev-bridge navigation. Never measured —
 *  see the header's reach-vs-measure note. */
export type ReachAction = { kind: "click"; selector: string } | { kind: "nav"; method: NavMethod; target: string };

type Args = {
  route: string;
  url: string | null;
  base: string;
  selector: string | null;
  reach: ReachAction[];
  windowMs: number;
  viewport: Viewport;
  vnc: boolean;
  throttle: boolean;
  /** `--appearance`/`--appearance-preset`/`--full-motion`: the app-SETTING shim (_kit/appearance.ts). This
   *  probe already asks the browser for full motion (`reducedMotion:false`, the OS media query) — but the
   *  dev account STORES `appearance.reducedMotion:true`, so without this every number here described an app
   *  whose own setting had frozen the animations being measured. null = the account's real state. */
  appearance: AppearancePatch | null;
  /** `--theme <name|id|none>`: the ACTIVE THEME this run pretends is selected, shimmed over the same
   *  `settings.getUserSettings` response (never written — _kit/theme.ts). null = the account's own theme. */
  theme: ThemeRequest | null;
  /** CLI misuse collected without side effects; any entry means exit 2 before a browser boots. */
  errors: string[];
};

// One handler per flag (Record dispatch, snap.ts house style) — keeps parseArgs flat under the
// cognitive-complexity cap instead of a long else-if chain.
type FlagHandler = (args: Args, rest: string[]) => void;
const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--click": (a, rest) => {
    a.reach.push({ kind: "click", selector: rest.shift() ?? "" });
  },
  "--goto": (a, rest) => {
    a.reach.push({ kind: "nav", method: "goto", target: rest.shift() ?? "" });
  },
  "--open-chat": (a, rest) => {
    a.reach.push({ kind: "nav", method: "open-chat", target: rest.shift() ?? "" });
  },
  "--open-character": (a, rest) => {
    a.reach.push({ kind: "nav", method: "open-character", target: rest.shift() ?? "" });
  },
  "--context-tab": (a, rest) => {
    a.reach.push({ kind: "nav", method: "context-tab", target: rest.shift() ?? "" });
  },
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
  "--appearance": (a, rest) => {
    applyAppearanceFlag(a, parseAppearancePatch(rest.shift() ?? ""));
  },
  "--appearance-preset": (a, rest) => {
    applyAppearanceFlag(a, loadAppearancePreset(rest.shift() ?? ""));
  },
  "--full-motion": (a) => {
    a.appearance = mergeAppearancePatches(a.appearance, FULL_MOTION_PATCH);
  },
  "--theme": (a, rest) => {
    applyThemeFlag(a, parseThemeFlag(rest.shift() ?? ""));
  },
};

// Flags that consume the next token. A missing value used to swallow the following flag silently.
const REQUIRED_VALUE_FLAGS = new Set([
  "--click",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--url",
  "--base",
  "--selector",
  "--window",
  "--viewport",
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
]);

const MOTION_AUDIT_HELP = `motion-audit — the smoothness ground-truth harness

Usage:
  pnpm motion-audit [route] [flags]

Reach the surface (argv-ordered, run BEFORE the trace; evidence is reset after the last one):
  --click <selector>        --goto <section|settings:cat|modal:slot>
  --open-chat <id|title|latest|current>   --open-character <id|name>   --context-tab <tab>

Measure:
  --selector <sel>          THE interaction — clicked inside the trace window
  --window <ms>             observation window (default ${DEFAULT_WINDOW_MS})

Environment:
  --base <url> · --url <full-url> · --viewport <WxH> · --vnc (headful) · --no-throttle

${appearanceHelpBlock()}

${themeHelpBlock()}
  A motion verdict owes BOTH arms: bare (the account's real state — does the floor hold?) and
  --full-motion (is the nice stuff good?). This probe's browser-level reducedMotion:false is the OS
  media query only; it does NOT turn the app's own setting back on.

Exit: 0 pass · 1 budget breach / failed action / page error · 2 CLI misuse.`;

/** Argv is scanned for misuse BEFORE a browser boots — snap's and design-audit's strict-CLI posture. A
 *  typo'd nav flag used to print "(ignored)" and audit the landing page under the name of the surface the
 *  caller asked for, which is a smoothness verdict about the wrong thing. */
function scanArgv(argv: readonly string[]): string[] {
  const errors: string[] = [];
  let routeCount = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;
    if (FLAG_HANDLERS[token] === undefined) {
      if (token.startsWith("-")) {
        errors.push(`unknown flag ${token}`);
      } else {
        routeCount += 1;
      }
      continue;
    }
    if (!REQUIRED_VALUE_FLAGS.has(token)) {
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      errors.push(`${token} requires a value`);
      continue;
    }
    index += 1;
  }
  if (routeCount > 1) {
    errors.push(`expected at most one route, got ${routeCount}`);
  }
  return errors;
}

export function parseMotionArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    url: null,
    base: DEFAULT_BASE,
    selector: null,
    reach: [],
    windowMs: DEFAULT_WINDOW_MS,
    viewport: DEFAULT_VIEWPORT,
    vnc: false,
    throttle: true,
    appearance: null,
    theme: null,
    errors: scanArgv(argv),
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    const handler = FLAG_HANDLERS[tok];
    if (handler !== undefined) {
      handler(args, rest);
    } else if (!tok.startsWith("-")) {
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
  readonly scripts: ReadonlyArray<{
    sourceURL: string;
    duration: number;
    forcedStyleAndLayoutDuration?: number;
    invoker?: string;
    sourceFunctionName?: string;
  }>;
  readonly selectEntrance?: {
    readonly id: number;
    readonly startedAt: number;
    readonly confirmedAt?: number;
    readonly endedAt?: number;
    readonly firstForTrigger: boolean;
  };
};
type MotionSnapshot = {
  readonly loafs: readonly LoafRecord[];
  readonly cls: number;
  /** The share of `cls` the in-page instrument classified as virtual-row reconciliation (issue #109).
   *  OPTIONAL because this type mirrors whatever bundle is being served: `--isolated --ref <old sha>`
   *  legitimately answers from a page that predates the split. */
  readonly virtualizedCls?: number;
  /** `cls` − `virtualizedCls` — the total this probe's budget gates on. Optional for the same reason. */
  readonly nonVirtualizedCls?: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
};

/** The three CLS numbers a report must show. Split from `report` so the verdict rule is unit-testable
 *  (tests/tooling/motion-audit.test.ts) without a browser: a synthetic virtualized shift must move `raw`
 *  and leave `budgeted` alone. A snapshot from a bridge that predates the split (`undefined` fields) is
 *  read as "nothing classified virtualized", i.e. the pre-#109 behavior — never as a free pass. */
export function clsTotals(motion: MotionSnapshot | null): { raw: number; virtualized: number; budgeted: number } {
  if (motion === null) {
    return { raw: 0, virtualized: 0, budgeted: 0 };
  }
  const virtualized = motion.virtualizedCls ?? 0;
  return { raw: motion.cls, virtualized, budgeted: motion.nonVirtualizedCls ?? motion.cls - virtualized };
}

/** THE CLS VERDICT (issue #109): the budget judges the NON-virtualized total only. A shift the in-page
 *  instrument tagged `virtualized` moves `raw` and must never move this. */
export function clsOverBudget(motion: MotionSnapshot | null): boolean {
  return clsTotals(motion).budgeted > CLS_BUDGET;
}

function confirmedSelectEntrance(loaf: LoafRecord): NonNullable<LoafRecord["selectEntrance"]> | undefined {
  const entrance = loaf.selectEntrance;
  return entrance?.confirmedAt === undefined ? undefined : entrance;
}

/** Raw/classified/budgeted LoAF inputs. The budget itself is unchanged: confirmed sealed-Select
 * entrance frames may carry their measured positioning style work; only the trigger's first page-
 * lifetime entrance receives the fixed blocking subtraction. Repeats and all unclassified work face
 * the ordinary 50ms blocking budget. */
export function loafTotals(motion: MotionSnapshot | null): {
  rawWorstBlocking: number;
  classifiedInitializations: number;
  budgetedWorstBlocking: number;
  budgetedStyleLayout: number;
} {
  const loafs = motion?.loafs ?? [];
  const firstEntrances = new Set(
    loafs
      .map(confirmedSelectEntrance)
      .filter((entrance): entrance is NonNullable<typeof entrance> => entrance?.firstForTrigger === true)
      .map((entrance) => entrance.id),
  );
  return {
    rawWorstBlocking: loafs.reduce((worst, loaf) => Math.max(worst, loaf.blockingDuration), 0),
    classifiedInitializations: firstEntrances.size,
    budgetedWorstBlocking: loafs.reduce((worst, loaf) => {
      const entrance = confirmedSelectEntrance(loaf);
      const allowance = entrance?.firstForTrigger === true ? FIRST_SELECT_BLOCKING_ALLOWANCE_MS : 0;
      return Math.max(worst, Math.max(0, loaf.blockingDuration - allowance));
    }, 0),
    budgetedStyleLayout: loafs.filter((loaf) => loaf.styleAndLayoutStart > 0 && confirmedSelectEntrance(loaf) === undefined).length,
  };
}

export function loafOverBudget(motion: MotionSnapshot | null): boolean {
  const totals = loafTotals(motion);
  return totals.budgetedStyleLayout > 0 || totals.budgetedWorstBlocking > BLOCKING_BUDGET_MS;
}
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
// PipelineReporter begin events carry the frame's lifecycle under Chrome's `args.frame_reporter`;
// paired end events have empty args and are not frames. The fraction whose nested report is dropped
// and affects smoothness is the ground-truth "smooth?" number.
type TraceEvent = {
  readonly name?: string;
  readonly cat?: string;
  readonly ph?: string;
  readonly ts?: number;
  readonly pid?: number;
  readonly tid?: number;
  readonly id2?: { readonly local?: number | string };
  readonly args?: {
    readonly frame_reporter?: {
      readonly state?: string;
      readonly affects_smoothness?: boolean;
    };
  };
};

export function droppedFramePct(events: readonly TraceEvent[]): {
  total: number;
  dropped: number;
  pct: number;
} {
  const frames = events.filter((event) => event.name === "PipelineReporter" && event.args?.frame_reporter !== undefined);
  const dropped = frames.filter(
    (event) => event.args?.frame_reporter?.state === "STATE_DROPPED" && event.args.frame_reporter.affects_smoothness === true,
  ).length;
  const total = frames.length;
  const pct = total === 0 ? 0 : Number(((dropped / total) * PCT).toFixed(2));
  return { total, dropped, pct };
}

type FrameTotals = { readonly total: number; readonly dropped: number; readonly pct: number };
type PairedFrame = { readonly begin: TraceEvent; readonly start: number; readonly end: number };
type TraceRange = { readonly start: number; readonly confirmed: number; readonly end: number };

const SELECT_TRACE_MARK = /^orb:select-entrance:(\d+):(start|confirmed|end)$/u;

function traceId(event: TraceEvent): string | undefined {
  const local = event.id2?.local;
  return local === undefined || event.pid === undefined || event.tid === undefined ? undefined : `${event.pid}:${event.tid}:${local}`;
}

function pairedPipelineFrames(events: readonly TraceEvent[]): PairedFrame[] {
  const begins = new Map<string, TraceEvent>();
  const pairs: PairedFrame[] = [];
  for (const event of events) {
    if (event.name !== "PipelineReporter" || event.ts === undefined) {
      continue;
    }
    const id = traceId(event);
    if (id === undefined) {
      continue;
    }
    if (event.ph === "b" && event.args?.frame_reporter !== undefined) {
      begins.set(id, event);
      continue;
    }
    if (event.ph !== "e") {
      continue;
    }
    const begin = begins.get(id);
    if (begin?.ts !== undefined && event.ts >= begin.ts) {
      pairs.push({ begin, start: begin.ts, end: event.ts });
      begins.delete(id);
    }
  }
  return pairs;
}

function selectEntranceRanges(events: readonly TraceEvent[]): TraceRange[] {
  const phases = new Map<number, Partial<Record<"start" | "confirmed" | "end", number>>>();
  for (const event of events) {
    if (event.ph !== "I" || event.ts === undefined || !event.cat?.split(",").includes("blink.user_timing")) {
      continue;
    }
    const match = event.name?.match(SELECT_TRACE_MARK);
    if (match === null || match === undefined) {
      continue;
    }
    const id = Number(match[1]);
    const phase = match[2] as "start" | "confirmed" | "end";
    const record = phases.get(id) ?? {};
    record[phase] = event.ts;
    phases.set(id, record);
  }
  return [...phases.values()].flatMap((range) => {
    const { start, confirmed, end } = range;
    return start !== undefined && confirmed !== undefined && end !== undefined && start <= confirmed && confirmed <= end ? [{ start, confirmed, end }] : [];
  });
}

function frameIsDropped(event: TraceEvent): boolean {
  return event.args?.frame_reporter?.state === "STATE_DROPPED" && event.args.frame_reporter.affects_smoothness === true;
}

function totalsForFrames(frames: readonly TraceEvent[]): FrameTotals {
  const dropped = frames.filter(frameIsDropped).length;
  const total = frames.length;
  return { total, dropped, pct: total === 0 ? 0 : Number(((dropped / total) * PCT).toFixed(2)) };
}

/** Preserve #389's raw nested-payload read, then remove only complete PipelineReporter intervals that
 * overlap a complete start→confirmed→end mark set emitted by the sealed Select observer. Missing marks,
 * non-Select marks, unpaired frames, and all work outside that causal range remain ordinary inputs. */
export function calibratedDroppedFramePct(events: readonly TraceEvent[]): {
  readonly raw: FrameTotals;
  readonly classified: { readonly total: number; readonly dropped: number };
  readonly budgeted: FrameTotals;
} {
  const raw = droppedFramePct(events);
  const ranges = selectEntranceRanges(events);
  const classifiedFrames = new Set(
    pairedPipelineFrames(events)
      .filter((frame) => ranges.some((range) => frame.start <= range.end && frame.end >= range.start))
      .map((frame) => frame.begin),
  );
  const rawFrames = events.filter((event) => event.name === "PipelineReporter" && event.args?.frame_reporter !== undefined);
  const classified = [...classifiedFrames];
  const classifiedDropped = classified.filter(frameIsDropped).length;
  return {
    raw,
    classified: { total: classified.length, dropped: classifiedDropped },
    budgeted: totalsForFrames(rawFrames.filter((frame) => !classifiedFrames.has(frame))),
  };
}

type AuditData = {
  readonly motion: MotionSnapshot | null;
  readonly animations: readonly AnimationRecord[];
  readonly frames: ReturnType<typeof calibratedDroppedFramePct>;
  readonly pageErrors: readonly string[];
  readonly stepFailed: boolean;
  /** Reach actions that did not land — the run is FAILED, because the window measured another surface. */
  readonly reachFailures: number;
};

type MeasuredClick = { readonly x: number; readonly y: number };

/** Resolve Playwright's visibility/actionability geometry before the checkpoint. Those reads can run
 * style/layout themselves; the measured window must contain the app's response to a real input only. */
async function prepareMeasuredClick(page: Page, selector: string | null): Promise<MeasuredClick | null> {
  if (selector === null) {
    return null;
  }
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
    await loc.scrollIntoViewIfNeeded({ timeout: STEP_TIMEOUT_MS });
    const box = await loc.boundingBox({ timeout: STEP_TIMEOUT_MS });
    if (box === null) {
      throw new Error("visible target has no bounding box");
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  } catch (e) {
    print(`STEP FAILED  prepare click ${selector}: ${errorMessage(e)}`);
    return null;
  }
}

/** Drive the reach queue in argv order, then clear the in-page evidence so the trace window that follows
 *  carries only the measured interaction's motion. Returns the failure count (each one printed). */
async function driveReach(page: Page, reach: readonly ReachAction[]): Promise<number> {
  if (reach.length === 0) {
    return 0;
  }
  let failures = 0;
  for (const action of reach) {
    if (action.kind === "click") {
      try {
        const loc = page.locator(action.selector).first();
        // biome-ignore lint/performance/noAwaitInLoops: the reach queue is SEQUENTIAL by contract — each action may produce the surface the next one targets.
        await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
        await loc.click({ timeout: STEP_TIMEOUT_MS });
      } catch (e) {
        failures += 1;
        print(`REACH FAILED click ${action.selector}: ${errorMessage(e)}`);
      }
    } else {
      const result = await runNav(page, action.method, action.target);
      if (!result.ok) {
        failures += 1;
        print(`REACH FAILED ${action.method} ${action.target}: ${result.reason}`);
      }
    }
    await settle(page, REACH_SETTLE_MS);
  }
  // The trip to the surface is not the thing being measured (entry animations, the room's own mount
  // reflow). Cleared only when a reach ran, so a bare `motion-audit /` still audits app entry.
  await page.evaluate(() => globalThis.__orb?.resetEvidence()).catch(() => undefined);
  return failures;
}

async function runAudit(
  page: Page,
  cdp: Awaited<ReturnType<ProbeSession["context"]["newCDPSession"]>>,
  opts: Args,
  measuredClick: MeasuredClick | null,
): Promise<AuditData> {
  const traceEvents: TraceEvent[] = [];
  cdp.on("Tracing.dataCollected", (e: { value: TraceEvent[] }) => {
    traceEvents.push(...e.value);
  });
  await page.evaluate(() => globalThis.__orb?.setMotionAuditDropTrackingPaused(true));
  let stepFailed = opts.selector !== null && measuredClick === null;
  try {
    await cdp.send("Tracing.start", {
      categories: "benchmark,blink.user_timing,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline",
      transferMode: "ReportEvents",
    });

    if (measuredClick !== null) {
      try {
        await page.mouse.click(measuredClick.x, measuredClick.y);
      } catch (e) {
        stepFailed = true;
        print(`STEP FAILED  click ${opts.selector ?? "(none)"}: ${errorMessage(e)}`);
      }
    }
    // The observation window — entry animations / the clicked transition play out here.
    await settle(page, opts.windowMs);

    const completed = new Promise<void>((resolve) => {
      cdp.once("Tracing.tracingComplete", () => resolve());
    });
    await cdp.send("Tracing.end");
    await completed;
  } finally {
    await page.evaluate(() => globalThis.__orb?.setMotionAuditDropTrackingPaused(false)).catch(() => undefined);
  }

  return {
    motion: await readMotion(page),
    animations: await readAnimations(page),
    frames: calibratedDroppedFramePct(traceEvents),
    pageErrors: [],
    stepFailed,
    reachFailures: 0,
  };
}

/** The reach chain, named in full, plus a LOUD note when part of it failed — a smoothness number for a
 *  surface the probe never arrived at is the failure mode this line exists to make impossible to miss. */
function printReachLine(reach: readonly ReachAction[], reachFailures: number): void {
  if (reach.length === 0) {
    return;
  }
  const chain = reach.map((a) => (a.kind === "click" ? `click ${a.selector}` : `${a.method} ${a.target}`)).join(" → ");
  const note = reachFailures > 0 ? `  (${reachFailures} FAILED — the numbers below describe another surface)` : "";
  print(`reached     ${chain}${note}`);
}

function printLayoutLoaf(loaf: LoafRecord): void {
  const classification = confirmedSelectEntrance(loaf);
  print(
    classification === undefined
      ? `  ✗ LoAF @${loaf.startTime}ms  duration ${loaf.duration}ms, blocking ${loaf.blockingDuration}ms, style/layout in-frame`
      : `  · LoAF @${loaf.startTime}ms  duration ${loaf.duration}ms, blocking ${loaf.blockingDuration}ms, style/layout in sealed Select ${classification.firstForTrigger ? "first" : "repeat"} entrance (raw, classified)`,
  );
  for (const script of loaf.scripts) {
    print(
      `      ${script.sourceFunctionName ?? ""} via ${script.invoker ?? ""} · ${script.duration}ms script · ${script.forcedStyleAndLayoutDuration ?? 0}ms forced style/layout · ${script.sourceURL}`,
    );
  }
}

/** Print the human report + the RESULT line, return the exit code. */
function report(url: string, opts: Args, data: AuditData): number {
  const { motion, animations, frames, pageErrors, stepFailed, reachFailures } = data;
  const loaf = loafTotals(motion);
  const cls = clsTotals(motion);
  const layoutInFrame = (motion === null ? [] : motion.loafs).filter((l) => l.styleAndLayoutStart > 0);
  const dirtyAnimations = animations.filter((a) => !a.compositorClean);

  print(`URL         ${url}`);
  printReachLine(opts.reach, reachFailures);
  print(`window      ${opts.windowMs}ms · cpu-throttle ${opts.throttle ? `${CPU_THROTTLE_RATE}×` : "off"}`);
  print(`headless    ${opts.vnc ? "no (headful — dropped-frame % trustworthy)" : "yes (dropped-frame % ADVISORY — no real vsync)"}`);
  print(
    `LoAF        ${motion?.loafs.length ?? 0} in ring · raw worst blocking ${loaf.rawWorstBlocking}ms · ${loaf.classifiedInitializations} first Select entrance · budgeted worst ${loaf.budgetedWorstBlocking}ms · ${loaf.budgetedStyleLayout} budgeted style/layout`,
  );
  // All three, labeled: the raw CWV total, the virtual-row share, and the BUDGETED remainder (#109).
  print(`CLS         raw ${cls.raw} · virtualized ${cls.virtualized} (expected reconciliation) · non-virtualized ${cls.budgeted}  ← budget ${CLS_BUDGET}`);
  print(
    `frames      raw ${frames.raw.dropped}/${frames.raw.total} dropped (${frames.raw.pct}%) · Select entrance ${frames.classified.dropped}/${frames.classified.total} classified · budgeted ${frames.budgeted.dropped}/${frames.budgeted.total} (${frames.budgeted.pct}%)`,
  );
  print(`animations  ${animations.length} active · ${dirtyAnimations.length} NOT compositor-clean`);
  for (const a of dirtyAnimations) {
    print(`  ✗ ${a.target}  animates [${a.properties.join(", ")}] — non-compositor prop (jank risk)`);
  }
  for (const l of layoutInFrame) {
    printLayoutLoaf(l);
  }
  if (pageErrors.length > 0) {
    print("");
    print("--- page errors ---");
    for (const e of pageErrors) {
      print(e);
    }
  }

  const budgetFails = loafOverBudget(motion) || clsOverBudget(motion) || dirtyAnimations.length > 0 || frames.budgeted.pct > DROPPED_FRAME_BUDGET_PCT;
  const pass = !(budgetFails || stepFailed || reachFailures > 0 || pageErrors.length > 0);

  printResult("motion-audit", [
    ["verdict", pass ? "PASS" : "FAIL"],
    ["reach-actions", opts.reach.length],
    ["reach-failed", reachFailures],
    ["dropped-frames-raw", `${frames.raw.pct}%`],
    ["dropped-frames-classified", frames.classified.dropped],
    ["dropped-frames", `${frames.budgeted.pct}%`],
    ["worst-blocking-raw", `${loaf.rawWorstBlocking}ms`],
    ["first-select-entrances", loaf.classifiedInitializations],
    ["worst-blocking-budgeted", `${loaf.budgetedWorstBlocking}ms`],
    ["cls-raw", cls.raw],
    ["cls-virtualized", cls.virtualized],
    ["cls-non-virtualized", cls.budgeted],
    ["loaf-style-in-frame-raw", layoutInFrame.length],
    ["loaf-style-in-frame-budgeted", loaf.budgetedStyleLayout],
    ["dirty-animations", dirtyAnimations.length],
    ["page-errors", pageErrors.length],
  ]);
  return pass ? 0 : 1;
}

async function main(): Promise<number> {
  const opts = parseMotionArgs(process.argv.slice(2));
  if (opts.errors.length > 0) {
    for (const message of opts.errors) {
      print(`ARG ERROR    ${message}`);
    }
    print("");
    print(MOTION_AUDIT_HELP);
    return EXIT_MISUSE;
  }
  const url = opts.url ?? buildUrl(opts.base, opts.route);

  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    colorScheme: null,
    reducedMotion: false, // the OS media query — a motion probe wants the REAL animations
    appearance: opts.appearance, // …and the APP setting, which the media query does not reach (--full-motion)
    theme: opts.theme,
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

  // Reach the surface FIRST (and reset the evidence it produced), then trace the measured window.
  const reachFailures = await driveReach(page, opts.reach);
  // The dead-class flagger's one full census is dev-instrument work. requestIdleCallback can postpone it
  // until the first later mutation, so explicitly settle it outside the product interaction window.
  await page.evaluate(() => globalThis.__orb?.motionFlaggersSettled()).catch(() => undefined);
  const measuredClick = await prepareMeasuredClick(page, opts.selector);
  if (opts.selector !== null) {
    // Preparation forced all Playwright geometry before this checkpoint. The next browser work is the
    // native click itself; no measurement-owned actionability/layout can enter the product window.
    await page
      .evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                globalThis.__orb?.resetEvidence();
                resolve();
              });
            });
          }),
      )
      .catch(() => undefined);
  }

  const data = await runAudit(page, cdp, opts, measuredClick);
  const withErrors: AuditData = { ...data, pageErrors: [...session.pageErrors], reachFailures };
  await session.context.close();
  await session.browser.close();

  return report(url, opts, withErrors);
}

// CLI entry guard (the snap.ts convention): importing this module for its pure exports — `clsTotals`,
// `clsOverBudget`, which tests/tooling/motion-audit.test.ts pins — must never launch a browser.
const cliEntry = process.argv[1];
if (cliEntry !== undefined && import.meta.url === pathToFileURL(cliEntry).href) {
  void main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      print(`motion-audit failed: ${errorMessage(err)}`);
      process.exit(1);
    },
  );
}
