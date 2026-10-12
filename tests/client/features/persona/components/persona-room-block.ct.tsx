// CT: the persona SWITCHER with a room open — the play surface (item 885). Mounts the real You-sheet lens
// (`personaChrome.body("sheet")`) over stubbed reads and proves the ruled writes: a row switch moves the seat
// and the last-played pointer only; the crown moves only the default; the 📌 and the room block's Re-pin move
// only the anchor. The room block names a pin whose player left, and never offers a member the host's verbs.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { makeChatDetail, makeParticipantView } from "@orb/testkit/node/factories/chat-view.ts";
import type { TrpcRecorder, TrpcWireOutput } from "@orb/testkit/node/route-trpc.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { PersonaYouSheetStory } from "../_ct-stories.tsx";

const CHAT_ID = castId<ChatId>("chat_persona_ct");
const NOVA = "persona_nova";
const ORION = "persona_orion";
const ZARA = "persona_zara"; // a MEMBER's persona — never in the viewer's own persona.list

const PERSONAS: TrpcWireOutput<"persona.list"> = [
  { id: NOVA, name: "Nova", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 1, updatedAt: 1 },
  { id: ORION, name: "Orion", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 1, updatedAt: 1 },
];

/** The viewer hosts a solo room, pinned to their own persona. */
const SOLO = makeChatDetail({
  id: CHAT_ID,
  title: "Solo",
  viewerUserId: "user_ct",
  viewerActivePersonaId: NOVA,
  anchorPersonaId: NOVA,
  anchorState: "live",
  viewerIsHost: true,
  viewerOwnedCharacterIds: [],
  participants: [],
  identities: PERSONAS.map((p) => ({ kind: "persona", id: p.id, name: p.name, description: "", avatarHash: null })),
});

/** A second present human plays Zara, and the host pinned HER persona. */
const MULTI: TrpcWireOutput<"chat.getChat"> = {
  ...SOLO,
  anchorPersonaId: ZARA,
  participants: [
    makeParticipantView({ kind: "human", userId: "user_ct", displayName: "You", activePersonaId: NOVA, leftSeq: null }),
    makeParticipantView({ kind: "human", userId: "user_member", displayName: "Rowan", activePersonaId: ZARA, leftSeq: null }),
  ],
  identities: [
    { kind: "persona", id: NOVA, name: "Nova", description: "", avatarHash: null },
    { kind: "persona", id: ORION, name: "Orion", description: "", avatarHash: null },
    { kind: "persona", id: ZARA, name: "Zara", description: "", avatarHash: null },
  ],
};

/** Rowan left; the pin still names Zara (the server's identity producer keeps her name). */
const HELD: TrpcWireOutput<"chat.getChat"> = {
  ...MULTI,
  anchorState: "held",
  participants: [makeParticipantView({ kind: "human", userId: "user_ct", displayName: "You", activePersonaId: NOVA, leftSeq: null })],
};

const MEMBER: TrpcWireOutput<"chat.getChat"> = { ...MULTI, viewerIsHost: false, viewerUserId: "user_member" };

function stub(
  page: Page,
  chat: TrpcWireOutput<"chat.getChat">,
  opts: { showNotifications?: boolean; defaultPersonaId?: string | null } = {},
): Promise<TrpcRecorder> {
  const settings = (): TrpcWireOutput<"settings.getUserSettings"> => ({
    userId: "user_ct",
    schemaVersion: 1,
    config: {
      ...DEFAULT_USER_SETTINGS,
      seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: NOVA, defaultPersonaId: opts.defaultPersonaId ?? null },
      persona: { ...DEFAULT_USER_SETTINGS.persona, showNotifications: opts.showNotifications ?? true },
    },
    updatedAt: 0,
    configUnreadable: null,
  });
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "chat.getChat": () => chat,
    "settings.getUserSettings": settings,
    "settings.updateUserSettingsSection": settings,
    "persona.setActivePersona": () => undefined,
    "chat.setChatAnchorPersona": () => undefined,
    "chat.reattributePersona": () => undefined,
    "chat.listMessages": () => ({ messages: [], identities: [] }),
  });
}

test("a row switch moves the seat and the last-played pointer, never the default or the pin", async ({ mount, page }) => {
  const trpc = await stub(page, SOLO);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);

  await page.getByRole("button", { name: "Switch to Orion", exact: true }).click();

  await expect.poll(() => trpc.lastInput("persona.setActivePersona")?.personaId).toBe(ORION);
  await expect.poll(() => trpc.lastInput("settings.updateUserSettingsSection")?.patch).toEqual({ currentPersonaId: ORION });
  await expect(page.getByTestId("notified")).toHaveText("Now playing as Orion in this chat.");
  await expect.poll(() => trpc.count("chat.setChatAnchorPersona")).toBe(0);
});

