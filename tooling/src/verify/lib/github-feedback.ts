// GitHub output is a projection of completed native results, never a second verdict authority.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import type { StageResult, VerifyReport } from "../contract/stage.ts";
import { producedNoVerdict } from "./exit-classifiers.ts";

const SUMMARY_BYTES = 61_440;
const HIGH_SURROGATE_MIN = 0xd8_00;
const HIGH_SURROGATE_MAX = 0xdb_ff;
const MIN_FENCE_LENGTH = 3;
const FENCE_OVERHEAD_BYTES = 16;
const FENCED_PARTS = 3;
const TRUNCATED = "\n[excerpt truncated; read reports/verify.json]";

function commandData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}
function commandProperty(value: string): string {
  return commandData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}
function status(stage: StageResult): string {
  if (producedNoVerdict(stage)) {
    return "TOOL-ERROR / no verdict";
  }
  if (stage.mode === "deferred" || stage.mode === "skipped") {
    return stage.notices.length === 0 ? stage.mode : `${stage.mode} — ${stage.notices.join("; ")}`;
  }
  return stage.ok ? "passed" : "failed";
}

/** A live title cannot know the child's future exit or measured duration. */
export function startGithubStage(name: string, env: NodeJS.ProcessEnv = inheritedProcessEnv()): void {
  if (env["GITHUB_ACTIONS"] === "true") {
    process.stdout.write(`::group::${commandData(name)} (running)\n`);
  }
}

/** Close a live group with its measured result; completed transcripts need no running placeholder. */
export function finishGithubStage(stage: StageResult, transcript: string, streamed: boolean, env: NodeJS.ProcessEnv = inheritedProcessEnv()): void {
  if (env["GITHUB_ACTIONS"] !== "true") {
    return;
  }
  const title = `${stage.name} (${status(stage)}, ${stage.durationMs}ms)`;
  if (streamed) {
    process.stdout.write(`\n${title}\n::endgroup::\n`);
  } else {
    process.stdout.write(`::group::${commandData(title)}\n${transcript}${transcript.endsWith("\n") ? "" : "\n"}::endgroup::\n`);
  }
}

function annotation(stage: StageResult): string {
  const excerpt = stage.failureExcerpt ?? "No failure excerpt recorded; see the native stage log.";
  const first = excerpt.split(/\r?\n/u).find((line) => line.trim() !== "") ?? "No failure line recorded.";
  const child =
    stage.childExit === undefined && stage.partitionResults !== undefined
      ? stage.partitionResults.map(({ key, result }) => `${key}=${String(result.childExit ?? (result.childExit === null ? "null" : "unrecorded"))}`).join(", ")
      : String(stage.childExit ?? (stage.childExit === null ? "null" : "unrecorded"));
  const kind = producedNoVerdict(stage) ? `TOOL-ERROR (child exit ${child}): ` : "";
  const timeout =
    stage.name === "quality:mutation-gate" && /(?:initial test run|dry[ -]?run)[^\n]*(?:timed? out|timeout)/iu.test([excerpt, ...stage.notices].join("\n"))
      ? "dry run timed out: "
      : "";
  return `::error title=${commandProperty(stage.name)}::${commandData(`${kind}${timeout}${first}`)}\n`;
}
function cell(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("|", "\\|").replaceAll(/\r?\n/gu, " ");
}
function fitUtf8(value: string, bytes: number): string {
  let end = Math.min(value.length, bytes);
  while (Buffer.byteLength(value.slice(0, end), "utf8") > bytes) {
    end -= 1;
  }
  const previous = value.charCodeAt(end - 1);
  if (previous >= HIGH_SURROGATE_MIN && previous <= HIGH_SURROGATE_MAX) {
    end -= 1;
  }
  return value.slice(0, end);
}
function summary(report: VerifyReport, remaining: number): string {
  let output = `\n### Verify ${cell(report.tier)} (${cell(report.scope)})\n\nNative source: reports/verify.json\n\n| Stage | Status | Duration |\n| - | - | - |\n`;
  for (const stage of report.stages) {
    output += `| ${cell(stage.name)} | ${status(stage)} | ${stage.durationMs}ms |\n`;
  }
  if (Buffer.byteLength(output) > remaining) {
    return fitUtf8(output, Math.max(0, remaining - Buffer.byteLength(TRUNCATED))) + TRUNCATED;
  }
  const failures = report.stages.filter((stage) => !stage.ok || producedNoVerdict(stage));
  for (const [index, stage] of failures.entries()) {
    const excerpt = stage.failureExcerpt ?? "No failure excerpt recorded; see the native stage log.";
    const caption = `\n#### ${cell(stage.name)}\n\n`;
    const allocation = Math.floor((remaining - Buffer.byteLength(output)) / (failures.length - index));
    // Reserve two fences as long as the retained excerpt, even if every retained character is a backtick.
    const bodyBytes = Math.floor((allocation - Buffer.byteLength(caption) - FENCE_OVERHEAD_BYTES) / FENCED_PARTS);
    if (bodyBytes < Buffer.byteLength(TRUNCATED)) {
      break;
    }
    const body = Buffer.byteLength(excerpt) <= bodyBytes ? excerpt : fitUtf8(excerpt, bodyBytes - Buffer.byteLength(TRUNCATED)) + TRUNCATED;
    const fence = "`".repeat(Math.max(MIN_FENCE_LENGTH, ...[...body.matchAll(/`+/gu)].map((match) => match[0].length + 1)));
    output += `${caption}${fence}text\n${body}\n${fence}\n`;
  }
  return output;
}

/** Annotations and bounded Markdown retain the native failure class, excerpt and measured timings. */
export function printGithubReport(report: VerifyReport, env: NodeJS.ProcessEnv = inheritedProcessEnv()): void {
  if (env["GITHUB_ACTIONS"] === "true") {
    for (const stage of report.stages) {
      if (!stage.ok || producedNoVerdict(stage)) {
        process.stdout.write(annotation(stage));
      }
    }
  }
  const path = env["GITHUB_STEP_SUMMARY"];
  if (path === undefined || path === "") {
    return;
  }
  const used = existsSync(path) ? readFileSync(path).byteLength : 0;
  if (used >= SUMMARY_BYTES) {
    return;
  }
  const text = summary(report, SUMMARY_BYTES - used);
  if (Buffer.byteLength(text) <= SUMMARY_BYTES - used) {
    appendFileSync(path, text);
  }
}
