// Two card files whose names differ only in letter case collide on a Windows or macOS volume, so the folder upload
// refuses the pair by name and stages nothing, on every host. A Linux host stages both names fine, so the refusal
// cannot depend on the volume the test runs on.
// @subject packages/server/src/entry/http/import-tree.ts

import { readdir } from "node:fs/promises";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { IMPORT_PREVIEW_TEXT_MAX, ST_SETTINGS_FILE, TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE, TREE_FILE_FIELD } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

const WRAPPER = "default-user";
const CARD_BYTES = new TextEncoder().encode("a card");
const REFUSED_STATUS = 400;
const ACCEPTED_STATUS = 202;

function harness(): Promise<ServerTestHarness> {
  return createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
}

/** One SillyTavern profile upload holding the given card file names, posted to the tree door. */
async function postProfile(root: ServerTestHarness, cardNames: readonly string[], dryRun = false): Promise<Response> {
  const form = new FormData();
  const paths = [ST_SETTINGS_FILE, ...cardNames.map((name) => `characters/${name}`)].map((path) => `${WRAPPER}/${path}`);
  for (const relPath of paths) {
    form.append(TREE_FILE_FIELD, new File([CARD_BYTES], relPath), relPath);
  }
  if (dryRun) {
    form.append(TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE);
  }
  return await root.http.request(PORTABILITY_ROUTES.importTree, { method: "POST", headers: CSRF_HEADERS, body: form });
}

async function stagedEntries(root: ServerTestHarness): Promise<readonly string[]> {
  return await readdir(root.stagedImportsOf(root.ownerId), { recursive: true }).catch(() => []);
}

async function refusalOf(response: Response): Promise<string> {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("error" in body) || typeof body.error !== "string") {
    throw new Error("the refusal carries no error text");
  }
  return body.error;
}

test.each([
  { name: "a run", dryRun: false },
  { name: "a dry run", dryRun: true },
])("$name of a folder holding two card names that differ only in case is refused naming both, and stages nothing", async ({ dryRun }) => {
  await using root = await harness();

  const response = await postProfile(root, ["Aria.png", "aria.png"], dryRun);

  expect(response.status).toBe(REFUSED_STATUS);
  const reason = await refusalOf(response);
  expect(reason).toContain(`${WRAPPER}/characters/Aria.png`);
  expect(reason).toContain(`${WRAPPER}/characters/aria.png`);
  expect(await stagedEntries(root)).toEqual([]);
});

test("a name past the clip is cut in the refusal, so a hostile name is not echoed whole", async () => {
  await using root = await harness();
  const long = "a".repeat(IMPORT_PREVIEW_TEXT_MAX + 50);

  const response = await postProfile(root, [`${long}.png`, `${long.toUpperCase()}.png`]);

  expect(response.status).toBe(REFUSED_STATUS);
  const reason = await refusalOf(response);
  expect(reason).toContain("a".repeat(IMPORT_PREVIEW_TEXT_MAX - WRAPPER.length - "/characters/".length));
  expect(reason).not.toContain(long);
});

test("the same folder with its second card named apart stages, so the refusal is the case twin and not the folder", async () => {
  await using root = await harness();

  const response = await postProfile(root, ["Aria.png", "Bram.png"]);

  expect(response.status).toBe(ACCEPTED_STATUS);
  expect(await stagedEntries(root)).not.toEqual([]);
});
