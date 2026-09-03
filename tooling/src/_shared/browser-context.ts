import type { Browser, BrowserContext, Page } from "@playwright/test";
import { devices } from "@playwright/test";
import type { SettingsShimEvidence } from "./appearance.ts";
import { installSettingsShim } from "./appearance.ts";
import type { CapturedConsole, CapturedRequest, PageCapture } from "./browser-capture.ts";
import { wireProbePage } from "./browser-capture.ts";
import type { ProbeContext, ProbeLaunchOptions, ProbeSession } from "./browser-contract.ts";
import { resolveBrowserEnvironmentContract } from "./browser-environment.ts";
import { resolveProbeMedia } from "./browser-media.ts";

export interface BuildContextArgs {
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
  ownedContexts.push({ context });
  if (opts.trace === true) {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }
  return { context, harPath };
}

async function seedContext(context: BrowserContext, opts: ProbeLaunchOptions, sessionCookie: string | null): Promise<SettingsShimEvidence> {
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
    const [pair] = sessionCookie.split(";");
    const eq = (pair ?? "").indexOf("=");
    if (eq > 0) {
      await context.addCookies([{ name: (pair ?? "").slice(0, eq), value: (pair ?? "").slice(eq + 1), domain: opts.cookieDomain, path: "/", secure: true }]);
    }
  }
  return settingsEvidence;
}

/** Build one fully isolated context. Cookie and settings seeds land before its first page opens. */
export async function buildProbeContext(args: BuildContextArgs): Promise<ProbeContext> {
  const { opts, sessionCookie, deviceDescriptor } = args;
  const { context, harPath } = await openRecordedContext(args);
  const settingsEvidence = await seedContext(context, opts, sessionCookie);
  const consoleLines: string[] = [];
  const consoleMessages: CapturedConsole[] = [];
  const pageErrors: string[] = [];
  const requests = new Map<string, CapturedRequest>();
  const capture: PageCapture = { media: resolveProbeMedia(opts), consoleLines, consoleMessages, pageErrors, requests };
  const pages: Page[] = [];
  for (let index = 0; index < Math.max(1, opts.pages ?? 1); index += 1) {
    const page = await context.newPage();
    await wireProbePage(page, capture);
    pages.push(page);
  }
  return {
    context,
    pages,
    consoleLines,
    consoleMessages,
    pageErrors,
    requests,
    harPath,
    settingsEvidence,
    environmentContract: resolveBrowserEnvironmentContract(opts, deviceDescriptor),
  };
}

export function resolveDeviceDescriptor(opts: Pick<ProbeLaunchOptions, "device">): (typeof devices)[string] | null {
  if (opts.device === undefined || opts.device === null) {
    return null;
  }
  const descriptor = devices[opts.device];
  if (descriptor === undefined) {
    throw new Error(`unknown Playwright device "${opts.device}" (see playwright devices registry)`);
  }
  return descriptor;
}

/** Open one more owned context on an already-launched browser. */
export async function openProbeContext(browser: Browser, opts: ProbeLaunchOptions, contextIndex: number): Promise<ProbeContext> {
  const ownedContexts: { readonly context: BrowserContext }[] = [];
  try {
    return await buildProbeContext({
      browser,
      opts,
      deviceDescriptor: resolveDeviceDescriptor(opts),
      sessionCookie: opts.contextCookies?.[contextIndex] ?? null,
      contextIndex,
      ownedContexts,
    });
  } catch (error) {
    await Promise.allSettled(ownedContexts.map(async ({ context }) => await context.close()));
    throw error;
  }
}

/** Focus the ProbeSession API on one context in a shared browser. */
export function probeSessionForContext(owner: ProbeSession, selected: ProbeContext): ProbeSession {
  const page = selected.pages[0];
  if (page === undefined) {
    throw new Error("probe context has no page");
  }
  return {
    browser: owner.browser,
    context: selected.context,
    page,
    pages: selected.pages,
    consoleLines: selected.consoleLines,
    consoleMessages: selected.consoleMessages,
    pageErrors: selected.pageErrors,
    requests: selected.requests,
    environmentContract: selected.environmentContract,
    contexts: [selected],
  };
}
