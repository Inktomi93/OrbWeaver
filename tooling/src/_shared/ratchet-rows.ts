// The ONE home for a RATCHET BASELINE ROW — its on-disk spelling, its DEBT-vs-RATIFIED class, and the
// arithmetic every consumer splits the admitted number by (#569). A baseline row used to be a bare
// `subject → count`, which made a legitimate permanent admission (six ruled cross-plane door pairs, 341
// ruling/tool-FP suppressions) indistinguishable from parked backlog: the single-pass printed ONE number and
// the whole ledger read as a glut of debt nobody was burning down.
//
// THE CLASS IS DERIVED FROM A PARTITION, never stored beside the counts: a row declares how much of its
// budget is RATIFIED (permanent — a recorded ruling or a documented tool false positive makes it so) and the
// remainder is DEBT (burnable, the default). A stored class beside a count is two facts that can disagree; a
// partition cannot. `classOf` reads it back as debt | ratified | mixed.
//
// THE PROMISE IS TWO-SIDED (GATE-AUTHORING.md §4.4). A ratified portion REQUIRES a `why` AND at least one
// `cite`, and a cite is a REPO-RELATIVE PATH that must resolve on the tree, so a ratification cannot
// outlive the thing that justified it. NOTHING ENFORCES THAT MECHANICALLY ANY MORE: `ratchet-row-integrity`
// was the enforcer and it RETIRED 2026-09-14 with its subject — gates are mechanically forbidden from owning
// baseline ledgers (`lib/gate-contract.ts`, `[baseline-ledger]`), so the gate corpus holds zero ledgers to
// judge. The two surviving ratchets are ops-tier (`ops/ct-unfed-ratchet.ts` CT, `ops/orphan-export-ratchet.ts`
// push), both drained to zero rows, and their row integrity is their own tier's business. The migrated half
// of the property — cites that moved into reviewed-grant `why`/`endsWhen` prose — is owed by #2349. DECLARED LIMIT: a `§`/`#` suffix on a cite is prose (stripped before the existence check),
// and a D-number named inside a `why` is NOT resolved here — `d-citation-integrity` owns D-number integrity
// over packages/** + docs/architecture/core/**, and re-spelling its registry reader here would be a second
// home for it.
//
// TWO ON-DISK SHAPES, ONE READER (sniffed, never configured — a consumer that had to be TOLD the shape is a
// consumer that reads a new ledger as zero rows):
//   • BUDGET-MAP — `{ "<subject>": 3 }` (a bare number IS class debt, the default spelling) or
//     `{ "<subject>": { "count": 3, "ratified": 3, "why": "…", "cite": ["…"] } }`.
//   • ENTRIES-MAP — the orphan ratchet's `{ "note": "…", "entries": { "<subject>": "<reason>" } }`, where a
//     row is one membership (count 1) carrying its reason as its `why`.
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { isPlainObject } from "./page-validate.ts";
import { execNicedSync } from "./proc.ts";

/** The class AXIS, homed as one `as const` tuple so the union derives instead of being re-spelled
 *  (Spine-TypeScript-and-Patterns.md §7.5). `mixed` is a row that is PART ruled and part burnable — the
 *  per-file ledgers really do carry both in one row. */
const RATCHET_CLASSES = ["debt", "ratified", "mixed"] as const;

/** How a row's budget is classified, DERIVED from the ratified/debt partition. */
export type RatchetClass = (typeof RATCHET_CLASSES)[number];

/** ONE admitted row of ONE committed ledger. `count` is the whole committed budget; `ratified` is the
 *  permanent portion of it and `debt` is the burnable remainder — the two always sum to `count`. */
export interface RatchetRow {
  readonly subject: string;
  readonly count: number;
  readonly ratified: number;
  readonly debt: number;
  /** Why the ratified portion is permanent. REQUIRED when `ratified > 0`; optional prose on a debt row. */
  readonly why: string | null;
  /** Repo-relative paths backing the ratification. Non-empty when `ratified > 0`. */
  readonly cite: readonly string[];
}

/** What ONE gate's ratchet absolved this run, split by class — exactly the two numbers `ctx.scan` carries
 *  (`admitted`, `admittedRatified`). `ratified` is a SUBSET of `admitted`, never a number beside it. */
export interface RatchetAdmission {
  readonly admitted: number;
  readonly ratified: number;
}

