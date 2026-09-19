// Harness-induced noise, named and fenced OUT of the verdict but never dropped: the sandboxed-frame
// tracing error, vite's cold-stage dep-optimizer aborts, and the file:// unique-origin note a CDP
// attach provokes. One partition, every snap path judges alike.
import type { CapturedConsole, CapturedRequest } from "../../_shared/browser-capture.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { isDevToolsFrontendProtocolNoise } from "../lib/devtools-frontend-noise.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const HTTP_ERROR_STATUS_MIN = 400;

export interface ConsoleFailureCounts {
  readonly errors: number;
  readonly warnings: number;
}

/** HARNESS-INDUCED console error, not the app's (measured 2026-08-15, three-arm probe): Playwright
 *  TRACING — snap's default failure-evidence — injects its snapshot script into EVERY frame, and the
 *  app's script-dead sandboxed card frames block it with exactly this line. Without tracing the error never
 *  fires; a real browser never shows it. It is therefore excluded from the console-error VERDICT (it
 *  false-redded every card-bearing room) but never dropped: the report still prints these lines, the JSON
 *  manifest keeps them, and the RESULT line counts them under `sandbox-trace-noise`.
 *
 *  SCOPE NARROWED 2026-08-16 (tier-B card-frame pass, #91): the ROUTED `/api/card-frame` document now
 *  carries `sandbox allow-scripts`, so it no longer trips the scripting-disabled gate this line reports —
 *  only the SRCDOC floor does. What the routed arm can produce instead is a CSP refusal
 *  ("…violates the following Content Security Policy directive 'script-src 'sha256-…''"), and that one is
 *  deliberately NOT suppressed: it is the app's real inline-script tripwire, and inside a card frame it is
 *  the load-bearing signal that a card-authored script was refused. A card that ships a `<script>` should
 *  cost one visible console line, not silence. */
export const SANDBOX_TRACE_NOISE_RE =
  /^Blocked script execution in '[^']*' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\./u;
const CONSOLE_TYPE_PREFIX_RE = /^\[error\]\s*/u;

export function isSandboxTraceNoise(entry: CapturedConsole): boolean {
  return entry.type === "error" && SANDBOX_TRACE_NOISE_RE.test(entry.line.replace(CONSOLE_TYPE_PREFIX_RE, ""));
}

/** HARNESS-INDUCED failed request, not the app's (issue #148 item 3): on a COLD vite server the first page
 *  load discovers dependencies, re-bundles them, and ABORTS the in-flight `/node_modules/.vite/deps/*.js`
 *  requests the page had already started — 3-4 `net::ERR_ABORTED` on the first call after
 *  `--isolated --fresh`, never on a warm stage. The browser re-requests every one of them and the page
 *  loads correctly; nothing is broken and nothing is missing.
 *
 *  So it is excluded from the failed-request VERDICT (it red-exited every first cold-stage snap, which is
 *  precisely the call a lane makes when it has nothing else to trust) but never dropped: the report prints
 *  these lines under their own heading, the JSON manifest keeps them in `viteDepChurn`, and the RESULT line
 *  counts them under `vite-dep-churn`.
 *
 *  NARROW BY CONSTRUCTION: an ABORT only, and only on the optimizer's own path. A 404/500 on a dep, or an
 *  abort anywhere else, stays a failure — those are real. */
const VITE_DEPS_PATH_RE = /\/(?:node_modules\/)?\.vite\/deps\//u;
const REQUEST_ABORTED = "net::ERR_ABORTED";

export function isViteDepChurn(request: CapturedRequest): boolean {
  return request.failed === REQUEST_ABORTED && (request.status ?? 0) < HTTP_ERROR_STATUS_MIN && VITE_DEPS_PATH_RE.test(request.url);
}

/** Split a context's requests into the ones that DECIDE the run and the vite-optimizer churn that only
 *  gets reported. One home, so every snap path (single, scenario, --contexts) judges identically. */
export function partitionFailedRequests(requests: Iterable<CapturedRequest>): {
  readonly failed: CapturedRequest[];
  readonly viteChurn: CapturedRequest[];
  readonly fileOrigin: CapturedRequest[];
} {
  const failed: CapturedRequest[] = [];
  const viteChurn: CapturedRequest[] = [];
  const fileOrigin: CapturedRequest[] = [];
  for (const request of requests) {
    if (request.failed === null && (request.status ?? 0) < HTTP_ERROR_STATUS_MIN) {
      continue;
    }
    if (isViteDepChurn(request)) {
      viteChurn.push(request);
    } else if (isFileOriginRequest(request)) {
      fileOrigin.push(request);
    } else {
      failed.push(request);
    }
  }
  return { failed, viteChurn, fileOrigin };
}

