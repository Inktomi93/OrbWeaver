// THE BUG-REPORT CAPTURE (#1095) — the server half of the owner's dev bug-found button: one click, a typed
// note, and everything the process knows lands in a durable file an agent session can read cold.
//
// WHY THIS HALF EXISTS AT ALL: the in-memory flight recorders (`logger.ts`'s log + request rings, `tracing.ts`'s
// trace ring, `wire-capture.ts`'s provider request/outcome rings, the injected rpg + memory-recall recorders)
// are WIPED on every server respawn — and `node --watch` respawns on every saved source file. Asking the owner
// to "go look at /api/_debug/wire/captures later" is asking for evidence that will not exist by then. The
// capture happens AT REPORT TIME, in the same process that holds the rings.
//
// RING COVERAGE AND INTENTIONAL BOUNDARIES (#1168, inventory of #1095):
//   COVERED: logRing (error-level log lines), requests (HTTP-level with method/path/status/duration/userId),
//   traces (OTel spans with per-procedure timing), wireCaptures (provider request payloads),
//   wireOutcomes (turn outcomes), rpgTraces (injected), memoryRecalls (injected).
//   INTENTIONAL GAPS:
//   - `[trpc] devlog ring`: tRPC procedure calls are already attributed by the OTel trace ring — each
//     procedure is a child span of the request root with its own timing and status. A separate procedure-level
//     devlog would duplicate what traces carry. The request ring covers HTTP-level data.
//   - `perf() startTime`: correctly handled. `captureNowMs()` uses `performance.timeOrigin + performance.now()`
//     (the house wall-clock spelling, shared with the client's `bus-devlog.ts` `clockMs`). OTel spans use
//     `hrToMs(readable.startTime)`. Both clocks are process-relative; neither leaks a wall-clock epoch.
//   - `flushSync` timing: a CLIENT-side React concern (synchronous render flushing). The server observability
//     module has no visibility into the client's React commit cycle — that is instrumented on the client side
//     by `motion-stats.ts` (LoAF scripts carry `forcedStyleAndLayoutDuration`) and the motion flaggers.
//
// WHERE IT LIVES: foundation/observability, beside `/api/_debug` — the debug surface is observability, not a
// domain (AGENTS §6). The domain-owned recorders arrive as the SAME structural-injection ports the debug routes
// already take (`RpgTraceInspector`/`MemoryRecallInspector`), so this tier still imports zero domains.
//
// THE GATE IS THE BOUNDARY. This route registers inside `/api/_debug/*`, so the two-tier gate in `routes.ts`
// (admin session, else `x-debug-token`) is its entire access control — the same sentence that file's header
// states about every probe. There is no tRPC twin and no sweep row: the cross-tenant sweep enumerates
// `appRouter._def.procedures`, so a hono route is structurally outside it, and moving a dev-only file-writing
// capture into the production router to earn a classification row would satisfy the letter against the purpose
// (owner ruling 2026-09-02, fork 1). `tests/server/entry/debug-gate.suite.test.ts` — the enforcer that DOES
// govern it — carries this path.
//
// THE SCRUB IS VALUE-BASED AND RUNS OVER THE WHOLE SERIALIZED REPORT, once, immediately before the write
// (`kit/secret-redaction`, the one scrubber — never a second one). Not per-field: the client bundle is opaque
// JSON from the page and a field allowlist would be a guess about a shape this tier does not own. The literals
// are every secret-named environment value the process holds. The write is then gated on this module's OWN
// post-condition — "no known literal survives" — so a scrubber regression can only ever produce a REFUSAL, never
// a file with a credential in it (`serializeScrubbed`).
//
// THE ARTIFACT SHAPE IS NOT DECLARED HERE. `BUG_REPORT_DIR`, the file-stem grammar and `BugReportRecord`
// live in `@orb/kit/bug-report` because the READER (`pnpm bug:reports`, #1184) needs the same three facts
// and cannot import this tier — a re-spelled directory name in the reader turns a rename here into a
// lister that silently finds nothing.
//
// BUILD IDENTITY IS STAMPED AT CAPTURE (owner amendment 3): in dev the served client IS the working tree (HMR),
// so `git rev-parse HEAD` + a dirty flag is the honest build identity, and a report from a dirty tree says so
// rather than pretending to be a commit.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BugReportBuildIdentity, BugReportRecord } from "@orb/kit/bug-report";
import { BUG_REPORT_DIR, bugReportStem } from "@orb/kit/bug-report";
import type { EvidenceSlice, EvidenceWindow } from "@orb/kit/evidence-window";
import { sliceByWindow } from "@orb/kit/evidence-window";
import { formatVersionIdentity } from "@orb/kit/version-identity";
import { redactKnownSecrets, secretRedactionLiterals } from "#kit/secret-redaction";
import { logRing, recentRequests } from "../logger.ts";
import { recentTraces } from "../tracing.ts";
import { ERROR_LEVEL, parseLogRingLine, ringLineLevel, ringLineTime } from "./log-ring-read.ts";
import { isWireCaptureEnabled, recentTurnOutcomes, recentWireCaptures } from "./wire-capture.ts";

