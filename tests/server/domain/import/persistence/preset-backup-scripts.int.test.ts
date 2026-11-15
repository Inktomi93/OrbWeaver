// @subject packages/server/src/domain/preset/verbs/export.ts
// @subject packages/server/src/domain/preset/verbs/import.ts
// @subject packages/server/src/domain/regex/persistence/portability-write.ts
// A backup and the Presets page export keep a preset's attached regex scripts, in order, on their axes and with their
// switches, and a restore into another account's empty library attaches them to the preset through the same write
// door and identity rule a SillyTavern import uses: an equal preset is reused, never doubled. A preset file written
// before the export carried scripts restores on its config alone.
import type { Principal } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { Handle, PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { signedInMember } from "../../../entry/_auth-roots.ts";

const ST_USER_INPUT = 1;
const ST_AI_OUTPUT = 2;
// fflate's DOS date reads local time and throws near the epoch, so a mid-year stamp stays valid in every zone.
const ZIP_MTIME = new Date("2025-07-01T12:00:00Z");
const PRESETS_DIR = "presets/";

// SillyTavern wire text is snake_case and integer placements by spec, so the preset is raw JSON.
const ST_SCRIPT = { trimStrings: [], runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null };
const PRESET_FILE = JSON.stringify({
  prompts: [{ identifier: "main", name: "Main", content: "You narrate the lighthouse.", role: "system" }],
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "main", enabled: true }] }],
  extensions: {
    ["regex_scripts"]: [
      {
        ...ST_SCRIPT,
        id: "c0ffee00-0000-4000-8000-000000000051",
        scriptName: "Lamp panel",
        findRegex: "<lamp>",
        replaceString: "<div>lamp</div>",
        placement: [ST_AI_OUTPUT],
        markdownOnly: true,
        promptOnly: false,
        disabled: false,
      },
      {
        ...ST_SCRIPT,
        id: "c0ffee00-0000-4000-8000-000000000052",
        scriptName: "Older replies",
        findRegex: "fog",
        replaceString: "mist",
        placement: [ST_USER_INPUT, ST_AI_OUTPUT],
        markdownOnly: false,
        promptOnly: true,
        minDepth: 1,
        maxDepth: 3,
        disabled: true,
      },
      {
        ...ST_SCRIPT,
        id: "c0ffee00-0000-4000-8000-000000000053",
        scriptName: "Saved tide",
        findRegex: "tide",
        replaceString: "surf",
        placement: [ST_AI_OUTPUT],
        markdownOnly: false,
        promptOnly: false,
        disabled: false,
      },
    ],
  },
});

interface Box extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly source: Principal;
  readonly target: Principal;
  readonly targetHeaders: Readonly<Record<string, string>>;
}

async function box(): Promise<Box> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({ physicalPeer: () => "127.0.0.1", startJobs: false, env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" } }),
  );
  const member = await signedInMember(root, castId<Handle>("restore-target"));
  const targetHeaders = { [CSRF_HEADER]: "1", cookie: member.cookie };
  // Default content seeds in the background after each account's first request.
  await root.http.request(PORTABILITY_ROUTES.exportLibrary);
  await root.http.request(PORTABILITY_ROUTES.exportLibrary, { headers: targetHeaders });
  await root.settleBackground();
  const source = await principal(root, root.ownerId);
  const target = await principal(root, member.id);
  const owned = construction.move();
  return { root, source, target, targetHeaders, [Symbol.asyncDispose]: () => owned.disposeAsync() };
}

/** What the owner can see of a preset's attached scripts: everything a restore must keep, in run order. */
async function attachedOf(root: ServerTestHarness, owner: Principal, presetId: PresetId): Promise<unknown> {
  const caller = await root.internalCallerFor(owner.userId);
  return (await caller.regex.listForPreset({ presetId })).map(({ name, enabled, targets, passes, depth, findRegex, replaceString }) => ({
    name,
    enabled,
    targets,
    passes,
    depth,
    findRegex,
    replaceString,
  }));
}

async function presetNamed(root: ServerTestHarness, owner: Principal, name: string): Promise<PresetId | undefined> {
  const caller = await root.internalCallerFor(owner.userId);
  return (await caller.preset.list()).find((preset) => preset.name === name)?.id;
}

