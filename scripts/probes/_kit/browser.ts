// Playwright-chromium bootstrap shared by the browser probes.
// INIT SCRIPTS SHIP AS RAW STRINGS, not functions: the DOM-less tsconfig aggregator won't
// compile a function body touching `window`, and tsx's esbuild keepNames `__name` helper
// doesn't exist inside the browser context when the function is serialized.

import process from "node:process";
import type { Browser, BrowserContext, ConsoleMessage, Page } from "@playwright/test";
import { chromium, devices } from "@playwright/test";
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
  /** A Playwright device descriptor name (`--mobile` → "iPhone 14 Pro Max"): FULL touch + mobile-UA + DPR
   *  emulation folded into the context, not just a viewport. When set it supersedes `viewport`/emulateMedia
   *  DPR (the descriptor carries its own). An unknown name throws (loud, never silent-desktop). */
  readonly device?: string | null;
  /** How many pages (tabs) to open in the ONE shared context (shared auth/localStorage). Default 1. */
  readonly pages?: number;
  /** How many ISOLATED browser contexts to open (`--contexts N`) — each gets its OWN cookies/localStorage,
   *  so N different logged-in users can be driven in one browser process. Default 1 (a single context,
   *  byte-identical to the old API). Mutually exclusive with a >1 `pages` in practice (each context still
   *  gets `pages` tabs, but multi-context + multi-tab-per-context is an unexercised combination — snap.ts
   *  refuses it rather than silently under-testing it). */
  readonly contexts?: number;
  /** Per-context session cookie to seed BEFORE the context's pages open (`--contexts`/`--as` login) — index
   *  `i` seeds context `i`; a context beyond this array's length gets none (the single-context default
   *  path, and any context past what `--contexts` resolved credentials for). */
  readonly contextCookies?: readonly (string | null)[];
  /** The HOSTNAME (no scheme/port — e.g. "localhost") the seeded cookie's Domain applies to. A bare
   *  hostname, not a full `url`: Playwright's CDP `Storage.setCookies` REJECTS an `__Host-`-prefixed
   *  cookie when given a `url` (even `secure:true` alongside it) — "Invalid cookie fields", verified
   *  empirically. `domain`+`path`+`secure:true` (no `url`) is the combination that actually lands it. */
  readonly cookieDomain?: string;
};

export type CapturedRequest = {
  method: string;
  url: string;
  status: number | null;
  failed: string | null;
  /** Playwright resourceType (document/xhr/fetch/image/…) — annotates failures. */
  type: string;
};

/** One isolated browser context's captured state + pages — `--contexts N` opens N of these (own cookies/
 *  localStorage each); the single-context default path is `contexts[0]`. */
export type ProbeContext = {
  readonly context: BrowserContext;
  readonly pages: readonly Page[];
  readonly consoleLines: string[];
  readonly pageErrors: string[];
  readonly requests: Map<string, CapturedRequest>;
};

export type ProbeSession = {
  readonly browser: Browser;
  readonly context: BrowserContext;
  /** The first (default) page — the single-page path uses only this. Byte-identical to the old API. */
  readonly page: Page;
  /** All pages opened in the shared context (`pages[0] === page`). `--pages N` opens N; default is `[page]`.
   *  Console/pageerror/request capture is wired on EVERY page → the session-wide arrays below are total. */
  readonly pages: readonly Page[];
  /** `[type] text (url:line:col)` — source location tagged on error/warning only. */
  readonly consoleLines: string[];
  /** `Name: message\nstack` blocks from pageerror. */
  readonly pageErrors: string[];
  /** Keyed by URL; status/failed filled in as responses land. */
  readonly requests: Map<string, CapturedRequest>;
  /** Every context opened (`contexts[0]` mirrors the flat `context`/`page`/`pages` fields above — the
   *  single-context default is byte-identical). `--contexts N` populates N of these. */
  readonly contexts: readonly ProbeContext[];
};

type PageCapture = {
  readonly media: { colorScheme?: "light" | "dark"; reducedMotion?: "reduce" };
  readonly consoleLines: string[];
  readonly pageErrors: string[];
  readonly requests: Map<string, CapturedRequest>;
};

/** Wire console/pageerror/request capture + media emulation onto one page — shared by every context so
 *  `--pages` (tabs within a context) and `--contexts` (isolated contexts) both get identical capture. */
