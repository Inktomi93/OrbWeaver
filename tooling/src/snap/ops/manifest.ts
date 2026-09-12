// The --json manifest: the lossless machine record beside the pixels (schemaVersion 1).
import { writeFile } from "node:fs/promises";
import type { AppearancePatch, SettingsShimEvidence } from "../../_shared/appearance.ts";
import type { Viewport } from "../../_shared/argv.ts";
import type { InstrumentArtifactLimitReceipt } from "../../_shared/artifact-out.ts";
import { artifactFile } from "../../_shared/artifact-out.ts";
import { aggregateScope } from "../../_shared/artifact-scope.ts";
import type { CapturedConsole, CapturedRequest } from "../../_shared/browser-capture.ts";
import type { BrowserPageError } from "../../_shared/browser-contract.ts";
import type { BrowserDiagnostic, OrbConsoleCompleteness } from "../../_shared/browser-diagnostics.ts";
import type { BrowserEnvironmentEvidence } from "../../_shared/browser-environment.ts";
import type { BrowserEvidenceRetentionBatch } from "../../_shared/browser-evidence-ring.ts";
import { BROWSER_EVIDENCE_SOURCES } from "../../_shared/browser-evidence-ring.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ThemeRequest } from "../../_shared/theme.ts";
import type { AppearanceInvariantResult } from "../contract/appearance-invariants.ts";
import type { DiskSafeBrowserPageError, DiskSafeLimitReceipt } from "../contract/browser-evidence-redaction.ts";
import type { Args, CaptureOutcome, DriveFailure, WatchTick } from "../contract/types.ts";
import type { SnapFailureSummary } from "../contract/verdict.ts";
import {
  redactBrowserDiagnostics,
  redactBrowserPageError,
  redactCapturedConsole,
  redactCapturedRequest,
  redactEvidenceText,
} from "../lib/browser-evidence-redaction.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

interface SnapManifest {
  readonly schemaVersion: 1;
  readonly status: "pass" | "fail";
  readonly target: { readonly url: string; readonly name: string };
  readonly environment: {
    readonly viewport: Viewport;
    readonly device: string | null;
    readonly colorScheme: string | null;
    /** The OS media query (--reduced-motion/--probe). */
    readonly reducedMotion: boolean;
    /** The APP-setting shim actually applied to this run (--appearance/--appearance-preset/--full-motion),
     *  null when the run drove the account's real state — so a manifest never leaves which arm it measured
     *  to be inferred from the command line. */
    readonly appearance: AppearancePatch | null;
    /** Whether the requested appearance patch reached at least one real settings envelope in every context. */
    readonly appearanceApplied: boolean | null;
    /** The ACTIVE-THEME arm this run asked for (--theme), null when it drove the account's own theme. A
     *  request that failed to resolve printed a THEME SHIM WARNING and rendered the account's theme. */
    readonly theme: ThemeRequest | null;
    /** Whether the requested theme selection resolved and reached a settings envelope in every context. */
    readonly themeApplied: boolean | null;
    /** One actual runtime identity per browser context. Any mismatch is a Snap failure. */
    readonly browser: readonly BrowserEnvironmentEvidence[];
    /** Authenticated requested/resolved theme id/source/catalog evidence for every context. */
    readonly settings: readonly SettingsShimEvidence[];
  };
  readonly failures: SnapFailureSummary;
  readonly traces: readonly string[];
  readonly hars: readonly string[];
  readonly console: readonly CapturedConsole[];
  readonly pageErrors: readonly DiskSafeBrowserPageError[];
  readonly diagnostics: readonly BrowserDiagnostic[];
  readonly diagnosticRedaction: DiskSafeLimitReceipt;
  readonly diagnosticCompleteness: readonly OrbConsoleCompleteness[];
  /** Interaction-scoped diagnostics when --checkpoint is active; console/pageErrors above remain the
   *  lossless browser-lifetime record. */
  readonly evidence?: {
    readonly scope: "checkpoint";
    readonly console: readonly CapturedConsole[];
    readonly pageErrors: readonly DiskSafeBrowserPageError[];
    readonly diagnostics: readonly BrowserDiagnostic[];
    readonly diagnosticRedaction: DiskSafeLimitReceipt;
    readonly diagnosticCompleteness: readonly OrbConsoleCompleteness[];
  };
  readonly failedRequests: CapturedRequest[];
  /** Vite dep-optimizer aborts, kept for the record and excluded from the verdict (isViteDepChurn).
   *  Absent when there were none — a warm stage never produces any. */
  readonly viteDepChurn?: readonly CapturedRequest[];
  /** Matrix-only literal historical-row verdicts, including strict subject and CSS reconciliation. */
  readonly appearance?: readonly AppearanceInvariantResult[];
  readonly captures: readonly CaptureOutcome[];
  /** Watch-only timeline. Present when --watch ran; ticks remain durable even when terminal output dedupes them. */
  readonly watch?: {
    readonly totalMs: number;
    readonly intervalMs: number;
    readonly ticks: readonly WatchTick[];
  };
  /** Scenario-only attribution. `captures[index]` and `scenario.checkpoints[index]` describe one checkpoint. */
  readonly scenario?: {
    readonly checkpoints: ReadonlyArray<{
      readonly name: string;
      /** Null when this checkpoint deliberately ran with --no-shot. */
      readonly screenshot: string | null;
      readonly console: readonly CapturedConsole[];
      readonly pageErrors: readonly DiskSafeBrowserPageError[];
      readonly diagnostics: readonly BrowserDiagnostic[];
      readonly diagnosticCompleteness: readonly OrbConsoleCompleteness[];
    }>;
  };
}

