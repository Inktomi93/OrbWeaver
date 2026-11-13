// Playwright-chromium bootstrap shared by the browser probes.
// INIT SCRIPTS SHIP AS RAW STRINGS, not functions: the DOM-less tsconfig aggregator won't
// compile a function body touching `window`. (The historical second reason — tsx's esbuild
// keepNames `__name` helper breaking serialized functions — died with the tsx shed;
// the lib-mismatch reason stands alone.)

import { DEBUG_TOKEN_ENV } from "@orb/server/foundation/env/names";
import type { Browser, BrowserContext, devices, LaunchOptions, Page, PlaywrightWorkerOptions } from "@playwright/test";
import { chromium } from "@playwright/test";
import type { GraphicalSessionDeps } from "../host/platform.ts";
import { ownGraphicalSession } from "../host/platform.ts";
import { DEV_PORTS } from "../host/ports.ts";
import { browserProcessEnv, processEnvValue } from "../process/process-env.ts";
import { currentRunLease, currentRunMarker, inheritedRunMarker, runLeaseArg, runLeaseEnv, runMarkerArg, runMarkerEnv } from "../process/run-marker.ts";
import { browserArgsWithAcceleration } from "./browser-acceleration.ts";
import { createPageCapture, watchProbeContextPages } from "./browser-capture.ts";
import { buildProbeContext, probeContext, probeSession, resolveDeviceDescriptor } from "./browser-context.ts";
import type { ProbeAttachOptions, ProbeContext, ProbeLaunchOptions, ProbeSession } from "./browser-contract.ts";
import { effectiveContextSize, resolveBrowserEnvironmentContract } from "./browser-environment.ts";
import { resolveProbeMedia } from "./browser-media.ts";
import { installCdpFaultInjector } from "./cdp-fault.ts";

export type { CapturedConsole, CapturedRequest } from "./browser-capture.ts";

export const DEFAULT_BASE = processEnvValue("SNAP_BASE_URL") ?? `http://localhost:${DEV_PORTS.vite}`;
export const DEFAULT_DEBUG_TOKEN = processEnvValue(DEBUG_TOKEN_ENV) ?? "";

const TRAILING_SLASH_RE = /\/$/u;

interface UrlParts {
  readonly path: string;
  /** Without its `?`. */
  readonly query: string;
  /** With its `#`, or empty. */
  readonly fragment: string;
}

// Split by text, not `URL`: the operator's spelling of the path and of every pair reaches the browser as written.
function urlParts(text: string): UrlParts {
  const fragmentAt = text.indexOf("#");
  const beforeFragment = fragmentAt === -1 ? text : text.slice(0, fragmentAt);
  const queryAt = beforeFragment.indexOf("?");
  return {
    path: queryAt === -1 ? beforeFragment : beforeFragment.slice(0, queryAt),
    query: queryAt === -1 ? "" : beforeFragment.slice(queryAt + 1),
    fragment: fragmentAt === -1 ? "" : text.slice(fragmentAt),
  };
}

/**
 * `route` joined into `base`'s path with exactly one slash at the join.
 *
 * @remarks
 * A base may carry a query or fragment, such as a deployment's access token. The route goes ahead of both, because a
 * route appended after the query becomes part of the last pair's value. The base's pairs precede the route's, and the
 * route's fragment replaces the base's.
 */
export function buildUrl(base: string, route: string): string {
  const from = urlParts(base);
  const to = urlParts(route);
  const query = [from.query, to.query].filter((pairs) => pairs !== "").join("&");
  const fragment = to.fragment === "" ? from.fragment : to.fragment;
  return `${from.path.replace(TRAILING_SLASH_RE, "")}${to.path.startsWith("/") ? "" : "/"}${to.path}${query === "" ? "" : `?${query}`}${fragment}`;
}

