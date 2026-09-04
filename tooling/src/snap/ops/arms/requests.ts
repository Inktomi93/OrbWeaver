// `--requests` / `--request-body` reads the daemon-owned request ring. The lifetime recorder is installed
// by `launchSnapSession` before any navigation; this arm never adds a listener and therefore cannot miss
// named-session boot traffic or grow listener counts across calls.
import { writeFile } from "node:fs/promises";
import type { InstrumentArtifactLimitReceipt } from "../../../_shared/artifact-out.ts";
import { artifactFile } from "../../../_shared/artifact-out.ts";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmRunInstance } from "../../contract/arms.ts";
import type { RequestBodyOutcome, RequestLogEntry, RequestLogReceipt } from "../../contract/request-log.ts";
import { redactEvidenceText } from "../../lib/browser-evidence-redaction.ts";
import { redactNetworkUrl } from "../../lib/har-redaction.ts";
import { filterRequests, requestLogLines } from "../../lib/request-log.ts";
import { consumeOptionalSelector } from "../flags-support.ts";
import type { RequestRing, RequestRingRead } from "../request-ring.ts";
import { requestRingFor } from "../request-ring.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --requests");

function diskSafeEntry(entry: RequestLogEntry): RequestLogEntry {
  return {
    ...entry,
    method: redactEvidenceText(entry.method).text,
    url: redactNetworkUrl(entry.url).url,
    resourceType: redactEvidenceText(entry.resourceType).text,
    failed: entry.failed === null ? null : redactEvidenceText(entry.failed).text,
  };
}

function diskSafeRequestBody(body: RequestBodyOutcome | null): RequestBodyOutcome | null {
  if (body === null) {
    return null;
  }
  if (body.kind === "captured") {
    return { ...body, url: redactNetworkUrl(body.url).url, text: redactEvidenceText(body.text).text };
  }
  if (body.kind === "not-retained") {
    return { ...body, url: redactNetworkUrl(body.url).url, contentType: body.contentType === null ? null : redactEvidenceText(body.contentType).text };
  }
  if (body.kind === "error") {
    return {
      ...body,
      filter: redactEvidenceText(body.filter).text,
      url: redactNetworkUrl(body.url).url,
      reason: redactEvidenceText(body.reason).text,
    };
  }
  return { ...body, filter: redactEvidenceText(body.filter).text };
}

function requestArtifactLimits(read: RequestRingRead): readonly InstrumentArtifactLimitReceipt[] {
  const ring: InstrumentArtifactLimitReceipt = {
    source: "request-ring",
    complete: read.window.evicted === 0,
    policy: { capacity: read.ring.capacity },
    events: [
      {
        kind: "ring-window",
        path: "$.requests",
        original: read.total,
        retained: read.entries.length,
        omitted: read.window.evicted,
      },
    ],
  };
  const body = read.body;
  if (body === null) {
    return [ring];
  }
  const captured = body.kind === "captured";
  const noMatch = body.kind === "no-match";
  const bytes = body.kind === "captured" || body.kind === "not-retained" ? body.bytes : null;
  return [
    ring,
    {
      source: "request-body-retention",
      complete: captured || noMatch,
      policy: { bodyCapBytes: read.ring.bodyCapBytes, bodyBudgetBytes: read.ring.bodyBudgetBytes },
      events: [
        {
          kind: body.kind,
          path: "$.body",
          original: noMatch ? 0 : bytes,
          retained: captured ? bytes : 0,
          omitted: captured || noMatch ? 0 : bytes,
        },
      ],
    },
  ];
}

async function finishRequestLog(ring: RequestRing, start: number, opts: ArmArgs, name: string): Promise<RequestLogReceipt> {
  const read = await ring.read(start, opts.requestBody);
  const entries = read.entries.map(diskSafeEntry);
  const filter = opts.requestsFilter;
  const body = diskSafeRequestBody(read.body);
  const shown = filterRequests(entries, filter);
  const jsonPath = await artifactFile("requests", name, ".json", {
    producer: "requests",
    producerArm: "requests",
    channel: "request-log",
    mediaType: "application/json",
    schema: "snap-request-log-v1",
    role: "primary",
    completeness: "bounded",
    completenessDetail: "bounded request-ring snapshot at a fixed end cursor; evictions, unfinished metadata, and body retention remain explicit",
    scope: aggregateScope(),
    records: entries.length,
    limits: requestArtifactLimits(read),
  });
  const receipt: RequestLogReceipt = { total: read.total, filter, shown, body, window: read.window, ring: read.ring, jsonPath };
  await writeFile(
    jsonPath,
    `${JSON.stringify({ total: receipt.total, filter, window: receipt.window, ring: receipt.ring, requests: entries, body }, null, 2)}\n`,
  );
  for (const line of requestLogLines(receipt)) {
    print(line);
  }
  return receipt;
}