/** How deep each ring is read before the window filter — the ring capacities, so the filter sees everything the
 *  process still holds and `truncatedAt` can tell the truth about what it does not. */
const RING_READ_DEPTH = 2000;
/** Lines of `git status --short` kept when the tree is dirty — enough to see WHAT is uncommitted, not a diff. */
const STATUS_HEAD_LINES = 40;
/** Environment keys whose VALUES are scrubbed out of a report by literal match. */
const SECRET_KEY_RE = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/iu;
/** Below this length a "secret" is a common substring and scrubbing it by value would shred the report. */
const MIN_SECRET_LENGTH = 8;
/** How much of a report id the markdown quotes as a lookup key — enough to be unique among a session's
 *  reports without making the reader retype a whole uuid (the lister resolves any unambiguous prefix). */
const ID_PREFIX_HINT = 8;

/** The optional domain-owned flight recorders, as the debug registrar already receives them. Absent ⇒ that
 *  source reports itself absent in the bundle rather than silently contributing nothing. */
export interface BugReportInspectors {
  readonly rpgTrace?: { readonly recent: (filter: { limit?: number }) => readonly object[] };
  readonly memoryRecall?: { readonly recent: (filter: { limit?: number }) => readonly object[] };
}

function gitOutput(repoRoot: string, args: readonly string[]): string | null {
  // @orb-waive caught-failure-ownership(catch): git being absent, or the cwd not being a
  // checkout, is a legitimate answer here — the report says `sha: null` instead of failing the capture. Ends if
  // a caller starts treating null as an error rather than as "git could not answer".
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** Stamp the build the report was taken against — `git rev-parse HEAD` + the dirty flag, AT CAPTURE TIME. */
export function readBuildIdentity(repoRoot: string): BugReportBuildIdentity {
  const sha = gitOutput(repoRoot, ["rev-parse", "HEAD"]);
  const status = gitOutput(repoRoot, ["status", "--short"]);
  const lines = status === null || status === "" ? [] : status.split("\n").slice(0, STATUS_HEAD_LINES);
  return { sha, dirty: lines.length > 0, statusHead: lines };
}

/** Every secret-shaped environment VALUE the caller holds — the literals the scrub removes by exact match.
 *  Value-based, not field-based: an echoing or unexpected field cannot leak what was redacted by value
 *  (the credential-display-response-echo-leak class). The environment arrives as an argument (the validated
 *  `foundation/env` object at the call site) rather than being read here — this stays a pure function a spec
 *  can drive with a planted credential. */
export function secretLiterals(environment: Readonly<Record<string, unknown>>): readonly string[] {
  const literals: string[] = [];
  for (const [key, value] of Object.entries(environment)) {
    if (SECRET_KEY_RE.test(key) && typeof value === "string" && value.length >= MIN_SECRET_LENGTH) {
      literals.push(value);
    }
  }
  return literals;
}

/** Serialize a report and remove every known secret literal. `null` ⇒ a literal SURVIVED, and the caller must
 *  refuse the write.
 *
 *  The check is this module's OWN post-condition — `literal is still present` — deliberately not a test for
 *  `redactKnownSecrets`'s `""` sentinel. Reading the sentinel would couple the last gate before bytes reach
 *  disk to one particular failure SPELLING inside the scrubber; asking the question the caller actually cares
 *  about survives a change there. On today's kit implementation the arm is unreachable (the scrubber loops
 *  until every literal is gone, degrading its marker to `""` when it must), which is exactly the property the
 *  spec pins — a post-condition on a security boundary earns its keep by being checked, not by firing.
 *
 *  It asks about `secretRedactionLiterals`, not about the raw `secrets` (#1785). This is a SERIALIZE-then-
 *  scrub site: `JSON.stringify` escapes `"` and `\`, so an operator credential holding either is in these
 *  bytes only as `a\"b`. A post-condition that searched for the raw literal would have certified exactly the
 *  bytes it exists to refuse.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function serializeScrubbed(record: BugReportRecord, secrets: readonly string[]): string | null {
  const json = JSON.stringify(record, null, 2);
  const scrubbed = redactKnownSecrets(json, secrets);
  return secretRedactionLiterals(secrets).some((literal) => scrubbed.includes(literal)) ? null : scrubbed;
}

/** The log ring's ERROR lines inside the window. Pino stamps `time` (epoch ms) on every line, which is the one
 *  wall clock the client's window can be compared against. */
function errorLines(window: EvidenceWindow): EvidenceSlice<Record<string, unknown>> {
  const records = logRing
    .recent(RING_READ_DEPTH)
    .map(parseLogRingLine)
    .filter((record): record is Record<string, unknown> => record !== null)
    .filter((record) => ringLineLevel(record) >= ERROR_LEVEL);
  return sliceByWindow({
    source: "logRing(errors)",
    entries: records,
    at: ringLineTime,
    window,
    cap: RING_READ_DEPTH,
  });
}

/** Snapshot every server-side flight recorder into the window. Called synchronously at report time — the whole
 *  reason this half exists (the rings die on the next respawn). */
export function snapshotServerEvidence(window: EvidenceWindow, inspectors: BugReportInspectors = {}): BugReportRecord["server"] {
  const slices: Record<string, EvidenceSlice<unknown>> = {
    errors: errorLines(window),
    requests: sliceByWindow({
      source: "requests",
      entries: recentRequests(RING_READ_DEPTH),
      at: (record) => record.at,
      window,
      cap: RING_READ_DEPTH,
    }),
    traces: sliceByWindow({
      source: "traces",
      entries: recentTraces(RING_READ_DEPTH).map((trace) => ({
        requestId: trace.requestId,
        startedAt: trace.startedAt,
        durationMs: trace.durationMs,
        rootName: trace.rootName,
        status: trace.status,
        totals: trace.totals,
      })),
      at: (trace) => trace.startedAt,
      window,
      cap: RING_READ_DEPTH,
    }),
    wireCaptures: sliceByWindow({
      source: "wire/captures",
      entries: recentWireCaptures({ limit: RING_READ_DEPTH }),
      at: (capture) => capture.at,
      window,
      cap: RING_READ_DEPTH,
    }),
    wireOutcomes: sliceByWindow({
      source: "wire/outcomes",
      entries: recentTurnOutcomes({ limit: RING_READ_DEPTH }),
      at: (outcome) => outcome.at,
      window,
      cap: RING_READ_DEPTH,
    }),
  };
  // The two INJECTED recorders. An absent port is a real answer — the recorder is not wired (RPG_TRACE=off, or
  // a purged domain) — so the source row is present with `held: 0` and a reason, never a silent omission that
  // reads as "nothing happened".
  slices["rpgTraces"] = recorderSlice("rpg/traces", inspectors.rpgTrace, window);
  slices["memoryRecalls"] = recorderSlice("memory/recalls", inspectors.memoryRecall, window);
  const named = Object.entries(slices);
  return {
    sources: named.map(([, slice]) => slice.meta),
    evidence: Object.fromEntries(named.map(([name, slice]) => [name, slice.entries])),
    wireCaptureEnabled: isWireCaptureEnabled(),
  };
}

/** One injected flight recorder, or an explicit "the port was not wired" row. */
function recorderSlice(
  source: string,
  port: { readonly recent: (filter: { limit?: number }) => readonly object[] } | undefined,
  window: EvidenceWindow,
): EvidenceSlice<unknown> {
  if (port === undefined) {
    return {
      entries: [],
      meta: {
        source,
        windowFilterable: false,
        reason: "the recorder port is not wired in this process — tracing is off, not quiet",
        cap: null,
        held: 0,
        kept: 0,
        truncatedAt: null,
      },
    };
  }
  return sliceByWindow({
    source,
    entries: port.recent({ limit: RING_READ_DEPTH }),
    at: (record) => (typeof (record as { at?: unknown }).at === "number" ? (record as { at: number }).at : 0),
    window,
    cap: RING_READ_DEPTH,
  });
}

/** The owner's note as the markdown companion — the half a human reads first, pointing at the JSON for the
 *  rest. Deliberately tiny: the bundle is the evidence, this is the index card. */
function noteMarkdown(record: BugReportRecord, stem: string): string {
  const build =
    record.build.sha === null ? "unknown (git could not answer)" : `${record.build.sha}${record.build.dirty ? " (DIRTY WORKING TREE — not this commit)" : ""}`;
  const asked =
    record.window.requestedMinutes === null
      ? "no time window given"
      : `~${record.window.requestedMinutes} min before the click (padded ${record.window.padMs}ms)`;
  const truncated = [...record.server.sources].filter((meta) => meta.truncatedAt !== null);
  return [
    `# Bug report ${record.id}`,
    "",
    // FIRST, ahead of the capture instant: the triager's opening question is "what is this box", and the
    // answer has to survive being pasted into a GitHub issue on its own.
    `- version: ${formatVersionIdentity(record.version)}`,
    `- captured: ${record.capturedAt}`,
    `- build: ${build}`,
    `- asked for: ${asked}`,
    `- evidence: \`${stem}.json\``,
    truncated.length === 0
      ? ""
      : `- TRUNCATED sources (the ring did not reach the whole ask): ${truncated.map((meta) => `${meta.source} from ${new Date(meta.truncatedAt ?? 0).toISOString()}`).join(", ")}`,
    "",
    "## What happened",
    "",
    record.note,
    "",
    // THE ARTIFACT NAMES ITS OWN READER (#1184). These files are gitignored, so nothing on the tree points at
    // them and a cold investigator who stumbles on one has no way to find its siblings. One line here is the
    // cheapest of the three discoverability homes and the only one that travels WITH the evidence.
    "---",
    "",
    "Every report in this directory: `pnpm bug:reports` · this one: `pnpm bug:reports " + record.id.slice(0, ID_PREFIX_HINT) + "`",
    "",
  ]
    .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
    .join("\n");
}

/** Write ONE report: the scrubbed JSON bundle + the note as markdown, both stemmed `<timestamp>-<id>`.
 *  Returns the written paths, or `null` when the scrub could not guarantee secret removal (see the header). */
export async function writeBugReport(args: {
  readonly repoRoot: string;
  readonly record: BugReportRecord;
  readonly secrets: readonly string[];
}): Promise<{ readonly json: string; readonly markdown: string } | null> {
  const json = serializeScrubbed(args.record, args.secrets);
  if (json === null) {
    return null;
  }
  const stem = bugReportStem(new Date(args.record.capturedAt), args.record.id);
  const dir = join(args.repoRoot, BUG_REPORT_DIR);
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, `${stem}.json`);
  const markdownPath = join(dir, `${stem}.md`);
  await writeFile(jsonPath, `${json}\n`, "utf8");
  await writeFile(markdownPath, redactKnownSecrets(noteMarkdown(args.record, stem), args.secrets), "utf8");
  return { json: jsonPath, markdown: markdownPath };
}

/** Mint the correlation id a report is filed under (`gh issue` evidence links quote it). */
export function mintBugReportId(): string {
  return randomUUID();
}

/** The capture instant, as epoch ms.
 *
 *  `performance.timeOrigin + performance.now()` rather than `Date.now()` — the house spelling for a wall-clock
 *  stamp in an instrument (`client/src/lib/bus-devlog.ts`'s `clockMs`, and the console-error ring this bundle
 *  reads). It is not a dodge of the injected-clock law: that law governs app LOGIC, whose behaviour must be
 *  reproducible, while this is the physical instant a capture happened — and the client's own rings stamp
 *  themselves with the same expression, so a report whose two halves used different clocks would compare
 *  windows that do not mean the same thing. */
export function captureNowMs(): number {
  return performance.timeOrigin + performance.now();
}
