// The audit orchestration: launch (full motion — the OS media query AND, via --full-motion, the app
// setting) -> goto/ready/settle -> reach -> flagger settle -> measured window -> report.
import { buildUrl, launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, AuditData } from "../contract/types.ts";
import { CPU_THROTTLE_RATE, MOUNT_SETTLE_MS, NAV_TIMEOUT_MS, READY_TIMEOUT_MS } from "../lib/budgets.ts";
import { apparatusGap, reportInstrumentError } from "../lib/evidence.ts";
import { driveReach, hasOrbBridge, prepareMeasuredClick } from "./drive.ts";
import { report } from "./report.ts";
import { runAudit } from "./trace.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit");

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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one callback owns the ordered evidence barriers and their terminal instrument-error exits.
  return await withProbeSession(session, async () => {
    const { page } = session;
    const cdp = await session.context.newCDPSession(page);

    if (opts.throttle) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
    }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    // The readiness outcome is KEPT, not swallowed (#515). Discarding it here is what let a cold-vite boot
    // timeout be reported as "the __orb dev bridge is ABSENT" on a page that has the whole bridge.
    // @orb-gate-ignore caught-failure-ownership(promise:waitFor): false feeds apparatusGap, which emits INSTRUMENT ERROR instead of a motion verdict. Ends if readiness stops gating measurement.
    const ready = await page
      .locator("html[data-app-ready]")
      .waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    await settle(page, MOUNT_SETTLE_MS);

    // The INPUT CONTRACT, checked before a single number is produced: `__orb` is app-only, and without it
    // every budget arm below reads its absent evidence as a clean zero. Absent apparatus ⇒ no verdict —
    // and WHICH apparatus was absent decides whether the operator retries or opens the client.
    const gap = apparatusGap({ url, ready, bridge: await hasOrbBridge(page), readyTimeoutMs: READY_TIMEOUT_MS });
    if (gap !== null) {
      reportInstrumentError(url, gap);
      return EXIT.toolError;
    }

    // Reach the surface FIRST (and reset the evidence it produced), then trace the measured window.
    let reachFailures: number;
    // @orb-gate-ignore caught-failure-ownership(empty:error): resetEvidence failure is reported as INSTRUMENT ERROR and returns tool-error before measurement. Ends if this catch can continue into measurement.
    try {
      reachFailures = await driveReach(page, opts.reach);
    } catch (error) {
      reportInstrumentError(url, {
        evidence: "the post-reach evidence reset",
        detail: `resetEvidence failed after reaching the surface — stale reach evidence could fabricate the verdict, so this run refuses: ${error instanceof Error ? error.message : String(error)}`,
      });
      return EXIT.toolError;
    }
    // The dead-class flagger's one full census is dev-instrument work. requestIdleCallback can postpone it
    // until the first later mutation, so explicitly settle it outside the product interaction window.
    // @orb-gate-ignore caught-failure-ownership(empty:error): settle failure is reported as INSTRUMENT ERROR and returns tool-error before measurement. Ends if this catch can continue into measurement.
    try {
      await page.evaluate(
        `(() => {
          if (typeof globalThis.__orb?.motionFlaggersSettled !== "function") throw new Error("__orb.motionFlaggersSettled is unavailable");
          return globalThis.__orb.motionFlaggersSettled();
        })()`,
      );
    } catch (error) {
      reportInstrumentError(url, {
        evidence: "the motion flagger settle barrier",
        detail: `motionFlaggersSettled failed before measurement — the dead-class census is incomplete, so this run refuses: ${error instanceof Error ? error.message : String(error)}`,
      });
      return EXIT.toolError;
    }
    const measuredClick = await prepareMeasuredClick(page, opts.selector);
    if (opts.selector !== null) {
      // Preparation forced all Playwright geometry before this checkpoint. The next browser work is the
      // native click itself; no measurement-owned actionability/layout can enter the product window.
      // Raw string (DOM-less tsconfig): two rAFs so the reset lands after Playwright's geometry reads.
      // @orb-gate-ignore caught-failure-ownership(empty:error): resetEvidence failure is converted to INSTRUMENT ERROR and tool-error exit before measurement. Ends if reportInstrumentError stops terminating this run.
      try {
        await page.evaluate(
          `new Promise((resolve, reject) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try {
                if (typeof globalThis.__orb?.resetEvidence !== "function") {
                  reject(new Error("__orb.resetEvidence is unavailable"));
                  return;
                }
                globalThis.__orb.resetEvidence();
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        })`,
        );
      } catch (error) {
        reportInstrumentError(url, {
          evidence: "the pre-measurement evidence reset",
          detail: `resetEvidence failed before the measured click — stale reach evidence could fabricate the verdict, so this run refuses: ${error instanceof Error ? error.message : String(error)}`,
        });
        return EXIT.toolError;
      }
    }

    const data = await runAudit(page, cdp, opts, measuredClick);
    const withErrors: AuditData = { ...data, pageErrors: [...session.pageErrors], reachFailures };
    return report(url, opts, withErrors);
  });
}