interface SnapCoreCaptureEvidence {
  readonly v: 1;
  readonly populations: {
    /** #1507: `dropped`/`complete` are READ OFF the page-error ring's retention receipt, never asserted.
     *  They were hardcoded `0`/`true` over a `BoundedEvidenceRing` that has always tracked a real
     *  per-scope eviction count — so a capacity-evicted page error made this row a lie, at the exact
     *  moment the evidence mattered most. `basis` stays "all-observed": the ring observes every error and
     *  says how many it had to drop. */
    readonly pageErrors: { readonly records: number; readonly dropped: number; readonly complete: boolean; readonly basis: "all-observed" };
    readonly failedRequests: { readonly records: number; readonly dropped: null; readonly complete: false; readonly basis: "latest-per-url" };
    /** EARNED, re-derived #1507: captures are the `CaptureOutcome[]` the run built, one row per page it
     *  actually captured (ops/run.ts → `capturePages`) — a plain array with no ring, no capacity and no
     *  eviction path. Nothing can drop a capture without the run itself failing, so 0/true is a fact. */
    readonly captures: { readonly records: number; readonly dropped: 0; readonly complete: true; readonly basis: "all-pages" };
  };
  readonly failures: SnapFailureSummary;
  readonly pageErrors: readonly DiskSafeBrowserPageError[];
  readonly failedRequests: readonly ReturnType<typeof redactCapturedRequest>[];
  readonly captures: ReadonlyArray<{
    readonly pageIndex: number;
    readonly navError: string | null;
    readonly stepFailures: number;
    readonly navFailures: number;
    /** #1344 — the structured, redacted rows behind those two counters. */
    readonly driveFailures: readonly DriveFailure[];
    readonly fileActions: CaptureOutcome["fileActions"];
    readonly mapError: string | null;
    readonly mapAtlasError: string | null;
    readonly mapShellError: string | null;
  }>;
}

type ManifestInput = Omit<SnapManifest, "schemaVersion" | "diagnosticRedaction" | "pageErrors" | "evidence" | "scenario"> & {
  readonly pageErrors: readonly BrowserPageError[];
  readonly evidence?: Omit<NonNullable<SnapManifest["evidence"]>, "diagnosticRedaction" | "pageErrors"> & {
    readonly pageErrors: readonly BrowserPageError[];
  };
  readonly scenario?: {
    readonly checkpoints: ReadonlyArray<
      Omit<NonNullable<SnapManifest["scenario"]>["checkpoints"][number], "pageErrors"> & {
        readonly pageErrors: readonly BrowserPageError[];
      }
    >;
  };
};

/** THE MANIFEST'S TOP-LINE VIEWPORT IS THE ONE THE BROWSER GOT (#1678), not the one argv carried.
 *
 *  Reproduced on this tree before the fix: `pnpm snap --file … --mobile --json` wrote
 *  `environment: { device: "iPhone 14 Pro Max", viewport: { width: 1280, height: 800 } }` — a phone beside
 *  a desktop size — while the NESTED `environment.browser[0]` said 430x740 / DPR 3 / coarse in all three
 *  of requested, applied and actual. The top line echoed `opts.viewport`, which a device preset never
 *  touches (a descriptor supplies its own size at the context, #1668's `effectiveContextViewport`), so one
 *  record answered the same question two ways and the argv-shaped answer was the one a reader saw first.
 *
 *  The APPLIED contract is the source for the same reason `scaleResultValue` uses it: it is the only value
 *  that already accounts for a descriptor AND for an explicit `--viewport` override. No browser evidence
 *  (a manifest written without a context) leaves the argv value in place — there is nothing better to say. */
