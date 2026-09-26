// Flag parsing + hit emission (dedupe / collapse / truncation warning) + the ONE project loader
// (rides _shared/ts-workspace — the consolidated bootstrap). Split from ast.ts (P4 of #393).
import type { SourceCorpus } from "@orb/tooling/_shared/ts-workspace";
import { createSemanticWorkspace, getWorkspace, searchGlobs } from "@orb/tooling/_shared/ts-workspace";
import type { Node } from "ts-morph";
import { print } from "../../_shared/artifacts.ts";
import { warn } from "../../_shared/log.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { EPILOGUE_TAG, noteMatches, scanMeta } from "./ledger.ts";
import { COLLAPSE_THRESHOLD, DEFAULT_MAX, REPO_ROOT, RESPELL_NEAR_DEFAULT_PCT, SNIPPET_CAP } from "./root.ts";

// `Hit` is a public rendered protocol, so occurrence identity stays private. Source-oriented lenses can
// render two AST nodes as the same file/line/kind/text; retaining each node start here keeps totals exact
// without adding an implementation-only field to JSON or every non-node-backed finding producer.
const hitStarts = new WeakMap<Hit, number>();

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
/** A REQUIRED value: missing, or another `--flag`, is MISUSE — never the value (#1507).
 *
 *  `--in`/`--max` used to take `rest[i + 1]` unconditionally, so `pnpm ast refs Foo --in --json` filtered
 *  the results by the literal path fragment `"--json"` — zero hits, no warning, and the `--json` the
 *  caller asked for silently un-set. A filter that matches nothing prints exactly like a clean answer,
 *  which is the whole family this repo treats as a lying instrument. Same posture as `rejectUnknownArg`
 *  below it: exit 3, naming the flag. (`--near`'s number is genuinely OPTIONAL and keeps its own
 *  handler — a bare `--near` has a documented default, so nothing is being swallowed there.) */
function requireValue(flag: string, rest: readonly string[], i: number): string {
  const next = rest[i + 1];
  if (next === undefined) {
    throw new UsageError(`${flag} needs a value and was the LAST argument — nothing followed it.`);
  }
  if (next.startsWith("--")) {
    throw new UsageError(
      `${flag} needs a value, but the next token is ${JSON.stringify(next)} — another flag, not a value. Consuming it would filter against the literal text "${next}" and print a clean zero.`,
    );
  }
  return next;
}

const VALUE_FLAGS: Readonly<Record<string, ValueFlagHandler>> = {
  "--in": (flags, rest, i) => {
    flags.in = requireValue("--in", rest, i);
    return 1;
  },
  "--max": (flags, rest, i) => {
    const raw = requireValue("--max", rest, i);
    const parsed = Number(raw);
    if (!(Number.isFinite(parsed) && parsed > 0)) {
      // Same class: `--max abc` used to fall back to the default cap and report a truncated run as if the
      // caller had chosen that number.
      throw new UsageError(`--max needs a positive number, got ${JSON.stringify(raw)}.`);
    }
    flags.max = parsed;
    return 1;
  },
  "--near": applyNearFlag,
};

/** Every token this parser recognizes — the vocabulary a refusal quotes back, derived from the two
 *  dispatch tables so it can never drift from what actually parses. */
const KNOWN_FLAGS = [...Object.keys(VALUE_FLAGS), ...Object.keys(BOOLEAN_FLAGS)].sort().join(" ");

/** #452's second half. An unrecognized token used to be SILENTLY DROPPED, so `pnpm ast jsx --name Button`
 *  swallowed `Button` whole while the verb searched for "--name" and reported a clean zero. A token this
 *  parser cannot name is MISUSE (exit 3) — never a quiet no-op that degrades a run into a wrong answer,
 *  and never a typo (`--fles`) that silently un-sets the flag the caller thought they passed. */
function rejectUnknownArg(token: string): never {
  throw new UsageError(
    `unknown argument ${JSON.stringify(token)} — ast's flags are: ${KNOWN_FLAGS}. Every verb's subject is POSITIONAL and comes FIRST (\`pnpm ast jsx Button\`); an argument this parser does not know is misuse, never a silent no-op.`,
  );
}

