// The persona editor's avatar control, through the production editor in the Personas settings list: its write is `persona.update`,
// and a refusal of it shows on the control's failure line under the identity row. The cases are shared with the character hero band.
// @subject packages/client/src/components/avatar-upload.tsx

import { oversizeUploadMessage } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { dragFileOver, dropOn, pageCanHover, readRefusalLine, watchToastMounts } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { AVATAR_CONTROL_NAME } from "#client/lib/avatar-upload-copy.ts";
import type { AvatarSurface } from "../../../components/_avatar-upload-cases.ts";
import { AVATAR_AFFORDANCE_CASES, AVATAR_CASES, AVATAR_LAYOUT_CASES, AVATAR_TOUCH_CASES } from "../../../components/_avatar-upload-cases.ts";
import type { PersonaActionGroupsStory } from "./_persona-action-groups-stories.tsx";

const STORY = "tests/client/features/persona/components/_persona-action-groups-stories/PersonaActionGroupsStory";
const PERSONA_NAME = "Avatar witness";
const DESKTOP_WIDTH_PX = 1280;
const EDITOR_READS = [
  "sessions.me",
  "settings.getUserSettings",
  "persona.list",
  "persona.get",
  "worldInfo.listBooks",
  "worldInfo.listForPersona",
  "persona.listConnectedCharacters",
  "preset.get",
  "plugin.listMacros",
] as const;

const SURFACE: AvatarSurface = {
  name: "the persona editor",
  controlName: AVATAR_CONTROL_NAME,
  stage: async ({ page, mount, caller, current, refuseWrite, writeHold, width }) => {
    const persona = await caller.persona.create({ input: { name: PERSONA_NAME, description: "Holds a picture." } });
    await caller.persona.update({ personaId: persona.id, input: { avatarAssetId: current.assetId } });
    let writeNumber = 0;
    const calls = await routeTrpc(page, {
      ...serveCorpusProcedures(caller, EDITOR_READS),
      ...serveCorpusProcedures(caller, ["persona.update"], () => {
        writeNumber += 1;
        if (refuseWrite) {
          return trpcError();
        }
        return writeNumber === 1 ? writeHold : undefined;
      }),
    });
    await mount<typeof PersonaActionGroupsStory>(STORY, { width: width ?? DESKTOP_WIDTH_PX, appearance: appearanceSettingsSchema.parse({}) });
    const show = page.getByRole("button", { name: `Show details for ${persona.name}`, exact: true });
    await show.focus();
    await page.keyboard.press("Enter");
    const editor = page.getByRole("group", { name: `Edit ${persona.name}`, exact: true });
    return {
      control: editor.getByRole("button", { name: AVATAR_CONTROL_NAME, exact: true }),
      identity: editor.locator('[data-slot="persona-editor-identity"]'),
      writes: (): number => calls.count("persona.update"),
      storedHash: async (): Promise<string | null> => (await caller.persona.get({ personaId: persona.id })).avatarHash,
      unmount: () => page.getByRole("button", { name: `Hide details for ${persona.name}`, exact: true }).click(),
      remount: () => show.click(),
    };
  },
};

const CLIENT = { dragFileOver, dropOn, oversizeUploadMessage, pageCanHover, readRefusalLine, watchToastMounts };

test.use({ viewport: { width: 1440, height: 1000 } });

for (const { title, run } of [...AVATAR_CASES, ...AVATAR_LAYOUT_CASES, ...AVATAR_AFFORDANCE_CASES]) {
  test(`${SURFACE.name}: ${title}`, async ({ corpus, mount, page }) => {
    const context = { surface: SURFACE, client: CLIENT, signedInConfig: corpus.auth.signedInConfig, page, mount };
    await run(context);
    // Every case ends with the surface still mounted and its avatar control in reach.
    await expect(page.getByRole("button", { name: SURFACE.controlName, exact: true })).toBeVisible();
  });
}

test.describe("on a device that cannot hover", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const { title, run } of AVATAR_TOUCH_CASES) {
    test(`${SURFACE.name}: ${title}`, async ({ corpus, mount, page }) => {
      await run({ surface: SURFACE, client: CLIENT, signedInConfig: corpus.auth.signedInConfig, page, mount });
      await expect(page.getByRole("button", { name: SURFACE.controlName, exact: true })).toBeVisible();
    });
  }
});