function wirePage(page: Page, capture: PageCapture): Promise<void> {
  const { media, consoleLines, pageErrors, requests } = capture;
  const apply = async (): Promise<void> => {
    if (media.colorScheme !== undefined || media.reducedMotion !== undefined) {
      await page.emulateMedia(media);
    }
  };
  page.on("console", (m: ConsoleMessage) => {
    const t = m.type();
    const loc = m.location();
    const where = (t === "error" || t === "warning") && loc.url ? ` (${loc.url}:${loc.lineNumber}:${loc.columnNumber})` : "";
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
  return apply();
}

/** One context's full setup: create it, seed localStorage + (optionally) a session cookie, open its
 *  `pages` tabs with capture wired. Cookie seeding happens BEFORE any page opens (Playwright's
 *  `addCookies` is context-level and doesn't need a page) — so the very first navigation is already
 *  authenticated, no login-form drive needed in-page. */
async function buildContext(
  browser: Browser,
  opts: ProbeLaunchOptions,
  deviceDescriptor: (typeof devices)[string] | null,
  sessionCookie: string | null,
): Promise<ProbeContext> {
  const sizing = deviceDescriptor ?? { viewport: opts.viewport };
  const context = await browser.newContext({
    ...sizing,
    ...(opts.recordVideoDir === undefined ? {} : { recordVideo: { dir: opts.recordVideoDir, size: opts.viewport } }),
  });

  if (opts.localStorage.length > 0) {
    const seedScript = `(() => {
      try {
        for (const p of ${JSON.stringify(opts.localStorage)}) window.localStorage.setItem(p.key, p.value);
      } catch { /* disabled storage — page renders defaults */ }
    })();`;
    await context.addInitScript({ content: seedScript });
  }

  if (sessionCookie !== null && opts.cookieDomain !== undefined) {
    // Set-Cookie header shape: "name=value; Path=/; HttpOnly; Secure; ...". Only name=value is ours to
    // parse — HttpOnly/SameSite/Max-Age is server policy, re-supplied here as Playwright cookie fields
    // (domain/path/secure), NOT re-derived from a `url` (see the cookieDomain doc: a `url` + an
    // `__Host-`-prefixed name is the exact combination CDP rejects).
    const [pair] = sessionCookie.split(";");
    const eq = (pair ?? "").indexOf("=");
    if (eq > 0) {
      await context.addCookies([{ name: (pair ?? "").slice(0, eq), value: (pair ?? "").slice(eq + 1), domain: opts.cookieDomain, path: "/", secure: true }]);
    }
  }

  const consoleLines: string[] = [];
  const pageErrors: string[] = [];
  const requests = new Map<string, CapturedRequest>();
  const media: { colorScheme?: "light" | "dark"; reducedMotion?: "reduce" } = {};
  if (opts.colorScheme !== null) {
    media.colorScheme = opts.colorScheme;
  }
  if (opts.reducedMotion) {
    media.reducedMotion = "reduce";
  }

  const capture: PageCapture = { media, consoleLines, pageErrors, requests };
  const pageCount = Math.max(1, opts.pages ?? 1);
  const pages: Page[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: pages open + wire SEQUENTIALLY — a shared-context tab must have its listeners attached (and emulateMedia applied) before the next opens; N is tiny (typically 2).
    const page = await context.newPage();
    await wirePage(page, capture);
    pages.push(page);
  }

  return { context, pages, consoleLines, pageErrors, requests };
}

export async function launchProbeSession(opts: ProbeLaunchOptions): Promise<ProbeSession> {
  const browser = await chromium.launch({ headless: opts.headless });
  // A --mobile device descriptor carries its own viewport + userAgent + deviceScaleFactor + isMobile +
  // hasTouch — fold it into the context so touch/pointer:coarse/mobile-UA are REAL, not a bare viewport.
  // Look it up loudly: an unknown name must throw, never silently fall back to desktop.
  let deviceDescriptor: (typeof devices)[string] | null = null;
  if (opts.device !== undefined && opts.device !== null) {
    const d = devices[opts.device];
    if (d === undefined) {
      throw new Error(`unknown Playwright device "${opts.device}" (see playwright devices registry)`);
    }
    deviceDescriptor = d;
  }

  const contextCount = Math.max(1, opts.contexts ?? 1);
  const cookies = opts.contextCookies ?? [];
  const contexts: ProbeContext[] = [];
  for (let i = 0; i < contextCount; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: contexts open SEQUENTIALLY — same discipline as the per-context page loop; N is tiny (typically ≤4).
    const built = await buildContext(browser, opts, deviceDescriptor, cookies[i] ?? null);
    contexts.push(built);
  }
  const first = contexts[0] as ProbeContext;

  return {
    browser,
    context: first.context,
    page: first.pages[0] as Page,
    pages: first.pages,
    consoleLines: first.consoleLines,
    pageErrors: first.pageErrors,
    requests: first.requests,
    contexts,
  };
}
