// Session-lifetime failure evidence. Playwright tracing is rotated without closing the browser; the HAR
// snapshots the existing per-page CDP Network collector, so export adds no browser or capture path.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { artifactFilePath } from "../../_shared/artifact-naming.ts";
import type { InstrumentArtifactMetadata } from "../../_shared/artifact-out.ts";
import { artifactDir, artifactFile, beginInstrumentRun, finishInstrumentRun, registerInstrumentArtifact } from "../../_shared/artifact-out.ts";
import { aggregateDimension, aggregateScope, exactDimension, contextIndex as mintContextIndex, scopeV1 } from "../../_shared/artifact-scope.ts";
import { print } from "../../_shared/artifacts.ts";
import { browserEvidenceRetention } from "../../_shared/browser-capture.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { loadResultPairs } from "../../_shared/load-budget.ts";
import type { RequestLogEntry } from "../contract/request-log.ts";
import type { SessionRow } from "../contract/session.ts";
import { redactBrowserDiagnostics, redactBrowserPageError, redactCapturedConsole, redactEvidenceText } from "../lib/browser-evidence-redaction.ts";
import { redactNetworkUrl } from "../lib/har-redaction.ts";
import { writeNetworkHar } from "../lib/network-har.ts";
import { networkHarReceipt } from "../lib/network-har-receipt.ts";
import { requestRingFor } from "./request-ring.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --session <name> --session-export <route>");

const TRACE_INDEX_WIDTH = 3;

export interface SessionEvidenceState {
  readonly enabled: boolean;
  readonly dir: string;
  readonly name: string;
  traceIndex: number;
  readonly traces: string[];
  readonly hars: string[];
}

export function sessionEvidenceState(slotDir: string, name: string, enabled: boolean): SessionEvidenceState {
  return { enabled, dir: join(slotDir, "sessions", name), name, traceIndex: 0, traces: [], hars: [] };
}

