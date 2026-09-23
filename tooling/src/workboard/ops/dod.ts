// DoD execution + the close gate (#923) — the I/O half of lib/dod.ts.
// Every run rides the niced subprocess door with the per-DoD timeout, cwd at the repo root, and the
// ambient env (so the workspace NODE_OPTIONS heap floor reaches node children). The timeout kill lands
// on the direct child (`nice` execs in-process); a compound command's grandchildren can survive it —
// accepted, and one reason the timeout refusal tells the author the bar is too big for a close gate.
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { runNicedSync } from "../../_shared/proc.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import type { WorkItemContext } from "../contract/types.ts";
import { dodStamp, extractDod, upsertDodBlock, validateDodCommand } from "../lib/dod.ts";
import { DOD_FIELD, DOD_OUTPUT_TAIL, DOD_TIMEOUT_MS, PROJECT_NUMBER, REPOSITORY } from "../lib/vocab.ts";
import { currentValue } from "../lib/writes.ts";
import { gh } from "./gh.ts";
import { writeFields } from "./project.ts";

refuseDirectInvocation(import.meta.url, "pnpm work:item <command>");

/** 16 MiB. spawnSync KILLS the child at the buffer ceiling instead of truncating (proc.ts) — a chatty
 *  but legitimate DoD must not have its verdict silently become a kill. */
const DOD_MAX_BUFFER = 16_777_216;

interface DodRun {
  /** null = the run is NOT a verdict (timeout/signal kill) — never green, never red. */
  readonly status: number | null;
  readonly output: string;
}

function runDod(command: string): DodRun {
  const result = runNicedSync("bash", ["-c", command], { cwd: REPO_ROOT, timeout: DOD_TIMEOUT_MS, maxBuffer: DOD_MAX_BUFFER });
  const output = `${result.stdout}${result.stderr}`.trim();
  return { status: result.status, output: output.length > DOD_OUTPUT_TAIL ? `…${output.slice(-DOD_OUTPUT_TAIL)}` : output };
}

/** RED-FIRST (#923): a DoD is minted only after it is seen to FAIL. Callers run this BEFORE any GitHub
 *  call, so a green (or unfinishable) bar costs zero board writes. */
export function requireRedDodAtMint(command: string): void {
  const run = runDod(command);
  if (run.status === 0) {
    throw new Error(`DoD is already green at mint — no bug, or the wrong bar; refusing.\nran: ${command}\noutput:\n${run.output}`);
  }
  if (run.status === null) {
    throw new Error(
      `DoD did not complete within ${DOD_TIMEOUT_MS}ms — an unfinishable command cannot gate a close; a bar this slow belongs to a verification tier, not a DoD.\nran: ${command}`,
    );
  }
  print(`work-item — DoD red at mint (exit ${run.status}), as required`);
}

/** `land`'s green pre-flight marks the row's context so done's gate does not EXECUTE the bar twice in
 *  the same process (owner amendment 2026-09-01). Keyed on the per-row WorkItemContext object — a
 *  direct `done` invocation builds its own context, never carries the memo, and stays authoritative. */
const preflighted = new WeakSet<WorkItemContext>();

/** LAND'S PRE-FLIGHT (owner amendment 2026-09-01): when the walk will reach done and no override was
 *  given, the bar (and its pairing) is proven BEFORE any board mutation — a red bar refuses with the
 *  row exactly as it was, instead of spending claim/review/verify writes on a close that could never
 *  happen. Skipped when Status is already Done (done's gate is skipped there too — convergence). */
export function preflightDodAtLand(work: WorkItemContext): void {
  if (currentValue(work.item, "Status")?.toLowerCase() === "done") {
    return;
  }
  enforceDodAtClose(work, null);
  preflighted.add(work);
}

/** The close gate. Returns the override COMMENT BODY when `--force-close --reason` was given (the caller
 *  posts it through the one idempotent comment door), null when the close may proceed silently; throws on
 *  every refusal. Both pairing sides must agree before anything executes: an unstamped block (an issue
 *  author cannot write Project fields) is never run, and a stamped-but-edited block refuses by name. */