/** The two committed spellings a ledger file takes. Sniffed by `readRatchetLedger`. */
export type RatchetLedgerShape = "budget-map" | "entries-map";

/** ONE parsed ledger: its shape, its rows in file order, and the envelope prose an entries-map carries. */
export interface RatchetLedgerFile {
  readonly rel: string;
  readonly shape: RatchetLedgerShape;
  readonly rows: readonly RatchetRow[];
  readonly note: string | null;
}

const BASELINE_SUFFIX = ".baseline.json";
const TOOLING_SRC = "tooling/src";
const SKIP_DIRS: ReadonlySet<string> = new Set(["node_modules", "dist"]);

/** A malformed ledger is never zero rows — it is a refusal. Thrown by the parser, surfaced as a TOOL ERROR
 *  by the debt walk and as a RED by the integrity gate. */
export class RatchetRowError extends Error {}

interface RawObjectRow {
  readonly count?: unknown;
  readonly ratified?: unknown;
  readonly why?: unknown;
  readonly cite?: unknown;
}

function requireCount(subject: string, raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new RatchetRowError(`row "${subject}": \`count\` must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return raw;
}

function readCite(subject: string, raw: unknown): readonly string[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw) || raw.some((c) => typeof c !== "string" || c.trim() === "")) {
    throw new RatchetRowError(`row "${subject}": \`cite\` must be an array of non-empty repo-relative path strings`);
  }
  return raw as readonly string[];
}

/** ONE budget-map row, in either spelling. THROWS on a shape no reader can trust — a ledger that cannot be
 *  parsed must never report zero admitted findings. */
export function parseRatchetRow(subject: string, raw: unknown): RatchetRow {
  if (typeof raw === "number") {
    const count = requireCount(subject, raw);
    return { subject, count, ratified: 0, debt: count, why: null, cite: [] };
  }
  if (!isPlainObject(raw)) {
    throw new RatchetRowError(
      `row "${subject}": a baseline row is a count, or an object carrying {count, ratified?, why?, cite?} — got ${JSON.stringify(raw)}`,
    );
  }
  const row = raw as RawObjectRow;
  const count = requireCount(subject, row.count);
  const ratified = row.ratified === undefined ? 0 : requireCount(subject, row.ratified);
  if (ratified > count) {
    throw new RatchetRowError(
      `row "${subject}": \`ratified\` (${ratified}) exceeds \`count\` (${count}) — the ratified portion is part of the budget, never beside it`,
    );
  }
  const why = row.why === undefined ? null : String(row.why);
  return { subject, count, ratified, debt: count - ratified, why, cite: readCite(subject, row.cite) };
}

/** What ONE per-count row absolves against a live count: the budget spends against the live findings, and
 *  the RATIFIED portion is spent FIRST (a partial admission is ruled before it is burnable — the opposite
 *  order would report a file's last remaining marker as permanent while its ruled ones burned down). An
 *  absent row admits nothing. */
export function admissionFor(row: RatchetRow | undefined, live: number): RatchetAdmission {
  if (row === undefined) {
    return { admitted: 0, ratified: 0 };
  }
  const admitted = Math.min(row.count, live);
  return { admitted, ratified: Math.min(row.ratified, admitted) };
}

/** A whole budget-map object → rows, keyed by subject. The ONE parse door: the file reader below uses it,
 *  and so does every INJECTED baseline (the residual tests), so a test can never exercise a shape the real
 *  ledger reader would refuse. */
export function parseBudgetMap(raw: Readonly<Record<string, unknown>>): ReadonlyMap<string, RatchetRow> {
  return new Map(Object.entries(raw).map(([subject, value]) => [subject, parseRatchetRow(subject, value)]));
}

/** debt | ratified | mixed, read back from the partition. An EMPTY budget (count 0) is debt-shaped: it
 *  admits nothing, so it claims no permanence. */
export function classOf(row: RatchetRow): RatchetClass {
  if (row.ratified === 0) {
    return "debt";
  }
  return row.ratified === row.count ? "ratified" : "mixed";
}

/** What a row PROMISES but does not deliver — the integrity gate's per-row arms, and the reason a hand-edit
 *  cannot mint a permanent admission without saying who ruled it. `root` resolves the cites. */
