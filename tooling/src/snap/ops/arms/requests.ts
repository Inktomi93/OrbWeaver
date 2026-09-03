// `--requests` / `--request-body` — an ORDERED log of every request this run's pages issued, with the
// one response body the caller asked for (docs/design/1195-devtools-mcp-retirement.md §2 item 2).
//
// WIRED BEFORE NAVIGATION, ALWAYS. The recorder attaches to every page of every context at the moment
// the session is launched and before `capturePages` navigates — a listener added after `page.goto` is a
// log that silently starts in the middle, which is the exact failure mode `__orb.queries()` already has
// for this question (it censuses the cache that SURVIVED, not the reads that happened).
//
// DESIGNED TO BE LIFTED. `recordRequestsOn` takes one Playwright `Page` and a recorder; the session-wide
// wrapper below is three lines around it. A stateful snap-session substrate that owns its own pages
// records with the same call and reads the same `RequestLogEntry` rows.
import { writeFile } from "node:fs/promises";
import { errorMessage } from "@orb/kit/error-message";
import type { Page, Request } from "@playwright/test";
import { artifactFile } from "../../../_shared/artifact-out.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import type { ProbeSession } from "../../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFailureCounts, ArmNeeds, ArmRunInstance } from "../../contract/arms.ts";
import type { RequestBodyOutcome, RequestLogEntry, RequestLogReceipt } from "../../contract/request-log.ts";
import type { Args } from "../../contract/types.ts";
import { capBody, filterRequests, matchesRequestFilter, requestLogLines } from "../../lib/request-log.ts";
import { consumeOptionalSelector } from "../flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --requests");

/** Playwright's ResourceTiming reports `-1` for a phase that never happened; only a non-negative
 *  `responseEnd` is a duration. */
const TIMING_ABSENT = -1;

type MutableEntry = {
  -readonly [K in keyof RequestLogEntry]: RequestLogEntry[K];
};

export interface RequestLogRecorder {
  readonly entries: MutableEntry[];
  readonly byRequest: Map<Request, MutableEntry>;
  /** `--request-body <filter>`; null when only the log was asked for. */
  readonly bodyFilter: string | null;
  /** In-flight body reads. Awaited once at finish so a capture can never race the report. */
  readonly pending: Promise<void>[];
  body: RequestBodyOutcome | null;
}

function newRecorder(bodyFilter: string | null): RequestLogRecorder {
  return { entries: [], byRequest: new Map(), bodyFilter, pending: [], body: null };
}

async function readBodyInto(recorder: RequestLogRecorder, url: string, read: () => Promise<string>): Promise<void> {
  // @orb-gate-ignore caught-failure-ownership(empty:error): the failure IS the result — an unreadable body (a torn-down page, a redirect with no text) becomes the `error` arm of RequestBodyOutcome, which finishRequestLog prints as "the body could not be read: <reason>" and the RESULT line reports as `request-body=error`. Ends if that arm stops being printed.
  try {
    const capped = capBody(await read());
    recorder.body = { kind: "captured", url, bytes: capped.bytes, truncatedAt: capped.truncatedAt, text: capped.text };
  } catch (error) {
    recorder.body = { kind: "error", filter: recorder.bodyFilter ?? "", url, reason: errorMessage(error) };
  }
}

function captureBody(recorder: RequestLogRecorder, url: string, read: () => Promise<string>): void {
  recorder.pending.push(readBodyInto(recorder, url, read));
}

/** Wire ONE page. Exported for the substrate lift (and so a test can drive a bare page). */
export function recordRequestsOn(page: Page, recorder: RequestLogRecorder): void {
  page.on("request", (request) => {
    const entry: MutableEntry = {
      index: recorder.entries.length,
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      status: null,
      failed: null,
      sizeBytes: null,
      durationMs: null,
    };
    recorder.entries.push(entry);
    recorder.byRequest.set(request, entry);
  });
  page.on("response", (response) => {
    const entry = recorder.byRequest.get(response.request());
    if (entry !== undefined) {
      entry.status = response.status();
      const declared = Number(response.headers()["content-length"]);
      entry.sizeBytes = Number.isFinite(declared) ? declared : null;
    }
    const filter = recorder.bodyFilter;
    if (filter !== null && recorder.body === null && recorder.pending.length === 0 && matchesRequestFilter(response.url(), filter)) {
      captureBody(recorder, response.url(), async () => await response.text());
    }
  });
  page.on("requestfinished", (request) => {
    const entry = recorder.byRequest.get(request);
    const timing = request.timing();
    if (entry !== undefined && timing.responseEnd > TIMING_ABSENT) {
      entry.durationMs = Math.round(timing.responseEnd);
    }
  });
  page.on("requestfailed", (request) => {
    const entry = recorder.byRequest.get(request);
    if (entry !== undefined) {
      entry.failed = request.failure()?.errorText ?? "failed";
    }
  });
}

