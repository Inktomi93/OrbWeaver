// The Project-1 coordinates, ingress classes, and failure-shape recognizers.
import { join } from "node:path";
import process from "node:process";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import type { IssueClass, IssueClassConfig } from "../contract/types.ts";

export const PROJECT_OWNER = "Inktomi93";
export const REPO_NAME = "orbweaver";
export const REPOSITORY = `${PROJECT_OWNER}/${REPO_NAME}`;
export const PROJECT_NUMBER = 1;

export const ISSUE_RE = /^\d+$/u;
export const ISSUE_URL_RE = /\/issues\/(\d+)$/u;

// Primary exhaustion (RATE_LIMITED type / remaining=0) reports the reset timestamp; secondary limits
// (403/429 with a "secondary rate limit" message per GitHub's REST-API troubleshooting docs) never honor
// that timestamp — GitHub does not expose Retry-After through `gh`'s text output, so the operator
// instruction is the documented fallback backoff (wait ≥1 minute, then exponential backoff on repeats).
export const SECONDARY_RATE_LIMIT_RE = /secondary rate limit/iu;
export const PRIMARY_RATE_LIMIT_RE = /rate limit|RATE_LIMITED/iu;
// "does not belong to" is GitHub's live wording for a stale cached single-select OPTION id
// (updateProjectV2ItemFieldValue rejects an option id that no longer belongs to its field).
export const STALE_CONTEXT_RE = /could not resolve|no field named|no option named|does not belong to/iu;

export const CREATE_OPTION_COUNT = 4;
export const MS_PER_SECOND = 1000;

// GitHub's ProjectV2 Evidence column caps UTF-8 BYTES, not JavaScript code units.
// Measured 2026-09-13 on scratch #2336: 1024 ASCII bytes, 512 é, and 256 emoji pass;
// one more of each fails UNPROCESSABLE. evidenceText budgets both prefix and pointer
// against this limit; the full receipt remains in an issue comment.
export const EVIDENCE_MAX_LENGTH = 1024;

export const LIFECYCLE_FIELDS = new Set(["status", "evidence", "lane", "wake condition", "disposition", "dod"]);

/** The Project TEXT field pairing an issue-body dod-fenced block with its mint-time stamp (#923).
 *  Lifecycle-controlled (`set` refuses it above): the stamp is only
 *  ever written by a path that just watched the command FAIL — the red-first mint. */
export const DOD_FIELD = "DoD";
/** Per-DoD wall-clock ceiling, at mint AND at close — a batched `land` of N rows is bounded at
 *  N·timeout, and an unfinishable bar refuses instead of hanging the board. A bar needing more than
 *  this is a verification TIER, not a close gate (the refusal message says so). */
const DOD_TIMEOUT_DEFAULT_MS = 300_000;
// biome-ignore lint/style/noProcessEnv: WORK_ITEM_DOD_TIMEOUT_MS is the test seam for the per-DoD wall clock — harness plumbing, not app config.
const dodTimeoutSeam = Number(process.env["WORK_ITEM_DOD_TIMEOUT_MS"]);
export const DOD_TIMEOUT_MS = Number.isFinite(dodTimeoutSeam) && dodTimeoutSeam > 0 ? dodTimeoutSeam : DOD_TIMEOUT_DEFAULT_MS;
/** Refusal messages print the output TAIL — enough to read the failure, never a megabyte dump. */
export const DOD_OUTPUT_TAIL = 2000;
export const REQUIRED_READY_METADATA = ["Kind", "Priority", "Area", "Review"];
export const TERMINAL_DISPOSITIONS = new Set(["killed", "already resolved"]);

export const ISSUE_CLASSES: Readonly<Record<IssueClass, IssueClassConfig>> = {
  work: { labels: ["kind:build", "triage"], projectKind: "Work", status: "Triage" },
  bug: { labels: ["bug", "triage"], projectKind: "Work", status: "Triage" },
  decision: { labels: ["kind:decision", "needs-owner", "triage"], projectKind: "Decision", review: "Owner", status: "Needs owner" },
  program: { labels: ["kind:design", "triage"], projectKind: "Program", status: "Triage" },
  evidence: { labels: ["kind:finding", "triage"], projectKind: "Evidence", status: "Triage" },
};

/** Ingress labels mirror PRE-lifecycle state only; a transition out of ingress must clear them or the
 *  label view lies forever (the Codex control-plane review: Done issues still wore `triage` because
 *  create added labels that nothing reconciled). `gh issue edit --remove-label` tolerates an absent
 *  label, so idempotent command reruns stay safe. */
export const INGRESS_LABELS = ["triage", "needs-owner"] as const;

// biome-ignore lint/style/noProcessEnv: WORK_ITEM_CACHE_DIR is the test seam for the project-context cache directory — harness plumbing, not app config.
export const CACHE_DIR = process.env["WORK_ITEM_CACHE_DIR"] ?? join(REPO_ROOT, ".claude", "cache");
export const CACHE_FILE = join(CACHE_DIR, "work-item-project.json");
