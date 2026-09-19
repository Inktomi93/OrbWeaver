// The three read-the-evidence classifiers: the shutdown drain, the client-bundle freshness, and the
// /api/_debug arming posture. All pure — each turns an observation into a WORD the operator can act on.
import type { DebugPosture, DistVerdict, DrainOutcome, ServedVerdict } from "../contract/types.ts";
import { CLIENT_DIST_INDEX_REL } from "./spawn-plan.ts";

// ── Shutdown drain ───────────────────────────────────────────────────────────────────────────────────

/** MIRRORS `SHUTDOWN_DRAIN_MS` in packages/server/src/entry/lifecycle.ts (not exported from the package,
 *  so it is restated here and PINNED by a test that reads that file — a drift makes the test red, not the
 *  operator's restart hang). */
export const SERVER_DRAIN_MS = 10_000;
/**
 * Margin over the server's own bounded drain before we escalate to SIGKILL.
 *
 * ITS STATED PREMISE WAS FALSE AND IS RECORDED HERE RATHER THAN QUIETLY DROPPED (#1936). It used to read
 * "the drain force-closes at its deadline and logs a warn, so anything past `drain + margin` is a process
 * that is not going to exit on its own" — which treats the HTTP drain as the only thing between SIGTERM and
 * exit. It is not. `entry/lifecycle.ts`'s `shutdown()` runs TWO UNBOUNDED stages AFTER the drain: the
 * workloads-worker join (`drainWorkloadsWorker` — a cooperative abort that waits for whatever job is
 * mid-run) and the db pre-close (`preCloseHousekeeping` — `PRAGMA optimize` + `wal_checkpoint(TRUNCATE)`,
 * a cost that scales with the database). So this 5s is the ENTIRE budget those two stages get, and a
 * healthy-but-busy shutdown can exceed it — which is the reported symptom, a SIGKILL on a working process.
 *
 * MEASURED 2026-09-19 on an isolated prod instance (PORT=8999, engines off, fresh db), so the numbers are
 * on the record for whoever re-prices this:
 *   • idle           → `shutdown: draining` → `shutdown: complete` in 12 ms; `down` wall 1.0 s; complete.
 *   • one in-flight request → drain deadline at exactly 10.001 s, everything after it 15 ms; `down` wall
 *     11.5 s; outcome `deadline-hit`, NO escalation. An open stream therefore CANNOT produce the reported
 *     SIGKILL: {@link classifyDrainTail} treats the deadline warn as terminal.
 * The escalation requires the two unbounded stages to exceed this margin, and until #1936 nothing in the
 * log said which stage a shutdown was in — `shutdown: http drained` / `joining the workloads worker` /
 * `db housekeeping` are the breadcrumbs added for exactly that, and they must stay non-terminal here.
 *
 * WHETHER TO WIDEN THIS, BOUND THOSE STAGES, OR MAKE THE WATCH PROGRESS-AWARE IS AN OWNER CALL, not a
 * number to invent: bounding the db pre-close means killing a checkpoint (#1376 deliberately preserves its
 * rejection), and extending on log growth alone would let a noisy wedged process defer SIGKILL forever.
 */
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

// ── Served-transform freshness (dev; #524, byte-exact since #2461) ───────────────────────────────────

/** vite's inline map: a base64 `application/json` data URL on the LAST line of a served dev transform. */
const INLINE_SOURCEMAP_RE = /\/\/# sourceMappingURL=data:application\/json;(?:charset=[\w-]+;)?base64,([A-Za-z0-9+/]+={0,2})$/u;

/**
 * The bytes vite's dev transform was computed FROM, recovered from the transform itself — or `null` when
 * this module was served without an inline map, which is not a staleness claim (see the fallback below).
 *
 * THIS REFUTES THE PREMISE THE EXPORT-NAME ARM BELOW WAS BUILT ON, and the premise is kept here rather
 * than quietly deleted. That arm's header said "nothing byte-level survives to compare" because the dev
 * transform strips types and rewrites imports. It does not survive in the CODE — it survives in the MAP:
 * vite appends the module's sourcemap as an inline base64 data URL on the last line, and its
 * `sourcesContent[0]` is the original file, byte for byte. MEASURED 2026-09-19 against the live client
 * config over `packages/ui/src/tokens/index.ts` (the generated token map), `packages/client/src/main.tsx`
 * (through the React-Compiler babel pass), `packages/kit/src/index.ts` and `packages/client/vite.config.ts`
 * — all four `sourcesContent[0] === readFileSync(file)`, non-ASCII included.
 *
 * WHY THIS MATTERS (#2461): export names are a COUNT of declarations, and the staleness that actually
 * shipped was INSIDE one — `stack status` printed `fresh · carries all 6 of its value export(s)` over a
 * served token map that was missing `text.code-field` and `leading.code-field` entirely. Bytes catch that;
 * names structurally cannot.
 *
 * WHY IT MATCHES THE RAW MAP TEXT INSTEAD OF PARSING IT: `JSON.parse` on a body vite produced would be a
 * new caught-failure site in an operator instrument for a failure mode that would be vite emitting a
 * malformed map. The decoded map is JSON, so the disk source appears in it as exactly
 * `JSON.stringify(diskSource)` — proven by the same measurement, together with its control (one appended
 * character makes the match fail). `Buffer.from(…, "base64")` ignores non-base64 input rather than
 * throwing, so this whole path is total.
 */
