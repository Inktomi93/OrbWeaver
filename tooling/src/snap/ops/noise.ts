// Harness-induced noise, named and fenced OUT of the verdict but never dropped: the sandboxed-frame
// tracing error and vite's cold-stage dep-optimizer aborts. One partition, every snap path judges alike.
import type { CapturedConsole, CapturedRequest } from "../../_shared/browser.ts";

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
} {
  const failed: CapturedRequest[] = [];
  const viteChurn: CapturedRequest[] = [];
  for (const request of requests) {
    if (request.failed === null && (request.status ?? 0) < HTTP_ERROR_STATUS_MIN) {
      continue;
    }
    (isViteDepChurn(request) ? viteChurn : failed).push(request);
  }
  return { failed, viteChurn };
}

export function consoleFailureCounts(messages: readonly CapturedConsole[], strict: boolean): ConsoleFailureCounts {
  const errors = messages.filter((entry) => entry.type === "error" && !isSandboxTraceNoise(entry)).length;
  const warnings = strict ? messages.filter((entry) => entry.type === "warning").length : 0;
  return { errors, warnings };
}
