import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const CATALOG_DIR = "docs/catalog";
const LANES_PATH = `${CATALOG_DIR}/lanes.json`;
const STATE_PATH = `${CATALOG_DIR}/state.json`;
const OUTPUT_PATH = `${CATALOG_DIR}/catalog.json`;
const RECEIPTS_DIR = `${CATALOG_DIR}/receipts`;
const FRONTMATTER_FENCE_LENGTH = 4;
const FRONTMATTER_LINE_OFFSET = 2;
const EXIT_MISUSE = 3;
const FRONTMATTER_FIELD_RE = /^([a-z][a-z-]*):\s*(.*?)\s*$/u;
const INDENTED_YAML_RE = /^\s+/u;
const QUOTED_SCALAR_RE = /^(["'])(.*)\1$/u;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;
const COMMIT_RE = /^[a-f0-9]{40}$/u;
const VALID_KINDS = new Set([
  "artifact",
  "design",
  "handoff",
  "history",
  "index",
  "law",
  "program",
  "reference",
  "research",
  "review",
  "runbook",
  "spec",
  "vendor",
]);
const VALID_STATUSES = new Set(["active", "archived", "complete", "draft", "parked", "snapshot", "superseded"]);
const VALID_DISPOSITIONS = new Set([
  "archive",
  "current",
  "delete-candidate",
  "generated-artifact",
  "needs-owner",
  "pending",
  "repaired",
  "superseded",
  "vendor-snapshot",
]);
const VALID_AUTHORITIES = new Set(["current-reference", "design", "generated", "historical", "normative", "operational", "review", "unclassified", "vendor"]);
const REQUIRED_FRONTMATTER_KEYS = ["kind", "status", "updated"];
const ALLOWED_FRONTMATTER_KEYS = new Set([...REQUIRED_FRONTMATTER_KEYS, "supersedes"]);

type Lane = {
  readonly id: string;
  readonly issue: number;
  readonly patterns: readonly string[];
  readonly excludePatterns?: readonly string[];
};

type LaneConfig = { readonly schemaVersion: number; readonly lanes: readonly Lane[] };

export type ReceiptEntry = {
  readonly path: string;
  readonly assignedSha256: string;
  readonly disposition: string;
  readonly authority: string;
  readonly fullRead: boolean;
  readonly verifiedSha256: string | null;
  readonly verifiedCommit: string | null;
  readonly verifiedAt: string | null;
  readonly evidence: readonly string[];
  readonly summary: string;
};

type Receipt = {
  readonly schemaVersion: number;
  readonly lane: string;
  readonly issue: number;
  readonly entries: readonly ReceiptEntry[];
};

type Floors = {
  readonly pending: number;
  readonly missingFrontmatter: number;
  readonly invalidFrontmatter: number;
  readonly malformedFrontmatter: number;
};

type DebtPaths = { readonly [K in keyof Floors]: readonly string[] };

type State = { readonly schemaVersion: number; readonly allowed?: DebtPaths };

export type Frontmatter = {
  readonly present: boolean;
  readonly malformed: boolean;
  readonly fields: Readonly<Record<string, string>>;
  readonly errors: readonly string[];
};

type Doc = {
  readonly path: string;
  readonly lines: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly frontmatter: Frontmatter;
};

const root = process.cwd();

function json<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as T;
}

function stableJson(value: unknown): string {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  return execFileSync("pnpm", ["exec", "biome", "format", "--stdin-file-path", OUTPUT_PATH], {
    cwd: root,
    encoding: "utf8",
    input: source,
  });
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function trackedDocs(): readonly string[] {
  return execFileSync("git", ["ls-files", "-z", "--", "docs"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((path) => path.endsWith(".md"))
    .sort();
}

function countLines(content: Buffer): number {
  if (content.length === 0) {
    return 0;
  }
  let lines = 0;
  for (const byte of content) {
    if (byte === 10) {
      lines += 1;
    }
  }
  return content.at(-1) === 10 ? lines : lines + 1;
}

export function parseFrontmatter(source: string, path = "document.md"): Frontmatter {
  if (!source.startsWith("---\n")) {
    return { present: false, malformed: false, fields: {}, errors: [] };
  }
  const close = source.indexOf("\n---\n", FRONTMATTER_FENCE_LENGTH);
  if (close < 0) {
    return { present: true, malformed: true, fields: {}, errors: [`${path}: frontmatter has no closing --- fence`] };
  }
  const fields: Record<string, string> = {};
  const errors: string[] = [];
  for (const [index, raw] of source.slice(FRONTMATTER_FENCE_LENGTH, close).split("\n").entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    if (INDENTED_YAML_RE.test(raw)) {
      errors.push(`${path}:${index + FRONTMATTER_LINE_OFFSET}: nested frontmatter is not allowed`);
      continue;
    }
    const match = FRONTMATTER_FIELD_RE.exec(line);
    if (match === null) {
      errors.push(`${path}:${index + FRONTMATTER_LINE_OFFSET}: frontmatter must be flat key: value YAML`);
      continue;
    }
    const [, key = "", value = ""] = match;
    if (key in fields) {
      errors.push(`${path}:${index + FRONTMATTER_LINE_OFFSET}: duplicate frontmatter key ${key}`);
    }
    fields[key] = value.replace(QUOTED_SCALAR_RE, "$2");
  }
  return { present: true, malformed: errors.length > 0, fields, errors };
}

function frontmatterErrors(path: string, frontmatter: Frontmatter): readonly string[] {
  if (path.startsWith("docs/vendor/")) {
    return [];
  }
  if (!frontmatter.present) {
    return [];
  }
  const errors = [...frontmatter.errors];
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    if (!(key in frontmatter.fields)) {
      errors.push(`${path}: missing frontmatter key ${key}`);
    }
  }
  for (const key of Object.keys(frontmatter.fields)) {
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      errors.push(`${path}: unsupported frontmatter key ${key}`);
    }
  }
  const kind = frontmatter.fields["kind"];
  const status = frontmatter.fields["status"];
  const updated = frontmatter.fields["updated"];
  if (kind !== undefined && !VALID_KINDS.has(kind)) {
    errors.push(`${path}: invalid frontmatter kind ${kind}`);
  }
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    errors.push(`${path}: invalid frontmatter status ${status}`);
  }
  if (updated !== undefined && !DATE_RE.test(updated)) {
    errors.push(`${path}: updated must be YYYY-MM-DD`);
  }
  return errors;
}

function documents(): readonly Doc[] {
  return trackedDocs().map((path) => {
    const content = readFileSync(join(root, path));
    const source = content.toString("utf8");
    const frontmatter = parseFrontmatter(source, path);
    const vendor = path.startsWith("docs/vendor/");
    return {
      path,
      lines: countLines(content),
      bytes: content.length,
      sha256: sha256(content),
      frontmatter: {
        ...frontmatter,
        malformed: vendor ? false : frontmatter.malformed,
        errors: frontmatterErrors(path, frontmatter),
      },
    };
  });
}

function pathsForLane(lane: Lane): ReadonlySet<string> {
  const included = new Set(lane.patterns.flatMap((pattern) => globSync(pattern, { cwd: root })));
  for (const pattern of lane.excludePatterns ?? []) {
    for (const path of globSync(pattern, { cwd: root })) {
      included.delete(path);
    }
  }
  return included;
}

function laneAssignments(config: LaneConfig, docs: readonly Doc[]): ReadonlyMap<string, Lane> {
  const matches = new Map<string, Lane[]>();
  for (const lane of config.lanes) {
    for (const path of pathsForLane(lane)) {
      matches.set(path, [...(matches.get(path) ?? []), lane]);
    }
  }
  const result = new Map<string, Lane>();
  const errors: string[] = [];
  for (const doc of docs) {
    const owners = matches.get(doc.path) ?? [];
    if (owners.length !== 1) {
      errors.push(`${doc.path}: expected one lane, got ${owners.map((lane) => lane.id).join(", ") || "none"}`);
      continue;
    }
    result.set(doc.path, owners[0] as Lane);
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return result;
}

function receiptPath(lane: Lane): string {
  return `${RECEIPTS_DIR}/${lane.id}.json`;
}

function loadReceipts(config: LaneConfig): readonly Receipt[] {
  return config.lanes.map((lane) => json<Receipt>(receiptPath(lane)));
}

function pendingEntry(doc: Doc): ReceiptEntry {
  return {
    path: doc.path,
    assignedSha256: doc.sha256,
    disposition: "pending",
    authority: "unclassified",
    fullRead: false,
    verifiedSha256: null,
    verifiedCommit: null,
    verifiedAt: null,
    evidence: [],
    summary: "",
  };
}

function bootstrap(config: LaneConfig, docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>): void {
  mkdirSync(join(root, RECEIPTS_DIR), { recursive: true });
  for (const lane of config.lanes) {
    const path = receiptPath(lane);
    if (existsSync(join(root, path))) {
      throw new Error(`${path} already exists; bootstrap is one-shot`);
    }
    const entries = docs.filter((doc) => assignments.get(doc.path)?.id === lane.id).map(pendingEntry);
    writeFileSync(join(root, path), stableJson({ schemaVersion: SCHEMA_VERSION, lane: lane.id, issue: lane.issue, entries } satisfies Receipt));
  }
  const allowed = migrationDebt(docs, loadReceipts(config));
  writeFileSync(join(root, STATE_PATH), stableJson({ schemaVersion: SCHEMA_VERSION, allowed } satisfies State));
  writeCatalog(config, docs, assignments, loadReceipts(config));
}

function migrationDebt(docs: readonly Doc[], receipts: readonly Receipt[]): DebtPaths {
  const entries = receipts.flatMap((receipt) => receipt.entries);
  return {
    pending: entries
      .filter((entry) => entry.disposition === "pending")
      .map((entry) => entry.path)
      .sort(),
    missingFrontmatter: docs
      .filter((doc) => !(doc.path.startsWith("docs/vendor/") || doc.frontmatter.present))
      .map((doc) => doc.path)
      .sort(),
    invalidFrontmatter: docs
      .filter((doc) => doc.frontmatter.present && doc.frontmatter.errors.length > 0)
      .map((doc) => doc.path)
      .sort(),
    malformedFrontmatter: docs
      .filter((doc) => doc.frontmatter.malformed)
      .map((doc) => doc.path)
      .sort(),
  };
}

function migrationMetrics(docs: readonly Doc[], receipts: readonly Receipt[]): Floors {
  const debt = migrationDebt(docs, receipts);
  return Object.fromEntries((Object.keys(debt) as (keyof Floors)[]).map((key) => [key, debt[key].length])) as Floors;
}

type ValidationInput = {
  readonly config: LaneConfig;
  readonly docs: readonly Doc[];
  readonly assignments: ReadonlyMap<string, Lane>;
  readonly receipts: readonly Receipt[];
  readonly state: State;
};

function indexReceipts(
  config: LaneConfig,
  assignments: ReadonlyMap<string, Lane>,
  receipts: readonly Receipt[],
): { readonly byPath: ReadonlyMap<string, ReceiptEntry>; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const byPath = new Map<string, ReceiptEntry>();
  for (const receipt of receipts) {
    const lane = config.lanes.find((candidate) => candidate.id === receipt.lane);
    if (receipt.schemaVersion !== SCHEMA_VERSION || lane === undefined || receipt.issue !== lane.issue) {
      errors.push(`${receipt.lane}: receipt header does not match lanes.json`);
    }
    for (const entry of receipt.entries) {
      if (byPath.has(entry.path)) {
        errors.push(`${entry.path}: duplicate receipt entry`);
      }
      byPath.set(entry.path, entry);
      if (assignments.get(entry.path)?.id !== receipt.lane) {
        errors.push(`${entry.path}: receipt is in ${receipt.lane}, expected ${assignments.get(entry.path)?.id ?? "no lane"}`);
      }
      errors.push(...validateReceiptEntry(entry));
    }
  }
  return { byPath, errors };
}

function coverageErrors(docs: readonly Doc[], byPath: ReadonlyMap<string, ReceiptEntry>): readonly string[] {
  const errors: string[] = [];
  const paths = new Set(docs.map((doc) => doc.path));
  for (const doc of docs) {
    if (!byPath.has(doc.path)) {
      errors.push(`${doc.path}: missing receipt entry`);
    }
  }
  for (const path of byPath.keys()) {
    if (!paths.has(path)) {
      errors.push(`${path}: receipt exists for an untracked document`);
    }
  }
  return errors;
}

export function debtPathErrors(current: DebtPaths, allowed: DebtPaths | undefined): readonly string[] {
  if (allowed === undefined) {
    return [`${STATE_PATH}: legacy count-only state must be upgraded with pnpm doc-catalog:ratchet`];
  }
  const errors: string[] = [];
  for (const key of Object.keys(current) as (keyof Floors)[]) {
    const accepted = new Set(allowed[key]);
    for (const path of current[key]) {
      if (!accepted.has(path)) {
        errors.push(`${key}: new debt path ${path} is not in the ratchet allowance`);
      }
    }
  }
  return errors;
}

function staleReceiptErrors(docs: readonly Doc[], byPath: ReadonlyMap<string, ReceiptEntry>): readonly string[] {
  const errors: string[] = [];
  for (const doc of docs) {
    const entry = byPath.get(doc.path);
    if (entry !== undefined && entry.disposition !== "pending" && entry.verifiedSha256 !== doc.sha256) {
      errors.push(`${doc.path}: fact-check receipt is stale; content hash changed`);
    }
  }
  return errors;
}

function validate(input: ValidationInput): readonly string[] {
  const indexed = indexReceipts(input.config, input.assignments, input.receipts);
  const debt = migrationDebt(input.docs, input.receipts);
  return [
    ...indexed.errors,
    ...coverageErrors(input.docs, indexed.byPath),
    ...debtPathErrors(debt, input.state.allowed),
    ...staleReceiptErrors(input.docs, indexed.byPath),
  ];
}

function pendingClaimsEvidence(entry: ReceiptEntry): boolean {
  return (
    entry.fullRead ||
    entry.verifiedSha256 !== null ||
    entry.verifiedCommit !== null ||
    entry.verifiedAt !== null ||
    entry.evidence.length > 0 ||
    entry.summary !== "" ||
    entry.authority !== "unclassified"
  );
}

function reviewedReceiptErrors(entry: ReceiptEntry): readonly string[] {
  const requirements: readonly [boolean, string][] = [
    [entry.fullRead, "reviewed disposition requires fullRead=true"],
    [SHA256_RE.test(entry.verifiedSha256 ?? ""), "reviewed disposition requires a SHA-256"],
    [COMMIT_RE.test(entry.verifiedCommit ?? ""), "reviewed disposition requires a full git commit"],
    [DATE_RE.test(entry.verifiedAt ?? ""), "reviewed disposition requires verifiedAt YYYY-MM-DD"],
    [entry.evidence.length > 0, "reviewed disposition requires evidence"],
    [entry.summary.trim() !== "", "reviewed disposition requires a summary"],
    [entry.authority !== "unclassified", "reviewed disposition requires an authority"],
  ];
  return requirements.filter(([satisfied]) => !satisfied).map(([, message]) => `${entry.path}: ${message}`);
}

export function validateReceiptEntry(entry: ReceiptEntry): readonly string[] {
  const errors = [
    ...(VALID_DISPOSITIONS.has(entry.disposition) ? [] : [`${entry.path}: invalid disposition ${entry.disposition}`]),
    ...(VALID_AUTHORITIES.has(entry.authority) ? [] : [`${entry.path}: invalid authority ${entry.authority}`]),
  ];
  if (entry.disposition === "pending") {
    return pendingClaimsEvidence(entry) ? [...errors, `${entry.path}: pending receipt must not claim review evidence`] : errors;
  }
  return [...errors, ...reviewedReceiptErrors(entry)];
}

export function catalogReceipt(
  receipt: ReceiptEntry | undefined,
  currentSha256: string,
): {
  readonly receipt: ReceiptEntry | null;
  readonly receiptCurrent: boolean;
} {
  return {
    receipt: receipt ?? null,
    receiptCurrent: receipt !== undefined && receipt.disposition !== "pending" && receipt.verifiedSha256 === currentSha256,
  };
}

function catalogValue(_config: LaneConfig, docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>, receipts: readonly Receipt[]): unknown {
  const entries = new Map(receipts.flatMap((receipt) => receipt.entries.map((entry) => [entry.path, entry] as const)));
  return {
    schemaVersion: SCHEMA_VERSION,
    stats: migrationMetrics(docs, receipts),
    documents: docs.map((doc) => {
      const lane = assignments.get(doc.path) as Lane;
      const receipt = entries.get(doc.path);
      return {
        path: doc.path,
        lane: lane.id,
        issue: lane.issue,
        lines: doc.lines,
        bytes: doc.bytes,
        sha256: doc.sha256,
        frontmatter: doc.frontmatter,
        ...catalogReceipt(receipt, doc.sha256),
      };
    }),
  };
}

function writeCatalog(config: LaneConfig, docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>, receipts: readonly Receipt[]): void {
  writeFileSync(join(root, OUTPUT_PATH), stableJson(catalogValue(config, docs, assignments, receipts)));
}

function sync(config: LaneConfig, docs: readonly Doc[], assignments: ReadonlyMap<string, Lane>): void {
  const docsByPath = new Map(docs.map((doc) => [doc.path, doc] as const));
  for (const receipt of loadReceipts(config)) {
    const lane = config.lanes.find((candidate) => candidate.id === receipt.lane) as Lane;
    const known = new Set(receipt.entries.map((entry) => entry.path));
    const added = docs.filter((doc) => assignments.get(doc.path)?.id === lane.id && !known.has(doc.path)).map(pendingEntry);
    const removed = receipt.entries.filter((entry) => !docsByPath.has(entry.path));
    if (removed.length > 0) {
      throw new Error(`${receipt.lane}: remove or re-home stale receipt rows manually:\n${removed.map((entry) => entry.path).join("\n")}`);
    }
    if (added.length > 0) {
      writeFileSync(
        join(root, receiptPath(lane)),
        stableJson({ ...receipt, entries: [...receipt.entries, ...added].toSorted((a, b) => a.path.localeCompare(b.path)) }),
      );
    }
  }
}

function ratchet(docs: readonly Doc[], receipts: readonly Receipt[]): void {
  const state = json<State>(STATE_PATH);
  const allowed = migrationDebt(docs, receipts);
  const errors = state.allowed === undefined ? [] : debtPathErrors(allowed, state.allowed);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  writeFileSync(join(root, STATE_PATH), stableJson({ schemaVersion: SCHEMA_VERSION, allowed } satisfies State));
}

function main(): void {
  const mode = process.argv[2];
  if (!["--bootstrap", "--check", "--ratchet", "--sync", "--write"].includes(mode ?? "")) {
    process.stderr.write("usage: catalog.ts (--bootstrap | --check | --ratchet | --sync | --write)\n");
    process.exitCode = EXIT_MISUSE;
    return;
  }
  const config = json<LaneConfig>(LANES_PATH);
  const docs = documents();
  const assignments = laneAssignments(config, docs);
  if (mode === "--bootstrap") {
    bootstrap(config, docs, assignments);
    process.stdout.write(`doc-catalog — bootstrapped ${docs.length} documents\n`);
    return;
  }
  if (mode === "--sync") {
    sync(config, docs, assignments);
  }
  let receipts = loadReceipts(config);
  if (mode === "--ratchet") {
    ratchet(docs, receipts);
    receipts = loadReceipts(config);
  }
  const state = json<State>(STATE_PATH);
  const errors = [...validate({ config, docs, assignments, receipts, state })];
  const expected = stableJson(catalogValue(config, docs, assignments, receipts));
  if (mode === "--write" || mode === "--sync" || mode === "--ratchet") {
    writeFileSync(join(root, OUTPUT_PATH), expected);
  } else if (!existsSync(join(root, OUTPUT_PATH)) || readFileSync(join(root, OUTPUT_PATH), "utf8") !== expected) {
    errors.push(`${OUTPUT_PATH}: generated catalog is stale; run pnpm doc-catalog:write`);
  }
  if (errors.length > 0) {
    process.stderr.write(`check:doc-catalog — ${errors.length} violation(s):\n${errors.map((error) => `  ${error}`).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`check:doc-catalog — ${docs.length} documents; ${migrationMetrics(docs, receipts).pending} pending fact-checks\n`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(root, process.argv[1])) {
  main();
}
