// Browser-session lifecycle: the localStorage seeds (probe-mode/debug-token), the one launch wrapper
// over _shared/browser, and teardown with failure-evidence traces/HARs (kept red, deleted green).
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { artifactDir } from "../../_shared/artifacts.ts";
import type { LocalStorageSeed, ProbeLaunchOptions, ProbeSession } from "../../_shared/browser.ts";
import { closeProbeSession, closeProbeSessionAfterError, launchProbeSession } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// localStorage keys the harness seeds. App counterpart for probe-mode:
// packages/client/src/lib/probe-mode.ts; the debug-token reader lands with its route.
const PROBE_MODE_KEY = "orb:probe-mode";
const DEBUG_TOKEN_KEY = "orb:debug-token";
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

interface FailureArtifacts {
  readonly traces: readonly string[];
  readonly hars: readonly string[];
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

type LaunchExtras = Partial<Pick<ProbeLaunchOptions, "pages" | "contexts" | "contextCookies" | "cookieDomain">>;

export async function launchSnapSession(opts: Args, name: string, extras: LaunchExtras = {}): Promise<ProbeSession> {
  const traceDir = opts.failureEvidence ? await artifactDir("traces") : null;
  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    colorScheme: opts.colorScheme,
    reducedMotion: opts.reducedMotion || opts.probe,
    appearance: opts.appearance,
    theme: opts.theme,
    localStorage: buildSeeds(opts),
    device: opts.device,
    trace: opts.failureEvidence,
    ...(traceDir === null ? {} : { harPathPrefix: join(traceDir, name) }),
    ...extras,
  });
  if (opts.probe) {
    try {
      await Promise.all(session.contexts.map(({ context }) => context.addInitScript({ content: PROBE_CSS_SCRIPT })));
    } catch (error) {
      return await closeProbeSessionAfterError(session, error);
    }
  }
  return session;
}
