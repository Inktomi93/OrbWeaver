// Playwright-chromium bootstrap shared by the browser probes.
// INIT SCRIPTS SHIP AS RAW STRINGS, not functions: the DOM-less tsconfig aggregator won't
// compile a function body touching `window`. (The historical second reason — tsx's esbuild
// keepNames `__name` helper breaking serialized functions — died with the 2026-08-03 tsx shed;
// the lib-mismatch reason stands alone.)

import process from "node:process";
import type { Browser, BrowserContext, ConsoleMessage, Page } from "@playwright/test";
import { chromium, devices } from "@playwright/test";
import type { AppearancePatch } from "./appearance.ts";
import { installSettingsShim } from "./appearance.ts";
import type { Viewport } from "./argv.ts";
import type { ThemeRequest } from "./theme.ts";

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

export interface LocalStorageSeed {
  readonly key: string;
  readonly value: string;
}

export interface ProbeLaunchOptions {
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
   *  byte-identical to the old API). Mutually exclusive with a \>1 `pages` in practice (each context still
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
  /** `--appearance` / `--appearance-preset` / `--full-motion`: a deep-merge patch shimmed over the REAL
   *  `settings.getUserSettings` response on EVERY context, so the app renders as if those appearance keys
   *  were set while the db row is never touched (see _kit/appearance.ts for the mechanism + the
   *  media-query-vs-app-setting axis difference). null/absent = drive the account's real state. */
  readonly appearance?: AppearancePatch | null;
  /** `--theme <name|id|none>`: the ACTIVE THEME the run pretends is selected, shimmed over the SAME
   *  `settings.getUserSettings` response (the selection only — the app then fetches the real theme row).
   *  null/absent = the account's own theme. See _kit/theme.ts. */
  readonly theme?: ThemeRequest | null;
  /** Record a Playwright trace; the caller saves it on failure or discards it on success. */
  readonly trace?: boolean;
  /** Prefix for per-context full HAR files. The caller removes green-run files after context close. */
  readonly harPathPrefix?: string;
}

export interface CapturedRequest {
  method: string;
  url: string;
  status: number | null;
  failed: string | null;
  /** Playwright resourceType (document/xhr/fetch/image/…) — annotates failures. */
  type: string;
}

export interface CapturedConsole {
  readonly type: string;
  readonly text: string;
  readonly location: { readonly url: string; readonly line: number; readonly column: number } | null;
  readonly line: string;
}

/** One isolated browser context's captured state + pages — `--contexts N` opens N of these (own cookies/
 *  localStorage each); the single-context default path is `contexts[0]`. */
export interface ProbeContext {
  readonly context: BrowserContext;
  readonly pages: readonly Page[];
  readonly consoleLines: string[];
  readonly consoleMessages: CapturedConsole[];
  readonly pageErrors: string[];
  readonly requests: Map<string, CapturedRequest>;
  readonly harPath: string | null;
}

export interface ProbeSession {
  readonly browser: Browser;
  readonly context: BrowserContext;
  /** The first (default) page — the single-page path uses only this. Byte-identical to the old API. */
  readonly page: Page;
  /** All pages opened in the shared context (`pages[0] === page`). `--pages N` opens N; default is `[page]`.
   *  Console/pageerror/request capture is wired on EVERY page → the session-wide arrays below are total. */
  readonly pages: readonly Page[];
  /** `[type] text (url:line:col)` — source location tagged on error/warning only. */
  readonly consoleLines: string[];
  /** Structured console entries for verdicts/manifests; consoleLines remains the human report. */
  readonly consoleMessages: CapturedConsole[];
  /** `Name: message\nstack` blocks from pageerror. */
  readonly pageErrors: string[];
  /** Keyed by URL; status/failed filled in as responses land. */
  readonly requests: Map<string, CapturedRequest>;
  /** Every context opened (`contexts[0]` mirrors the flat `context`/`page`/`pages` fields above — the
   *  single-context default is byte-identical). `--contexts N` populates N of these. */
  readonly contexts: readonly ProbeContext[];
}

interface PageCapture {
  readonly media: { colorScheme?: "light" | "dark"; reducedMotion?: "reduce" };
  readonly consoleLines: string[];
  readonly consoleMessages: CapturedConsole[];
  readonly pageErrors: string[];
  readonly requests: Map<string, CapturedRequest>;
}

/** Wire console/pageerror/request capture + media emulation onto one page — shared by every context so
 *  `--pages` (tabs within a context) and `--contexts` (isolated contexts) both get identical capture. */
