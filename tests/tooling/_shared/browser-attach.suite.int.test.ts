// PHASE-0 SPIKE of the instrument substrate (issue #1226).
// It answers the two questions the rest of the program is built on top of, and it answers them against a
// REAL headless Chromium over `--file` fixtures + a loopback origin — never the dev stack (§8, tooling law
// §4.5). Both questions are about a SECOND CDP CLIENT on a browser the ONE launcher already owns
// (`@orb/tooling/_shared/browser` `launchProbeSession` with the debugging-port launch shape
// `_shared/devtools-runtime.ts` already uses: a persistent profile + `--remote-debugging-port=0`, whose
// OS-assigned port Chrome publishes in `<profile>/DevToolsActivePort`).
//
//   Q1 (fork F3): does a shim the OWNING connection installed keep applying to requests a SECOND
//      `connectOverCDP` client triggers? If not, a sibling instrument cannot attach to a session's
//      browser (§3.4) and the daemon would have to spawn the sibling instead (F3 arm b).
//   Q2 (§6.1): can the `lighthouse` engine audit a page in that browser in `gatherMode: "snapshot"` —
//      i.e. WITHOUT navigating away from the client state a session is holding, and without launching a
//      second browser?
//
// HONESTY POSTURE — these are CHARACTERIZATION FENCES, not defect proofs: the spike changes no source, so
// there is no "red against HEAD" arm to have. What makes each one able to fail is a PLANTED CONTROL in the
// opposite direction, carried in the same test: the shim is REMOVED and the real body must come back; the
// clean fixture twin must report zero failed audits; an unreachable debugging port must THROW rather than
// report a comfortable zero.

