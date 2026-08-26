import { readdirSync, readFileSync, readlinkSync } from "node:fs";

const PROC_PID_RE = /^[0-9]+$/;

/** Process-level ownership witness for real-browser lifecycle tests, scoped by inherited cwd. */
export function chromiumPidsOwnedBy(cwd: string): Set<string> {
  const pids = new Set<string>();
  for (const entry of readdirSync("/proc")) {
    if (!PROC_PID_RE.test(entry)) {
      continue;
    }
    try {
      const processCwd = readlinkSync(`/proc/${entry}/cwd`);
      const command = readFileSync(`/proc/${entry}/cmdline`, "utf8");
      if (processCwd === cwd && (command.includes("headless_shell") || command.includes("chromium"))) {
        pids.add(entry);
      }
    } catch {
      // A process may exit between the /proc directory read and its metadata reads.
    }
  }
  return pids;
}
