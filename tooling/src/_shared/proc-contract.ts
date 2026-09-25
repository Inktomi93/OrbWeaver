// THE SUBPROCESS DOORS' OPTION + RESULT SHAPES, split out of ./proc.ts when that module crossed the
// 450-line cap (#2242, after #2211 widened the capture ceiling onto a second door).
//
// WHY THE SHAPES AND NOT A DOOR. `tooling-child-process-door` makes `tooling/src/_shared/proc.ts` the ONE
// module allowed to import `node:child_process`, and it resolves the two FULL-PRIORITY doors by DECLARATION
// against that exact path (`lib/project-home-origin.ts`), licensed by an exact reviewed grant
// `(tooling/src/_shared/proc.ts, child-process-import)`. Moving any spawning code to a sibling would put a
// second child_process import on the tree and give the home locator two candidate declarations of one door —
// so what moves is the part that spawns NOTHING. These are pure type declarations: no import of
// child_process, no runtime.
//
// IMPORTERS KEEP THEIR SPELLING: ./proc.ts re-exports every name below, the same door discipline
// `_shared/artifacts.ts` already uses for `PrunedRun`. The precedent for splitting THIS file is its own
// header — the ambient-env door moved to ./process-env.ts at this same cap in #1848.
export interface SpawnNicedOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Wall-clock ceiling; on expiry the child gets SIGKILL and `timedOut` is true. */
  readonly timeoutMs?: number;
}

export interface SpawnNicedResult {
  /** null = killed by signal (incl. the timeout kill). */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/** THE CAPTURE CEILING, stated ONCE for every capturing door in the subprocess home (#2211, #2212).
 *
 *  Raise node's ~1MiB capture ceiling. `spawnSync`/`execFileSync` do NOT truncate at the ceiling, they
 *  TERMINATE the child (SIGTERM + ENOBUFS) — so a caller whose payload is genuinely large (ts7
 *  `--listFilesOnly` over the whole graph is ~5,400 paths / ~0.5MB; ESLint discovery is the whole admitted
 *  filename population) must raise it or its verdict silently becomes a KILL.
 *
 *  IT IS SHARED BECAUSE THE PROSE ALONE DID NOT TRAVEL. This warning lived on `runNicedSync` for months and
 *  was correct the whole time, while `execNicedSync` three functions down took no `maxBuffer` at all; the
 *  ESLint discovery door outgrew 1MiB behind that gap and the whole-repo lint tier became unobtainable
 *  (#2211). A hazard documented per-door is a hazard the next door does not inherit — so the option and its
 *  warning are one declaration that both doors take, and the executing half of the guarantee lives with the
 *  caller whose payload is large (`ops/eslint.ts#readDiscoveredPopulation` refuses by name and is pinned by a
 *  planted tiny-ceiling control). */
export interface CaptureCeilingOption {
  readonly maxBuffer?: number;
}

export interface RunNicedSyncOptions extends CaptureCeilingOption {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** "collect" (default) captures utf8 stdout/stderr; "inherit" streams to the operator's terminal
   *  (the stack-boot / rsync shape); "ignore" discards. */
  readonly stdio?: "collect" | "inherit" | "ignore";
  /** Wall-clock ceiling in ms; the child is killed past it (`status` comes back null). A caller whose
   *  child can hang — a planted mutant that turns a loop infinite is the standing case — MUST set this,
   *  or the run never returns a verdict at all. */
  readonly timeout?: number;
}

export interface RunNicedSyncResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** THE DISCRIMINATOR FOR A `status: null` (#2284). `spawnSync` reports a failure of the SPAWN — as opposed
   *  to a child that ran and exited — on its `error` field, and this door used to drop it, leaving `null` to
   *  mean four different things a caller could not tell apart: the capture ceiling killed the child
   *  (`ENOBUFS`, and `execFileSync`'s sibling THROWS this where `spawnSync` does not), the wall-clock
   *  `timeout` killed it (`ETIMEDOUT`), the binary is missing (`ENOENT`), or the child was signalled. Every
   *  caller that hit one of the first three then blamed the COMMAND for a ceiling the CALLER set: the
   *  since-removed ledger-claims barrier verb's refusal printed *"git log … failed (status null)"* at 1,457,840 bytes of log, which
   *  is a sentence about git and was a sentence about a 1 MiB default. `undefined` means the child really did
   *  run — read `status` — so the field costs an existing caller nothing. */
  readonly errorCode?: string;
}

export interface FullPriorityChildOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Append the child's stdout+stderr here. The parent opens the fd and closes its own copy immediately —
   *  the child keeps its dups, so a detached child's logs keep flowing after the launcher exits, and the
   *  launcher never leaks one fd per spawn. */
  readonly logPath?: string;
  /** node-level `detached` (setsid before exec). Leave false when the ARGV itself starts with `setsid`. */
  readonly detached?: boolean;
  /** `"inherit"` gives the child THIS terminal (the foreground-run shape). `"pipe-stdout"` keeps stderr on
   *  this terminal and hands stdout to the parent as {@link FullPriorityChild.stdout} (a log-formatting
   *  pipe). Both are mutually exclusive with logPath. */
  readonly stdio?: "inherit" | "pipe-stdout";
}

export interface ChildExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  /** Set when the spawn itself failed (ENOENT on the binary); `code`/`signal` are then null. */
  readonly error: Error | undefined;
}

