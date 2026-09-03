// Browser-session lifecycle: the localStorage seeds (probe-mode/debug-token), the one launch wrapper
// over _shared/browser, and teardown with failure-evidence traces/HARs (kept red, deleted green).
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactDir } from "../../_shared/artifact-out.ts";
import type { LocalStorageSeed, ProbeLaunchOptions, ProbeSession } from "../../_shared/browser.ts";
import { closeProbeSession, closeProbeSessionAfterError, launchProbeSession } from "../../_shared/browser.ts";
import type { BrowserEnvironmentEvidence } from "../../_shared/browser-environment.ts";
import { readBrowserEnvironment } from "../../_shared/browser-environment.ts";
import type { DebuggingProfile } from "../../_shared/debugging-endpoint.ts";
import { createDebuggingProfile, readDebuggingEndpoint, readDebuggingPort } from "../../_shared/debugging-endpoint.ts";
import type { DevToolsCascadeRuntime } from "../../_shared/devtools-runtime.ts";
import { prepareDevToolsCascadeRuntime } from "../../_shared/devtools-runtime.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { FailureArtifacts } from "../contract/run.ts";
import type { Args } from "../contract/types.ts";
import { NETWORK_PROFILES, NO_CPU_THROTTLE } from "../lib/throttle.ts";
import { armLaunchNeeds } from "./arms/registry.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// localStorage keys the harness seeds. App counterpart for probe-mode:
// packages/client/src/lib/probe-mode.ts; the debug-token reader lands with its route.
const PROBE_MODE_KEY = "orb:probe-mode";
const DEBUG_TOKEN_KEY = "orb:debug-token";
const DEVTOOLS_ASSET_ROOT = fileURLToPath(new URL("../lib/devtools-frontend", import.meta.url));
const CASCADE_RUNTIMES = new WeakMap<ProbeSession, DevToolsCascadeRuntime>();
// The profile dir whose `DevToolsActivePort` names a session's debugging endpoint — ONE mechanism for
// every consumer (#1259, phase 3). It used to be two: this map for the session/cascade path (Chrome picks
// the port, we read it back) plus a `LIGHTHOUSE_PORTS` map for the audit arm, which RESERVED a loopback
// port and passed `--remote-debugging-port=<n>` at launch. Two writers of one launch argument is
// last-wins-and-silent, so phase 1 could only refuse the pair (`--session` + `--lighthouse`, exit 3). The
// read-it-back mechanism is strictly more general — it needs no free-port race and it survives a browser
// somebody else launched — so the reserving path is GONE and the refusal with it.
const DEBUG_PROFILES = new WeakMap<ProbeSession, string>();
// Harness-side determinism for --probe: floor every animation/transition and hide the
// caret from FIRST PAINT (screenshot-time `animations:"disabled"` only rewinds at capture;
// this kills mid-run flicker during steps too). Raw string — see _shared/browser.ts header.
const PROBE_CSS_SCRIPT = `document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
  document.head.appendChild(style);
});`;

// ── Orchestration ───────────────────────────────────────────────────────────

// Pre-navigation localStorage seeds: the generic --ls pairs plus the two harness
// keys (all ride _kit's one init script — same timing, before any page script).
function buildSeeds(opts: Args): LocalStorageSeed[] {
  const seeds: LocalStorageSeed[] = [...opts.localStorage];
  if (opts.debugToken !== "") {
    seeds.push({ key: DEBUG_TOKEN_KEY, value: opts.debugToken });
  }
  if (opts.probe) {
    seeds.push({ key: PROBE_MODE_KEY, value: "1" });
  }
  return seeds;
}

async function finishFailureTraces(session: ProbeSession, failed: boolean, name: string): Promise<string[]> {
  const traces = await artifactDir("traces");
  const paths = await Promise.all(
    session.contexts.map(async ({ context }, index): Promise<string | null> => {
      const tracePath = join(traces, `${name}${session.contexts.length > 1 ? `-u${index}` : ""}.zip`);
      if (failed) {
        await context.tracing.stop({ path: tracePath });
        return tracePath;
      }
      await context.tracing.stop();
      return null;
    }),
  );
  return paths.filter((path): path is string => path !== null);
}

