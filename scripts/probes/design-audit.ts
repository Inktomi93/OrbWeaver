#!/usr/bin/env tsx
/**
 * pnpm design-audit <route> [flags]        (node scripts/probes/design-audit.ts)
 *
 * Loads a route in its own headless Playwright chromium (read-only, never touches app
 * settings), waits for `data-app-ready`, optionally clicks to reveal a surface, then flags
 * high-value usability/design/a11y defects. Two rule families, origin-tagged per finding:
 *   - origin "orbweaver": contrast/text-over-art, distorted images, tap targets, accessible
 *     names/landmarks, tabindex, z-index escalation, nested cards, gradient text, animated
 *     img-hover.
 *   - origin "impeccable" (adapted from pbakaus/impeccable, Apache-2.0 — triage + attribution:
 *     .claude/skills/side-eye-design-review/reference/impeccable-adoption.md): script errors,
 *     broken images, text overflow, clipped positioned children, edge-flush scroller cards,
 *     gray-on-color, glow/radial/stripe/grid gradient decoration, accent borders, icon tiles,
 *     type-ramp legibility floors, tracking/leading/caps/justify/line-length, skipped headings,
 *     font + type-scale censuses, repeated container text, bounce easing, layout transitions.
 *
 * EVERY finding carries a LOCATABLE selector: a path built up to the nearest anchor that resolves to ONE
 * node. `data-slot` names a component KIND, so a bare `[data-slot=text]` named six findings at once and
 * located none of them (2026-08-17) — the walker now counts candidate anchors and climbs past ambiguous or
 * re-minted-per-render ones. Paste a finding's selector into the page and you get exactly its element.
 *
 * Objective + fixture-tested — the walker (scripts/probes/design-audit-walker.ts) only gathers
 * raw facts in-page; all severity/threshold decisions happen back in Node via `collectFindings`
 * (scripts/probes/design-audit-checks.ts, unit-tested at tests/tooling/design-audit.test.ts).
 * The browser never decides pass/fail.
 *
 * CONTRAST HAS A PIXEL PATH (issue #218). A DOM ancestor walk cannot see a fixed art layer painting over
 * the base it resolves — the app's wallpaper photo sits between <body>'s near-black background and every
 * translucent reading plate, and trusting the walk put 28 false P1 contrast findings on one chat
 * transcript (3.16:1 reported where the real composite is 4.94:1). The walker now says "unresolved"
 * instead of fabricating, and `resolvePixelBackdrops` settles those from ONE viewport screenshot
 * (perimeter-ring median, _kit/pixel-backdrop.ts — the same arithmetic snap's --contrast uses, now in one
 * home so the two instruments cannot disagree about what is behind a glyph). What cannot be sampled — an
 * off-screen box, a failed shot — is printed as NO VERDICT and judged by nothing.
 *
 * USAGE
 *   pnpm stack start                                   # once; design-audit is then a fast loop
 *   pnpm design-audit /                                # audit the home route
 *   pnpm design-audit /chats/abc --click "[data-testid=drawer-toggle]"
 *                                                       # reveal a surface before auditing (repeatable)
 *   pnpm design-audit / --wait 800                     # settle ms after the last action (default 500)
 *   pnpm design-audit / --out home                     # reports/design-audit/home.json
 *   pnpm design-audit / --out /tmp/lane/home.json      # a PATH-SHAPED --out (absolute, or ./ ../) is the
 *                                                       # exact file to write, not a name to file under
 *                                                       # reports/ (_kit/artifacts.ts owns that contract)
 *   pnpm design-audit / --viewport 1920x1080           # default 1280x800
 *   pnpm design-audit / --mobile                       # iPhone 14 Pro Max: 430x932, DPR3, TOUCH +
 *                                                       # pointer:coarse. THE TAP-TARGET FLOOR IS
 *                                                       # POINTER-CONDITIONAL — a bare `--viewport
 *                                                       # 430x932` still renders a FINE pointer and
 *                                                       # judges every control against the 24px AA
 *                                                       # minimum instead of the 44px touch one.
 *   pnpm design-audit / --fail-on P2                   # exit non-zero at P2+ (default P1)
 *
 * SPA NAVIGATION — same dev nav bridge (window.__orb.nav) snap drives, same ONE argv-ordered queue:
 * --goto / --open-chat / --open-character / --context-tab / --click, executed exactly as written. The
 * scanner was `--click <one selector>` only until 2026-08-16, which meant it could STRUCTURALLY only
 * ever audit home (a chat room needs 2+ hops) — every "the deterministic scan is clean" claim about any
 * other surface was a claim about a surface it never reached.
 *   pnpm design-audit / --goto settings:appearance     # audit the settings dialog
 *   pnpm design-audit / --open-chat latest --mobile    # audit a chat room at the real mobile floor
 *
 * Exit 0 if clean (no finding at/above --fail-on); 1 on findings or a nav error (an audit that never
 * loaded the page has nothing to say); 2 on CLI MISUSE — an unknown flag is a hard error, never an
 * ignored line, because a typo'd flag silently scans the wrong surface and reports it clean.
 */
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import sharp from "sharp";
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
import { artifactFile, routeSlug } from "./_kit/artifacts.ts";
import { buildUrl, DEFAULT_BASE, launchProbeSession, settle } from "./_kit/browser.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport } from "./_kit/flags.ts";
import type { NavMethod } from "./_kit/nav.ts";
import { runNav } from "./_kit/nav.ts";
import { clampBoxToImage, ringBackdropOfRegion } from "./_kit/pixel-backdrop.ts";
import { print, printResult } from "./_kit/result.ts";
import type { ContrastInput, Finding, RawSamples, Severity } from "./design-audit-checks.ts";
import { checkScriptErrors, collectFindings, isAtOrAboveSeverity, isValidSeverity } from "./design-audit-checks.ts";
import { COLLECT_SAMPLES_JS } from "./design-audit-walker.ts";

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_WAIT_MS = 500;
const DEFAULT_FAIL_ON: Severity = "P1";
const NAV_TIMEOUT_MS = 15_000;
const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
const CLICK_TIMEOUT_MS = 5000;
const MESSAGE_COL_WIDTH = 88;
// Same descriptor snap's --mobile uses — full touch + mobile UA + DPR3 + pointer:coarse, not a narrow
// viewport. The tap-target rule reads `(pointer: coarse)` in-page, so this flag is what makes the 44px
// floor apply at all.
const MOBILE_DEVICE = "iPhone 14 Pro Max";
const EXIT_MISUSE = 2;

