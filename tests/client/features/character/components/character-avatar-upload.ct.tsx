// The character hero band's portrait control, through the production character editor: its write is `character.update`, and a
// refusal of it shows on the control's own line. The cases are shared with the persona editor.
// @subject packages/client/src/components/avatar-upload.tsx

import { oversizeUploadMessage } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import { dropOn, watchToastMounts } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CHARACTER_PORTRAIT_NAME } from "#client/features/character/lib/character-names.ts";
import type { AvatarSurface } from "../../../components/_avatar-upload-cases.ts";
import { AVATAR_CASES } from "../../../components/_avatar-upload-cases.ts";
import type { CharacterDraftStatusStory } from "./_draft-status-stories.tsx";

const STORY = "tests/client/features/character/components/_draft-status-stories/CharacterDraftStatusStory";
const EDITOR_READS = [
  "sessions.me",
  "settings.getUserSettings",
  "character.get",
  "preset.get",
  "plugin.listMacros",
  "chat.listChats",
  "regex.listForCharacter",
  "tag.listPendingSuggestions",
] as const;

const SURFACE: AvatarSurface = {
  name: "the character hero band",
  controlName: CHARACTER_PORTRAIT_NAME,
  stage: async ({ page, mount, caller, current, refuseWrite, writeHold }) => {
    const character = await caller.character.create({
      input: createCharacterSchema.parse({
        handle: "avatar-witness",
        name: "Avatar Witness",
        description: "Holds a picture.",
        avatarAssetId: current.assetId,
      }),
    });
    let writeNumber = 0;
    const calls = await routeTrpc(page, {
      ...serveCorpusProcedures(caller, EDITOR_READS),
      ...serveCorpusProcedures(caller, ["character.update"], () => {
        writeNumber += 1;
        if (refuseWrite) {
          return trpcError();
        }
        return writeNumber === 1 ? writeHold : undefined;
      }),
    });
    const component = await mount<typeof CharacterDraftStatusStory>(STORY, { characterId: character.id });
    return {
      control: page.getByRole("button", { name: CHARACTER_PORTRAIT_NAME, exact: true }),
      writes: (): number => calls.count("character.update"),
      storedHash: async (): Promise<string | null> => (await caller.character.get({ characterId: character.id })).avatarHash,
      unmount: () => component.update({ characterId: character.id, mounted: false }),
      remount: () => component.update({ characterId: character.id }),
    };
  },
};

test.use({ viewport: { width: 1440, height: 1000 } });

for (const { title, run } of AVATAR_CASES) {
  test(`${SURFACE.name}: ${title}`, async ({ corpus, mount, page }) => {
    const context = { surface: SURFACE, client: { dropOn, oversizeUploadMessage, watchToastMounts }, signedInConfig: corpus.auth.signedInConfig, page, mount };
    await run(context);
    // Every case ends with the surface still mounted and its avatar control in reach.
    await expect(page.getByRole("button", { name: SURFACE.controlName, exact: true })).toBeVisible();
  });
}