export async function finishSession(session: ProbeSession, failed: boolean, name: string, enabled: boolean): Promise<FailureArtifacts> {
  let traces: string[];
  try {
    traces = enabled ? await finishFailureTraces(session, failed, name) : [];
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
  await closeProbeSession(session);
  const recordedHars = session.contexts.flatMap(({ harPath }) => (harPath === null ? [] : [harPath]));
  if (failed) {
    return { traces, hars: recordedHars };
  }
  await Promise.all(recordedHars.map(async (path) => (existsSync(path) ? await unlink(path) : undefined)));
  return { traces, hars: [] };
}

type LaunchExtras = Partial<Pick<ProbeLaunchOptions, "pages" | "contexts" | "contextCookies" | "cookieDomain">> & {
  readonly requireCascadeRuntime?: boolean;
  /** A stateful session's browser publishes its debugging endpoint (docs/design/1208-instrument-substrate.md
   *  §3.4 — the sibling attach door). The cascade runtime's profile already does; a plain session gets the
   *  bare debugging profile, so no second launch shape exists. */
  readonly debuggingEndpoint?: boolean;
};

/** `--scale <n>` reaches the pixels by raising the CONTEXT's DPR (#915) — Playwright's
 *  `screenshot({ scale })` takes only "css" | "device". Absent unless a numeric scale was asked for, so
 *  every other run launches a byte-identical context. */
function scaleLaunchOverride(opts: Args): { readonly deviceScaleFactor?: number } {
  return opts.scale.deviceScaleFactor === null ? {} : { deviceScaleFactor: opts.scale.deviceScaleFactor };
}

/** The persistent-profile launch a run may need: the DevTools-SDK cascade runtime (its profile publishes
 *  the debugging endpoint AND serves the SDK) or the bare debugging profile (a session with no cascade).
 *  Never both — one profile, one endpoint. */
interface LaunchProfile {
  readonly cascade: DevToolsCascadeRuntime | null;
  readonly debugging: DebuggingProfile | null;
}

/** ONE persistent profile per launch, and WHO ASKS FOR IT IS DERIVED (#1259). `armLaunchNeeds(opts)` reads
 *  every enabled arm's declared `needs` (contract/arms.ts): `--cascade` needs the SDK runtime, and
 *  `--lighthouse` needs a debugging endpoint — which the cascade profile already publishes, so a run that
 *  wants both gets one browser with one endpoint instead of the two incompatible ones phase 1 had to
 *  refuse. `requireCascadeRuntime`/`debuggingEndpoint` stay as CALLER asks on top (the appearance-invariant
 *  pass needs the runtime with no `--cascade` query; a session publishes an endpoint with no arm at all). */
async function prepareLaunchProfile(opts: Args, requireCascadeRuntime: boolean, debuggingEndpoint: boolean): Promise<LaunchProfile> {
  const needs = armLaunchNeeds(opts);
  const cascade = needs.devtoolsSdk === true || requireCascadeRuntime ? await prepareDevToolsCascadeRuntime(DEVTOOLS_ASSET_ROOT) : null;
  const debugging = cascade === null && (debuggingEndpoint || needs.debuggingPort === true) ? await createDebuggingProfile() : null;
  return { cascade, debugging };
}

function profileOf(profile: LaunchProfile): DevToolsCascadeRuntime | DebuggingProfile | null {
  return profile.cascade ?? profile.debugging;
}

async function closeLaunchProfile(profile: LaunchProfile): Promise<void> {
  await profile.cascade?.close();
  await profile.debugging?.close();
}

function buildLaunchOptions(opts: Args, name: string, traceDir: string | null, profile: LaunchProfile): ProbeLaunchOptions {
  const persistent = profileOf(profile);
  return {
    headless: !opts.vnc,
    viewport: opts.viewport,
    colorScheme: opts.colorScheme,
    reducedMotion: opts.reducedMotion || opts.probe,
    contrast: opts.browserContrast ?? null,
    reducedTransparency: opts.reducedTransparency ?? false,
    appearance: opts.appearance,
    theme: opts.theme,
    localStorage: buildSeeds(opts),
    device: opts.device,
    ...scaleLaunchOverride(opts),
    trace: opts.failureEvidence,
    ...(traceDir === null ? {} : { harPathPrefix: join(traceDir, name) }),
    ...(persistent === null ? {} : { persistentProfileDir: persistent.profileDir, browserArgs: persistent.browserArgs }),
  };
}

export async function launchSnapSession(opts: Args, name: string, extras: LaunchExtras = {}): Promise<ProbeSession> {
  const { requireCascadeRuntime = false, debuggingEndpoint = false, ...launchExtras } = extras;
  const traceDir = opts.failureEvidence ? await artifactDir("traces") : null;
  const profile = await prepareLaunchProfile(opts, requireCascadeRuntime, debuggingEndpoint);
  let launched: ProbeSession;
  try {
    launched = await launchProbeSession({ ...buildLaunchOptions(opts, name, traceDir, profile), ...launchExtras });
  } catch (error) {
    await closeLaunchProfile(profile);
    throw error;
  }
  const cleanup = [...(profile.cascade === null ? [] : [profile.cascade.close]), ...(profile.debugging === null ? [] : [profile.debugging.close])];
  const session: ProbeSession = cleanup.length === 0 ? launched : { ...launched, cleanup };
  if (profile.cascade !== null) {
    CASCADE_RUNTIMES.set(session, profile.cascade);
  }
  const persistent = profileOf(profile);
  if (persistent !== null) {
    DEBUG_PROFILES.set(session, persistent.profileDir);
  }
  if (opts.probe) {
    try {
      await Promise.all(session.contexts.map(({ context }) => context.addInitScript({ content: PROBE_CSS_SCRIPT })));
    } catch (error) {
      return await closeProbeSessionAfterError(session, error);
    }
  }
  try {
    await applyLoadEmulation(session, opts);
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
  return session;
}

/** Read the live identity of every context through the shared #977 rail. Requested/applied launcher
 *  fields are provenance, not runtime proof; matrix cells refuse when this read has any mismatch. */
export async function readSnapEnvironmentEvidence(session: ProbeSession): Promise<readonly BrowserEnvironmentEvidence[]> {
  if (session.contexts.length === 0) {
    throw new Error("INSTRUMENT ERROR: snap browser session has no context to prove");
  }
  return await Promise.all(
    session.contexts.map(async (context) => {
      const page = context.pages[0];
      if (page === undefined) {
        throw new Error("INSTRUMENT ERROR: snap browser context has no page to prove");
      }
      return await readBrowserEnvironment(page, session.environmentContract);
    }),
  );
}

export function snapEnvironmentMismatchCount(evidence: readonly BrowserEnvironmentEvidence[]): number {
  return evidence.reduce((count, entry) => count + entry.mismatches.length, 0);
}

export function cascadeRuntimeFor(session: ProbeSession): DevToolsCascadeRuntime | null {
  return CASCADE_RUNTIMES.get(session) ?? null;
}

/** The session browser's `http://127.0.0.1:<port>` debugging endpoint — the sibling attach door (design
 *  §3.4) — or null for a plain launch that published none. */
export async function debuggingEndpointFor(session: ProbeSession): Promise<string | null> {
  const profileDir = DEBUG_PROFILES.get(session);
  return profileDir === undefined ? null : await readDebuggingEndpoint(profileDir);
}

/** The Chrome debugging PORT this run's browser published, or null when it published none — the
 *  `ArmProvisions.debuggingPort` an arm declaring `needs.debuggingPort` receives. A null is what makes the
 *  Lighthouse arm REFUSE rather than attach to somebody else's browser. ONE reader for one mechanism
 *  (#1259): the reserve-a-port path that used to answer this for `--lighthouse` alone is gone. */
export async function debuggingPortFor(session: ProbeSession): Promise<number | null> {
  const profileDir = DEBUG_PROFILES.get(session);
  return profileDir === undefined ? null : await readDebuggingPort(profileDir);
}

// ── CDP load emulation (#826) ───────────────────────────────────────────────
// EVERY page of EVERY context, BEFORE the first navigation — boot itself must be measured under the arm,
// which is the whole point (the #819 finding was a settle wave slipping past the 500ms hadRecentInput
// cliff only when the CPU was busy). Chromium-only by construction: `newCDPSession` throws on any other
// engine, and the throw propagates as a tool error rather than a run that silently measured at 1× — a
// throttle flag that no-ops is a false rest-state receipt.
async function applyLoadEmulation(session: ProbeSession, opts: Args): Promise<void> {
  if (opts.cpuThrottle === NO_CPU_THROTTLE && opts.network === null) {
    return;
  }
  const conditions = opts.network === null ? null : NETWORK_PROFILES[opts.network];
  for (const { context } of session.contexts) {
    for (const page of context.pages()) {
      const cdp = await context.newCDPSession(page);
      if (opts.cpuThrottle !== NO_CPU_THROTTLE) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: opts.cpuThrottle });
      }
      if (conditions !== null) {
        await cdp.send("Network.emulateNetworkConditions", { ...conditions });
      }
    }
  }
}