/** One pre-audit action, in argv order: a DOM click or a dev-bridge navigation. */
type AuditAction = { kind: "click"; selector: string } | { kind: "nav"; method: NavMethod; target: string };

type Args = {
  route: string;
  base: string;
  actions: AuditAction[];
  waitMs: number;
  out: string | null;
  viewport: Viewport;
  /** A Playwright device descriptor name (--mobile), or null for the raw desktop viewport. */
  device: string | null;
  failOn: Severity;
  /** `--appearance`/`--appearance-preset`/`--full-motion`: the app-SETTING shim (_kit/appearance.ts) — a
   *  scan of the owner's account only ever judges HIS appearance choices; the shipped defaults, the
   *  compact/reading arms and every ornament he has off are unreachable without it. Never written. */
  appearance: AppearancePatch | null;
  /** CLI misuse collected without side effects; any entry means exit 2 before a browser boots. */
  errors: string[];
};

type FlagHandler = (args: Args, rest: string[]) => void;

function pushNav(args: Args, method: NavMethod, rest: string[]): void {
  args.actions.push({ kind: "nav", method, target: rest.shift() ?? "" });
}

const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--click": (a, rest) => {
    a.actions.push({ kind: "click", selector: rest.shift() ?? "" });
  },
  "--goto": (a, rest) => {
    pushNav(a, "goto", rest);
  },
  "--open-chat": (a, rest) => {
    pushNav(a, "open-chat", rest);
  },
  "--open-character": (a, rest) => {
    pushNav(a, "open-character", rest);
  },
  "--context-tab": (a, rest) => {
    pushNav(a, "context-tab", rest);
  },
  "--wait": (a, rest) => {
    a.waitMs = Number(rest.shift() ?? String(DEFAULT_WAIT_MS));
  },
  "--out": (a, rest) => {
    a.out = rest.shift() ?? null;
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
  },
  "--viewport": (a, rest) => {
    const raw = rest.shift() ?? "";
    const parsed = parseViewport(raw);
    if (parsed === null) {
      a.errors.push(`--viewport expects positive WxH, got ${JSON.stringify(raw)}`);
      return;
    }
    a.viewport = parsed;
    a.device = null;
  },
  "--mobile": (a) => {
    a.device = MOBILE_DEVICE;
  },
  "--desktop": (a) => {
    a.viewport = DEFAULT_VIEWPORT;
    a.device = null;
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
  "--fail-on": (a, rest) => {
    const raw = (rest.shift() ?? "").toUpperCase();
    if (isValidSeverity(raw)) {
      a.failOn = raw;
    } else {
      a.errors.push(`--fail-on expects P0|P1|P2|P3, got ${JSON.stringify(raw)}`);
    }
  },
};

