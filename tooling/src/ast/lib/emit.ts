// Flag parsing + hit emission (dedupe / collapse / truncation warning) + the ONE project loader
// (rides _shared/ts-workspace — the consolidated bootstrap). Split from ast.ts (P4 of #393).
import { getWorkspace, searchGlobs } from "@orb/tooling/_shared/ts-workspace";
import type { Node, Project } from "ts-morph";
import { print } from "../../_shared/artifacts.ts";
import { warn } from "../../_shared/log.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { CORPUS_SYNTACTIC, EPILOGUE_TAG, ledger, NAME_LOOKUP_SYNTACTIC_VERBS, noteMatches, scanMeta } from "./ledger.ts";
import { COLLAPSE_THRESHOLD, DEFAULT_MAX, REPO_ROOT, RESPELL_NEAR_DEFAULT_PCT, SNIPPET_CAP } from "./root.ts";

/** The bare boolean switches, dictionary-dispatched (kept off the if/else chain, or `--all` pushes
 *  `parseFlags` over the complexity ceiling). */
const BOOLEAN_FLAGS: Readonly<Record<string, keyof Pick<Flags, "json" | "filesOnly" | "public" | "all">>> = {
  "--json": "json",
  "--files": "filesOnly",
  "--public": "public",
  "--all": "all",
};

/** A flag that consumes a VALUE — sets the field on `flags` and returns how many extra tokens it ate
 *  (0 or 1), so `--near`'s OPTIONAL number doesn't force `--in`/`--max` into the same optional shape. */
type ValueFlagHandler = (flags: Flags, rest: readonly string[], i: number) => number;

/** `--near [pct]`: the next token only when it parses as a plain number (not another `--flag`); a bare
 *  `--near` defaults to {@link RESPELL_NEAR_DEFAULT_PCT}. */
function applyNearFlag(flags: Flags, rest: readonly string[], i: number): number {
  const next = rest[i + 1];
  const numeric = next !== undefined && !next.startsWith("--") ? Number(next) : Number.NaN;
  if (Number.isFinite(numeric)) {
    flags.near = numeric;
    return 1;
  }
  flags.near = RESPELL_NEAR_DEFAULT_PCT;
  return 0;
}

/** The value-taking flags, dictionary-dispatched for the same reason `BOOLEAN_FLAGS` is — keeps
 *  `parseFlags` a flat two-branch loop under the complexity ceiling however many flags this file grows. */
const VALUE_FLAGS: Readonly<Record<string, ValueFlagHandler>> = {
  "--in": (flags, rest, i) => {
    flags.in = rest[i + 1] ?? null;
    return 1;
  },
  "--max": (flags, rest, i) => {
    flags.max = Number(rest[i + 1] ?? DEFAULT_MAX) || DEFAULT_MAX;
    return 1;
  },
  "--near": applyNearFlag,
};

export function parseFlags(rest: string[]): Flags {
  const flags: Flags = { in: null, json: false, max: DEFAULT_MAX, filesOnly: false, public: false, all: false, near: null };
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i];
    const valueFlag = t === undefined ? undefined : VALUE_FLAGS[t];
    if (valueFlag !== undefined) {
      i += valueFlag(flags, rest, i);
      continue;
    }
    const key = t === undefined ? undefined : BOOLEAN_FLAGS[t];
    if (key !== undefined) {
      flags[key] = true;
    }
  }
  return flags;
}

export function hitOf(node: Node, kind: string): Hit {
  const sf = node.getSourceFile();
  const line = sf.getLineAndColumnAtPos(node.getStart()).line;
  const raw = sf.getFullText().split("\n")[line - 1] ?? "";
  const text = raw.trim().slice(0, SNIPPET_CAP);
  const full = sf.getFilePath();
  const file = full.startsWith(`${REPO_ROOT}/`) ? full.slice(REPO_ROOT.length + 1) : full;
  return { file, line, kind, text };
}

export function dedupe(hits: Hit[], flags: Flags): Hit[] {
  const filtered = flags.in === null ? hits : hits.filter((h) => h.file.includes(flags.in ?? ""));
  const seen = new Set<string>();
  return filtered.filter((h) => {
    const k = `${h.file}:${h.line}:${h.kind}`;
    if (seen.has(k)) {
      return false;
    }
    seen.add(k);
    return true;
  });
}

