// Ranks tracked source files by how often history touched and fixed them. It reads one `git log` pass, follows
// renames to each file's current path, and counts wide commits apart: a codemod touches a file without saying
// anything about that file.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";

const SORTS = ["defect", "hot", "fix", "commits", "churn", "ratio", "recent"] as const;
type Sort = (typeof SORTS)[number];

const USAGE = `usage: pnpm hotspots [--sort ${SORTS.join("|")}] [--top n] [--path prefix] [--since date] [--min-commits n] [--wide n] [--json]

defect   fix commits weighted by how few files each touched, per 100 lines
hot      fix commits weighted by file size
fix      commits with a fix or revert subject
commits  every commit that touched the file
churn    lines added and deleted
ratio    fix commits over commits, for files with at least --min-commits
recent   fix commits in the last 30 days`;

const GIT_BUFFER_BYTES = 2_147_483_647;
const COLUMN_WIDTH = 8;
const RECENT_DAYS = 30;
const DAY_MS = 86_400_000;
const FIX_SUBJECT = /^(fix|revert|hotfix)\b/iu;
const SOURCE_FILE = /\.(ts|tsx|mts|css|sh|mjs)$/u;
const COMPOSITION_DIR = "/entry/compose/";
const PER_LINES = 100;
// A density over a few lines ranks size, not defects.
const MIN_DENSITY_LINES = 50;
const GENERATED_FILE = /(^|\/)(dist|generated|__generated__)\/|\.d\.ts$|\.gen\.ts$/u;
const COMMIT_MARK = "\u0001";
const BARREL_LINE = /^\s*($|\/\/|\/\*|\*|export (\*|type \*|\{|type \{)|import |(type )?[\w$]+( as [\w$]+)?,$|\}.*from )/u;

interface Commit {
  readonly date: string;
  readonly fix: boolean;
  readonly files: readonly { readonly path: string; readonly from: string | null; readonly lines: number }[];
}

interface Row {
  readonly path: string;
  commits: number;
  fixes: number;
  recentFixes: number;
  churn: number;
  wide: number;
  last: string;
  size: number;
  hot: number;
  focused: number;
}

function git(args: readonly string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: GIT_BUFFER_BYTES });
}

/** `a/{b => c}/d` and `b => c` are numstat's rename spellings. */
function renamed(spelled: string): { readonly path: string; readonly from: string | null } {
  const braced = /^(.*)\{(.*) => (.*)\}(.*)$/u.exec(spelled);
  if (braced !== null) {
    const [, head = "", from = "", to = "", tail = ""] = braced;
    const join = (middle: string): string => `${head}${middle}${tail}`.replaceAll("//", "/");
    return { path: join(to), from: join(from) };
  }
  const plain = /^(.*) => (.*)$/u.exec(spelled);
  return plain === null ? { path: spelled, from: null } : { path: plain[2] ?? spelled, from: plain[1] ?? null };
}

function parseCommit(block: string): Commit {
  const [head = "", ...rows] = block.split("\n");
  const [date = "", subject = ""] = head.split("\t");
  const files = rows.flatMap((row) => {
    const [added, deleted, spelled] = row.split("\t");
    if (spelled === undefined) {
      return [];
    }
    return [{ ...renamed(spelled), lines: (Number(added) || 0) + (Number(deleted) || 0) }];
  });
  return { date, fix: FIX_SUBJECT.test(subject), files };
}

function readHistory(since: string | undefined): readonly Commit[] {
  const range = since === undefined ? [] : [`--since=${since}`];
  const log = git(["log", "main", "--no-merges", "-M", "--numstat", `--format=${COMMIT_MARK}%cs%x09%s`, ...range]);
  return log.split(COMMIT_MARK).slice(1).map(parseCommit);
}

function lineCount(path: string): number {
  return readFileSync(path, "utf8").split("\n").length;
}

function isBarrel(path: string): boolean {
  return (
    path.endsWith("/index.ts") &&
    readFileSync(path, "utf8")
      .split("\n")
      .every((line) => BARREL_LINE.test(line))
  );
}

function counted(path: string, tracked: ReadonlySet<string>): boolean {
  return tracked.has(path) && SOURCE_FILE.test(path) && !GENERATED_FILE.test(path) && !isBarrel(path);
}

