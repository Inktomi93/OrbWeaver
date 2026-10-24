// The library export and bundle import routes over two real credentials: the box owner's loopback session and a
// member's password-login cookie. A staged bundle belongs to its uploader, and naming another's handle imports nothing.
// @subject packages/server/src/entry/http/export.ts
// @subject packages/server/src/entry/http/import.ts
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { presets, tags, themes } from "@orb/db";
import type { Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { stagedOwnerRoot } from "@orb/server/domain/import";
import { extractZip } from "@orb/server/infra/storage/zip";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { signedInMember } from "../_auth-roots.ts";

const EXPORT_ROUTE = "/api/export/library";
const BUNDLE_ROUTE = "/api/import/bundle";
const WORKLOAD_DEADLINE_MS = 60_000;
/** A relay tell: the loopback socket speaks for a third party, so the owner fallback refuses it. */
const ANONYMOUS = { "x-forwarded-for": "203.0.113.9" };
const STAGED_TOKEN = /^import-bundle-[0-9a-f-]{36}\.zip$/u;

interface Box extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly member: { readonly id: UserId; readonly cookie: string };
  readonly run: (id: WorkloadId) => Promise<void>;
}

/** A local box whose owner signs in over loopback and whose member signs in with a password. */
async function box(): Promise<Box> {
  const root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" },
  });
  const member = await signedInMember(root, castId<Handle>("portability-member"));
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness did not expose manual workload execution");
  }
  return {
    root,
    member,
    run: (id) => run(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS)),
    [Symbol.asyncDispose]: () => root[Symbol.asyncDispose](),
  };
}

async function zipPaths(bytes: Uint8Array): Promise<string[]> {
  const staged = await extractZip(bytes);
  try {
    return staged.entries.map((entry) => entry.path);
  } finally {
    await staged.dispose();
  }
}

async function upload(root: ServerTestHarness, bytes: Uint8Array, headers: Record<string, string> = {}): Promise<WorkloadId> {
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1", ...headers }, body: bytes });
  expect(response.status).toBe(202);
  return importStartedSchema.parse(await response.json()).workloadId;
}

async function stagedToken(root: ServerTestHarness, id: WorkloadId, caller: UserId): Promise<string> {
  const workload = await root.services.workloads.get({ id, caller: await root.principalFor(caller) });
  if (workload.kind !== "import-bundle" || workload.poison) {
    throw new Error("the bundle upload left no typed import-bundle workload");
  }
  return workload.params.token;
}

async function ownerLibrary(root: ServerTestHarness): Promise<Uint8Array> {
  const owner = await root.principalFor(root.ownerId);
  await root.services.preset.create({ userId: root.ownerId, name: "Shared Preset", kind: "roleplay" });
  await root.services.tag.createTag({ principal: owner, input: { name: "shared-tag" } });
  await root.services.settings.createTheme({ principal: owner, input: { name: "Shared Theme", override: {}, css: null } });
  // Asset ids are box-global keys, so another account's copy of them is refused by design; the case carries the three rows.
  const download = await root.http.request(`${EXPORT_ROUTE}?kinds=preset,tag,theme`);
  expect(download.status).toBe(200);
  return new Uint8Array(await download.arrayBuffer());
}

