import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { closeProbeSession, launchProbeSession } from "@orb/tooling/_shared/browser";
import type { ChildExit, FullPriorityChild } from "@orb/tooling/_shared/proc";
import { spawnFullPriorityChild } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { RUN_MARKER_ENV } from "@orb/tooling/_shared/run-marker";
import { awaitDevClientReady, devMarkerPreload } from "@orb/tooling/dev";
import type { Request } from "@playwright/test";

const HEALTH_PROBE_TIMEOUT_MS = 5000;
const STARTUP_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 1000;
const { RUNNER_TEMP, HEALTHZ, DEV_ORIGIN } = inheritedProcessEnv();
if (RUNNER_TEMP === undefined || HEALTHZ === undefined || DEV_ORIGIN === undefined) {
  throw new Error("Contributor CI requires RUNNER_TEMP, HEALTHZ and DEV_ORIGIN");
}
const preload = join(RUNNER_TEMP, "contributor-marker.mjs");
writeFileSync(preload, devMarkerPreload(join(RUNNER_TEMP, "contributor-dev.marker"), pathToFileURL(resolve("tooling/src/_shared/run-marker.ts")).href));
const childEnv = inheritedProcessEnv();
childEnv["DEBUG"] = [childEnv["DEBUG"], "vite:load,vite:transform"].filter(Boolean).join(",");
// The native dev proof owns its marker, not a surrounding tool's inherited run.
delete childEnv[RUN_MARKER_ENV];
childEnv["NODE_OPTIONS"] = [childEnv["NODE_OPTIONS"], `--import=${pathToFileURL(preload).href}`].filter(Boolean).join(" ");
// The existing spawn door resolves pnpm's .cmd shim on Windows through cross-spawn.
const child = spawnFullPriorityChild("pnpm", ["dev"], {
  detached: process.platform !== "win32",
  env: childEnv,
  logPath: join(RUNNER_TEMP, "contributor-dev.log"),
});
let exited = false;
child.wait().then(
  (exit) => {
    exited = true;
    console.error("pnpm dev exited", exit);
  },
  (error: Error) => {
    exited = true;
    console.error("pnpm dev supervision failed", error);
  },
);
if (child.pid === undefined) {
  throw new Error("pnpm dev could not spawn");
}
writeFileSync(join(RUNNER_TEMP, "contributor-dev.pid"), String(child.pid));
child.unref();
const ready = async (url: string): Promise<boolean> => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS) })).ok;
  } catch {
    return false;
  }
};
let sampler: FullPriorityChild | undefined;
let samplerExit: Promise<ChildExit> | undefined;
if (process.platform === "win32") {
  const script = join(RUNNER_TEMP, "contributor-resources.ps1");
  writeFileSync(
    script,
    String.raw`
$ErrorActionPreference = "Stop"
for ($sample = 0; $sample -lt 44; $sample++) {
  $memory = Get-CimInstance Win32_OperatingSystem
  $processes = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='chrome.exe' OR Name='tsgo.exe'" |
    Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,PrivatePageCount,KernelModeTime,UserModeTime,ThreadCount)
  [ordered]@{ atUtc = [DateTime]::UtcNow.ToString("o"); freePhysicalKiB = $memory.FreePhysicalMemory;
    totalPhysicalKiB = $memory.TotalVisibleMemorySize; processes = $processes } | ConvertTo-Json -Depth 5 -Compress
  Start-Sleep -Seconds 15
}
`,
  );
  sampler = spawnFullPriorityChild("pwsh", ["-NoProfile", "-NonInteractive", "-File", script], {
    logPath: join(RUNNER_TEMP, "contributor-resources.log"),
  });
  samplerExit = sampler.wait();
}
try {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (!((await ready(HEALTHZ)) && (await ready(DEV_ORIGIN)))) {
    if (exited) {
      throw new Error("pnpm dev exited before both endpoints answered");
    }
    if (Date.now() >= deadline) {
      throw new Error("server and Vite readiness timed out");
    }
    await sleep(POLL_INTERVAL_MS);
  }
  console.log("READY server", HEALTHZ, "Vite", DEV_ORIGIN);
  // A fresh Vite checkout must finish its cold module transforms before Snap's bounded navigation.
  const session = await launchProbeSession({
    headless: true,
    viewport: { width: 1280, height: 720 },
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });
  const browser = session.browser;
  try {
    const context = await browser.newContext({
      recordHar: { path: join(RUNNER_TEMP, "contributor-startup.har"), mode: "full", content: "omit" },
    });
    try {
      const page = await context.newPage();
      page.on("pageerror", (error) => console.error("CLIENT_ERROR", error.message));
      const pending = new Map<Request, number>();
      page.on("request", (request) => pending.set(request, Date.now()));
      page.on("requestfinished", (request) => pending.delete(request));
      page.on("requestfailed", (request) => {
        pending.delete(request);
        console.error("CLIENT_REQUEST_FAILED", new URL(request.url()).pathname, request.failure()?.errorText);
      });
      try {
        await awaitDevClientReady(page, DEV_ORIGIN, deadline);
      } catch (error) {
        const observations = [...pending].map(([request, since]) => ({
          path: new URL(request.url()).pathname,
          type: request.resourceType(),
          ageMs: Date.now() - since,
        }));
        writeFileSync(join(RUNNER_TEMP, "contributor-pending.json"), JSON.stringify(observations, null, 2));
        console.error("CLIENT_PENDING_COUNT", observations.length);
        throw error;
      }
      console.log("READY client mounted without degraded readiness");
    } finally {
      await context.close();
    }
  } finally {
    await closeProbeSession(session);
  }
} finally {
  if (sampler !== undefined) {
    sampler.kill("SIGTERM");
    console.log("RESOURCE_SAMPLER_EXIT", await samplerExit);
  }
}