/** Attach to every page of every context of a launched session — before anything navigates. */
function attachRequestLog(session: ProbeSession, opts: Args): RequestLogRecorder {
  const recorder = newRecorder(opts.requestBody);
  for (const context of session.contexts) {
    for (const page of context.pages) {
      recordRequestsOn(page, recorder);
    }
  }
  return recorder;
}

/** Drain the body read, file the COMPLETE log in this run's slot, print the block, return the receipt. */
async function finishRequestLog(recorder: RequestLogRecorder, opts: Args, name: string): Promise<RequestLogReceipt> {
  await Promise.all(recorder.pending);
  const filter = opts.requestsFilter;
  const bodyFilter = recorder.bodyFilter;
  const body: RequestBodyOutcome | null = recorder.body ?? (bodyFilter === null ? null : { kind: "no-match", filter: bodyFilter });
  const shown = filterRequests(recorder.entries, filter);
  const jsonPath = await artifactFile("requests", name, ".json");
  const receipt: RequestLogReceipt = { total: recorder.entries.length, filter, shown, body, jsonPath };
  await writeFile(jsonPath, `${JSON.stringify({ total: receipt.total, filter, requests: recorder.entries, body }, null, 2)}\n`);
  for (const line of requestLogLines(receipt)) {
    print(line);
  }
  return receipt;
}

/** `request-body=` states WHICH body you got — off, the byte count, or the named non-capture arm. Never a
 *  bare number: a reader must not have to guess whether nothing printed means "no match" or "not asked". */
function requestBodyLabel(body: RequestBodyOutcome | null): string {
  if (body === null) {
    return "off";
  }
  if (body.kind !== "captured") {
    return body.kind;
  }
  return body.truncatedAt === null ? `${body.bytes}b` : `${body.bytes}b truncatedAt=${body.truncatedAt}`;
}

/** THE REQUEST-LOG ARM (#1199). The reason `ArmDef` carries an `at: "run"` lifecycle with a `begin` at
 *  all: this recorder MUST be wired before anything navigates, so the arm needs a mint that happens
 *  before the capture pass and state that survives to the report. A page-shaped `run(ctx)` could only ever
 *  attach after the first `goto`, which is a log that silently starts mid-stream. */
export const REQUESTS_ARM = {
  flags: [
    {
      flag: "--requests",
      kind: "optional-value",
      pageTargetable: false,
      handler: (a, rest): void => {
        a.requests = true;
        a.requestsFilter = consumeOptionalSelector(rest) ?? a.requestsFilter;
      },
    },
    {
      flag: "--request-body",
      kind: "required-value",
      pageTargetable: false,
      handler: (a, rest): void => {
        a.requestBody = rest.shift() ?? null;
        a.requests = true;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  defaults: (): Pick<ArmArgs, "requests" | "requestsFilter" | "requestBody"> => ({ requests: false, requestsFilter: null, requestBody: null }),
  help: `  --requests [url-substring]
                          the ORDERED log of every request this run's pages issued — method, url, status,
                          resource type, declared size, timing — printed and written into the run slot.
                          The optional value narrows what is PRINTED; the artifact is always complete and
                          the block states both counts. It is a plain case-insensitive URL SUBSTRING, not
                          a selector and not a regex.
  --request-body <url-substring>
                          one matching response body, capped and truncation-accounted (the block says
                          \`truncatedAt=<bytes>\` when it cut). Implies --requests.`,
  lifecycle: {
    at: "run",
    begin: (session, opts): ArmRunInstance => {
      const recorder: RequestLogRecorder | null = opts.requests ? attachRequestLog(session, opts) : null;
      let log: RequestLogReceipt | null = null;
      return {
        measure: (): Promise<void> => Promise.resolve(),
        report: async (ctx): Promise<void> => {
          if (recorder !== null) {
            log = await finishRequestLog(recorder, ctx.opts, ctx.name);
          }
        },
        failures: (): ArmFailureCounts => ({}),
        // A log that recorded NOTHING is an instrument failure — nothing was wired, or the pages issued
        // no request at all — never a clean sheet.
        denominators: () => (log === null ? {} : { requests: { value: log.total, refuseWhen: "zero" as const } }),
        pairs: (): readonly ResultPair[] =>
          log === null
            ? []
            : [
                ["requests-shown", log.shown.length],
                ["request-body", requestBodyLabel(log.body)],
              ],
        exit: (code: number): number => code,
      };
    },
  },
} satisfies ArmDef;
