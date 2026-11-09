// @subject tests/support/node/corpus.ts
// Publishes from one tree must be byte-identical: every id comes from the injected source in a fixed order, whatever
// the provider latency or the pauses between a producer's calls. A producer that skips a settle splits a perturbed publish.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { createCorpusCapsule, publishCorpusFixture } from "./corpus.ts";
import { createCorpusRecipe } from "./corpus-recipe.ts";
import { expect, test } from "./fixtures.ts";

const PUBLISH_BUDGET_MS = 900_000;
// The settle loop's own deadline is real time; delayed providers and stalled calls need more than its default.
const PERTURBED_SETTLE_MS = 600_000;
const EMBEDDING_LATENCY_MS = 40;
const PROVIDER_LATENCY_MS = 15;
const CALLER_STALL_MS = 25;
const EMBEDDINGS_PATH = "/embeddings";
const DATABASE_SUFFIX = ".db";
const SQLITE_HEADER_BYTES = 100;
const PAGE_SIZE_OFFSET = 16;
const REPORTED_PAGES = 8;
const REPORTED_ROW_CHARS = 400;

// Latency slows detached work behind the producer; a stall lets detached work run ahead of the producer's next write.
const VARIANTS = ["plain", "latency", "stall"] as const;
type Variant = (typeof VARIANTS)[number];

type CorpusOptions = Awaited<ReturnType<typeof createCorpusRecipe>>["options"];

function perturbed(options: CorpusOptions, variant: Variant): CorpusOptions {
  switch (variant) {
    case "plain":
      return options;
    case "latency": {
      const inner = options.server.providerFetch ?? fetch;
      const providerFetch: typeof fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        await delay(new URL(url).pathname.endsWith(EMBEDDINGS_PATH) ? EMBEDDING_LATENCY_MS : PROVIDER_LATENCY_MS);
        return await inner(input, init);
      };
      return { ...options, server: { ...options.server, providerFetch, workloadExecutionSignal: AbortSignal.timeout(PERTURBED_SETTLE_MS) } };
    }
    case "stall":
      return { ...options, server: { ...options.server, callerStallMs: CALLER_STALL_MS, workloadExecutionSignal: AbortSignal.timeout(PERTURBED_SETTLE_MS) } };
  }
}

async function publishOnce(parent: string, name: string, variant: Variant): Promise<string> {
  await using ownership = new AsyncDisposableStack();
  const scratch = await mkdtemp(join(parent, `${name}-scratch-`));
  const options = perturbed((await createCorpusRecipe(scratch)).options, variant);
  const capsule = ownership.use(await createCorpusCapsule({ ...options, directory: join(scratch, "source") }));
  const published = join(parent, name);
  await publishCorpusFixture(capsule, published);
  return published;
}

async function filesUnder(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files.set(path.slice(root.length), await readFile(path));
    }
  }
  return files;
}

// Values serialize with blobs as hex, so equal rows compare equal as text.
function rowText(row: Record<string, unknown>): string {
  return JSON.stringify(row, (_key, value: unknown) => (value instanceof Uint8Array ? `x'${Buffer.from(value).toString("hex")}'` : value));
}

// A vector or a long text row would bury the field that differs, so a long row shows from where it leaves the other.
function clipped(row: string | undefined, other: string | undefined): string {
  if (row === undefined) {
    return "(none)";
  }
  if (row.length <= REPORTED_ROW_CHARS) {
    return row;
  }
  const split = row.split("").findIndex((unit, index) => unit !== other?.[index]);
  const from = Math.max(0, Math.min(split, row.length) - REPORTED_ROW_CHARS / 2);
  return `${from > 0 ? "…" : ""}${row.slice(from, from + REPORTED_ROW_CHARS)}…`;
}

function tableRows(db: DatabaseSync, table: string): string[] {
  return db
    .prepare(`SELECT * FROM "${table.replaceAll('"', '""')}"`)
    .all()
    .map(rowText)
    .toSorted();
}

function tablesOf(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => String(row["name"]));
}