export function enforceDodAtClose(work: WorkItemContext, override: string | null): string | null {
  // A green land pre-flight already proved this exact context seconds ago in this process — running
  // the bar again would double-execute it on every happy-path land.
  if (override === null && preflighted.has(work)) {
    return null;
  }
  const issue = work.target.number;
  const command = extractDod(work.target.body);
  const stamp = currentValue(work.item, DOD_FIELD);
  if (command === null && stamp === undefined) {
    if (override !== null) {
      throw new Error(`#${issue} has no DoD — --force-close only overrides a bar that exists`);
    }
    return null;
  }
  if (override !== null) {
    return `DoD override — ${override}\n\nOverridden DoD:\n\`\`\`\n${command ?? "(no dod block in the issue body)"}\n\`\`\``;
  }
  if (command === null) {
    throw new Error(
      `#${issue} carries a DoD stamp but its issue body has no \`\`\`dod block — the bar was deleted; restore it with work:item dod ${issue} --cmd '<cmd>' or close with --force-close --reason`,
    );
  }
  if (stamp === undefined) {
    throw new Error(
      `#${issue}'s issue body carries a \`\`\`dod block that was never minted through work:item — refusing to run it; adopt it (red-first) with work:item dod ${issue}, or remove the block`,
    );
  }
  if (stamp !== dodStamp(command)) {
    throw new Error(
      `#${issue}'s DoD block does not match its stamp — the bar was edited without re-minting; re-mint (red-first) with work:item dod ${issue} --cmd '<cmd>' or close with --force-close --reason`,
    );
  }
  const run = runDod(command);
  if (run.status === null) {
    throw new Error(`DoD did not complete within ${DOD_TIMEOUT_MS}ms — refusing to close #${issue}.\nran: ${command}`);
  }
  if (run.status !== 0) {
    throw new Error(`DoD is red — refusing to close #${issue}.\nran: ${command}\nexit: ${run.status}\noutput:\n${run.output}`);
  }
  return null;
}

/** The first thing a fresh board hits: the DoD TEXT field must exist on the Project before a bar can
 *  be stamped. Append the one-time deployment step to the refusal so the fix needs no doc dig. */
export function withDodFieldHint<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof Error && error.message.includes(`no field named ${DOD_FIELD}`)) {
      error.message = `${error.message} — add a TEXT field named ${DOD_FIELD} to Project ${PROJECT_NUMBER} once (project settings → Fields → New field → Text), then rerun`;
    }
    throw error;
  }
}

function refuseUncheckableKind(work: WorkItemContext): void {
  const kind = currentValue(work.item, "Kind")?.toLowerCase();
  if (kind === "decision" || kind === "program") {
    throw new Error(
      kind === "decision" ? "a decision closes on an owner ruling — a DoD does not apply" : "a program closes on its child rows — a DoD does not apply",
    );
  }
}

/** Mint (or re-mint) a row's bar: upsert the body block — GitHub's body edit history is the visible
 *  trace — then stamp the Project field. The caller has ALREADY proven the command red (mint order:
 *  red-first before any board write). Decision/program rows refuse — their closes are not machine-
 *  checkable (the #923 fit table). */
export function writeDod(work: WorkItemContext, command: string): void {
  refuseUncheckableKind(work);
  gh(["issue", "edit", String(work.target.number), "--repo", REPOSITORY, "--body", upsertDodBlock(work.target.body, command)]);
  withDodFieldHint(() => writeFields(work.item, [{ name: DOD_FIELD, value: dodStamp(command) }], "WorkItemFields"));
}

/** ADOPT the body's existing block (#923 P5 — the issue-form ingress: a `render: dod` textarea lands
 *  the fence in the body with no stamp, so the row cannot close until someone proves the bar red and
 *  stamps it — exactly this verb, bare: `work:item dod <n>`). No body write: the block IS the bar. */
export function adoptDod(work: WorkItemContext): void {
  refuseUncheckableKind(work);
  const command = extractDod(work.target.body);
  if (command === null) {
    throw new Error(`#${work.target.number} has no \`\`\`dod block to adopt — pass the bar explicitly: work:item dod ${work.target.number} --cmd '<cmd>'`);
  }
  // The body is data, not argv — a spelling refusal here is an operational error (exit 2), not misuse.
  try {
    validateDodCommand(command);
  } catch (error) {
    throw error instanceof UsageError ? new Error(`#${work.target.number}'s dod block is not adoptable: ${error.message}`) : error;
  }
  requireRedDodAtMint(command);
  withDodFieldHint(() => writeFields(work.item, [{ name: DOD_FIELD, value: dodStamp(command) }], "WorkItemFields"));
}