import { readFile, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { attachProbeSession, closeProbeSession, launchProbeSession } from "@orb/tooling/_shared/browser";
import { openProbeContext } from "@orb/tooling/_shared/browser-context";
import type { ProbeSession } from "@orb/tooling/_shared/browser-contract";
import { reassertOwnerViewport } from "@orb/tooling/_shared/browser-emulation-guard";
import type { BrowserContext, Page } from "@playwright/test";
import { chromium } from "@playwright/test";
import { snapshot } from "lighthouse";
import puppeteer from "puppeteer-core";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// Structural assertions stay parallel; their completion deadline scales with browser startup cost.
const RUN_TIMEOUT_MS = scaledBudget(90_000, 4);
vi.setConfig({ testTimeout: RUN_TIMEOUT_MS, hookTimeout: RUN_TIMEOUT_MS });

const DEBUG_PORT_ATTEMPTS = 200;
const DEBUG_PORT_RETRY_MS = 25;
const VIEWPORT = { width: 1280, height: 800 } as const;

/** The debugging-port launch shape, through the ONE legal launch site. */
async function launchDebuggable(profileDir: string): Promise<ProbeSession> {
  return await launchProbeSession({
    headless: true,
    viewport: VIEWPORT,
    colorScheme: null,
    reducedMotion: false,
    localStorage: [{ key: "orb-attach-seed", value: "seeded" }],
    persistentProfileDir: profileDir,
    browserArgs: ["--remote-debugging-port=0"],
  });
}

test("recorded attach closes each partially-created resource exactly once without taking over the daemon browser", async ({ scratch }) => {
  const owner = await launchDebuggable(scratch);
  try {
    const endpoint = await debuggingEndpoint(scratch);
    for (const step of ["newContext", "newPage", "wirePage"] as const) {
      const attachedBrowser = await chromium.connectOverCDP(endpoint);
      const closeBrowser = attachedBrowser.close.bind(attachedBrowser);
      const createContext = attachedBrowser.newContext.bind(attachedBrowser);
      let context: BrowserContext | null = null;
      let browserCloseCalls = 0;
      let contextCloseCalls = 0;
      vi.spyOn(chromium, "connectOverCDP").mockResolvedValueOnce(attachedBrowser);
      vi.spyOn(attachedBrowser, "close").mockImplementation(async () => {
        browserCloseCalls += 1;
        await closeBrowser();
      });
      vi.spyOn(attachedBrowser, "newContext").mockImplementation(async (options) => {
        if (step === "newContext") {
          throw new Error("planted newContext refusal");
        }
        context = await createContext(options);
        const closeContext = context.close.bind(context);
        vi.spyOn(context, "close").mockImplementation(async () => {
          contextCloseCalls += 1;
          await closeContext();
        });
        if (step === "newPage") {
          vi.spyOn(context, "newPage").mockRejectedValueOnce(new Error("planted newPage refusal"));
        } else {
          vi.spyOn(context, "newCDPSession").mockRejectedValueOnce(new Error("planted wirePage refusal"));
        }
        return context;
      });

      await expect(
        attachProbeSession(endpoint, {
          viewport: VIEWPORT,
          device: null,
          colorScheme: null,
          reducedMotion: false,
          contrast: null,
          reducedTransparency: false,
          recordVideoDir: join(scratch, `video-${step}`),
        }),
      ).rejects.toThrow(`planted ${step} refusal`);
      expect(browserCloseCalls).toBe(1);
      expect(contextCloseCalls).toBe(step === "newContext" ? 0 : 1);
      expect(await owner.page.evaluate("1 + 1")).toBe(2);
      vi.restoreAllMocks();
    }
  } finally {
    vi.restoreAllMocks();
    await closeProbeSession(owner);
  }
});

/** Chrome publishes its OS-assigned debugging port only after it binds; poll for it, loudly. */
async function debuggingEndpoint(profileDir: string): Promise<string> {
  const file = join(profileDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < DEBUG_PORT_ATTEMPTS; attempt += 1) {
    // The file exists only after Chrome binds its ephemeral endpoint; the bounded loop owns the race and
    // throws below when its budget expires. (No gate-ignore: caught-failure-ownership's scanRoot is
    // packages/*/src + tooling/src, so `tests/` carries no suppressible violation.)
    try {
      const [line] = (await readFile(file, "utf8")).split("\n");
      const port = Number(line);
      if (Number.isInteger(port) && port > 0) {
        return `http://127.0.0.1:${port}`;
      }
    } catch {
      // not published yet
    }
    await sleep(DEBUG_PORT_RETRY_MS);
  }
  throw new Error(`Chrome did not publish DevToolsActivePort under ${profileDir}`);
}

/** A loopback origin that answers a REAL body — what the shim has to be seen overriding. */
async function startOrigin(): Promise<{ readonly server: Server; readonly base: string }> {
  const server = createServer((req, res) => {
    if ((req.url ?? "").startsWith("/settings.json")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ origin: "REAL" }));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end('<!doctype html><html lang="en"><body><main>fixture</main></body></html>');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function closeOrigin(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

/** A port nothing is listening on: bound to an OS-assigned port, then released. */
async function freePort(): Promise<number> {
  const { server, base } = await startOrigin();
  await closeOrigin(server);
  return Number(new URL(base).port);
}

test("a route shim owned by the LAUNCHING connection keeps applying to a request a SECOND CDP client triggers", async ({ scratch }) => {
  const { server, base } = await startOrigin();
  const session = await launchDebuggable(scratch);
  try {
    const endpoint = await debuggingEndpoint(scratch);
    // The OWNER installs the shim on its own connection and never touches the page again.
    await session.page.route("**/settings.json", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ origin: "SHIMMED" }) });
    });

    const second = await chromium.connectOverCDP(endpoint);
    try {
      const context = second.contexts()[0];
      expect(context).toBeDefined();
      const page = (context as NonNullable<typeof context>).pages()[0];
      expect(page).toBeDefined();
      const attached = page as NonNullable<typeof page>;

      // The second client DRIVES: navigate, then evaluate a fetch that the owner's shim must intercept.
      await attached.goto(`${base}/page.html`);
      expect(await attached.evaluate("fetch('/settings.json').then((r) => r.text())")).toBe('{"origin":"SHIMMED"}');
      expect(await attached.evaluate("document.querySelector('main').textContent")).toBe("fixture");

      // PLANTED CONTROL — with the shim removed, the same drive must see the origin's REAL body. Without
      // this arm the assertion above would pass against a page that was never shimmed at all.
      await session.page.unroute("**/settings.json");
      await attached.goto(`${base}/page.html?control=1`);
      expect(await attached.evaluate("fetch('/settings.json').then((r) => r.text())")).toBe('{"origin":"REAL"}');
    } finally {
      await second.close();
    }
    // The owner's connection survives the sibling's detach — an attach is not a takeover.
    expect(await session.page.evaluate("1 + 1")).toBe(2);
  } finally {
    await closeProbeSession(session);
    await closeOrigin(server);
  }
});

