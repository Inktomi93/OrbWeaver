// Focused construction contract for the one ProbeContext/ProbeSession builders. Every production path
// below must project the same capture references and live consoleLines getter; path-specific ownership,
// environment, settings, context selection and cleanup stay explicit.

import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { exactScope } from "@orb/tooling/_shared/artifact-scope";
import { attachProbeSession, closeProbeSession, launchProbeSession } from "@orb/tooling/_shared/browser";
import { createPageCapture } from "@orb/tooling/_shared/browser-capture";
import { buildProbeContext, probeContext, probeSession, probeSessionForContext } from "@orb/tooling/_shared/browser-context";
import type { CapturedConsole, ProbeAttachOptions, ProbeContext, ProbeLaunchOptions, ProbeSession } from "@orb/tooling/_shared/browser-contract";
import { instrumentPageError } from "@orb/tooling/_shared/browser-contract";
import { readBrowserEnvironment, resolveBrowserEnvironmentContract } from "@orb/tooling/_shared/browser-environment";
import { resolveProbeMedia } from "@orb/tooling/_shared/browser-media";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

const RUN_TIMEOUT_MS = scaledBudget(90_000, 4);
const DEBUG_PORT_ATTEMPTS = 200;
const DEBUG_PORT_RETRY_MS = 25;
const VIEWPORT = { width: 720, height: 480 } as const;
const SECOND_VIEWPORT = { width: 412, height: 823 } as const;
const NULL_SETTINGS = { appearanceApplied: null, themeApplied: null, themeResolution: null, themeCatalog: null, backgroundLibraryFirst: null } as const;

vi.setConfig({ testTimeout: RUN_TIMEOUT_MS, hookTimeout: RUN_TIMEOUT_MS });

function launchOptions(overrides: Partial<ProbeLaunchOptions> = {}): ProbeLaunchOptions {
  return {
    headless: true,
    viewport: VIEWPORT,
    colorScheme: null,
    reducedMotion: false,
    contrast: null,
    reducedTransparency: false,
    localStorage: [],
    ...overrides,
  };
}

function expectContextProjection(context: ProbeContext, expectedOwned: boolean | undefined): void {
  expect(context.consoleMessages).toBe(context.evidence.console.values());
  expect(context.pageErrors).toBe(context.evidence.pageErrors.values());
  expect(context.requests).toBe(context.evidence.requestSummary.view());
  expect(context.diagnostics).toBe(context.evidence.diagnostics.values());
  expect(context.diagnosticCompleteness).toBe(context.evidence.diagnosticCompleteness.values());
  expect(context.diagnosticWindow).toEqual({ value: 0 });
  expect(context.settingsEvidence).toEqual(NULL_SETTINGS);
  expect(context.owned).toBe(expectedOwned);
  expect(typeof Object.getOwnPropertyDescriptor(context, "consoleLines")?.get).toBe("function");
  expect(typeof Object.getOwnPropertyDescriptor(context, "pageErrors")?.get).toBe("function");
}

function expectSessionProjection(session: ProbeSession, browser: Browser, selected: ProbeContext, contexts: readonly ProbeContext[]): void {
  expect(session.browser).toBe(browser);
  expect(session.context).toBe(selected.context);
  expect(session.page).toBe(selected.pages[0]);
  expect(session.pages).toBe(selected.pages);
  expect(session.consoleMessages).toBe(selected.consoleMessages);
  expect(session.pageErrors).toEqual(selected.pageErrors);
  expect(session.requests).toBe(selected.requests);
  expect(session.diagnostics).toBe(selected.diagnostics);
  expect(session.diagnosticCompleteness).toBe(selected.diagnosticCompleteness);
  expect(session.evidence).toBe(selected.evidence);
  expect(session.diagnosticWindow).toBe(selected.diagnosticWindow);
  expect(session.environmentContract).toBe(selected.environmentContract);
  expect(session.contexts).toBe(contexts);
  expect(typeof Object.getOwnPropertyDescriptor(session, "consoleLines")?.get).toBe("function");
  expect(typeof Object.getOwnPropertyDescriptor(session, "pageErrors")?.get).toBe("function");
}