function appliedEnvironmentViewport(environment: ManifestInput["environment"]): Viewport {
  return environment.browser[0]?.applied.viewport ?? environment.viewport;
}

function diskSafeManifest(input: ManifestInput): SnapManifest {
  const { evidence, scenario, viteDepChurn, ...base } = input;
  const diagnostics = redactBrowserDiagnostics(input.diagnostics);
  const evidenceDiagnostics = evidence === undefined ? null : redactBrowserDiagnostics(evidence.diagnostics);
  return {
    schemaVersion: 1,
    ...base,
    environment: { ...base.environment, viewport: appliedEnvironmentViewport(base.environment) },
    console: input.console.map((entry) => redactCapturedConsole(entry)),
    pageErrors: input.pageErrors.map((entry) => redactBrowserPageError(entry)),
    diagnostics: diagnostics.records,
    diagnosticRedaction: diagnostics._orbMeasuredLimit,
    failedRequests: input.failedRequests.map((entry) => redactCapturedRequest(entry)),
    ...(viteDepChurn === undefined ? {} : { viteDepChurn: viteDepChurn.map((entry) => redactCapturedRequest(entry)) }),
    ...(evidence === undefined || evidenceDiagnostics === null
      ? {}
      : {
          evidence: {
            ...evidence,
            console: evidence.console.map((entry) => redactCapturedConsole(entry)),
            pageErrors: evidence.pageErrors.map((entry) => redactBrowserPageError(entry)),
            diagnostics: evidenceDiagnostics.records,
            diagnosticRedaction: evidenceDiagnostics._orbMeasuredLimit,
          },
        }),
    ...(scenario === undefined
      ? {}
      : {
          scenario: {
            checkpoints: scenario.checkpoints.map((checkpoint) => ({
              ...checkpoint,
              console: checkpoint.console.map((entry) => redactCapturedConsole(entry)),
              pageErrors: checkpoint.pageErrors.map((entry) => redactBrowserPageError(entry)),
              diagnostics: redactBrowserDiagnostics(checkpoint.diagnostics).records,
            })),
          },
        }),
  };
}

