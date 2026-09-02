// Playwright-chromium bootstrap shared by the browser probes.
// INIT SCRIPTS SHIP AS RAW STRINGS, not functions: the DOM-less tsconfig aggregator won't
// compile a function body touching `window`. (The historical second reason — tsx's esbuild
// keepNames `__name` helper breaking serialized functions — died with the 2026-08-03 tsx shed;
// the lib-mismatch reason stands alone.)

import process from "node:process";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { chromium, devices } from "@playwright/test";
import type { AppearancePatch, SettingsShimEvidence } from "./appearance.ts";
import { installSettingsShim } from "./appearance.ts";
import type { Viewport } from "./argv.ts";
import type { CapturedConsole, CapturedRequest, PageCapture } from "./browser-capture.ts";
import { wireProbePage } from "./browser-capture.ts";
import type { BrowserEnvironmentContract } from "./browser-environment.ts";
import { resolveBrowserEnvironmentContract } from "./browser-environment.ts";
import { resolveProbeMedia } from "./browser-media.ts";
import type { ThemeRequest } from "./theme.ts";

export type { CapturedConsole, CapturedRequest } from "./browser-capture.ts";

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
  /** Browser media contrast arm. null leaves the browser default; matrix cells state both polarities. */
  readonly contrast?: "more" | "no-preference" | null;
  /** Chromium-only prefers-reduced-transparency arm, applied through CDP and read back with matchMedia. */
  readonly reducedTransparency?: boolean;
  /** Seeded BEFORE any page script runs (addInitScript) — the only reliable moment. */
  readonly localStorage: readonly LocalStorageSeed[];
  /** When set, the context records video into this dir at the viewport size (record.ts).
   *  Read the handle via `page.video()` BEFORE `context.close()`, resolve `.path()` after. */
  readonly recordVideoDir?: string;
  /** A Playwright device descriptor name (`--mobile` → "iPhone 14 Pro Max"): FULL touch + mobile-UA + DPR
   *  emulation folded into the context, not just a viewport. When set it supersedes `viewport`/emulateMedia
   *  DPR (the descriptor carries its own). An unknown name throws (loud, never silent-desktop). */
  readonly device?: string | null;
  /** Raise the CONTEXT's devicePixelRatio (snap's `--scale <n>`, #915). Absent = 1 on a plain context,
   *  or whatever a `device` descriptor carries. Playwright's `screenshot({ scale })` accepts only
   *  "css" | "device", so THIS is the only route to an arbitrary render density — and it is declared to
   *  the environment contract (resolveBrowserEnvironmentContract) rather than applied behind its back,
   *  or the DPR identity check would report a mismatch the caller deliberately asked for. */
  readonly deviceScaleFactor?: number;
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
  /** Internal tooling-only persistent profile. Cascade provenance needs Chrome's ephemeral
   *  `DevToolsActivePort`; ordinary probes leave this absent and retain `chromium.launch()`. */
  readonly persistentProfileDir?: string;
  /** Browser process args owned by a higher-level tooling lifecycle. Never populated from raw user argv. */
  readonly browserArgs?: readonly string[];
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
  readonly settingsEvidence: SettingsShimEvidence;
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
  /** Requested/applied context identity from the one launcher that resolved the Playwright descriptor.
   *  Pair it with `readBrowserEnvironment(page, environmentContract)` for live runtime evidence. */
  readonly environmentContract: BrowserEnvironmentContract;
  /** Every context opened (`contexts[0]` mirrors the flat `context`/`page`/`pages` fields above — the
   *  single-context default is byte-identical). `--contexts N` populates N of these. */
  readonly contexts: readonly ProbeContext[];
  /** Higher-level resources whose lifetime is coupled to this browser (for example a loopback asset
   * server and its temporary profile). Closed after browser/context teardown on every path. */
  readonly cleanup?: readonly (() => Promise<void>)[];
}

interface ProbeResourceOwner {
  readonly browser: { readonly close: () => Promise<void> };
  readonly contexts: readonly { readonly context: { readonly close: () => Promise<void> } }[];
  readonly cleanup?: readonly (() => Promise<void>)[];
}

interface BuildContextArgs {
  readonly browser: Browser;
  readonly opts: ProbeLaunchOptions;
  readonly deviceDescriptor: (typeof devices)[string] | null;
  readonly sessionCookie: string | null;
  readonly contextIndex: number;
  readonly ownedContexts: { readonly context: BrowserContext }[];
  readonly persistentContext?: BrowserContext;
}

