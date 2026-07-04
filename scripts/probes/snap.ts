#!/usr/bin/env tsx
/**
 * pnpm snap <route> [flags]        (tsx scripts/probes/snap.ts)
 *
 * The "stop staring at the browser through VNC" harness. Boots a headless
 * Playwright chromium against the running dev stack (`pnpm stack start` first),
 * navigates to <route>, and dumps a textual report (console + network + page
 * errors) to stdout plus a PNG to reports/snaps/<slug>.png. Shared plumbing
 * (argv idioms, artifact dirs, browser bootstrap, the RESULT line) lives in
 * scripts/probes/_kit/ — this file owns only snap's own capture logic.
 *
 * USAGE
 *   pnpm stack start                      # once; snap is then a fast loop
 *   pnpm snap /                           # screenshot the home route
 *   pnpm snap /debug --sse 5              # sit on the route 5s capturing events
 *   pnpm snap / --wait "[data-testid=home-chat-list]"
 *   pnpm snap / --full                    # whole scroll, not just viewport
 *   pnpm snap / --vnc                     # headed (when you DO want to look)
 *   pnpm snap /traces --debug-token $T    # seeds orb:debug-token so token-gated
 *                                          # routes render real data (defaults to
 *                                          # env DEBUG_TOKEN if set)
 *   pnpm snap / --click "[data-shell-toggle=drawer-right]" --out right-drawer
 *                                          # interact BEFORE the shot: --click/--hover/
 *                                          # --fill (repeatable, executed in argv order);
 *                                          # --out names the PNG (reports/snaps/<out>.png)
 *   pnpm snap / --press "[data-testid=recent-chats-row-kebab]"
 *                                          # hover-then-FORCED-click for hover-revealed
 *                                          # targets (group-hover kebabs, toolbars) and
 *                                          # Radix triggers failing actionability checks
 *   pnpm snap / --ls "orb-draft:character={\"state\":{...}}"
 *                                          # seed localStorage BEFORE navigation
 *                                          # (repeatable; FIRST `=` splits — values are
 *                                          # JSON) — drive zustand-persisted prefs
 *                                          # without bespoke flags per store
 *   pnpm snap / --viewport 1920x1080      # default 1280x800 (--wide = 1920x1080)
 *   pnpm snap / --crop 360x500+920+0       # ALSO write <out>-crop.png (native
 *                                          # Playwright clip, WxH+X+Y — no ffmpeg)
 *   pnpm snap / --no-deadcss               # skip the dead-class scan (ON by default:
 *                                          # every DOM class token is checked against
 *                                          # the compiled CSSOM; a utility Tailwind
 *                                          # didn't generate — wrong token namespace,
 *                                          # typo'd variant — reports as DEADCSS)
 *
 *   TEXT PATH — structure as text, ~5–8× cheaper than a PNG and greppable.
 *   Reach for this FIRST; fall to pixels only when something looks off.
 *   pnpm snap / --aria                    # ARIA tree (roles/labels/text) of <body>
 *   pnpm snap / --aria "[data-testid=home-chat-list]"   # scope to a subtree
 *   pnpm snap / --aria --aria-depth 4      # cap tree depth on deep routes
 *   pnpm snap / --aria --aria-boxes        # append [box=x,y,w,h] viewport geometry
 *   pnpm snap / --text                     # = --aria --no-shot: structure only, ZERO
 *                                          # image tokens (the cheapest verification)
 *   pnpm snap / --no-shot                  # skip the PNG; keep the textual report
 *                                          # (--baseline/--diff still force a shot)
 *
 *   IMAGE PATH — every shot is auto-stabilized (animations off, caret hidden,
 *   scale=css → ~half the tokens on hi-dpi). Native, no probe-mode needed.
 *   pnpm snap / --shot-of "[role=dialog]"  # screenshot ONE element, auto-cropped —
 *                                          # the no-pixel-math crop, cheapest pixels
 *   pnpm snap / --mask "[data-testid=msg-timestamp]" --mask ".avatar"
 *                                          # pink-box volatile regions so --diff is
 *                                          # stable without app-side probe mode
 *   pnpm snap / --dark                     # emulateMedia colorScheme (also --light)
 *   pnpm snap / --reduced-motion           # emulateMedia reducedMotion:reduce
 *   pnpm snap / --idle                     # settle on networkidle (bounded 10s)
 *                                          # instead of a fixed timeout
 *
 *   VISUAL BASELINES (probe mode + ffmpeg SSIM — no extra deps):
 *   pnpm snap / --probe --out home --baseline   # deterministic shot saved to
 *                                               # reports/baselines/home.png (gitignored)
 *   pnpm snap / --probe --out home --diff       # fresh shot vs the baseline: SSIM score +
 *                                               # difference heatmap (<out>-diff.png);
 *                                               # exits 1 below SSIM 0.98 so it's CI-able.
 *   --probe = seed orb:probe-mode (freezes relative-time labels app-side —
 *   packages/client/src/lib/probe-mode.ts) + inject CSS killing all animations/
 *   transitions/carets harness-side.
 *   ffmpeg: NOT in the dev container until a Dockerfile rebuild — --diff then prints a
 *   skipped-with-reason line and stays green (skip ≠ fail). FFMPEG_BIN env overrides.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import type { Locator, Page } from "@playwright/test";
import { artifactDir, routeSlug } from "./_kit/artifacts.ts";
import type { CapturedRequest, LocalStorageSeed, ProbeSession } from "./_kit/browser.ts";
import {
  buildUrl,
  DEFAULT_BASE,
  DEFAULT_DEBUG_TOKEN,
  launchProbeSession,
  settle,
} from "./_kit/browser.ts";
import { resolveFfmpeg } from "./_kit/ffmpeg.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport, splitFirstEq, splitLastEq } from "./_kit/flags.ts";
import type { ResultPair } from "./_kit/result.ts";
import { print, printResult } from "./_kit/result.ts";

// SSIM floor for --diff. 0.98 tolerates antialiasing wobble while catching any
// real layout/content change; tune per-surface later if flux demands.
const DIFF_SSIM_THRESHOLD = 0.98;
// Cap on ARIA-snapshot lines echoed into the report — a full app route can be
// hundreds of nodes. Past this, the tail is dropped with a "scope it" hint
// (--aria <selector> / --aria-depth N) so the text path never blows the budget
// it exists to save.
const ARIA_MAX_LINES = 400;
// Cap on DEADCSS/EMPTYCSS lines echoed (the counts always print in full).
const CSS_FINDINGS_CAP = 15;
const NAV_TIMEOUT_MS = 15_000;
const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
const STEP_TIMEOUT_MS = 5000;
// Let transitions/queries settle between steps (drawer slides, panel drops).
const STEP_SETTLE_MS = 400;
// After a --press hover: give group-hover reveals a beat before the forced click.
const HOVER_REVEAL_MS = 150;
const NETWORKIDLE_TIMEOUT_MS = 10_000;
// Default post-nav settle so onMount queries have a chance to fire.
const MOUNT_SETTLE_MS = 500;
const MS_PER_SECOND = 1000;
const HTTP_ERROR_STATUS_MIN = 400;
const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
// --wide: layout sanity at a real monitor width (neo's default 1280 disguised a
// dialog max-width bug for a whole morning).
const WIDE_VIEWPORT: Viewport = { width: 1920, height: 1080 };
// Native screenshot stabilization, applied to EVERY shot (page + element):
//   animations:"disabled" — rewinds CSS animations/transitions to a consistent
//     finished state (correct way; supersedes probe-mode's injected killer CSS).
//   caret:"hide"          — no blinking text caret (also Playwright's default).
//   scale:"css"           — one image pixel per CSS pixel; on a hi-dpi context
//     this HALVES pixel count vs the "device" default → ~half the image tokens.
const SHOT_BASE = { animations: "disabled", caret: "hide", scale: "css" } as const;
const CROP_RE = /^(?<w>\d+)x(?<h>\d+)(?:\+(?<x>\d+)\+(?<y>\d+))?$/u;
const PNG_EXT_RE = /\.png$/u;
const SSIM_ALL_RE = /All:(?<all>[\d.]+)/u;
const METHOD_PAD = 4;
const TYPE_PAD = 8;
// localStorage keys the harness seeds. App counterpart for probe-mode:
// packages/client/src/lib/probe-mode.ts; the debug-token reader lands with its route.
const PROBE_MODE_KEY = "orb:probe-mode";
const DEBUG_TOKEN_KEY = "orb:debug-token";
// Harness-side determinism for --probe: floor every animation/transition and hide the
// caret from FIRST PAINT (screenshot-time `animations:"disabled"` only rewinds at capture;
// this kills mid-run flicker during steps too). Raw string — see _kit/browser.ts header.
const PROBE_CSS_SCRIPT = `document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
  document.head.appendChild(style);
});`;

type Step =
  | { kind: "click"; selector: string }
  | { kind: "jsclick"; selector: string }
  | { kind: "press"; selector: string }
  | { kind: "hover"; selector: string }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "key"; selector: string; key: string }
  | { kind: "waitfor"; selector: string };

type Args = {
  route: string;
  vnc: boolean;
  waitSelector: string | null;
  sseSeconds: number;
  base: string;
  fullPage: boolean;
  /** Seeds `orb:debug-token` BEFORE navigation so token-gated routes render real data.
   *  Defaults to env DEBUG_TOKEN if set; `--debug-token …` overrides; empty skips the
   *  seed. The token never leaves the headless context. */
  debugToken: string;
  /** Pre-shot interaction steps, executed in argv order. Each waits for its selector
   *  (5s) then acts; failures are REPORTED (and fail the exit code) but don't abort —
   *  you still get a PNG of wherever the page ended up. */
  steps: Step[];
  /** Output basename override (reports/snaps/<out>.png). Defaults to the route slug. */
  out: string | null;
  viewport: Viewport;
  /** localStorage seeds applied BEFORE navigation (`--ls key=value`, repeatable). */
  localStorage: LocalStorageSeed[];
  /** Deterministic-render mode: seed orb:probe-mode + kill animations via injected CSS. */
  probe: boolean;
  /** Save the shot as the baseline (reports/baselines/<out>.png) instead of diffing. */
  baseline: boolean;
  /** Compare the shot against the stored baseline via ffmpeg SSIM; exit 1 below threshold. */
  diff: boolean;
  /** Dead-class scan (default on): DOM class tokens vs compiled CSSOM selectors. */
  deadCss: boolean;
  /** Optional crop "WxH+X+Y" → <out>-crop.png (native Playwright clip, no ffmpeg). */
  crop: string | null;
  // ── TEXT PATH (cheap structure-as-text — feed this instead of pixels) ───────
  /** Emit a Playwright ARIA snapshot of `ariaSelector` into the report. */
  aria: boolean;
  /** Subtree to snapshot (default "body"); scope it to shrink the output. */
  ariaSelector: string;
  /** Cap ARIA tree depth (Playwright `depth`) — bounds output on deep routes. */
  ariaDepth: number | null;
  /** Append each node's `[box=x,y,w,h]` viewport geometry (Playwright `boxes`). */
  ariaBoxes: boolean;
  // ── IMAGE PATH ──────────────────────────────────────────────────────────────
  /** Produce a PNG at all. `--no-shot`/`--text` set false; --baseline/--diff force it. */
  shot: boolean;
  /** Screenshot ONLY this element (locator.screenshot, auto-cropped). Overrides full-page. */
  shotOf: string | null;
  /** Selectors painted over (#FF00FF) before the shot — volatile regions. */
  mask: string[];
  /** emulateMedia colorScheme — exercise the app's dark/light surfaces. */
  colorScheme: "light" | "dark" | null;
  /** emulateMedia reducedMotion:"reduce" (also implied by --probe). */
  reducedMotion: boolean;
  /** Settle on networkidle (bounded) instead of a fixed timeout before capture. */
  idle: boolean;
};

