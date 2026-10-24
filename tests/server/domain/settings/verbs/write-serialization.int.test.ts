// Settings edits and portability imports must share the same per-user write owner.
import { closeDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, freshHeldDb } from "@orb/testkit/node/composed";

test("a held backup import preserves a concurrent section edit while another user keeps writing", async () => {
  const held = await freshHeldDb();
  await using database = new AsyncDisposableStack();
  database.defer(() => closeDb(held.db));
  await using root = await createServerHarness({ db: held.db });
  const owner = await root.principalFor(root.ownerId);
  const neighbor = await root.principalFor((await root.actor()).id);
  await root.services.settings.updateUserSettingsSection({ principal: owner, input: { section: "chat", patch: { offerChoices: false } } });
  await root.services.settings.updateUserSettingsSection({ principal: neighbor, input: { section: "memory", patch: { enabled: false } } });
  const descriptor = root.app.portability.find((entity) => entity.kind === "user-settings");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the user-settings portability descriptor");
  }
  // The backup is a donor account's own export: its larger font, and the chat choice the owner's queued edit flips.
  const donor = await root.principalFor((await root.actor()).id);
  await root.services.settings.updateUserSettingsSection({ principal: donor, input: { section: "appearance", patch: { fontScale: 1.4 } } });
  await root.services.settings.updateUserSettingsSection({ principal: donor, input: { section: "chat", patch: { offerChoices: false } } });
  const exported: Parameters<typeof descriptor.importFile>[1][] = [];
  for await (const written of descriptor.exportAll(donor.userId)) {
    exported.push(written);
  }
  const [file] = exported;
  if (file === undefined) {
    throw new Error("the production export wrote no user-settings file");
  }
  let restoring: ReturnType<typeof descriptor.importFile> | undefined;
  let editing: ReturnType<typeof root.services.settings.updateUserSettingsSection> | undefined;
  const boundary = held.hold(/^update "user_settings"/u);
  try {
    restoring = descriptor.importFile(owner.userId, file);
    await boundary.reached;
    boundary.disarm();
    editing = root.services.settings.updateUserSettingsSection({ principal: owner, input: { section: "chat", patch: { offerChoices: true } } });

    // Another user's complete write advances the native pipeline without waiting on this user's queued edit.
    const neighborView = await root.services.settings.updateUserSettingsSection({
      principal: neighbor,
      input: { section: "memory", patch: { enabled: true } },
    });
    boundary.release();
    const [imported] = await Promise.all([restoring, editing]);
    const current = await root.services.settings.getUserSettings({ principal: owner });
    expect(imported).toMatchObject({ ok: true, created: false });
    expect(current.config.appearance.fontScale).toBe(1.4);
    expect(current.config.chat.offerChoices).toBe(true);
    expect(neighborView.config.memory.enabled).toBe(true);
  } finally {
    boundary.release();
    await Promise.allSettled([restoring, editing]);
  }
});