async function openRecordedContext(args: BuildContextArgs): Promise<{ readonly context: BrowserContext; readonly harPath: string | null }> {
  const { browser, opts, deviceDescriptor, contextIndex, ownedContexts, persistentContext } = args;
  const sizing = {
    ...(deviceDescriptor ?? { viewport: opts.viewport }),
    ...(opts.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: opts.deviceScaleFactor }),
  };
  const harPath = opts.harPathPrefix === undefined ? null : `${opts.harPathPrefix}${(opts.contexts ?? 1) > 1 ? `-u${contextIndex}` : ""}.har`;
  const context =
    persistentContext ??
    (await browser.newContext({
      ...sizing,
      ...(opts.recordVideoDir === undefined ? {} : { recordVideo: { dir: opts.recordVideoDir, size: opts.viewport } }),
      ...(harPath === null ? {} : { recordHar: { path: harPath, content: "omit" as const, mode: "full" as const } }),
    }));
  // Register ownership immediately: tracing, init scripts, cookies, page creation, and media setup can
  // all throw before a complete ProbeContext exists, but the browser context is already live.
  ownedContexts.push({ context });
  if (opts.trace === true) {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }
  return { context, harPath };
}

async function seedContext(context: BrowserContext, opts: ProbeLaunchOptions, sessionCookie: string | null): Promise<SettingsShimEvidence> {
  // BEFORE the localStorage seeds and before any page exists: the shim must be live for the app's FIRST
  // settings read, which is what paints the boot veil and stamps <html data-reduced-motion>/[data-theme].
  const settingsEvidence = await installSettingsShim(context, { appearance: opts.appearance ?? null, theme: opts.theme ?? null });

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
  return settingsEvidence;
}

/** One context's full setup: create it, seed localStorage + (optionally) a session cookie, open its
 *  `pages` tabs with capture wired. Cookie seeding happens BEFORE any page opens (Playwright's
 *  `addCookies` is context-level and doesn't need a page) — so the very first navigation is already
 *  authenticated, no login-form drive needed in-page. */
async function buildContext(args: BuildContextArgs): Promise<ProbeContext> {
  const { opts, sessionCookie } = args;
  const { context, harPath } = await openRecordedContext(args);
  const settingsEvidence = await seedContext(context, opts, sessionCookie);

  const consoleLines: string[] = [];
  const consoleMessages: CapturedConsole[] = [];
  const pageErrors: string[] = [];
  const requests = new Map<string, CapturedRequest>();
  const media = resolveProbeMedia(opts);

  const capture: PageCapture = { media, consoleLines, consoleMessages, pageErrors, requests };
  const pageCount = Math.max(1, opts.pages ?? 1);
  const pages: Page[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const page = await context.newPage();
    await wireProbePage(page, capture);
    pages.push(page);
  }

  return { context, pages, consoleLines, consoleMessages, pageErrors, requests, harPath, settingsEvidence };
}

function resolveDeviceDescriptor(opts: ProbeLaunchOptions): (typeof devices)[string] | null {
  if (opts.device === undefined || opts.device === null) {
    return null;
  }
  const descriptor = devices[opts.device];
  if (descriptor === undefined) {
    throw new Error(`unknown Playwright device "${opts.device}" (see playwright devices registry)`);
  }
  return descriptor;
}

interface LaunchedBrowser {
  readonly browser: Browser;
  readonly persistentContext?: BrowserContext;
}

async function launchOwnedBrowser(opts: ProbeLaunchOptions, deviceDescriptor: (typeof devices)[string] | null): Promise<LaunchedBrowser> {
  const browserArgs = opts.browserArgs === undefined ? undefined : [...opts.browserArgs];
  if (opts.persistentProfileDir === undefined) {
    return { browser: await chromium.launch({ headless: opts.headless, ...(browserArgs === undefined ? {} : { args: browserArgs }) }) };
  }
  const sizing = {
    ...(deviceDescriptor ?? { viewport: opts.viewport }),
    ...(opts.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: opts.deviceScaleFactor }),
  };
  const harPath = opts.harPathPrefix === undefined ? null : `${opts.harPathPrefix}.har`;
  const persistentContext = await chromium.launchPersistentContext(opts.persistentProfileDir, {
    ...sizing,
    headless: opts.headless,
    ...(browserArgs === undefined ? {} : { args: browserArgs }),
    ...(opts.recordVideoDir === undefined ? {} : { recordVideo: { dir: opts.recordVideoDir, size: opts.viewport } }),
    ...(harPath === null ? {} : { recordHar: { path: harPath, content: "omit" as const, mode: "full" as const } }),
  });
  const browser = persistentContext.browser();
  if (browser === null) {
    await persistentContext.close();
    throw new Error("persistent Playwright context has no browser owner");
  }
  await Promise.all(persistentContext.pages().map((page) => page.close()));
  return { browser, persistentContext };
}

