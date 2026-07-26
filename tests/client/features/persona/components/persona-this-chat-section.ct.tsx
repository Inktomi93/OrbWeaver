// CT: the "This chat" persona section (Phase B ⑥b — persona-this-chat-section.tsx). Proves the persona
// switch fires `persona.setActivePersona` (the mutation), and that the confirming toast HONORS the
// per-user `persona.showNotifications` setting (was stored-but-ignored): ON ⇒ a toast; OFF ⇒ no toast.
// The active chat is seeded by the story (`selectChat`) so the section renders.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { PersonaThisChatStory } from "../_ct-stories";

const CHAT_ID = "chat_persona_ct"; // matches the story's seeded active chat
const NOVA = "persona_nova";
const ORION = "persona_orion";

const PERSONAS = [
  { id: NOVA, name: "Nova", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 1, updatedAt: 1 },
  { id: ORION, name: "Orion", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 1, updatedAt: 1 },
];

const CHAT = {
  id: CHAT_ID,
  viewerUserId: "user_ct",
  viewerActivePersonaId: NOVA,
  anchorPersonaId: NOVA,
  viewerIsHost: true,
  participants: [],
};

const UPDATE_PROC = "persona.setActivePersona";

function stub(page: Page, showNotifications: boolean): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "chat.getChat": () => CHAT,
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, persona: { ...DEFAULT_USER_SETTINGS.persona, showNotifications } },
      updatedAt: 0,
    }),
    [UPDATE_PROC]: () => ({}),
  });
}

/** Switch the "Playing as" persona from Nova → Orion. */
async function switchToOrion(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Nova" }).click(); // the "Playing as" menu trigger shows the active persona
  await page.getByRole("menuitem", { name: "Orion" }).click();
}

test("switching the chat persona fires setActivePersona with the new persona id", async ({ mount, page }) => {
  const trpc = await stub(page, true);
  await mount(<PersonaThisChatStory />);
  await switchToOrion(page);
  await expect.poll(() => (trpc.lastInput(UPDATE_PROC) as { personaId?: string } | undefined)?.personaId, { intervals: [20, 50, 100] }).toBe(ORION);
});

// The confirming notify is observed via the story's DOM sink (bindNotify is main.tsx-only, so the toast
// surface itself is unbound in the CT harness — the sink is the honest observation point).
test("with showNotifications ON, a confirming notify fires on switch", async ({ mount, page }) => {
  await stub(page, true);
  await mount(<PersonaThisChatStory />);
  await switchToOrion(page);
  await expect(page.getByTestId("notified")).toHaveText("Now playing as Orion in this chat.");
});

test("with showNotifications OFF, no notify fires on switch (the setting is honored)", async ({ mount, page }) => {
  const trpc = await stub(page, false);
  await mount(<PersonaThisChatStory />);
  await switchToOrion(page);
  // The mutation still fires — the notify is what's gated.
  await expect.poll(() => (trpc.lastInput(UPDATE_PROC) as { personaId?: string } | undefined)?.personaId, { intervals: [20, 50, 100] }).toBe(ORION);
  await expect(page.getByTestId("notified")).toHaveText("");
});