// ── Flag dispatch ───────────────────────────────────────────────────────────
// One handler per flag (Record dispatch, house style) — each consumes what it
// needs from `rest`. Repeatable flags push; order-sensitive steps land in
// args.steps in argv order.
type FlagHandler = (args: Args, rest: string[]) => void;

function ariaFlag(args: Args, rest: string[], textMode: boolean): void {
  args.aria = true;
  // --text is the cheap combo: structure-as-text, no pixels.
  if (textMode) {
    args.shot = false;
  }
  // Optional inline selector: consume the next token ONLY if it's not a flag
  // (--…) and not a route (/…). Selectors start with [ . # or a tag name.
  const next = rest[0];
  if (next !== undefined && !next.startsWith("-") && !next.startsWith("/")) {
    args.ariaSelector = rest.shift() as string;
  }
}

const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--vnc": (a) => {
    a.vnc = true;
  },
  "--full": (a) => {
    a.fullPage = true;
  },
  "--wait": (a, rest) => {
    a.waitSelector = rest.shift() ?? null;
  },
  "--sse": (a, rest) => {
    a.sseSeconds = Number(rest.shift() ?? "0");
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
  },
  "--debug-token": (a, rest) => {
    a.debugToken = rest.shift() ?? "";
  },
  "--click": (a, rest) => {
    a.steps.push({ kind: "click", selector: rest.shift() ?? "" });
  },
  // In-page el.click() — bypasses Playwright's actionability checks for
  // stubborn targets (icon divs under overlay stacks).
  "--jsclick": (a, rest) => {
    a.steps.push({ kind: "jsclick", selector: rest.shift() ?? "" });
  },
  // Hover the target's position then FORCE-click — for hover-revealed controls
  // (group-hover kebabs/toolbars stay actionability-invisible) and Radix
  // triggers that want real pointer events but fail visibility checks.
  "--press": (a, rest) => {
    a.steps.push({ kind: "press", selector: rest.shift() ?? "" });
  },
  "--hover": (a, rest) => {
    a.steps.push({ kind: "hover", selector: rest.shift() ?? "" });
  },
  // FIRST '=' splits (localStorage keys never contain '='; JSON values often do).
  "--ls": (a, rest) => {
    const seed = splitFirstEq(rest.shift() ?? "");
    if (seed !== null) {
      a.localStorage.push({ key: seed.head, value: seed.tail });
    }
  },
  // --fill "selector=value" — LAST '=' splits (selectors contain '=').
  "--fill": (a, rest) => {
    const s = splitLastEq(rest.shift() ?? "");
    a.steps.push({ kind: "fill", selector: s.head, value: s.tail });
  },
  // --key "selector=KeyName" (LAST '=' splits; default Enter). Pairs with --fill to
  // COMMIT a search box: `--fill 'input=q' --key 'input=Enter'` snaps a results view.
  "--key": (a, rest) => {
    const s = splitLastEq(rest.shift() ?? "");
    a.steps.push({ kind: "key", selector: s.head, key: s.tail === "" ? "Enter" : s.tail });
  },
  // A POST-STEP wait (vs the page-load `--wait`): waits for `selector` to ATTACH at
  // this point in the step sequence — for content that appears AFTER an interaction.
  // "attached" not "visible": the visibility check false-negatives on full-bleed-
  // modal / portal content that IS painted — pair with `--shot-of`.
  "--wait-for": (a, rest) => {
    a.steps.push({ kind: "waitfor", selector: rest.shift() ?? "" });
  },
  "--no-deadcss": (a) => {
    a.deadCss = false;
  },
  "--aria": (a, rest) => {
    ariaFlag(a, rest, false);
  },
  "--text": (a, rest) => {
    ariaFlag(a, rest, true);
  },
  "--aria-depth": (a, rest) => {
    a.ariaDepth = Number(rest.shift() ?? "0") || null;
  },
  "--aria-boxes": (a) => {
    a.ariaBoxes = true;
  },
  "--no-shot": (a) => {
    a.shot = false;
  },
  "--shot-of": (a, rest) => {
    a.shotOf = rest.shift() ?? null;
  },
  "--mask": (a, rest) => {
    const sel = rest.shift();
    if (sel) {
      a.mask.push(sel);
    }
  },
  "--dark": (a) => {
    a.colorScheme = "dark";
  },
  "--light": (a) => {
    a.colorScheme = "light";
  },
  "--reduced-motion": (a) => {
    a.reducedMotion = true;
  },
  "--idle": (a) => {
    a.idle = true;
  },
  "--crop": (a, rest) => {
    a.crop = rest.shift() ?? null;
  },
  "--probe": (a) => {
    a.probe = true;
  },
  "--baseline": (a) => {
    a.baseline = true;
  },
  "--diff": (a) => {
    a.diff = true;
  },
  "--out": (a, rest) => {
    a.out = rest.shift() ?? null;
  },
  "--wide": (a) => {
    a.viewport = WIDE_VIEWPORT;
  },
  "--viewport": (a, rest) => {
    a.viewport = parseViewport(rest.shift() ?? "") ?? a.viewport;
  },
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    vnc: false,
    waitSelector: null,
    sseSeconds: 0,
    base: DEFAULT_BASE,
    fullPage: false,
    debugToken: DEFAULT_DEBUG_TOKEN,
    steps: [],
    out: null,
    viewport: DEFAULT_VIEWPORT,
    localStorage: [],
    probe: false,
    baseline: false,
    diff: false,
    deadCss: true,
    crop: null,
    aria: false,
    ariaSelector: "body",
    ariaDepth: null,
    ariaBoxes: false,
    shot: true,
    shotOf: null,
    mask: [],
    colorScheme: null,
    reducedMotion: false,
    idle: false,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    const handler = FLAG_HANDLERS[tok];
    if (handler !== undefined) {
      handler(args, rest);
    } else if (tok.startsWith("--")) {
      // Unlike neo (silent), a typo'd flag gets a line — agents can't eyeball a
      // missing drawer the way a human watching VNC would.
      print(`UNKNOWN FLAG ${tok} (ignored)`);
    } else {
      args.route = tok;
    }
  }
  return args;
}

