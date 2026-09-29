// #0081's guarded Git source: preview-bound commits, exact provenance, owner-first upgrade ordering, and
// leak-free credential refusal. Existing zip-upload and bundle-URL coverage stays in install/install-from-url.

import { plugins } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginGitPreviewStaleError, PluginGitSourceError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { createPluginGitSource } from "@orb/server/infra/network";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const REPOSITORY = "https://git.example/plugins/weather.git";
const COMMIT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMMIT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const COMMIT_C = "cccccccccccccccccccccccccccccccccccccccc";

test("Git install records the exact commit and update-check compares the remote HEAD without cloning", async () => {
  const db = await freshDb();
  let cloneCalls = 0;
  let headCalls = 0;
  const h = makePluginHarness(db, {
    gitSource: {
      clone: () => {
        cloneCalls += 1;
        return Promise.resolve({ bundle: makeBundle({ id: "git-plugin" }), commit: COMMIT_A });
      },
      head: () => {
        headCalls += 1;
        return Promise.resolve(COMMIT_B);
      },
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  const installed = await h.service.installFromGit({ caller, url: REPOSITORY, expectedCommit: COMMIT_A, grant: [] });
  expect(installed).toMatchObject({ origin: "git", sourceUrl: REPOSITORY, sourceCommit: COMMIT_A, updateSource: "git" });
  expect(await h.service.checkForUpdates({ caller })).toEqual([{ pluginId: installed.id, status: "source-changed", sourceCommit: COMMIT_B }]);
  expect(cloneCalls).toBe(1);
  expect(headCalls).toBe(1);

  const [row] = await db.select().from(plugins).where(eq(plugins.id, installed.id));
  expect(row).toMatchObject({ origin: "git", sourceUrl: REPOSITORY, sourceCommit: COMMIT_A });
});

test("stored Git upgrade owner-scopes before egress and advances provenance atomically with the bundle", async () => {
  const db = await freshDb();
  let commit = COMMIT_A;
  let version = "1.0.0";
  let clones = 0;
  const h = makePluginHarness(db, {
    gitSource: {
      clone: () => {
        clones += 1;
        return Promise.resolve({ bundle: makeBundle({ id: "git-plugin", version }), commit });
      },
      head: () => Promise.resolve(commit),
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
  const installed = await h.service.installFromGit({ caller: ownerPrincipalFor(owner), url: REPOSITORY, expectedCommit: COMMIT_A, grant: [] });

  await expect(
    h.service.upgradeFromStoredGit({ caller: ownerPrincipalFor(stranger), pluginId: installed.id, expectedCommit: COMMIT_B }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
  expect(clones).toBe(1);

  commit = COMMIT_B;
  version = "1.1.0";
  const upgraded = await h.service.upgradeFromStoredGit({ caller: ownerPrincipalFor(owner), pluginId: installed.id, expectedCommit: COMMIT_B });
  expect(upgraded).toMatchObject({ version: "1.1.0", sourceCommit: COMMIT_B, origin: "git" });
  expect(clones).toBe(2);
});

test("stored Git upgrade refuses when remote HEAD moves after update-check without changing the persisted bundle or grant", async () => {
  const db = await freshDb();
  let cloneCommit = COMMIT_A;
  let cloneVersion = "1.0.0";
  let cloneNetHosts = ["api.example"];
  const h = makePluginHarness(db, {
    gitSource: {
      clone: () =>
        Promise.resolve({
          bundle: makeBundle({
            id: "git-upgrade-race",
            version: cloneVersion,
            capabilities: ["net.fetch"],
            netHosts: cloneNetHosts,
          }),
          commit: cloneCommit,
        }),
      head: () => Promise.resolve(COMMIT_B),
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await h.service.installFromGit({ caller, url: REPOSITORY, expectedCommit: COMMIT_A, grant: ["net.fetch"] });

  const [verdict] = await h.service.checkForUpdates({ caller });
  expect(verdict).toEqual({ pluginId: installed.id, status: "source-changed", sourceCommit: COMMIT_B });
  if (verdict?.status !== "source-changed") {
    throw new Error("expected the exact remote commit from the update check");
  }
  const [before] = await db.select().from(plugins).where(eq(plugins.id, installed.id));

  cloneCommit = COMMIT_C;
  cloneVersion = "1.1.0";
  cloneNetHosts = ["changed.example"];
  await expect(h.service.upgradeFromStoredGit({ caller, pluginId: installed.id, expectedCommit: verdict.sourceCommit })).rejects.toBeInstanceOf(
    PluginGitPreviewStaleError,
  );

  const [persisted] = await db.select().from(plugins).where(eq(plugins.id, installed.id));
  expect(persisted).toEqual(before);
  expect(persisted).toMatchObject({
    version: "1.0.0",
    sourceCommit: COMMIT_A,
    grantedCapabilities: ["net.fetch"],
    manifest: { version: "1.0.0", netHosts: ["api.example"] },
  });
});

test("Git install refuses when HEAD moved after preview, even when the capability names stayed the same", async () => {
  const db = await freshDb();
  const previewBundle = makeBundle({ id: "git-race", capabilities: ["net.fetch"], netHosts: ["preview.example"] });
  const changedBundle = makeBundle({ id: "git-race", capabilities: ["net.fetch"], netHosts: ["changed.example"] });
  let calls = 0;
  const h = makePluginHarness(db, {
    gitSource: {
      clone: () => {
        calls += 1;
        return Promise.resolve(calls === 1 ? { bundle: previewBundle, commit: COMMIT_A } : { bundle: changedBundle, commit: COMMIT_B });
      },
      head: () => Promise.resolve(COMMIT_B),
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);

  await expect(h.service.previewFromGit({ caller, url: REPOSITORY })).resolves.toMatchObject({
    manifest: { netHosts: ["preview.example"] },
    sourceCommit: COMMIT_A,
  });
  await expect(h.service.installFromGit({ caller, url: REPOSITORY, expectedCommit: COMMIT_A, grant: ["net.fetch"] })).rejects.toBeInstanceOf(
    PluginGitPreviewStaleError,
  );
  expect(await db.select().from(plugins)).toEqual([]);
});

test("Git URL credentials are redacted and refuse before transport or persistence", async () => {
  const db = await freshDb();
  let transports = 0;
  const gitSource = createPluginGitSource({
    makeScratch: () => Promise.resolve("/scratch/unused"),
    removeScratch: () => Promise.resolve(),
    cloneInto: () => {
      transports += 1;
      return Promise.resolve();
    },
    resolveHead: () => Promise.resolve(COMMIT_A),
    packDirectory: () => Promise.resolve(makeBundle({ id: "never" })),
    readRemoteHead: () => {
      transports += 1;
      return Promise.resolve(COMMIT_A);
    },
  });
  const h = makePluginHarness(db, { gitSource });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const credentialUrl = "https://owner:do-not-log@git.example/plugin.git";

  const refusal = await h.service
    .installFromGit({ caller: ownerPrincipalFor(owner), url: credentialUrl, expectedCommit: COMMIT_A, grant: [] })
    .catch((error: unknown) => error);
  expect(refusal).toBeInstanceOf(PluginGitSourceError);
  expect(String(refusal)).not.toContain("do-not-log");
  expect(transports).toBe(0);
  expect(await db.select().from(plugins)).toEqual([]);
});

test("stored Git URL credentials refuse remote-HEAD transport without mutating the installed row", async () => {
  const db = await freshDb();
  let transports = 0;
  const guarded = createPluginGitSource({
    makeScratch: () => Promise.resolve("/scratch/unused"),
    removeScratch: () => Promise.resolve(),
    cloneInto: () => Promise.resolve(),
    resolveHead: () => Promise.resolve(COMMIT_A),
    packDirectory: () => Promise.resolve(makeBundle({ id: "never" })),
    readRemoteHead: () => {
      transports += 1;
      return Promise.resolve(COMMIT_B);
    },
  });
  const h = makePluginHarness(db, {
    gitSource: {
      clone: () => Promise.resolve({ bundle: makeBundle({ id: "legacy-git-source" }), commit: COMMIT_A }),
      head: guarded.head,
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await h.service.installFromGit({ caller, url: REPOSITORY, expectedCommit: COMMIT_A, grant: [] });
  const credentialUrl = "https://owner:do-not-log@git.example/plugin.git";
  await db.update(plugins).set({ sourceUrl: credentialUrl }).where(eq(plugins.id, installed.id));
  const before = await db.select().from(plugins).where(eq(plugins.id, installed.id));

  await expect(h.service.checkForUpdates({ caller })).resolves.toEqual([{ pluginId: installed.id, status: "unreachable" }]);

  expect(transports).toBe(0);
  expect(await db.select().from(plugins).where(eq(plugins.id, installed.id))).toEqual(before);
});
