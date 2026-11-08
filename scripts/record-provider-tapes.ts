// Records the provider tapes: runs the tape journeys with any extra Playwright arguments (`-g <title>`), then
// promotes the run's tapes into the committed directory only when every selected journey passed.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { PROVIDER_TAPE_DIR, PROVIDER_TAPE_RECORD_DIR, PROVIDER_TAPE_RECORD_ENV } from "@orb/testkit/node/helpers";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";

const root = resolve(import.meta.dirname, "..");
const TAPE_SPECS = ["guided-generations.spec.ts", "rpg-lite-loop.spec.ts"];

// A tape an earlier run left behind would be promoted beside this run's own.
rmSync(PROVIDER_TAPE_RECORD_DIR, { recursive: true, force: true });
const run = spawnSync(
  process.execPath,
  [
    resolve(root, "tooling/src/floor/process/niced-exec.ts"),
    "playwright",
    "test",
    "-c",
    "playwright.config.ts",
    "--project=single-user",
    ...TAPE_SPECS,
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit", env: inheritedProcessEnv({ [PROVIDER_TAPE_RECORD_ENV]: "1", ["E2E_LIVE"]: "0", ["E2E_ALLOW_DEV_TARGET"]: "0" }) },
);
// A signal (an OOM kill, a crash) has no status; it must still fail the run.
const status = run.status ?? 1;
if (status === 0 && existsSync(PROVIDER_TAPE_RECORD_DIR)) {
  cpSync(PROVIDER_TAPE_RECORD_DIR, PROVIDER_TAPE_DIR, { recursive: true });
}
process.exitCode = status;
