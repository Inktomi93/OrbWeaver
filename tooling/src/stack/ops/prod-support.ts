// The prod launcher's SHARED READERS: client-bundle freshness, the prod log tail, the pidfile, uptime,
// and the mint-once debug token. No verb lives here — up/restart are ops/prod-up.ts, down/status are
// ops/prod-down.ts, and both import from this file.
import { randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import type { DistVerdict } from "../contract/types.ts";
import { CLIENT_DIST_INDEX_REL } from "../lib/spawn-plan.ts";
import { classifyDist, debugPostureText } from "../lib/verdicts.ts";
import { LOG_PATH, log, PIDFILE, probeDebug, runDir, TOKEN_PATH } from "./prod-state.ts";

const TOKEN_BYTES = 24;
const TOKEN_FILE_MODE = 0o600;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
export const DEFAULT_LOG_LINES = 40;

// The trees whose source can make the built bundle stale. The SERVER is deliberately absent: node runs its
// .ts directly, so no server edit ever needs a client rebuild.
const CLIENT_SOURCE_DIRS = [
  "packages/client/src",
  "packages/ui/src",
  // `publicDir` is copied verbatim into outDir on every build (vite config/shared-options: publicDir), so
  // an edit here changes the shipped bundle without touching a single module.
  "packages/client/public",
];
// Non-directory inputs that also invalidate a build. `index.html` is not an afterthought in vite — it IS
// the build entry and part of the module graph, and a config change requires a rebuild.
const CLIENT_SOURCE_FILES = ["packages/client/index.html", "packages/client/vite.config.ts"];

function safeMtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

function newestMtimeMs(dir: string): number | null {
  let newest: number | null = null;
  // `Dirent<string>`, not `ReturnType<typeof readdirSync>`: that alias resolves to the BUFFER overload
  // (`Dirent<NonSharedBuffer>`) under node's current typings, and `entry.name` then isn't a string.
  let entries: Dirent<string>[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const mtime = entry.isDirectory() ? newestMtimeMs(full) : safeMtimeMs(full);
    if (mtime !== null && (newest === null || mtime > newest)) {
      newest = mtime;
    }
  }
  return newest;
}

export function distVerdict(): DistVerdict {
  const sourceMtimes = [
    ...CLIENT_SOURCE_DIRS.map((rel) => newestMtimeMs(join(REPO_ROOT, rel))),
    ...CLIENT_SOURCE_FILES.map((rel) => safeMtimeMs(join(REPO_ROOT, rel))),
  ].filter((m): m is number => m !== null);
  return classifyDist({
    distIndexMtimeMs: safeMtimeMs(join(REPO_ROOT, CLIENT_DIST_INDEX_REL)),
    newestSourceMtimeMs: sourceMtimes.length === 0 ? null : Math.max(...sourceMtimes),
  });
}

/** The ONLY build in this repo: @orb/client's own `vite build`, invoked through its package script (never
 *  a hand-rolled vite call). Runs BEFORE anything is stopped, so a failed build never leaves a live
 *  instance killed and a dead bundle behind. */
export function buildClient(): boolean {
  log("building the client bundle (pnpm --filter @orb/client build)…");
  const res = runNicedSync("pnpm", ["--filter", "@orb/client", "build"], { cwd: REPO_ROOT, stdio: "inherit" });
  if (res.status !== 0) {
    log("client build FAILED — nothing was stopped; the running instance (if any) is untouched.");
    return false;
  }
  return true;
}

/** Mint-once-and-reuse: a re-launch that rotated the token would silently break every saved operator curl.
 *  The file is 0600 and its VALUE is never printed — status reports that debug is armed and where the
 *  token lives, never what it is (a credential echoed into a terminal is a credential leaked). */
export function debugToken(): string {
  const path = TOKEN_PATH();
  try {
    const existing = readFileSync(path, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  } catch {
    // no token yet — mint below
  }
  const minted = randomBytes(TOKEN_BYTES).toString("hex");
  mkdirSync(runDir(), { recursive: true });
  writeFileSync(path, `${minted}\n`, { mode: TOKEN_FILE_MODE });
  return minted;
}

/** Report the live gate's posture after a launch — probed, never echoed from our own overlay. */
export async function reportDebugPosture(port: number): Promise<void> {
  const { posture } = await probeDebug(port);
  log(`/api/_debug/*: ${debugPostureText(posture, TOKEN_PATH())}`);
}

export function uptimeText(startedAt: string): string {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) {
    return "—";
  }
  const seconds = Math.round((Date.now() - started) / MS_PER_SECOND);
  return `${Math.floor(seconds / SECONDS_PER_HOUR)}h ${Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)}m ${seconds % SECONDS_PER_MINUTE}s`;
}

export function removePidfile(): void {
  try {
    unlinkSync(PIDFILE());
  } catch {
    // already gone
  }
}

export function safeSize(path: string): number {
  return safeMtimeMs(path) === null ? 0 : statSync(path).size;
}

export function readFrom(path: string, offset: number): string {
  try {
    return readFileSync(path, "utf8").slice(offset);
  } catch {
    return "";
  }
}

export function tailLog(lines: number): string {
  try {
    return `${readFileSync(LOG_PATH(), "utf8").split("\n").slice(-lines).join("\n")}\n`;
  } catch {
    return "(no log)\n";
  }
}
