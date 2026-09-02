// `--lighthouse` — the audit ENGINE the retired chrome-devtools MCP wrapped, run against THIS run's
// already-driven page (docs/design/1195-devtools-mcp-retirement.md §2 item 1; the census that justifies
// the dependency is §1 of the same doc: 41 `lighthouse_audit` calls in 14 days, and the only MCP
// findings snap could not produce — axe's `label-content-name-mismatch` and `target-size`).
//
// THE SEAM, and why it is this one. Lighthouse drives a PUPPETEER page (`page.target().createCDPSession()`
// plus a wildcard `'*'` protocol listener and `sessionattached` — none of which Playwright's CDPSession
// speaks), so a hand-written Playwright→puppeteer adapter would be a fake of a private surface. The two
// honest options were "let Lighthouse launch its own Chrome" (a SECOND browser, which cannot see this
// run's client state and re-emulates its own device — exactly the shared-browser/emulation-leak class
// this program retires) and this one: launch OUR chromium with `--remote-debugging-port`, then attach
// puppeteer-core to the SAME browser over that endpoint and hand Lighthouse the puppeteer handle for the
// EXACT target Playwright is driving (matched by CDP `Target.getTargetInfo` id, never by URL). One
// browser, one page, one device story. Verified live before this file existed.
//
// DESIGNED TO BE LIFTED. `auditSettledPage` is a pure function of a Playwright `Page` + the endpoint port
// + the two flag arms; it holds no snap state and no session lifetime. When the stateful snap-session
// substrate lands it can call this directly with its own page — the only snap-shaped thing here is
// `runLighthouseArm`, the 20-line wrapper that reads `Args` and files artifacts.
//
// SNAPSHOT IS THE DEFAULT. Every surface under review in this app is client state: a `navigation` run
// reloads the URL and audits a freshly-booted page, which is a DIFFERENT page than the one the drive
// queue just built. `navigation` stays available because the census counted 9 of them (whole-page load
// receipts), and it says so on the RESULT line so a reader never has to guess which one they got.
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { Flags } from "lighthouse";
import type { Page as PuppeteerPage } from "puppeteer-core";
import { artifactFile } from "../../_shared/artifact-out.ts";
import { print } from "../../_shared/artifacts.ts";
import type { ProbeSession } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { LighthouseDevice, LighthouseMode, LighthouseOutcome, LighthouseReceipt } from "../contract/lighthouse.ts";
import { LIGHTHOUSE_CATEGORIES } from "../contract/lighthouse.ts";
import type { Args } from "../contract/types.ts";
import { auditedCount, categoryScores, failedAudits, lighthouseLines, reportTruncation } from "../lib/lighthouse-report.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --lighthouse <desktop|mobile>");

/** Chrome binds the debugging endpoint during startup, but `chromium.launch()` resolves on its OWN
 *  transport — so the first `/json/version` can land before the listener exists. Bounded, then refused. */
const ENDPOINT_ATTEMPTS = 60;
const ENDPOINT_RETRY_MS = 50;

interface LighthouseAsk {
  readonly device: LighthouseDevice;
  readonly mode: LighthouseMode;
  readonly port: number;
  readonly jsonPath: string;
  readonly htmlPath: string;
}

function gap(evidence: string, detail: string): LighthouseOutcome {
  return { kind: "refused", gap: { evidence, detail } };
}

/** The SETTLED-page gate. `--lighthouse` audits the app as the drive queue left it, so a page that never
 *  signalled readiness is mid-hydration and every audit over it describes a skeleton. `--file` mocks are
 *  held to the same bar (they carry the attribute in their markup) — the arm has ONE readiness rule. */
async function readinessRefusal(page: Page): Promise<LighthouseOutcome | null> {
  const flag = await page.locator("html").first().getAttribute("data-app-ready");
  if (flag === null) {
    return gap(
      "the audited page's readiness",
      "`html[data-app-ready]` is absent — the page is mid-hydration (or is not this app), so a Lighthouse audit of it would describe a boot skeleton. Drive to a settled surface first; the readiness contract is tooling/src/snap/ops/drive.ts.",
    );
  }
  if (flag === "degraded") {
    return gap(
      "the audited page's readiness",
      "`data-app-ready` came up DEGRADED — reads were still in flight at the readiness ceiling, so the audited DOM is not the settled app (tooling/src/snap/ops/drive.ts).",
    );
  }
  return null;
}

