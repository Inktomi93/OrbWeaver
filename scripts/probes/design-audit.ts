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
 * Objective + fixture-tested — the walker (scripts/probes/design-audit-walker.ts) only gathers
 * raw facts in-page; all severity/threshold decisions happen back in Node via `collectFindings`
 * (scripts/probes/design-audit-checks.ts, unit-tested at tests/tooling/design-audit.test.ts).
 * The browser never decides pass/fail.
 *
 * USAGE
 *   pnpm stack start                                   # once; design-audit is then a fast loop
 *   pnpm design-audit /                                # audit the home route
 *   pnpm design-audit /chats/abc --click "[data-testid=drawer-toggle]"
 *                                                       # reveal a surface before auditing
 *   pnpm design-audit / --wait 800                     # settle ms after the click (default 500)
 *   pnpm design-audit / --out home                     # reports/design-audit/home.json
 *   pnpm design-audit / --viewport 1920x1080           # default 1280x800
 *   pnpm design-audit / --fail-on P2                   # exit non-zero at P2+ (default P1)
 *
 * Exit 0 if clean (no finding at/above --fail-on); non-zero otherwise (or on a nav error — an audit
 * that never loaded the page has nothing to say).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { artifactDir, routeSlug } from "./_kit/artifacts.ts";
import { buildUrl, DEFAULT_BASE, launchProbeSession, settle } from "./_kit/browser.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport } from "./_kit/flags.ts";
import { print, printResult } from "./_kit/result.ts";
import type { Finding, RawSamples, Severity } from "./design-audit-checks.ts";
import { checkScriptErrors, collectFindings, isAtOrAboveSeverity, isValidSeverity } from "./design-audit-checks.ts";
import { COLLECT_SAMPLES_JS } from "./design-audit-walker.ts";

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_WAIT_MS = 500;
const DEFAULT_FAIL_ON: Severity = "P1";
const NAV_TIMEOUT_MS = 15_000;
const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
const CLICK_TIMEOUT_MS = 5000;
const MESSAGE_COL_WIDTH = 88;

type Args = {
  route: string;
  base: string;
  click: string | null;
  waitMs: number;
  out: string | null;
  viewport: Viewport;
  failOn: Severity;
};

type FlagHandler = (args: Args, rest: string[]) => void;

const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--click": (a, rest) => {
    a.click = rest.shift() ?? null;
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
    a.viewport = parseViewport(rest.shift() ?? "") ?? a.viewport;
  },
  "--fail-on": (a, rest) => {
    const raw = (rest.shift() ?? "").toUpperCase();
    if (isValidSeverity(raw)) {
      a.failOn = raw;
    } else {
      print(`UNKNOWN --fail-on VALUE ${raw} (keeping ${a.failOn})`);
    }
  },
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    base: DEFAULT_BASE,
    click: null,
    waitMs: DEFAULT_WAIT_MS,
    out: null,
    viewport: DEFAULT_VIEWPORT,
    failOn: DEFAULT_FAIL_ON,
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

// ── Orchestration ────────────────────────────────────────────────────────────

type CaptureOutcome = { navError: string | null; clickFailed: boolean; samples: RawSamples | null };

async function navigateAndReveal(page: Awaited<ReturnType<typeof launchProbeSession>>["page"], opts: Args, url: string): Promise<CaptureOutcome> {
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

  let clickFailed = false;
  if (opts.click !== null) {
    try {
      const loc = page.locator(opts.click).first();
      await loc.waitFor({ state: "visible", timeout: CLICK_TIMEOUT_MS });
      await loc.click({ timeout: CLICK_TIMEOUT_MS });
    } catch (e) {
      clickFailed = true;
      print(`CLICK FAILED  ${opts.click}: ${errorMessage(e)}`);
    }
  }
  await settle(page, opts.waitMs);

  if (navError !== null) {
    return { navError, clickFailed, samples: null };
  }
  try {
    const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples;
    return { navError, clickFailed, samples };
  } catch (e) {
    return { navError: `sample collection threw: ${errorMessage(e)}`, clickFailed, samples: null };
  }
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
  const opts = parseArgs(process.argv.slice(2));
  const url = buildUrl(opts.base, opts.route);
  const name = opts.out ?? routeSlug(opts.route);
  const outPath = join(await artifactDir("design-audit"), `${name}.json`);

  const session = await launchProbeSession({
    headless: true,
    viewport: opts.viewport,
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });

  const { navError, clickFailed, samples } = await navigateAndReveal(session.page, opts, url);
  await session.browser.close();

  // Uncaught page exceptions are findings in their own right (script-error, P0) — the probe
  // session's pageerror capture is wired from nav start (_kit/browser.ts wirePage).
  const findings = samples === null ? [] : collectFindings(samples);
  findings.push(...checkScriptErrors(session.pageErrors));
  const counts = countBySeverity(findings);
  const failed = navError !== null || findings.some((f) => isAtOrAboveSeverity(f.severity, opts.failOn));

  await writeFile(
    outPath,
    JSON.stringify(
      {
        route: opts.route,
        url,
        viewport: opts.viewport,
        failOn: opts.failOn,
        navError,
        findings,
        counts,
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
  printFindingsTable(findings);

  printResult("design-audit", [
    ["findings", findings.length],
    ["p0", counts.P0],
    ["p1", counts.P1],
    ["p2", counts.P2],
    ["p3", counts.P3],
    ["fail-on", opts.failOn],
    ["click-failed", clickFailed ? "yes" : "no"],
    ["nav", navError === null ? "OK" : "ERROR"],
    ["out", outPath],
  ]);
  return failed ? 1 : 0;
}

void main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    print(`design-audit failed: ${errorMessage(err)}`);
    process.exit(1);
  },
);
