import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { listeningPids } from "@orb/tooling/_shared/platform";
import { killPidGroup } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { describeRunMarkerSweep, sweepRunMarker } from "@orb/tooling/_shared/run-marker";
import { doDevDown, stackContext } from "@orb/tooling/stack";

const GRACEFUL_STOP_MS = 5000;
const LISTENER_SETTLE_MS = 1000;
const { RUNNER_TEMP, HEALTHZ, DEV_ORIGIN } = inheritedProcessEnv();
if (RUNNER_TEMP === undefined || HEALTHZ === undefined || DEV_ORIGIN === undefined) {
  throw new Error("Contributor CI requires RUNNER_TEMP, HEALTHZ and DEV_ORIGIN");
}
const record = join(RUNNER_TEMP, "contributor-dev.pid");
if (!existsSync(record)) {
  console.log("No dev process was started");
} else {
  const pid = Number(readFileSync(record, "utf8"));
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    throw new Error("Invalid contributor process record");
  }
  killPidGroup(pid, "SIGTERM");
  await sleep(GRACEFUL_STOP_MS);
  killPidGroup(pid, "SIGKILL");
  const markerFile = join(RUNNER_TEMP, "contributor-dev.marker");
  if (existsSync(markerFile)) {
    const sweep = await sweepRunMarker(readFileSync(markerFile, "utf8").trim());
    console.log(describeRunMarkerSweep(sweep) ?? "No escaped dev descendants remain");
  }
  // A Windows wrapper can exit before its actual listener; environment markers are unreadable there.
  // The existing stack fallback verifies checkout ownership before stopping a remaining port holder.
  const context = stackContext(
    process.cwd(),
    {
      PORT: new URL(HEALTHZ).port,
      VITE_PORT: new URL(DEV_ORIGIN).port,
      STACK_RUN_DIR: join(RUNNER_TEMP, "contributor-stack"),
    },
    null,
  );
  const stopped = await doDevDown(context);
  if (stopped !== 0) {
    throw new Error(`owned dev listener cleanup failed with exit ${String(stopped)}`);
  }
  await sleep(LISTENER_SETTLE_MS);
  const ports = listeningPids();
  if (ports.kind === "refused") {
    throw new Error(ports.reason);
  }
  for (const port of [HEALTHZ, DEV_ORIGIN].map((url) => Number(new URL(url).port))) {
    if (ports.value.has(port)) {
      throw new Error(`dev port ${String(port)} remains bound after teardown`);
    }
  }
  console.log("STOPPED dev tree; server and Vite ports are free");
}
