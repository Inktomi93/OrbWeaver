#!/usr/bin/env node
/**
 * Read-only, redacted census of rendered-tool invocations in Claude Code transcripts.
 *
 * The output contains aggregate counts only: no commands, prompts, URLs, transcript paths,
 * artifact paths, result bodies, tokens, or cookies leave memory. Top-level tool_use blocks
 * are paired to top-level tool_result blocks by id; progress/nested copies are excluded and
 * duplicate ids are counted once per account.
 *
 * Usage:
 *   node scripts/research/agent-cli-artifact-census.ts --out <aggregate.json>
 */

import { createReadStream } from "node:fs";
import { readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";

type Account = "claude" | "claude-b";
const FAMILIES = ["snap", "design-audit", "motion-audit", "perf-meter", "record"] as const;
type Family = (typeof FAMILIES)[number];
const OUTCOMES = ["success", "misuse", "tool-error", "violation", "unpaired"] as const;
type Outcome = (typeof OUTCOMES)[number];
type Scope = "main" | "subagent";

interface ContentItem {
  type?: string;
  text?: string;
  name?: string;
  id?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface TranscriptRecord {
  type?: string;
  timestamp?: string;
  isSidechain?: boolean;
  cwd?: string;
  message?: { content?: ContentItem[] };
  toolUseResult?: unknown;
}

interface Denominator {
  files: number;
  bytes: number;
  lines: number;
  parsedRecords: number;
  parseErrors: number;
  topLevelToolUses: number;
  bashToolUses: number;
  topLevelToolResults: number;
  pairedToolResults: number;
  unpairedToolUses: number;
  unpairedToolResults: number;
  duplicateToolUseIds: number;
  duplicateToolResultIds: number;
  nestedOrProgressToolUseLines: number;
  proseOnlyMentions: number;
  nonInvocationBashMentions: number;
  resultContentShapes: Record<string, number>;
  toolUseResultShapes: Record<string, number>;
  analysisTruncatedResultBodies: number;
}

interface CommandInvocation {
  family: Family;
  account: Account;
  fileKey: string;
  line: number;
  toolOrdinal: number;
  timestamp: string | null;
  scope: Scope;
  projectKind: "project" | "worktree";
  form: "pnpm" | "direct";
  commandName: string;
  flags: string[];
  flagBases: string[];
  signature: string;
  resultPaired: boolean;
  outcome: Outcome;
  rootCause: string | null;
  artifactCandidates: ArtifactCandidate[];
  createdExtensions: Set<string>;
  consumptionEvents: Array<{ method: string; extension: string }>;
  clickStripPngReads: number;
  gifWebmReads: number;
  downstream: Set<string>;
  retry: boolean;
  correctedRetry: boolean;
}

interface PendingUse {
  account: Account;
  fileKey: string;
  timestamp: string | null;
  inputText: string;
  invocations: CommandInvocation[];
}

interface ArtifactCandidate {
  value: string;
  kind: "file" | "directory" | "prefix";
  extension: string;
  clickStrip: boolean;
}

interface FamilyAggregate {
  invocations: number;
  paired: number;
  outcomes: Record<Outcome, number>;
  firstUse: string | null;
  lastUse: string | null;
  forms: Record<string, number>;
  scopes: Record<string, number>;
  projectKinds: Record<string, number>;
  commandNames: Record<string, number>;
  flags: Record<string, number>;
  flagBases: Record<string, number>;
  rootCauses: Record<string, number>;
  retries: number;
  correctedRetries: number;
  artifactsCreated: Record<string, number>;
  artifactConsumptionMethods: Record<string, number>;
  artifactConsumptionExtensions: Record<string, number>;
  clickStripPngReads: number;
  gifWebmReads: number;
  downstreamExplicitReferences: Record<string, number>;
}

const RESULT_TEXT_LIMIT = 1_000_000;
const ACTIVE_TOOL_WINDOW = 60;
const ACTIVE_TIME_WINDOW_MS = 4 * 60 * 60 * 1000;
const RETRY_TOOL_WINDOW = 12;
const RETRY_TIME_WINDOW_MS = 60 * 60 * 1000;
// A transcript may spell an artifact path absolutely or repo-relative, so the absolute arm is DERIVED from
// the checkout this runs in (`node scripts/research/… ` from the repo root) rather than any one box's path.
const REPO_PREFIX_RE_SOURCE = `${process.cwd().replace(/\/+$/, "")}/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const REPORT_PATH_RE = new RegExp(`(?:^|[\\s'"\`(])((?:${REPO_PREFIX_RE_SOURCE})?(?:reports|artifacts|screenshots?)\\/[A-Za-z0-9_@./=+:-]+)`, "g");
const TMP_PATH_RE = /(?:^|[\s'"`(])(\/tmp\/[A-Za-z0-9_@./=+:-]+)/g;
const FILE_PATH_RE = /(?:^|[\s'"`(])((?:\/|\.{0,2}\/)?[A-Za-z0-9_@./=+:-]+\.(?:png|json|har|html|gif|webm|mp4|zip|trace|txt|md))/gi;
const TARGET_MENTION_RE =
  /\b(?:pnpm\s+(?:run\s+)?(?:snap|design-audit|ui-audit|motion-audit|perf-meter|cpu-profile|record|screen-record)|tooling\/src\/(?:snap|ui-audit|motion-audit|cpu-profile|screen-record)\/cli\.ts|scripts\/probes\/snap\.ts)\b/i;
const FLAG_RE = /^--?[A-Za-z][A-Za-z0-9-]*(?:@\d+)?(?:=.*)?$/;
const MISUSE_RE =
  /(?:\bARG ERROR\b|\bNAV ERROR\b|unknown (?:flag|option|argument)|missing required|requires (?:a value|--[a-z])|usage:\s*(?:pnpm|node)[^\n]*(?:snap|audit|profile|record)|invalid (?:flag|argument|duration|viewport|route)|expected (?:one of|a value for))/i;
const MISUSE_WITHOUT_USAGE_RE =
  /(?:\bARG ERROR\b|\bNAV ERROR\b|unknown (?:flag|option|argument)|missing required|requires (?:a value|--[a-z])|invalid (?:flag|argument|duration|viewport|route)|expected (?:one of|a value for))/i;
const VIOLATION_RE = /(?:tool use denied|blocked by (?:hook|policy)|policy violation|guard violation|not allowed by policy)/i;
const TOOL_ERROR_RE = /(?:Command timed out after|Exit code [1-9]\d*|process exited with code [1-9]\d*|<tool_use_error>)/i;

const argv = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (argv[index + 1] ?? fallback);
}

const home = os.homedir();
const accountRoots: Record<Account, string> = {
  claude: option("claude-root", path.join(home, ".claude/projects")),
  "claude-b": option("claude-b-root", path.join(home, ".claude-b/projects")),
};
const outPath = option("out", "");

function emptyDenominator(): Denominator {
  return {
    files: 0,
    bytes: 0,
    lines: 0,
    parsedRecords: 0,
    parseErrors: 0,
    topLevelToolUses: 0,
    bashToolUses: 0,
    topLevelToolResults: 0,
    pairedToolResults: 0,
    unpairedToolUses: 0,
    unpairedToolResults: 0,
    duplicateToolUseIds: 0,
    duplicateToolResultIds: 0,
    nestedOrProgressToolUseLines: 0,
    proseOnlyMentions: 0,
    nonInvocationBashMentions: 0,
    resultContentShapes: {},
    toolUseResultShapes: {},
    analysisTruncatedResultBodies: 0,
  };
}

const denominators: Record<Account, Denominator> = {
  claude: emptyDenominator(),
  "claude-b": emptyDenominator(),
};
const seenUseIds = new Set<string>();
const seenResultIds = new Set<string>();
const allPending = new Map<string, PendingUse>();
const invocations: CommandInvocation[] = [];

function bump(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

function valueShape(value: unknown): string {
  if (value === null || value === undefined) {
    return "absent";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

async function findFiles(root: string): Promise<Array<{ file: string; bytes: number }>> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".jsonl"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => file.toLowerCase().includes("orbweaver"))
    .map((file) => ({ file, bytes: 0 }));
}

function splitShell(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  for (let index = 0; index < command.length; index++) {
    const char = command[index] ?? "";
    const next = command[index + 1] ?? "";
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n" || char === ";" || char === "|" || (char === "&" && next === "&")) {
      if (current.trim()) {
        segments.push(current.trim());
      }
      current = "";
      if ((char === "|" && next === "|") || (char === "&" && next === "&")) {
        index++;
      }
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    segments.push(current.trim());
  }
  return segments;
}

function withoutHeredocBodies(command: string): string {
  const retained: string[] = [];
  let delimiter: string | null = null;
  let stripTabs = false;
  for (const line of command.split(/\r?\n/u)) {
    if (delimiter) {
      const candidate = stripTabs ? line.replace(/^\t+/, "") : line;
      if (candidate.trimEnd() === delimiter) {
        delimiter = null;
        stripTabs = false;
      }
      continue;
    }
    retained.push(line);
    const match = line.match(/<<(-)?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/);
    if (match?.[2]) {
      stripTabs = Boolean(match[1]);
      delimiter = match[2];
    }
  }
  return retained.join("\n");
}

function shellTokens(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  const push = (): void => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };
  for (const char of segment) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
    } else if (/\s/.test(char)) {
      push();
    } else {
      current += char;
    }
  }
  push();
  return tokens;
}

function stripCommandPrefixes(tokens: string[]): string[] {
  let index = 0;
  while (index < tokens.length && /^(?:\(+|\{+|if|then|do|command|builtin|sudo)$/.test(tokens[index] ?? "")) {
    index++;
  }
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] ?? "")) {
    index++;
  }
  if (tokens[index] === "env") {
    index++;
    while (index < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] ?? "") || (tokens[index] ?? "").startsWith("-"))) {
      index++;
    }
  }
  if (tokens[index] === "timeout") {
    index += 2;
  }
  if (tokens[index] === "nice") {
    index++;
    if (tokens[index] === "-n") {
      index += 2;
    }
  }
  return tokens.slice(index);
}

function aliasFamily(name: string): Family | null {
  if (name === "snap") {
    return "snap";
  }
  if (name === "design-audit" || name === "ui-audit") {
    return "design-audit";
  }
  if (name === "motion-audit") {
    return "motion-audit";
  }
  if (name === "perf-meter" || name === "cpu-profile") {
    return "perf-meter";
  }
  if (name === "record" || name === "screen-record") {
    return "record";
  }
  return null;
}

function directFamily(token: string): Family | null {
  const normalized = token.replaceAll("\\", "/");
  if (/tooling\/src\/snap\/cli\.ts$|scripts\/probes\/snap(?:-stage)?\.ts$/.test(normalized)) {
    return "snap";
  }
  if (/tooling\/src\/ui-audit\/cli\.ts$/.test(normalized)) {
    return "design-audit";
  }
  if (/tooling\/src\/motion-audit\/cli\.ts$/.test(normalized)) {
    return "motion-audit";
  }
  if (/tooling\/src\/cpu-profile\/cli\.ts$/.test(normalized)) {
    return "perf-meter";
  }
  if (/tooling\/src\/screen-record\/cli\.ts$/.test(normalized)) {
    return "record";
  }
  return null;
}

function normalizeFlag(token: string): { exact: string; base: string } | null {
  if (!FLAG_RE.test(token)) {
    return null;
  }
  const exact = token.split("=", 1)[0] ?? token;
  return { exact, base: exact.replace(/@\d+$/, "") };
}

interface ParsedInvocation {
  family: Family;
  form: "pnpm" | "direct";
  commandName: string;
  args: string[];
}

function parseSegment(segment: string): ParsedInvocation | null {
  const tokens = stripCommandPrefixes(shellTokens(segment));
  if (tokens.length === 0) {
    return null;
  }
  const runner = path.basename(tokens[0] ?? "");
  if (runner === "pnpm" || runner === "npm" || runner === "yarn") {
    let index = 1;
    if (tokens[index] === "run") {
      index++;
    }
    while (tokens[index]?.startsWith("--")) {
      if (tokens[index] === "--dir" || tokens[index] === "--cwd") {
        index += 2;
      } else {
        index++;
      }
    }
    if (tokens[index] === "exec") {
      index++;
      if (/^(?:tsx|node)$/.test(path.basename(tokens[index] ?? ""))) {
        index++;
      }
      const directIndex = tokens.findIndex((token, tokenIndex) => tokenIndex >= index && directFamily(token) !== null);
      if (directIndex !== -1) {
        const family = directFamily(tokens[directIndex] ?? "");
        return family ? { family, form: "direct", commandName: path.basename(tokens[directIndex] ?? ""), args: tokens.slice(directIndex + 1) } : null;
      }
      return null;
    }
    const commandName = tokens[index] ?? "";
    const family = aliasFamily(commandName);
    return family ? { family, form: "pnpm", commandName, args: tokens.slice(index + 1) } : null;
  }
  if (/^(?:node|tsx|npx)$/.test(runner) || runner.endsWith("tsx")) {
    const directIndex = tokens.findIndex((token, index) => index > 0 && directFamily(token) !== null);
    if (directIndex !== -1) {
      const family = directFamily(tokens[directIndex] ?? "");
      return family ? { family, form: "direct", commandName: path.basename(tokens[directIndex] ?? ""), args: tokens.slice(directIndex + 1) } : null;
    }
  }
  return null;
}

function parseInvocations(command: string): ParsedInvocation[] {
  return splitShell(withoutHeredocBodies(command))
    .map(parseSegment)
    .filter((value): value is ParsedInvocation => value !== null);
}

function safeString(value: unknown, limit = RESULT_TEXT_LIMIT): { text: string; truncated: boolean } {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value ?? "");
    } catch {
      text = "";
    }
  }
  return text.length > limit ? { text: text.slice(0, limit), truncated: true } : { text, truncated: false };
}