function wirePage(page: Page, capture: PageCapture): Promise<void> {
  const { media, consoleLines, consoleMessages, pageErrors, requests } = capture;
  const apply = async (): Promise<void> => {
    if (media.colorScheme !== undefined || media.reducedMotion !== undefined) {
      await page.emulateMedia(media);
    }
  };
  page.on("console", (m: ConsoleMessage) => {
    const t = m.type();
    const loc = m.location();
    const where = (t === "error" || t === "warning") && loc.url ? ` (${loc.url}:${loc.lineNumber}:${loc.columnNumber})` : "";
    const line = `[${t}] ${m.text()}${where}`;
    consoleLines.push(line);
    consoleMessages.push({
      type: t,
      text: m.text(),
      location: loc.url ? { url: loc.url, line: loc.lineNumber, column: loc.columnNumber } : null,
      line,
    });
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

interface BuildContextArgs {
  readonly browser: Browser;
  readonly opts: ProbeLaunchOptions;
  readonly deviceDescriptor: (typeof devices)[string] | null;
  readonly sessionCookie: string | null;
  readonly contextIndex: number;
}

async function openRecordedContext(args: BuildContextArgs): Promise<{ readonly context: BrowserContext; readonly harPath: string | null }> {
  const { browser, opts, deviceDescriptor, contextIndex } = args;
  const sizing = deviceDescriptor ?? { viewport: opts.viewport };
  const harPath = opts.harPathPrefix === undefined ? null : `${opts.harPathPrefix}${(opts.contexts ?? 1) > 1 ? `-u${contextIndex}` : ""}.har`;
  const context = await browser.newContext({
    ...sizing,
    ...(opts.recordVideoDir === undefined ? {} : { recordVideo: { dir: opts.recordVideoDir, size: opts.viewport } }),
    ...(harPath === null ? {} : { recordHar: { path: harPath, content: "omit" as const, mode: "full" as const } }),
  });
  if (opts.trace === true) {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }
  return { context, harPath };
}

async function seedContext(context: BrowserContext, opts: ProbeLaunchOptions, sessionCookie: string | null): Promise<void> {
  // BEFORE the localStorage seeds and before any page exists: the shim must be live for the app's FIRST
  // settings read, which is what paints the boot veil and stamps <html data-reduced-motion>/[data-theme].
  await installSettingsShim(context, { appearance: opts.appearance ?? null, theme: opts.theme ?? null });

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
}

/** One context's full setup: create it, seed localStorage + (optionally) a session cookie, open its
 *  `pages` tabs with capture wired. Cookie seeding happens BEFORE any page opens (Playwright's
 *  `addCookies` is context-level and doesn't need a page) — so the very first navigation is already
 *  authenticated, no login-form drive needed in-page. */
async function buildContext(args: BuildContextArgs): Promise<ProbeContext> {
  const { opts, sessionCookie } = args;
  const { context, harPath } = await openRecordedContext(args);
  await seedContext(context, opts, sessionCookie);

  const consoleLines: string[] = [];
  const consoleMessages: CapturedConsole[] = [];
  const pageErrors: string[] = [];
  const requests = new Map<string, CapturedRequest>();
  const media: { colorScheme?: "light" | "dark"; reducedMotion?: "reduce" } = {};
  if (opts.colorScheme !== null) {
    media.colorScheme = opts.colorScheme;
  }
  if (opts.reducedMotion) {
    media.reducedMotion = "reduce";
  }

  const capture: PageCapture = { media, consoleLines, consoleMessages, pageErrors, requests };
  const pageCount = Math.max(1, opts.pages ?? 1);
  const pages: Page[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: pages open + wire SEQUENTIALLY — a shared-context tab must have its listeners attached (and emulateMedia applied) before the next opens; N is tiny (typically 2).
    const page = await context.newPage();
    await wirePage(page, capture);
    pages.push(page);
  }

  return { context, pages, consoleLines, consoleMessages, pageErrors, requests, harPath };
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
    const built = await buildContext({ browser, opts, deviceDescriptor, sessionCookie: cookies[i] ?? null, contextIndex: i });
    contexts.push(built);
  }
  const first = contexts[0] as ProbeContext;

  return {
    browser,
    context: first.context,
    page: first.pages[0] as Page,
    pages: first.pages,
    consoleLines: first.consoleLines,
    consoleMessages: first.consoleMessages,
    pageErrors: first.pageErrors,
    requests: first.requests,
    contexts,
  };
}
