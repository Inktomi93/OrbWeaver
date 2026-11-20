// A hostile SillyTavern folder through the real door: a name read from its files never reaches past the staged
// tree, on a dry run or a real one, and a link planted in the tree reads nothing it points at.
// @subject packages/server/src/domain/import/loader/collect.ts
// @subject packages/contracts/src/import/index.ts

import { mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ST_SECRETS_FILE, ST_SETTINGS_FILE, TREE_DRY_RUN_VALUE } from "@orb/contracts/import";
import { personas } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import type { Files } from "./_st-tree-door.ts";
import { admit, CHAT, cardPng, chatOf, dryRun, finish, harness, settings, stagedTree, tableContents } from "./_st-tree-door.ts";

// From `<profile>/group chats/` or `<profile>/User Avatars/`, these four climbs land on the staging root.
const CLIMB = "../../../..";
const OUTSIDE = "outside";
const MARKER = "planted-outside-the-staged-tree";

// `group chats/` joins the name with `.jsonl`, so each case names the planted `outside.jsonl` one way.
const HOSTILE_LEAVES: readonly { readonly shape: string; readonly leaf: (root: ServerTestHarness) => string }[] = [
  { shape: "a parent climb", leaf: () => `${CLIMB}/${OUTSIDE}` },
  { shape: "an absolute path", leaf: (root) => join(root.importStagingDir, OUTSIDE) },
  { shape: "a percent-encoded climb", leaf: () => `..%2F..%2F..%2F..%2F${OUTSIDE}` },
  { shape: "Windows separators", leaf: () => `..\\..\\..\\..\\${OUTSIDE}` },
  { shape: "a NUL byte", leaf: () => `${CLIMB}/${OUTSIDE}\0ignored` },
];

function groupFile(leaves: readonly string[]): string {
  return JSON.stringify({ name: "G", members: ["Aria.png"], chats: leaves });
}

function profile(root: ServerTestHarness, extra: Files, personaMap: Readonly<Record<string, string>> = { "bob.png": "Bob" }): Files {
  return { [ST_SETTINGS_FILE]: settings(personaMap), "characters/Aria.png": cardPng(root, "Aria"), ...extra };
}

async function plantOutside(root: ServerTestHarness): Promise<void> {
  await mkdir(root.importStagingDir, { recursive: true });
  await writeFile(join(root.importStagingDir, `${OUTSIDE}.jsonl`), chatOf(MARKER));
}

async function avatarAsset(root: ServerTestHarness, name: string): Promise<string | null | undefined> {
  const [persona] = await root.db.select({ avatarAssetId: personas.avatarAssetId }).from(personas).where(eq(personas.name, name));
  return persona?.avatarAssetId;
}

test.for(HOSTILE_LEAVES)("a group chat named by $shape reads nothing outside the staged tree on a dry run or a real run", async ({ leaf }) => {
  await using root = await harness();
  await plantOutside(root);
  const hostile = leaf(root);
  const files = profile(root, { "groups/g.json": groupFile([hostile]) });

  const preview = await dryRun(root, files);

  expect(preview.kinds.chats.total).toBe(0);
  expect(preview.skipped.items.map((item) => item.source.path)).toContain(`${hostile}.jsonl`);
  expect(JSON.stringify(preview)).not.toContain(MARKER);

  await finish(root, await admit(root, files));
  expect(JSON.stringify(await tableContents(root))).not.toContain(MARKER);
});

test("the preview answers the same for an outside file that exists and one that does not", async () => {
  await using root = await harness();
  await plantOutside(root);
  const present = `${CLIMB}/${OUTSIDE}`;
  const absent = `${CLIMB}/never-existed`;

  const preview = await dryRun(root, profile(root, { "groups/g.json": groupFile([present, absent]) }));

  expect(preview.kinds.chats.total).toBe(0);
  const reasons = new Map(preview.skipped.items.map((item) => [item.source.path, item.reason]));
  expect(reasons.get(`${present}.jsonl`)).toBeDefined();
  expect(reasons.get(`${present}.jsonl`)).toBe(reasons.get(`${absent}.jsonl`));
});

