// The lifecycle verbs and their guards: Triage → Ready → Running → Review → Verify → Done, plus the
// Needs-owner / Blocked / Parked exceptions. Every verb is RERUNNABLE — the guards accept their own
// destination status, and Status is written last, so an interrupted or uncertain command converges.

import type { Issue, LifecycleCommand, WorkCommand, WorkItemContext } from "../contract/types.ts";
import { INGRESS_LABELS, REPOSITORY, REQUIRED_READY_METADATA, TERMINAL_DISPOSITIONS } from "../lib/vocab.ts";
import { currentValue } from "../lib/writes.ts";
import { gh } from "./gh.ts";
import {
  blockerIssueId,
  ensureItem,
  fetchBlockers,
  fetchIssueContext,
  mutateDependency,
  setField,
  transitionStatusLast,
  transitionToReady,
  writeFields,
} from "./project.ts";

function requireStatus(work: WorkItemContext, allowed: readonly string[], message: string): void {
  const status = currentValue(work.item, "Status");
  if (status === undefined || !allowed.some((value) => value.toLowerCase() === status.toLowerCase())) {
    throw new Error(message);
  }
}

function requireReadyMetadata(work: WorkItemContext, action: string): void {
  const missing = REQUIRED_READY_METADATA.filter((field) => (currentValue(work.item, field)?.trim() ?? "") === "");
  if (missing.length > 0) {
    throw new Error(`work item must set ${missing.join(", ")} before ${action}`);
  }
}

function requireUnblocked(target: Issue, message: string): void {
  if (target.blockers.length > 0) {
    throw new Error(message);
  }
}

/** Clear stale ingress labels, optionally keeping/adding `needs-owner` (the Needs-owner mirror). Runs
 *  BEFORE the Status write like claim's assignee edit — gh-side effects first, Status is the commit marker. */
function reconcileIngressLabels(number: number, keep?: "needs-owner"): void {
  const remove = INGRESS_LABELS.filter((label) => label !== keep);
  gh(["issue", "edit", String(number), "--repo", REPOSITORY, ...remove.flatMap((label) => ["--remove-label", label])]);
  if (keep !== undefined) {
    gh(["issue", "edit", String(number), "--repo", REPOSITORY, "--add-label", keep]);
  }
}

function claim(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "claim" }>): void {
  requireStatus(work, ["Ready", "Running"], "work item must be Ready before claim");
  requireUnblocked(work.target, "work item cannot be claimed while blocked");
  requireReadyMetadata(work, "claim");
  const currentLane = currentValue(work.item, "Lane");
  if (currentValue(work.item, "Status")?.toLowerCase() === "running" && currentLane !== undefined && currentLane !== command.lane) {
    throw new Error(`work item is already Running in lane ${currentLane}`);
  }
  gh(["issue", "edit", String(work.target.number), "--repo", REPOSITORY, "--add-assignee", "@me"]);
  // Belt: ready() already reconciled, but a claim rerun after an interrupted ready must not leave
  // ingress labels behind (idempotent — removing an absent label is a no-op).
  reconcileIngressLabels(work.target.number);
  transitionStatusLast(work.item, "Running", [{ name: "Lane", value: command.lane }]);
}

function ready(work: WorkItemContext): void {
  requireStatus(work, ["Triage", "Needs owner", "Blocked", "Parked", "Ready"], "work item must be Triage, Needs owner, Blocked, Parked, or Ready before Ready");
  requireUnblocked(work.target, "work item cannot become Ready while blocked");
  requireReadyMetadata(work, "Ready");
  reconcileIngressLabels(work.target.number);
  transitionToReady(work.item);
}

function needsOwner(work: WorkItemContext): void {
  requireStatus(
    work,
    ["Triage", "Ready", "Running", "Blocked", "Needs owner"],
    "work item must be Triage, Ready, Running, Blocked, or Needs owner before Needs owner",
  );
  if (TERMINAL_DISPOSITIONS.has(currentValue(work.item, "Disposition")?.toLowerCase() ?? "")) {
    throw new Error("work item with a terminal Disposition cannot enter Needs owner");
  }
  // The needs-owner label mirrors the ingress state for issues routed here after creation.
  reconcileIngressLabels(work.target.number, "needs-owner");
  transitionStatusLast(work.item, "Needs owner", [
    { name: "Review", value: "Owner" },
    { name: "Lane" },
    { name: "Wake condition" },
    { name: "Disposition", value: "Untriaged" },
  ]);
}