function measuredLimitReceipt(record: object, path: string): InstrumentArtifactLimitReceipt | null {
  const receipt = Reflect.get(record, "_orbMeasuredLimit");
  if (receipt === undefined) {
    return null;
  }
  if (typeof receipt !== "object" || receipt === null) {
    throw new Error(`INSTRUMENT ERROR: ${path} measured-limit receipt is not an object`);
  }
  const policy = Reflect.get(receipt, "policy");
  const rawEvents = Reflect.get(receipt, "events");
  if (!Array.isArray(rawEvents)) {
    throw new Error(`INSTRUMENT ERROR: ${path} measured-limit receipt has no events array`);
  }
  const events = rawEvents.map((event, index) => {
    if (typeof event !== "object" || event === null) {
      throw new Error(`INSTRUMENT ERROR: ${path} measured-limit event ${String(index)} is not an object`);
    }
    const kind = Reflect.get(event, "kind");
    const eventPath = Reflect.get(event, "path");
    const original = Reflect.get(event, "original");
    const retained = Reflect.get(event, "retained");
    const omitted = Reflect.get(event, "omitted");
    if (
      typeof kind !== "string" ||
      typeof eventPath !== "string" ||
      !(original === null || typeof original === "number") ||
      !(retained === null || typeof retained === "number") ||
      !(omitted === null || typeof omitted === "number")
    ) {
      throw new Error(`INSTRUMENT ERROR: ${path} measured-limit event ${String(index)} is malformed`);
    }
    return { kind, path: eventPath, original, retained, omitted };
  });
  let parsedPolicy: Readonly<Record<string, number>> | null = null;
  if (policy !== null) {
    if (typeof policy !== "object") {
      throw new Error(`INSTRUMENT ERROR: ${path} measured-limit policy is malformed`);
    }
    const entries = Object.entries(policy);
    if (entries.some(([, value]) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error(`INSTRUMENT ERROR: ${path} measured-limit policy has a non-numeric member`);
    }
    parsedPolicy = Object.fromEntries(entries.map(([key, value]) => [key, Number(value)]));
  }
  return {
    source: path,
    complete: events.length === 0,
    policy: parsedPolicy,
    events,
  };
}

function collectMeasuredLimits(candidate: unknown, path: string, receipts: InstrumentArtifactLimitReceipt[]): void {
  if (Array.isArray(candidate)) {
    for (const [index, member] of candidate.entries()) {
      collectMeasuredLimits(member, `${path}[${String(index)}]`, receipts);
    }
    return;
  }
  if (typeof candidate !== "object" || candidate === null) {
    return;
  }
  const receipt = measuredLimitReceipt(candidate, path);
  if (receipt !== null) {
    receipts.push(receipt);
  }
  for (const [key, member] of Object.entries(candidate)) {
    if (key !== "_orbMeasuredLimit") {
      collectMeasuredLimits(member, `${path}.${key}`, receipts);
    }
  }
}

function measuredLimits(value: unknown): readonly InstrumentArtifactLimitReceipt[] {
  const receipts: InstrumentArtifactLimitReceipt[] = [];
  collectMeasuredLimits(value, "$manifest", receipts);
  return receipts;
}

// The manifest is the settled capture's sibling: for a bare `--out home` that is reports/snaps/home.json exactly as
// before; for a path-shaped `--out /tmp/x.png` it is /tmp/x.json, next to the pixels it describes.
async function writeManifest(name: string, input: ManifestInput): Promise<string> {
  const safe = diskSafeManifest(input);
  const limits = measuredLimits(safe);
  const bounded = limits.some((receipt) => !receipt.complete);
  const path = await artifactFile("snaps", name, ".json", {
    producer: "snap",
    // The manifest describes the whole settled capture (ARIA/map included), not the pixel producer.
    producerArm: null,
    channel: "capture-manifest",
    mediaType: "application/json",
    schema: "snap-manifest-v1",
    role: "primary",
    completeness: bounded ? "bounded" : "complete",
    completenessDetail: bounded
      ? "complete capture manifest with bounded nested browser evidence and structured limit receipts"
      : "complete capture manifest; nested browser evidence was retained without truncation",
    scope: aggregateScope(),
    records: safe.captures.length,
    limits,
  });
  await writeFile(path, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
  return path;
}

/** The page-error ring's own verdict about itself (#1507).
 *
 *  `BoundedEvidenceRing.receipts()` emits `[aggregate, ...one row per exact scope]`, and
 *  `browserEvidenceRetention` concatenates that per BROWSER CONTEXT — so the batch holds one AGGREGATE row
 *  per ring plus its per-scope breakdown, and summing every row would double-count every eviction. The
 *  aggregate rows are the ring-level totals (their scope is aggregate on all three axes), so those are what
 *  the population reports; the exact rows stay in the retention fact for attribution.
 *
 *  No aggregate row at all is NOT a clean zero: it is "we never measured", so `complete` is false and the
 *  artifact says the receipt was missing instead of printing an earned-looking 0/true. */
export function summarizePageErrorRetention(retention: BrowserEvidenceRetentionBatch): {
  readonly dropped: number;
  readonly complete: boolean;
  readonly rows: number;
} {
  const rows = retention.rows.filter((row) => row.source === BROWSER_EVIDENCE_SOURCES.pageErrors && row.scope.context.kind === "aggregate");
  return {
    dropped: rows.reduce((total, row) => total + row.dropped, 0),
    complete: rows.length > 0 && rows.every((row) => row.complete),
    rows: rows.length,
  };
}

/** Always-on, bounded input for the run card. It projects already-captured facts through the same disk
 * redaction boundary as the optional full manifest; it never performs another page read.
 *
 * `populations.pageErrors.dropped/complete` come from `summarizePageErrorRetention`'s read of the ring's
 * retention receipt (#1507-1), not a `dropped: 0, complete: true` literal. #1591 DECIDED that arm's floor
 * is `summarizePageErrorRetention`'s own unit pin (tests/tooling/snap/ops/manifest.test.ts), not a
 * compiled red through the real CLI: the observable here (`evidence/core-capture.json`) only differs
 * after `BROWSER_PAGE_ERROR_CAP` (2048) page errors, and snap's CLI never threads `evidenceLimits`
 * (`ProbeLaunchOptions`) through to `buildLaunchOptions` — the harness-only override this would need is a
 * new `process.env` read at that seam, which is a NEW `lint/style/noProcessEnv` suppression at the launch
 * seam (`snap/ops/session.ts` / `_shared/browser-context.ts` carry none today) in the same class as the
 * already-ruled harness knob at `snap/lib/budgets.ts` (`ORB_SNAP_SELECTOR_PROOF_CAP`) — verify-side
 * exception territory this lane's owner word bans touching (v-V4 correction, 2026-09-05). (That used to be
 * phrased as a per-file COUNT BUMP in `suppressions.baseline.json`; the ratchet was deleted 2026-09-12 with
 * the `suppressions` authority migration, #2063, and the rule class is now one reviewed grant.) The
 * unit pin already exercises every branch of the summarizer (dropped is positive, complete, multi-ring, empty); a
 * compiled overflow-through-CLI red would prove only that 2048 pushes happened, not a new invariant. */
export async function writeCoreCaptureEvidence(input: ManifestInput, retention: BrowserEvidenceRetentionBatch): Promise<string> {
  const pageErrorRetention = summarizePageErrorRetention(retention);
  const evidence: SnapCoreCaptureEvidence = {
    v: 1,
    populations: {
      pageErrors: {
        records: input.pageErrors.length,
        dropped: pageErrorRetention.dropped,
        complete: pageErrorRetention.complete,
        basis: "all-observed",
      },
      // The browser source is a URL-keyed Map: repeated attempts replace the prior row. Preserve that
      // useful latest failure, but never mislabel it as a complete request-event population.
      failedRequests: { records: input.failedRequests.length, dropped: null, complete: false, basis: "latest-per-url" },
      captures: { records: input.captures.length, dropped: 0, complete: true, basis: "all-pages" },
    },
    failures: input.failures,
    pageErrors: input.pageErrors.map((entry) => redactBrowserPageError(entry)),
    failedRequests: input.failedRequests.map((entry) => redactCapturedRequest(entry)),
    captures: input.captures.map((capture) => ({
      pageIndex: capture.pageIndex,
      navError: capture.navError === null ? null : redactEvidenceText(capture.navError).text,
      stepFailures: capture.stepFailures,
      navFailures: capture.navFailures,
      // #1344: the structured half of those two counters, so the browser-free reader can mint one FINDING
      // row per failed action instead of leaving the cause as a token on the RESULT line.
      driveFailures: capture.driveFailures.map((failure) => ({
        index: failure.index,
        kind: failure.kind,
        flag: failure.flag,
        subject: failure.subject === null ? null : redactEvidenceText(failure.subject).text,
        reason: redactEvidenceText(failure.reason).text,
      })),
      fileActions: capture.fileActions,
      mapError: capture.mapError === null ? null : redactEvidenceText(capture.mapError).text,
      mapAtlasError: capture.mapAtlasError === null ? null : redactEvidenceText(capture.mapAtlasError).text,
      mapShellError: capture.mapShellError === null ? null : redactEvidenceText(capture.mapShellError).text,
    })),
  };
  const path = await artifactFile("evidence", "core-capture", ".json", {
    producer: "snap",
    producerArm: "app-snapshot",
    channel: "core-capture",
    mediaType: "application/json",
    schema: "snap-core-capture-v1",
    role: "primary",
    completeness: "bounded",
    completenessDetail: pageErrorRetention.complete
      ? "page-error and capture populations are complete; failed requests are a latest-per-URL projection"
      : `the page-error population is BOUNDED (${pageErrorRetention.rows === 0 ? "no retention receipt — completeness was not measured" : `${pageErrorRetention.dropped} evicted by ring capacity`}); failed requests are a latest-per-URL projection`,
    scope: aggregateScope(),
    records: evidence.pageErrors.length + evidence.failedRequests.length + evidence.captures.length,
    limits: [
      {
        source: "failed-requests-latest-per-url",
        complete: false,
        policy: null,
        events: [
          {
            kind: "projection",
            path: "$.failedRequests",
            original: null,
            retained: evidence.failedRequests.length,
            omitted: null,
          },
        ],
      },
      // #1507: the page-error ring files a receipt ONLY when it actually lost something (or could not say)
      // — a complete population adds no row, so a clean run's artifact is byte-identical to before.
      ...(pageErrorRetention.complete
        ? []
        : [
            {
              source: "page-errors-ring",
              complete: false,
              policy: null,
              events: [
                {
                  kind: pageErrorRetention.rows === 0 ? "unmeasured" : "eviction",
                  path: "$.pageErrors",
                  original: null,
                  retained: evidence.pageErrors.length,
                  omitted: pageErrorRetention.rows === 0 ? null : pageErrorRetention.dropped,
                },
              ],
            } satisfies InstrumentArtifactLimitReceipt,
          ]),
    ],
  });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return path;
}

export function appliedAcrossContexts(requested: boolean, values: readonly (boolean | null)[]): boolean | null {
  return requested ? values.every((value) => value === true) : null;
}

export async function writeManifestIfRequested(opts: Args, name: string, input: ManifestInput): Promise<string | null> {
  return opts.json ? await writeManifest(name, input) : null;
}