const REQUIRED_VALUE_FLAGS = new Set([
  "--click",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--wait",
  "--out",
  "--base",
  "--viewport",
  "--fail-on",
  ...APPEARANCE_VALUE_FLAGS,
]);

const DESIGN_AUDIT_HELP = `design-audit — the deterministic UI defect scan

Usage:
  pnpm design-audit [route] [flags]

Surface (ONE argv-ordered queue — write the chain the way it should happen):
  --click <selector>        --goto <section|settings:cat|modal:slot>
  --open-chat <id|title|latest|current>   --open-character <id|name>
  --context-tab <tab>       --wait <ms>   settle after the last action (default ${DEFAULT_WAIT_MS})

Environment:
  --viewport <WxH>          default 1280x800
  --mobile                  iPhone 14 Pro Max — touch + pointer:coarse (the 44px tap floor)
  --desktop                 explicit 1280x800

${appearanceHelpBlock()}

Verdict:
  --fail-on <P0|P1|P2|P3>   exit 1 at this severity or worse (default ${DEFAULT_FAIL_ON})
  --out <name|path>         reports/design-audit/<name>.json — or, path-shaped (absolute / ./ ../),
                            that exact file

Exit: 0 clean · 1 findings or nav error · 2 CLI misuse.`;

/** Argv is scanned for misuse BEFORE anything runs. An unknown flag used to print
 *  `UNKNOWN FLAG --goto (ignored)` and exit 0 — so a typo'd audit scanned home, reported clean, and the
 *  caller believed it had scanned the surface they named. Mirrors snap's strict-CLI posture. */
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

export function parseAuditArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    base: DEFAULT_BASE,
    actions: [],
    waitMs: DEFAULT_WAIT_MS,
    out: null,
    viewport: DEFAULT_VIEWPORT,
    device: null,
    failOn: DEFAULT_FAIL_ON,
    appearance: null,
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

// ── Orchestration ────────────────────────────────────────────────────────────

type CaptureOutcome = { navError: string | null; actionsFailed: number; samples: RawSamples | null };

type AuditPage = Awaited<ReturnType<typeof launchProbeSession>>["page"];

/** One action + its settle. Returns 1 on failure (printed, and the audit's verdict reddens) — a scan of
 *  the WRONG surface is worse than no scan, so an action that didn't land is never silent. The nav arm is
 *  the shared bridge vocabulary (_kit/nav.ts), identical to snap's and the two motion probes'. */
async function driveAction(page: AuditPage, action: AuditAction, waitMs: number): Promise<number> {
  try {
    if (action.kind === "click") {
      const loc = page.locator(action.selector).first();
      await loc.waitFor({ state: "visible", timeout: CLICK_TIMEOUT_MS });
      await loc.click({ timeout: CLICK_TIMEOUT_MS });
    } else {
      const result = await runNav(page, action.method, action.target);
      if (!result.ok) {
        print(`NAV FAILED    ${action.method} ${action.target}: ${result.reason}`);
        return 1;
      }
    }
  } catch (e) {
    print(`ACTION FAILED ${action.kind === "click" ? `click ${action.selector}` : `${action.method} ${action.target}`}: ${errorMessage(e)}`);
    return 1;
  }
  await settle(page, waitMs);
  return 0;
}

async function navigateAndReveal(page: AuditPage, opts: Args, url: string): Promise<CaptureOutcome> {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS })
    .catch(() => undefined);

  let actionsFailed = 0;
  for (const action of opts.actions) {
    // biome-ignore lint/performance/noAwaitInLoops: the queue is SEQUENTIAL by contract — each action may produce the surface the next one targets (the reason it exists).
    actionsFailed += await driveAction(page, action, opts.waitMs);
  }
  await settle(page, opts.waitMs);

  if (navError !== null) {
    return { navError, actionsFailed, samples: null };
  }
  try {
    const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples;
    return { navError, actionsFailed, samples };
  } catch (e) {
    return { navError: `sample collection threw: ${errorMessage(e)}`, actionsFailed, samples: null };
  }
}