export async function launchProbeSession(opts: ProbeLaunchOptions): Promise<ProbeSession> {
  // A --mobile device descriptor carries its own viewport + userAgent + deviceScaleFactor + isMobile +
  // hasTouch — fold it into the context so touch/pointer:coarse/mobile-UA are REAL, not a bare viewport.
  // Look it up loudly: an unknown name must throw, never silently fall back to desktop.
  const deviceDescriptor = resolveDeviceDescriptor(opts);
  const environmentContract = resolveBrowserEnvironmentContract(opts, deviceDescriptor);
  const contextCount = Math.max(1, opts.contexts ?? 1);
  if (opts.persistentProfileDir !== undefined && contextCount !== 1) {
    throw new Error("persistent browser probes support exactly one context");
  }
  const { browser, persistentContext } = await launchOwnedBrowser(opts, deviceDescriptor);

  const cookies = opts.contextCookies ?? [];
  const contexts: ProbeContext[] = [];
  const ownedContexts: { readonly context: BrowserContext }[] = [];
  // @orb-gate-ignore caught-failure-ownership(empty:error): closeProbeSessionAfterError is typed Promise<never> — it always rethrows the primary error (wrapped with any cleanup failure), never returns. Ends if that function stops rethrowing unconditionally.
  try {
    for (let i = 0; i < contextCount; i += 1) {
      const built = await buildContext({
        browser,
        opts,
        deviceDescriptor,
        sessionCookie: cookies[i] ?? null,
        contextIndex: i,
        ownedContexts,
        ...(persistentContext === undefined ? {} : { persistentContext }),
      });
      contexts.push(built);
    }
  } catch (error) {
    await closeProbeSessionAfterError({ browser, contexts: ownedContexts }, error);
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
    environmentContract,
    contexts,
  };
}

/** Close every owned context and the browser even when the probe body throws or returns early. */
export async function closeProbeSession(session: ProbeResourceOwner): Promise<void> {
  const contextResults = await Promise.allSettled(session.contexts.map(({ context }) => context.close()));
  const failures = contextResults.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  // @orb-gate-ignore caught-failure-ownership(empty:error): collected into failures[] which the two checks below rethrow as-is or as an AggregateError — never silently dropped. Ends if the failures array stops being surfaced after this block.
  try {
    await session.browser.close();
  } catch (error) {
    failures.push(error);
  }
  const cleanupResults = await Promise.allSettled((session.cleanup ?? []).map((close) => close()));
  failures.push(...cleanupResults.flatMap((result) => (result.status === "rejected" ? [result.reason] : [])));
  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, "multiple browser probe resources failed to close");
  }
}

function cleanupFailures(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors : [error];
}

function probeFailureWithCleanup(primary: unknown, cleanup: unknown): AggregateError {
  return new AggregateError([primary, ...cleanupFailures(cleanup)], "browser probe failed and cleanup also failed", { cause: primary });
}

/** Close after a primary failure without letting teardown erase it; both failures remain inspectable. */
export async function closeProbeSessionAfterError(session: ProbeResourceOwner, primary: unknown): Promise<never> {
  try {
    await closeProbeSession(session);
  } catch (cleanup) {
    throw probeFailureWithCleanup(primary, cleanup);
  }
  throw primary;
}

/** Run one probe body under the session's ownership boundary; early returns and throws both close it. */
export async function withProbeSession<TSession extends ProbeResourceOwner, TResult>(
  session: TSession,
  run: (session: TSession) => Promise<TResult>,
): Promise<TResult> {
  let result: TResult;
  try {
    result = await run(session);
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
  await closeProbeSession(session);
  return result;
}