/** Wait for OUR chromium's `--remote-debugging-port` listener, then prove it is a browser endpoint. */
async function awaitEndpoint(port: number): Promise<void> {
  for (let attempt = 0; attempt < ENDPOINT_ATTEMPTS; attempt += 1) {
    // @orb-gate-ignore caught-failure-ownership(empty:catch): the bounded retry loop OWNS this failure — a connection refused before Chrome binds its listener is the normal first tick, and exhaustion throws the named error below. Ends if exhaustion stops throwing.
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        await response.json();
        return;
      }
    } catch {
      // Chrome has not bound the endpoint yet — retry inside the budget.
    }
    await sleep(ENDPOINT_RETRY_MS);
  }
  throw new Error(
    `the Chrome debugging endpoint on 127.0.0.1:${port} never answered within ${ENDPOINT_ATTEMPTS * ENDPOINT_RETRY_MS}ms — the port was reserved but nothing bound it (tooling/src/snap/lib/loopback-port.ts)`,
  );
}

/** The puppeteer handle for the EXACT target Playwright is driving. Matched by CDP target id, never by
 *  URL: a `--pages N` run has several tabs on one origin and a URL match would audit an arbitrary one. */
async function attachToTarget(port: number, targetId: string): Promise<{ readonly page: PuppeteerPage; readonly disconnect: () => Promise<void> }> {
  const { default: puppeteer } = await import("puppeteer-core");
  // `defaultViewport: null` IS LOAD-BEARING (measured 2026-09-02). Puppeteer's default is
  // `{width: 800, height: 600}` and it APPLIES that to every page it attaches to — including a page it
  // did not create. Against this run's Playwright context it silently replaced the emulated device with
  // 800x600/pointer:none/hover:none, which snap's own environment contract then reported as three
  // mismatches: the attach had changed the page it was there to observe. `null` means "leave the
  // browser's own metrics alone", which is the only correct answer for an observer.
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
  const disconnect = async (): Promise<void> => {
    await browser.disconnect();
  };
  try {
    for (const candidate of await browser.pages()) {
      const session = await candidate.createCDPSession();
      const info = await session.send("Target.getTargetInfo");
      await session.detach();
      if (info.targetInfo.targetId === targetId) {
        return { page: candidate, disconnect };
      }
    }
  } catch (error) {
    await disconnect();
    throw error;
  }
  await disconnect();
  throw new Error(`no puppeteer page on the debugging endpoint matches the driven target ${targetId} (tooling/src/snap/ops/lighthouse.ts)`);
}

/** Everything Lighthouse is told. The device is NOT re-emulated: the browser context already carries
 *  `--mobile`'s descriptor (touch, coarse pointer, DPR 3), so `screenEmulation.disabled` keeps ONE device
 *  story and `formFactor` only tells the audits which set of thresholds to judge against. */
function lighthouseFlags(device: LighthouseDevice): Flags {
  return {
    logLevel: "error",
    onlyCategories: [...LIGHTHOUSE_CATEGORIES],
    formFactor: device === "mobile" ? "mobile" : "desktop",
    screenEmulation: { disabled: true },
    // The link is real and the page is already loaded; simulated throttling would only re-time a load
    // this arm does not measure (performance is deliberately not among the categories).
    throttlingMethod: "provided",
    // MEASURED, not defensive (2026-09-02, A/B on one fixture): Lighthouse's full-page-screenshot
    // gatherer RESIZES the viewport through `Emulation.setDeviceMetricsOverride` and restores it "best
    // effort" — its own source calls that brittle for non-DevTools consumers
    // (core/gather/gatherers/full-page-screenshot.js). With the flag OFF, a clean 1280x800 run came back
    // `environment-fails=1 — screen expected 1280x800 but observed 800x600`: the audit had changed the
    // browser identity of the run it was auditing. With it ON, `environment-fails=0`. Snap owns the
    // pixels anyway (the HTML report only loses its node thumbnails), so the artifact is switched off at
    // the source rather than papered over by re-emulating afterwards. The tripwire stays live: the
    // environment contract is read AFTER this arm (ops/run.ts), so a future leak REDs instead of hiding.
    disableFullPageScreenshot: true,
  };
}

