import { existsSync } from "node:fs";
import { createServer } from "node:http";
import process from "node:process";
import { snapContexts } from "../../../../tooling/src/snap/ops/contexts.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { chromiumDescendantPids } from "../../../support/chromium-processes.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FIXTURE_USER = { handle: "owner", password: "password" };

test("a strict-console getter failure after capture closes the owned Chromium session", async () => {
  let pageRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/api/auth/login") {
      response.writeHead(200, { "set-cookie": "orb_session=test-session; Path=/; HttpOnly" });
      response.end();
      return;
    }
    pageRequests += 1;
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<!doctype html><html data-app-ready="settled"><body><main>captured</main></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("test server did not bind a TCP port");
  }
  const base = `http://127.0.0.1:${address.port}`;
  const before = chromiumDescendantPids(process.pid);
  const primary = new Error("strict-console getter failed after capture");
  let liveAtGetter: number[] = [];
  let survivors: number[] = [];

  try {
    const opts = parseSnapArgs(["/", "--no-shot", "--no-failure-evidence"]);
    opts.base = base;
    Object.defineProperty(opts, "strictConsole", {
      configurable: true,
      get() {
        liveAtGetter = [...chromiumDescendantPids(process.pid)].filter((pid) => !before.has(pid));
        throw primary;
      },
    });

    const failure = await snapContexts(opts, [FIXTURE_USER], { serverUrl: base, baseUrl: base, serverPort: address.port }).catch((error: unknown) => error);
    survivors = liveAtGetter.filter((pid) => existsSync(`/proc/${pid}`));

    expect(pageRequests).toBeGreaterThan(0);
    expect(liveAtGetter.length).toBeGreaterThan(0);
    expect(failure).toBe(primary);
    expect(survivors).toEqual([]);
  } finally {
    // This only fires in the planted RED run. Kill the exact Chromium descendants the broken owner leaked.
    for (const pid of survivors) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // The process may exit while the assertion failure unwinds.
      }
    }
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});
