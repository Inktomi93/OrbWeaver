import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import type { AppearanceChatStylePickerStory } from "./_appearance-chat-style-picker-stories.tsx";

const STORY = "tests/client/features/chat/components/_appearance-chat-style-picker-stories/AppearanceChatStylePickerStory";
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false, containerWidth: 960 },
  { label: "phone portrait", width: 390, height: 844, isMobile: true, hasTouch: true, containerWidth: 390 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.label} message-style picker`, () => {
    test.use({
      isMobile: viewport.isMobile,
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.hasTouch,
    });

    test("the Document diagram omits the identity treatment its production skin omits", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]));
      await mount<typeof AppearanceChatStylePickerStory>(STORY, { width: viewport.containerWidth });

      const documentSkin = MESSAGE_ROW_SKINS.document;

      const documentDiagram = page.locator('[data-slot="chat-style-preview"][data-chat-style="document"] [data-slot="chat-style-diagram"]');
      await expect(documentDiagram).toBeVisible();
      await expect(documentDiagram).toHaveAttribute("data-header-placement", documentSkin.headerPlacement);
      for (const speaker of [
        { role: "user", kind: "persona" },
        { role: "assistant", kind: "character" },
      ] as const) {
        const expectedAvatarCount = documentSkin.avatarTreatment(speaker.kind) === "none" ? 0 : 1;
        await expect(documentDiagram.locator(`[data-role="${speaker.role}"] [data-slot="chat-style-avatar"]`)).toHaveCount(expectedAvatarCount);
      }
      await expect(documentDiagram.locator('[data-slot="chat-style-header"]')).toHaveCount(documentSkin.actionsRow.identity ? 2 : 0);
      await expect(documentDiagram.locator('[data-slot="chat-style-prose"]')).toHaveCount(2);

      const bubbleDiagram = page.locator('[data-slot="chat-style-preview"][data-chat-style="bubble"] [data-slot="chat-style-diagram"]');
      await expect(bubbleDiagram.locator('[data-slot="chat-style-avatar"]')).toHaveCount(2);
      await expect(bubbleDiagram.locator('[data-slot="chat-style-header"]')).toHaveCount(2);
    });
  });
}