// ── Capture phases ──────────────────────────────────────────────────────────

type CaptureOutcome = {
  navError: string | null;
  stepFailures: number;
  deadCss: Array<{ token: string; count: number }>;
  emptyCss: string[];
  ariaText: string | null;
};

async function navigate(page: Page, opts: Args, url: string): Promise<string | null> {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  // Even a non-OK nav may still render something worth waiting for (SPA error page).
  if (opts.waitSelector !== null) {
    await page
      .locator(opts.waitSelector)
      .first()
      .waitFor({ state: "visible", timeout: WAIT_SELECTOR_TIMEOUT_MS });
  }
  return navError;
}

// One step, one wait discipline. Throws on failure; runSteps counts + reports.
async function runStep(page: Page, step: Step): Promise<void> {
  const loc = page.locator(step.selector).first();
  if (step.kind === "waitfor") {
    // "attached" (in-DOM) is robust against the full-bleed-modal visibility
    // false-negative; the settle after handles paint.
    await loc.waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    return;
  }
  if (step.kind === "jsclick") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    // No HTMLElement cast: the root tsconfig that checks scripts/ is DOM-less.
    await loc.evaluate((el) => (el as unknown as { click: () => void }).click());
    return;
  }
  if (step.kind === "press") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    await loc.hover({ force: true });
    await settle(page, HOVER_REVEAL_MS);
    await loc.click({ force: true, timeout: STEP_TIMEOUT_MS });
    return;
  }
  await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  if (step.kind === "click") {
    await loc.click({ timeout: STEP_TIMEOUT_MS });
  } else if (step.kind === "hover") {
    await loc.hover();
  } else if (step.kind === "key") {
    await loc.press(step.key);
  } else {
    await loc.fill(step.value);
  }
}

