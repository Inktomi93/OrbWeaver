// Playwright-chromium bootstrap shared by the browser probes.
// INIT SCRIPTS SHIP AS RAW STRINGS, not functions: the DOM-less tsconfig aggregator won't
// compile a function body touching `window`. (The historical second reason — tsx's esbuild
// keepNames `__name` helper breaking serialized functions — died with the 2026-08-03 tsx shed;
// the lib-mismatch reason stands alone.)

import process from "node:process";
import type { Browser, BrowserContext, devices, Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import type { CapturedConsole, CapturedRequest, PageCapture } from "./browser-capture.ts";
import { wireProbePage } from "./browser-capture.ts";
import { buildProbeContext, resolveDeviceDescriptor } from "./browser-context.ts";
import type { ProbeAttachOptions, ProbeContext, ProbeLaunchOptions, ProbeSession } from "./browser-contract.ts";
import { resolveBrowserEnvironmentContract } from "./browser-environment.ts";
import { resolveProbeMedia } from "./browser-media.ts";
import { DEV_PORTS } from "./ports.ts";

export type { CapturedConsole, CapturedRequest } from "./browser-capture.ts";

// biome-ignore lint/style/noProcessEnv: SNAP_BASE_URL is a probe-harness knob (where the running dev stack answers; `localhost`, not 127.0.0.1 — vite v8 binds [::1] only) — ambient tooling env, not app config.
export const DEFAULT_BASE = process.env["SNAP_BASE_URL"] ?? `http://localhost:${DEV_PORTS.vite}`;
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

interface ProbeResourceOwner {
  readonly browser: { readonly close: () => Promise<void> };
  readonly contexts: readonly { readonly context: { readonly close: () => Promise<void> }; readonly owned?: boolean }[];
  readonly cleanup?: readonly (() => Promise<void>)[];
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
  const contextCount = Math.max(1, opts.contexts ?? 1);
  if (opts.persistentProfileDir !== undefined && contextCount !== 1) {
    throw new Error("persistent browser profiles own one launch context; open additional isolated contexts with openProbeContext");
  }
  const { browser, persistentContext } = await launchOwnedBrowser(opts, deviceDescriptor);

  const cookies = opts.contextCookies ?? [];
  const contexts: ProbeContext[] = [];
  const ownedContexts: { readonly context: BrowserContext }[] = [];
  // @orb-gate-ignore caught-failure-ownership(empty:error): closeProbeSessionAfterError is typed Promise<never> — it always rethrows the primary error (wrapped with any cleanup failure), never returns. Ends if that function stops rethrowing unconditionally.
  try {
    for (let i = 0; i < contextCount; i += 1) {
      const built = await buildProbeContext({
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
    environmentContract: first.environmentContract,
    contexts,
  };
}

/** ATTACH to a browser another connection owns — a stateful-session daemon's, over its debugging endpoint
 *  (docs/design/1208-instrument-substrate.md §3.4) — the ONE attach site (gate `tooling-shared-plumbing`
 *  arm H). The returned session is shape-identical to a launched one so every consumer is oblivious, with
 *  two deliberate differences: its context is `owned: false` (a disconnect is not a takeover — the owner's
 *  page survives `closeProbeSession`; the phase-0 spike's `second.close()` receipt), and the owner's shims
 *  and rings stay on the OWNER's connection while this session wires its own capture for the duration of
 *  its run (context-scoped shims keep applying to what an attached client drives — the spike's Q1).
 *  `environment` is what the session DECLARED: it feeds the environment contract and is never re-applied
 *  to the page (re-emulating media from an attacher would be the P3 leak this substrate ends). */
/** The `record` half of `attachProbeSession`: a brand-new context (and its own single page) opened ON the
 *  attached browser, so `newContext({ recordVideo })` is legal. This context is `owned: true` — WE created
 *  it over an attached connection nobody else knows about, so `closeProbeSession` closing it (which flushes
 *  the video) is correct, unlike the owner's live context, which a disconnect must never touch. */
async function attachRecordedContext(browser: Browser, environment: ProbeAttachOptions): Promise<ProbeSession> {
  const deviceDescriptor = resolveDeviceDescriptor(environment);
  const environmentContract = resolveBrowserEnvironmentContract(environment, deviceDescriptor);
  const sizing = {
    ...(deviceDescriptor ?? { viewport: environment.viewport }),
    ...(environment.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: environment.deviceScaleFactor }),
  };
  const context = await browser.newContext({
    ...sizing,
    ...(environment.recordVideoDir === undefined ? {} : { recordVideo: { dir: environment.recordVideoDir, size: environment.viewport } }),
  });
  const page = await context.newPage();
  const consoleLines: string[] = [];
  const consoleMessages: CapturedConsole[] = [];
  const pageErrors: string[] = [];
  const requests = new Map<string, CapturedRequest>();
  const capture: PageCapture = { media: resolveProbeMedia(environment), consoleLines, consoleMessages, pageErrors, requests };
  await wireProbePage(page, capture);
  const attached: ProbeContext = {
    context,
    pages: [page],
    consoleLines,
    consoleMessages,
    pageErrors,
    requests,
    harPath: null,
    settingsEvidence: { appearanceApplied: null, themeApplied: null, themeResolution: null, themeCatalog: null },
    environmentContract,
    owned: true,
  };
  return { browser, context, page, pages: [page], consoleLines, consoleMessages, pageErrors, requests, environmentContract, contexts: [attached] };
}

export async function attachProbeSession(endpoint: string, environment: ProbeAttachOptions): Promise<ProbeSession> {
  const browser = await chromium.connectOverCDP(endpoint);
  // `record` cannot reuse the session's live page: Playwright only records video from a context created
  // WITH `recordVideo` set, and that option is fixed at `newContext()` time — it cannot be bolted onto the
  // owner's existing context after the fact. So a `recordVideoDir` attach opens its OWN new context on the
  // attached browser (§5's "record is not like the others") instead of joining `browser.contexts()[0]`.
  if (environment.recordVideoDir !== undefined) {
    return await attachRecordedContext(browser, environment);
  }
  const context = browser.contexts()[0];
  const pages = context?.pages() ?? [];
  const page = pages[0];
  if (context === undefined || page === undefined) {
    await browser.close();
    throw new Error(`attached browser at ${endpoint} exposes no page — the session has not booted a context yet`);
  }
  const deviceDescriptor = resolveDeviceDescriptor(environment);
  const environmentContract = resolveBrowserEnvironmentContract(environment, deviceDescriptor);
  const consoleLines: string[] = [];
  const consoleMessages: CapturedConsole[] = [];
  const pageErrors: string[] = [];
  const requests = new Map<string, CapturedRequest>();
  const capture: PageCapture = { media: resolveProbeMedia(environment), consoleLines, consoleMessages, pageErrors, requests };
  for (const tab of pages) {
    await wireProbePage(tab, capture, "observe");
  }
  const attached: ProbeContext = {
    context,
    pages,
    consoleLines,
    consoleMessages,
    pageErrors,
    requests,
    harPath: null,
    // No shim was asked of THIS connection — the owner's is the one that applies (null = unrequested).
    settingsEvidence: { appearanceApplied: null, themeApplied: null, themeResolution: null, themeCatalog: null },
    environmentContract,
    owned: false,
  };
  return { browser, context, page, pages, consoleLines, consoleMessages, pageErrors, requests, environmentContract, contexts: [attached] };
}

/** Close every OWNED context and the browser even when the probe body throws or returns early. An attached
 *  session's context is not ours to close (`owned: false`); closing its `browser` handle is a disconnect. */
export async function closeProbeSession(session: ProbeResourceOwner): Promise<void> {
  const contextResults = await Promise.allSettled(session.contexts.filter(({ owned }) => owned !== false).map(({ context }) => context.close()));
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