function extensionOf(value: string): string {
  const clean = value.replace(/[),.;:'"`]+$/, "");
  const extension = path.extname(clean).toLowerCase();
  return /^\.(?:png|json|har|html|gif|webm|mp4|zip|trace|txt|md)$/.test(extension) ? extension.slice(1) : "directory";
}

function normalizeCandidate(value: string, cwd: string | undefined, kindHint?: "file" | "directory" | "prefix"): ArtifactCandidate | null {
  const clean = value.replace(/[),.;:'"`]+$/, "");
  const extension = extensionOf(clean);
  if (
    !(
      clean.startsWith(`${os.tmpdir()}${path.sep}`) ||
      clean.includes("reports/") ||
      clean.includes("artifacts/") ||
      clean.includes("screenshots/") ||
      extension !== "directory"
    )
  ) {
    return null;
  }
  const absolute = path.isAbsolute(clean) ? path.normalize(clean) : path.resolve(cwd ?? process.cwd(), clean);
  return {
    value: absolute,
    kind: kindHint ?? (extension === "directory" ? "directory" : "file"),
    extension,
    clickStrip: /(?:click(?:-?strip|\d+)|shot-strip)/i.test(path.basename(clean)),
  };
}

function pathsFromText(text: string, cwd: string | undefined): ArtifactCandidate[] {
  const candidates: ArtifactCandidate[] = [];
  for (const regex of [REPORT_PATH_RE, TMP_PATH_RE, FILE_PATH_RE]) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const candidate = normalizeCandidate(match[1] ?? "", cwd);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function outputCandidates(args: string[], cwd: string | undefined): ArtifactCandidate[] {
  const candidates: ArtifactCandidate[] = [];
  for (let index = 0; index < args.length; index++) {
    const token = args[index] ?? "";
    const equal = token.match(/^--(?:out|name)=(.+)$/);
    const value = equal?.[1] ?? (/^--(?:out|name)$/.test(token) ? args[index + 1] : undefined);
    if (value && !value.startsWith("-")) {
      const clean = value.replace(/[),.;:'"`]+$/, "");
      const absolute = path.isAbsolute(clean) ? path.normalize(clean) : path.resolve(cwd ?? process.cwd(), clean);
      candidates.push({ value: absolute, kind: "prefix", extension: "directory", clickStrip: false });
    }
  }
  return candidates;
}

function dedupeCandidates(candidates: ArtifactCandidate[]): ArtifactCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function classifyRootCause(text: string): string | null {
  if (/Command timed out after|\btimeout|timed out/i.test(text)) {
    return "timeout";
  }
  if (/ARG ERROR|unknown (?:flag|option|argument)|missing required|requires (?:a value|--[a-z])|invalid (?:flag|argument|duration)/i.test(text)) {
    return "argv";
  }
  if (/NAV ERROR|route (?:not found|failed)|navigation/i.test(text)) {
    return "navigation";
  }
  if (/locator|selector|strict mode violation|element (?:not found|is not)/i.test(text)) {
    return "selector";
  }
  if (/ECONNREFUSED|ERR_CONNECTION|failed to connect|server (?:not running|unavailable)/i.test(text)) {
    return "environment";
  }
  if (/blocked by (?:hook|policy)|policy violation|guard violation/i.test(text)) {
    return "policy";
  }
  if (/missing (?:asset|binary|dependency)|not installed|ENOENT/i.test(text)) {
    return "missing-asset";
  }
  if (/INSTRUMENT ERROR|PROBE|no (?:findings|samples|frames)/i.test(text)) {
    return "instrumentation";
  }
  return null;
}

function classifyOutcome(item: ContentItem, rec: TranscriptRecord, resultText: string, requestedHelp: boolean): Outcome {
  if (VIOLATION_RE.test(resultText)) {
    return "violation";
  }
  if ((requestedHelp ? MISUSE_WITHOUT_USAGE_RE : MISUSE_RE).test(resultText)) {
    return "misuse";
  }
  const interrupted =
    typeof rec.toolUseResult === "object" &&
    rec.toolUseResult !== null &&
    "interrupted" in rec.toolUseResult &&
    Boolean((rec.toolUseResult as { interrupted?: unknown }).interrupted);
  if (item.is_error === true || interrupted || TOOL_ERROR_RE.test(resultText)) {
    return "tool-error";
  }
  return "success";
}

function timestampMs(timestamp: string | null): number | null {
  const value = Date.parse(timestamp ?? "");
  return Number.isFinite(value) ? value : null;
}

function candidateCovers(candidate: ArtifactCandidate, inputCandidate: ArtifactCandidate): boolean {
  if (candidate.kind === "directory") {
    return inputCandidate.value.startsWith(`${candidate.value}${path.sep}`) || inputCandidate.value === candidate.value;
  }
  if (candidate.kind === "prefix") {
    return (
      inputCandidate.value === candidate.value ||
      inputCandidate.value.startsWith(`${candidate.value}-`) ||
      inputCandidate.value.startsWith(`${candidate.value}.`) ||
      inputCandidate.value.startsWith(`${candidate.value}${path.sep}`) ||
      path.basename(inputCandidate.value).startsWith(`${path.basename(candidate.value)}-`)
    );
  }
  return inputCandidate.value === candidate.value;
}

function artifactMethod(toolName: string, inputText: string): string {
  if (toolName === "Read" || /view_image$/i.test(toolName)) {
    return "opened";
  }
  if (toolName === "Bash" && /\b(?:cat|jq|less|head|tail|sed|awk|file|identify|ffprobe|python|node)\b/.test(inputText)) {
    return "parsed";
  }
  if (toolName === "Bash" && /\b(?:ls|find|stat|du)\b/.test(inputText)) {
    return "listed";
  }
  return "cited";
}

function downstreamKind(toolName: string, input: Record<string, unknown> | undefined, inputText: string): string | null {
  let destination = "";
  if (typeof input?.["file_path"] === "string") {
    destination = input["file_path"];
  } else if (typeof input?.["path"] === "string") {
    destination = input["path"];
  }
  if (/^(?:Write|Edit|MultiEdit|apply_patch)$/i.test(toolName) && /docs\/reviews\//.test(destination)) {
    return "report";
  }
  if (toolName === "Bash" && /\b(?:gh\s+issue\s+create|pnpm\s+work:item)\b/.test(inputText)) {
    return "issue";
  }
  if (/^(?:Write|Edit|MultiEdit|apply_patch)$/i.test(toolName) && destination && !/docs\/reviews\//.test(destination)) {
    return "fix";
  }
  if (toolName === "Bash" && /\bgit\s+commit\b/.test(inputText)) {
    return "commit";
  }
  return null;
}

function isReportReader(command: string): boolean {
  return parseInvocations(command).some((entry) => entry.family === "snap" && (entry.args[0] === "--report" || entry.args[0] === "--reports"));
}

function observeArtifactConsumption(
  active: CommandInvocation[],
  item: ContentItem,
  cwd: string | undefined,
  toolOrdinal: number,
  timestamp: string | null,
): void {
  const inputSafe = safeString(item.input ?? {}, RESULT_TEXT_LIMIT);
  const inputText = inputSafe.text;
  const inputCandidates = dedupeCandidates(pathsFromText(inputText, cwd));
  const now = timestampMs(timestamp);
  const command = item.name === "Bash" && typeof item.input?.["command"] === "string" ? item.input["command"] : "";
  const reportReader = command ? isReportReader(command) : false;
  for (const invocation of active) {
    const useTime = timestampMs(invocation.timestamp);
    if (toolOrdinal - invocation.toolOrdinal > ACTIVE_TOOL_WINDOW) {
      continue;
    }
    if (now !== null && useTime !== null && now - useTime > ACTIVE_TIME_WINDOW_MS) {
      continue;
    }
    const matchedInputs = inputCandidates.filter((inputCandidate) =>
      invocation.artifactCandidates.some((candidate) => candidateCovers(candidate, inputCandidate)),
    );
    if (matchedInputs.length > 0) {
      const method = artifactMethod(item.name ?? "", inputText);
      for (const matchedInput of matchedInputs) {
        invocation.consumptionEvents.push({ method, extension: matchedInput.extension });
        if (method === "opened" && matchedInput.clickStrip && matchedInput.extension === "png") {
          invocation.clickStripPngReads++;
        }
        if ((method === "opened" || method === "parsed") && (matchedInput.extension === "gif" || matchedInput.extension === "webm")) {
          invocation.gifWebmReads++;
        }
      }
      const downstream = downstreamKind(item.name ?? "", item.input, inputText);
      if (downstream) {
        invocation.downstream.add(downstream);
      }
    }
    if (matchedInputs.length === 0 && reportReader && invocation.family === "snap") {
      invocation.consumptionEvents.push({ method: "report-reader", extension: "run" });
    }
  }
}

function contentTextMentionsTarget(items: ContentItem[]): boolean {
  return items.some((item) => item.type === "text" && typeof item.text === "string" && TARGET_MENTION_RE.test(item.text));
}

function createInvocation(
  parsed: ParsedInvocation,
  account: Account,
  fileKey: string,
  line: number,
  toolOrdinal: number,
  timestamp: string | null,
  scope: Scope,
  projectKind: "project" | "worktree",
  cwd: string | undefined,
): CommandInvocation {
  const normalizedFlags = parsed.args.map(normalizeFlag).filter((flag): flag is { exact: string; base: string } => flag !== null);
  const signature = `${parsed.form}:${parsed.commandName}:${normalizedFlags.map((flag) => flag.exact).join(",")}`;
  return {
    family: parsed.family,
    account,
    fileKey,
    line,
    toolOrdinal,
    timestamp,
    scope,
    projectKind,
    form: parsed.form,
    commandName: parsed.commandName,
    flags: normalizedFlags.map((flag) => flag.exact),
    flagBases: normalizedFlags.map((flag) => flag.base),
    signature,
    resultPaired: false,
    outcome: "unpaired",
    rootCause: null,
    artifactCandidates: outputCandidates(parsed.args, cwd),
    createdExtensions: new Set(),
    consumptionEvents: [],
    clickStripPngReads: 0,
    gifWebmReads: 0,
    downstream: new Set(),
    retry: false,
    correctedRetry: false,
  };
}

async function processFile(account: Account, file: string, fileIndex: number, fileTotal: number): Promise<void> {
  const denominator = denominators[account];
  denominator.files++;
  try {
    denominator.bytes += (await stat(file)).size;
  } catch {
    // The stream open below remains authoritative; a concurrent transcript rotation is disclosed by its error.
  }
  const fileKey = `${account}:${file}`;
  const projectKind = file.includes("--claude-worktrees-") ? "worktree" : "project";
  const active: CommandInvocation[] = [];
  let lineNumber = 0;
  let toolOrdinal = 0;
  const stream = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of stream) {
    lineNumber++;
    denominator.lines++;
    if (!(line.includes('"tool_use"') || line.includes('"tool_result"') || TARGET_MENTION_RE.test(line))) {
      continue;
    }
    let rec: TranscriptRecord;
    try {
      rec = JSON.parse(line) as TranscriptRecord;
      denominator.parsedRecords++;
    } catch {
      denominator.parseErrors++;
      continue;
    }
    const items = Array.isArray(rec.message?.content) ? rec.message.content : [];
    const topLevelUses = rec.type === "assistant" ? items.filter((item) => item.type === "tool_use") : [];
    const topLevelResults = rec.type === "user" ? items.filter((item) => item.type === "tool_result") : [];
    if (line.includes('"tool_use"') && topLevelUses.length === 0) {
      denominator.nestedOrProgressToolUseLines++;
    }
    if (contentTextMentionsTarget(items) && topLevelUses.length === 0) {
      denominator.proseOnlyMentions++;
    }

    for (const item of topLevelUses) {
      toolOrdinal++;
      denominator.topLevelToolUses++;
      if (item.name === "Bash") {
        denominator.bashToolUses++;
      }
      observeArtifactConsumption(active, item, rec.cwd, toolOrdinal, rec.timestamp ?? null);
      const useId = item.id ?? `${fileKey}:${lineNumber}:${toolOrdinal}`;
      const globalId = `${account}:${useId}`;
      if (seenUseIds.has(globalId)) {
        denominator.duplicateToolUseIds++;
        continue;
      }
      seenUseIds.add(globalId);
      const command = item.name === "Bash" && typeof item.input?.["command"] === "string" ? item.input["command"] : "";
      const parsed = command ? parseInvocations(command) : [];
      if (command && TARGET_MENTION_RE.test(command) && parsed.length === 0) {
        denominator.nonInvocationBashMentions++;
      }
      const uses: CommandInvocation[] = [];
      for (const entry of parsed) {
        uses.push(
          createInvocation(
            entry,
            account,
            fileKey,
            lineNumber,
            toolOrdinal,
            rec.timestamp ?? null,
            rec.isSidechain || file.includes("/subagents/") ? "subagent" : "main",
            projectKind,
            rec.cwd,
          ),
        );
      }
      invocations.push(...uses);
      allPending.set(globalId, {
        account,
        fileKey,
        timestamp: rec.timestamp ?? null,
        inputText: safeString(item.input ?? {}).text,
        invocations: uses,
      });
    }

    for (const item of topLevelResults) {
      denominator.topLevelToolResults++;
      const resultId = item.tool_use_id ?? "";
      const globalId = `${account}:${resultId}`;
      if (seenResultIds.has(globalId)) {
        denominator.duplicateToolResultIds++;
        continue;
      }
      seenResultIds.add(globalId);
      bump(denominator.resultContentShapes, valueShape(item.content));
      bump(denominator.toolUseResultShapes, valueShape(rec.toolUseResult));
      const pending = allPending.get(globalId);
      if (!pending) {
        denominator.unpairedToolResults++;
        continue;
      }
      allPending.delete(globalId);
      denominator.pairedToolResults++;
      const itemText = safeString(item.content);
      const siblingText = safeString(rec.toolUseResult);
      if (itemText.truncated || siblingText.truncated) {
        denominator.analysisTruncatedResultBodies++;
      }
      const resultText = `${itemText.text}\n${siblingText.text}`;
      for (const invocation of pending.invocations) {
        invocation.resultPaired = true;
        invocation.outcome = classifyOutcome(item, rec, resultText, invocation.flagBases.includes("--help") || invocation.flags.includes("-h"));
        invocation.rootCause = invocation.outcome === "success" ? null : classifyRootCause(resultText);
        const resultCandidates = pathsFromText(resultText, rec.cwd);
        const recordingPrefixes =
          invocation.family === "record"
            ? resultCandidates
                .filter((candidate) => candidate.kind === "file" && (candidate.extension === "gif" || candidate.extension === "webm"))
                .map(
                  (candidate): ArtifactCandidate => ({
                    ...candidate,
                    value: candidate.value.slice(0, -path.extname(candidate.value).length),
                    kind: "prefix",
                    extension: "directory",
                    clickStrip: false,
                  }),
                )
            : [];
        invocation.artifactCandidates = dedupeCandidates([...invocation.artifactCandidates, ...resultCandidates, ...recordingPrefixes]);
        for (const candidate of invocation.artifactCandidates) {
          if (candidate.extension !== "directory") {
            invocation.createdExtensions.add(candidate.extension);
          }
        }
        active.push(invocation);
      }
      while (active.length > 100) {
        active.shift();
      }
    }
  }
  if ((fileIndex + 1) % 100 === 0 || fileIndex + 1 === fileTotal) {
    process.stderr.write(`  ${account}: ${fileIndex + 1}/${fileTotal}\n`);
  }
}

function applyRetryLinks(): void {
  const byFile = new Map<string, CommandInvocation[]>();
  for (const invocation of invocations) {
    const list = byFile.get(invocation.fileKey) ?? [];
    list.push(invocation);
    byFile.set(invocation.fileKey, list);
  }
  for (const list of byFile.values()) {
    list.sort((left, right) => left.line - right.line);
    for (let index = 0; index < list.length; index++) {
      const failed = list[index];
      if (!(failed && (failed.outcome === "misuse" || failed.outcome === "tool-error" || failed.outcome === "violation"))) {
        continue;
      }
      const failedTime = timestampMs(failed.timestamp);
      const retry = list.slice(index + 1).find((candidate) => {
        if (candidate.family !== failed.family || candidate.toolOrdinal - failed.toolOrdinal > RETRY_TOOL_WINDOW) {
          return false;
        }
        const retryTime = timestampMs(candidate.timestamp);
        return failedTime === null || retryTime === null || retryTime - failedTime <= RETRY_TIME_WINDOW_MS;
      });
      if (!retry) {
        continue;
      }
      retry.retry = true;
      retry.correctedRetry = retry.outcome === "success" && retry.signature !== failed.signature;
    }
  }
}

function emptyAggregate(): FamilyAggregate {
  return {
    invocations: 0,
    paired: 0,
    outcomes: { success: 0, misuse: 0, "tool-error": 0, violation: 0, unpaired: 0 },
    firstUse: null,
    lastUse: null,
    forms: {},
    scopes: {},
    projectKinds: {},
    commandNames: {},
    flags: {},
    flagBases: {},
    rootCauses: {},
    retries: 0,
    correctedRetries: 0,
    artifactsCreated: {},
    artifactConsumptionMethods: {},
    artifactConsumptionExtensions: {},
    clickStripPngReads: 0,
    gifWebmReads: 0,
    downstreamExplicitReferences: {},
  };
}

function addInvocation(bucket: FamilyAggregate, invocation: CommandInvocation): void {
  bucket.invocations++;
  if (invocation.resultPaired) {
    bucket.paired++;
  }
  bucket.outcomes[invocation.outcome]++;
  if (invocation.timestamp && (!bucket.firstUse || invocation.timestamp < bucket.firstUse)) {
    bucket.firstUse = invocation.timestamp;
  }
  if (invocation.timestamp && (!bucket.lastUse || invocation.timestamp > bucket.lastUse)) {
    bucket.lastUse = invocation.timestamp;
  }
  bump(bucket.forms, invocation.form);
  bump(bucket.scopes, invocation.scope);
  bump(bucket.projectKinds, invocation.projectKind);
  bump(bucket.commandNames, invocation.commandName);
  for (const flag of invocation.flags) {
    bump(bucket.flags, flag);
  }
  for (const flag of invocation.flagBases) {
    bump(bucket.flagBases, flag);
  }
  if (invocation.rootCause) {
    bump(bucket.rootCauses, invocation.rootCause);
  }
  if (invocation.retry) {
    bucket.retries++;
  }
  if (invocation.correctedRetry) {
    bucket.correctedRetries++;
  }
  if (invocation.outcome === "success") {
    for (const extension of invocation.createdExtensions) {
      bump(bucket.artifactsCreated, extension);
    }
  }
  for (const event of invocation.consumptionEvents) {
    bump(bucket.artifactConsumptionMethods, event.method);
    bump(bucket.artifactConsumptionExtensions, event.extension);
  }
  bucket.clickStripPngReads += invocation.clickStripPngReads;
  bucket.gifWebmReads += invocation.gifWebmReads;
  for (const downstream of invocation.downstream) {
    bump(bucket.downstreamExplicitReferences, downstream);
  }
}

function isoWeek(timestamp: string | null): string {
  const parsed = timestampMs(timestamp);
  if (parsed === null) {
    return "unknown";
  }
  const date = new Date(parsed);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const weekOne = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - weekOne.getTime()) / 86_400_000 - 3 + ((weekOne.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getAggregate(buckets: Record<string, FamilyAggregate>, key: string): FamilyAggregate {
  const existing = buckets[key];
  if (existing) {
    return existing;
  }
  const created = emptyAggregate();
  buckets[key] = created;
  return created;
}

function aggregate(): Record<string, unknown> {
  const byFamily: Record<string, FamilyAggregate> = {};
  const byAccountAndFamily: Record<string, FamilyAggregate> = {};
  const byWeekAccountAndFamily: Record<string, FamilyAggregate> = {};
  for (const invocation of invocations) {
    addInvocation(getAggregate(byFamily, invocation.family), invocation);
    const accountKey = `${invocation.account}/${invocation.family}`;
    addInvocation(getAggregate(byAccountAndFamily, accountKey), invocation);
    const weekKey = `${isoWeek(invocation.timestamp)}/${invocation.account}/${invocation.family}`;
    addInvocation(getAggregate(byWeekAccountAndFamily, weekKey), invocation);
  }
  const productRecord = invocations.filter((invocation) => invocation.family === "record" && invocation.form === "pnpm" && invocation.commandName === "record");
  const recordSuccesses = productRecord.filter((invocation) => invocation.outcome === "success");
  const recordMisuses = productRecord.filter((invocation) => invocation.outcome === "misuse");
  const latestRecordSuccess =
    recordSuccesses
      .map((invocation) => invocation.timestamp)
      .filter((timestamp): timestamp is string => timestamp !== null)
      .sort()
      .at(-1) ?? null;
  const earlierMisuse = recordMisuses.some((invocation) => invocation.timestamp !== null && invocation.timestamp < "2026-09-02");
  const productRecordByDate: Record<string, Record<string, number>> = {};
  for (const invocation of productRecord) {
    const day = invocation.timestamp?.slice(0, 10) ?? "unknown";
    if (!productRecordByDate[day]) {
      productRecordByDate[day] = {};
    }
    const bucket = productRecordByDate[day];
    bump(bucket, invocation.outcome);
  }
  const snapCount = invocations.filter((invocation) => invocation.family === "snap").length;
  const unpairedIds = new Set([...allPending.keys()]);
  for (const [globalId, pending] of allPending) {
    denominators[pending.account].unpairedToolUses++;
    for (const invocation of pending.invocations) {
      invocation.outcome = "unpaired";
    }
    unpairedIds.add(globalId);
  }
  return {
    generatedAt: new Date().toISOString(),
    scope: {
      accounts: Object.keys(accountRoots),
      projectPathFilter: "case-insensitive path contains orbweaver",
      input: "top-level Claude Code JSONL tool_use/tool_result blocks only",
      redaction: "aggregate counts only; no transcript, command, result, URL, prompt, token, cookie, or artifact path retained",
    },
    denominators,
    schemaAndPairing: {
      uniqueToolUseIds: seenUseIds.size,
      uniqueToolResultIds: seenResultIds.size,
      pendingUnpairedIds: unpairedIds.size,
      topLevelOnly: true,
      dedupeKey: "account + tool_use_id",
      resultBodyInspectionLimitBytes: RESULT_TEXT_LIMIT,
    },
    families: byFamily,
    accountsAndFamilies: byAccountAndFamily,
    isoWeeksAccountsAndFamilies: byWeekAccountAndFamily,
    controls: {
      productPnpmRecord: {
        invocations: productRecord.length,
        success: recordSuccesses.length,
        misuse: recordMisuses.length,
        other: productRecord.length - recordSuccesses.length - recordMisuses.length,
        latestSuccess: latestRecordSuccess,
        earlierMisusePresent: earlierMisuse,
        clickStripPngReadsAmongSuccesses: recordSuccesses.reduce((sum, invocation) => sum + invocation.clickStripPngReads, 0),
        gifWebmReadsAmongSuccesses: recordSuccesses.reduce((sum, invocation) => sum + invocation.gifWebmReads, 0),
        byDate: productRecordByDate,
      },
      snapActualInvocationCount: snapCount,
      proseOnlyTargetMentions: denominators.claude.proseOnlyMentions + denominators["claude-b"].proseOnlyMentions,
      nonInvocationBashMentions: denominators.claude.nonInvocationBashMentions + denominators["claude-b"].nonInvocationBashMentions,
      expectedKnownPositives: {
        latestRecordSuccessOn2026_09_02: latestRecordSuccess?.startsWith("2026-09-02") ?? false,
        earlierRecordMisuse: earlierMisuse,
        snapCallsPresent: snapCount > 0,
      },
      expectedNegative: {
        proseMentionsExcluded: denominators.claude.proseOnlyMentions + denominators["claude-b"].proseOnlyMentions > 0,
        bashSearchOrEditMentionsExcluded: denominators.claude.nonInvocationBashMentions + denominators["claude-b"].nonInvocationBashMentions > 0,
      },
    },
  };
}

async function main(): Promise<void> {
  for (const account of ["claude", "claude-b"] as const) {
    const files = await findFiles(accountRoots[account]);
    process.stderr.write(`${account}: ${files.length} Orbweaver JSONL files\n`);
    for (let index = 0; index < files.length; index++) {
      const file = files[index]?.file;
      if (file) {
        await processFile(account, file, index, files.length);
      }
    }
  }
  applyRetryLinks();
  const result = aggregate();
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (outPath) {
    await writeFile(outPath, rendered);
    process.stderr.write(`wrote ${outPath}\n`);
  } else {
    process.stdout.write(rendered);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