test("shim reach follows the shim's SCOPE, not the connection: a CONTEXT-scoped shim and init script cover a tab the second client opened; a PAGE-scoped one does not", async ({
  scratch,
}) => {
  const { server, base } = await startOrigin();
  const session = await launchDebuggable(scratch);
  try {
    const endpoint = await debuggingEndpoint(scratch);
    // Page-scoped (the narrow arm) and context-scoped (the shape installSettingsShim uses) on two paths.
    await session.page.route("**/settings.json", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ origin: "PAGE-SHIM" }) });
    });
    await session.context.route("**/context.json", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ origin: "CONTEXT-SHIM" }) });
    });

    const second = await chromium.connectOverCDP(endpoint);
    try {
      const context = second.contexts()[0] as NonNullable<ReturnType<typeof second.contexts>[number]>;
      const own = await context.newPage();
      await own.goto(`${base}/own.html`);
      // The context-scoped shim and the context-scoped init script both reach a tab THIS client opened…
      expect(await own.evaluate("fetch('/context.json').then((r) => r.text())")).toBe('{"origin":"CONTEXT-SHIM"}');
      expect(await own.evaluate("localStorage.getItem('orb-attach-seed')")).toBe("seeded");
      // …and the page-scoped one does not — it was never about this tab.
      expect(await own.evaluate("fetch('/settings.json').then((r) => r.text())")).toBe('{"origin":"REAL"}');
    } finally {
      await second.close();
    }
  } finally {
    await closeProbeSession(session);
    await closeOrigin(server);
  }
});

test("a persistent session browser gives matrix cells isolated contexts while its owner remains usable", async ({ scratch }) => {
  const { server, base } = await startOrigin();
  const owner = await launchDebuggable(scratch);
  const mobile = await openProbeContext(
    owner.browser,
    {
      headless: true,
      viewport: { width: 412, height: 823 },
      colorScheme: null,
      reducedMotion: false,
      localStorage: [{ key: "matrix-cell", value: "mobile" }],
    },
    0,
  );
  const desktop = await openProbeContext(
    owner.browser,
    {
      headless: true,
      viewport: VIEWPORT,
      colorScheme: null,
      reducedMotion: false,
      localStorage: [{ key: "matrix-cell", value: "desktop" }],
    },
    0,
  );
  try {
    const mobilePage = mobile.pages[0] as NonNullable<(typeof mobile.pages)[number]>;
    const desktopPage = desktop.pages[0] as NonNullable<(typeof desktop.pages)[number]>;
    await Promise.all([mobilePage.goto(`${base}/mobile`), desktopPage.goto(`${base}/desktop`)]);
    expect(await mobilePage.evaluate("innerWidth")).toBe(412);
    expect(await desktopPage.evaluate("innerWidth")).toBe(1280);
    expect(await mobilePage.evaluate("localStorage.getItem('matrix-cell')")).toBe("mobile");
    expect(await desktopPage.evaluate("localStorage.getItem('matrix-cell')")).toBe("desktop");
  } finally {
    await mobile.context.close();
    await desktop.context.close();
    expect(await owner.page.evaluate("innerWidth")).toBe(1280);
    await closeProbeSession(owner);
    await closeOrigin(server);
  }
});

interface AuditRead {
  readonly id: string;
  readonly score: number | null;
  readonly nodes: number;
}