/** THE LIFTABLE CORE: audit `page` (a Playwright page whose browser exposes `port`) and return the
 *  receipt. No `Args`, no snap session — a substrate that owns its own page calls exactly this. */
export async function auditSettledPage(page: Page, ask: LighthouseAsk): Promise<LighthouseReceipt> {
  await awaitEndpoint(ask.port);
  const cdp = await page.context().newCDPSession(page);
  const targetId = (await cdp.send("Target.getTargetInfo")).targetInfo.targetId;
  await cdp.detach();
  const { page: puppeteerPage, disconnect } = await attachToTarget(ask.port, targetId);
  try {
    const { snapshot, navigation, generateReport } = await import("lighthouse");
    const flags = lighthouseFlags(ask.device);
    const result = ask.mode === "navigation" ? await navigation(puppeteerPage, page.url(), { flags }) : await snapshot(puppeteerPage, { flags });
    if (result === undefined) {
      throw new Error("Lighthouse returned no result for this page (tooling/src/snap/ops/lighthouse.ts)");
    }
    const { lhr } = result;
    const html = generateReport(lhr, "html");
    const truncation = reportTruncation(lhr, html);
    if (truncation !== null) {
      throw new Error(truncation);
    }
    await writeFile(ask.jsonPath, `${JSON.stringify(lhr, null, 2)}\n`);
    await writeFile(ask.htmlPath, html);
    return {
      device: ask.device,
      mode: ask.mode,
      url: lhr.finalDisplayedUrl,
      lighthouseVersion: lhr.lighthouseVersion,
      categories: categoryScores(lhr),
      auditedCount: auditedCount(lhr),
      failed: failedAudits(lhr),
      jsonPath: ask.jsonPath,
      htmlPath: ask.htmlPath,
    };
  } finally {
    await disconnect();
  }
}

/** The snap-shaped wrapper: read the ask off `Args`, file the two artifacts in THIS run's slot, print the
 *  accounting block, and hand back a measured receipt or a refusal the run turns into `EXIT.toolError`. */
export async function runLighthouseArm(session: ProbeSession, opts: Args, name: string, port: number | null): Promise<LighthouseOutcome> {
  const device = opts.lighthouse;
  if (device === null) {
    throw new Error("INSTRUMENT ERROR: the Lighthouse arm ran without --lighthouse (tooling/src/snap/ops/run.ts)");
  }
  const page = session.pages[0];
  if (page === undefined) {
    return gap("the audited page", "this snap session opened no page, so there was nothing to audit (tooling/src/snap/ops/session.ts).");
  }
  if (port === null) {
    return gap(
      "the Chrome debugging endpoint",
      "the browser was launched without `--remote-debugging-port`, so Lighthouse could not attach to the page this run drove (tooling/src/snap/ops/session.ts).",
    );
  }
  const refusal = await readinessRefusal(page);
  if (refusal !== null) {
    return refusal;
  }
  // A Lighthouse throw is never a finding about the app: it is converted into the REFUSED outcome the
  // caller prints as an INSTRUMENT ERROR and exits 2 on. (No gate-ignore: the catch RETURNS a value
  // carrying the caught binding, so caught-failure-ownership classifies it as owned and files nothing.)
  try {
    const receipt = await auditSettledPage(page, {
      device,
      mode: opts.lighthouseMode,
      port,
      jsonPath: await artifactFile("lighthouse", name, ".json"),
      htmlPath: await artifactFile("lighthouse", name, ".html"),
    });
    for (const line of lighthouseLines(receipt)) {
      print(line);
    }
    return { kind: "measured", receipt };
  } catch (error) {
    return gap("the Lighthouse report", `the audit did not complete: ${errorMessage(error)}`);
  }
}
