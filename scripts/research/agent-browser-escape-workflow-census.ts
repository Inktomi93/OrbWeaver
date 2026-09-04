#!/usr/bin/env node
/**
 * Read-only, aggregate-only paired browser-escape census. It streams Orbweaver
 * Claude JSONL transcripts and never writes transcript text, commands, URLs,
 * selectors, paths, cookies, tokens, or result bodies to its output.
 *
 * Usage: node scripts/research/agent-browser-escape-workflow-census.ts --out <json>
 */
import { createReadStream } from "node:fs";
import { readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";

type Account = "claude" | "claude-b";
interface Content {
  readonly type: string | undefined;
  readonly id: string | undefined;
  readonly name: string | undefined;
  readonly input: Readonly<Record<string, unknown>> | undefined;
  readonly tool_use_id: string | undefined;
  readonly content: unknown;
  readonly is_error: boolean | undefined;
}
interface RecordLine {
  readonly type: string | undefined;
  readonly timestamp: string | undefined;
  readonly message: { readonly content: readonly Content[] } | null;
  readonly toolUseResult: unknown;
}
const JOBS = [
  "authenticated-browser",
  "chooser-drop",
  "mobile-emulation",
  "multi-tab",
  "lighthouse-perf-react",
  "network-inspection",
  "console-a11y",
  "map-navigation",
  "dom-js",
  "recovery",
  "other",
] as const;
type Job = (typeof JOBS)[number];
const FAMILIES = ["headless-devtools", "logged-in-chrome", "shell-playwright", "other-browser", "snap"] as const;
type Family = (typeof FAMILIES)[number];
const OUTCOMES = ["success", "error", "unpaired"] as const;
type Outcome = (typeof OUTCOMES)[number];
type Event = {
  account: Account;
  file: string;
  ordinal: number;
  timestamp: string | null;
  family: Family;
  job: Job;
  name: string;
  input: string;
  outcome: Outcome;
};

const out = process.argv[process.argv.indexOf("--out") + 1];
if (!out) {
  throw new Error("Usage: node scripts/research/agent-browser-escape-workflow-census.ts --out <json>");
}
const roots: Record<Account, string> = { claude: path.join(os.homedir(), ".claude/projects"), "claude-b": path.join(os.homedir(), ".claude-b/projects") };
const events: Event[] = [];
const pending = new Map<string, Event>();
const seen = new Set<string>();
const ESCAPE_LOOKBACK = 12;
const counts = {
  files: { claude: 0, "claude-b": 0 },
  bytes: { claude: 0, "claude-b": 0 },
  records: { claude: 0, "claude-b": 0 },
  parseErrors: { claude: 0, "claude-b": 0 },
  toolUses: 0,
  paired: 0,
  unpaired: 0,
  duplicates: 0,
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function contentItem(value: unknown): Content | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    type: optionalString(value["type"]),
    id: optionalString(value["id"]),
    name: optionalString(value["name"]),
    input: isRecord(value["input"]) ? value["input"] : undefined,
    tool_use_id: optionalString(value["tool_use_id"]),
    content: value["content"],
    is_error: typeof value["is_error"] === "boolean" ? value["is_error"] : undefined,
  };
}

function recordLine(value: unknown): RecordLine | null {
  if (!isRecord(value)) {
    return null;
  }
  const message = value["message"];
  const rawContent = isRecord(message) && Array.isArray(message["content"]) ? message["content"] : [];
  return {
    type: optionalString(value["type"]),
    timestamp: optionalString(value["timestamp"]),
    message: { content: rawContent.map(contentItem).filter((item): item is Content => item !== null) },
    toolUseResult: value["toolUseResult"],
  };
}

