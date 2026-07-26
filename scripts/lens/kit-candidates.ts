#!/usr/bin/env tsx
// ADVISORY lens (never a gate) — runs jscpd at a LOW min-tokens over packages/server/src +
// packages/client/src and surfaces ONLY clone pairs that straddle the server/client boundary.
//
// Rationale (the cake's own law, docs/architecture/core/AGENTS.md §0.2/§3): a shape or a piece of
// runtime logic living in BOTH server and client is either a KIT candidate (isomorphic runtime logic —
// `kit` is the isomorphic layer, no node:*/domain/db/contracts) or a CONTRACTS candidate (a cross-boundary
// shape/schema). This lens does NOT decide either way with authority — it prints a ranked, CLASSIFIED
// list of candidates for a human/orchestrator to individually judge. It never gates, never exits non-zero
// on findings, and never touches jscpd.json (the 2%-threshold CI gate stays untouched).
//
// USAGE
//   pnpm lens:kit-candidates                      # min-tokens 40 (default)
//   pnpm lens:kit-candidates --min-tokens 60       # tune the noise floor
//
// Writes the ranked JSON to reports/lens/kit-candidates.json and prints a console summary.
// Exit is always 0 — this is advisory, not enforcement (a `jscpd` tool failure — the process erroring
// out — still exits non-zero so a broken lens doesn't silently report "no candidates").
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const SERVER_ROOT = join(REPO_ROOT, "packages/server/src");
const CLIENT_ROOT = join(REPO_ROOT, "packages/client/src");
const SCRATCH_DIR = join(REPO_ROOT, "reports/lens/.jscpd-scratch");
const REPORT_JSON_PATH = join(REPO_ROOT, "reports/lens/kit-candidates.json");

const IGNORE_GLOBS = [
  "**/tests/**",
  "**/*.test.ts",
  "**/*.int.test.ts",
  "**/*.contract.test.ts",
  "**/*.parity.test.ts",
  "**/*.test-d.ts",
  "**/*.ct.tsx",
  "**/*.spec.ts",
  "**/migrations/**",
  "**/snapshots/**",
  "**/__fixtures__/**",
  "**/*.d.ts",
  // generated outputs — not authored source, duplication here is a build artifact, not a kit/contracts gap.
  "**/tokens/generated/**",
  "**/suppressions*.json",
].join(",");

type JscpdFileRef = {
  name: string;
  start: number;
  end: number;
};

type JscpdDuplicate = {
  format: string;
  lines: number;
  tokens: number;
  fragment: string;
  firstFile: JscpdFileRef;
  secondFile: JscpdFileRef;
};

type JscpdReport = {
  duplicates: JscpdDuplicate[];
};

type Side = "server" | "client";

type Candidate = {
  class: "contracts candidate" | "kit candidate";
  tokens: number;
  lines: number;
  server: { path: string; start: number; end: number };
  client: { path: string; start: number; end: number };
};

const DEFAULT_MIN_TOKENS = 40;

function parseCliArgs(argv: string[]): { minTokens: number } {
  const { values } = parseArgs({
    args: argv,
    options: { "min-tokens": { type: "string" } },
    strict: true,
  });
  const minTokens = values["min-tokens"] ? Number.parseInt(values["min-tokens"], 10) : DEFAULT_MIN_TOKENS;
  if (!Number.isFinite(minTokens) || minTokens <= 0) {
    throw new Error(`--min-tokens must be a positive integer, got: ${values["min-tokens"]}`);
  }
  return { minTokens };
}

function runJscpd(minTokens: number): JscpdReport {
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
  mkdirSync(SCRATCH_DIR, { recursive: true });

  const args = [
    "jscpd",
    "--min-tokens",
    String(minTokens),
    "--min-lines",
    "5",
    "--max-lines",
    "2000",
    "--max-size",
    "200kb",
    "--format",
    "typescript,tsx",
    "--reporters",
    "json",
    "--output",
    SCRATCH_DIR,
    "--ignore",
    IGNORE_GLOBS,
    "--ignore-pattern",
    "import.*from.*",
    "--ignore-case",
    "--no-colors",
    SERVER_ROOT,
    CLIENT_ROOT,
  ];
  const result = spawnSync("npx", args, { cwd: REPO_ROOT, encoding: "utf8" });
  if (result.status !== 0 && result.status !== 1) {
    // jscpd itself exits 1 when it finds clones over ITS OWN --threshold (unset here, so this
    // shouldn't fire) — anything else (2+, null/signal) is a genuine tool failure.
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`jscpd exited with status ${result.status}`);
  }

  const reportPath = join(SCRATCH_DIR, "jscpd-report.json");
  const raw = readFileSync(reportPath, "utf8");
  return JSON.parse(raw) as JscpdReport;
}