async function runSteps(page: Page, steps: readonly Step[]): Promise<number> {
  let failures = 0;
  for (const step of steps) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: interaction steps are SEQUENTIAL by contract — argv order, each step may reveal the next step's target.
      await runStep(page, step);
      await settle(page, STEP_SETTLE_MS);
    } catch (e) {
      failures += 1;
      print(`STEP FAILED  ${step.kind} ${step.selector}: ${errorMessage(e)}`);
    }
  }
  return failures;
}

async function settlePage(page: Page, opts: Args): Promise<void> {
  if (opts.idle) {
    // Wait for the network to go quiet (bounded) — a real settle for routes whose
    // content lands via deferred queries, instead of guessing a timeout.
    // biome-ignore lint/nursery/noPlaywrightNetworkidle: explicit opt-in (--idle) with a hard bound — settling on network-quiet IS the flag's contract.
    await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS }).catch(() => {
      /* bounded — a chatty stream must never block the shot */
    });
  }
  if (opts.sseSeconds > 0) {
    await settle(page, opts.sseSeconds * MS_PER_SECOND);
  } else if (!opts.idle) {
    await settle(page, MOUNT_SETTLE_MS);
  }
}

async function captureAria(page: Page, opts: Args): Promise<string> {
  try {
    const ariaOpts: { depth?: number; boxes?: boolean } = { boxes: opts.ariaBoxes };
    if (opts.ariaDepth !== null) {
      ariaOpts.depth = opts.ariaDepth;
    }
    return await page.locator(opts.ariaSelector).first().ariaSnapshot(ariaOpts);
  } catch (e) {
    return `ARIA capture failed for "${opts.ariaSelector}": ${errorMessage(e)}`;
  }
}

