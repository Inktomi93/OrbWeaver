// The settings backup is shareable: a section outside the share-safe allowlist never leaves in an export and never lands from a file.
// @subject packages/server/src/primitives/serde/user-settings/index.ts
// @subject packages/server/src/domain/settings/verbs/export-user-settings.ts
// @subject packages/server/src/domain/settings/verbs/import-user-settings.ts
import type { PortableFile } from "@orb/contracts/portability";
import type { PresetId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { z } from "zod";

type Principal = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;

const PRIVATE_PROMPT = "share-boundary-private-prompt";
const backupSchema = z.looseObject({ settings: z.record(z.string(), z.unknown()) });

function settingsPort(root: ServerTestHarness): (typeof root.app.portability)[number] {
  const descriptor = root.app.portability.find((entity) => entity.kind === "user-settings");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the user-settings portability descriptor");
  }
  return descriptor;
}

async function exportedFile(root: ServerTestHarness, principal: Principal): Promise<PortableFile> {
  const files: PortableFile[] = [];
  for await (const written of settingsPort(root).exportAll(principal.userId)) {
    files.push(written);
  }
  const [file] = files;
  if (file === undefined) {
    throw new Error("the production export wrote no user-settings file");
  }
  return file;
}

async function writePrivateSections(root: ServerTestHarness, principal: Principal, privatePreset: PresetId): Promise<void> {
  await root.services.settings.updateUserSettingsSection({ principal, input: { section: "imagery", patch: { templates: { character: PRIVATE_PROMPT } } } });
  await root.services.settings.updateUserSettingsSection({ principal, input: { section: "seeds", patch: { defaultPresetId: privatePreset } } });
}

test("an export carries no value from a section outside the share-safe allowlist", async ({ ids }) => {
  const privatePreset = ids.typeId(ID_PREFIX.preset);
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  await writePrivateSections(root, owner, privatePreset);
  const stored = (await root.services.settings.getUserSettings({ principal: owner })).config;
  expect(stored.imagery.templates.character).toBe(PRIVATE_PROMPT);
  expect(stored.seeds.defaultPresetId).toBe(privatePreset);

  const text = new TextDecoder().decode((await exportedFile(root, owner)).bytes);

  expect(text).not.toContain(PRIVATE_PROMPT);
  expect(text).not.toContain(privatePreset);
});

test("an import reads only allowlisted sections from a crafted file", async ({ ids }) => {
  const privatePreset = ids.typeId(ID_PREFIX.preset);
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const donor = await root.principalFor((await root.actor()).id);
  await root.services.settings.updateUserSettingsSection({ principal: donor, input: { section: "chat", patch: { continueOnSend: false } } });
  const file = await exportedFile(root, donor);
  const backup = backupSchema.parse(JSON.parse(new TextDecoder().decode(file.bytes)));
  const crafted = {
    ...backup,
    settings: {
      ...backup.settings,
      imagery: { templates: { character: PRIVATE_PROMPT } },
      seeds: { defaultPresetId: privatePreset },
    },
  };

  const outcome = await settingsPort(root).importFile(owner.userId, { ...file, bytes: new TextEncoder().encode(JSON.stringify(crafted)) });

  expect(outcome).toMatchObject({ ok: true });
  const { config } = await root.services.settings.getUserSettings({ principal: owner });
  expect(config.chat.continueOnSend).toBe(false);
  expect(config.imagery.templates.character).not.toBe(PRIVATE_PROMPT);
  expect(config.seeds.defaultPresetId).not.toBe(privatePreset);
});