test("a persona avatar that climbs out of the staged tree lands no art, and the preview lists the persona without art", async () => {
  await using root = await harness();
  await mkdir(root.importStagingDir, { recursive: true });
  await writeFile(join(root.importStagingDir, `${OUTSIDE}.png`), cardPng(root, "Outside"));
  const hostile = `${CLIMB}/${OUTSIDE}.png`;
  const files = profile(root, {}, { [hostile]: "Climber" });

  const preview = await dryRun(root, files);
  expect(preview.kinds.personas.items).toEqual([expect.objectContaining({ name: "Climber", withoutArt: true })]);

  await finish(root, await admit(root, files));
  expect(await avatarAsset(root, "Climber")).toBeNull();
});

test("a persona's own avatar file still lands beside a hostile one", async () => {
  await using root = await harness();
  await finish(
    root,
    await admit(root, {
      ...profile(root, {}, { "real.png": "Kept", [`${CLIMB}/gone.png`]: "Climber" }),
      "User Avatars/real.png": cardPng(root, "Avatar"),
    }),
  );
  expect(await avatarAsset(root, "Kept")).toEqual(expect.any(String));
});

// No upload can stage a link, so each case plants one between the 202 and the run.
const PLANTED_LINKS: readonly { readonly shape: string; readonly plant: (tree: string, outsideDir: string) => Promise<void> }[] = [
  {
    shape: "a transcript link",
    plant: (tree, outsideDir) => symlink(join(outsideDir, `${OUTSIDE}.jsonl`), join(tree, "profile", "group chats", `${OUTSIDE}.jsonl`)),
  },
  {
    shape: "a linked transcript folder",
    plant: async (tree, outsideDir) => {
      await rm(join(tree, "profile", "group chats"), { recursive: true });
      await symlink(outsideDir, join(tree, "profile", "group chats"));
    },
  },
];

test.for(PLANTED_LINKS)("$shape in the staged tree is skipped and the run still lands", async ({ plant }) => {
  await using root = await harness();
  const outsideDir = join(root.importStagingDir, "elsewhere");
  await mkdir(outsideDir, { recursive: true });
  await writeFile(join(outsideDir, `${OUTSIDE}.jsonl`), chatOf(MARKER));
  const id = await admit(root, profile(root, { "groups/g.json": groupFile([OUTSIDE]), "group chats/real.jsonl": CHAT }));

  await plant(await stagedTree(root), outsideDir);

  await finish(root, id);
  expect(JSON.stringify(await tableContents(root))).not.toContain(MARKER);
});

test("a linked avatar folder lands no art from where it points", async () => {
  await using root = await harness();
  const outsideDir = join(root.importStagingDir, "elsewhere");
  await mkdir(outsideDir, { recursive: true });
  await writeFile(join(outsideDir, "bob.png"), cardPng(root, "Outside"));
  const id = await admit(root, profile(root, {}));

  await symlink(outsideDir, join(await stagedTree(root), "profile", "User Avatars"));

  await finish(root, id);
  expect(await avatarAsset(root, "Bob")).toBeNull();
});

test.for(["Secrets.json", "SECRETS.JSON", "chats/Aria/sEcReTs.JsOn"])("a credentials file spelled %s is never staged", async (path) => {
  await using root = await harness();
  const id = await admit(root, profile(root, { [path]: '{"api_key_openai":"planted-credential"}' }), [TREE_DRY_RUN_VALUE]);

  const staged = await readdir(await stagedTree(root), { recursive: true });

  expect(staged.filter((entry) => entry.toLowerCase().endsWith(ST_SECRETS_FILE))).toEqual([]);
  expect(JSON.stringify(await finish(root, id))).not.toContain("planted-credential");
});