function requestBodyLabel(body: RequestBodyOutcome | null): string {
  if (body === null) {
    return "off";
  }
  if (body.kind === "captured") {
    return `${body.bytes}b`;
  }
  return body.kind === "not-retained" ? body.reason : body.kind;
}

export const REQUESTS_ARM = {
  flags: [
    {
      flag: "--requests",
      kind: "optional-value",
      pageTargetable: false,
      group: "Measure",
      summary: "the ordered request log from the 4096-entry ring (an argument narrows PRINTED rows only)",
      handler: (a, rest): void => {
        a.requests = true;
        a.requestsFilter = consumeOptionalSelector(rest) ?? a.requestsFilter;
      },
    },
    {
      flag: "--request-body",
      kind: "required-value",
      pageTargetable: false,
      group: "Measure",
      summary: "one matching JSON response body, retained whole up to 256 KiB (implies --requests)",
      handler: (a, rest): void => {
        a.requestBody = rest.shift() ?? null;
        a.requests = true;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "requests" | "requestsFilter" | "requestBody"> => ({ requests: false, requestsFilter: null, requestBody: null }),
  help: `  --requests [url-substring]
                          the ORDERED checkpoint-window log from the session's 4096-entry request ring —
                          method, url, status, resource type, available Playwright sizes()/timing —
                          printed and written promptly. The optional value narrows PRINTED rows only.
  --request-body <url-substring>
                          one matching application/json response body, retained whole up to 256 KiB
                          within the session's 32 MiB body budget. Implies --requests.`,
  result: {
    schema: "snap-arm-requests-v1",
    source: "browser request evidence ring",
    lifetime: "session boot through checkpoint window",
    enabled: (opts): boolean => opts.requests,
  },
  lifecycle: {
    at: "run",
    begin: (session, opts): ArmRunInstance<"requests"> => {
      const ring = requestRingFor(session);
      const stopBodyCapture = opts.requestBody === null ? (): void => undefined : ring.beginBodyCapture(opts.requestBody);
      let start = ring.checkpoint();
      let checkpointMarked = false;
      let log: RequestLogReceipt | null = null;
      return {
        prepare: (): Promise<void> => Promise.resolve(),
        afterNavigation: (): Promise<void> => {
          if (opts.checkpoint && !checkpointMarked) {
            start = ring.markCheckpoint();
            checkpointMarked = true;
          }
          return Promise.resolve();
        },
        beforeAction: (): Promise<null> => Promise.resolve(null),
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: (): Promise<void> => Promise.resolve(),
        measure: (): Promise<void> => {
          stopBodyCapture();
          return Promise.resolve();
        },
        report: async (ctx): Promise<void> => {
          try {
            if (opts.requests) {
              log = await finishRequestLog(ring, start, ctx.opts, ctx.name);
            }
          } finally {
            stopBodyCapture();
          }
        },
        failures: (): ArmFailureCounts => ({}),
        denominators: () => (log === null ? {} : { requests: { value: log.total, refuseWhen: "zero" as const } }),
        pairs: (): readonly ResultPair[] =>
          log === null
            ? []
            : [
                ["requests-shown", log.shown.length],
                ["requests-evicted", log.window.evicted],
                ["request-body", requestBodyLabel(log.body)],
              ],
        facts: (): readonly ArmFactEmission<"requests">[] => {
          let state: "off" | "refused" | "passed" = "off";
          if (opts.requests) {
            state = log === null ? "refused" : "passed";
          }
          return [
            {
              scope: aggregateScope(),
              data: {
                state,
                detail: opts.requests && log === null ? "request evidence was requested but no receipt completed" : null,
                recorded: log?.total ?? 0,
                shown: log?.shown.length ?? 0,
                evicted: log?.window.evicted ?? 0,
                artifact: null,
              },
            },
          ];
        },
        exit: (code: number): number => code,
      };
    },
  },
} satisfies ArmDef<"requests">;