export function servedCarriesDiskBytes(servedBody: string, diskSource: string): boolean | null {
  const encoded = INLINE_SOURCEMAP_RE.exec(servedBody.trimEnd())?.[1];
  if (encoded === undefined) {
    return null;
  }
  return Buffer.from(encoded, "base64").toString("utf8").includes(JSON.stringify(diskSource));
}

/** Every way a module can DECLARE a value export, as one matcher over the disk source. Types are excluded
 *  on purpose (`export type X` / `export interface X` / `export type { X }` are ERASED by the transform, so
 *  their absence from the served body proves nothing); a re-export clause takes the LAST identifier of each
 *  clause, which is the exported name under `a as b`. `default` is skipped — the served body spells it as
 *  a keyword, not as a binding. */
const VALUE_EXPORT_RE = /^\s*export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gmu;
const EXPORT_CLAUSE_RE = /^\s*export\s+(?!type\s*\{)\{([^}]*)\}/gmu;
const CLAUSE_NAME_RE = /([A-Za-z_$][\w$]*)\s*$/u;

/** The value-export names a served dev transform of this source MUST still contain.
 *
 *  Why export NAMES and not a content hash: vite's dev transform is not the file — it strips types and
 *  rewrites imports — so nothing byte-level survives to compare. Identifiers do, because the dev pipeline
 *  never minifies. A landed export missing from the served body is exactly the wedge this probe exists for.
 * @public Test-anchored: the planted controls in tests/tooling/stack/index.test.ts pin both directions. */
export function valueExportNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(VALUE_EXPORT_RE)) {
    names.add(match[1] ?? "");
  }
  for (const match of source.matchAll(EXPORT_CLAUSE_RE)) {
    for (const clause of (match[1] ?? "").split(",")) {
      const trimmed = clause.trim();
      if (trimmed === "" || trimmed.startsWith("type ")) {
        continue;
      }
      names.add(CLAUSE_NAME_RE.exec(trimmed)?.[1] ?? "");
    }
  }
  names.delete("");
  return [...names];
}

/** Compare one module's disk source against what vite actually served for it — BYTES first (the served
 *  transform's own sourcemap), export names only as the fallback for a module served without one.
 *  `servedBody: null` = no answer (vite down / the module 404'd), which is NOT a staleness claim — see
 *  `ServedState`. */
export function classifyServedTransform(opts: {
  readonly file: string | null;
  readonly diskSource: string | null;
  readonly servedBody: string | null;
}): ServedVerdict {
  if (opts.file === null || opts.diskSource === null) {
    return { state: "unverifiable", file: opts.file, message: "no candidate workspace module to probe — served-vs-disk freshness NOT measured" };
  }
  const servedBody = opts.servedBody;
  if (servedBody === null) {
    return { state: "unreachable", file: opts.file, message: `vite did not serve ${opts.file} — served-vs-disk freshness NOT measured` };
  }
  // THE BYTE ARM FIRST (#2461). It answers for any module vite mapped — including a types-only one, which
  // the name arm can only call `unverifiable` — and it is the only arm that can see a change INSIDE a
  // declaration. `null` = this module came back without a map, so it falls through to the name arm rather
  // than inventing a verdict.
  const carriesDiskBytes = servedCarriesDiskBytes(servedBody, opts.diskSource);
  if (carriesDiskBytes === true) {
    return { state: "fresh", file: opts.file, message: `vite's transform of ${opts.file} was built from the exact bytes on disk` };
  }
  if (carriesDiskBytes === false) {
    return {
      state: "stale",
      file: opts.file,
      message: `vite is serving a STALE transform of ${opts.file} — its own sourcemap carries source bytes that are NOT the file on disk, so every load serves pre-change code while healthz and the vite pid both look fine. Restart the stack (pnpm stack restart).`,
    };
  }
  const expected = valueExportNames(opts.diskSource);
  if (expected.length === 0) {
    return { state: "unverifiable", file: opts.file, message: `${opts.file} declares no value export — served-vs-disk freshness NOT measured` };
  }
  // A local binding, not `opts.servedBody`: the null-narrowing above does not survive into the callback.
  const missing = expected.filter((name) => !servedBody.includes(name));
  if (missing.length > 0) {
    return {
      state: "stale",
      file: opts.file,
      message: `vite is serving a STALE transform of ${opts.file} — it is missing ${missing.join(", ")}. The file watcher is dead: every load serves pre-change code while healthz and the vite pid both look fine. Restart the stack (pnpm stack restart).`,
    };
  }
  return { state: "fresh", file: opts.file, message: `vite's transform of ${opts.file} carries all ${expected.length} of its value export(s)` };
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
    // `null` = the probe never got an answer. Spelled as its own case (not folded into `default:`) so the
    // "no live instance" arm is legible; `default:` still covers every OTHER status the server could
    // return — this switch is over `number | null`, so it is not a closed union.
    case null:
      return "unknown";
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
    case "unknown":
      return "unknown (no live instance answering)";
  }
}
