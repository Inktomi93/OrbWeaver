// A SillyTavern profile zipped from its folder imports through the profile zip door exactly as the folder imports
// through the tree door: the same preview, the same result and the same rows, preset scripts included, with the
// profile nested two folders deep and the archiver's litter beside it. The door is a hostile-input boundary: an entry
// that inflates past the size it states is refused by its name with nothing staged and no job, and a file that is not
// a zip is refused with the reason that says what it is. An Orbweaver backup zip is not this door's and stages nothing.
// An entry named to leave the staged tree, or more entries than the tree door admits, refuses the whole zip with nothing
// staged; a credentials file is never staged in any letter case; and a zip stages only under the account that sent it.
// A second upload from one account is refused before its body is read however it is framed; only a profile's own planes
// are staged; two entries whose paths collide on disk are refused as unsafe; and a failed persona review leaves no stage.
// @subject packages/server/src/entry/http/import-tree-zip.ts
// @subject packages/server/src/infra/storage/zip.ts

import { gzipSync } from "node:zlib";
import type { PersonaCollisionChoices, ProfileZipRefusal } from "@orb/contracts/import";
import {
  encodePersonaCollisionChoices,
  PERSONA_COLLISION_FIELD,
  profileZipRefusalSchema,
  profileZipStartedSchema,
  ST_SECRETS_FILE,
  ST_SETTINGS_FILE,
  TREE_DRY_RUN_FIELD,
  TREE_DRY_RUN_VALUE,
} from "@orb/contracts/import";
import { PORTABILITY_ROUTES, PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { IMPORT_TREE_MAX_FILE_BYTES, IMPORT_TREE_MAX_FILES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { strToU8, zipSync } from "fflate";
import { vi } from "vitest";
import { bodyRequest, CSRF_HEADERS, observedBody } from "../../../entry/http/_body-limit-inputs.ts";
import type { Files } from "./_st-tree-door.ts";
import { admit, bothKindFolders, finishRun, harness, stagedEntries } from "./_st-tree-door.ts";

// fflate derives the DOS date from local time; a fixed mid-year UTC stamp keeps the archives deterministic.
const ZIP_MTIME = new Date("2025-07-01T12:00:00Z");
// The profile sits two folders down, the way a zip of a whole SillyTavern install holds it.
const NESTED = "SillyTavern/data/default-user/";
const ACCEPTED = 202;
const NO_CONTENT = 204;
const REFUSED = 400;
const TOO_LARGE = 413;
const CONFLICT = 409;
const SERVER_FAILED = 500;

const ST_AI_OUTPUT = 2;
// SillyTavern wire text is snake_case and integer placements by spec, so the preset is raw JSON.
const SCRIPTED_PRESET = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", content: "You narrate.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
  extensions: {
    ["regex_scripts"]: [
      {
        id: "c0ffee00-0000-4000-8000-000000000041",
        scriptName: "Saved whistle",
        findRegex: "sings",
        replaceString: "whistles",
        trimStrings: [],
        placement: [ST_AI_OUTPUT],
        disabled: false,
        markdownOnly: false,
        promptOnly: false,
        runOnEdit: false,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
      },
    ],
  },
});

function bytesOf(value: Uint8Array | string): Uint8Array {
  return typeof value === "string" ? strToU8(value) : value;
}

/** The profile's files zipped under `prefix`, beside what a macOS archiver and a whole install add around it. `raw`
 *  entries keep their names as given, outside the prefix. */
function profileZip(files: Files, prefix = NESTED, raw: Files = {}): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    ...Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`${prefix}${path}`, bytesOf(bytes)])),
    ...Object.fromEntries(Object.entries(raw).map(([path, bytes]) => [path, bytesOf(bytes)])),
  };
  entries[`__MACOSX/${prefix}._${ST_SETTINGS_FILE}`] = strToU8("fork");
  entries[`${prefix}.DS_Store`] = strToU8("finder");
  entries[`${prefix}${ST_SECRETS_FILE}`] = strToU8('{"api_key_openai":"sk-never"}');
  entries["SillyTavern/server.js"] = strToU8("console.log('not a profile file');");
  return zipSync(entries, { mtime: ZIP_MTIME });
}

interface ZipPost {
  readonly dryRun?: boolean;
  readonly choices?: PersonaCollisionChoices;
  /** A signed-in account's request headers; the single-user owner's loopback request sends none. */
  readonly headers?: Readonly<Record<string, string>>;
}