function fileExists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

/** `firstFile`/`secondFile` names are relative to whichever scan root the file was found under —
 * jscpd doesn't echo the root. The two roots' top-level dirs are disjoint (server: domain/foundation/
 * infra/entry/transport/kit; client: components/features/routes/...), so resolving each name against
 * BOTH roots and taking whichever exists on disk is unambiguous. */
function resolveSide(name: string): { side: Side; path: string; repoPath: string } | null {
  const serverPath = join(SERVER_ROOT, name);
  if (fileExists(serverPath)) {
    return { side: "server", path: serverPath, repoPath: `packages/server/src/${name}` };
  }
  const clientPath = join(CLIENT_ROOT, name);
  if (fileExists(clientPath)) {
    return { side: "client", path: clientPath, repoPath: `packages/client/src/${name}` };
  }
  return null;
}

/** Cheap heuristic (imperfect by design — this is advisory, not a gate): count type/schema-land tokens
 * (`interface`, `type X =`, `z.`) vs executable-statement tokens (`function`, `const `, `=>`, `if (`,
 * `for (`, `await `) in the fragment's SOURCE LINES (read directly — jscpd's rust core ships `fragment`
 * empty in its JSON reporter). Dominated by the former → contracts candidate; otherwise → kit candidate. */
function classifyFragment(path: string, start: number, end: number): "contracts candidate" | "kit candidate" {
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .slice(Math.max(0, start - 1), end);
  const text = lines.join("\n");
  const typeSignals = (text.match(/\binterface\b|\btype\s+\w+\s*=|z\.\w+\(/g) ?? []).length;
  const runtimeSignals = (text.match(/\bfunction\b|\bconst\s+\w+\s*=(?!\s*z\.)|=>|\bif\s*\(|\bfor\s*\(|\bawait\s+/g) ?? []).length;
  return typeSignals > runtimeSignals ? "contracts candidate" : "kit candidate";
}

/** Cross-corpus pair check + classification for one jscpd duplicate; null if both sides land on the
 * same corpus (an ordinary same-side clone jscpd.json's gate already covers — out of scope here). */
function toCandidate(dup: JscpdDuplicate): Candidate | null {
  const first = resolveSide(dup.firstFile.name);
  const second = resolveSide(dup.secondFile.name);
  if (!(first && second)) {
    return null;
  }
  if (first.side === second.side) {
    return null;
  }

  const [serverRef, server] = first.side === "server" ? [dup.firstFile, first] : [dup.secondFile, second];
  const [clientRef, client] = first.side === "client" ? [dup.firstFile, first] : [dup.secondFile, second];

  return {
    class: classifyFragment(server.path, serverRef.start, serverRef.end),
    tokens: dup.tokens,
    lines: dup.lines,
    server: { path: server.repoPath, start: serverRef.start, end: serverRef.end },
    client: { path: client.repoPath, start: clientRef.start, end: clientRef.end },
  };
}

function buildCandidates(report: JscpdReport): Candidate[] {
  return report.duplicates
    .map(toCandidate)
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.tokens - a.tokens);
}

function printReport(candidates: Candidate[], minTokens: number): void {
  console.log(`kit-candidates lens — min-tokens ${minTokens} — ${candidates.length} cross-corpus pair(s)\n`);
  for (const [i, c] of candidates.entries()) {
    console.log(`${i + 1}. [${c.class}] ${c.tokens} tokens, ${c.lines} lines`);
    console.log(`   server: ${c.server.path}:${c.server.start}-${c.server.end}`);
    console.log(`   client: ${c.client.path}:${c.client.start}-${c.client.end}`);
  }
}

function main(): void {
  const { minTokens } = parseCliArgs(process.argv.slice(2));
  const report = runJscpd(minTokens);
  const candidates = buildCandidates(report);
  printReport(candidates, minTokens);

  mkdirSync(join(REPO_ROOT, "reports/lens"), { recursive: true });
  writeFileSync(REPORT_JSON_PATH, JSON.stringify({ minTokens, count: candidates.length, candidates }, null, 2));
  rmSync(SCRATCH_DIR, { recursive: true, force: true });

  console.log(`\nwrote reports/lens/kit-candidates.json (${candidates.length} candidate pair(s))`);
}

main();
