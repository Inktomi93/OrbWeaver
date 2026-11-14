// @subject packages/client/src/features/chat/components/message-reactions.tsx
// The design audit's contrast rule reads the room's reaction pill (pressed by the viewer, so it paints the selected fill) and its
// character chips (one of them muted) on every shipped theme, and judges them: a pill whose count loses its ink is reported.

import { dataThemeOf } from "@orb/client/lib";
import { DATA_THEME_ATTR } from "@orb/client/state";
import { REACTION_EMOJIS } from "@orb/contracts/chat";
import type { ChatId, MessageVariantId } from "@orb/kit/ids";
import { readSurfaceDesignAudit, seedShellState } from "@orb/testkit/browser/spec";
import { ROOM_PROCEDURES, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const PILL = '[data-slot="message-reaction-pill"]';
const CHIP = '[data-slot="character-chip"]';
const REACTION = REACTION_EMOJIS[0];

function onTheRoomsControls(selector: string): boolean {
  return selector.includes("message-reaction-pill") || selector.includes("character-chip");
}

test("the reaction pill and the character chips clear the contrast rule on every shipped theme", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const host = await root.internalCallerFor(root.ownerId);
  let target: { readonly chatId: ChatId; readonly variantId: MessageVariantId } | null = null;
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    const chat = await host.chat.getChat({ chatId: room.id });
    const [, second] = chat.participants.filter((person) => person.kind === "character");
    // The transcript opens at its newest rows, so the reacted message is the last one the room holds.
    const message = (await host.chat.listMessages({ chatId: room.id })).messages.at(-1);
    if (second !== undefined && message !== undefined && chat.viewerIsHost) {
      await host.chat.setSeatKnobs({ chatId: room.id, participantId: second.id, patch: { disabled: true } });
      await host.chat.toggleReaction({ chatId: room.id, variantId: message.selectedVariantId, emoji: REACTION });
      target = { chatId: room.id, variantId: message.selectedVariantId };
      break;
    }
  }
  if (target === null) {
    throw new Error("The corpus has no hosted room with two characters and a message");
  }
  const { chatId, variantId } = target;
  expect((await host.chat.listReactions({ chatId })).groups.some((group) => group.variantId === variantId)).toBe(true);
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
  const seeds = (await host.settings.listThemes()).filter((theme) => theme.isSeed);
  expect(seeds.length).toBeGreaterThan(1);
  for (const seed of seeds) {
    await host.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: seed.id } });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId: target.chatId });
    await expect.poll(() => page.locator("html").getAttribute(DATA_THEME_ATTR)).toBe(dataThemeOf(seed));
    await expect(page.locator(PILL).first()).toBeVisible();
    await expect(page.locator(`${CHIP}[data-muted] [data-slot="avatar-fallback"]`).first()).toBeVisible();
    const audited = await readSurfaceDesignAudit(page);
    const judged = audited.audit.populationAccounting.contrast;
    expect(judged?.judged ?? 0, `${seed.name}: the rule judged no text`).toBeGreaterThan(0);
    expect(judged?.withheld, `${seed.name}: the rule left text unjudged`).toEqual({});
    const failing = audited.audit.findings.filter(({ rule, selector }) => rule === "contrast" && onTheRoomsControls(selector));
    expect(failing, `${seed.name}: ${failing.map(({ selector, value }) => `${selector} ${value}`).join(" | ")}`).toEqual([]);
    // The rule reads these controls: a pill whose ink fades into its fill is a finding on that pill.
    const fade = await page.addStyleTag({ content: `[data-slot="message-reactions"] { opacity: 0.45; }` });
    const faded = await readSurfaceDesignAudit(page);
    expect(faded.audit.findings.some(({ rule, selector }) => rule === "contrast" && selector.includes("message-reaction-pill"))).toBe(true);
    await fade.evaluate((style) => style.parentNode?.removeChild(style));
  }
});