async function postZip(root: ServerTestHarness, body: Uint8Array, { dryRun = false, choices = {}, headers = {} }: ZipPost = {}): Promise<Response> {
  const query = new URLSearchParams(encodePersonaCollisionChoices(choices).map((choice) => [PERSONA_COLLISION_FIELD, choice]));
  if (dryRun) {
    query.append(TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE);
  }
  return await root.http.request(`${PORTABILITY_ROUTES.importTreeZip}?${query.toString()}`, { method: "POST", headers: { ...headers, ...CSRF_HEADERS }, body });
}

/** Every path staged for one account, under its staged tree's directory. */
async function stagedPaths(root: ServerTestHarness, ownerId?: UserId): Promise<readonly string[]> {
  return (await stagedEntries(root, ownerId)).map((entry) => entry.split("/").slice(1).join("/"));
}

async function admitZip(root: ServerTestHarness, body: Uint8Array, options: ZipPost = {}): Promise<WorkloadId> {
  const response = await postZip(root, body, options);
  expect(response.status).toBe(ACCEPTED);
  return profileZipStartedSchema.parse(await response.json()).workloadId;
}

async function refusalOf(response: Response): Promise<{ readonly status: number; readonly reason: ProfileZipRefusal; readonly error: string }> {
  const { reason, error } = profileZipRefusalSchema.parse(await response.json());
  return { status: response.status, reason, error };
}

async function jobsOf(root: ServerTestHarness): Promise<number> {
  return (await root.services.workloads.list({ caller: await root.principalFor(root.ownerId) })).length;
}

test("a profile zipped two folders deep previews and imports as its folder does, preset scripts included", async () => {
  await using folderRoot = await harness();
  await using zipRoot = await harness();
  const files: Files = { ...bothKindFolders(folderRoot).held, "OpenAI Settings/Kettle.json": SCRIPTED_PRESET };
  const zip = profileZip(files);

  const folderPreview = (await finishRun(folderRoot, await admit(folderRoot, files, [TREE_DRY_RUN_VALUE]))).preview;
  const zipPreview = (await finishRun(zipRoot, await admitZip(zipRoot, zip, { dryRun: true }))).preview;
  expect(zipPreview).toEqual(folderPreview);
  expect(zipPreview?.kinds.presets.items.find((item) => item.name === "Kettle (OpenAI)")?.regexScripts).toEqual([{ name: "Saved whistle" }]);

  const { reportPath: folderReport, ...folderResult } = await finishRun(folderRoot, await admit(folderRoot, files));
  const { reportPath: zipReport, ...zipResult } = await finishRun(zipRoot, await admitZip(zipRoot, zip));
  expect(zipResult).toEqual(folderResult);
  expect(zipReport).toBeDefined();
  expect(folderReport).toBeDefined();

  const caller = await zipRoot.internalCallerFor(zipRoot.ownerId);
  const preset = (await caller.preset.list()).find(({ name }) => name === "Kettle (OpenAI)");
  if (preset === undefined) {
    throw new Error("the zip run landed no preset");
  }
  expect((await caller.regex.listForPreset({ presetId: preset.id })).map(({ name }) => name)).toEqual(["Saved whistle"]);
  // The credentials file and everything outside the profile stay in the zip; the run leaves nothing staged.
  expect(await stagedEntries(zipRoot)).toEqual([]);
});

// Where the uncompressed size and the name sit in a zip's central record and local header (APPNOTE 4.3.7, 4.3.12).
const ZIP_SIZE_FIELDS = [
  { signature: 0x02_01_4b_50, fixed: 46, nameLengthAt: 28, compressedAt: 20, uncompressedAt: 24 },
  { signature: 0x04_03_4b_50, fixed: 30, nameLengthAt: 26, compressedAt: 18, uncompressedAt: 22 },
] as const;