function readAudits(lhr: { readonly audits: Record<string, { readonly id: string; readonly score: number | null; readonly details?: unknown }> }): {
  readonly scored: readonly AuditRead[];
  readonly failed: readonly AuditRead[];
} {
  const all = Object.values(lhr.audits).map((audit): AuditRead => {
    const details = audit.details;
    const items = typeof details === "object" && details !== null && "items" in details ? (details as { items?: readonly unknown[] }).items : undefined;
    return { id: audit.id, score: audit.score, nodes: items?.length ?? 0 };
  });
  const scored = all.filter((audit) => audit.score !== null);
  return { scored, failed: scored.filter((audit) => (audit.score ?? 1) < 1) };
}

test("lighthouse audits the page in the session's own browser (snapshot mode, no second browser) and names label-content-name-mismatch with its node count", async ({
  scratch,
}) => {
  const mismatch = join(scratch, "mismatch.html");
  const clean = join(scratch, "clean.html");
  // The defect: the accessible name ("Send") does not contain the visible label ("Submit the order"), so a
  // voice-control user saying what they SEE cannot activate the control.
  await writeFile(
    mismatch,
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>mismatch</title></head><body><main><button aria-label="Send">Submit the order</button></main></body></html>',
    "utf8",
  );
  await writeFile(
    clean,
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>clean</title></head><body><main><button aria-label="Submit the order now">Submit the order</button></main></body></html>',
    "utf8",
  );

  const session = await launchDebuggable(scratch);
  try {
    const endpoint = await debuggingEndpoint(scratch);
    await session.page.goto(pathToFileURL(mismatch).href);

    // The engine's seam is a puppeteer-core Page (lighthouse's `snapshot(page)` takes LH.Puppeteer.Page and
    // drives it through `page.target().createCDPSession()`). Connecting over the SAME debugging port
    // ATTACHES to the tab the one launcher already opened — no second browser, no navigation, so the
    // client state a session is holding survives the audit.
    const engineBrowser = await puppeteer.connect({ browserURL: endpoint, defaultViewport: null });
    try {
      const pages = await engineBrowser.pages();
      const target = pages.find((page) => page.url().endsWith("mismatch.html"));
      expect(target).toBeDefined();
      const config = { extends: "lighthouse:default" as const, settings: { onlyCategories: ["accessibility"] } };
      const flags = { logLevel: "error" as const, output: "json" as const };

      const bad = await snapshot(target as NonNullable<typeof target>, { config, flags });
      expect(bad).toBeDefined();
      const badRead = readAudits((bad as NonNullable<typeof bad>).lhr);
      expect(badRead.scored.length).toBeGreaterThan(0);
      expect(badRead.failed.map((audit) => `${audit.id}=${audit.nodes}`)).toStrictEqual(["label-content-name-mismatch=1"]);
      // THE TRAP, pinned: the CATEGORY score stays a perfect 1 — this audit carries no category weight. An
      // arm that reported only `lighthouse-a11y=` would print a clean score over a real defect, so the
      // failed-audit list is the load-bearing output, not the score (§6.1's RESULT pairs).
      expect((bad as NonNullable<typeof bad>).lhr.categories["accessibility"]?.score).toBe(1);

      // The clean twin: same engine, same browser, zero failed audits with a non-zero audited count — the
      // control that proves the run above measured something.
      await session.page.goto(pathToFileURL(clean).href);
      const good = await snapshot(target as NonNullable<typeof target>, { config, flags });
      expect(good).toBeDefined();
      const goodRead = readAudits((good as NonNullable<typeof good>).lhr);
      expect(goodRead.failed).toStrictEqual([]);
      expect(goodRead.scored.length).toBeGreaterThan(0);
    } finally {
      await engineBrowser.disconnect();
    }
  } finally {
    await closeProbeSession(session);
  }
});

test("an unreachable debugging port THROWS instead of reporting zero failed audits", async () => {
  const port = await freePort();
  await expect(puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null })).rejects.toThrow();
});

