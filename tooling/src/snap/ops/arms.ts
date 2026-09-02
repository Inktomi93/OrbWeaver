// The two opt-in MCP-retiring arms' RUN-PATH integration (#1198/#1199): one object that owns whether
// each arm ran, and answers every question the single-run pass asks about them — the failure count, the
// verdict denominators, the RESULT pairs, and whether a refusal has voided the run.
//
// It exists so `ops/run.ts` gains NO branches for two optional arms. That is not cosmetic: the single-run
// pass is one long function under a cognitive-complexity ceiling, and the alternative (an `if` and a
// ternary per arm, six times over) is exactly the shape that makes the next arm unaddable. Each method
// below is total — "the arm did not run" is an answer here, never a null the caller has to re-test.
import type { ResultPair } from "../../_shared/artifacts.ts";
import type { ProbeSession } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { EvidenceGap, VerdictDenominator } from "../../_shared/evidence.ts";
import { printEvidenceGaps } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { LighthouseOutcome } from "../contract/lighthouse.ts";
import type { RequestBodyOutcome, RequestLogReceipt } from "../contract/request-log.ts";
import type { Args } from "../contract/types.ts";
import { runLighthouseArm } from "./lighthouse.ts";
import type { RequestLogRecorder } from "./request-log.ts";
import { attachRequestLog, finishRequestLog } from "./request-log.ts";
import { lighthousePortFor } from "./session.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export interface SnapArms {
  /** Run the Lighthouse audit on the settled page (no-op when `--lighthouse` is off). A refusal prints
   *  its evidence gap here, where the reader meets it in run order, not at the RESULT line. */
  readonly audit: (session: ProbeSession, opts: Args, name: string) => Promise<void>;
  /** Drain + file the request log (no-op when `--requests` is off). */
  readonly finishLog: (opts: Args, name: string) => Promise<void>;
  /** Failed Lighthouse audits — a verdict member, like contrast and dead CSS. */
  readonly failedAudits: () => number;
  readonly denominators: () => Readonly<Record<string, VerdictDenominator>>;
  readonly resultPairs: () => readonly ResultPair[];
  /** The run's exit code after the arms have their say: a REFUSED audit measured nothing, so the run is
   *  not a verdict about the app at all and exits 2 whatever else it found (_shared/evidence.ts). */
  readonly exit: (code: number) => number;
}

function requestBodyLabel(body: RequestBodyOutcome | null): string {
  if (body === null) {
    return "off";
  }
  if (body.kind !== "captured") {
    return body.kind;
  }
  return body.truncatedAt === null ? `${body.bytes}b` : `${body.bytes}b truncatedAt=${body.truncatedAt}`;
}

/** `lighthouse=` states WHICH run you got — off, the device/mode pair, or REFUSED. Never a bare score: a
 *  reader must not have to guess whether an absent number means "clean" or "never ran". */
function lighthousePairs(outcome: LighthouseOutcome | null): ResultPair[] {
  if (outcome === null) {
    return [["lighthouse", "off"]];
  }
  if (outcome.kind === "refused") {
    return [["lighthouse", "REFUSED"]];
  }
  const { receipt } = outcome;
  return [
    ["lighthouse", `${receipt.device}/${receipt.mode}`],
    ["lighthouse-failed-audits", receipt.failed.length],
    ...receipt.categories.map(({ id, score }): ResultPair => [`lighthouse-${id}`, score ?? "n/a"]),
  ];
}

function requestPairs(receipt: RequestLogReceipt | null): ResultPair[] {
  if (receipt === null) {
    return [];
  }
  return [
    ["requests-shown", receipt.shown.length],
    ["request-body", requestBodyLabel(receipt.body)],
  ];
}

function gapOf(outcome: LighthouseOutcome | null): EvidenceGap | null {
  return outcome !== null && outcome.kind === "refused" ? outcome.gap : null;
}

/** Wire whatever the argv asked for, BEFORE anything navigates (the request log's whole contract), and
 *  hand back the total surface the run pass talks to. */
export function attachSnapArms(session: ProbeSession, opts: Args): SnapArms {
  const recorder: RequestLogRecorder | null = opts.requests ? attachRequestLog(session, opts) : null;
  let lighthouse: LighthouseOutcome | null = null;
  let log: RequestLogReceipt | null = null;

  return {
    audit: async (auditSession, auditOpts, name): Promise<void> => {
      if (auditOpts.lighthouse === null) {
        return;
      }
      lighthouse = await runLighthouseArm(auditSession, auditOpts, name, lighthousePortFor(auditSession));
      const gap = gapOf(lighthouse);
      if (gap !== null) {
        printEvidenceGaps([gap]);
      }
    },
    finishLog: async (logOpts, name): Promise<void> => {
      if (recorder === null) {
        return;
      }
      log = await finishRequestLog(recorder, logOpts, name);
    },
    failedAudits: (): number => (lighthouse !== null && lighthouse.kind === "measured" ? lighthouse.receipt.failed.length : 0),
    denominators: (): Readonly<Record<string, VerdictDenominator>> => ({
      // Each arm declares the population its own accounting is over, and only when it ran. A Lighthouse
      // report that judged nothing, or a request log that recorded nothing, is an instrument failure —
      // nothing was wired, or the audit read an empty page — never a clean sheet.
      ...(lighthouse !== null && lighthouse.kind === "measured"
        ? { "lighthouse-audits": { value: lighthouse.receipt.auditedCount, refuseWhen: "zero" as const } }
        : {}),
      ...(log === null ? {} : { requests: { value: log.total, refuseWhen: "zero" as const } }),
    }),
    resultPairs: (): readonly ResultPair[] => [...lighthousePairs(lighthouse), ...requestPairs(log)],
    exit: (code: number): number => (gapOf(lighthouse) === null ? code : EXIT.toolError),
  };
}