export function rowProblemsFor(row: RatchetRow, citeExists: (path: string) => boolean): readonly string[] {
  const problems: string[] = [];
  if (row.ratified === 0) {
    return problems;
  }
  if (row.why === null || row.why.trim() === "") {
    problems.push(
      `ratified ${row.ratified} of ${row.count} with NO \`why\` — a permanent admission that cannot say what ruled it is parked debt wearing a permit`,
    );
  }
  if (row.cite.length === 0) {
    problems.push("ratified with an EMPTY `cite` — name the repo-relative site(s) or ruling document the ratification rests on");
  }
  for (const cite of row.cite) {
    if (!citeExists(citePath(cite))) {
      problems.push(
        `STALE WHY — cited site \`${cite}\` is not on the tree: the ratification outlived what justified it. Re-cite it, or drop the row back to debt`,
      );
    }
  }
  return problems;
}

/** Filesystem-backed compatibility door for debt/generator callers. Resource policies supply their own
 *  authored-path identity predicate through {@link rowProblemsFor} and never receive the checkout root. */
export function rowProblems(root: string, row: RatchetRow): readonly string[] {
  return rowProblemsFor(row, (path) => citeResolves(root, path));
}

/** The repo-relative PATH inside one cite token: a `§`/`#` suffix is prose (see the header's declared limit)
 *  and is stripped here, at the ONE place that knows the token's grammar. `citeResolves` asks whether that
 *  path exists; a consumer that needs the path ITSELF — `duplicate-action-doors` matches a ruled DOOR set
 *  against its live census — reads it through this door rather than re-spelling the strip. */
export function citePath(cite: string): string {
  return (cite.split("#")[0] ?? cite).split("§")[0]?.trim() ?? "";
}

/** Does one cite token name something that still exists? A cite is a repo-relative PATH; a `§`/`#` suffix is
 *  prose and is stripped before the check (see the header's declared limit). */
export function citeResolves(root: string, cite: string): boolean {
  const path = citePath(cite);
  if (path === "" || isAbsolute(path)) {
    return false;
  }
  const rootAbs = resolve(root);
  const candidate = resolve(rootAbs, path);
  const lexicalRel = relative(rootAbs, candidate);
  if (lexicalRel === ".." || lexicalRel.startsWith(`..${sep}`) || isAbsolute(lexicalRel) || !existsSync(candidate)) {
    return false;
  }
  const realRoot = realpathSync(rootAbs);
  const realCandidate = realpathSync(candidate);
  const physicalRel = relative(realRoot, realCandidate);
  return physicalRel !== ".." && !physicalRel.startsWith(`..${sep}`) && !isAbsolute(physicalRel);
}

/** The `(D debt · R ratified)` half every consumer prints beside an admitted total — ONE spelling, so the
 *  single-pass line, `pnpm check:show` and the debt walk can never phrase the split differently. */
export function formatSplit(debt: number, ratified: number): string {
  return `(${debt} debt · ${ratified} ratified)`;
}

/** The suffix a gate appends to a diagnostic ABOUT a ratified row: the reader gets the RULING, not
 *  remediation advice for something that was already decided (#569). Empty for a pure-debt row. */
export function classNote(row: RatchetRow): string {
  if (row.ratified === 0) {
    return "";
  }
  const scope = row.ratified === row.count ? "RATIFIED" : `PARTLY RATIFIED (${row.ratified} of ${row.count})`;
  return ` — ${scope}: ${row.why ?? "(no why recorded — a ratified row owes one, GATE-AUTHORING.md §4.4)"} [cites: ${row.cite.join(", ")}]`;
}

function sniffShape(parsed: unknown): RatchetLedgerShape {
  return isPlainObject(parsed) && isPlainObject(parsed["entries"]) ? "entries-map" : "budget-map";
}

/** Parse one already-acquired strict-JSON ledger. This is the shared semantic half used by ResourceHost
 *  consumers; disk acquisition remains in {@link readRatchetLedger} for generators and debt commands. */
export function parseRatchetLedger(rel: string, parsed: unknown): RatchetLedgerFile {
  if (!isPlainObject(parsed)) {
    throw new RatchetRowError(`${rel} is not a JSON object`);
  }
  const shape = sniffShape(parsed);
  if (shape === "entries-map") {
    const entries = isPlainObject(parsed["entries"]) ? parsed["entries"] : {};
    const rows = Object.entries(entries).map(([subject, reason]) => parseEntriesRow(subject, reason));
    return { rel, shape, rows, note: typeof parsed["note"] === "string" ? parsed["note"] : null };
  }
  return { rel, shape, rows: [...parseBudgetMap(parsed).values()], note: null };
}