function perFileCounts(hits: Hit[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const h of hits) {
    counts.set(h.file, (counts.get(h.file) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** THE CAP BIT — say so LOUDLY, on stderr, beside the epilogue's `status=partial`. A `--max` that drops hits
 *  is the same lie the scan ledger exists to kill: `--json` printed a `shown` field nobody reads, and a raw
 *  list ended in a parenthetical. The #210 triage lost ten hits to it before noticing (`--max 200` was
 *  load-bearing and undiscoverable). The DEFAULT stays 60: raising it would also move the auto-collapse
 *  trigger for all thirty-odd verbs (`COLLAPSE_THRESHOLD`), flooding readers to fix one lens's ergonomics. */
function warnTruncated(total: number, shown: number, flags: Flags, label: string): void {
  if (shown >= total) {
    return;
  }
  warn(
    `${EPILOGUE_TAG} TRUNCATED — ast ${label}: ${total} hit(s) found, ${shown} displayed, ${total - shown} DROPPED by --max ${flags.max}. This list is NOT the answer; re-run with --max ${total} (or more) for the complete set.`,
  );
}

export function emit(hits: Hit[], flags: Flags, label: string): void {
  const unique = dedupe(hits, flags).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const files = new Set(unique.map((h) => h.file)).size;
  if (flags.json) {
    const shown = unique.slice(0, flags.max);
    noteMatches(unique.length, shown.length);
    warnTruncated(unique.length, shown.length, flags, label);
    // `meta` is ADDITIVE and last — every pre-existing key keeps its name, order and value, so a consumer
    // reading `total`/`hits` is untouched while a new one can audit the scope the answer came from.
    print(JSON.stringify({ label, total: unique.length, shown: shown.length, hits: shown, meta: scanMeta() }, null, 1));
    return;
  }
  if (flags.filesOnly || (unique.length > Math.max(flags.max, COLLAPSE_THRESHOLD) && flags.max === DEFAULT_MAX)) {
    // The at-a-glance mode: WHERE the hits live, one line per file. Explicit via --files, or
    // automatic when raw lines would flood the reader (pass --max <n> to force raw lines).
    // NOT truncation — every hit is accounted for at file granularity, so status stays `complete`.
    noteMatches(unique.length, unique.length);
    for (const [file, n] of perFileCounts(unique)) {
      print(`${file}  (${n})`);
    }
    print(
      `RESULT ast ${label}: ${unique.length} hit(s) in ${files} file(s) — per-file counts${flags.filesOnly ? "" : " (auto-collapsed; pass --max <n> for raw lines)"}`,
    );
    return;
  }
  const shown = unique.slice(0, flags.max);
  noteMatches(unique.length, shown.length);
  warnTruncated(unique.length, shown.length, flags, label);
  for (const h of shown) {
    print(`${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  const overflow = unique.length > shown.length ? ` (showing ${shown.length} — raise --max)` : "";
  // A zero on a NAME-lookup syntactic verb is only as good as its corpus: scripts/** outside check/gates
  // is not in harness-globs, so a symbol living there (e.g. scripts/github/*, scripts/dev/*) zero-matches
  // while being fully alive — a real false clean, measured. Say so instead of printing a bare "no results".
  // Path-scoped verbs (exports/aliases) stay bare: their argument names a file that WAS scanned.
  const syntacticZero =
    unique.length === 0 && ledger !== undefined && NAME_LOOKUP_SYNTACTIC_VERBS.has(ledger.verb) && ledger.scopeParts[0] === `corpus:${CORPUS_SYNTACTIC}`;
  const corpusHint = syntacticZero
    ? " — NOTE: the syntactic corpus excludes scripts/** outside check/gates; a symbol living there needs a search-corpus verb (refs)"
    : "";
  print(unique.length === 0 ? `RESULT ast ${label}: no results${corpusHint}` : `RESULT ast ${label}: ${unique.length} hit(s)${overflow} in ${files} file(s)`);
}

// One workspace project per invocation, via the ONE sanctioned bootstrap (tooling/src/_shared/ts-workspace.ts).
// types:true = root-tsconfig resolution options + full-workspace globs (the refs verb needs the
// language service to follow @orb/* exports and #aliases); types:false = the fast pure-AST arm.
// `wide` loads the TYPED arm's file set (searchGlobs — tests+fixtures+scripts) WITHOUT the type graph:
// a purely syntactic walk needs no language service, so `literal` gets the wide corpus at the cheap load.
export function loadProject(needTypes: boolean, wide = false): Project {
  if (needTypes) {
    return getWorkspace({ root: REPO_ROOT, types: true });
  }
  if (wide) {
    return getWorkspace({ root: REPO_ROOT, types: false, globs: searchGlobs(REPO_ROOT) });
  }
  return getWorkspace({ root: REPO_ROOT, types: false });
}
