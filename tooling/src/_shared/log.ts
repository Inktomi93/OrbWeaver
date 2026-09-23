// The output CHANNELS. `warn` is the stderr channel — stdout is reserved for tool PAYLOAD (artifacts.ts
// `print` / RESULT lines), so warnings/progress must never interleave with it (`tail -1` / `grep ^RESULT`
// parse stdout). `installOutputSink` is the ONE tee a stateful-session daemon installs around the request
// it is serving: every `print`/`warn` still reaches this
// process's own stdout/stderr (the daemon's log file) AND the sink, in order, so the client can print the
// stream verbatim and keep the RESULT line last on ITS stdout. One sink at a time — a daemon serves one
// request at a time, and a second install is a programming error, never a silent replacement.
import process from "node:process";

export interface OutputSink {
  readonly line: (s: string) => void;
  readonly warn: (s: string) => void;
}

let sink: OutputSink | null = null;

/** Install the tee; the returned release restores the bare channels. */
export function installOutputSink(next: OutputSink): () => void {
  if (sink !== null) {
    throw new Error("INSTRUMENT ERROR: an output sink is already installed — one request at a time per process");
  }
  sink = next;
  return (): void => {
    sink = null;
  };
}

/** The stdout channel's tee — artifacts.ts `print` is its one caller (that module owns the RESULT-line
 *  contract; this one only routes bytes). */
export function emitLine(s: string): void {
  sink?.line(s);
  process.stdout.write(`${s}\n`);
}

export function warn(s: string): void {
  sink?.warn(s);
  process.stderr.write(`${s}\n`);
}
