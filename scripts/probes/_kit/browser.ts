// Playwright-chromium bootstrap shared by the browser probes.
// INIT SCRIPTS SHIP AS RAW STRINGS, not functions: the DOM-less tsconfig aggregator won't
// compile a function body touching `window`, and tsx's esbuild keepNames `__name` helper
// doesn't exist inside the browser context when the function is serialized.

import process from "node:process";
import type { Browser, BrowserContext, ConsoleMessage, Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import type { Viewport } from "./flags.ts";

// biome-ignore lint/style/noProcessEnv: SNAP_BASE_URL is a probe-harness knob (where the running dev stack answers; `localhost`, not 127.0.0.1 — vite v8 binds [::1] only) — ambient tooling env, not app config.
export const DEFAULT_BASE = process.env["SNAP_BASE_URL"] ?? "http://localhost:5173";
// biome-ignore lint/style/noProcessEnv: DEBUG_TOKEN is the ambient dev-stack debug token the operator already exported for curl loops; snap seeds it into `orb:debug-token` so token-gated routes render real data. Harness plumbing, not app config.
export const DEFAULT_DEBUG_TOKEN = process.env["DEBUG_TOKEN"] ?? "";

const TRAILING_SLASH_RE = /\/$/u;

/** `base + route` with exactly one slash at the join. */
export function buildUrl(base: string, route: string): string {
  return `${base.replace(TRAILING_SLASH_RE, "")}${route.startsWith("/") ? "" : "/"}${route}`;
}

/** Wall-clock settle — deliberate, bounded (this is an observation harness, not a test). */
export async function settle(page: Page, ms: number): Promise<void> {
  // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: deliberate bounded observation window (see docblock) — the flakiness this rule hunts in tests is the probe's feature.
  await page.waitForTimeout(ms);
}

export type LocalStorageSeed = { readonly key: string; readonly value: string };

export type ProbeLaunchOptions = {
  /** false = headed (`--vnc`, when you DO want to look). */
  readonly headless: boolean;
  readonly viewport: Viewport;
  /** emulateMedia prefers-color-scheme; null = leave the browser default. */
  readonly colorScheme: "light" | "dark" | null;
  /** emulateMedia reducedMotion:"reduce". */
  readonly reducedMotion: boolean;
  /** Seeded BEFORE any page script runs (addInitScript) — the only reliable moment. */
  readonly localStorage: readonly LocalStorageSeed[];
  /** When set, the context records video into this dir at the viewport size (record.ts).
   *  Read the handle via `page.video()` BEFORE `context.close()`, resolve `.path()` after. */
  readonly recordVideoDir?: string;
};

export type CapturedRequest = {
  method: string;
  url: string;
  status: number | null;
  failed: string | null;
  /** Playwright resourceType (document/xhr/fetch/image/…) — annotates failures. */
  type: string;
};

export type ProbeSession = {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  /** `[type] text (url:line:col)` — source location tagged on error/warning only. */
  readonly consoleLines: string[];
  /** `Name: message\nstack` blocks from pageerror. */
  readonly pageErrors: string[];
  /** Keyed by URL; status/failed filled in as responses land. */
  readonly requests: Map<string, CapturedRequest>;
};

export async function launchProbeSession(opts: ProbeLaunchOptions): Promise<ProbeSession> {
  const browser = await chromium.launch({ headless: opts.headless });
  const context = await browser.newContext({
    viewport: opts.viewport,
    ...(opts.recordVideoDir === undefined
      ? {}
      : { recordVideo: { dir: opts.recordVideoDir, size: opts.viewport } }),
  });

  if (opts.localStorage.length > 0) {
    const seedScript = `(() => {
      try {
        for (const p of ${JSON.stringify(opts.localStorage)}) window.localStorage.setItem(p.key, p.value);
      } catch { /* disabled storage — page renders defaults */ }
    })();`;
    await context.addInitScript({ content: seedScript });
  }

  const page = await context.newPage();

  // Media emulation BEFORE navigation so the first paint already honors it.
  const media: { colorScheme?: "light" | "dark"; reducedMotion?: "reduce" } = {};
  if (opts.colorScheme !== null) {
    media.colorScheme = opts.colorScheme;
  }
  if (opts.reducedMotion) {
    media.reducedMotion = "reduce";
  }
  if (media.colorScheme !== undefined || media.reducedMotion !== undefined) {
    await page.emulateMedia(media);
  }

  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const requests = new Map<string, CapturedRequest>();

  page.on("console", (m: ConsoleMessage) => {
    const t = m.type();
    const loc = m.location();
    const where =
      (t === "error" || t === "warning") && loc.url
        ? ` (${loc.url}:${loc.lineNumber}:${loc.columnNumber})`
        : "";
    consoleLines.push(`[${t}] ${m.text()}${where}`);
  });
  page.on("pageerror", (e: Error) => {
    pageErrors.push(`${e.name}: ${e.message}\n${e.stack ?? ""}`);
  });
  page.on("request", (r) => {
    requests.set(r.url(), {
      method: r.method(),
      url: r.url(),
      status: null,
      failed: null,
      type: r.resourceType(),
    });
  });
  page.on("response", (r) => {
    const cur = requests.get(r.url());
    if (cur) {
      cur.status = r.status();
    }
  });
  page.on("requestfailed", (r) => {
    const cur = requests.get(r.url());
    if (cur) {
      cur.failed = r.failure()?.errorText ?? "failed";
    }
  });

  return { browser, context, page, consoleLines, pageErrors, requests };
}
