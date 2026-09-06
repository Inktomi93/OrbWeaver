// @instrument-proof: #1142 — `--isolated` promised the reader ONE re-run and needed TWO. A cold stage's
// first navigation builds the route on demand and the app misses the readiness ceiling; the run refused with
// "re-run against the now-warm stage", the re-run refused identically, and only the THIRD invocation
// measured (reproduced at four shas by cb-row-anatomy). The count is pinned HERE, as the number of
// NAVIGATIONS a caller has to pay for: on a stage the warm-up navigation is inside the run.
//
// @instrument-absence-proof: the second arm is the control in the other direction — the same never-mounting
// page WITHOUT `--isolated` (a dev stack, a `--base` origin) must refuse on the first pass. Retrying there
// would turn a real app defect into a slower app defect, so the retry is proven to be stage-scoped rather
// than unconditional.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "@playwright/test";
import { navigate } from "../../../../tooling/src/snap/ops/drive.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(120_000);

/** A page that mounts only once the origin has served the document ONCE — the cold-vite shape: the first
 *  navigation gets a document whose app never publishes `data-app-ready`, and the next one gets the app. */
const COLD_DOCUMENT = '<!doctype html><html lang="en"><body><main>cold vite: route chunk still building</main></body></html>';
const WARM_DOCUMENT =
  '<!doctype html><html lang="en" data-app-ready="settled"><body><main>app</main><script>globalThis.__orb={queries:()=>[{k:1}]};</script></body></html>';

async function coldStageServer(warmAfter: number): Promise<{ readonly base: string; readonly documents: () => number; readonly close: () => Promise<void> }> {
  let documents = 0;
  const server = createServer((_request, response) => {
    documents += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(documents > warmAfter ? WARM_DOCUMENT : COLD_DOCUMENT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    documents: (): number => documents,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    },
  };
}

async function driveOnce(argv: readonly string[], base: string): Promise<string | null> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    // A short readiness ceiling: the cold document NEVER publishes the flag, so this arm is otherwise
    // buying nothing but the ceiling twice. The count under test is navigations, not milliseconds.
    page.setDefaultTimeout(2000);
    return await navigate(page, parseSnapArgs([...argv, "--base", base, "--no-shot", "--no-deadcss", "--no-failure-evidence"]), base);
  } finally {
    await browser.close();
  }
}

test("an --isolated run pays the cold stage's warm-up navigation itself", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await coldStageServer(1);
  try {
    const navError = await driveOnce(["/", "--isolated"], server.base);

    // ONE CLI invocation measured, which is what the refusal text has always promised the reader.
    expect(navError, "the stage's second navigation reached a mounted app, so this run has a verdict").toBeNull();
    // …and it did so by navigating TWICE inside the one run — the count the row is about.
    expect(server.documents()).toBe(2);
  } finally {
    await server.close();
  }
});

test("a non-stage origin that never mounts still refuses on the first navigation", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  // PLANTED CONTROL: the same never-mounting document, served forever, without --isolated.
  const server = await coldStageServer(Number.MAX_SAFE_INTEGER);
  try {
    const navError = await driveOnce(["/"], server.base);

    expect(navError, "an app that never mounts on a dev stack is a finding, not a warm-up").toContain("app never signalled data-app-ready");
    expect(server.documents(), "no retry outside a stage").toBe(1);
  } finally {
    await server.close();
  }
});

// @instrument-proof: #1837 — scoping #1142's warm-up to the `absent` arm left uncovered the arm a cold stage
// ACTUALLY produces. The client's readiness signal has its OWN hard 20s ceiling that stamps
// `data-app-ready="degraded"` one-shot (packages/client/src/lib/app-ready-signal.ts), well inside snap's 60s
// STAGE_READY budget — so a cold stage never reaches `absent`, it reaches `degraded`, and every isolated boot
// at d5adb9103 refused on a QUIET box (load 3.8/24): 1375 HAR entries, ~1370 of them vite source-module
// transforms over 28.7s, ONE api call (`/api/auth/me`, 19ms, 200), zero page errors. The same stage re-run
// warm came back `nav=OK` in 8s — a fresh document gets a fresh one-shot signal, which is the whole retry.
const DEGRADED_DOCUMENT = '<!doctype html><html lang="en" data-app-ready="degraded"><body><main>mid-hydration</main></body></html>';

/** The cold-stage shape the CLIENT actually produces: the first document's app hits its own readiness
 *  ceiling and stamps `degraded`; the next one, against a now-warm module graph, settles. */
async function degradedThenWarmServer(
  warmAfter: number,
): Promise<{ readonly base: string; readonly documents: () => number; readonly close: () => Promise<void> }> {
  let documents = 0;
  const server = createServer((_request, response) => {
    documents += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(documents > warmAfter ? WARM_DOCUMENT : DEGRADED_DOCUMENT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    documents: (): number => documents,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    },
  };
}

test("an --isolated run pays the warm-up navigation for a DEGRADED first readiness too", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await degradedThenWarmServer(1);
  try {
    const navError = await driveOnce(["/", "--isolated"], server.base);

    expect(navError, "the stage's second, warm navigation settled, so this run has a verdict").toBeNull();
    expect(server.documents(), "the warm-up navigation is inside the run, exactly as for the `absent` arm").toBe(2);
  } finally {
    await server.close();
  }
});

// @instrument-absence-proof: the retry is ONE, and a stage that still cannot settle refuses LOUDLY. A third
// navigation would be the same under-instruction #1142 was minted to kill, one hop further out.
test("a stage whose warm navigation is still degraded refuses after exactly one retry", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await degradedThenWarmServer(Number.MAX_SAFE_INTEGER);
  try {
    const navError = await driveOnce(["/", "--isolated"], server.base);

    expect(navError, "a stage that never settles is a finding, stated as one").toContain("data-app-ready came up DEGRADED");
    expect(navError, "and the refusal must not send the reader back for a re-run the code already paid").not.toContain("re-run against the now-warm stage");
    expect(server.documents(), "one warm-up, never two").toBe(2);
  } finally {
    await server.close();
  }
});

// @instrument-absence-proof: the widened retry stays STAGE-scoped. A degraded dev stack is a real app finding
// on the first pass — retrying there would turn a finding into a slower finding.
test("a non-stage origin that comes up degraded still refuses on the first navigation", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await degradedThenWarmServer(Number.MAX_SAFE_INTEGER);
  try {
    const navError = await driveOnce(["/"], server.base);

    expect(navError, "a degraded dev stack is the app's finding to answer").toContain("data-app-ready came up DEGRADED");
    expect(server.documents(), "no retry outside a stage").toBe(1);
  } finally {
    await server.close();
  }
});
