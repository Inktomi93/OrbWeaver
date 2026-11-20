// Browser-session lifecycle: the localStorage seeds (probe-mode/debug-token), the one launch wrapper
// over floor/browser/browser, and teardown with failure-evidence traces/HARs (kept red, deleted green).
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactDir, registerInstrumentArtifact } from "../../floor/artifacts/artifact-out.ts";
import { aggregateDimension, aggregateScope, contextIndex, exactDimension, scopeV1 } from "../../floor/artifacts/artifact-scope.ts";
import { closeProbeSession, closeProbeSessionAfterError, launchProbeSession } from "../../floor/browser/browser.ts";
import { openProbeContext, probeSessionForContext } from "../../floor/browser/browser-context.ts";
import type { LocalStorageSeed, ProbeContext, ProbeLaunchOptions, ProbeSession } from "../../floor/browser/browser-contract.ts";
import type { BrowserEnvironmentEvidence } from "../../floor/browser/browser-environment.ts";
import { readBrowserEnvironment } from "../../floor/browser/browser-environment.ts";
import type { DebuggingProfile } from "../../floor/browser/debugging-endpoint.ts";
import { createDebuggingProfile, readDebuggingEndpoint, readDebuggingPort } from "../../floor/browser/debugging-endpoint.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { DevToolsCascadeRuntime } from "../../floor/devtools/devtools-runtime.ts";
import { prepareDevToolsCascadeRuntime } from "../../floor/devtools/devtools-runtime.ts";
import type { AppliedLoadEmulation, NetworkProfileName } from "../contract/load-emulation.ts";
import type { FailureArtifacts } from "../contract/run.ts";
import type { Args } from "../contract/types.ts";
import { revealBasicCredentials } from "../lib/disk-safe-argv.ts";
import { writeNetworkHar } from "../lib/network-har.ts";
import { stopTraceToFile } from "../lib/private-values.ts";
import { NETWORK_PROFILES, NO_CPU_THROTTLE } from "../lib/throttle.ts";
import { armLaunchNeeds } from "./arms/registry.ts";
import { adoptRequestRing, installRequestRing } from "./request-ring.ts";

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
const LAUNCHED_HEADLESS = new WeakMap<ProbeSession, boolean>();
// Harness-side determinism for --probe: floor every animation/transition and hide the
// caret from FIRST PAINT (screenshot-time `animations:"disabled"` only rewinds at capture;
// this kills mid-run flicker during steps too). Raw string — see floor/browser/browser.ts header.
const PROBE_CSS_SCRIPT = `document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
  document.head.appendChild(style);
});`;

// ── Orchestration ───────────────────────────────────────────────────────────