export interface FullPriorityChild {
  readonly pid: number | undefined;
  /** The child's stdout under `stdio: "pipe-stdout"` or the default piped stdio; null when inherited or logged. */
  readonly stdout: NodeJS.ReadableStream | null;
  readonly hasExited: () => boolean;
  /** Drop the handle from the parent's event loop — without it an "exited" launcher lives exactly as long
   *  as its children (the 2026-08-03 immortal-launcher audit). */
  readonly unref: () => void;
  readonly kill: (signal: NodeJS.Signals) => void;
  readonly killGroup: (signal: NodeJS.Signals) => void;
  /** Resolve when the child exits (or fails to spawn) — the foreground shape, where the caller mirrors the
   *  child's status instead of detaching from it. */
  readonly wait: () => Promise<ChildExit>;
}

/** What a foreground launcher does with a stop signal it receives. `noteStop` runs on every platform; `kill` runs only
 *  where the launcher must deliver the signal itself (`forwardSignalsTo` in ./proc.ts). */
export interface StopSignalTarget {
  readonly noteStop: (signal: NodeJS.Signals) => void;
  readonly kill: (signal: NodeJS.Signals) => void;
}

export interface NicedChildOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Receives every stdout/stderr chunk (probe-fire forwards the child server's output to ITS stderr
   *  so boot failures stay visible while the parseable payload owns stdout). */
  readonly onOutput?: (chunk: Buffer) => void;
  /** Append the child's stdout+stderr here instead of piping them to THIS process — the DAEMON shape
   *  (snap's session daemon): a detached child that outlives its launcher must never hold a pipe to it,
   *  because its first write after the launcher exits is EPIPE. Mutually exclusive with `onOutput`; the
   *  parent's fd copy is closed at once (the `spawnFullPriorityChild` discipline). */
  readonly logPath?: string;
}

export interface NicedChild {
  readonly pid: number | undefined;
  /** Has the child already exited? A supervisor polling an endpoint must be able to tell "not up YET" from
   *  "died during boot" — without it, a crashed child burns the caller's whole boot timeout. */
  readonly hasExited: () => boolean;
  /** Signal the WHOLE process group — `detached:true` gives the child its own pgid, so this reaps the
   *  full tree (pnpm→node→server); signalling only the direct child orphans the real process. */
  readonly killGroup: (signal: NodeJS.Signals) => void;
  /** Drop the handle from the parent's event loop — node waits on a detached child until the parent
   *  `unref`s it, so a launcher that must EXIT before its daemon calls this. */
  readonly unref: () => void;
}

export interface TranscriptOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** REQUIRED wall-clock ceiling (#1508). This door had NO timeout at all — the promise settled only on
   *  `error`/`close`, so one wedged child hung the whole `pnpm verify` run forever with no verdict and no
   *  artifact. Required rather than defaulted: how long a stage may legitimately take is the CALLER's
   *  policy, and a default here would silently pick one for a caller that never considered it. */
  readonly timeoutMs: number;
  /** Called with every stdout/stderr chunk AS IT ARRIVES, tagged by stream, so a caller can mirror the
   *  child live (the verify runner's `--verbose`) without giving up the captured transcript. */
  readonly onChunk?: (chunk: string, stream: "stdout" | "stderr") => void;
  /** THE SECOND HALF OF EVERY KILL PATH, for a child whose descendants LEAVE THE GROUP: Playwright starts
   *  each browser in its own session, so the group kill alone leaves a timed-out CT stage's whole Chromium
   *  fleet running. The verify runner builds this from `_shared/run-marker.ts` (`runMarkerTranscriptTeardown`)
   *  over the lease it minted; the door itself knows no marker policy, which is what keeps the platform
   *  module (a `proc.ts` importer) reachable from `run-marker.ts` without an import cycle. A caller that
   *  sets nothing keeps the group-only behaviour. */
  readonly teardown?: TranscriptTeardown;
}

/** What the transcript door does beyond its own group kill — see {@link TranscriptOptions.teardown}. */
export interface TranscriptTeardown {
  /** Runs AFTER the timeout's group kill; the promise's line, when not null, closes the transcript, and the
   *  door waits for it so the transcript never resolves before it can say what was reaped. */
  readonly afterTimeoutKill: () => Promise<string | null>;
  /** Installs the operator-signal guard (Ctrl-C, SIGTERM, SIGHUP) around the live child, given the door's
   *  own group kill to run first. Disposed on every exit path. */
  readonly arm: (killGroup: () => void) => { readonly dispose: () => void };
}

export interface TranscriptResult {
  /** null = killed by signal — ALWAYS a tool error, never a verdict. */
  readonly code: number | null;
  /** stdout+stderr as ONE transcript in ARRIVAL order — so the TAIL of the transcript is the tail of the
   *  RUN. Whole-stream CONCATENATION (`stdout + stderr`) put the tail of STDERR last, which for a compound
   *  stage (vitest && playwright-ct) meant pnpm's banner and node warnings, while the real verdict sat
   *  mid-file — a CT failure read as a silent death for three diagnoses (#259, 2026-08-18). */
  readonly transcript: string;
}