async function capture(page: Page, opts: Args, plan: ShotPlan): Promise<CaptureOutcome> {
  const outcome: CaptureOutcome = {
    navError: null,
    stepFailures: 0,
    deadCss: [],
    emptyCss: [],
    ariaText: null,
  };
  // Volatile-region masks (pink overlay) shared by the main shot, --shot-of, and crop.
  const mask = opts.mask.map((s) => page.locator(s));
  try {
    outcome.navError = await navigate(page, opts, plan.url);
    outcome.stepFailures = await runSteps(page, opts.steps);
    await settlePage(page, opts);
    if (opts.deadCss) {
      const scan = await scanDeadCss(page);
      outcome.deadCss = scan.dead;
      outcome.emptyCss = scan.empty;
    }
    if (opts.aria) {
      outcome.ariaText = await captureAria(page, opts);
    }
    if (plan.produceShot) {
      await captureShot(page, opts, plan.out, mask);
    }
  } catch (e) {
    outcome.navError = `nav/wait threw: ${errorMessage(e)}`;
    // Try to screenshot whatever we got anyway.
    if (plan.produceShot) {
      try {
        await captureShot(page, opts, plan.out, mask);
      } catch {
        /* best effort — the report + RESULT line still land */
      }
    }
  }
  return outcome;
}

// ── Screenshot capture ──────────────────────────────────────────────────────
// One place that decides element-shot vs page-shot, applies native stabilization
// (SHOT_BASE), masks volatile regions, and does the native crop.
async function captureShot(page: Page, opts: Args, out: string, mask: Locator[]): Promise<void> {
  if (opts.shotOf !== null) {
    // Just the element — Playwright auto-crops to its bounding box. The
    // no-pixel-math crop: the cheapest pixels that still show the thing.
    await page
      .locator(opts.shotOf)
      .first()
      .screenshot({ path: out, ...SHOT_BASE, mask });
    return;
  }
  await page.screenshot({ path: out, fullPage: opts.fullPage, ...SHOT_BASE, mask });
  // Native crop via clip (WxH+X+Y) → <out>-crop.png. No ffmpeg, and the cropped
  // PNG is itself a smaller (cheaper) image to read than the full viewport.
  if (opts.crop !== null) {
    const m = CROP_RE.exec(opts.crop);
    const g = m?.groups;
    if (g?.["w"] !== undefined && g["h"] !== undefined) {
      await page.screenshot({
        path: out.replace(PNG_EXT_RE, "-crop.png"),
        clip: {
          x: Number(g["x"] ?? 0),
          y: Number(g["y"] ?? 0),
          width: Number(g["w"]),
          height: Number(g["h"]),
        },
        ...SHOT_BASE,
        mask,
      });
    }
  }
}

