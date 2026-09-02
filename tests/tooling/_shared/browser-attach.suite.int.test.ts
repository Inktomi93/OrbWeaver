// PHASE-0 SPIKE of the instrument substrate (docs/design/1208-instrument-substrate.md §10, issue #1226).
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
import type { ProbeSession } from "@orb/tooling/_shared/browser";
import { closeProbeSession, launchProbeSession } from "@orb/tooling/_shared/browser";
import { chromium } from "@playwright/test";
import { snapshot } from "lighthouse";
import puppeteer from "puppeteer-core";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

// Wall clock only — every arm below is a STRUCTURAL fact (a response body, an audit id, a node count), so
// this file stays in the parallel lane and scales its budget rather than withholding (see the LIVE_DRIVE
// rationale in vitest.config.ts). A lighthouse snapshot measured 2.6s solo; two of them plus two browser
// boots is the shape of the ceiling below.
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
