// `--lighthouse` — the audit ENGINE the retired chrome-devtools MCP wrapped, run against THIS run's
// already-driven page (the census that justifies
// the dependency: 41 `lighthouse_audit` calls in 14 days, and the only MCP
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
import { artifactFile, registerInstrumentArtifact } from "../../../_shared/artifact-out.ts";
import { exactScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import type { ProbeSession } from "../../../_shared/browser-contract.ts";
import { MOBILE_DEVICE } from "../../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { EvidenceGap } from "../../../_shared/evidence.ts";
import { printEvidenceGaps } from "../../../_shared/evidence.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmRunInstance } from "../../contract/arms.ts";
import type { LighthouseDevice, LighthouseMode, LighthouseOutcome, LighthouseReceipt } from "../../contract/lighthouse.ts";
import { LIGHTHOUSE_CATEGORIES } from "../../contract/lighthouse.ts";
import type { Args } from "../../contract/types.ts";
import {
  auditedCount,
  categoryScores,
  failedAudits,
  LIGHTHOUSE_DEVICE_SPELLINGS,
  LIGHTHOUSE_MODE_SPELLINGS,
  lighthouseLines,
  parseLighthouseDevice,
  parseLighthouseMode,
  reportTruncation,
} from "../../lib/lighthouse-report.ts";

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
    // @orb-waive caught-failure-ownership(catch): the bounded retry loop OWNS this failure — a connection refused before Chrome binds its listener is the normal first tick, and exhaustion throws the named error below. Ends if exhaustion stops throwing.
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
    `the Chrome debugging endpoint on 127.0.0.1:${port} never answered within ${ENDPOINT_ATTEMPTS * ENDPOINT_RETRY_MS}ms — the browser published that port in its profile's DevToolsActivePort but nothing is listening on it (tooling/src/_shared/debugging-endpoint.ts)`,
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
async function runLighthouseArm(session: ProbeSession, opts: Args, name: string, port: number | null): Promise<LighthouseOutcome> {
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
      "this run's browser published no debugging endpoint, so Lighthouse could not attach to the page the run drove. The launch provides one when an enabled arm declares `needs.debuggingPort` (tooling/src/snap/contract/arms.ts → tooling/src/snap/ops/session.ts).",
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
    const metadata = {
      producer: "lighthouse",
      producerArm: "lighthouse",
      role: "primary" as const,
      completeness: "complete" as const,
      completenessDetail: "complete Lighthouse report after category, runtime, and truncation validation",
      scope: exactScope(0, 0, opts.lighthouseMode),
      records: receipt.auditedCount,
      limits: [],
    };
    await registerInstrumentArtifact("lighthouse", receipt.jsonPath, {
      ...metadata,
      channel: "lighthouse-json",
      mediaType: "application/json",
      schema: `lighthouse-${receipt.lighthouseVersion}`,
    });
    await registerInstrumentArtifact("lighthouse", receipt.htmlPath, {
      ...metadata,
      channel: "lighthouse-html",
      mediaType: "text/html",
      schema: `lighthouse-${receipt.lighthouseVersion}-html`,
    });
    for (const line of lighthouseLines(receipt)) {
      print(line);
    }
    return { kind: "measured", receipt };
  } catch (error) {
    return gap("the Lighthouse report", `the audit did not complete: ${errorMessage(error)}`);
  }
}

/** `lighthouse=` states WHICH run you got — off, the device/mode pair, or REFUSED. Never a bare score: a
 *  reader must not have to guess whether an absent number means "clean" or "never ran". */
function lighthousePairs(outcome: LighthouseOutcome | null): ResultPair[] {
  if (outcome === null) {
    return [["lighthouse", "off"]];
  }
  if (outcome.kind === "refused") {
    return [["lighthouse", "REFUSED"]];
  }
  const { receipt } = outcome;
  return [
    ["lighthouse", `${receipt.device}/${receipt.mode}`],
    ["lighthouse-failed-audits", receipt.failed.length],
    ...receipt.categories.map(({ id, score }): ResultPair => [`lighthouse-${id}`, score ?? "n/a"]),
  ];
}

/** THE AUDIT ARM (#1198), and the reason `ArmNeeds.debuggingPort` exists. It is the ONE arm that needs the
 *  launch to have done something for it — a Chrome `--remote-debugging-port` endpoint on THIS run's
 *  browser — and it takes that endpoint from its run context rather than reaching back into the launcher,
 *  which is what lets `ops/session.ts` read the registry to decide whether to provide one.
 *
 *  #1259 closed here: the endpoint is now the SAME one a stateful session publishes (a persistent profile
 *  launched with `--remote-debugging-port=0`, read back out of `DevToolsActivePort`), so
 *  `--session x --lighthouse desktop` audits the session's own live page instead of being refused. */
