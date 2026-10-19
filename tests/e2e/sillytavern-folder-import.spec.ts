// A SillyTavern library folder imports through the real folder chooser. The synthetic library is authored in
// this app and exported through its own SillyTavern doors; a private run supplies E2E_ST_FOLDER instead.

import { openAsBlob } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { TreeImportPlan } from "@orb/client/data";
import { planTreeImport } from "@orb/client/data";
import { testId } from "@orb/client/lib";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { createCharacterSchema } from "@orb/contracts/character";
import { openingPolicySchema } from "@orb/contracts/chat";
import { ST_SECRETS_FILE, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { WORKLOAD_LIST_MAX_LIMIT } from "@orb/contracts/workloads";
import { slugifyHandle } from "@orb/kit/slug";
import { budget } from "@orb/tooling/floor/host/load-budget";
import type { Page, Response } from "@playwright/test";
import { ownerActor } from "./support/actors.ts";
import { waitForAppReady } from "./support/chat-room.ts";
import { openConfigGroup as openGroup } from "./support/config-flow.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_ST_FOLDER } from "./support/modes.ts";
import { restoreAllowanceMs } from "./support/timeouts.ts";

const TREE_ROUTE = "/api/import/tree";
const IMPORT_GROUP_NAME = /^Import /u;
// Quiet-box bases; `budget` stretches them under measured contention and the allowance grows with the folder.
const ST_CASE_BASE_MS = 120_000;
const IMPORT_SETTLE_BASE_MS = 60_000;
const SYNTHETIC_PROFILES = [
  { profile: "alice", name: "Folder Import Lantern", description: "A synthetic lantern keeper from the first profile.", greeting: "The lantern is lit." },
  { profile: "bob", name: "Folder Import Cartographer", description: "A synthetic cartographer from the second profile.", greeting: "The map is unrolled." },
] as const;
// A plane the importer only reports; with the credentials file, the browser must never send it.
const UNHANDLED_PLANE = "vectors";

async function folderBytes(root: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      total += (await stat(join(entry.parentPath, entry.name))).size;
    }
  }
  return total;
}

/** Author each profile's character and opening chat here, then lay out the SillyTavern files this app exports. */
async function syntheticLibrary(page: Page, host: ReturnType<typeof ownerActor>, root: string): Promise<readonly string[]> {
  for (const { profile, name, description, greeting } of SYNTHETIC_PROFILES) {
    const prior = await host.trpc.character.list.query({ search: name });
    for (const character of prior.items.filter((item) => item.name === name)) {
      await host.trpc.character.remove.mutate({ characterId: character.id });
    }
    const input = createCharacterSchema.parse({ handle: slugifyHandle(name), name, description, greetings: [{ text: greeting }] });
    const created = await host.trpc.character.create.mutate({ input });
    const { chat } = await host.trpc.chat.startChat.mutate({ characterIds: [created.id], opening: openingPolicySchema.enum["first-message"] });
    const card = await page.request.get(`/api/export/character/${created.id}`);
    expect(card.ok()).toBe(true);
    const transcript = await page.request.get(`/api/export/chat/${chat.id}?format=jsonl`);
    expect(transcript.ok()).toBe(true);
    const profileDir = join(root, profile);
    await mkdir(join(profileDir, "characters"), { recursive: true });
    await mkdir(join(profileDir, "chats", name), { recursive: true });
    await mkdir(join(profileDir, UNHANDLED_PLANE), { recursive: true });
    await writeFile(join(profileDir, ST_SETTINGS_FILE), "{}");
    await writeFile(join(profileDir, ST_SECRETS_FILE), "{}");
    await writeFile(join(profileDir, "characters", `${name}.png`), await card.body());
    await writeFile(join(profileDir, "chats", name, "opening.jsonl"), await transcript.body());
    await writeFile(join(profileDir, UNHANDLED_PLANE, "index.bin"), "unhandled");
    // The import must recreate what it restores, so the authored originals leave the library first.
    await host.trpc.chat.delete.mutate({ chatId: chat.id });
    await host.trpc.character.remove.mutate({ characterId: created.id });
  }
  return SYNTHETIC_PROFILES.map(({ name }) => name);
}

/** The folder as the browser's chooser presents it, each file lazily backed by disk and named by its relative path. */
async function pickedFolder(root: string): Promise<File[]> {
  const files: File[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      const file = new File([await openAsBlob(path)], entry.name);
      Object.defineProperty(file, "webkitRelativePath", { value: join(basename(root), relative(root, path)) });
      files.push(file);
    }
  }
  return files;
}

/** The production plan for the folder under the served caps: what the browser must send, and what it must skip. */
async function servedPlan(page: Page, root: string): Promise<TreeImportPlan> {
  const config = await page.request.get("/api/auth/config");
  expect(config.ok()).toBe(true);
  const { uploads } = authConfigSchema.parse(await config.json());
  return await planTreeImport(await pickedFolder(root), {
    totalBytes: uploads.importTreeTotal,
    fileBytes: uploads.importTreeFile,
    files: uploads.importTreeFiles,
  });
}

