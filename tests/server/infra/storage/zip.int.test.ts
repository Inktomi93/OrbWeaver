// The upload extractor reads an archive by position from a staged file and whole from memory; both sources
// stage the same entries and refuse the same hostile shapes, leaving nothing staged.
// @subject packages/server/src/infra/storage/zip.ts

import { mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractZip, packZip } from "@orb/server/infra/storage/zip";
import { expect, test } from "@orb/testkit/node";
import { onTestFinished } from "vitest";

// Offsets into the records this build's writer emits: a 22-byte end record with no comment.
const EOCD_BYTES = 22;
const EOCD_CD_OFFSET_AT = 16;
const CENTRAL_COMPRESSED_AT = 20;
const CENTRAL_NAME_AT = 46;
const LOCAL_NAME_AT = 30;
/** Same length as the first entry's path, so a rename leaves every offset intact. */
const ESCAPING_PATH = "../es/entry.txt";
const REJECTION_KIND = /zip rejected \((?<kind>[a-z-]+)\)/u;
/** Past what any encoder writes for the second entry's 14 bytes, yet short of the archive's end after its data. */
const INFLATED_CLAIM = 100;

const ENTRIES = [
  { path: "notes/entry.txt", bytes: new TextEncoder().encode("The keeper's ledger.".repeat(64)) },
  { path: "notes/second.txt", bytes: new TextEncoder().encode("A second page.") },
] as const;

const SOURCES = ["memory", "staged file"] as const;
type Source = (typeof SOURCES)[number];

interface Extraction {
  readonly entries: readonly { readonly path: string; readonly bytes: readonly number[] }[] | null;
  /** The rejection kind, or null when the archive staged. */
  readonly refused: string | null;
  /** The rejection's whole message, or null when the archive staged. */
  readonly reason: string | null;
  /** Files left under the staging root once the extraction settled and was disposed. */
  readonly leftovers: number;
}

async function packed(): Promise<Uint8Array> {
  async function* entries(): AsyncIterable<{ readonly path: string; readonly bytes: Uint8Array }> {
    yield* ENTRIES;
  }
  return new Uint8Array(await new Response(packZip(entries())).arrayBuffer());
}

async function stagedFiles(root: string): Promise<number> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).length;
}

/** Extract `archive` from the named source; a staged file is written to a scratch dir and opened read-only. */
async function extract(source: Source, archive: Uint8Array, maxTotalBytes?: number): Promise<Extraction> {
  const dir = await mkdtemp(join(tmpdir(), "orb-zip-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const stagingRoot = join(dir, "stage");
  const options = { stagingRoot, ...(maxTotalBytes === undefined ? {} : { maxTotalBytes }) };
  const upload = join(dir, "upload.zip");
  await writeFile(upload, archive);
  await using handle = await open(upload, "r");
  try {
    const staged = await extractZip(source === "memory" ? archive : handle, options);
    try {
      const entries = await Promise.all(staged.entries.map(async (entry) => ({ path: entry.path, bytes: Array.from(await entry.read()) })));
      return { entries, refused: null, reason: null, leftovers: 0 };
    } finally {
      await staged.dispose();
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { entries: null, refused: REJECTION_KIND.exec(reason)?.groups?.["kind"] ?? reason, reason, leftovers: await stagedFiles(stagingRoot) };
  }
}

function centralAt(archive: Uint8Array): number {
  return new DataView(archive.buffer).getUint32(archive.length - EOCD_BYTES + EOCD_CD_OFFSET_AT, true);
}

/** The second entry's central record follows the first's fixed header and name. */
function secondCentralAt(archive: Uint8Array): number {
  return centralAt(archive) + CENTRAL_NAME_AT + new TextEncoder().encode(ENTRIES[0].path).length;
}

/** The writer's archive with its first entry's name rewritten in both headers, as a hostile writer would. */
function renamed(archive: Uint8Array, name: string): Uint8Array {
  const out = archive.slice();
  const encoded = new TextEncoder().encode(name);
  out.set(encoded, LOCAL_NAME_AT);
  out.set(encoded, centralAt(out) + CENTRAL_NAME_AT);
  return out;
}

function withU32(archive: Uint8Array, at: number, value: number): Uint8Array {
  const out = archive.slice();
  new DataView(out.buffer).setUint32(at, value, true);
  return out;
}

test.each(SOURCES)("an archive read from %s stages exactly the entries the writer packed", async (source) => {
  expect(await extract(source, await packed())).toEqual({
    entries: ENTRIES.map((entry) => ({ path: entry.path, bytes: Array.from(entry.bytes) })),
    refused: null,
    reason: null,
    leftovers: 0,
  });
});

test.each(SOURCES)("a hostile archive read from %s is refused with its kind and leaves nothing staged", async (source) => {
  const archive = await packed();
  const cases = {
    truncated: extract(source, archive.subarray(0, archive.length - 1)),
    "central directory past the end": extract(source, withU32(archive, archive.length - EOCD_BYTES + EOCD_CD_OFFSET_AT, archive.length)),
    "a name that escapes the staging root": extract(source, renamed(archive, ESCAPING_PATH)),
    // The second entry's data is followed by the central directory, so the inflated claim still lies inside the
    // archive: only the size bound, not the end of the file, can refuse it before its bytes are read.
    "more compressed bytes than any encoder writes": extract(source, withU32(archive, secondCentralAt(archive) + CENTRAL_COMPRESSED_AT, INFLATED_CLAIM)),
    "over the total cap": extract(source, archive, archive.length - 1),
  };
  const outcomes: Record<string, Pick<Extraction, "refused" | "leftovers">> = {};
  for (const [name, settled] of Object.entries(cases)) {
    const { refused, leftovers } = await settled;
    outcomes[name] = { refused, leftovers };
  }

  expect(outcomes).toEqual({
    truncated: { refused: "malformed", leftovers: 0 },
    "central directory past the end": { refused: "malformed", leftovers: 0 },
    "a name that escapes the staging root": { refused: "zip-slip", leftovers: 0 },
    "more compressed bytes than any encoder writes": { refused: "malformed", leftovers: 0 },
    "over the total cap": { refused: "too-large", leftovers: 0 },
  });
  expect((await cases["more compressed bytes than any encoder writes"]).reason).toMatch(`declares ${String(INFLATED_CLAIM)} compressed bytes`);
});
