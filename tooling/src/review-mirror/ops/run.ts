// The manual milestone operation: generate the unnarrated mirror, resolve the E5/E6 review inventory, census
// E7, and write evidence only after every population proves non-empty. D62 intentionally gives it no cron.
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { print, printResult, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { getWorkspace } from "../../_shared/ts-workspace.ts";
import type { ReviewMirrorEvidence } from "../contract/types.ts";
import { assertReviewEvidence } from "../lib/evidence.ts";
import { resolveReviewFocus } from "../lib/focus.ts";
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
}

export interface RunReviewMirrorResult {
  readonly code: typeof EXIT.clean;
  readonly evidencePath: string;
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
  const evidencePath = join(mirror.target, EVIDENCE_NAME);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  print(JSON.stringify({ target: mirror.target, sourceCommit: commit, mirror, pendingGuard: evidence.pendingGuard.totals }, null, 2));
  print(`evidence: ${evidencePath}`);
  print(`next: review the mirror without source comments; use ${EVIDENCE_NAME} as the E5/E6/E7 scope receipt`);
  printResult("review-mirror", [
    ["tracked", mirror.tracked],
    ["code", mirror.mirroredCode],
    ["controls", evidence.pendingGuard.directControls],
    ["missing", evidence.pendingGuard.totals.missing],
  ]);
  return { code: EXIT.clean, evidencePath, evidence };
}
