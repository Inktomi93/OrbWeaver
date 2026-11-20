// A profile zip whose entries share one compressed stream inflates far past its own size. The profile zip door caps
// the bytes it inflates at the tree door's total, so the zip is refused as too large with nothing staged and no job.
// The over-cap run inflates and stages about a gibibyte before it refuses, so this suite saturates host disk.
// @subject packages/server/src/entry/http/import-tree-zip.ts

import { profileZipRefusalSchema, ST_SETTINGS_FILE, TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { IMPORT_TREE_MAX_FILE_BYTES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { strToU8, zipSync } from "fflate";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";
import { harness, settings, stagedEntries } from "./_st-tree-door.ts";

// fflate derives the DOS date from local time; a fixed mid-year UTC stamp keeps the archive deterministic.
const ZIP_MTIME = new Date("2025-07-01T12:00:00Z");
const PROFILE = "default-user/";
const ACCEPTED = 202;
const TOO_LARGE = 413;
// Each entry sits at the per-file cap, and one more than the total holds whole puts the inflated sum past the total.
const SHARED_ENTRIES = Math.floor(IMPORT_TREE_MAX_TOTAL_BYTES / IMPORT_TREE_MAX_FILE_BYTES) + 1;

// Where a zip's central record keeps its signature, name length, name, and the method-to-size run and local header
// offset an overlapping entry copies from its source (APPNOTE 4.3.12).
const CENTRAL_SIGNATURE = 0x02_01_4b_50;
const CENTRAL_FIXED = 46;
const CENTRAL_NAME_LENGTH_AT = 28;
const CENTRAL_SHARED_FIELDS = [
  { at: 10, length: 18 },
  { at: 42, length: 4 },
] as const;

/** The byte offset of each central record in `zip`, by its entry name. */
function centralRecords(zip: Uint8Array): Map<string, number> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const records = new Map<string, number>();
  for (let at = 0; at + CENTRAL_FIXED <= zip.length; at += 1) {
    if (view.getUint32(at, true) === CENTRAL_SIGNATURE) {
      const nameAt = at + CENTRAL_FIXED;
      records.set(decoder.decode(zip.subarray(nameAt, nameAt + view.getUint16(at + CENTRAL_NAME_LENGTH_AT, true))), at);
    }
  }
  return records;
}

/** Point every `targets` entry's central record at `source`'s compressed stream, its sizes and its checksum. */
function overlap(zip: Uint8Array, source: string, targets: readonly string[]): Uint8Array {
  const out = zip.slice();
  const records = centralRecords(out);
  const from = records.get(source);
  if (from === undefined) {
    throw new Error(`the zip has no central record for ${source}`);
  }
  for (const target of targets) {
    const to = records.get(target);
    if (to === undefined) {
      throw new Error(`the zip has no central record for ${target}`);
    }
    for (const { at, length } of CENTRAL_SHARED_FIELDS) {
      out.copyWithin(to + at, from + at, from + at + length);
    }
  }
  return out;
}

async function postDryRun(root: ServerTestHarness, body: Uint8Array): Promise<Response> {
  const query = new URLSearchParams([[TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE]]);
  return await root.http.request(`${PORTABILITY_ROUTES.importTreeZip}?${query.toString()}`, { method: "POST", headers: CSRF_HEADERS, body });
}

test("entries that share one compressed stream are capped by what they inflate to, with nothing staged and no job", { tags: ["slow"] }, async () => {
  await using root = await harness();
  const [source = "", ...targets] = Array.from({ length: SHARED_ENTRIES }, (_, index) => `${PROFILE}backgrounds/${String(index)}.png`);
  const honest = zipSync(
    {
      [`${PROFILE}${ST_SETTINGS_FILE}`]: strToU8(settings({})),
      [source]: new Uint8Array(IMPORT_TREE_MAX_FILE_BYTES),
      ...Object.fromEntries(targets.map((name) => [name, new Uint8Array(0)])),
    },
    { mtime: ZIP_MTIME },
  );
  const amplified = overlap(honest, source, targets);
  expect(amplified.length).toBe(honest.length);

  const response = await postDryRun(root, amplified);
  const { reason, error } = profileZipRefusalSchema.parse(await response.json());
  expect({ status: response.status, reason }).toEqual({ status: TOO_LARGE, reason: "too-large" });
  expect(error).toContain(String(IMPORT_TREE_MAX_TOTAL_BYTES));
  expect(await stagedEntries(root)).toEqual([]);
  expect(await root.services.workloads.list({ caller: await root.principalFor(root.ownerId) })).toEqual([]);

  // The control: the same zip before its entries overlap is admitted.
  expect((await postDryRun(root, honest)).status).toBe(ACCEPTED);
});