/** Wall-clock settle — deliberate, bounded (this is an observation harness, not a test). */
export async function settle(page: Page, ms: number): Promise<void> {
  // biome-ignore lint/suspicious/noPlaywrightWaitForTimeout: deliberate bounded observation window (see docblock) — the flakiness this rule hunts in tests is the probe's feature.
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

/** Fill missing graphics context without replacing caller selectors or the marked launch environment. */
export function browserLaunchEnvironment(environment: NodeJS.ProcessEnv, args: readonly string[] = [], deps: GraphicalSessionDeps = {}): NodeJS.ProcessEnv {
  if (
    ["DISPLAY", "XAUTHORITY", "WAYLAND_DISPLAY"].some((key) => Object.hasOwn(environment, key)) ||
    environment["XDG_SESSION_TYPE"] === "wayland" ||
    args.some((arg) => arg === "--ozone-platform" || arg.startsWith("--ozone-platform=") || arg === "--headless" || arg.startsWith("--headless="))
  ) {
    return environment;
  }
  const session = ownGraphicalSession(deps);
  return session === null ? environment : { ...environment, ["DISPLAY"]: session.display, ["XAUTHORITY"]: session.authority };
}

/** Graphics discovery plus the ambient environment a launch draws from; both default to this process. */
export interface BrowserLaunchDeps extends GraphicalSessionDeps {
  readonly ambient?: NodeJS.ProcessEnv;
}

/** Native runners share probe acceleration and graphics discovery without minting a resource owner during config import. */
export function nativeBrowserLaunchOptions(
  browserName: PlaywrightWorkerOptions["browserName"],
  options: LaunchOptions = {},
  deps: BrowserLaunchDeps = {},
): LaunchOptions {
  const marker = inheritedRunMarker();
  const lease = currentRunLease();
  const environment = browserProcessEnv(
    {
      ...options.env,
      ...(marker === null ? {} : runMarkerEnv(marker)),
      ...(lease === null ? {} : runLeaseEnv(lease)),
    },
    deps.ambient,
  );
  if (browserName !== "chromium") {
    return { ...options, env: environment };
  }
  const args = [
    ...browserArgsWithAcceleration(options.args),
    ...(marker === null ? [] : [runMarkerArg(marker)]),
    ...(lease === null ? [] : [runLeaseArg(lease)]),
  ];
  return { ...options, args, env: browserLaunchEnvironment(environment, args, deps) };
}

/** THE RUN MARKER FOR EVERY BROWSER THIS PROCESS LAUNCHES. Playwright puts each browser in its own
 *  session, so a snap killed mid-drive (SIGKILL, a stage timeout, a lane torn down) leaves a Chromium that
 *  no process-group kill can reach — the same leak the CT runner had, and the reason 72 headless-shell
 *  processes were once alive on this box at the same time. The marker rides the browser's ENVIRONMENT, which
 *  `/proc/<pid>/environ` makes readable and unforgeable, so `floor/process/run-marker.ts`'s sweeps can find them
 *  by RUN — never by program name, which would kill a sibling lane's fleet.
 *
 *  BOTH IDENTITIES RIDE WHEN THIS PROCESS HOLDS A LEASE: the OUTER run's marker, so that run's kill
 *  path still reaches this browser, AND the lease this process minted, which is
 *  the only value its own teardown may sweep. One stamp would have to serve both, and it could not. */
function markedBrowserEnv(args: readonly string[], deps: BrowserLaunchDeps): NodeJS.ProcessEnv {
  const lease = currentRunLease();
  return browserLaunchEnvironment(
    browserProcessEnv({ ...runMarkerEnv(currentRunMarker()), ...(lease === null ? {} : runLeaseEnv(lease)) }, deps.ambient),
    args,
    deps,
  );
}

/** …AND THE ARG, because the env alone does not survive: chromium rewrites its own environ area for its
 *  process title, so `/proc/<pid>/environ` reads EMPTY for every browser process (measured).
 *  The switch is unknown to chromium, which ignores it, and lands in `/proc/<pid>/cmdline` — where the
 *  sweep's second channel reads it. Marking the ROOT is sufficient: killing it took all six of the probe's
 *  chromium processes with it. The lease rides the same way and for the same reason — a chromium that keeps
 *  neither environ is reachable by whichever identity its argv carries. */
function markedBrowserArgs(args: readonly string[]): string[] {
  const lease = currentRunLease();
  return [...args, runMarkerArg(currentRunMarker()), ...(lease === null ? [] : [runLeaseArg(lease)])];
}

type PersistentLaunchOptions = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;

/** What one owned probe launch hands Playwright: a plain browser, or a persistent profile with its context sizing. */
type OwnedLaunch =
  | { readonly kind: "browser"; readonly options: LaunchOptions }
  | { readonly kind: "persistent"; readonly profileDir: string; readonly options: PersistentLaunchOptions };

/** The options `launchOwnedBrowser` launches with, built without launching anything. */
export function ownedLaunchOptions(opts: ProbeLaunchOptions, deviceDescriptor: (typeof devices)[string] | null, deps: BrowserLaunchDeps = {}): OwnedLaunch {
  const browserArgs = browserArgsWithAcceleration(opts.browserArgs);
  const launch = { headless: opts.headless, args: markedBrowserArgs(browserArgs), env: markedBrowserEnv(browserArgs, deps) };
  if (opts.persistentProfileDir === undefined) {
    return { kind: "browser", options: launch };
  }
  // ONE SIZE ANSWER: the descriptor supplies touch/DPR/UA/isMobile while the shared size resolver
  // composes viewport + screen, so the launch options and environment receipt cannot disagree.
  const sizing = {
    ...(deviceDescriptor ?? {}),
    ...effectiveContextSize(opts, deviceDescriptor),
    ...(opts.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: opts.deviceScaleFactor }),
    ...(opts.httpCredentials === undefined ? {} : { httpCredentials: { ...opts.httpCredentials } }),
  };
  return { kind: "persistent", profileDir: opts.persistentProfileDir, options: { ...sizing, ...launch } };
}

