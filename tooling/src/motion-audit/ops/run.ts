// The audit orchestration: launch with the requested OS media-query arm and independent app Appearance
// arm -> goto/ready/settle -> reach -> flagger settle -> measured window -> report.
import { writeFile } from "node:fs/promises";
import { artifactFile } from "@orb/tooling/_shared/artifact-out";
import { routeSlug } from "@orb/tooling/_shared/artifacts";
import { attachProbeSession, buildUrl, launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import type { ProbeSession } from "@orb/tooling/_shared/browser-contract";
import { readBrowserEnvironment } from "@orb/tooling/_shared/browser-environment";
import type { ExitCode } from "@orb/tooling/_shared/exit-contract";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { withholdRate } from "@orb/tooling/_shared/load-budget";
import type { Page } from "@playwright/test";
import { readRuntimeAppearanceContract } from "../../_shared/appearance-matrix.ts";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SessionAttachTarget } from "../../snap/index.ts";
import { resolveSessionAttach, stageBandRefusalFor } from "../../snap/index.ts";
import type { ApplicationMotionEvidence, Args, AuditData } from "../contract/types.ts";
import { CPU_THROTTLE_RATE, MOUNT_SETTLE_MS, NAV_TIMEOUT_MS, READY_TIMEOUT_MS } from "../lib/budgets.ts";
import { apparatusGap, loadWithholdGap, reportInstrumentError } from "../lib/evidence.ts";
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

/** The pre-measurement evidence reset, hoisted out of the drive so the drive stays inside one reader's
 *  head. Preparation forced all Playwright geometry before this checkpoint; the next browser work is the
 *  native click itself, so no measurement-owned actionability/layout can enter the product window. FALSE =
 *  the barrier failed and the caller must refuse — measuring against stale reach evidence FABRICATES a
 *  verdict rather than producing none. A run with no `--selector` has nothing to reset and passes. */
async function resetBeforeMeasuredClick(page: Page, url: string, selector: string | null): Promise<boolean> {
  if (selector === null) {
    return true;
  }
  const reset = await barrier(
    url,
    "the pre-measurement evidence reset",
    (m) => `resetEvidence failed before the measured click — stale reach evidence could fabricate the verdict, so this run refuses: ${m}`,
    () => page.evaluate(RESET_AFTER_GEOMETRY),
  );
  return reset.ok;
}

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

interface UrlResolution {
  readonly url: string;
  /** Non-null only on a live `--session` attach — carried through so `openSession` never re-resolves it
   *  (the registry read is idempotent, but one resolution per call is the honest count). */
  readonly attach: SessionAttachTarget | null;
}

/** #1186: a `--base`/`--url` at the isolated-stage band is a claim about WHOSE tree answered. A refused
 *  `snap --isolated` leaves the band with its previous owner, so an instrument chained behind one measures
 *  a sibling checkout's pixels and prints numbers that look completely normal. Refuse (exit 2 — nothing was
 *  measured) before the browser launches; the door is snap's, one home (tooling/src/snap/ops/stage-marker.ts).
 *
 *  #1285/#1289: `--session <name>` resolves the target from a live snap session's binding (design §3.4)
 *  instead of `DEFAULT_BASE`; a dead/foreign/absent session is an EXIT.toolError refusal BEFORE any
 *  browser work (never a fallback launch). #1289 fork (see ui-audit/ops/run.ts's fuller note):
 *  `opts.baseExplicit` distinguishes a named `--base` (composes, #1285) from the unset default, which
 *  falls back to the session's own bound URL (design §3.6) instead of `DEFAULT_BASE`. */
function resolveUrl(opts: Args): UrlResolution | ExitCode {
  if (opts.session === null) {
    return { url: opts.url ?? buildUrl(opts.base, opts.route), attach: null };
  }
  const attach = resolveSessionAttach(opts.session);
  if (!attach.ok) {
    print(attach.message);
    return EXIT.toolError;
  }
  const base = opts.baseExplicit ? opts.base : attach.row.binding.url;
  return { url: opts.url ?? buildUrl(base, opts.route), attach };
}

async function openSession(opts: Args, attach: SessionAttachTarget | null): Promise<ProbeSession> {
  if (attach === null) {
    return await launchProbeSession({
      headless: !opts.vnc,
      viewport: opts.viewport,
      device: opts.device,
      colorScheme: opts.colorScheme,
      reducedMotion: opts.osReducedMotion,
      appearance: opts.appearance, // …and the APP setting, which the media query does not reach (--full-motion)
      theme: opts.theme,
      localStorage: [],
    });
  }
  return await attachProbeSession(attach.endpoint, attach.environment);
}