// ── Pixel-sampled backdrops (issue #218) ─────────────────────────────────────
//
// THE WALKER CANNOT SEE WHAT IS NOT AN ANCESTOR. Its resolveBackdrop now says "unresolved" instead of
// fabricating one (a 0.65-alpha reading plate resolved against the near-black BODY base — past the fixed
// wallpaper photo painting over it — and reported 3.16:1 on 28 transcript nodes where the real composite
// is 4.94:1). Only PIXELS can answer that, so the runner settles each unresolved sample here, from ONE
// viewport screenshot taken at the same scroll position the samples were read at: a per-element clip shot
// (snap's shape, for its single target) would be one screenshot per text node.
//
// `scale: "css"` keeps image pixels 1:1 with CSS pixels under --mobile's DPR3, so a walker box indexes the
// buffer directly. An element whose box is off-screen, or a shot/decode that fails, gets NO VERDICT — the
// refusal is printed and written to the report, never a fabricated color (the #211 posture).
type BackdropRefusal = { selector: string; reason: string };
type PixelPass = { samples: RawSamples; sampled: number; refusals: BackdropRefusal[] };

function isUnresolved(text: ContrastInput): boolean {
  return text.backdrop.kind === "unresolved";
}

/** ONE viewport screenshot decoded to raw pixels, or the reason there are none. */
async function viewportPixels(page: Page): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } } | { error: string }> {
  try {
    const shot: Buffer = await page.screenshot({ animations: "disabled", scale: "css" });
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    return { data, info };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

async function resolvePixelBackdrops(page: Page, samples: RawSamples): Promise<PixelPass> {
  const pending = samples.texts.filter(isUnresolved);
  if (pending.length === 0) {
    return { samples, sampled: 0, refusals: [] };
  }
  const raw = await viewportPixels(page);
  if ("error" in raw) {
    // No pixels at all: every pending sample is a refusal, and the report says why once.
    return {
      samples,
      sampled: 0,
      refusals: pending.map((t) => ({ selector: t.selector, reason: `pixel sample unavailable (${raw.error})` })),
    };
  }
  const refusals: BackdropRefusal[] = [];
  let sampled = 0;
  const texts = samples.texts.map((text) => {
    if (!isUnresolved(text)) {
      return text;
    }
    // Painted over: sampling the box would measure the OCCLUDER's pixels, which is how the first run of
    // this path reported 1.33:1 on a paragraph under the topbar (snap refuses the same case as OCCLUDED).
    if (text.occludedBy !== undefined && text.occludedBy !== null) {
      refusals.push({ selector: text.selector, reason: `painted over by ${text.occludedBy}` });
      return text;
    }
    const region = text.box === undefined ? null : clampBoxToImage(text.box, raw.info.width, raw.info.height);
    if (region === null) {
      refusals.push({ selector: text.selector, reason: text.box === undefined ? "walker sample carries no box" : "box is off-screen" });
      return text;
    }
    sampled += 1;
    return {
      ...text,
      backdrop: { kind: "flat", color: ringBackdropOfRegion(raw.data, raw.info.width, raw.info.channels, region) },
      backdropMethod: "pixel-sample",
    } satisfies ContrastInput;
  });
  return { samples: { ...samples, texts }, sampled, refusals };
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

const SEVERITY_COL = 9;
const RULE_COL = 21;
const SELECTOR_MAX_LEN = 38;
const SELECTOR_COL = 39;

/** `nav=` covers both failure classes: a page that never loaded, and a nav/click action that never
 *  landed (which means the findings below describe some OTHER surface). */
function navVerdict(navError: string | null, actionsFailed: number): string {
  if (navError !== null) {
    return "ERROR";
  }
  return actionsFailed > 0 ? "ACTIONS-FAILED" : "OK";
}

// Refusals are printed but do NOT redden the run: unlike snap's single requested measurement, this scan
// censuses every text node on the page, most of them scrolled out of the viewport, so an off-screen box is
// the normal case and not a failure. What must never happen is a SILENT drop — a reviewer reading a clean
// contrast table is entitled to know which nodes the instrument declined to judge, and why.
const REFUSAL_PRINT_CAP = 12;

function printBackdropRefusals(refusals: readonly BackdropRefusal[]): void {
  if (refusals.length === 0) {
    return;
  }
  const byReason = new Map<string, number>();
  for (const r of refusals) {
    byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  }
  const summary = [...byReason].map(([reason, n]) => `${n} ${reason}`).join(" · ");
  print(`NO VERDICT   ${refusals.length} text node(s) over an unresolvable backdrop, not pixel-samplable: ${summary}`);
  for (const r of refusals.slice(0, REFUSAL_PRINT_CAP)) {
    print(`             ${r.selector}`);
  }
  if (refusals.length > REFUSAL_PRINT_CAP) {
    print(`             … ${refusals.length - REFUSAL_PRINT_CAP} more (full list in the report json)`);
  }
  print("");
}

function printFindingsTable(findings: readonly Finding[]): void {
  if (findings.length === 0) {
    print("no findings — clean");
    return;
  }
  const sorted = [...findings].sort((a, b) => a.severity.localeCompare(b.severity));
  print("severity  rule                  selector                                message");
  for (const f of sorted) {
    const truncated = f.message.length > MESSAGE_COL_WIDTH ? `${f.message.slice(0, MESSAGE_COL_WIDTH)}…` : f.message;
    const severityCol = f.severity.padEnd(SEVERITY_COL);
    const ruleCol = f.rule.padEnd(RULE_COL);
    const selectorCol = f.selector.slice(0, SELECTOR_MAX_LEN).padEnd(SELECTOR_COL);
    print(`${severityCol} ${ruleCol} ${selectorCol} ${truncated} (${f.value})`);
  }
}

async function main(): Promise<number> {
  const opts = parseAuditArgs(process.argv.slice(2));
  if (opts.errors.length > 0) {
    for (const message of opts.errors) {
      print(`ARG ERROR    ${message}`);
    }
    print("");
    print(DESIGN_AUDIT_HELP);
    return EXIT_MISUSE;
  }
  const url = buildUrl(opts.base, opts.route);
  // `--out` names an artifact BASE under reports/design-audit/ — or, when it is path-shaped, the exact
  // file to write (_kit/artifacts.ts owns that contract for every probe).
  const outPath = await artifactFile("design-audit", opts.out ?? routeSlug(opts.route), ".json");

  const session = await launchProbeSession({
    headless: true,
    viewport: opts.viewport,
    device: opts.device,
    colorScheme: null,
    reducedMotion: false,
    appearance: opts.appearance,
    localStorage: [],
  });

  const { navError, actionsFailed, samples } = await navigateAndReveal(session.page, opts, url);
  // Backdrops the DOM walk could not resolve are settled from real pixels BEFORE the browser closes —
  // the sampler needs the page still on screen at the scroll position the samples were read at.
  const pixels = samples === null ? { samples: null, sampled: 0, refusals: [] as BackdropRefusal[] } : await resolvePixelBackdrops(session.page, samples);
  await session.browser.close();

  // Uncaught page exceptions are findings in their own right (script-error, P0) — the probe
  // session's pageerror capture is wired from nav start (_kit/browser.ts wirePage).
  const findings = pixels.samples === null ? [] : collectFindings(pixels.samples);
  findings.push(...checkScriptErrors(session.pageErrors));
  const counts = countBySeverity(findings);
  // An action that failed means the scan happened on the WRONG surface — that is a red run, not a clean
  // one, for exactly the reason the strict CLI exists.
  const failed = navError !== null || actionsFailed > 0 || findings.some((f) => isAtOrAboveSeverity(f.severity, opts.failOn));

  await writeFile(
    outPath,
    JSON.stringify(
      {
        route: opts.route,
        url,
        viewport: opts.viewport,
        device: opts.device,
        actions: opts.actions,
        actionsFailed,
        failOn: opts.failOn,
        navError,
        findings,
        counts,
        pixelSampledBackdrops: pixels.sampled,
        backdropRefusals: pixels.refusals,
      },
      null,
      2,
    ),
  );

  print(`URL          ${url}`);
  if (navError !== null) {
    print(`NAV ERROR    ${navError} — no samples collected`);
  }
  print(`report       ${outPath}`);
  print("");
  printBackdropRefusals(pixels.refusals);
  printFindingsTable(findings);

  printResult("design-audit", [
    ["findings", findings.length],
    ["p0", counts.P0],
    ["p1", counts.P1],
    ["p2", counts.P2],
    ["p3", counts.P3],
    ["fail-on", opts.failOn],
    ["actions", opts.actions.length],
    ["actions-failed", actionsFailed],
    ["pointer", opts.device === null ? "fine" : "coarse"],
    ["px-backdrops", pixels.sampled],
    ["no-verdict", pixels.refusals.length],
    ["nav", navVerdict(navError, actionsFailed)],
    ["out", outPath],
  ]);
  return failed ? 1 : 0;
}

// Entry guard (same shape snap.ts uses): the CLI runs only when this file IS the invoked script, so
// tests/tooling/design-audit.test.ts can import parseAuditArgs without booting a browser.
const cliEntry = process.argv[1];
if (cliEntry !== undefined && import.meta.url === pathToFileURL(cliEntry).href) {
  void main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      print(`design-audit failed: ${errorMessage(err)}`);
      process.exit(1);
    },
  );
}