function record(row: Row, commit: Commit, lines: number, limits: { readonly wide: number; readonly recentFrom: string }): void {
  if (commit.files.length > limits.wide) {
    row.wide += 1;
    return;
  }
  row.commits += 1;
  row.churn += lines;
  row.fixes += commit.fix ? 1 : 0;
  row.focused += commit.fix ? 1 / commit.files.length : 0;
  row.recentFixes += commit.fix && commit.date >= limits.recentFrom ? 1 : 0;
}

function tally(commits: readonly Commit[], wideLimit: number, recentFrom: string): readonly Row[] {
  const tracked = new Set(git(["ls-files"]).split("\n"));
  const judged = new Map<string, boolean>();
  const current = new Map<string, string>();
  const rows = new Map<string, Row>();
  // History reads newest first, so a rename's new name has already resolved to today's path.
  for (const commit of commits) {
    for (const file of commit.files) {
      const path = current.get(file.path) ?? file.path;
      if (file.from !== null) {
        current.set(file.from, path);
      }
      const keep = judged.get(path) ?? counted(path, tracked);
      judged.set(path, keep);
      if (keep) {
        const row = rows.get(path) ?? {
          path,
          commits: 0,
          fixes: 0,
          recentFixes: 0,
          churn: 0,
          wide: 0,
          last: commit.date,
          size: lineCount(path),
          hot: 0,
          focused: 0,
        };
        rows.set(path, row);
        record(row, commit, file.lines, { wide: wideLimit, recentFrom });
      }
    }
  }
  for (const row of rows.values()) {
    row.hot = Math.round(row.fixes * Math.log2(row.size + 1));
  }
  return [...rows.values()];
}

const RANKERS: Readonly<Record<Sort, (row: Row) => number>> = {
  defect: (row) => (row.focused * PER_LINES) / row.size,
  hot: (row) => row.hot,
  fix: (row) => row.fixes,
  commits: (row) => row.commits,
  churn: (row) => row.churn,
  ratio: (row) => row.fixes / Math.max(row.commits, 1),
  recent: (row) => row.recentFixes,
};

function isSort(value: string): value is Sort {
  return SORTS.some((sort) => sort === value);
}

function table(rows: readonly Row[]): string {
  const cells = (values: readonly string[]): string => values.map((value) => value.padStart(COLUMN_WIDTH)).join("");
  const body = rows.map(
    (row) => `${cells([row.hot, row.fixes, row.recentFixes, row.commits, row.churn, row.size, row.wide].map(String))}  ${row.last}  ${row.path}`,
  );
  return [`${cells(["hot", "fixes", "30d", "commits", "churn", "lines", "wide"])}  last        file`, ...body].join("\n");
}

function main(): void {
  const { values } = parseArgs({
    options: {
      sort: { type: "string", default: "defect" },
      top: { type: "string", default: "40" },
      path: { type: "string", default: "" },
      since: { type: "string" },
      "min-commits": { type: "string", default: "10" },
      wide: { type: "string", default: "40" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || !isSort(values.sort)) {
    process.stdout.write(`${USAGE}\n`);
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  const rank = RANKERS[values.sort];
  const density = values.sort === "ratio" || values.sort === "defect";
  const minimum = density ? Number(values["min-commits"]) : 0;
  const minimumLines = values.sort === "defect" ? MIN_DENSITY_LINES : 0;
  const recentFrom = new Date(Date.now() - RECENT_DAYS * DAY_MS).toISOString().slice(0, "yyyy-mm-dd".length);
  const commits = readHistory(values.since);
  const rows = tally(commits, Number(values.wide), recentFrom)
    .filter(
      (row) =>
        row.path.startsWith(values.path) &&
        row.commits >= minimum &&
        row.size >= minimumLines &&
        !(values.sort === "defect" && row.path.includes(COMPOSITION_DIR)),
    )
    .toSorted((a, b) => rank(b) - rank(a))
    .slice(0, Number(values.top));
  process.stdout.write(values.json ? `${JSON.stringify(rows)}\n` : `${String(commits.length)} commits, sorted by ${values.sort}\n${table(rows)}\n`);
}

main();
