// The manual milestone operation: generate the unnarrated mirror, resolve the E5/E6 review inventory, census
// E7, and write evidence only after every population proves non-empty. D62 intentionally gives it no cron.
// `evidenceOut` is the tracked-findings deposit (#770): the bulky mirror stays in the external throwaway
// target, but a milestone run also drops the small evidence JSON at an in-repo path the invoker commits, so
// the sweep's findings are a durable board-linkable artifact instead of a lost ~/Documents run.
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { getWorkspace } from "../../_shared/ts-workspace.ts";
import type { ReviewMirrorEvidence } from "../contract/types.ts";
import { assertReviewEvidence } from "../lib/evidence.ts";
import { resolveReviewFocus } from "../lib/focus.ts";
import { depositTrackedEvidence } from "../lib/tracked-evidence.ts";
import { generateMirror, sourceCommit } from "./generate.ts";
import { censusPendingGuards } from "./pending-guard.ts";

refuseDirectInvocation(import.meta.url, "pnpm review:mirror");

const EVIDENCE_NAME = "review-mirror-evidence.json";
const ISO_MILLISECONDS_RE = /\.\d{3}Z$/u;

function timestamp(date: Date): string {
  return date.toISOString().replaceAll(/[-:]/gu, "").replace("T", "-").replace(ISO_MILLISECONDS_RE, "Z");
}

export interface RunReviewMirrorOptions {
  readonly target?: string;
  readonly now?: Date;
  readonly root?: string;
  /** Optional in-repo path (absolute, or relative to `root`) where the evidence JSON is also written so a milestone run leaves a tracked, board-linkable findings artifact. */
  readonly evidenceOut?: string;
}

export interface RunReviewMirrorResult {
  readonly code: number;
  readonly evidencePath: string;
  /** The resolved absolute path of the tracked deposit when `evidenceOut` was requested, else null. */
  readonly trackedEvidencePath: string | null;
  readonly evidence: ReviewMirrorEvidence;
}

export function runReviewMirror(options: RunReviewMirrorOptions = {}): RunReviewMirrorResult {
  const root = options.root ?? REPO_ROOT;
  const now = options.now ?? new Date();
  const commit = sourceCommit(root);
  const target = options.target ?? join(homedir(), "Documents", `orbweaver-code-review-${timestamp(now)}`);
  const mirror = generateMirror(root, target);
  const project = getWorkspace({ root, types: false });
  const evidence: ReviewMirrorEvidence = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    sourceCommit: commit,
    mirror,
    reviewFocus: resolveReviewFocus(project, root),
    pendingGuard: censusPendingGuards(project, root),
  };
  assertReviewEvidence(evidence);
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidencePath = join(mirror.target, EVIDENCE_NAME);
  writeFileSync(evidencePath, serialized);
  const trackedEvidencePath = depositTrackedEvidence(root, options.evidenceOut, serialized);
  print(JSON.stringify({ target: mirror.target, sourceCommit: commit, mirror, pendingGuard: evidence.pendingGuard.totals }, null, 2));
  print(`review residual: ${evidence.pendingGuard.reviewResiduals.toString()} E7 control(s) require human review or product migration`);
  print(`evidence: ${evidencePath}`);
  if (trackedEvidencePath !== null) {
    print(`tracked evidence: ${trackedEvidencePath} (commit this to link the sweep's findings to its board issue)`);
  }
  print(`next: review the mirror without source comments; use ${EVIDENCE_NAME} as the E5/E6/E7 scope receipt`);
  const code = printVerdict("review-mirror", {
    verdict: EXIT.clean,
    denominators: {
      tracked: { value: mirror.tracked, refuseWhen: "zero" },
      code: { value: mirror.mirroredCode, refuseWhen: "zero" },
      controls: { value: evidence.pendingGuard.directControls, refuseWhen: "zero" },
    },
    pairs: [
      ["tracked", mirror.tracked],
      ["code", mirror.mirroredCode],
      ["controls", evidence.pendingGuard.directControls],
      ["reviewResidual", evidence.pendingGuard.reviewResiduals],
    ],
  });
  return { code, evidencePath, trackedEvidencePath, evidence };
}