// Each row of `rows` that `other` lacks, counting duplicates.
function rowsMissingFrom(rows: readonly string[], other: readonly string[]): string[] {
  const pool = new Map<string, number>();
  for (const row of other) {
    pool.set(row, (pool.get(row) ?? 0) + 1);
  }
  return rows.filter((row) => {
    const left = pool.get(row) ?? 0;
    pool.set(row, left - 1);
    return left <= 0;
  });
}

// With equal rows, the difference is layout: name the header bytes and the first pages that differ.
function pageDifference(first: Buffer, second: Buffer): string {
  const pageSize = first.readUInt16BE(PAGE_SIZE_OFFSET) === 1 ? 65_536 : first.readUInt16BE(PAGE_SIZE_OFFSET);
  const length = Math.max(first.length, second.length);
  const header: number[] = [];
  const pages = new Set<number>();
  for (let offset = 0; offset < length; offset++) {
    if (first[offset] !== second[offset]) {
      if (offset < SQLITE_HEADER_BYTES) {
        header.push(offset);
      }
      pages.add(Math.floor(offset / pageSize) + 1);
    }
  }
  const reported = [...pages].slice(0, REPORTED_PAGES);
  return `rows equal; sizes ${String(first.length)} and ${String(second.length)}, page size ${String(pageSize)}; header bytes differ at [${header.join(", ")}]; ${String(pages.size)} pages differ, first [${reported.join(", ")}]`;
}

/** What differs between two published databases: per table, the row counts and first rows only one side holds. */
function databaseDifference(firstPath: string, secondPath: string, firstBytes: Buffer, secondBytes: Buffer): string {
  const first = new DatabaseSync(firstPath, { readOnly: true });
  const second = new DatabaseSync(secondPath, { readOnly: true });
  try {
    const firstTables = tablesOf(first);
    const secondTables = tablesOf(second);
    const findings = [...new Set([...firstTables, ...secondTables])].toSorted().flatMap((table) => {
      const left = firstTables.includes(table) ? tableRows(first, table) : [];
      const right = secondTables.includes(table) ? tableRows(second, table) : [];
      const onlyFirst = rowsMissingFrom(left, right);
      const onlySecond = rowsMissingFrom(right, left);
      if (onlyFirst.length === 0 && onlySecond.length === 0) {
        return [];
      }
      return [
        `${table}: ${String(left.length)} rows and ${String(right.length)} rows\n  only first:  ${clipped(onlyFirst[0], onlySecond[0])}\n  only second: ${clipped(onlySecond[0], onlyFirst[0])}`,
      ];
    });
    return findings.length === 0 ? pageDifference(firstBytes, secondBytes) : findings.join("\n");
  } finally {
    first.close();
    second.close();
  }
}

// Paths only one publication holds, then each shared file whose bytes differ, with its table and row difference.
async function publicationDifference(firstRoot: string, secondRoot: string): Promise<string[]> {
  const first = await filesUnder(firstRoot);
  const second = await filesUnder(secondRoot);
  const onlyFirst = [...first.keys()].filter((path) => !second.has(path)).map((path) => `only first: ${path}`);
  const onlySecond = [...second.keys()].filter((path) => !first.has(path)).map((path) => `only second: ${path}`);
  const differing = [...first].flatMap(([path, bytes]) => {
    const other = second.get(path);
    if (other === undefined || bytes.equals(other)) {
      return [];
    }
    return [path.endsWith(DATABASE_SUFFIX) ? `${path}\n${databaseDifference(join(firstRoot, path), join(secondRoot, path), bytes, other)}` : path];
  });
  return [...onlyFirst, ...onlySecond, ...differing].toSorted();
}

test("corpus publishes from one tree are byte-identical, plain, under provider latency and with stalled calls", {
  tags: ["slow"],
  timeout: PUBLISH_BUDGET_MS,
}, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-determinism-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const baseline = await publishOnce(parent, "baseline", "plain");
  const report: Partial<Record<Variant, string[]>> = {};
  for (const variant of VARIANTS) {
    const difference = await publicationDifference(baseline, await publishOnce(parent, variant, variant));
    if (difference.length > 0) {
      report[variant] = difference;
    }
  }
  expect(report).toEqual({});
});
