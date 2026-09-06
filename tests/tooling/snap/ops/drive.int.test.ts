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
