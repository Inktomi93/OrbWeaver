// The three read-the-evidence classifiers: the shutdown drain, the client-bundle freshness, and the
// /api/_debug arming posture. All pure — each turns an observation into a WORD the operator can act on.
import type { DebugPosture, DistVerdict, DrainOutcome } from "../contract/types.ts";
import { CLIENT_DIST_INDEX_REL } from "./spawn-plan.ts";

// ── Shutdown drain ───────────────────────────────────────────────────────────────────────────────────

/** MIRRORS `SHUTDOWN_DRAIN_MS` in packages/server/src/entry/lifecycle.ts (not exported from the package,
 *  so it is restated here and PINNED by a test that reads that file — a drift makes the test red, not the
 *  operator's restart hang). */
export const SERVER_DRAIN_MS = 10_000;
/** Margin over the server's own bounded drain before we escalate. The drain force-closes at its deadline
 *  and logs a warn, so anything past `drain + margin` is a process that is not going to exit on its own. */
export const DRAIN_MARGIN_MS = 5000;
export const DRAIN_WATCH_MS = SERVER_DRAIN_MS + DRAIN_MARGIN_MS;

/** Classify the tail of the prod log written SINCE the SIGTERM. `deadline-hit` is a real outcome, not a
 *  failure: the drain force-closed a long-lived SSE stream at 10s and said so (a warn, because a client
 *  saw a truncated stream) — expected during a deploy. */
export function classifyDrainTail(tail: string): DrainOutcome {
  if (tail.includes("shutdown: complete")) {
    return "complete";
  }
  if (tail.includes("shutdown: drain deadline hit")) {
    return "deadline-hit";
  }
  return "pending";
}

// ── Client-dist freshness ────────────────────────────────────────────────────────────────────────────

/** Prod boot is FATAL without `dist/index.html` (`resolveSpaDistDir` throws, entry/http/spa.ts) — so a
 *  missing bundle must be caught BEFORE the old instance is stopped, and reported as the command that
 *  fixes it rather than as a dead boot in a log file. Staleness is a WARN only: an operator restarting to
 *  pick up a server-only change legitimately has an older bundle, and node runs server `.ts` directly, so
 *  no server change can ever require a build.
 *
 *  `null` mtimes mean "not found". Vite writes `manifest:false` here deliberately (client vite.config.ts:
 *  Hono serves index.html as-is), so mtimes ARE the instrument — there is no manifest to read. */
export function classifyDist(opts: { readonly distIndexMtimeMs: number | null; readonly newestSourceMtimeMs: number | null }): DistVerdict {
  if (opts.distIndexMtimeMs === null) {
    return {
      state: "missing",
      message: `no ${CLIENT_DIST_INDEX_REL} — production boot would throw at startup. Run: pnpm --filter @orb/client build   (or re-run with --build)`,
    };
  }
  if (opts.newestSourceMtimeMs !== null && opts.newestSourceMtimeMs > opts.distIndexMtimeMs) {
    return {
      state: "stale",
      message:
        "client bundle is OLDER than client/ui source — the served UI predates your changes. Rebuild with --build (server-only changes need no build: node runs .ts directly)",
    };
  }
  return { state: "fresh", message: "client bundle is newer than client/ui source" };
}

// ── the /api/_debug arming probe ─────────────────────────────────────────────────────────────────────

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

export function classifyDebugPosture(status: number | null): DebugPosture {
  switch (status) {
    case HTTP_NOT_FOUND:
      return "off";
    case HTTP_UNAUTHORIZED:
      return "token";
    case HTTP_OK:
      return "open";
    default:
      return "unknown";
  }
}

export function debugPostureText(posture: DebugPosture, tokenPath: string): string {
  switch (posture) {
    case "token":
      return `ARMED (token gate) — token in ${tokenPath} (value never printed)`;
    case "open":
      return "⚠ reachable with NO credential — expected 401/404 since AUTHFIX-2; investigate the debug gate";
    case "off":
      return "off (DEBUG_TOKEN unset and no admin session — /api/_debug/* 404s)";
    default:
      return "unknown (no live instance answering)";
  }
}