export function parseFlags(rest: string[]): Flags {
  const flags: Flags = { in: null, json: false, max: DEFAULT_MAX, filesOnly: false, public: false, all: false, near: null };
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i] ?? "";
    const valueFlag = VALUE_FLAGS[t];
    if (valueFlag !== undefined) {
      i += valueFlag(flags, rest, i);
      continue;
    }
    const key = BOOLEAN_FLAGS[t];
    if (key === undefined) {
      rejectUnknownArg(t);
    }
    flags[key] = true;
  }
  return flags;
}

export function hitOf(node: Node, kind: string): Hit {
  const sf = node.getSourceFile();
  const line = sf.getLineAndColumnAtPos(node.getStart()).line;
  const raw = sf.getFullText().split(/\r?\n/u)[line - 1] ?? "";
  const text = raw.trim().slice(0, SNIPPET_CAP);
  const full = sf.getFilePath();
  const file = full.startsWith(`${REPO_ROOT}/`) ? full.slice(REPO_ROOT.length + 1) : full;
  const hit = { file, line, kind, text };
  hitStarts.set(hit, node.getStart());
  return hit;
}

/** Human explanation belongs on stdout for the ordinary CLI, but it must not corrupt the one JSON value
 *  emitted on stdout by a machine-output run. Keep the prose visible on stderr in that mode. */
export function narrate(flags: Flags, text: string): void {
  if (flags.json) {
    warn(text);
    return;
  }
  print(text);
}

export function dedupe(hits: Hit[], flags: Flags): Hit[] {
  const filtered = flags.in === null ? hits : hits.filter((h) => h.file.includes(flags.in ?? ""));
  const seen = new Set<string>();
  return filtered.filter((h) => {
    // Source searches deliberately collapse repeated nodes that render as the exact same line-oriented hit,
    // while semantic lenses may emit several distinct records from one source line (two z.object fields on
    // one line, for example). Include rendered identity so those findings survive without exposing a new
    // hit-id protocol or changing the line-oriented search behavior.
    const k = JSON.stringify([h.file, h.line, h.kind, h.text, hitStarts.get(h)]);
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

export interface EmitOptions {
  /** Additive fields for this verb's machine result. Omit entirely to preserve every existing JSON payload. */
  readonly jsonFields?: Readonly<Record<string, unknown>>;
}

const RESERVED_JSON_FIELDS = new Set(["label", "total", "shown", "hits", "meta"]);

function assertJsonFieldsAreAdditive(jsonFields: Readonly<Record<string, unknown>> | undefined): void {
  if (jsonFields === undefined) {
    return;
  }
  for (const field of Object.keys(jsonFields)) {
    if (RESERVED_JSON_FIELDS.has(field)) {
      throw new Error(`ast emit: jsonFields collides with reserved result field ${JSON.stringify(field)}`);
    }
  }
}

export function emit(hits: Hit[], flags: Flags, label: string, options: EmitOptions = {}): void {
  assertJsonFieldsAreAdditive(options.jsonFields);
  const unique = dedupe(hits, flags).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const files = new Set(unique.map((h) => h.file)).size;
  if (flags.json) {
    const shown = unique.slice(0, flags.max);
    noteMatches(unique.length, shown.length);
    warnTruncated(unique.length, shown.length, flags, label);
    // `meta` is ADDITIVE and last — every pre-existing key keeps its name, order and value, so a consumer
    // reading `total`/`hits` is untouched while a new one can audit the scope the answer came from.
    const common = { label, total: unique.length, shown: shown.length, hits: shown };
    const payload = options.jsonFields === undefined ? { ...common, meta: scanMeta() } : { ...common, ...options.jsonFields, meta: scanMeta() };
    print(JSON.stringify(payload, null, 1));
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
  print(unique.length === 0 ? `RESULT ast ${label}: no results` : `RESULT ast ${label}: ${unique.length} hit(s)${overflow} in ${files} file(s)`);
}

// The shared bootstrap supplies native per-tsconfig semantic programs for typed searches and a pure-AST
// project for syntactic searches. `wide` chooses searchGlobs instead of harnessGlobs without loading a
// type graph; its membership need not equal the native programs' authored roots.
export function loadProject(needTypes: boolean, wide = false): SourceCorpus {
  if (needTypes) {
    return createSemanticWorkspace({ root: REPO_ROOT }).sourceCorpus();
  }
  if (wide) {
    return getWorkspace({ root: REPO_ROOT, types: false, globs: searchGlobs(REPO_ROOT) });
  }
  return getWorkspace({ root: REPO_ROOT, types: false });
}