/** Restate one entry's inflated size in a zip as its deflated size, in its central record and its local header. */
function understate(zip: Uint8Array, name: string): Uint8Array {
  const out = zip.slice();
  const view = new DataView(out.buffer);
  const nameBytes = strToU8(name);
  const headers = ZIP_SIZE_FIELDS;
  let patched = 0;
  for (let at = 0; at + 4 <= out.length; at += 1) {
    const header = headers.find(({ signature }) => view.getUint32(at, true) === signature);
    if (header === undefined || view.getUint16(at + header.nameLengthAt, true) !== nameBytes.length) {
      continue;
    }
    const nameAt = at + header.fixed;
    if (out.subarray(nameAt, nameAt + nameBytes.length).every((byte, index) => byte === nameBytes[index])) {
      view.setUint32(at + header.uncompressedAt, view.getUint32(at + header.compressedAt, true), true);
      patched += 1;
    }
  }
  expect(patched).toBe(headers.length);
  return out;
}

test("an entry that inflates past the size it states is refused by its name, with nothing staged and no job", async () => {
  await using root = await harness();
  const files: Files = { ...bothKindFolders(root).held };
  const bombName = `${NESTED}characters/Bomb.png`;
  const honest = zipSync(
    {
      ...Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`${NESTED}${path}`, bytesOf(bytes)])),
      [bombName]: new Uint8Array(IMPORT_TREE_MAX_FILE_BYTES + 1),
    },
    { mtime: ZIP_MTIME },
  );
  // The control: the same zip, its sizes honest, is refused for the entry's real size before anything inflates.
  const control = await refusalOf(await postZip(root, honest, { dryRun: true }));
  expect(control).toMatchObject({ status: TOO_LARGE, reason: "too-large" });
  expect(control.error).toContain("characters/Bomb.png");

  // A deflate stream of zeros is a few kilobytes, so stating that as the entry's size passes every directory belt.
  const bomb = understate(honest, bombName);
  const refused = await refusalOf(await postZip(root, bomb, { dryRun: true }));
  expect(refused).toMatchObject({ status: REFUSED, reason: "unsafe" });
  expect(refused.error).toContain(bombName);
  expect(refused.error).toContain("inflates beyond its declared size");
  expect(await stagedEntries(root)).toEqual([]);
  expect(await jobsOf(root)).toBe(0);
});

const NOT_ZIPS: Record<"empty" | "truncated" | "other-archive" | "json" | "html", (zip: Uint8Array) => Uint8Array> = {
  empty: () => new Uint8Array(0),
  truncated: (zip) => zip.subarray(0, zip.length - 64),
  "other-archive": (zip) => gzipSync(zip),
  json: () => strToU8(` \n${JSON.stringify({ ["power_user"]: { personas: {} } })}`),
  html: () => strToU8("<!DOCTYPE html>\n<html><body>Sign in</body></html>"),
};

test.each(Object.entries(NOT_ZIPS))("a file that is not a zip (%s) is refused by what it is, with nothing staged and no job", async (kind, make) => {
  await using root = await harness();
  const zip = profileZip(bothKindFolders(root).held);
  const refused = await refusalOf(await postZip(root, make(zip), { dryRun: true }));
  expect(refused).toMatchObject({ status: REFUSED, reason: kind });
  expect(await stagedEntries(root)).toEqual([]);
  expect(await jobsOf(root)).toBe(0);
  // The positive control: the zip it was made from is admitted.
  expect((await postZip(root, zip, { dryRun: true })).status).toBe(ACCEPTED);
});

test("a declared length over the tree total is refused before a byte is read, with nothing staged", async () => {
  await using root = await harness();
  const response = await root.http.request(PORTABILITY_ROUTES.importTreeZip, {
    method: "POST",
    headers: { ...CSRF_HEADERS, "content-length": String(IMPORT_TREE_MAX_TOTAL_BYTES + 1) },
    body: new Uint8Array(0),
  });
  expect(response.status).toBe(TOO_LARGE);
  expect(await stagedEntries(root)).toEqual([]);
  // The control: the same empty body under its real length reaches the zip door, which says what it is.
  expect(await refusalOf(await postZip(root, new Uint8Array(0)))).toMatchObject({ status: REFUSED, reason: "empty" });
});

test("an Orbweaver backup zip is not a profile: the door answers no content, stages nothing and starts no job", async () => {
  await using root = await harness();
  const backup = zipSync({ [`backup/${PORTABLE_DIRECTORIES.regex}tidy.json`]: strToU8("{}") }, { mtime: ZIP_MTIME });
  expect((await postZip(root, backup, { dryRun: true })).status).toBe(NO_CONTENT);
  expect(await stagedEntries(root)).toEqual([]);
  expect(await jobsOf(root)).toBe(0);
});

