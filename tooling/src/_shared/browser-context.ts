import type { Browser, BrowserContext, Page } from "@playwright/test";
import { devices } from "@playwright/test";
import type { SettingsShimEvidence } from "./appearance.ts";
import { installSettingsShim } from "./appearance.ts";
import type { PageCapture } from "./browser-capture.ts";
import { createPageCapture, watchProbeContextPages } from "./browser-capture.ts";
import type { BrowserPageError, ProbeContext, ProbeLaunchOptions, ProbeSession } from "./browser-contract.ts";
import { effectiveContextViewport, resolveBrowserEnvironmentContract } from "./browser-environment.ts";
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

interface ProbeContextInput {
  readonly context: BrowserContext;
  readonly pages: readonly Page[];
  readonly capture: PageCapture;
  readonly settingsEvidence: SettingsShimEvidence;
  readonly environmentContract: ProbeContext["environmentContract"];
  readonly owned?: boolean;
}

export function probeContext(input: ProbeContextInput): ProbeContext {
  const { context, pages, capture, settingsEvidence, environmentContract, owned } = input;
  return {
    context,
    pages,
    get consoleLines(): readonly string[] {
      return capture.consoleMessages.map((message) => message.line);
    },
    consoleMessages: capture.consoleMessages,
    get pageErrors(): readonly BrowserPageError[] {
      return capture.pageErrors;
    },
    requests: capture.evidence.requestSummary.view(),
    diagnostics: capture.diagnostics,
    diagnosticCompleteness: capture.diagnosticCompleteness,
    diagnosticWindow: capture.diagnosticWindow,
    evidence: capture.evidence,
    settingsEvidence,
    environmentContract,
    ...(owned === undefined ? {} : { owned }),
  };
}

export function probeSession(
  browser: Browser,
  selected: ProbeContext,
  contexts: readonly ProbeContext[],
  cleanup?: readonly (() => Promise<void>)[],
): ProbeSession {
  const page = selected.pages[0];
  if (page === undefined) {
    throw new Error("probe context has no page");
  }
  return {
    browser,
    context: selected.context,
    page,
    pages: selected.pages,
    get consoleLines(): readonly string[] {
      return selected.consoleMessages.map((message) => message.line);
    },
    consoleMessages: selected.consoleMessages,
    get pageErrors(): readonly BrowserPageError[] {
      return selected.pageErrors;
    },
    requests: selected.requests,
    diagnostics: selected.diagnostics,
    diagnosticCompleteness: selected.diagnosticCompleteness,
    diagnosticWindow: selected.diagnosticWindow,
    evidence: selected.evidence,
    environmentContract: selected.environmentContract,
    contexts,
    ...(cleanup === undefined ? {} : { cleanup }),
  };
}

async function openRecordedContext(args: BuildContextArgs): Promise<BrowserContext> {
  const { browser, opts, deviceDescriptor, ownedContexts, persistentContext } = args;
  // ONE SIZE ANSWER (#1668): the descriptor supplies touch/DPR/UA/isMobile, `effectiveContextViewport`
  // supplies the SIZE — so an explicit `--viewport` under `--mobile` windows the device instead of
  // silently demoting it to a desktop, and a run's receipt states the size the browser actually got.
  const sizing = {
    ...(deviceDescriptor ?? {}),
    viewport: effectiveContextViewport(opts, deviceDescriptor),
    ...(opts.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: opts.deviceScaleFactor }),
  };
  const context =
    persistentContext ??
    (await browser.newContext({
      ...sizing,
      ...(opts.recordVideoDir === undefined ? {} : { recordVideo: { dir: opts.recordVideoDir, size: opts.viewport } }),
    }));
  ownedContexts.push({ context });
  if (opts.trace === true) {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }
  return context;
}

/** The dev server's own HUD, hidden in EVERY probe context (#2429 item 2). `vite-plugin-checker` mounts a
 *  `<vite-plugin-checker-error-overlay>` custom element at the viewport's bottom-right corner
 *  (`overlay.position: "br"`, packages/client/vite.config.ts) whose collapsed badge paints rgb(255,85,85) —
 *  measured live 2026-09-19 sitting ON TOP of the composer under the Light theme, where it entered the
 *  `--contrast` fill arm's surround band and decided the verdict. It is DEV-SERVER chrome, not app pixels:
 *  every instrument that samples the framebuffer (contrast, fill, edge, design-audit, a screenshot) would
 *  otherwise be measuring vite's badge and calling it the product.
 *
 *  ONLY THE CHECKER BADGE. Vite's own `<vite-error-overlay>` is deliberately left visible: it appears only
 *  when the app has actually failed to load, and hiding that would hide a real broken render from a shot.
 *
 *  A STYLE RULE, not a node removal: the element is created long after this script runs (and re-created on
 *  every HMR round), so the rule has to be standing when it arrives. `display:none` on the shadow HOST
 *  takes its whole tree with it. */
const DEV_SERVER_HUD_SELECTOR = "vite-plugin-checker-error-overlay";
const HIDE_DEV_SERVER_HUD_SCRIPT = `(() => {
  const install = () => {
    if (!document.head || document.getElementById("orb-probe-hide-dev-hud")) return;
    const style = document.createElement("style");
    style.id = "orb-probe-hide-dev-hud";
    style.textContent = ${JSON.stringify(`${DEV_SERVER_HUD_SELECTOR}{display:none!important}`)};
    document.head.appendChild(style);
  };
  if (document.head) install();
  else document.addEventListener("DOMContentLoaded", install);
})();`;

/** Exported for its pin (`tests/tooling/_shared/browser-context.int.test.ts`): the planted control shows the
 *  checker badge's pixels reaching a contrast sample without this script, and gone with it. */
export const DEV_SERVER_HUD = { selector: DEV_SERVER_HUD_SELECTOR, initScript: HIDE_DEV_SERVER_HUD_SCRIPT } as const;

async function seedContext(context: BrowserContext, opts: ProbeLaunchOptions, sessionCookie: string | null): Promise<SettingsShimEvidence> {
  const settingsEvidence = await installSettingsShim(context, { appearance: opts.appearance ?? null, theme: opts.theme ?? null });
  await context.addInitScript({ content: HIDE_DEV_SERVER_HUD_SCRIPT });
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
  const { opts, sessionCookie, deviceDescriptor, contextIndex } = args;
  const context = await openRecordedContext(args);
  const settingsEvidence = await seedContext(context, opts, sessionCookie);
  const capture = createPageCapture(resolveProbeMedia(opts), contextIndex, opts.evidenceLimits);
  const pages: Page[] = [];
  const wirePage = watchProbeContextPages(context, capture, pages);
  for (let index = 0; index < Math.max(1, opts.pages ?? 1); index += 1) {
    const page = await context.newPage();
    await wirePage(page);
  }
  return probeContext({
    context,
    pages,
    capture,
    settingsEvidence,
    environmentContract: resolveBrowserEnvironmentContract(opts, deviceDescriptor),
  });
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
  return probeSession(owner.browser, selected, [selected]);
}