async function restore(b: Box, bundle: Uint8Array): Promise<void> {
  const response = await b.root.http.request(PORTABILITY_ROUTES.importBundle, { method: "POST", headers: b.targetHeaders, body: Uint8Array.from(bundle) });
  expect(response.status).toBe(202);
  await b.root.runAdmittedWorkload?.(importStartedSchema.parse(await response.json()).workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
}

const fileSchema = z.looseObject({ name: z.string(), regexScripts: z.array(z.unknown()).optional() });

test("a backup restores a preset with its scripts attached in order on another account, reuses it on a second restore, and an old backup restores its config alone", async () => {
  await using b = await box();
  const sourceCaller = await b.root.internalCallerFor(b.source.userId);
  const imported = await sourceCaller.preset.importFile({ fileText: PRESET_FILE, fileName: "Lighthouse.json" });
  const presetId = imported.ok ? imported.presetId : undefined;
  if (presetId === undefined) {
    throw new Error("the SillyTavern preset did not land");
  }
  const attached = await attachedOf(b.root, b.source, presetId);
  expect(attached).toHaveLength(3);

  const library = new Uint8Array(await (await b.root.http.request(PORTABILITY_ROUTES.exportLibrary)).arrayBuffer());
  const presetEntries = Object.entries(unzipSync(library)).filter(([entry]) => entry.startsWith(PRESETS_DIR));
  const lighthouse = presetEntries.find(([, entry]) => fileSchema.parse(JSON.parse(strFromU8(entry))).name === "Lighthouse");
  if (lighthouse === undefined) {
    throw new Error("the backup carries no Lighthouse preset");
  }

  await restore(b, library);
  const restored = await presetNamed(b.root, b.target, "Lighthouse");
  if (restored === undefined) {
    throw new Error("the restore landed no Lighthouse preset");
  }
  expect(await attachedOf(b.root, b.target, restored)).toEqual(attached);
  const targetCaller = await b.root.internalCallerFor(b.target.userId);
  const presets = await targetCaller.preset.list();
  const scripts = await targetCaller.regex.listScripts();

  // A second restore of the same backup finds the preset and its scripts already held.
  await restore(b, library);
  expect(await targetCaller.preset.list()).toEqual(presets);
  expect(await targetCaller.regex.listScripts()).toEqual(scripts);
  expect(await attachedOf(b.root, b.target, restored)).toEqual(attached);

  // A preset file from before the export carried scripts does not speak for scripts: it is the held preset by its
  // config alone, and into a library without it, it lands with none attached.
  const [path, bytes] = lighthouse;
  const { regexScripts: _scripts, ...old } = fileSchema.parse(JSON.parse(strFromU8(bytes)));
  const oldBackup = zipSync({ [path]: strToU8(JSON.stringify(old)) }, { mtime: ZIP_MTIME });
  await restore(b, oldBackup);
  expect(await targetCaller.preset.list()).toEqual(presets);
  await targetCaller.preset.remove({ id: restored });
  await restore(b, oldBackup);
  const fromOld = await presetNamed(b.root, b.target, "Lighthouse");
  if (fromOld === undefined) {
    throw new Error("the old backup landed no Lighthouse preset");
  }
  expect(await attachedOf(b.root, b.target, fromOld)).toEqual([]);
});

test("the Presets page export carries the preset's scripts, and its import on another account attaches them in order", async () => {
  await using b = await box();
  const sourceCaller = await b.root.internalCallerFor(b.source.userId);
  const imported = await sourceCaller.preset.importFile({ fileText: PRESET_FILE, fileName: "Lighthouse.json" });
  const presetId = imported.ok ? imported.presetId : undefined;
  if (presetId === undefined) {
    throw new Error("the SillyTavern preset did not land");
  }
  const attached = await attachedOf(b.root, b.source, presetId);

  const exported = await sourceCaller.preset.exportFile({ id: presetId });
  const targetCaller = await b.root.internalCallerFor(b.target.userId);
  expect(await targetCaller.preset.previewFile({ fileText: exported.fileText, fileName: exported.filename })).toMatchObject({
    ok: true,
    format: "orbweaver",
    inLibrary: false,
    regexScripts: 3,
  });
  const landed = await targetCaller.preset.importFile({ fileText: exported.fileText, fileName: exported.filename });
  expect(landed).toMatchObject({ ok: true, created: true, regexScripts: { created: 3, reused: 0, refused: [] } });
  const restored = landed.ok ? landed.presetId : undefined;
  if (restored === undefined) {
    throw new Error("the export did not land");
  }
  expect(await attachedOf(b.root, b.target, restored)).toEqual(attached);
  expect(await targetCaller.preset.importFile({ fileText: exported.fileText, fileName: exported.filename })).toMatchObject({
    ok: true,
    created: false,
    presetId: restored,
  });

  // The export reads the owner's own rows only: another account cannot export the preset.
  await expect(targetCaller.preset.exportFile({ id: presetId })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
