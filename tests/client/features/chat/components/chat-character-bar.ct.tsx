// @subject packages/client/src/features/chat/components/chat-character-bar.tsx
// A muted seat's initials stay legible: the seat recedes, and its initials (pseudo-element text axe cannot read) are
// measured from the framebuffer on every avatar pigment, the weakest one included, under every shipped theme.

import { dataThemeOf } from "@orb/client/lib";
import { DATA_THEME_ATTR } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { AA_NORMAL_RATIO } from "@orb/kit/theme-derivation";
import { pixelFilledTextContrast, seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PIGMENT_STEPS = [1, 2, 3, 4, 5] as const;

test("a muted seat's initials clear the text contrast floor on every avatar pigment", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  let chatId: ChatId | null = null;
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    const chat = await host.chat.getChat({ chatId: room.id });
    const [, second] = chat.participants.filter((person) => person.kind === "character");
    if (second !== undefined) {
      await host.chat.setSeatKnobs({ chatId: room.id, participantId: second.id, patch: { disabled: true } });
      chatId = room.id;
      break;
    }
  }
  if (chatId === null) {
    throw new Error("The corpus has no room with two characters");
  }
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(
    page,
    serveCorpusProcedures(host, [
      ...SECTION_PROCEDURES,
      ...SHELL_MOUNT_PROCEDURES,
      ...ROOM_PROCEDURES,
      "notifications.presence",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
  );
  // The pigments derive from the active theme's primary, so the floor is measured under every shipped theme the owner can pick.
  const seeds = (await host.settings.listThemes()).filter((theme) => theme.isSeed);
  expect(seeds.length).toBeGreaterThan(1);
  for (const seed of seeds) {
    await host.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: seed.id } });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    // The shell stamps the seed's palette on the root; Hearth stamps none and paints the base ramp.
    await expect.poll(() => page.locator("html").getAttribute(DATA_THEME_ATTR)).toBe(dataThemeOf(seed));
    // The room paints the strip twice (above the transcript, and a hidden twin inside a short one); the first is the one a reader sees.
    const initials = page.locator('[data-slot="character-chip"][data-muted] [data-slot="avatar-fallback"]').first();
    await expect(initials).toBeVisible();
    for (const step of PIGMENT_STEPS) {
      // The seat's own hue is a hash of its id; walk the production pigment ramp so the weakest tile is always measured.
      await initials.evaluate((tile, hue) => {
        tile.style.backgroundColor = `var(--pigment-avatar-${String(hue)})`;
      }, step);
      const { ratio, describe } = await pixelFilledTextContrast(page, initials);
      expect(ratio, `${seed.name}, pigment ${String(step)}: ${describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
  }
});