/** HARNESS-INDUCED again, and the one the design-audit fold surfaced (#1315). Chromium treats every
 *  `file://` document as its own opaque origin, and a CDP domain attach against one makes it log
 *  `Unsafe attempt to load URL <U> from frame with URL <U>` — where BOTH urls are the document itself —
 *  plus a matching request whose failure text is the bare `origin`. MEASURED 2026-09-04: a bare
 *  `pnpm snap --file mock.html` produces neither; adding `--design-audit` produces both, because the walk's
 *  forced-state pass opens a CDP session and enables the CSS domain (ui-audit/ops/hover.ts). Nothing was
 *  loaded, nothing is missing, and the page renders identically — but snap counts console errors and
 *  failed requests into its verdict, so every `--file` mock audit exited 1 on an artifact of the
 *  instrument's own attach.
 *
 *  THE TWO HALVES NARROW DIFFERENTLY, and #1538 corrected this comment, which claimed one rule for both.
 *  The CONSOLE half is the narrow one: the message's two URLs must be IDENTICAL (a mock genuinely loading
 *  a sibling `file:///other.png` names two different URLs and stays a failure) and the scheme must be
 *  `file:`. The REQUEST half has no second URL to compare — a `CapturedRequest` carries one — so it
 *  narrows on Chromium's exact failure text for this block (`origin`, never a code) plus the `file:`
 *  scheme, which does fence any `file://` request the browser blocks as cross-origin, not only the
 *  attach's own. That residue is deliberate and bounded: the class is only reachable under `--file` (an
 *  http page never produces it), and the failure it could mask does not occur — a mock whose sibling is
 *  genuinely absent fails `net::ERR_FILE_NOT_FOUND`, which stays a failure and reds the run. Never
 *  dropped, either half: the report prints these lines, the manifest keeps them, and the RESULT line
 *  counts them under `file-origin-noise`. */
const FILE_ORIGIN_NOISE_RE = /^Unsafe attempt to load URL (\S+) from frame with URL (\S+)\. 'file:' URLs are treated as unique security origins\.$/u;
const FILE_SCHEME = "file://";

export function isFileOriginNoise(entry: CapturedConsole): boolean {
  if (entry.type !== "error") {
    return false;
  }
  // The MESSAGE TEXT, not `line`: `wireProbePage` composes `line` as `[error] <text> (url:line:col)`, and
  // the browser's own text ends in a newline, so an anchored match against `line` never fires. The sandbox
  // twin above reads `line` because its match is anchored at the START only.
  const match = FILE_ORIGIN_NOISE_RE.exec(entry.text.trim());
  return match !== null && match[1] === match[2] && String(match[1]).startsWith(FILE_SCHEME);
}

/** The REQUEST half of the same browser event. `origin` is Chromium's own failure text for the block. */
const REQUEST_ORIGIN_BLOCKED = "origin";

export function isFileOriginRequest(request: CapturedRequest): boolean {
  return request.failed === REQUEST_ORIGIN_BLOCKED && request.url.startsWith(FILE_SCHEME);
}

/** The `file-origin-noise=` RESULT value: BOTH halves of the one browser event, counted together. Three
 *  hosts print this pair (run, scenario, contexts) and a per-host spelling is how two of them drift. */
export function fileOriginNoiseCount(messages: readonly CapturedConsole[], requests: readonly CapturedRequest[]): number {
  return messages.filter(isFileOriginNoise).length + requests.length;
}

/** HARNESS-INDUCED, AND THE ONE THE MATRIX PAYS ON EVERY CELL (#2431): the vendored DevTools frontend's own
 *  `Autofill` method-not-found pair. The recognizer and the whole reason it exists live in
 *  `lib/devtools-frontend-noise.ts`, on the bare (text, url) pair, because the FINDING row's disposition
 *  reader judges a different record shape and the two may not disagree. This is the `CapturedConsole` face
 *  of it — never dropped, exactly like its two neighbours above: printed, kept in the manifest, and counted
 *  on the RESULT line under `devtools-frontend-noise`. */
export function isDevToolsFrontendNoise(entry: CapturedConsole): boolean {
  return entry.type === "error" && isDevToolsFrontendProtocolNoise(entry.text, entry.location?.url);
}

/** THE console errors that DECIDE a verdict — every harness-induced class above fenced out. One home,
 *  so the scenario's per-checkpoint count and the run's summary cannot disagree about what an error is. */
export function verdictConsoleErrors(messages: readonly CapturedConsole[]): number {
  return messages.filter((entry) => entry.type === "error" && !isSandboxTraceNoise(entry) && !isFileOriginNoise(entry) && !isDevToolsFrontendNoise(entry))
    .length;
}

export function consoleFailureCounts(messages: readonly CapturedConsole[], strict: boolean): ConsoleFailureCounts {
  const errors = verdictConsoleErrors(messages);
  const warnings = strict ? messages.filter((entry) => entry.type === "warning").length : 0;
  return { errors, warnings };
}