export async function retainSessionEvidence(state: SessionEvidenceState, session: ProbeSession): Promise<void> {
  if (!state.enabled) {
    return;
  }
  await mkdir(state.dir, { recursive: true });
  const tracePaths = await Promise.all(
    session.contexts.map(async ({ context }, contextIndex) => {
      const suffix = session.contexts.length === 1 ? "" : `-u${contextIndex}`;
      const path = join(state.dir, `trace-${String(state.traceIndex).padStart(TRACE_INDEX_WIDTH, "0")}${suffix}.zip`);
      await context.tracing.stop({ path });
      await registerInstrumentArtifact("sessions", path, {
        producer: "sessions",
        producerArm: null,
        channel: "playwright-trace",
        mediaType: "application/zip",
        schema: "playwright-trace",
        role: "raw-fallback",
        completeness: "complete",
        completenessDetail: "complete Playwright trace for human/deep forensics; not primary agent evidence",
        scope: scopeV1({ context: exactDimension(mintContextIndex(contextIndex)), page: aggregateDimension(), window: aggregateDimension() }),
        records: null,
        limits: [],
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      return path;
    }),
  );
  state.traceIndex += 1;
  state.traces.push(...tracePaths);
  const harPath = join(state.dir, "session.har");
  const receipt = await writeNetworkHar(session, harPath);
  const bounded = receipt.limits.some((limit) => !limit.complete);
  await registerInstrumentArtifact("sessions", harPath, {
    producer: "sessions",
    producerArm: null,
    channel: "har",
    mediaType: "application/json",
    schema: "har-1.2",
    role: "primary",
    completeness: bounded ? "bounded" : "complete",
    completenessDetail: bounded ? "complete request population with bounded body/redaction fields" : "complete captured request population",
    scope: aggregateScope(),
    records: receipt.entries,
    limits: receipt.limits,
  });
  if (!state.hars.includes(harPath)) {
    state.hars.push(harPath);
  }
}

async function exportedEvidenceMetadata(source: string, target: string): Promise<InstrumentArtifactMetadata> {
  if (source.endsWith(".har")) {
    const receipt = networkHarReceipt(JSON.parse(await readFile(target, "utf8")));
    const bounded = receipt.limits.some((limit) => !limit.complete);
    return {
      producer: "sessions",
      producerArm: null,
      channel: "har",
      mediaType: "application/json",
      schema: "har-1.2",
      role: "primary",
      completeness: bounded ? "bounded" : "complete",
      completenessDetail: bounded ? "complete request population with bounded body/redaction fields" : "complete captured request population",
      scope: aggregateScope(),
      records: receipt.entries,
      limits: receipt.limits,
    };
  }
  const contextMatch = /-u(?<context>\d+)\.zip$/u.exec(source);
  return {
    producer: "sessions",
    producerArm: null,
    channel: "playwright-trace",
    mediaType: "application/zip",
    schema: "playwright-trace",
    role: "raw-fallback",
    completeness: "complete",
    completenessDetail: "complete Playwright trace for human/deep forensics; not primary agent evidence",
    scope: scopeV1({
      context: exactDimension(mintContextIndex(contextMatch?.groups?.["context"] === undefined ? 0 : Number(contextMatch.groups["context"]))),
      page: aggregateDimension(),
      window: aggregateDimension(),
    }),
    records: null,
    limits: [],
  };
}

async function exportSessionEvidence(state: SessionEvidenceState, destination: string): Promise<readonly string[]> {
  const copied: string[] = [];
  for (const source of [...state.traces, ...state.hars]) {
    const target = join(destination, basename(source));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    await registerInstrumentArtifact("sessions", target, await exportedEvidenceMetadata(source, target));
    copied.push(target);
  }
  return copied;
}

interface SessionRingExport {
  readonly root: string;
  readonly slotDir: string;
  readonly name: string;
  readonly out: string | null;
  readonly row: SessionRow;
  readonly session: ProbeSession;
}

function redactRequestEntry(entry: RequestLogEntry): RequestLogEntry {
  return {
    ...entry,
    method: redactEvidenceText(entry.method).text,
    url: redactNetworkUrl(entry.url).url,
    resourceType: redactEvidenceText(entry.resourceType).text,
    failed: entry.failed === null ? null : redactEvidenceText(entry.failed).text,
  };
}

interface SessionJsonMetadataArgs {
  readonly channel: string;
  readonly schema: string;
  readonly records: number;
  readonly completeness?: InstrumentArtifactMetadata["completeness"];
  readonly limits?: InstrumentArtifactMetadata["limits"];
}

function sessionJsonMetadata(input: SessionJsonMetadataArgs): InstrumentArtifactMetadata {
  const completeness = input.completeness ?? "complete";
  return {
    producer: "sessions",
    producerArm: null,
    channel: input.channel,
    mediaType: "application/json",
    schema: input.schema,
    role: "primary",
    completeness,
    completenessDetail:
      completeness === "complete"
        ? `complete ${input.channel} population for the session lifetime`
        : `bounded ${input.channel} population with structured limit receipts`,
    scope: aggregateScope(),
    records: input.records,
    limits: input.limits ?? [],
  };
}

export async function exportSessionRings(state: SessionEvidenceState, source: SessionRingExport): Promise<number> {
  beginInstrumentRun("snap", source.root, { slotDir: source.slotDir });
  try {
    await retainSessionEvidence(state, source.session);
    const diagnostics = redactBrowserDiagnostics(source.session.diagnostics);
    const retention = browserEvidenceRetention(source.session);
    const requestRead = await requestRingFor(source.session).read(0, null);
    const requests = requestRead.entries.map(redactRequestEntry);
    const diagnosticEvents =
      diagnostics._orbMeasuredLimit.events.length + diagnostics.records.reduce((sum, row) => sum + row._orbMeasuredLimit.events.length, 0);
    const requestLimitEvents = Math.max(requestRead.window.evicted, requestRead.ring.evicted);
    const retentionLimits = (channel: string): InstrumentArtifactMetadata["limits"] => retention.limits.filter((limit) => limit.source === channel);
    const files: readonly (readonly [string, unknown, InstrumentArtifactMetadata])[] = [
      ["session", source.row, sessionJsonMetadata({ channel: "session-provenance", schema: "snap-session-row-v1", records: 1 })],
      [
        "console",
        source.session.consoleMessages.map((entry) => redactCapturedConsole(entry)),
        sessionJsonMetadata({
          channel: "console",
          schema: "snap-session-console-v1",
          records: source.session.consoleMessages.length,
          completeness: retentionLimits("browser-console").length === 0 ? "complete" : "bounded",
          limits: retentionLimits("browser-console"),
        }),
      ],
      [
        "page-errors",
        source.session.pageErrors.map((entry) => redactBrowserPageError(entry)),
        sessionJsonMetadata({
          channel: "page-errors",
          schema: "snap-session-page-errors-v1",
          records: source.session.pageErrors.length,
          completeness: retentionLimits("browser-page-errors").length === 0 ? "complete" : "bounded",
          limits: retentionLimits("browser-page-errors"),
        }),
      ],
      [
        "diagnostics",
        diagnostics.records,
        sessionJsonMetadata({
          channel: "browser-diagnostics",
          schema: "snap-session-diagnostics-v1",
          records: diagnostics.records.length,
          completeness: diagnosticEvents === 0 && retentionLimits("browser-diagnostics").length === 0 ? "complete" : "bounded",
          limits: [
            {
              source: "browser-diagnostics-redaction",
              complete: diagnosticEvents === 0,
              policy: { ...diagnostics._orbMeasuredLimit.policy },
              events: [diagnostics._orbMeasuredLimit, ...diagnostics.records.map((row) => row._orbMeasuredLimit)].flatMap((receipt) => receipt.events),
            },
            ...retentionLimits("browser-diagnostics"),
          ],
        }),
      ],
      [
        "diagnostics-redaction",
        diagnostics._orbMeasuredLimit,
        sessionJsonMetadata({
          channel: "diagnostic-redaction",
          schema: "orb-measured-limit-v1",
          records: diagnostics._orbMeasuredLimit.events.length,
        }),
      ],
      [
        "diagnostic-completeness",
        source.session.diagnosticCompleteness,
        sessionJsonMetadata({
          channel: "diagnostic-completeness",
          schema: "orb-console-completeness-v1",
          records: source.session.diagnosticCompleteness.length,
          completeness: retentionLimits("browser-diagnostic-completeness").length === 0 ? "complete" : "bounded",
          limits: retentionLimits("browser-diagnostic-completeness"),
        }),
      ],
      [
        "browser-retention",
        retention,
        sessionJsonMetadata({
          channel: "browser-retention",
          schema: "snap-browser-retention-v1",
          records: retention.rows.length,
          completeness: retention.limits.length === 0 ? "complete" : "bounded",
          limits: retention.limits,
        }),
      ],
      [
        "requests",
        requests,
        sessionJsonMetadata({
          channel: "requests",
          schema: "snap-session-requests-v1",
          records: requests.length,
          completeness: requestLimitEvents === 0 ? "complete" : "bounded",
          limits: [
            {
              source: "request-ring",
              complete: requestLimitEvents === 0,
              policy: { capacity: requestRead.ring.capacity },
              events:
                requestLimitEvents === 0
                  ? []
                  : [
                      {
                        kind: "ring-eviction",
                        path: "$.requests",
                        original: requestRead.total,
                        retained: requestRead.entries.length,
                        omitted: requestRead.window.evicted,
                      },
                    ],
            },
          ],
        }),
      ],
    ];
    const destination = source.out ?? source.name;
    for (const [kind, payload, metadata] of files) {
      const path = await artifactFile("sessions", `${destination}/${kind}`, ".json", metadata);
      await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
      print(`exported     ${path}`);
    }
    const evidenceDir = await artifactDir("sessions");
    const evidence = await exportSessionEvidence(state, artifactFilePath(evidenceDir, destination, ""));
    for (const path of evidence) {
      print(`exported     ${path}`);
    }
    return printVerdict("snap-session-export", {
      verdict: EXIT.clean,
      denominators: {
        files: { value: files.length + evidence.length, refuseWhen: "zero" },
        console: { value: source.session.consoleMessages.length, refuseWhen: "zero", honestEmpty: "the session logged no console message" },
        "page-errors": { value: source.session.pageErrors.length, refuseWhen: "zero", honestEmpty: "the session raised no page error" },
        requests: {
          value: requests.length,
          refuseWhen: "zero",
          honestEmpty: "the session issued no request (an --eval-only drive over a --file fixture)",
        },
      },
      pairs: [["name", source.name], ["out", destination], ...loadResultPairs()],
    });
  } finally {
    finishInstrumentRun();
  }
}