function plantConsole(context: ProbeContext, session: ProbeSession, line: string): void {
  const message: CapturedConsole = { type: "log", text: line, location: null, line };
  context.evidence.console.push(message, exactScope(context.evidence.contextIndex, 0, context.diagnosticWindow.value));
  const pageError = instrumentPageError(line);
  context.evidence.pageErrors.push(pageError, exactScope(context.evidence.contextIndex, 0, context.diagnosticWindow.value));
  expect(context.consoleLines.at(-1)).toBe(line);
  expect(session.consoleLines.at(-1)).toBe(line);
  expect(context.pageErrors.at(-1)).toBe(pageError);
  expect(session.pageErrors.at(-1)).toBe(pageError);
}

async function debuggingEndpoint(profileDir: string): Promise<string> {
  const file = join(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < DEBUG_PORT_ATTEMPTS; attempt += 1) {
    try {
      const [line] = (await readFile(file, "utf8")).split("\n");
      const port = Number(line);
      if (Number.isInteger(port) && port > 0) {
        return `http://127.0.0.1:${port}`;
      }
    } catch {
      // Chrome has not published its selected port yet.
    }
    await sleep(DEBUG_PORT_RETRY_MS);
  }
  throw new Error(`Chrome did not publish DevToolsActivePort under ${profileDir}`);
}

async function startOrigin(): Promise<{ readonly server: Server; readonly base: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<!doctype html><html><body><main>seed target</main></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  return { server, base: `http://localhost:${(server.address() as AddressInfo).port}` };
}

async function closeOrigin(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
}

test("probeContext and probeSession preserve the complete shared projection, live getter, owned flag, and cleanup", async () => {
  const opts = launchOptions();
  const capture = createPageCapture(resolveProbeMedia(opts), 7);
  const closeContext = vi.fn(async () => undefined);
  const closeBrowser = vi.fn(async () => undefined);
  const cleanup = vi.fn(async () => undefined);
  // @orb-waive no-test-fabrication(unknown): Browser has no public constructor; probeSession reads only close on this focused Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // projection/cleanup path. Ends when probeSession accepts a structural close handle or this uses a real browser.
  const browser = { close: closeBrowser } as unknown as Browser;
  // @orb-waive no-test-fabrication(unknown): BrowserContext has no public constructor; closeProbeSession reads only close on this Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // focused projection/cleanup path. Ends when ProbeContext accepts a structural close handle or this uses a real context.
  const contextHandle = { close: closeContext } as unknown as BrowserContext;
  // @orb-waive no-test-fabrication(Page): Page has no public constructor and this projection test compares only handle identity; Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // no Page member is read. Ends when the projection contract accepts an opaque page identity or this uses a real page.
  const page = {} as Page;
  const environmentContract = resolveBrowserEnvironmentContract(opts, null);
  const context = probeContext({
    context: contextHandle,
    pages: [page],
    capture,
    settingsEvidence: NULL_SETTINGS,
    environmentContract,
    owned: true,
  });
  const contexts = [context];
  const session = probeSession(browser, context, contexts, [cleanup]);

  expectContextProjection(context, true);
  expect(context.context).toBe(contextHandle);
  expect(context.pages).toEqual([page]);
  expect(context.environmentContract).toBe(environmentContract);
  expectSessionProjection(session, browser, context, contexts);
  expect(session.cleanup).toEqual([cleanup]);
  plantConsole(context, session, "builder-live-getter");

  await closeProbeSession(session);
  expect(closeContext).toHaveBeenCalledOnce();
  expect(closeBrowser).toHaveBeenCalledOnce();
  expect(cleanup).toHaveBeenCalledOnce();
});

test("launch, buildProbeContext, and probeSessionForContext preserve selection and the shared evidence contract", async () => {
  const ownerOpts = launchOptions({ contexts: 2 });
  const owner = await launchProbeSession(ownerOpts);
  let built: ProbeContext | null = null;
  const ownerPages = owner.pages;
  try {
    expect(owner.contexts).toHaveLength(2);
    const selected = owner.contexts[0] as ProbeContext;
    expectContextProjection(selected, undefined);
    expect(selected.settingsEvidence).toEqual(NULL_SETTINGS);
    expect(selected.environmentContract).toEqual(resolveBrowserEnvironmentContract(ownerOpts, null));
    expectSessionProjection(owner, owner.browser, selected, owner.contexts);
    plantConsole(selected, owner, "launch-live-getter");

    const builtOpts = launchOptions({ viewport: SECOND_VIEWPORT, colorScheme: "dark", reducedMotion: true, contrast: "more", reducedTransparency: true });
    const ownedContexts: { readonly context: BrowserContext }[] = [];
    built = await buildProbeContext({
      browser: owner.browser,
      opts: builtOpts,
      deviceDescriptor: null,
      sessionCookie: null,
      contextIndex: 9,
      ownedContexts,
    });
    expect(ownedContexts).toEqual([{ context: built.context }]);
    expectContextProjection(built, undefined);
    expect(built.evidence.contextIndex).toBe(9);
    expect(built.environmentContract).toEqual(resolveBrowserEnvironmentContract(builtOpts, null));

    const focused = probeSessionForContext(owner, built);
    expectSessionProjection(focused, owner.browser, built, focused.contexts);
    expect(focused.contexts).toEqual([built]);
    expect(focused.cleanup).toBeUndefined();
    plantConsole(built, focused, "focused-live-getter");
  } finally {
    await built?.context.close();
    await closeProbeSession(owner);
  }
  expect(ownerPages.every((page) => page.isClosed())).toBe(true);
});