// ── Dead-class scan ─────────────────────────────────────────────────────────
// Two failure modes, one walk:
//   1. DEAD TOKENS — a class on an element with NO matching rule anywhere: a
//      utility Tailwind didn't GENERATE (wrong theme namespace — neo's
//      sm:max-w-dialog-* bug: max-w resolves --container-*, the tokens only
//      mapped --width-*; or a typo'd variant / stale class). Marker-only
//      classes that legitimately have no rules (group/peer + named forms) are
//      skipped, as are known third-party marker namespaces.
//   2. EMPTY RULES — the rule compiled but every declaration was INVALID CSS,
//      so the browser dropped them at parse time and CSSOM holds an empty
//      block (style.length === 0). Canonical case: v3 var syntax `w-[--foo]`
//      compiling under v4 to `width: --foo` (bare ident, no var()). Mode 1
//      can't see it because the SELECTOR exists.
async function scanDeadCss(
  page: Page,
): Promise<{ dead: Array<{ token: string; count: number }>; empty: string[] }> {
  // NOTE: the body ships as a STRING — tsx (esbuild keepNames) decorates
  // function expressions with a __name helper that doesn't exist inside the
  // browser context; a serialized IIFE evaluates untransformed. (Also the root
  // tsconfig that checks scripts/ is DOM-less — a function body wouldn't compile.)
  return (await page.evaluate(`(() => {
    const used = new Map();
    for (const el of document.querySelectorAll("*")) {
      for (const t of el.classList) used.set(t, (used.get(t) ?? 0) + 1);
    }
    const defined = new Set();
    const empty = new Set();
    // BACKSLASH DOUBLING IS DELIBERATE — do not "fix" it. This whole IIFE is a
    // RAW STRING (see the keepNames note above), NOT a JS regex literal. Every
    // backslash that must survive into the browser-side regex has to be escaped
    // once here so the string literal yields it. The regex the browser actually
    // compiles is /.((?:\\.|[A-Za-z0-9_-])+)/g — i.e. a literal dot, then a run
    // of either an escaped char (\\.) or a CSS ident char. Halving these (.→.,
    // \\.→.) would change the in-browser regex and break dead-class matching.
    const re = /\\.((?:\\\\.|[A-Za-z0-9_-])+)/g;
    const walk = (rules) => {
      for (const r of rules) {
        const sel = r.selectorText;
        if (typeof sel === "string") {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(sel)) !== null) defined.add(m[1].replace(/\\\\(.)/g, "$1"));
          // A style rule with zero surviving declarations AND no nested
          // child rules = the browser rejected every value in it. (Tailwind
          // v4 variants emit nesting — hover utilities hold an &:hover child
          // rule and no own declarations — hence the child check. NB: this
          // comment lives inside the evaluate string; no backticks here.)
          if (r.style && r.style.length === 0 && (!r.cssRules || r.cssRules.length === 0)) {
            empty.add(sel);
          }
        }
        if (r.cssRules) walk(r.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); } catch { /* cross-origin */ }
    }
    const skip = (t) =>
      t === "group" || t === "peer" || t.startsWith("group/") || t.startsWith("peer/") ||
      // third-party marker classes that ship no stylesheet rules
      t.startsWith("lucide") || t.startsWith("TanStack") || t.startsWith("tsqd-");
    const dead = [];
    for (const [token, count] of used) {
      if (!defined.has(token) && !skip(token)) dead.push({ token, count });
    }
    dead.sort((a, b) => b.count - a.count);
    // Only report empty rules whose class is actually ON an element right
    // now — Tailwind's source scanner also compiles class-shaped strings out
    // of comments/docs (w-[--foo] in a code comment becomes a real, empty
    // rule) and those are harmless until something wears them.
    const emptyUsed = [...empty].filter((sel) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sel)) !== null) {
        if (used.has(m[1].replace(/\\\\(.)/g, "$1"))) return true;
      }
      return false;
    });
    return { dead, empty: emptyUsed.sort() };
  })()`)) as { dead: Array<{ token: string; count: number }>; empty: string[] };
}

// ── Report printing ─────────────────────────────────────────────────────────

type ShotPlan = {
  url: string;
  out: string;
  produceShot: boolean;
};

type ReportCtx = ShotPlan & { failed: CapturedRequest[] };

function printSummary(
  session: ProbeSession,
  outcome: CaptureOutcome,
  opts: Args,
  ctx: ReportCtx,
): void {
  let shotDisplay = ctx.out;
  if (!ctx.produceShot) {
    shotDisplay = "(none — --no-shot)";
  } else if (opts.shotOf !== null) {
    shotDisplay = `${ctx.out}  (element: ${opts.shotOf})`;
  }
  print(`URL          ${ctx.url}`);
  print(`screenshot   ${shotDisplay}`);
  if (opts.colorScheme !== null) {
    print(`colorScheme  ${opts.colorScheme}`);
  }
  if (outcome.navError !== null) {
    print(`NAV ERROR    ${outcome.navError}`);
  }
  print(`requests     ${session.requests.size} (${ctx.failed.length} failed/4xx-5xx)`);
  print(`console      ${session.consoleLines.length} message(s)`);
  print(`page errors  ${session.pageErrors.length}`);
}

