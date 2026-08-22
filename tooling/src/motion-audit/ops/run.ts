// The audit orchestration: launch (full motion — the OS media query AND, via --full-motion, the app
// setting) -> goto/ready/settle -> reach -> flagger settle -> measured window -> report.
import { buildUrl, launchProbeSession, settle } from "@orb/tooling/_shared/browser";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { Args, AuditData } from "../contract/types.ts";
import { CPU_THROTTLE_RATE, MOUNT_SETTLE_MS, NAV_TIMEOUT_MS, READY_TIMEOUT_MS } from "../lib/budgets.ts";
import { orbBridgeGap, reportInstrumentError } from "../lib/evidence.ts";
import { driveReach, hasOrbBridge, prepareMeasuredClick } from "./drive.ts";
import { report } from "./report.ts";
import { runAudit } from "./trace.ts";

export async function runMotionAudit(opts: Args): Promise<number> {
  const url = opts.url ?? buildUrl(opts.base, opts.route);

  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    colorScheme: null,
    reducedMotion: false, // the OS media query — a motion probe wants the REAL animations
    appearance: opts.appearance, // …and the APP setting, which the media query does not reach (--full-motion)
    theme: opts.theme,
    localStorage: [],
  });
  const { page } = session;
  const cdp = await session.context.newCDPSession(page);

  if (opts.throttle) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
  }

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })
    .catch(() => undefined);
  await settle(page, MOUNT_SETTLE_MS);

  // The INPUT CONTRACT, checked before a single number is produced: `__orb` is app-only, and without it
  // every budget arm below reads its absent evidence as a clean zero. Absent apparatus ⇒ no verdict.
  if (!(await hasOrbBridge(page))) {
    await session.context.close();
    await session.browser.close();
    reportInstrumentError(url, orbBridgeGap(url));
    return EXIT.toolError;
  }

  // Reach the surface FIRST (and reset the evidence it produced), then trace the measured window.
  const reachFailures = await driveReach(page, opts.reach);
  // The dead-class flagger's one full census is dev-instrument work. requestIdleCallback can postpone it
  // until the first later mutation, so explicitly settle it outside the product interaction window.
  await page.evaluate("globalThis.__orb?.motionFlaggersSettled()").catch(() => undefined);
  const measuredClick = await prepareMeasuredClick(page, opts.selector);
  if (opts.selector !== null) {
    // Preparation forced all Playwright geometry before this checkpoint. The next browser work is the
    // native click itself; no measurement-owned actionability/layout can enter the product window.
    // Raw string (DOM-less tsconfig): two rAFs so the reset lands after Playwright's geometry reads.
    await page
      .evaluate(
        `new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              globalThis.__orb?.resetEvidence();
              resolve();
            });
          });
        })`,
      )
      .catch(() => undefined);
  }

  const data = await runAudit(page, cdp, opts, measuredClick);
  const withErrors: AuditData = { ...data, pageErrors: [...session.pageErrors], reachFailures };
  await session.context.close();
  await session.browser.close();

  return report(url, opts, withErrors);
}
