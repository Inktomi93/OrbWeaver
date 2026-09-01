// The audit orchestration: launch with the requested OS media-query arm and independent app Appearance
// arm -> goto/ready/settle -> reach -> flagger settle -> measured window -> report.
import type { ProbeSession } from "@orb/tooling/_shared/browser";
import { buildUrl, launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import { readBrowserEnvironment } from "@orb/tooling/_shared/browser-environment";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { readRuntimeAppearanceContract } from "../../_shared/appearance-matrix.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ApplicationMotionEvidence, Args, AuditData } from "../contract/types.ts";
import { CPU_THROTTLE_RATE, MOUNT_SETTLE_MS, NAV_TIMEOUT_MS, READY_TIMEOUT_MS } from "../lib/budgets.ts";
import { apparatusGap, reportInstrumentError } from "../lib/evidence.ts";
import { driveReach, hasOrbBridge, prepareMeasuredClick } from "./drive.ts";
import { report } from "./report.ts";
import { runAudit } from "./trace.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit");

/** The two raw-string page programs. Raw because this tsconfig is DOM-less; named because a barrier reads
 *  better than an inline program. */
const SETTLE_FLAGGERS = `(() => {
  if (typeof globalThis.__orb?.motionFlaggersSettled !== "function") throw new Error("__orb.motionFlaggersSettled is unavailable");
  return globalThis.__orb.motionFlaggersSettled();
})()`;

/** Two rAFs so the reset lands AFTER Playwright's geometry reads, never inside the measured window. */
const RESET_AFTER_GEOMETRY = `new Promise((resolve, reject) => {
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
})`;

/** The outcome of one ordered evidence barrier — a value, or the terminal instrument-error exit. */
type Barrier<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

export interface MotionAuditRunResult {
  readonly code: number;
  readonly data: AuditData | null;
}

/** Run one pre-measurement barrier, converting ANY throw into a TERMINAL instrument error.
 *
 *  The swallow is owned, not hidden: every caller returns `EXIT.toolError` on `ok: false`, so a failed
 *  barrier ends the run instead of continuing into measurement. That is the whole point — a barrier that
 *  failed leaves stale evidence behind, and measuring against stale evidence FABRICATES a verdict rather
 *  than producing none. Ends if any caller stops terminating on a failed barrier. */
async function barrier<T>(url: string, evidence: string, detail: (message: string) => string, step: () => Promise<T>): Promise<Barrier<T>> {
  try {
    return { ok: true, value: await step() };
  } catch (error) {
    reportInstrumentError(url, { evidence, detail: detail(error instanceof Error ? error.message : String(error)) });
    return { ok: false };
  }
}

async function readApplicationMotion(
  page: Parameters<typeof readRuntimeAppearanceContract>[0],
  opts: Args,
  applied: boolean | null,
): Promise<ApplicationMotionEvidence | null> {
  // Older `--isolated --ref` bundles legitimately predate the carrier bridge. The ordinary audit does not
  // consume this field; the matrix exception explicitly rejects null, so absence cannot become STATIC-EXPECTED.
  // @orb-gate-ignore caught-failure-ownership(default:catch): null is preserved in AuditData and the only consumer, matrix STATIC-EXPECTED, rejects it as instrument error; ordinary legacy-ref runs never claim this field. Ends if null becomes an accepted matrix identity.
  try {
    const contract = await readRuntimeAppearanceContract(page);
    const row = contract.rows.find((candidate) => candidate.key === "reducedMotion");
    const requested = opts.appearance !== null && Object.hasOwn(opts.appearance, "reducedMotion") ? opts.appearance["reducedMotion"] : null;
    return {
      requested: typeof requested === "boolean" ? requested : null,
      applied,
      reached: row?.reached ?? 0,
      samples: row?.samples ?? [],
    };
  } catch {
    return null;
  }
}

async function applyCpuThrottle(cdp: Awaited<ReturnType<ProbeSession["context"]["newCDPSession"]>>, enabled: boolean): Promise<void> {
  if (enabled) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
  }
}

export async function runMotionAuditDetailed(opts: Args): Promise<MotionAuditRunResult> {
  const url = opts.url ?? buildUrl(opts.base, opts.route);

  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    device: opts.device,
    colorScheme: null,
    reducedMotion: opts.osReducedMotion,
    appearance: opts.appearance, // …and the APP setting, which the media query does not reach (--full-motion)
    theme: opts.theme,
    localStorage: [],
  });
  return await withProbeSession(session, async () => {
    const { page } = session;
    const cdp = await session.context.newCDPSession(page);

    await applyCpuThrottle(cdp, opts.throttle);

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
      return { code: EXIT.toolError, data: null };
    }

    const environment = await barrier(
      url,
      "the requested browser environment",
      (m) => `runtime environment observation failed — the requested device/viewport/pointer arm cannot be proven, so this run refuses: ${m}`,
      () => readBrowserEnvironment(page, session.environmentContract),
    );
    if (!environment.ok) {
      return { code: EXIT.toolError, data: null };
    }

    // Reach the surface FIRST (and reset the evidence it produced), then trace the measured window.
    const reach = await barrier(
      url,
      "the post-reach evidence reset",
      (m) => `resetEvidence failed after reaching the surface — stale reach evidence could fabricate the verdict, so this run refuses: ${m}`,
      () => driveReach(page, opts.reach),
    );
    if (!reach.ok) {
      return { code: EXIT.toolError, data: null };
    }
    // The dead-class flagger's one full census is dev-instrument work. requestIdleCallback can postpone it
    // until the first later mutation, so explicitly settle it outside the product interaction window.
    const settled = await barrier(
      url,
      "the motion flagger settle barrier",
      (m) => `motionFlaggersSettled failed before measurement — the dead-class census is incomplete, so this run refuses: ${m}`,
      () => page.evaluate(SETTLE_FLAGGERS),
    );
    if (!settled.ok) {
      return { code: EXIT.toolError, data: null };
    }
    const measuredClick = await prepareMeasuredClick(page, opts.selector);
    if (opts.selector !== null) {
      // Preparation forced all Playwright geometry before this checkpoint. The next browser work is the
      // native click itself; no measurement-owned actionability/layout can enter the product window.
      const reset = await barrier(
        url,
        "the pre-measurement evidence reset",
        (m) => `resetEvidence failed before the measured click — stale reach evidence could fabricate the verdict, so this run refuses: ${m}`,
        () => page.evaluate(RESET_AFTER_GEOMETRY),
      );
      if (!reset.ok) {
        return { code: EXIT.toolError, data: null };
      }
    }

    const data = await runAudit(page, cdp, opts, measuredClick);
    const applicationMotion = await readApplicationMotion(page, opts, session.contexts[0]?.settingsEvidence.appearanceApplied ?? null);
    const withErrors: AuditData = {
      ...data,
      environment: environment.value,
      applicationMotion,
      pageErrors: [...session.pageErrors],
      reachFailures: reach.value,
    };
    return { code: report(url, opts, withErrors), data: withErrors };
  });
}

export async function runMotionAudit(opts: Args): Promise<number> {
  return (await runMotionAuditDetailed(opts)).code;
}
