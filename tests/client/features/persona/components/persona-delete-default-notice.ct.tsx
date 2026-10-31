// Deleting the default persona moves the crown; the notice that says so follows the persona notifications setting.
import { ROW_DELETE_NAME } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { nowDefaultNotice } from "#client/features/persona/lib/persona-copy.ts";
import type { PersonaActionGroupsStory } from "./_persona-action-groups-stories.tsx";

// Longer than the notice takes to mount on a loaded box; the positive case proves it appears inside this window.
const NOTICE_BEAT_MS = 1000;
const STORY = "tests/client/features/persona/components/_persona-action-groups-stories/PersonaActionGroupsStory";

for (const shown of [true, false]) {
  test(`deleting the default persona ${shown ? "raises" : "raises no"} the new-default notice with notifications ${shown ? "on" : "off"}`, async ({
    mount,
    page,
  }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "persona", patch: { showNotifications: shown } });
    const survivor = await caller.persona.create({ input: { name: "Survivor witness", description: "Stays." } });
    const doomed = await caller.persona.create({ input: { name: "Doomed default witness", description: "Goes." } });
    await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { currentPersonaId: survivor.id, defaultPersonaId: doomed.id } });
    await routeTrpc(
      page,
      serveCorpusProcedures(caller, [
        "sessions.me",
        "settings.getUserSettings",
        "persona.list",
        "persona.get",
        "persona.remove",
        "worldInfo.listBooks",
        "worldInfo.listForPersona",
        "persona.listConnectedCharacters",
        "preset.get",
      ]),
    );
    // A notice leaves the page again within the beat, so its appearance is recorded as it happens.
    await page.addInitScript((text) => {
      Reflect.set(globalThis, "__noticeSeen", false);
      new MutationObserver(() => {
        if (document.body.textContent.includes(text)) {
          Reflect.set(globalThis, "__noticeSeen", true);
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    }, nowDefaultNotice(survivor.name));
    await mount<typeof PersonaActionGroupsStory>(STORY, { width: 1280, appearance });
    await page.getByRole("button", { name: `Show details for ${doomed.name}`, exact: true }).focus();
    await page.keyboard.press("Enter");
    const editor = page.getByRole("group", { name: `Edit ${doomed.name}`, exact: true });
    await editor.locator('[data-slot="persona-editor-footer"]').getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete this persona?", exact: true });
    await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
    // The handler closes the editor, then raises its notice in the same tick, so a hidden editor means the notice is decided.
    await expect(editor).toBeHidden();
    // The notice mounts a beat after the call that raises it, so an absence is read after the beat the positive case needs.
    await page.evaluate((beat) => new Promise((resolve) => setTimeout(resolve, beat)), NOTICE_BEAT_MS);
    expect((await caller.persona.list()).some((persona) => persona.id === doomed.id)).toBe(false);
    expect(await page.evaluate(() => Reflect.get(globalThis, "__noticeSeen") as boolean)).toBe(shown);
  });
}