function text(value: unknown): string {
  try {
    return JSON.stringify(value ?? "");
  } catch {
    return "";
  }
}
function family(name: string, input: string): Family | null {
  const n = name.toLowerCase();
  const i = input.toLowerCase();
  if (n.includes("chrome-devtools") || n.includes("devtools")) {
    return "headless-devtools";
  }
  if (n.includes("claude-in-chrome") || n.includes("computer") || n.includes("browser")) {
    return "logged-in-chrome";
  }
  if (name === "Bash" && /(?:playwright|puppeteer|chrome-remote-interface|chromium)/i.test(i)) {
    return "shell-playwright";
  }
  if (name === "Bash" && isSnapShell(input)) {
    return "snap";
  }
  return null;
}
function job(name: string, input: string, f: Family): Job {
  const s = `${name} ${input}`.toLowerCase();
  if (f === "logged-in-chrome" && /(?:select.*browser|tab.?context|browser_id|tab_id)/.test(s)) {
    return "authenticated-browser";
  }
  if (/(?:upload|filechooser|drop|drag)/.test(s)) {
    return "chooser-drop";
  }
  if (/(?:emulate|resize|viewport|device|touch|mobile)/.test(s)) {
    return "mobile-emulation";
  }
  if (/(?:new_page|list_pages|close_page|select_page|tab)/.test(s)) {
    return "multi-tab";
  }
  if (/(?:lighthouse|performance|trace|heap|react)/.test(s)) {
    return "lighthouse-perf-react";
  }
  if (/(?:network|har|request|response|header|body)/.test(s)) {
    return "network-inspection";
  }
  if (/(?:console|issue|snapshot|accessib|aria)/.test(s)) {
    return "console-a11y";
  }
  if (/(?:navigate|goto|map|route|page)/.test(s)) {
    return "map-navigation";
  }
  if (/(?:evaluate|javascript|dom|script)/.test(s)) {
    return "dom-js";
  }
  return "other";
}
function outcome(item: Content, rec: RecordLine): Outcome {
  const s = `${text(item.content)}\n${text(rec.toolUseResult)}`;
  return item.is_error || /(?:exit code [1-9]|timed out|selected page.*closed|tool_use_error|error:)/i.test(s) ? "error" : "success";
}
async function files(root: string): Promise<string[]> {
  try {
    const e = await readdir(root, { recursive: true, withFileTypes: true });
    return e
      .filter((x) => x.isFile() && x.name.endsWith(".jsonl"))
      .map((x) => path.join(x.parentPath, x.name))
      .filter((x) => x.toLowerCase().includes("orbweaver"));
  } catch {
    return [];
  }
}
async function scan(account: Account, file: string): Promise<void> {
  counts.files[account]++;
  try {
    counts.bytes[account] += (await stat(file)).size;
  } catch {
    process.stderr.write(`failed to stat one ${account} transcript\n`);
  }
  let ordinal = 0;
  let lineNo = 0;
  const input = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const line of input) {
    lineNo++;
    if (!(line.includes("tool_use") || line.includes("tool_result"))) {
      continue;
    }
    let rec: RecordLine;
    try {
      const parsed = recordLine(JSON.parse(line));
      if (parsed === null) {
        counts.parseErrors[account]++;
        continue;
      }
      rec = parsed;
      counts.records[account]++;
    } catch {
      counts.parseErrors[account]++;
      continue;
    }
    const items = Array.isArray(rec.message?.content) ? rec.message.content : [];
    for (const item of rec.type === "assistant" ? items.filter((x) => x.type === "tool_use") : []) {
      ordinal++;
      counts.toolUses++;
      const value = text(item.input);
      const f = family(item.name ?? "", value);
      if (!f) {
        continue;
      }
      const id = `${account}:${item.id ?? `${file}:${lineNo}:${ordinal}`}`;
      if (seen.has(id)) {
        counts.duplicates++;
        continue;
      }
      seen.add(id);
      const e: Event = {
        account,
        file,
        ordinal,
        timestamp: rec.timestamp ?? null,
        family: f,
        job: job(item.name ?? "", value, f),
        name: item.name ?? "unknown",
        input: value,
        outcome: "unpaired",
      };
      events.push(e);
      pending.set(id, e);
    }
    for (const item of rec.type === "user" ? items.filter((x) => x.type === "tool_result") : []) {
      const e = pending.get(`${account}:${item.tool_use_id ?? ""}`);
      if (!e) {
        continue;
      }
      e.outcome = outcome(item, rec);
      pending.delete(`${account}:${item.tool_use_id ?? ""}`);
      counts.paired++;
    }
  }
}
function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}
function isSnapShell(input: string): boolean {
  return /\bpnpm\s+(?:run\s+)?snap\b|(?:scripts\/probes|tooling\/src\/snap)\/cli\.ts/.test(input);
}
function isSnapCapable(j: Job): boolean {
  return j !== "authenticated-browser" && j !== "other";
}
function main(): Record<string, unknown> {
  const byFile = new Map<string, Event[]>();
  for (const e of events) {
    const a = byFile.get(e.file) ?? [];
    a.push(e);
    byFile.set(e.file, a);
  }
  const totals: Record<string, number> = {};
  const outcomes: Record<string, number> = {};
  const chainJobs: Record<string, number> = {};
  const currentSnapJobs: Record<string, number> = {};
  const legitimate: Record<string, number> = {};
  let pairedChains = 0;
  let snapPreceded = 0;
  let noSnapButCapable = 0;
  let recoveryChains = 0;
  for (const list of byFile.values()) {
    list.sort((a, b) => a.ordinal - b.ordinal);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e === undefined) {
        continue;
      }
      if (e.family === "snap") {
        continue;
      }
      bump(totals, e.family);
      bump(outcomes, e.outcome);
      const prior = list.slice(Math.max(0, i - ESCAPE_LOOKBACK), i);
      const snap = prior.some((x) => x.family === "snap");
      const ownerProfile = e.family === "logged-in-chrome";
      if (snap || (!ownerProfile && isSnapCapable(e.job))) {
        pairedChains++;
        bump(chainJobs, ownerProfile ? "authenticated-browser" : e.job);
        if (snap) {
          snapPreceded++;
        } else {
          noSnapButCapable++;
        }
        if (!ownerProfile && isSnapCapable(e.job)) {
          bump(currentSnapJobs, e.job);
        } else {
          bump(legitimate, ownerProfile ? "authenticated-browser" : e.job);
        }
        if (e.outcome === "error") {
          recoveryChains++;
        }
      }
    }
  }
  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    redaction: "aggregate-only; no transcript text, commands, URLs, selectors, paths, cookies, tokens, or result bodies",
    scope: {
      projectPathFilter: "case-insensitive path contains orbweaver",
      input: "top-level assistant tool_use and paired top-level user tool_result",
      browserFamilies: ["headless DevTools MCP", "logged-in Claude-in-Chrome/browser tools", "Bash commands naming Playwright/Puppeteer/CDP/Chromium"],
      pairing: "account + tool_use id; duplicate ids removed",
      chainRule:
        "same transcript: browser event preceded by Snap shell use within 12 browser-tool ordinals, or a browser job current Snap help/source explicitly covers",
    },
    corpus: counts,
    events: {
      total: events.length,
      byFamily: totals,
      byOutcome: outcomes,
      first:
        events
          .map((x) => x.timestamp)
          .filter(Boolean)
          .sort()[0] ?? null,
      last:
        events
          .map((x) => x.timestamp)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
    },
    pairedWorkflowChains: {
      total: pairedChains,
      snapPreceded,
      snapCapableWithoutPriorSnap: noSnapButCapable,
      recoveryErrors: recoveryChains,
      byJob: chainJobs,
      currentSnapCovered: currentSnapJobs,
      legitimateSeparateBrowser: legitimate,
    },
    currentSnapEvidence: {
      "chooser-drop": "--upload and --drop-files",
      "mobile-emulation": "--mobile, --viewport, --network, --cpu-throttle",
      "multi-tab": "--pages and @N target suffix",
      "lighthouse-perf-react": "--lighthouse, --perf, --cpu-profile, --boot-trace, --react-profile, --heap",
      "network-inspection": "--requests, HAR/session export, --diagnostics",
      "console-a11y": "--strict-console, --diagnostics, --aria, --map",
      "map-navigation": "--goto, --map, __orb nav",
      "dom-js": "--eval",
    },
  };
}
const all = await Promise.all(
  (Object.entries(roots) as [Account, string][]).map(async ([a, root]) => {
    for (const f of await files(root)) {
      await scan(a, f);
    }
  }),
);
void all;
const result = main();
await writeFile(out, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ events: events.length, paired: result["pairedWorkflowChains"] }, null, 2)}\n`);
