// @instrument-proof: a planted `label-content-name-mismatch` node — the exact axe finding the retired
// chrome-devtools MCP produced and snap could not — must
// be REPORTED BY NAME with its selector and must RED the run; the clean twin must print
// `failed-audits=0` over a non-zero audited count and exit 0, so the arm cannot be an always-red.
//
// @instrument-absence-proof: a page that never signals `data-app-ready` must REFUSE (exit 2, INSTRUMENT
// ERROR) rather than audit a boot skeleton and report its scores as if they described the app.
//
// The fixtures are served over a REAL loopback origin, not file://, because two of the three categories
// ask the ORIGIN questions (`robots-txt` fetches /robots.txt; a file:// page fails it unconditionally),
// so a clean run — the negative control this whole file rests on — is unreachable over file://.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(180_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A fixture page for snap's Lighthouse arm.">
<title>Snap lighthouse fixture</title>`;
const CLEAN_BODY = `<main><h1>Plugins</h1><p style="color:#111;background:#fff">Readable body copy.</p>
<button type="button">Save changes</button><a href="/other.html">Read the other page</a></main>`;
/** The plant: a visible label ("Save changes") that the accessible name ("Close") does not contain. */
const MISMATCH_BUTTON = '<button aria-label="Close">Save changes</button>';
const ORB_CONSOLE_BRIDGE = `<script>globalThis.__orb = {
  consoleErrors: () => ({ records: [], dropped: 0, cap: 128 }),
  resetEvidence: () => {}
};</script>`;

function page(body: string, ready = true): string {
  return `<!doctype html><html lang="en"${ready ? ' data-app-ready="settled"' : ""}><head>${HEAD}</head><body>${body}${ORB_CONSOLE_BRIDGE}</body></html>`;
}

const PAGES: Readonly<Record<string, string>> = {
  "/clean.html": page(CLEAN_BODY),
  "/bad.html": page(`${CLEAN_BODY}${MISMATCH_BUTTON}`),
  "/not-ready.html": page(CLEAN_BODY, false),
  "/other.html": page("<main><h1>Other</h1></main>"),
};

/** A loopback fixture origin. Anything unknown answers 200-empty rather than 404 on purpose: a 404 for
 *  `/favicon.ico` would land in snap's failed-request verdict and RED every case here for a reason that
 *  has nothing to do with the arm under test. */
function serveFixtures(): Promise<{ readonly base: string; readonly close: () => void }> {
  const server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/";
    if (path === "/robots.txt") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      response.end("User-agent: *\nAllow: /\n");
      return;
    }
    const html = PAGES[path];
    response.writeHead(200, { "content-type": html === undefined ? "text/plain; charset=utf-8" : "text/html; charset=utf-8" });
    response.end(html ?? "");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${address.port}`,
        close: (): void => {
          server.close();
        },
      });
    });
  });
}

const ARGS = ["--no-shot", "--no-failure-evidence", "--no-deadcss"];

test("the planted label/name mismatch is reported BY NAME with its selector, and REDs the run", async ({ runCli }) => {
  const fixture = await serveFixtures();
  try {
    const bad = await runCli("snap", ["/bad.html", "--base", fixture.base, "--lighthouse", "desktop", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

    expect(bad.stdout).toContain("FAIL label-content-name-mismatch");
    expect(bad.stdout).toContain("→ ");
    expect(bad.stdout).toContain("lighthouse=desktop/snapshot");
    expect(bad.stdout).toMatch(/lighthouse-failed-audits=[1-9]/u);
    expect(bad.stdout).toContain("page-errors=0");
    await expect(bad).toExitWith(EXIT.violations);
  } finally {
    fixture.close();
  }
});

test("the clean twin prints failed-audits=0 over a real audited denominator and exits 0", async ({ runCli }) => {
  const fixture = await serveFixtures();
  try {
    const clean = await runCli("snap", ["/clean.html", "--base", fixture.base, "--lighthouse", "desktop", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

    expect(clean.stdout).toContain("failed-audits=0");
    expect(clean.stdout).not.toContain("label-content-name-mismatch");
    // The denominator: a clean sheet over ZERO audits would be refused by the verdict door, so the pin
    // reads the number, not just the zero.
    expect(clean.stdout).toMatch(/audited=[1-9]\d*\b/u);
    expect(clean.stdout).toMatch(/lighthouse-audits=[1-9]\d*/u);
    expect(clean.stdout).toContain("lighthouse-accessibility=1");
    expect(clean.stdout).toContain("page-errors=0");
    expect(clean.stdout).toContain("console-errors=0");
    await expect(clean).toExitWith(EXIT.clean);
  } finally {
    fixture.close();
  }
});

test("the mobile arm rides --mobile's device and says which arm it ran", async ({ runCli }) => {
  const fixture = await serveFixtures();
  try {
    const mobile = await runCli("snap", ["/clean.html", "--base", fixture.base, "--lighthouse", "mobile", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

    expect(mobile.stdout).toContain("lighthouse=mobile/snapshot");
    expect(mobile.stdout).toContain("failed-audits=0");
    expect(mobile.stdout).toContain("page-errors=0");
    await expect(mobile).toExitWith(EXIT.clean);
  } finally {
    fixture.close();
  }
});

test("a page that never signalled readiness REFUSES — exit 2, not a scored audit of a boot skeleton", async ({ runCli }) => {
  const fixture = await serveFixtures();
  try {
    const refused = await runCli("snap", ["/not-ready.html", "--base", fixture.base, "--lighthouse", "desktop", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

    expect(refused.stdout).toContain("INSTRUMENT ERROR");
    expect(refused.stdout).toContain("data-app-ready");
    expect(refused.stdout).toContain("lighthouse=REFUSED");
    expect(refused.stdout).not.toContain("failed-audits=");
    await expect(refused).toExitWith(EXIT.toolError);
  } finally {
    fixture.close();
  }
});

test("a device arm the vocabulary does not know is refused before a browser boots", async ({ runCli }) => {
  const misuse = await runCli("snap", ["/", "--lighthouse", "phone", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

  expect(misuse.stdout).toContain("--lighthouse expects desktop | mobile");
  await expect(misuse).toExitWith(EXIT.misuse);
});

test("--lighthouse desktop on the mobile device is refused: the label and the context would disagree", async ({ runCli }) => {
  const misuse = await runCli("snap", ["/", "--lighthouse", "desktop", "--mobile", ...ARGS], { timeoutMs: CLI_TIMEOUT_MS });

  expect(misuse.stdout).toContain("--lighthouse desktop cannot run on the --mobile device descriptor");
  await expect(misuse).toExitWith(EXIT.misuse);
});
