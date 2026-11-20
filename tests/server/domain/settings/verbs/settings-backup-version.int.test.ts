// A settings backup carries the settings version its payload was written at, and an import reads the payload at that
// version, so a choice whose meaning a lift changed comes back as the user left it. A backup from before the stamp has
// no version and reads as the last version before it, so the cleanup lift runs on it.
// @subject packages/server/src/primitives/serde/user-settings/index.ts
// @subject packages/server/src/domain/settings/verbs/import-user-settings.ts
import { USER_SETTINGS_SCHEMA_KIND } from "@orb/contracts/portability";
import { USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { JsonObject } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { failOnExportNote } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { PRE_STAMP_SETTINGS_BACKUPS, preStampBackupObject } from "./pre-stamp-settings-backups.fixtures.ts";

type Principal = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;

const FILENAME = "settings.json";
const envelopeSchema = z.looseObject({ schemaKind: z.string(), schemaVersion: z.int(), settings: z.record(z.string(), z.json()) });

function settingsPort(root: ServerTestHarness): (typeof root.app.portability)[number] {
  const descriptor = root.app.portability.find((entity) => entity.kind === "user-settings");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the user-settings portability descriptor");
  }
  return descriptor;
}

async function exportedText(root: ServerTestHarness, principal: Principal): Promise<string> {
  const texts: string[] = [];
  for await (const file of settingsPort(root).exportAll(principal.userId, failOnExportNote)) {
    texts.push(new TextDecoder().decode(file.bytes));
  }
  const [text] = texts;
  if (text === undefined) {
    throw new Error("the production export wrote no user-settings file");
  }
  return text;
}

async function importInto(root: ServerTestHarness, principal: Principal, text: string): Promise<void> {
  const outcome = await settingsPort(root).importFile(principal.userId, { filename: FILENAME, bytes: new TextEncoder().encode(text) });
  expect(outcome).toMatchObject({ ok: true });
}

/** The recorded owner backup with its namespaces overridden, keeping every other recorded value. */
function withSettings(file: JsonObject, overrides: { readonly chat: JsonObject; readonly appearance: JsonObject }): JsonObject {
  const { settings } = envelopeSchema.parse(file);
  const chat = z.record(z.string(), z.json()).parse(settings["chat"]);
  const appearance = z.record(z.string(), z.json()).parse(settings["appearance"]);
  return { ...file, settings: { ...settings, chat: { ...chat, ...overrides.chat }, appearance: { ...appearance, ...overrides.appearance } } };
}

test("every recorded pre-stamp corpus backup imports with auto-continue off, as its account left it", async () => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  for (const backup of PRE_STAMP_SETTINGS_BACKUPS) {
    const file = preStampBackupObject(backup);
    // Positive control on the input: the recorded file is a pre-stamp v1 file whose chat stores the switch off and a count.
    expect(envelopeSchema.parse(file)).toMatchObject({
      schemaKind: USER_SETTINGS_SCHEMA_KIND,
      schemaVersion: 1,
      settings: { chat: { autoContinue: false, autoContinueRounds: 1 } },
    });
    await importInto(root, owner, backup.text);
    const { config } = await root.services.settings.getUserSettings({ principal: owner });
    expect({ account: backup.account, rounds: config.chat.autoContinueRounds }).toStrictEqual({ account: backup.account, rounds: 0 });
  }
});

test("a pre-stamp backup with every merged choice off imports with each of them still off, and the deepest elevation keeps depth", async () => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  const [recorded] = PRE_STAMP_SETTINGS_BACKUPS;
  if (recorded === undefined) {
    throw new Error("no recorded pre-stamp backup");
  }
  const file = withSettings(preStampBackupObject(recorded), {
    chat: { continueOnSend: false, generateOnEmptySend: true, autoContinue: false, autoContinueRounds: 3, smoothStream: false, smoothStreamCps: 120 },
    appearance: { elevation: "glow", reducedTransparency: "on", blurSurfaces: ["panels", "composer"] },
  });

  await importInto(root, owner, JSON.stringify(file));

  const { config } = await root.services.settings.getUserSettings({ principal: owner });
  expect({
    emptyEnterReplies: config.chat.emptyEnterReplies,
    autoContinueRounds: config.chat.autoContinueRounds,
    smoothStreamCps: config.chat.smoothStreamCps,
    elevation: config.appearance.elevation,
    blurSurfaces: config.appearance.blurSurfaces,
  }).toStrictEqual({ emptyEnterReplies: false, autoContinueRounds: 0, smoothStreamCps: 0, elevation: "ramp", blurSurfaces: [] });
});

test("a backup written now is stamped with the settings version and comes back exactly as exported", async () => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  const users = await (await root.internalCallerFor(root.ownerId)).admin.listUsers();
  const other = users.find((user) => user.id !== root.ownerId);
  if (other === undefined) {
    throw new Error("the corpus has one account");
  }
  const receiver = await root.principalFor(other.id);
  // Values a pre-stamp read would change: no `autoContinue` key reads as off, so a v11 count of 3 would lift to 0.
  await root.services.settings.updateUserSettingsSection({
    principal: owner,
    input: { section: "chat", patch: { autoContinueRounds: 3, emptyEnterReplies: false, smoothStreamCps: 0 } },
  });
  await root.services.settings.updateUserSettingsSection({ principal: owner, input: { section: "appearance", patch: { elevation: "ramp" } } });
  const text = await exportedText(root, owner);
  expect(envelopeSchema.parse(JSON.parse(text)).schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);

  await importInto(root, receiver, text);

  const { config } = await root.services.settings.getUserSettings({ principal: receiver });
  expect({
    autoContinueRounds: config.chat.autoContinueRounds,
    emptyEnterReplies: config.chat.emptyEnterReplies,
    smoothStreamCps: config.chat.smoothStreamCps,
    elevation: config.appearance.elevation,
  }).toStrictEqual({ autoContinueRounds: 3, emptyEnterReplies: false, smoothStreamCps: 0, elevation: "ramp" });
});

test("a backup from a newer settings version is refused by name, not read with today's meaning", async () => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  const text = await exportedText(root, owner);
  const current = envelopeSchema.parse(JSON.parse(text));
  const port = settingsPort(root);

  const accepted = await port.importFile(owner.userId, { filename: FILENAME, bytes: new TextEncoder().encode(text) });
  const newer = await port.importFile(owner.userId, {
    filename: FILENAME,
    bytes: new TextEncoder().encode(JSON.stringify({ ...current, schemaVersion: USER_SETTINGS_SCHEMA_VERSION + 1 })),
  });

  expect(accepted).toMatchObject({ ok: true });
  expect(newer).toMatchObject({ ok: false });
  expect(JSON.stringify(newer)).toMatch(/newer/iu);
});