async function expectRenderedInLibrary(page: Page, name: string): Promise<void> {
  // The import ends inside Settings, and a reload restores Settings too. A phone shows its Settings screen without the
  // section bar there, so the section deep link is the one door to Characters that exists on every viewport.
  await page.goto("/characters");
  await waitForAppReady(page);
  const back = page.getByRole("button", { name: "Back to Characters", exact: true });
  const search = page.getByRole("textbox", { name: "Search characters", exact: true });
  await expect(search.or(back).first()).toBeVisible();
  if (await back.isVisible()) {
    await back.click();
  }
  await search.fill(name);
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

test("a SillyTavern library folder imports every handled plane for the owner", { tag: "@smoke" }, async ({ page, baseURL }, testInfo) => {
  const host = ownerActor(baseURL ?? "");
  const owner = await host.trpc.sessions.me.query(undefined);
  const root = SELECTED_ST_FOLDER ?? testInfo.outputPath("st-library");
  if (SELECTED_ST_FOLDER === undefined) {
    await rm(root, { recursive: true, force: true });
  }
  const restoredNames = SELECTED_ST_FOLDER === undefined ? await syntheticLibrary(page, host, root) : [];
  const allowance = restoreAllowanceMs(await folderBytes(root));
  test.setTimeout(budget(ST_CASE_BASE_MS + allowance));
  const settleMs = budget(IMPORT_SETTLE_BASE_MS + allowance);
  const plan = await servedPlan(page, root);
  expect(plan.layout).toBeNull();
  expect(plan.batches.length).toBeGreaterThan(0);
  // The synthetic library knows its skips exactly: each profile's credentials file and its unhandled plane.
  const byPath = (a: string, b: string): number => a.localeCompare(b);
  const expectedSkips =
    SELECTED_ST_FOLDER === undefined
      ? SYNTHETIC_PROFILES.flatMap(({ profile }) => [ST_SECRETS_FILE, `${UNHANDLED_PLANE}/index.bin`].map((leaf) => `${profile}/${leaf}`)).toSorted(byPath)
      : null;
  expect(SELECTED_ST_FOLDER === undefined ? plan.skipped.map(({ path }) => path).toSorted(byPath) : null).toEqual(expectedSkips);

  const before = await host.trpc.workloads.list.query({ kind: "import-st", limit: WORKLOAD_LIST_MAX_LIMIT });
  expect(before.length).toBeLessThan(WORKLOAD_LIST_MAX_LIMIT);
  const beforeIds = new Set(before.map((row) => row.id));
  const statuses: number[] = [];
  const recordResponse = (response: Response): void => {
    if (response.request().method() === "POST" && new URL(response.url()).pathname === TREE_ROUTE) {
      statuses.push(response.status());
    }
  };
  page.on("response", recordResponse);
  try {
    await openGroup(page, "backup");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Import a folder…", exact: true }).click()]);
    await chooser.setFiles(root);
    const preflight = page.getByRole("group", { name: IMPORT_GROUP_NAME });
    await expect(preflight).toBeVisible({ timeout: settleMs });
    await preflight.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByRole("button", { name: "Import another", exact: true })).toBeVisible({ timeout: settleMs });
  } finally {
    page.off("response", recordResponse);
  }
  await expect(page.getByTestId(testId("importReport"))).toBeVisible();
  // The browser sends exactly the production plan's uploads, each accepted.
  expect(statuses).toEqual(plan.batches.map(() => 202));

  const after = await host.trpc.workloads.list.query({ kind: "import-st", limit: WORKLOAD_LIST_MAX_LIMIT });
  expect(after.length).toBeLessThan(WORKLOAD_LIST_MAX_LIMIT);
  const created = after.filter((row) => !beforeIds.has(row.id));
  expect(created).toHaveLength(plan.batches.length);
  for (const row of created) {
    const workload = await host.trpc.workloads.get.query({ id: row.id });
    expect(workload.ownerId).toBe(owner.userId);
    expect(workload.status).toBe("succeeded");
    if (workload.poison || workload.kind !== "import-st" || workload.result === null) {
      throw new Error("SillyTavern import has no canonical maintenance result");
    }
    expect(workload.result.dryRun).toBe(false);
    expect(workload.result.failed ?? 0).toBe(0);
  }

  for (const name of restoredNames) {
    const restored = (await host.trpc.character.list.query({ search: name })).items.filter((item) => item.name === name);
    expect(restored).toHaveLength(1);
    const [character] = restored;
    if (character === undefined) {
      throw new Error("the folder import did not restore its synthetic character");
    }
    expect(await host.trpc.chat.countChats.query({ characterId: character.id })).toBe(1);
    await expectRenderedInLibrary(page, name);
  }
});