// Pre-navigation localStorage seeds: the generic --local-storage pairs plus the two harness
// keys (all ride _kit's one init script — same timing, before any page script).
function buildSeeds(opts: Args): LocalStorageSeed[] {
  const seeds: LocalStorageSeed[] = opts.localStorage.map(({ key, value }) => ({ key, value: value.reveal() }));
  const debugToken = opts.debugToken.reveal();
  if (debugToken !== "") {
    seeds.push({ key: DEBUG_TOKEN_KEY, value: debugToken });
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
        await stopTraceToFile(context.tracing, tracePath);
        await registerInstrumentArtifact("traces", tracePath, {
          producer: "snap",
          producerArm: null,
          channel: "playwright-trace",
          mediaType: "application/zip",
          schema: "playwright-trace",
          role: "raw-fallback",
          completeness: "complete",
          completenessDetail: "complete Playwright trace for human/deep forensics; not primary agent evidence",
          scope: scopeV1({ context: exactDimension(contextIndex(index)), page: aggregateDimension(), window: aggregateDimension() }),
          records: null,
          limits: [],
        });
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
  let hars: string[] = [];
  try {
    traces = enabled ? await finishFailureTraces(session, failed, name) : [];
    if (enabled && failed) {
      const harPath = join(await artifactDir("traces"), `${name}.har`);
      const receipt = await writeNetworkHar(session, harPath);
      const bounded = receipt.limits.some((limit) => !limit.complete);
      await registerInstrumentArtifact("traces", harPath, {
        producer: "snap",
        producerArm: null,
        channel: "har",
        mediaType: "application/json",
        schema: "har-1.2",
        role: "primary",
        completeness: bounded ? "bounded" : "complete",
        completenessDetail: bounded ? "complete request population with bounded body/redaction fields" : "complete captured request population",
        scope: aggregateScope(),
        records: receipt.entries,
        limits: receipt.limits,
      });
      hars = [harPath];
    }
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
  await closeProbeSession(session);
  if (failed) {
    return { traces, hars };
  }
  return { traces, hars: [] };
}

/** A matrix cell owns one disposable context inside a daemon browser. Its trace/HAR contract stays the
 *  ordinary one-shot contract, but closing this context must never close the session browser. */
export async function finishSnapContext(context: ProbeContext, failed: boolean, name: string, enabled: boolean): Promise<FailureArtifacts> {
  let traces: string[] = [];
  let hars: string[] = [];
  if (enabled) {
    const traceDir = await artifactDir("traces");
    const tracePath = join(traceDir, `${name}.zip`);
    if (failed) {
      await stopTraceToFile(context.context.tracing, tracePath);
      await registerInstrumentArtifact("traces", tracePath, {
        producer: "snap",
        producerArm: null,
        channel: "playwright-trace",
        mediaType: "application/zip",
        schema: "playwright-trace",
        role: "raw-fallback",
        completeness: "complete",
        completenessDetail: "complete Playwright trace for human/deep forensics; not primary agent evidence",
        scope: scopeV1({ context: exactDimension(contextIndex(0)), page: aggregateDimension(), window: aggregateDimension() }),
        records: null,
        limits: [],
      });
      traces = [tracePath];
    } else {
      await context.context.tracing.stop();
    }
    if (failed) {
      const harPath = join(traceDir, `${name}.har`);
      const receipt = await writeNetworkHar({ contexts: [context] }, harPath);
      const bounded = receipt.limits.some((limit) => !limit.complete);
      await registerInstrumentArtifact("traces", harPath, {
        producer: "snap",
        producerArm: null,
        channel: "har",
        mediaType: "application/json",
        schema: "har-1.2",
        role: "primary",
        completeness: bounded ? "bounded" : "complete",
        completenessDetail: bounded ? "complete request population with bounded body/redaction fields" : "complete captured request population",
        scope: aggregateScope(),
        records: receipt.entries,
        limits: receipt.limits,
      });
      hars = [harPath];
    }
  }
  await context.context.close();
  if (failed) {
    return { traces, hars };
  }
  return { traces: [], hars: [] };
}

type LaunchExtras = Partial<Pick<ProbeLaunchOptions, "pages" | "contexts" | "contextCookies" | "cookieDomain">> & {
  readonly requireCascadeRuntime?: boolean;
  /** A stateful session's browser publishes its debugging endpoint (the
   *  sibling attach door). The cascade runtime's profile already does; a plain session gets the
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

// `--visitor`: any of the server's relay headers marks a request as relayed, which refuses the loopback owner
// fallback (packages/server/src/infra/auth/forwarded.ts). The address is RFC 5737 documentation space.
const VISITOR_RELAY_HEADERS: Readonly<Record<string, string>> = { "x-forwarded-for": "203.0.113.7" };

function buildLaunchOptions(opts: Args, profile: LaunchProfile): ProbeLaunchOptions {
  const persistent = profileOf(profile);
  return {
    headless: !opts.vnc,
    viewport: opts.viewport,
    viewportExplicit: opts.viewportExplicit,
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
    ...(opts.visitor ? { extraHTTPHeaders: VISITOR_RELAY_HEADERS } : {}),
    // Scoped to the base origin: Playwright otherwise answers a basic-auth challenge from any origin the page loads.
    ...(opts.baseCredentials === null ? {} : { httpCredentials: { ...revealBasicCredentials(opts.baseCredentials), origin: new URL(opts.base).origin } }),
    ...(persistent === null ? {} : { persistentProfileDir: persistent.profileDir, browserArgs: persistent.browserArgs }),
  };
}

export async function launchSnapSession(opts: Args, extras: LaunchExtras = {}): Promise<ProbeSession> {
  const { requireCascadeRuntime = false, debuggingEndpoint = false, ...launchExtras } = extras;
  const profile = await prepareLaunchProfile(opts, requireCascadeRuntime, debuggingEndpoint);
  let launched: ProbeSession;
  try {
    launched = await launchProbeSession({ ...buildLaunchOptions(opts, profile), ...launchExtras });
  } catch (error) {
    await closeLaunchProfile(profile);
    throw error;
  }
  const cleanup = [...(profile.cascade === null ? [] : [profile.cascade.close]), ...(profile.debugging === null ? [] : [profile.debugging.close])];
  const session: ProbeSession = cleanup.length === 0 ? launched : { ...launched, cleanup };
  installRequestRing(session);
  if (profile.cascade !== null) {
    CASCADE_RUNTIMES.set(session, profile.cascade);
  }
  const persistent = profileOf(profile);
  if (persistent !== null) {
    DEBUG_PROFILES.set(session, persistent.profileDir);
  }
  LAUNCHED_HEADLESS.set(session, !opts.vnc);
  try {
    await prepareRunContexts(session, opts);
  } catch (error) {
    return await closeProbeSessionAfterError(session, error);
  }
  return session;
}

/** What every context a run captures in gets before its first navigation, whether its browser was launched for the
 *  run or already running: the `--probe` floor, then the run's CDP load and vision emulation. */
async function prepareRunContexts(session: ProbeSession, opts: Args): Promise<void> {
  if (opts.probe) {
    await Promise.all(session.contexts.map(({ context }) => context.addInitScript({ content: PROBE_CSS_SCRIPT })));
  }
  // A new context inherits none of another context's CDP emulation, so each gets the run's own.
  LOAD_EMULATIONS.set(session, await applyLoadEmulation(session, opts));
  await applyVisionEmulation(session, opts);
}

/** Whether `session`'s browser was launched headless; a context opened inside it cannot change that. */
export function launchedHeadless(session: ProbeSession): boolean {
  const headless = LAUNCHED_HEADLESS.get(session);
  if (headless === undefined) {
    throw new Error("INSTRUMENT ERROR: snap browser session was not launched through launchSnapSession");
  }
  return headless;
}

/** Whether `session`'s browser publishes a debugging endpoint (`debuggingPortFor` reads its port). */
export function publishesDebugging(session: ProbeSession): boolean {
  return DEBUG_PROFILES.has(session);
}

/** Whose request ring a context opened in a running browser records into: the owner's (a session daemon's matrix
 *  cell, whose ring is the session's evidence), or one of the run's own, as a launch would give it. */
const CONTEXT_RING_OWNERS = ["owner", "run"] as const;
export type ContextRingOwner = (typeof CONTEXT_RING_OWNERS)[number];

/** Build one isolated context within an already-launched Chromium: a matrix cell in a session daemon, or any run
 *  `contextsIn` hosts. The context gets the run's own pages, emulation, settings shim, capture rings and optional
 *  failure artifacts; the returned view keeps existing capture operations honest about which context they read. */
export async function openSnapMatrixContext(
  owner: ProbeSession,
  opts: Args,
  ring: ContextRingOwner,
): Promise<{ readonly context: ProbeContext; readonly session: ProbeSession }> {
  const context = await openProbeContext(owner.browser, { ...buildLaunchOptions(opts, { cascade: null, debugging: null }), pages: opts.pages }, 0);
  context.diagnosticWindow.value = owner.diagnosticWindow.value;
  const session = probeSessionForContext(owner, context);
  if (ring === "owner") {
    adoptRequestRing(owner, session, context);
  } else {
    installRequestRing(session);
  }
  const cascade = CASCADE_RUNTIMES.get(owner);
  if (cascade !== undefined) {
    CASCADE_RUNTIMES.set(session, cascade);
  }
  const profile = DEBUG_PROFILES.get(owner);
  if (profile !== undefined) {
    DEBUG_PROFILES.set(session, profile);
  }
  try {
    await prepareRunContexts(session, opts);
  } catch (error) {
    await context.context.close();
    throw error;
  }
  return { context, session };
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
/** `--vision`: the same every-page, before-navigation CDP application as the load arms below. The CDP
 *  session is never detached, because Chromium drops an emulation when its session detaches. */
async function applyVisionEmulation(session: ProbeSession, opts: Args): Promise<void> {
  if (opts.vision === null) {
    return;
  }
  for (const { context } of session.contexts) {
    for (const page of context.pages()) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setEmulatedVisionDeficiency", { type: opts.vision });
    }
  }
}

/** The one CDP call the load arm makes. */
interface LoadEmulationCdp {
  // biome-ignore lint/style/useConsistentMethodSignatures: method syntax compares `params` bivariantly, which is what lets Playwright's generic `CDPSession.send` satisfy this.
  send(method: string, params: object): Promise<unknown>;
}

// The contexts the load arm sends through; a ProbeSession satisfies it, and so does a recording stand-in.
interface LoadEmulationTarget<P> {
  readonly contexts: readonly {
    readonly context: { readonly pages: () => readonly P[]; readonly newCDPSession: (page: P) => Promise<LoadEmulationCdp> };
  }[];
}

type LoadEmulationAsk = Pick<Args, "cpuThrottle" | "network">;

function appliedLoadEmulation(cpuRate: number, network: NetworkProfileName | null): AppliedLoadEmulation {
  return { cpuRate, network } as AppliedLoadEmulation;
}

const UNEMULATED = appliedLoadEmulation(NO_CPU_THROTTLE, null);
const LOAD_EMULATIONS = new WeakMap<ProbeSession, AppliedLoadEmulation>();

/** Which arms one page was sent. */
async function emulatePage(cdp: LoadEmulationCdp, ask: LoadEmulationAsk): Promise<{ readonly throttled: boolean; readonly conditioned: boolean }> {
  let throttled = false;
  let conditioned = false;
  if (ask.cpuThrottle !== NO_CPU_THROTTLE) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: ask.cpuThrottle });
    throttled = true;
  }
  if (ask.network !== null) {
    await cdp.send("Network.emulateNetworkConditions", { ...NETWORK_PROFILES[ask.network] });
    conditioned = true;
  }
  return { throttled, conditioned };
}

/** Send the asked-for load emulation to every page and return what every page received. A send that throws
 *  propagates as a tool error; an arm no page received reads as unemulated. */
export async function applyLoadEmulation<P>(target: LoadEmulationTarget<P>, ask: LoadEmulationAsk): Promise<AppliedLoadEmulation> {
  if (ask.cpuThrottle === NO_CPU_THROTTLE && ask.network === null) {
    return UNEMULATED;
  }
  let pages = 0;
  let throttled = 0;
  let conditioned = 0;
  for (const { context } of target.contexts) {
    for (const page of context.pages()) {
      const sent = await emulatePage(await context.newCDPSession(page), ask);
      pages += 1;
      throttled += sent.throttled ? 1 : 0;
      conditioned += sent.conditioned ? 1 : 0;
    }
  }
  return appliedLoadEmulation(pages > 0 && throttled === pages ? ask.cpuThrottle : NO_CPU_THROTTLE, pages > 0 && conditioned === pages ? ask.network : null);
}

/** The load emulation this session's pages received, for the RESULT line. A session no emulation reached is unemulated. */
export function loadEmulationFor(session: ProbeSession): AppliedLoadEmulation {
  return LOAD_EMULATIONS.get(session) ?? UNEMULATED;
}