async function launchOwnedBrowser(opts: ProbeLaunchOptions, deviceDescriptor: (typeof devices)[string] | null): Promise<LaunchedBrowser> {
  const launch = ownedLaunchOptions(opts, deviceDescriptor);
  if (launch.kind === "browser") {
    return { browser: await chromium.launch(launch.options) };
  }
  const persistentContext = await chromium.launchPersistentContext(launch.profileDir, launch.options);
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
  // closeProbeSessionAfterError is typed Promise<never> — it always rethrows the primary error (wrapped with any cleanup failure), never returns. Ends if that function stops rethrowing unconditionally.
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
  const first = contexts[0];
  if (first === undefined) {
    return await closeProbeSessionAfterError({ browser, contexts: ownedContexts }, new Error("browser launch produced no probe context"));
  }
  return probeSession(browser, first, contexts);
}

/** ATTACH to a browser another connection owns — a stateful-session daemon's, over its debugging endpoint
 *  — the ONE attach site, by convention; no lint rule refuses a second.
 *  The returned session is shape-identical to a launched one so every consumer is oblivious, with
 *  two deliberate differences: its context is `owned: false` (a disconnect is not a takeover — the owner's
 *  page survives `closeProbeSession`; the phase-0 spike's `second.close()` receipt), and the owner's shims
 *  and rings stay on the OWNER's connection while this session wires its own capture for the duration of
 *  its run (context-scoped shims keep applying to what an attached client drives — the spike's Q1).
 *  `environment` is what the session DECLARED: it feeds the environment contract and is never re-applied
 *  to the page (re-emulating media from an attacher would be the P3 leak this substrate ends). */
export async function attachProbeSession(endpoint: string, environment: ProbeAttachOptions): Promise<ProbeSession> {
  const browser = await chromium.connectOverCDP(endpoint);
  try {
    const ownerContext = browser.contexts()[0];
    if (ownerContext === undefined) {
      throw new Error(`attached browser at ${endpoint} exposes no context — the session has not booted yet`);
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
      settingsEvidence: { appearanceApplied: null, themeApplied: null, themeResolution: null, themeCatalog: null, backgroundLibraryFirst: null },
      environmentContract,
      owned: false,
    });
    return probeSession(browser, attached, [attached]);
  } catch (error) {
    return await closeProbeSessionAfterError({ browser, contexts: [] }, error);
  }
}

/** Close every OWNED context and the browser even when the probe body throws or returns early. An attached
 *  session's context is not ours to close (`owned: false`); closing its `browser` handle is a disconnect. */
export async function closeProbeSession(session: ProbeResourceOwner): Promise<void> {
  const contextResults = await Promise.allSettled(session.contexts.filter(({ owned }) => owned !== false).map(({ context }) => context.close()));
  const failures = contextResults.flatMap((result): unknown[] => (result.status === "rejected" ? [result.reason] : []));
  try {
    await session.browser.close();
  } catch (error) {
    failures.push(error);
  }
  const cleanupResults = await Promise.allSettled((session.cleanup ?? []).map((close) => close()));
  failures.push(...cleanupResults.flatMap((result): unknown[] => (result.status === "rejected" ? [result.reason] : [])));
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

/** Run `close` after a primary failure without letting teardown erase it; both failures remain inspectable. */
export async function closeAfterError(close: () => Promise<void>, primary: unknown): Promise<never> {
  try {
    await close();
  } catch (cleanup) {
    throw probeFailureWithCleanup(primary, cleanup);
  }
  throw primary;
}

/** Close a whole probe session after a primary failure (`closeAfterError`). */
export async function closeProbeSessionAfterError(session: ProbeResourceOwner, primary: unknown): Promise<never> {
  return await closeAfterError(async () => await closeProbeSession(session), primary);
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
