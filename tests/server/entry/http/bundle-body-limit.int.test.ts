// @subject packages/server/src/entry/http/import.ts
import { readdir, readFile, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { importStartedSchema } from "@orb/contracts/import";
import { IMPORT_BUNDLE_MAX_BYTES, IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { BUNDLE_ROUTE, bodyRequest, CSRF_HEADERS, observedBody, REQUEST_CHUNK_BYTES } from "./_body-limit-inputs.ts";

const WORKLOAD_DEADLINE_MS = 60_000;
/** The extractor's rejection kind for bytes that are not a zip, as opposed to its `too-large` size refusal. */
const MALFORMED_ARCHIVE = /zip rejected \(malformed\)/u;

// Staging a body one byte past the 4 GiB bundle cap writes 4 GiB to disk before the refusal: that is the proven runtime.
test("actual raw bundle overflow cancels its source and removes the partial staged file without a workload", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const capacity = await statfs(root.importStagingDir);
  expect(capacity.bavail * capacity.bsize).toBeGreaterThan(IMPORT_BUNDLE_MAX_BYTES * 2);
  const principal = await root.principalFor(root.ownerId);
  const before = await root.services.workloads.list({ caller: principal, kind: "import-bundle" });
  using input = observedBody(IMPORT_BUNDLE_MAX_BYTES + 1);
  const response = await bodyRequest(root, BUNDLE_ROUTE, input.body);
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: "bundle exceeds the maximum upload size" });
  expect(input.snapshot()).toMatchObject({ bytes: IMPORT_BUNDLE_MAX_BYTES + 1, cancelled: true, tripwire: false });
  const paths = await readdir(root.importStagingDir, { recursive: true, withFileTypes: true });
  expect(paths.filter((entry) => entry.isFile()).map((entry) => entry.name)).toEqual([]);
  expect(await root.services.workloads.list({ caller: principal, kind: "import-bundle" })).toEqual(before);
});

test("a backup over the in-memory import cap is staged whole and its import reads the archive itself, not a size refusal", async () => {
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
  const runAdmitted = root.runAdmittedWorkload;
  if (runAdmitted === undefined) {
    throw new Error("the harness owns its workload execution only with startJobs: false");
  }
  const principal = await root.principalFor(root.ownerId);
  // Bytes with no end-of-central-directory record: the import's verdict can only come from reading the archive.
  const body = new Uint8Array(IMPORT_MAX_TOTAL_BYTES + 1);
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: CSRF_HEADERS, body });
  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  const queued = await root.services.workloads.get({ id: workloadId, caller: principal });
  if (queued.kind !== "import-bundle" || queued.poison) {
    throw new Error("bundle admission did not retain its typed workload");
  }
  const staged = await stat(join(root.stagedImportsOf(root.ownerId), queued.params.token));
  expect(staged.size).toBe(body.byteLength);
  await runAdmitted(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const settled = await root.services.workloads.get({ id: workloadId, caller: principal });
  expect({ status: settled.status, error: settled.error }).toEqual({ status: "failed", error: expect.stringMatching(MALFORMED_ARCHIVE) });
});

test("a second upload by an owner whose first is still staging is refused before its body is read", async () => {
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
  // The first upload delivers one chunk, then stays open until the test lets it end.
  const firstPulled = Promise.withResolvers<void>();
  const finishFirst = Promise.withResolvers<void>();
  const first = new ReadableStream<Uint8Array>(
    {
      pull: async (controller): Promise<void> => {
        controller.enqueue(new Uint8Array(REQUEST_CHUNK_BYTES));
        firstPulled.resolve();
        await finishFirst.promise;
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const firstResponse = bodyRequest(root, BUNDLE_ROUTE, first);
  await firstPulled.promise;
  // A complete one-chunk body that counts what the route pulled from it.
  let secondRead = 0;
  const second = new ReadableStream<Uint8Array>(
    {
      pull: (controller): void => {
        secondRead += REQUEST_CHUNK_BYTES;
        controller.enqueue(new Uint8Array(REQUEST_CHUNK_BYTES));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const secondResponse = await bodyRequest(root, BUNDLE_ROUTE, second);
  const secondOutcome = { status: secondResponse.status, body: await secondResponse.json(), read: secondRead };
  finishFirst.resolve();
  const firstStatus = (await firstResponse).status;

  expect({ secondOutcome, firstStatus }).toEqual({
    secondOutcome: { status: 409, body: { error: "a bundle import is already running for this account" }, read: 0 },
    firstStatus: 202,
  });
});

test("a faulting raw upload removes its small pre-dispatch staging prefix", async () => {
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const principal = await root.principalFor(root.ownerId);
  using input = observedBody(8);
  const response = await bodyRequest(root, BUNDLE_ROUTE, input.body);
  expect(response.status).toBe(500);
  await response.arrayBuffer();
  expect(input.snapshot()).toMatchObject({ bytes: 8, tripwire: true });
  expect(await root.services.workloads.list({ caller: principal, kind: "import-bundle" })).toEqual([]);
  const files = (await readdir(root.importStagingDir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
  expect(await Promise.all(files.map(async (entry) => ({ name: entry.name, bytes: Array.from(await readFile(join(entry.parentPath, entry.name))) })))).toEqual(
    [],
  );
});

test("actual exported ZIP bytes stage unchanged for their owning workload and conflict cleans only the refused upload", async () => {
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const principal = await root.principalFor(root.ownerId);
  const download = await root.http.request("/api/export/library?kinds=tag");
  expect(download.status).toBe(200);
  const bytes = new Uint8Array(await download.arrayBuffer());
  expect(bytes.byteLength).toBeGreaterThan(0);
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: bytes });
  expect(response.status).toBe(202);
  const started = importStartedSchema.parse(await response.json());
  const workload = await root.services.workloads.get({ id: started.workloadId, caller: principal });
  expect(workload.ownerId).toBe(root.ownerId);
  expect(workload.kind).toBe("import-bundle");
  if (workload.kind !== "import-bundle" || workload.poison) {
    throw new Error("actual bundle admission did not retain its typed workload");
  }
  const staged = join(root.stagedImportsOf(root.ownerId), workload.params.token);
  expect(Array.from(await readFile(staged))).toEqual(Array.from(bytes));
  const before = (await readdir(root.importStagingDir, { recursive: true })).sort();
  const conflict = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: bytes });
  expect(conflict.status).toBe(409);
  await conflict.arrayBuffer();
  expect((await readdir(root.importStagingDir, { recursive: true })).sort()).toEqual(before);
  expect(Array.from(await readFile(staged))).toEqual(Array.from(bytes));
});

test("an absent raw body fails without creating a staging namespace or workload", async () => {
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: CSRF_HEADERS });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "empty request body — expected a zip bundle" });
  expect(await readdir(root.importStagingDir)).toEqual([]);
  expect(await root.services.workloads.list({ caller: await root.principalFor(root.ownerId), kind: "import-bundle" })).toEqual([]);
});