function printAriaBlock(opts: Args, ariaText: string | null): void {
  if (ariaText === null) {
    return;
  }
  // The text path. For "did it render / is the list populated / is the dialog
  // open / what's the label" this is the whole answer — no pixels needed.
  const lines = ariaText.split("\n");
  const scope = `${opts.ariaSelector}${opts.ariaDepth !== null ? ` depth≤${opts.ariaDepth}` : ""}`;
  print(`\n--- ARIA (${scope}, ${lines.length} line(s)) ---`);
  for (const l of lines.slice(0, ARIA_MAX_LINES)) {
    print(`  ${l}`);
  }
  if (lines.length > ARIA_MAX_LINES) {
    print(
      `  … +${lines.length - ARIA_MAX_LINES} more — scope with --aria <selector> or --aria-depth N`,
    );
  }
}

function printCaptureLog(session: ProbeSession, failed: CapturedRequest[]): void {
  if (failed.length > 0) {
    print("\n--- failed requests ---");
    for (const r of failed) {
      print(
        `  ${r.method.padEnd(METHOD_PAD)} ${r.type.padEnd(TYPE_PAD)} ${r.status ?? "—"} ${r.failed ?? ""} ${r.url}`,
      );
    }
  }
  if (session.consoleLines.length > 0) {
    print("\n--- console ---");
    for (const m of session.consoleLines) {
      print(`  ${m}`);
    }
  }
  if (session.pageErrors.length > 0) {
    print("\n--- page errors ---");
    for (const e of session.pageErrors) {
      print(e);
    }
  }
}

function printCssFindings(outcome: CaptureOutcome): void {
  if (outcome.deadCss.length > 0) {
    // Advisory, not gating: a class token in the DOM that NO stylesheet rule matches
    // is a utility Tailwind didn't generate (wrong token namespace, typo'd variant)
    // or third-party noise — eyeball before trusting layout.
    print("\n--- DEADCSS (class tokens with no matching CSS rule) ---");
    for (const d of outcome.deadCss.slice(0, CSS_FINDINGS_CAP)) {
      print(`  ${d.token} (×${d.count})`);
    }
    if (outcome.deadCss.length > CSS_FINDINGS_CAP) {
      print(`  … +${outcome.deadCss.length - CSS_FINDINGS_CAP} more`);
    }
  }
  if (outcome.emptyCss.length > 0) {
    // The selector compiled but the browser threw away every declaration — the value
    // was invalid CSS. Canonical case: Tailwind v3 var syntax `w-[--foo]` compiling to
    // `width: --foo` (no var()) under v4; the v4 form is `w-(--foo)`. Invisible to the
    // dead-token scan above because the RULE exists.
    print("\n--- EMPTYCSS (rules whose declarations the browser dropped — invalid values) ---");
    for (const sel of outcome.emptyCss.slice(0, CSS_FINDINGS_CAP)) {
      print(`  ${sel}`);
    }
    if (outcome.emptyCss.length > CSS_FINDINGS_CAP) {
      print(`  … +${outcome.emptyCss.length - CSS_FINDINGS_CAP} more`);
    }
  }
}

// Crop is captured natively in captureShot (Playwright clip) — just report it.
function printCropNote(opts: Args, ctx: ReportCtx): void {
  if (opts.crop === null) {
    return;
  }
  if (!CROP_RE.test(opts.crop)) {
    print(`crop         IGNORED — expected WxH+X+Y, got "${opts.crop}"`);
  } else if (!ctx.produceShot) {
    print("crop         IGNORED — needs a shot (drop --no-shot/--text)");
  } else if (opts.shotOf !== null) {
    print("crop         IGNORED — mutually exclusive with --shot-of");
  } else {
    print(`crop         ${ctx.out.replace(PNG_EXT_RE, "-crop.png")}`);
  }
}

// ── Baseline / diff (probe-mode visual regression, ffmpeg SSIM) ─────────────
// skip ≠ fail: NO-BASELINE and SKIPPED-NO-FFMPEG report in the RESULT line but
// never redden the exit — only a real SSIM comparison below threshold does.

type DiffOutcome = { diffPairs: ResultPair[]; ssimFailed: boolean };

