// @subject packages/server/src/entry/http/import.ts
import { readdir, readFile, statfs } from "node:fs/promises";
import { join } from "node:path";
import { importStartedSchema } from "@orb/contracts/import";
import { IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { stagedOwnerRoot } from "@orb/server/domain/import";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { BUNDLE_ROUTE, bodyRequest, CSRF_HEADERS, observedBody } from "./_body-limit-inputs.ts";

test("actual raw bundle overflow cancels its source and removes the partial staged file without a workload", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const capacity = await statfs(root.importStagingDir);
  expect(capacity.bavail * capacity.bsize).toBeGreaterThan(IMPORT_MAX_TOTAL_BYTES * 2);
  const principal = await root.principalFor(root.ownerId);
  const before = await root.services.workloads.list({ caller: principal, kind: "import-bundle" });
  using input = observedBody(IMPORT_MAX_TOTAL_BYTES + 1);
  const response = await bodyRequest(root, BUNDLE_ROUTE, input.body);
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: "bundle exceeds the maximum upload size" });
  expect(input.snapshot()).toMatchObject({ bytes: IMPORT_MAX_TOTAL_BYTES + 1, cancelled: true, tripwire: false });
  const paths = await readdir(root.importStagingDir, { recursive: true, withFileTypes: true });
  expect(paths.filter((entry) => entry.isFile()).map((entry) => entry.name)).toEqual([]);
  expect(await root.services.workloads.list({ caller: principal, kind: "import-bundle" })).toEqual(before);
});

test("a faulting raw upload removes its small pre-dispatch staging prefix", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
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
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
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
  const staged = join(stagedOwnerRoot(root.importStagingDir, root.ownerId), workload.params.token);
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
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: CSRF_HEADERS });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "empty request body — expected a zip bundle" });
  expect(await readdir(root.importStagingDir)).toEqual([]);
  expect(await root.services.workloads.list({ caller: await root.principalFor(root.ownerId), kind: "import-bundle" })).toEqual([]);
});