/** Every row of one committed ledger, in both shapes. THROWS (never returns empty) on unreadable JSON. */
export function readRatchetLedger(root: string, rel: string): RatchetLedgerFile {
  const path = join(root, rel);
  if (!existsSync(path)) {
    return { rel, shape: "budget-map", rows: [], note: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new RatchetRowError(`${rel} is unreadable or malformed — a debt ledger that cannot be parsed must never report zero rows`, { cause });
  }
  return parseRatchetLedger(rel, parsed);
}

/** An entries-map row: ONE membership, its reason as the `why`. Its class is DEBT by construction — the
 *  orphan ratchet's rows are the sweep's UNDECIDED set, which is the definition of burnable. */
function parseEntriesRow(subject: string, reason: unknown): RatchetRow {
  if (typeof reason !== "string") {
    throw new RatchetRowError(`row "${subject}": an entries-map row's value is its reason string, got ${JSON.stringify(reason)}`);
  }
  return { subject, count: 1, ratified: 0, debt: 1, why: reason, cite: [] };
}

/** The budget map a gate reads: subject → row. The ONE door every ratchet gate loads its budgets through. */
export function readBudgetRows(root: string, rel: string): ReadonlyMap<string, RatchetRow> {
  return new Map(readRatchetLedger(root, rel).rows.map((r) => [r.subject, r]));
}

/** The on-disk spelling of one row: a bare number when it is plain debt (the default, and what keeps a
 *  184-row ledger legible), the object form the moment it carries a class or prose. */
export function serializeRow(row: RatchetRow): number | Readonly<Record<string, unknown>> {
  if (row.ratified === 0 && (row.why === null || row.why === "") && row.cite.length === 0) {
    return row.count;
  }
  return {
    count: row.count,
    ...(row.ratified > 0 ? { ratified: row.ratified } : {}),
    ...(row.why === null ? {} : { why: row.why }),
    ...(row.cite.length > 0 ? { cite: row.cite } : {}),
  };
}

/** THE SINGLE WRITER's serializer (GATE-AUTHORING.md §4.8): rows sorted by subject, class preserved. A
 *  generator re-derives COUNTS from the tree; the classification is a RULING and must survive a regenerate,
 *  so `carry` supplies the previous ledger's rows and their class rides through. */
export function writeBudgetLedger(root: string, rel: string, counts: Readonly<Record<string, number>>, carry: ReadonlyMap<string, RatchetRow>): number {
  const out: Record<string, number | Readonly<Record<string, unknown>>> = {};
  for (const subject of Object.keys(counts).sort((a, b) => a.localeCompare(b))) {
    const count = counts[subject] ?? 0;
    const prior = carry.get(subject);
    const ratified = prior === undefined ? 0 : Math.min(prior.ratified, count);
    out[subject] = serializeRow({ subject, count, ratified, debt: count - ratified, why: prior?.why ?? null, cite: prior?.cite ?? [] });
  }
  writeLedgerFile(root, rel, out);
  return Object.keys(out).length;
}

/** The ONE ledger file-writer (every ratchet ledger, including gen ops with their own row semantics).
 *  The emitted JSON must match biome's formatter or the very next `pnpm check` reds on lint:biome
 *  (paid 2026-08-23: stringify expands short `cite` arrays across lines; biome collapses them). One
 *  formatter owns the style — run it on the file we just wrote rather than imitating its width rules. */
export function writeLedgerFile(root: string, rel: string, value: unknown): void {
  const abs = join(root, rel);
  writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`);
  execNicedSync("pnpm", ["exec", "biome", "format", "--write", abs], { cwd: root });
}

/** Every `*.baseline.json` actually on disk under `tooling/src/`, repo-relative. Derived from the filesystem
 *  on purpose: a declared table can only report what it was told, and a ledger nobody enumerates is debt
 *  nobody can triage (the debt walk's reconciliation, the integrity gate's corpus). */
export function discoverBaselineFiles(root: string): readonly string[] {
  const out: string[] = [];
  if (!existsSync(join(root, TOOLING_SRC))) {
    return out;
  }
  const walk = (rel: string): void => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) {
          walk(`${rel}/${e.name}`);
        }
        continue;
      }
      if (e.name.endsWith(BASELINE_SUFFIX)) {
        out.push(`${rel}/${e.name}`);
      }
    }
  };
  walk(TOOLING_SRC);
  return out.sort((a, b) => a.localeCompare(b));
}