// Names an archive can hold that would leave the staged tree or alias a path in it. The archive reader refuses the
// first five before any entry inflates; the tree door's path check refuses a dot or an empty segment.
const ESCAPING_NAMES: Readonly<Record<string, string>> = {
  parent: `${NESTED}../../../escape.txt`,
  absolute: "/escape.txt",
  backslash: `${NESTED}..\\..\\escape.txt`,
  drive: "C:/escape.txt",
  nul: `${NESTED}characters/escape\0.png`,
  dot: `${NESTED}./characters/escape.png`,
  empty: `${NESTED}characters//escape.png`,
};

test.each(Object.entries(ESCAPING_NAMES))(
  "an entry named to leave the staged tree (%s) refuses the whole zip, with nothing staged and no job",
  async (_kind, name) => {
    await using root = await harness();
    const files = bothKindFolders(root).held;
    const refused = await refusalOf(await postZip(root, profileZip(files, NESTED, { [name]: "escape" }), { dryRun: true }));
    expect(refused).toMatchObject({ status: REFUSED, reason: "unsafe" });
    expect(refused.error).not.toContain(root.stagedImportsOf(root.ownerId));
    expect(await stagedEntries(root)).toEqual([]);
    expect(await jobsOf(root)).toBe(0);
    // The control: the same zip without that entry is admitted.
    expect((await postZip(root, profileZip(files), { dryRun: true })).status).toBe(ACCEPTED);
  },
);

test("a credentials file in any letter case, at any depth of the profile, is never staged", async () => {
  await using root = await harness();
  const credentials = '{"api_key_openai":"sk-never"}';
  const zip = profileZip({ ...bothKindFolders(root).held, "SECRETS.JSON": credentials, "worlds/Secrets.Json": credentials });
  expect((await postZip(root, zip, { dryRun: true })).status).toBe(ACCEPTED);
  const staged = await stagedPaths(root);
  expect(staged.filter((path) => path.toLowerCase().endsWith("secrets.json"))).toEqual([]);
  // The control: the admitted dry run's tree is still staged, its settings file and world books included.
  expect(staged).toContain(`profile/${ST_SETTINGS_FILE}`);
  expect(staged.filter((path) => path.startsWith("profile/worlds/")).length).toBeGreaterThan(0);
});

// Building a real archive one entry past the cap takes most of this case's time.
test("a zip with more entries than the tree door admits is refused as too large, with nothing staged and no job", { tags: ["slow"] }, async () => {
  await using root = await harness();
  const files = bothKindFolders(root).held;
  const padding: Files = Object.fromEntries(Array.from({ length: IMPORT_TREE_MAX_FILES + 1 }, (_, index) => [`worlds/${String(index)}.json`, "{}"]));
  const refused = await refusalOf(await postZip(root, profileZip({ ...files, ...padding }), { dryRun: true }));
  expect(refused).toMatchObject({ status: TOO_LARGE, reason: "too-large" });
  expect(await stagedEntries(root)).toEqual([]);
  expect(await jobsOf(root)).toBe(0);
  // The control: the profile without the padding is admitted.
  expect((await postZip(root, profileZip(files), { dryRun: true })).status).toBe(ACCEPTED);
});

test("a zip stages only under the account that sent it, and another account can neither see the stage nor read the job", async () => {
  await using root = await createAuthModeRoot("local", { physicalPeer: () => "127.0.0.1", startJobs: false });
  const owner = await signIn(root, await ownerSubject(root));
  const member = await signIn(root, await mintMember(root));
  // The owner sends it: an admin reads every account's jobs, so the member is the account that must be refused.
  const workloadId = await admitZip(root, profileZip(bothKindFolders(root).held), { dryRun: true, headers: owner.headers });

  expect(await stagedPaths(root, owner.principal.userId)).toContain(`profile/${ST_SETTINGS_FILE}`);
  expect(await stagedEntries(root, member.principal.userId)).toEqual([]);
  await expect(root.services.workloads.get({ caller: member.principal, id: workloadId })).rejects.toThrow(DomainNotFoundError);
  await expect(root.services.workloads.get({ caller: owner.principal, id: workloadId })).resolves.toMatchObject({
    kind: "import-st",
    ownerId: owner.principal.userId,
  });
});