describe("portability routes — GET /api/export/library + POST /api/import/bundle over the real registry", () => {
  test("library route: anon → 401; bad kinds token → 400; the streamed zip carries the seeded entity dirs", async () => {
    await using session = await box();
    const { root } = session;
    const owner = await root.principalFor(root.ownerId);
    await root.services.preset.create({ userId: root.ownerId, name: "My Preset", kind: "roleplay" });
    await root.services.tag.createTag({ principal: owner, input: { name: "adventure" } });
    const anonymous = await root.http.request(EXPORT_ROUTE, { headers: ANONYMOUS });
    expect(anonymous.status).toBe(401);
    await anonymous.arrayBuffer();
    const badKind = await root.http.request(`${EXPORT_ROUTE}?kinds=not-a-kind`);
    expect(badKind.status).toBe(400);
    await badKind.arrayBuffer();
    const full = await root.http.request(EXPORT_ROUTE);
    expect(full.headers.get("content-type")).toBe("application/zip");
    const paths = await zipPaths(new Uint8Array(await full.arrayBuffer()));
    expect(paths.some((path) => path.startsWith(PORTABLE_DIRECTORIES.preset))).toBe(true);
    expect(paths.some((path) => path.startsWith(PORTABLE_DIRECTORIES.tag))).toBe(true);
    const filtered = await zipPaths(new Uint8Array(await (await root.http.request(`${EXPORT_ROUTE}?kinds=preset`)).arrayBuffer()));
    expect(filtered.some((path) => path.startsWith(PORTABLE_DIRECTORIES.preset))).toBe(true);
    expect(filtered.some((path) => path.startsWith(PORTABLE_DIRECTORIES.tag))).toBe(false);
  });

  test("bundle route: a library zip → import writes the ROWS for the uploading owner", async () => {
    await using session = await box();
    const { root, member } = session;
    const zip = await ownerLibrary(root);
    const runImport = async (): Promise<unknown> => {
      const id = await upload(root, zip, { cookie: member.cookie });
      await session.run(id);
      const done = await root.services.workloads.get({ id, caller: await root.principalFor(member.id) });
      expect(done.status).toBe("succeeded");
      return done.result;
    };
    expect(await runImport()).toMatchObject({ failed: 0 });
    for (const [table, name] of [
      [presets, "Shared Preset"],
      [tags, "shared-tag"],
      [themes, "Shared Theme"],
    ] as const) {
      expect(
        await root.db
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.ownerId, member.id), eq(table.name, name))),
      ).toHaveLength(1);
    }
    expect(await runImport()).toMatchObject({ failed: 0 });
    expect(await root.db.select({ id: presets.id }).from(presets).where(eq(presets.ownerId, member.id))).toHaveLength(1);
  });

  test("bundle route: a SECOND user naming the uploader's staged handle imports nothing and destroys nothing", async () => {
    await using session = await box();
    const { root, member } = session;
    await root.services.preset.create({ userId: member.id, name: "Private Preset", kind: "roleplay" });
    const exported = await root.http.request(EXPORT_ROUTE, { headers: { cookie: member.cookie } });
    const uploaderRun = await upload(root, new Uint8Array(await exported.arrayBuffer()), { cookie: member.cookie });
    const token = await stagedToken(root, uploaderRun, member.id);
    const theft = await root.services.workloads.start({
      input: { kind: "import-bundle", params: { token } },
      caller: await root.principalFor(root.ownerId),
      mode: "singular",
      ownerId: root.ownerId,
    });
    await session.run(theft.id);
    const stolen = await root.services.workloads.get({ id: theft.id, caller: await root.principalFor(root.ownerId) });
    expect(stolen.status).toBe("failed");
    expect(stolen.error ?? "").toMatch(/staging root/u);
    expect(await root.db.select({ id: presets.id }).from(presets).where(eq(presets.ownerId, root.ownerId))).toEqual([]);
    await session.run(uploaderRun);
    const done = await root.services.workloads.get({ id: uploaderRun, caller: await root.principalFor(member.id) });
    expect(done).toMatchObject({ status: "succeeded" });
  });
});

describe("registerImportBundle — owner scoping + the server-minted staging token", () => {
  test("starts a singular import-bundle workload as the CALLER, owned by the caller, on a staged file", async () => {
    await using session = await box();
    const { root, member } = session;
    const id = await upload(root, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9]), { cookie: member.cookie });
    const workload = await root.services.workloads.get({ id, caller: await root.principalFor(member.id) });
    expect(workload).toMatchObject({ kind: "import-bundle", ownerId: member.id });
    const token = await stagedToken(root, id, member.id);
    expect(token).toMatch(STAGED_TOKEN);
    expect(await readdir(stagedOwnerRoot(root.importStagingDir, member.id))).toEqual([token]);
  });

  test("the staged file lands under the UPLOADER's own subdir, never at the shared root", async () => {
    await using session = await box();
    const { root, member } = session;
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const memberToken = await stagedToken(root, await upload(root, bytes, { cookie: member.cookie }), member.id);
    const ownerToken = await stagedToken(root, await upload(root, bytes), root.ownerId);
    expect((await readdir(root.importStagingDir)).toSorted()).toEqual([member.id, root.ownerId].toSorted());
    expect(await readdir(join(root.importStagingDir, member.id))).toEqual([memberToken]);
    expect(await readdir(join(root.importStagingDir, root.ownerId))).toEqual([ownerToken]);
  });

  test("two uploads mint DISTINCT tokens (no fixed path a second caller could race or overwrite)", async () => {
    await using session = await box();
    const { root, member } = session;
    const first = await upload(root, new Uint8Array([1]), { cookie: member.cookie });
    const firstToken = await stagedToken(root, first, member.id);
    await session.run(first);
    const secondToken = await stagedToken(root, await upload(root, new Uint8Array([2]), { cookie: member.cookie }), member.id);
    expect(secondToken).not.toBe(firstToken);
    expect(secondToken).toMatch(STAGED_TOKEN);
  });

  test("an UNEXPECTED start failure re-throws (never a silent 202) and still removes the staged file", async () => {
    await using session = await box();
    const { root, member } = session;
    using start = vi.spyOn(root.services.workloads, "start").mockRejectedValue(new Error("controlled workload start fault"));
    const response = await root.http.request(BUNDLE_ROUTE, {
      method: "POST",
      headers: { [CSRF_HEADER]: "1", cookie: member.cookie },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(response.status).toBe(500);
    await response.arrayBuffer();
    expect(start).toHaveBeenCalledOnce();
    expect((await readdir(root.importStagingDir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile())).toEqual([]);
  });
});