test("both attach paths preserve full environment identity; recorded attach clones the owner's auth and boot seeds", async ({ scratch }) => {
  const { server, base } = await startOrigin();
  const ownerOpts = launchOptions({
    viewport: SECOND_VIEWPORT,
    colorScheme: "dark",
    reducedMotion: true,
    contrast: "more",
    reducedTransparency: true,
    localStorage: [
      { key: "orb:debug-token", value: "planted-debug-token" },
      { key: "orb:probe-mode", value: "1" },
      { key: "planted-seed", value: "owner-value" },
    ],
    contextCookies: ["planted_session=owner-cookie"],
    cookieDomain: "localhost",
    persistentProfileDir: scratch,
    browserArgs: ["--remote-debugging-port=0"],
  });
  const owner = await launchProbeSession(ownerOpts);
  const attachEnvironment: ProbeAttachOptions = {
    viewport: SECOND_VIEWPORT,
    device: null,
    colorScheme: "dark",
    reducedMotion: true,
    contrast: "more",
    reducedTransparency: true,
  };
  try {
    await owner.page.goto(base);
    expect(await owner.page.evaluate("localStorage.getItem('planted-seed')")).toBe("owner-value");
    expect(await owner.page.evaluate("document.cookie")).toContain("planted_session=owner-cookie");
    const endpoint = await debuggingEndpoint(scratch);

    const attached = await attachProbeSession(endpoint, attachEnvironment);
    const attachedContext = attached.contexts[0] as ProbeContext;
    expectContextProjection(attachedContext, false);
    expect(attachedContext.environmentContract).toEqual(resolveBrowserEnvironmentContract(attachEnvironment, null));
    expectSessionProjection(attached, attached.browser, attachedContext, attached.contexts);
    plantConsole(attachedContext, attached, "attached-live-getter");
    await closeProbeSession(attached);
    expect(await owner.page.evaluate("1 + 1")).toBe(2);

    const recorded = await attachProbeSession(endpoint, { ...attachEnvironment, recordVideoDir: join(scratch, "video") });
    const recordedContext = recorded.contexts[0] as ProbeContext;
    const recordedPage = recorded.page;
    try {
      expectContextProjection(recordedContext, true);
      expect(recordedContext.environmentContract).toEqual(resolveBrowserEnvironmentContract(attachEnvironment, null));
      expectSessionProjection(recorded, recorded.browser, recordedContext, recorded.contexts);
      plantConsole(recordedContext, recorded, "recorded-live-getter");
      await recordedPage.goto(base);
      expect(
        await recordedPage.evaluate(`({
          debugToken: localStorage.getItem("orb:debug-token"),
          probeMode: localStorage.getItem("orb:probe-mode"),
          seed: localStorage.getItem("planted-seed"),
          cookie: document.cookie,
        })`),
      ).toEqual({
        debugToken: "planted-debug-token",
        probeMode: "1",
        seed: "owner-value",
        cookie: expect.stringContaining("planted_session=owner-cookie"),
      });
      const recordedEnvironment = await readBrowserEnvironment(recordedPage, recorded.environmentContract);
      expect(recordedEnvironment.actual).toMatchObject({ contrast: "more", reducedTransparency: true });
      expect(recordedEnvironment.mismatches).toEqual([]);
    } finally {
      await closeProbeSession(recorded);
    }
    expect(recordedPage.isClosed()).toBe(true);
    expect(await owner.page.evaluate("1 + 1")).toBe(2);
  } finally {
    await closeProbeSession(owner);
    await closeOrigin(server);
  }
});