/** A request body that sends `bytes` in two parts and holds the second until `release` is called. */
function heldBody(bytes: Uint8Array): { readonly body: ReadableStream<Uint8Array>; readonly firstPulled: Promise<void>; readonly release: () => void } {
  const half = Math.floor(bytes.length / 2);
  const firstPull = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  let part = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull: async (target): Promise<void> => {
        part += 1;
        if (part === 1) {
          target.enqueue(bytes.subarray(0, half));
          firstPull.resolve();
          return;
        }
        await gate.promise;
        target.enqueue(bytes.subarray(half));
        target.close();
      },
    },
    { highWaterMark: 0 },
  );
  return { body, firstPulled: firstPull.promise, release: () => gate.resolve() };
}

test("a second zip from one account is refused before its body is read, even with no declared length", async () => {
  await using root = await harness();
  const zip = profileZip(bothKindFolders(root).held);
  const route = `${PORTABILITY_ROUTES.importTreeZip}?${TREE_DRY_RUN_FIELD}=${TREE_DRY_RUN_VALUE}`;
  // The first upload holds the account's staging slot, its body half sent.
  const first = heldBody(zip);
  const firstAnswer = bodyRequest(root, route, first.body);
  await first.firstPulled;

  // A body with no declared length is streamed by the door itself, so the slot answers before one byte is pulled.
  using second = observedBody(IMPORT_TREE_MAX_TOTAL_BYTES);
  const refused = await bodyRequest(root, route, second.body);
  expect(refused.status).toBe(CONFLICT);
  await refused.arrayBuffer();
  expect(second.snapshot().pulls).toBe(0);

  // The control: the held upload, itself sent with no declared length, finishes and is admitted.
  first.release();
  expect((await firstAnswer).status).toBe(ACCEPTED);
});

test("a zip of SillyTavern's data folder stages only its profiles' own planes, never the files beside them", async () => {
  await using root = await harness();
  const data = "SillyTavern/data/";
  const zip = profileZip(bothKindFolders(root).held, `${data}default-user/`, {
    [`${data}other-user/${ST_SETTINGS_FILE}`]: JSON.stringify({ ["power_user"]: { personas: {} } }),
    [`${data}cookie-secret.txt`]: "a session-signing secret",
    [`${data}_storage/user`]: '{"handle":"user","password":"scrypt-hash","salt":"salt"}',
    [`${data}default-user/movingUI/layout.json`]: "{}",
  });
  expect((await postZip(root, zip, { dryRun: true })).status).toBe(ACCEPTED);
  const staged = await stagedPaths(root);
  expect(staged.filter((path) => path.includes("cookie-secret") || path.includes("_storage") || path.includes("movingUI"))).toEqual([]);
  // The control: both profiles' settings files are staged.
  expect(staged).toEqual(expect.arrayContaining([`default-user/${ST_SETTINGS_FILE}`, `other-user/${ST_SETTINGS_FILE}`]));
});

const COLLIDING_ON_DISK: Readonly<Record<string, Files>> = {
  "a file where a later entry needs a folder": { "worlds/a": "{}", "worlds/a/b.json": "{}" },
  "a name longer than a volume holds": { [`worlds/${"w".repeat(300)}.json`]: "{}" },
};

test.each(Object.entries(COLLIDING_ON_DISK))("%s is refused as unsafe, with nothing staged and no job", async (_case, extra) => {
  await using root = await harness();
  const refused = await refusalOf(await postZip(root, profileZip({ ...bothKindFolders(root).held, ...extra }), { dryRun: true }));
  expect(refused).toMatchObject({ status: REFUSED, reason: "unsafe" });
  expect(await stagedEntries(root)).toEqual([]);
  expect(await jobsOf(root)).toBe(0);
});

test("a dry run whose persona review fails leaves no stage behind", async () => {
  await using root = await harness();
  const zip = profileZip(bothKindFolders(root).held);
  {
    using review = vi.spyOn(root.services.persona, "reviewImport").mockRejectedValue(new Error("the persona read failed"));
    expect((await postZip(root, zip, { dryRun: true })).status).toBe(SERVER_FAILED);
    expect(review).toHaveBeenCalledOnce();
  }
  expect(await stagedEntries(root)).toEqual([]);
  expect(await jobsOf(root)).toBe(0);
  // The control: with the review answering, the same dry run stages its tree.
  expect((await postZip(root, zip, { dryRun: true })).status).toBe(ACCEPTED);
  expect(await stagedPaths(root)).toContain(`profile/${ST_SETTINGS_FILE}`);
});