export const LIGHTHOUSE_ARM = {
  flags: [
    {
      flag: "--lighthouse",
      kind: "required-value",
      pageTargetable: false,
      group: "Measure",
      summary: "Lighthouse (accessibility + best-practices + seo) on this run's settled page; not with --cascade",
      // `--lighthouse mobile` COMPOSES over --mobile rather than re-emulating: it fills the same device
      // slot the flag does (the --panels precedent), so touch/coarse-pointer/DPR3 are real for the audit
      // AND the pixels. A bad value keeps the arm off here and is REFUSED in ops/parse.ts, so a run never
      // audits a device it was not asked for.
      handler: (a, rest): void => {
        const device = parseLighthouseDevice(rest.shift() ?? "");
        a.lighthouse = device ?? a.lighthouse;
        if (device === "mobile") {
          a.device = MOBILE_DEVICE;
        }
      },
    },
    {
      flag: "--lighthouse-mode",
      kind: "required-value",
      pageTargetable: false,
      group: "Measure",
      summary: "default snapshot audits the page as your tape left it; navigation reloads first and loses the drive",
      handler: (a, rest): void => {
        a.lighthouseMode = parseLighthouseMode(rest.shift() ?? "") ?? a.lighthouseMode;
      },
    },
  ],
  level: "call",
  needs: (opts): ArmNeeds => (opts.lighthouse === null ? {} : { debuggingPort: true }),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "lighthouse" | "lighthouseMode"> => ({ lighthouse: null, lighthouseMode: "snapshot" }),
  help: `  --lighthouse <${LIGHTHOUSE_DEVICE_SPELLINGS.join("|")}>
                          run Lighthouse (accessibility + best-practices + seo) against the SETTLED page
                          of this very run — same browser, same tab, same device. Prints the category
                          scores and EVERY failed audit with its node count and first three selectors,
                          and writes report.json + report.html into the run slot. Findings RED the run
                          (exit 1), like --contrast and --deadcss. A page that never signalled
                          data-app-ready, a Lighthouse throw, or a truncated report REFUSE with exit 2 —
                          a refusal is never a finding. \`--lighthouse mobile\` fills the SAME device slot
                          --mobile does (touch, coarse pointer, DPR 3), so it does not combine with a
                          later --desktop/--viewport/--wide, and --lighthouse desktop does not combine
                          with --mobile. Not combinable with --cascade (both drive the debugging endpoint).
  --lighthouse-mode <${LIGHTHOUSE_MODE_SPELLINGS.join("|")}>
                          DEFAULT snapshot: audit the page as the drive queue left it, because every
                          surface under review here is client state. navigation RELOADS the URL first, so
                          it measures a freshly-booted page and loses whatever you drove to.`,
  result: {
    schema: "snap-arm-lighthouse-v1",
    source: "Lighthouse + CDP",
    lifetime: "settled snapshot or Lighthouse-owned navigation",
    enabled: (opts): boolean => opts.lighthouse !== null,
    failureFields: ["lighthouse"],
  },
  lifecycle: {
    at: "run",
    begin: (_session, opts): ArmRunInstance<"lighthouse"> => {
      let outcome: LighthouseOutcome | null = null;
      const refusal = (): EvidenceGap | null => (outcome !== null && outcome.kind === "refused" ? outcome.gap : null);
      return {
        prepare: (): Promise<void> => Promise.resolve(),
        afterNavigation: (): Promise<void> => Promise.resolve(),
        beforeAction: (): Promise<null> => Promise.resolve(null),
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: (): Promise<void> => Promise.resolve(),
        // The audit runs on the SETTLED page, after the drive queue and every settled-surface capture —
        // that page IS the subject. A refusal prints its evidence gap HERE, where the reader meets it in
        // run order, not at the RESULT line.
        measure: async (ctx): Promise<void> => {
          if (ctx.opts.lighthouse === null) {
            return;
          }
          outcome = await runLighthouseArm(ctx.session, ctx.opts, ctx.name, ctx.provisions.debuggingPort);
          const refused = refusal();
          if (refused !== null) {
            printEvidenceGaps([refused]);
          }
        },
        report: (): Promise<void> => Promise.resolve(),
        // A failed audit is a verdict member for the same reason dead CSS and contrast are: the arm is
        // opt-in, so a green exit over the a11y failures the caller asked Lighthouse to find would be a
        // false ship receipt. A REFUSED audit counts here as ZERO and exits 2 through `exit` instead.
        failures: (): ArmFailureCounts => ({ lighthouse: outcome !== null && outcome.kind === "measured" ? outcome.receipt.failed.length : 0 }),
        // A report that judged nothing is an instrument failure — the audit read an empty page — never a
        // clean sheet.
        denominators: () =>
          outcome !== null && outcome.kind === "measured" ? { "lighthouse-audits": { value: outcome.receipt.auditedCount, refuseWhen: "zero" as const } } : {},
        pairs: (): readonly ResultPair[] => lighthousePairs(outcome),
        facts: (): readonly ArmFactEmission<"lighthouse">[] => {
          let state: "off" | "refused" | "failed" | "passed" = "off";
          if (opts.lighthouse !== null) {
            if (outcome === null || outcome.kind === "refused") {
              state = "refused";
            } else {
              state = outcome.receipt.failed.length > 0 ? "failed" : "passed";
            }
          }
          return [
            {
              scope: exactScope(0, 0, opts.lighthouseMode),
              data: {
                state,
                detail: outcome?.kind === "refused" ? outcome.gap.detail : null,
                audits: outcome?.kind === "measured" ? outcome.receipt.auditedCount : 0,
                failedAudits: outcome?.kind === "measured" ? outcome.receipt.failed.length : 0,
                artifactCount: outcome?.kind === "measured" ? 2 : 0,
              },
            },
          ];
        },
        exit: (code: number): number => (refusal() === null ? code : EXIT.toolError),
      };
    },
  },
} satisfies ArmDef<"lighthouse">;