function compareSsim(ffmpeg: string, out: string, baselinePath: string): DiffOutcome {
  // SSIM via ffmpeg (no extra deps): stderr ends with "... All:0.9876 (…)".
  const ssimRes = spawnSync(
    ffmpeg,
    ["-i", out, "-i", baselinePath, "-lavfi", "ssim", "-f", "null", "-"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const ssimAll = SSIM_ALL_RE.exec(ssimRes.stderr?.toString() ?? "")?.groups?.["all"];
  const ssim = ssimAll === undefined ? null : Number(ssimAll);
  // Difference heatmap — bright pixels = changed regions.
  const diffPng = out.replace(PNG_EXT_RE, "-diff.png");
  spawnSync(
    ffmpeg,
    ["-y", "-i", out, "-i", baselinePath, "-filter_complex", "blend=all_mode=difference", diffPng],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const pass = ssim !== null && ssim >= DIFF_SSIM_THRESHOLD;
  print(
    `DIFF         ssim=${ssim ?? "unparseable"} (threshold ${DIFF_SSIM_THRESHOLD}) → ${pass ? "PASS" : "FAIL"}`,
  );
  print(`diff heatmap ${diffPng}`);
  return {
    diffPairs: [
      ["diff", pass ? "PASS" : "FAIL"],
      ["ssim", ssim ?? "?"],
    ],
    ssimFailed: !pass,
  };
}

async function runBaselineOrDiff(opts: Args, out: string, name: string): Promise<DiffOutcome> {
  const none: DiffOutcome = { diffPairs: [], ssimFailed: false };
  if (opts.baseline) {
    const baselinePath = join(await artifactDir("baselines"), `${name}.png`);
    await copyFile(out, baselinePath);
    print(`baseline     saved → ${baselinePath}`);
    return none;
  }
  if (!opts.diff) {
    return none;
  }
  const baselinePath = join(await artifactDir("baselines"), `${name}.png`);
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg === null) {
    print(
      "DIFF         skipped — ffmpeg not found (set FFMPEG_BIN or rebuild the dev container); SSIM unavailable",
    );
    return { diffPairs: [["diff", "SKIPPED-NO-FFMPEG"]], ssimFailed: false };
  }
  if (!existsSync(baselinePath)) {
    print(`DIFF         no baseline at ${baselinePath} — run with --baseline first`);
    return { diffPairs: [["diff", "NO-BASELINE"]], ssimFailed: false };
  }
  return compareSsim(ffmpeg, out, baselinePath);
}

// ── Orchestration ───────────────────────────────────────────────────────────

// Pre-navigation localStorage seeds: the generic --ls pairs plus the two harness
// keys (all ride _kit's one init script — same timing, before any page script).
function buildSeeds(opts: Args): LocalStorageSeed[] {
  const seeds: LocalStorageSeed[] = [...opts.localStorage];
  if (opts.debugToken !== "") {
    seeds.push({ key: DEBUG_TOKEN_KEY, value: opts.debugToken });
  }
  if (opts.probe) {
    seeds.push({ key: PROBE_MODE_KEY, value: "1" });
  }
  return seeds;
}

async function snap(opts: Args): Promise<number> {
  const url = buildUrl(opts.base, opts.route);
  const name = opts.out ?? routeSlug(opts.route);
  const out = join(await artifactDir("snaps"), `${name}.png`);
  // Whether we write a PNG. --no-shot/--text suppress it, but --baseline/--diff
  // need pixels to compare, and --shot-of is itself a shot — so those force it on.
  const produceShot = opts.shotOf !== null || opts.shot || opts.baseline || opts.diff;

  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    colorScheme: opts.colorScheme,
    reducedMotion: opts.reducedMotion || opts.probe,
    localStorage: buildSeeds(opts),
  });
  if (opts.probe) {
    await session.context.addInitScript({ content: PROBE_CSS_SCRIPT });
  }

  const plan: ShotPlan = { url, out, produceShot };
  const outcome = await capture(session.page, opts, plan);
  await session.browser.close();

  const failed = [...session.requests.values()].filter(
    (r) => r.failed !== null || (r.status ?? 0) >= HTTP_ERROR_STATUS_MIN,
  );
  const ctx: ReportCtx = { ...plan, failed };
  printSummary(session, outcome, opts, ctx);
  printAriaBlock(opts, outcome.ariaText);
  printCaptureLog(session, failed);
  printCssFindings(outcome);
  printCropNote(opts, ctx);
  const { diffPairs, ssimFailed } = await runBaselineOrDiff(opts, out, name);

  // Exit non-zero if anything observably went wrong, so `snap` is CI-usable.
  const red =
    outcome.navError !== null ||
    session.pageErrors.length > 0 ||
    failed.length > 0 ||
    outcome.stepFailures > 0 ||
    ssimFailed;
  printResult("snap", [
    ["out", produceShot ? out : "(none)"],
    ["aria", outcome.ariaText === null ? "no" : "yes"],
    ["nav", outcome.navError === null ? "OK" : "ERROR"],
    ["steps-failed", outcome.stepFailures],
    ["page-errors", session.pageErrors.length],
    ["failed-req", failed.length],
    ["deadcss", outcome.deadCss.length],
    ["emptycss", outcome.emptyCss.length],
    ...diffPairs,
  ]);
  return red ? 1 : 0;
}

const cliArgs = parseArgs(process.argv.slice(2));
void snap(cliArgs).then((code) => process.exit(code));