// This deliberately equals the old hard-coded away viewport, proving the repair cannot silently no-op.
const CORRUPTIBLE_VIEWPORT = { width: 111, height: 222 } as const;
const READ_SCREEN_JS = "({w: window.screen.width, h: window.screen.height, iw: window.innerWidth, ih: window.innerHeight})";

async function launchDebuggableAtViewport(profileDir: string): Promise<ProbeSession> {
  return await launchProbeSession({
    headless: true,
    viewport: CORRUPTIBLE_VIEWPORT,
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
    persistentProfileDir: profileDir,
    browserArgs: ["--remote-debugging-port=0"],
  });
}

/** Rapid accelerated browser launches can expose the attached page before Chromium has produced its
 *  first compositor frame. A screencast frame is the protocol's positive proof that the surface exists;
 *  unlike a timer or screenshot retry, it barriers on the exact resource the planted operation needs. */
async function waitForCompositorFrame(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const frame = new Promise<number>((resolve) => {
      cdp.once("Page.screencastFrame", ({ sessionId: frameSessionId }) => resolve(frameSessionId));
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 1, maxWidth: 1, maxHeight: 1 });
    const sessionId = await frame;
    await cdp.send("Page.screencastFrameAck", { sessionId });
    await cdp.send("Page.stopScreencast");
  } finally {
    await cdp.detach();
  }
}

test("#1287: the owner's viewport round trip repairs screen corruption even at the former away size", async ({ scratch }) => {
  const { server, base } = await startOrigin();
  const session = await launchDebuggableAtViewport(scratch);
  try {
    const endpoint = await debuggingEndpoint(scratch);
    await session.page.goto(`${base}/owner.html`);
    const boot = await session.page.evaluate(READ_SCREEN_JS);
    expect(boot).toStrictEqual({ w: 111, h: 222, iw: 111, ih: 222 });

    // Attach through the ONE real production door (gate arm H) — the same call every sibling instrument
    // makes (design-audit/motion-audit/perf-meter/record, ops/session-attach.ts).
    const sibling = await attachProbeSession(endpoint, {
      viewport: CORRUPTIBLE_VIEWPORT,
      device: null,
      colorScheme: null,
      reducedMotion: false,
      contrast: null,
      reducedTransparency: false,
    });
    try {
      await sibling.page.goto(`${base}/sibling.html`);
      await waitForCompositorFrame(sibling.page);
      // The proven corrupting op: a screenshot on a page THIS connection did not create (design-audit's
      // own `resolvePixelBackdrops`, ui-audit/ops/pixels.ts).
      await sibling.page.screenshot({ animations: "disabled", scale: "css" });
    } finally {
      await closeProbeSession(sibling);
    }

    // Planted control: the sibling detach corrupts screen while leaving the CSS viewport intact.
    const corrupted = await session.page.evaluate(READ_SCREEN_JS);
    expect(corrupted).toStrictEqual({ w: 800, h: 600, iw: 111, ih: 222 });

    await reassertOwnerViewport(session.page, CORRUPTIBLE_VIEWPORT);
    const repaired = await session.page.evaluate(READ_SCREEN_JS);
    expect(repaired).toStrictEqual({ w: 111, h: 222, iw: 111, ih: 222 });
  } finally {
    await closeProbeSession(session);
    await closeOrigin(server);
  }
});

test("reassertOwnerViewport refuses to run against a page it did not create — the attached-connection shape it exists to protect FROM, not repair through", async ({
  scratch,
}) => {
  const session = await launchDebuggableAtViewport(scratch);
  try {
    const endpoint = await debuggingEndpoint(scratch);
    const sibling = await attachProbeSession(endpoint, {
      viewport: CORRUPTIBLE_VIEWPORT,
      device: null,
      colorScheme: null,
      reducedMotion: false,
      contrast: null,
      reducedTransparency: false,
    });
    try {
      await expect(reassertOwnerViewport(sibling.page, CORRUPTIBLE_VIEWPORT)).rejects.toThrow(/did not create/u);
    } finally {
      await closeProbeSession(sibling);
    }
  } finally {
    await closeProbeSession(session);
  }
});