interface PreparedMotionRun {
  readonly page: Page;
  readonly cdp: Awaited<ReturnType<ProbeSession["context"]["newCDPSession"]>>;
  readonly environment: Awaited<ReturnType<typeof readBrowserEnvironment>>;
  readonly reachFailures: number;
  readonly measuredClick: Awaited<ReturnType<typeof prepareMeasuredClick>>;
}

/** Establish every apparatus barrier before the measured window. Keeping this preparation separate makes
 *  it impossible for reporting/artifact branches to obscure which failed barrier withheld the verdict. */
async function prepareMotionRun(opts: Args, url: string, session: ProbeSession): Promise<PreparedMotionRun | null> {
  const { page } = session;
  const cdp = await session.context.newCDPSession(page);
  await applyCpuThrottle(cdp, opts.throttle);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  // @orb-gate-ignore caught-failure-ownership(promise:waitFor): false feeds apparatusGap, which emits INSTRUMENT ERROR instead of a motion verdict. Ends if readiness stops gating measurement.
  const ready = await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  await settle(page, MOUNT_SETTLE_MS);
  const gap = apparatusGap({ url, ready, bridge: await hasOrbBridge(page), readyTimeoutMs: READY_TIMEOUT_MS });
  if (gap !== null) {
    reportInstrumentError(url, gap);
    return null;
  }
  const environment = await barrier(
    url,
    "the requested browser environment",
    (message) => `runtime environment observation failed — the requested device/viewport/pointer arm cannot be proven, so this run refuses: ${message}`,
    () => readBrowserEnvironment(page, session.environmentContract),
  );
  if (!environment.ok) {
    return null;
  }
  const reach = await barrier(
    url,
    "the post-reach evidence reset",
    (message) => `resetEvidence failed after reaching the surface — stale reach evidence could fabricate the verdict, so this run refuses: ${message}`,
    () => driveReach(page, opts.reach),
  );
  if (!reach.ok) {
    return null;
  }
  const settled = await barrier(
    url,
    "the motion flagger settle barrier",
    (message) => `motionFlaggersSettled failed before measurement — the dead-class census is incomplete, so this run refuses: ${message}`,
    () => page.evaluate(SETTLE_FLAGGERS),
  );
  if (!settled.ok) {
    return null;
  }
  const measuredClick = await prepareMeasuredClick(page, opts.selector);
  if (!(await resetBeforeMeasuredClick(page, url, opts.selector))) {
    return null;
  }
  return { page, cdp, environment: environment.value, reachFailures: reach.value, measuredClick };
}

async function measureMotionRun(opts: Args, url: string, session: ProbeSession): Promise<MotionAuditRunResult> {
  const prepared = await prepareMotionRun(opts, url, session);
  if (prepared === null) {
    return { code: EXIT.toolError, data: null };
  }
  const data = await runAudit(prepared.page, prepared.cdp, opts, prepared.measuredClick);
  const load = withholdRate("motion-audit's dropped-frame rate");
  if (load.withheld) {
    reportInstrumentError(url, loadWithholdGap(load.reason));
    return { code: EXIT.toolError, data: null };
  }
  const applicationMotion = await readApplicationMotion(prepared.page, opts, session.contexts[0]?.settingsEvidence.appearanceApplied ?? null);
  const withErrors: AuditData = {
    ...data,
    environment: prepared.environment,
    applicationMotion,
    pageErrors: [...session.pageErrors],
    reachFailures: prepared.reachFailures,
  };
  if (opts.out !== null || opts.json) {
    const jsonPath = await artifactFile("motion-audit", opts.out ?? routeSlug(opts.route), ".json");
    await writeFile(jsonPath, JSON.stringify({ args: opts, url, data: withErrors }, null, 2));
    print(`json        ${jsonPath}`);
  }
  return { code: report(url, opts, withErrors), data: withErrors };
}

export async function runMotionAuditDetailed(opts: Args): Promise<MotionAuditRunResult> {
  const resolved = resolveUrl(opts);
  if (typeof resolved === "number") {
    return { code: resolved, data: null };
  }
  const { url, attach } = resolved;
  const bandRefusal = stageBandRefusalFor(url);
  if (bandRefusal !== null) {
    print(bandRefusal);
    return { code: EXIT.toolError, data: null };
  }

  const session = await openSession(opts, attach);
  return await withProbeSession(session, async () => await measureMotionRun(opts, url, session));
}

export async function runMotionAudit(opts: Args): Promise<number> {
  return (await runMotionAuditDetailed(opts)).code;
}