test("with showNotifications OFF the switch still writes and stays quiet", async ({ mount, page }) => {
  const trpc = await stub(page, SOLO, { showNotifications: false });
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
  await page.getByRole("button", { name: "Switch to Orion", exact: true }).click();
  await expect.poll(() => trpc.count("persona.setActivePersona")).toBe(1);
  await expect(page.getByTestId("notified")).toHaveText("");
});

test("the host's 📌 on another own row pins the card there; the pressed 📌 unpins", async ({ mount, page }) => {
  const trpc = await stub(page, SOLO);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);

  await page.getByRole("button", { name: "Card is pinned to Nova — press to unpin", exact: true }).click();
  await expect.poll(() => trpc.lastInput("chat.setChatAnchorPersona")).toMatchObject({ chatId: CHAT_ID, personaId: null });
  await expect(page.getByTestId("notified")).toHaveText("Card unpinned.");
});

test("the crown clears the default with a plain notice, no Undo, and never touches the seat", async ({ mount, page }) => {
  const trpc = await stub(page, SOLO, { defaultPersonaId: NOVA });
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);

  await page.getByRole("button", { name: "Nova is your default — press to clear", exact: true }).click();
  await expect.poll(() => trpc.lastInput("settings.updateUserSettingsSection")?.patch).toEqual({ defaultPersonaId: null });
  await expect(page.getByTestId("notified")).toHaveText("Default persona cleared.");
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect.poll(() => trpc.count("persona.setActivePersona")).toBe(0);
});

test("a solo room offers no Re-pin menu: the row 📌 is the whole control", async ({ mount, page }) => {
  await stub(page, SOLO);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
  await expect(page.getByText("Card sees you as Nova")).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-pin…" })).toHaveCount(0);
});

test("the anchor line names a MEMBER-OWNED pin from the chat's identities, with its player", async ({ mount, page }) => {
  await stub(page, MULTI);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);
  await expect(page.getByText("Card's persona: Zara (Rowan)")).toBeVisible();
  await expect(page.getByText("Unknown persona")).toHaveCount(0);
});

test("the host's Re-pin offers only members' personas plus Clear pin, and pins the one picked", async ({ mount, page }) => {
  const trpc = await stub(page, MULTI);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);

  await page.getByRole("button", { name: "Re-pin…" }).click();
  await expect(page.getByRole("menuitem", { name: "Nova" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Clear pin" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Zara (Rowan)" }).click();
  await expect.poll(() => trpc.lastInput("chat.setChatAnchorPersona")?.personaId).toBe(ZARA);
});

test("a held pin says its player is no longer in the room and the card still means them; the host can re-pin", async ({ mount, page }) => {
  const trpc = await stub(page, HELD);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);

  await expect(page.getByText("Zara is no longer in the room. The card still means Zara.")).toBeVisible();
  await page.getByRole("button", { name: "Re-pin…" }).click();
  await page.getByRole("menuitem", { name: "Clear pin" }).click();
  await expect.poll(() => trpc.lastInput("chat.setChatAnchorPersona")).toMatchObject({ personaId: null });
});

test("a MEMBER sees the pin as state only: no Re-pin, no pin toggles, and the switch still moves their seat", async ({ mount, page }) => {
  const trpc = await stub(page, MEMBER);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);

  await expect(page.getByText("Card's persona: Zara (Rowan)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-pin…" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Pin the card to/u })).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to Orion", exact: true }).click();
  await expect.poll(() => trpc.lastInput("persona.setActivePersona")?.personaId).toBe(ORION);
});

// The RESTAMP: one server-resolved scope, no message window read, and its blast radius as visible copy that
// is also the button's description (#2443 — a tooltip is unreadable on a phone).
test("Restamp sends the all-my-rows scope, reads no window, and shows its scope as the control's description", async ({ mount, page }) => {
  const trpc = await stub(page, SOLO);
  await mount(<PersonaYouSheetStory chatId={CHAT_ID} />);

  const restamp = page.getByRole("button", { name: "Restamp my messages to this persona" });
  await expect(restamp).toHaveAccessibleDescription(/Restamps every one of your own lines/u);
  await restamp.click();
  await expect.poll(() => trpc.lastInput("chat.reattributePersona")).toMatchObject({ chatId: CHAT_ID, scope: { kind: "mine" }, personaId: NOVA });
  await expect.poll(() => trpc.count("chat.listMessages")).toBe(0);
  await expect(page.getByTestId("notified")).toHaveText("Your messages in this chat now read as Nova.");
});