function review(work: WorkItemContext): void {
  requireStatus(work, ["Running", "Review"], "work item must be Running before Review");
  requireUnblocked(work.target, "work item cannot enter Review while blocked");
  transitionStatusLast(work.item, "Review", []);
}

function verify(work: WorkItemContext, evidence: string): void {
  requireStatus(work, ["Review", "Verify"], "work item must be Review before Verify");
  requireUnblocked(work.target, "work item cannot be verified while blocked");
  const currentEvidence = currentValue(work.item, "Evidence");
  if (currentValue(work.item, "Status")?.toLowerCase() === "verify" && currentEvidence !== undefined && currentEvidence !== evidence) {
    throw new Error("work item is already Verify with different Evidence");
  }
  transitionStatusLast(work.item, "Verify", [{ name: "Evidence", value: evidence }]);
}

function reverify(work: WorkItemContext, evidence: string): void {
  requireStatus(work, ["Verify"], "work item must already be Verify before Evidence can be replaced");
  requireUnblocked(work.target, "work item cannot be reverified while blocked");
  writeFields(work.item, [{ name: "Evidence", value: evidence }], "WorkItemFields");
}

function done(work: WorkItemContext, evidence: string): void {
  requireStatus(work, ["Verify", "Done"], "work item must be Verify before Done");
  requireUnblocked(work.target, "work item cannot be Done while blocked");
  if (currentValue(work.item, "Evidence")?.trim() !== evidence) {
    throw new Error("work item Evidence must match --evidence before Done");
  }
  const comment = `Verification evidence: ${evidence}`;
  if (!work.target.comments.some((item) => item.body === comment)) {
    gh(["issue", "comment", String(work.target.number), "--repo", REPOSITORY, "--body", comment]);
  }
  setField(work.item, "Status", "Done");
  if (work.target.state !== "CLOSED") {
    gh(["issue", "close", String(work.target.number), "--repo", REPOSITORY, "--reason", "completed"]);
  }
}

function block(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "block" }>): void {
  if (!work.target.blockers.includes(command.blocker)) {
    mutateDependency(work.target.id, blockerIssueId(command.blocker), false);
  }
  setField(work.item, "Status", "Blocked");
}

function unblock(work: WorkItemContext, command: Extract<WorkCommand, { readonly kind: "unblock" }>): void {
  let remaining = work.target.blockers;
  if (remaining.includes(command.blocker)) {
    mutateDependency(work.target.id, blockerIssueId(command.blocker), true);
    remaining = fetchBlockers(work.target.number);
  }
  if (remaining.length === 0) {
    transitionToReady(work.item);
    return;
  }
  setField(work.item, "Status", "Blocked");
}

/** Resolve the issue, adopt it into Project if needed, then run the verb. Returns the issue number the
 *  cli echoes. */
export function runLifecycle(command: LifecycleCommand): number {
  const context = fetchIssueContext(command.issue);
  if (context.target.state === "CLOSED" && command.kind !== "done") {
    throw new Error("cannot change a closed work item");
  }
  const work: WorkItemContext = { target: context.target, item: ensureItem(context.target, context.item) };
  switch (command.kind) {
    case "claim":
      claim(work, command);
      break;
    case "ready":
      ready(work);
      break;
    case "review":
      review(work);
      break;
    case "needs-owner":
      needsOwner(work);
      break;
    case "set":
      setField(work.item, command.field, command.value);
      break;
    case "verify":
      verify(work, command.evidence);
      break;
    case "reverify":
      reverify(work, command.evidence);
      break;
    case "done":
      done(work, command.evidence);
      break;
    case "park":
      transitionStatusLast(work.item, "Parked", [
        { name: "Wake condition", value: command.wake },
        { name: "Disposition", value: "Parked" },
      ]);
      break;
    case "block":
      block(work, command);
      break;
    case "unblock":
      unblock(work, command);
      break;
  }
  return work.target.number;
}
