// The Project-1 coordinates, ingress classes, and failure-shape recognizers. Lifecycle law:
// .claude/rules/orchestration.md §Work control quick path.
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

export const LIFECYCLE_FIELDS = new Set(["status", "evidence", "lane", "wake condition", "disposition"]);
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
