// Playwright-chromium bootstrap shared by the browser probes.
// INIT SCRIPTS SHIP AS RAW STRINGS, not functions: the DOM-less tsconfig aggregator won't
// compile a function body touching `window`. (The historical second reason — tsx's esbuild
// keepNames `__name` helper breaking serialized functions — died with the 2026-08-03 tsx shed;
// the lib-mismatch reason stands alone.)

import process from "node:process";
import type { Browser, BrowserContext, CDPSession, devices, Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import { browserArgsWithAcceleration } from "./browser-acceleration.ts";
import { createPageCapture, watchProbeContextPages } from "./browser-capture.ts";
import { buildProbeContext, probeContext, probeSession, resolveDeviceDescriptor } from "./browser-context.ts";
import type { ProbeAttachOptions, ProbeContext, ProbeLaunchOptions, ProbeSession } from "./browser-contract.ts";
import { effectiveContextViewport, resolveBrowserEnvironmentContract } from "./browser-environment.ts";
import { resolveProbeMedia } from "./browser-media.ts";
import { warn } from "./log.ts";
import { DEV_PORTS } from "./ports.ts";
import { inheritedProcessEnv, processEnvValue } from "./process-env.ts";
import { currentRunMarker, runMarkerArg, runMarkerEnv } from "./run-marker.ts";

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

// ── the TEST-ONLY CDP fault injector (#1093) ────────────────────────────────────────────────────
// WHY IT LIVES HERE AND NOWHERE ELSE. Several instruments own a protocol-failure arm whose behaviour is
// a real verdict — ui-audit's forced-state pass demotes a failed `CSS.forcePseudoState` to a per-group
// WITHHOLDING (so the run is NO VERDICT rather than clean), snap's navigation and motion arms have their
// own — and NONE of them was pinnable, because no static document makes CDP throw on cue. The recorded
// alternative was a fault hook inside the instrument, which ops/hover.ts refused by name as "exactly the
// class of change that makes a tool lie about itself". A PROTOCOL-level injector at the shared browser
// seam has neither problem: it is instrument-agnostic, and no instrument can see it — every consumer
// still calls `page.context().newCDPSession(page)` and gets back a session that refuses the named
// methods.
//
// TEST-ONLY IS ENFORCED, NOT DOCUMENTED (the `ORB_SNAP_TEST_FILMSTRIP_FRAME_LIMIT` precedent,
// snap/ops/arms/filmstrip.ts): the seam REFUSES outside vitest, and it REFUSES a spec it cannot parse
// rather than declining to inject — an injector that silently does nothing turns the failure-arm pin it
// exists for green, which is the lying-instrument class it was built to close. It also announces itself
// on stderr, so a run taken under injected faults can never be mistaken for a measurement.
const CDP_FAULT_ENV = "ORB_PROBE_TEST_CDP_FAULT";
/** `<Domain.method>` — every call — or `<Domain.method>@<nth>` for one occurrence. The occurrence form is
 *  what tells a PARTIAL failure (one bad node, the rest measured — the #1031 demotion ruling) apart from a
 *  whole-instrument abort; a boolean injector can only produce the second. */
const CDP_FAULT_ROW_RE = /^([A-Z]\w*\.\w+)(?:@([1-9]\d*))?$/u;

interface CdpFaultRow {
  readonly method: string;
  /** 1-based call index within the run; null faults every call of the method. */
  readonly occurrence: number | null;
}

/** Parse the fault spec. Exported for its own both-directions unit proof — a parser that accepts garbage
 *  by ignoring it is the same silence as an injector that never injects. */
export function parseCdpFaultSpec(spec: string): readonly CdpFaultRow[] {
  const rows: CdpFaultRow[] = [];
  for (const entry of spec.split(",")) {
    const text = entry.trim();
    if (text === "") {
      continue;
    }
    const match = CDP_FAULT_ROW_RE.exec(text);
    if (match === null) {
      throw new Error(`CDP FAULT REFUSED: ${CDP_FAULT_ENV} entry "${text}" is not <Domain.method> or <Domain.method>@<nth call>`);
    }
    rows.push({ method: String(match[1]), occurrence: match[2] === undefined ? null : Number(match[2]) });
  }
  if (rows.length === 0) {
    throw new Error(`CDP FAULT REFUSED: ${CDP_FAULT_ENV} was set but names no protocol method`);
  }
  return rows;
}

function cdpFaultRows(): readonly CdpFaultRow[] | null {
  const spec = processEnvValue(CDP_FAULT_ENV);
  if (spec === undefined) {
    return null;
  }
  if (processEnvValue("VITEST") !== "true") {
    throw new Error(`CDP FAULT REFUSED: ${CDP_FAULT_ENV} is a test-only seam`);
  }
  return parseCdpFaultSpec(spec);
}

/** The per-context tally that gives `@N` its meaning: the Nth call of that method on this context. */
function cdpFaultGate(rows: readonly CdpFaultRow[]): (method: string) => void {
  const calls = new Map<string, number>();
  return (method) => {
    const nth = (calls.get(method) ?? 0) + 1;
    calls.set(method, nth);
    const hit = rows.find((row) => row.method === method && (row.occurrence === null || row.occurrence === nth));
    if (hit !== undefined) {
      throw new Error(`planted CDP fault: ${method} call #${String(nth)} refused by ${CDP_FAULT_ENV}`);
    }
  };
}

/** A session whose `send` consults the gate first; every other member is the real one, bound. */
function faultInjectedSession(session: CDPSession, gate: (method: string) => void): CDPSession {
  return new Proxy(session, {
    get(target, property) {
      if (property === "send") {
        return async (method: string, params?: unknown): Promise<unknown> => {
          gate(method);
          return await Reflect.apply(target.send, target, params === undefined ? [method] : [method, params]);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function installCdpFaultInjector(context: BrowserContext): void {
  const rows = cdpFaultRows();
  if (rows === null) {
    return;
  }
  warn(
    `CDP FAULT INJECTION ACTIVE (${CDP_FAULT_ENV}) — this run is a FIXTURE, not a measurement: ${rows.map((row) => `${row.method}${row.occurrence === null ? "" : `@${String(row.occurrence)}`}`).join(", ")}`,
  );
  const gate = cdpFaultGate(rows);
  const openSession = context.newCDPSession.bind(context);
  context.newCDPSession = async (target): Promise<CDPSession> => faultInjectedSession(await openSession(target), gate);
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

/** THE RUN MARKER FOR EVERY BROWSER THIS PROCESS LAUNCHES (#1848). Playwright puts each browser in its own
 *  session, so a snap killed mid-drive (SIGKILL, a stage timeout, a lane torn down) leaves a Chromium that
 *  no process-group kill can reach — the same leak the CT runner had, and the reason 72 headless-shell
 *  processes were alive on this box on 2026-09-06. The marker rides the browser's ENVIRONMENT, which
 *  `/proc/<pid>/environ` makes readable and unforgeable, so `_shared/run-marker.ts`'s sweeps can find them
 *  by RUN — never by program name, which would kill a sibling lane's fleet. */
function markedBrowserEnv(): NodeJS.ProcessEnv {
  return inheritedProcessEnv(runMarkerEnv(currentRunMarker()));
}

/** …AND THE ARG, because the env alone does not survive: chromium rewrites its own environ area for its
 *  process title, so `/proc/<pid>/environ` reads EMPTY for every browser process (measured 2026-09-06).
 *  The switch is unknown to chromium, which ignores it, and lands in `/proc/<pid>/cmdline` — where the
 *  sweep's second channel reads it. Marking the ROOT is sufficient: killing it took all six of the probe's
 *  chromium processes with it. */
function markedBrowserArgs(args: readonly string[]): string[] {
  return [...args, runMarkerArg(currentRunMarker())];
}

async function launchOwnedBrowser(opts: ProbeLaunchOptions, deviceDescriptor: (typeof devices)[string] | null): Promise<LaunchedBrowser> {
  const browserArgs = browserArgsWithAcceleration(opts.browserArgs);
  if (opts.persistentProfileDir === undefined) {
    return { browser: await chromium.launch({ headless: opts.headless, args: markedBrowserArgs(browserArgs), env: markedBrowserEnv() }) };
  }
  // ONE SIZE ANSWER (#1668): the descriptor supplies touch/DPR/UA/isMobile, `effectiveContextViewport`
  // supplies the SIZE — so an explicit `--viewport` under `--mobile` windows the device instead of
  // silently demoting it to a desktop, and a run's receipt states the size the browser actually got.
  const sizing = {
    ...(deviceDescriptor ?? {}),
    viewport: effectiveContextViewport(opts, deviceDescriptor),
    ...(opts.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: opts.deviceScaleFactor }),
  };
  const persistentContext = await chromium.launchPersistentContext(opts.persistentProfileDir, {
    ...sizing,
    headless: opts.headless,
    args: markedBrowserArgs(browserArgs),
    env: markedBrowserEnv(),
    ...(opts.recordVideoDir === undefined ? {} : { recordVideo: { dir: opts.recordVideoDir, size: opts.viewport } }),
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
      installCdpFaultInjector(built.context);
      contexts.push(built);
    }
  } catch (error) {
    await closeProbeSessionAfterError({ browser, contexts: ownedContexts }, error);
  }
  const first = contexts[0];
  if (first === undefined) {
    return await closeProbeSessionAfterError({ browser, contexts: ownedContexts }, new Error("browser launch produced no probe context"));
  }
  return probeSession(browser, first, contexts);
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
async function attachRecordedContext(
  browser: Browser,
  ownerContext: BrowserContext,
  environment: ProbeAttachOptions,
  ownedContexts: { readonly context: BrowserContext }[],
): Promise<ProbeSession> {
  const deviceDescriptor = resolveDeviceDescriptor(environment);
  const environmentContract = resolveBrowserEnvironmentContract(environment, deviceDescriptor);
  // ONE SIZE ANSWER (#1668): the descriptor supplies touch/DPR/UA/isMobile, `effectiveContextViewport`
  // supplies the SIZE — so an explicit `--viewport` under `--mobile` windows the device instead of
  // silently demoting it to a desktop, and a run's receipt states the size the browser actually got.
  const sizing = {
    ...(deviceDescriptor ?? {}),
    viewport: effectiveContextViewport(environment, deviceDescriptor),
    ...(environment.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: environment.deviceScaleFactor }),
  };
  // The attached browser is the existing authorization boundary. Clone its live, memory-only storage
  // state into the recording context so cookies and boot localStorage seeds (debug token/probe mode and
  // generic --local-storage) survive without serializing credentials into SessionRow or inventing a
  // second auth channel. The state never crosses the process wire or artifact boundary.
  const storageState = await ownerContext.storageState();
  const context = await browser.newContext({
    ...sizing,
    storageState,
    ...(environment.recordVideoDir === undefined ? {} : { recordVideo: { dir: environment.recordVideoDir, size: environment.viewport } }),
  });
  ownedContexts.push({ context });
  installCdpFaultInjector(context);
  const page = await context.newPage();
  const capture = createPageCapture(resolveProbeMedia(environment), 0, environment.evidenceLimits);
  const pages = [page];
  const wirePage = watchProbeContextPages(context, capture, pages);
  await wirePage(page);
  const attached = probeContext({
    context,
    pages,
    capture,
    settingsEvidence: { appearanceApplied: null, themeApplied: null, themeResolution: null, themeCatalog: null },
    environmentContract,
    owned: true,
  });
  return probeSession(browser, attached, [attached]);
}

export async function attachProbeSession(endpoint: string, environment: ProbeAttachOptions): Promise<ProbeSession> {
  const browser = await chromium.connectOverCDP(endpoint);
  const ownedContexts: { readonly context: BrowserContext }[] = [];
  try {
    const ownerContext = browser.contexts()[0];
    if (ownerContext === undefined) {
      throw new Error(`attached browser at ${endpoint} exposes no context — the session has not booted yet`);
    }
    // `record` cannot reuse the session's live page: Playwright only records video from a context created
    // WITH `recordVideo` set, and that option is fixed at `newContext()` time — it cannot be bolted onto the
    // owner's existing context after the fact. So a `recordVideoDir` attach opens its OWN new context on the
    // attached browser (§5's "record is not like the others") instead of joining `browser.contexts()[0]`.
    if (environment.recordVideoDir !== undefined) {
      return await attachRecordedContext(browser, ownerContext, environment, ownedContexts);
    }
    const context = ownerContext;
    installCdpFaultInjector(context);
    const pages = context.pages();
    const page = pages[0];
    if (page === undefined) {
      throw new Error(`attached browser at ${endpoint} exposes no page — the session has not booted a context yet`);
    }
    const deviceDescriptor = resolveDeviceDescriptor(environment);
    const environmentContract = resolveBrowserEnvironmentContract(environment, deviceDescriptor);
    const capture = createPageCapture(resolveProbeMedia(environment), 0, environment.evidenceLimits);
    const wirePage = watchProbeContextPages(context, capture, pages, "observe");
    for (const tab of pages) {
      await wirePage(tab);
    }
    const attached = probeContext({
      context,
      pages,
      capture,
      // No shim was asked of THIS connection — the owner's is the one that applies (null = unrequested).
      settingsEvidence: { appearanceApplied: null, themeApplied: null, themeResolution: null, themeCatalog: null },
      environmentContract,
      owned: false,
    });
    return probeSession(browser, attached, [attached]);
  } catch (error) {
    return await closeProbeSessionAfterError({ browser, contexts: ownedContexts }, error);
  }
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
