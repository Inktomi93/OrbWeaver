// CT: the "This chat" persona section (Phase B ⑥b — persona-this-chat-section.tsx). Proves the persona
// switch fires `persona.setActivePersona` (the mutation), and that the confirming toast HONORS the
// per-user `persona.showNotifications` setting (was stored-but-ignored): ON ⇒ a toast; OFF ⇒ no toast.
// The active chat is seeded by the story (`selectChat`) so the section renders.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { PersonaId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { PersonaThisChatStory } from "../_ct-stories.tsx";

const CHAT_ID = "chat_persona_ct"; // matches the story's seeded active chat
const NOVA = "persona_nova";
const ORION = "persona_orion";

const PERSONAS = [
  { id: NOVA, name: "Nova", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 1, updatedAt: 1 },
  { id: ORION, name: "Orion", title: null, description: "", starred: false, avatarAssetId: null, avatarHash: null, metadata: null, createdAt: 1, updatedAt: 1 },
];

const ZARA = "persona_zara"; // a MEMBER's persona — never in the viewer's own persona.list

/** A base chat detail: the viewer hosts a solo room, anchored on their own persona. `macroNames` is the
 *  member-gated name producer every real `chat.getChat` payload carries (Chat-Macro-Resolution §1). */
const CHAT = {
  id: CHAT_ID,
  viewerUserId: "user_ct",
  viewerActivePersonaId: NOVA,
  anchorPersonaId: NOVA,
  viewerIsHost: true,
  participants: [],
  macroNames: { characterNames: [], personaNames: PERSONAS.map((p) => ({ id: p.id, name: p.name, description: "" })) },
};

/** The MULTI-HUMAN room: a second present human plays "Zara", and the host has pinned HER persona as the
 *  chat anchor — the exact state `setChatAnchorPersona` permits and the widened resolver now renders. */
const MULTI_HUMAN_CHAT = {
  ...CHAT,
  anchorPersonaId: ZARA,
  participants: [
    { kind: "human", userId: "user_ct", displayName: "You", activePersonaId: NOVA, leftSeq: null },
    { kind: "human", userId: "user_member", displayName: "Rowan", activePersonaId: ZARA, leftSeq: null },
  ],
  macroNames: {
    characterNames: [],
    personaNames: [...CHAT.macroNames.personaNames, { id: ZARA, name: "Zara", description: "" }],
  },
};

const UPDATE_PROC = "persona.setActivePersona";
const RESTAMP_PROC = "chat.reattributePersona";

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
    [RESTAMP_PROC]: () => ({}),
    // Present so a window read would SUCCEED if one were fired — the "no window read" assertion below is
    // then about the client's shape, not about a stub that would have failed anyway.
    "chat.listMessages": () => ({ messages: [], hasMore: false }),
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
  await expect.poll(() => (trpc.lastInput(UPDATE_PROC) as { personaId?: PersonaId } | undefined)?.personaId, { intervals: [20, 50, 100] }).toBe(ORION);
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
  await expect.poll(() => (trpc.lastInput(UPDATE_PROC) as { personaId?: PersonaId } | undefined)?.personaId, { intervals: [20, 50, 100] }).toBe(ORION);
  await expect(page.getByTestId("notified")).toHaveText("");
});

// ── The RESTAMP affordance (stickler Q3 / FINAL-Persona §A.7). It used to page `chat.listMessages` for the
// last 100 rows and send the ids it found there, so a wrong-persona stretch older than the window could not be
// repaired AT ALL — the defect was invisible in the UI (the button "worked"). The scope is now named on the
// wire and resolved server-side, which is observable exactly here: ONE bulk call, and no window read.

test("Restamp sends the server-resolved all-my-rows scope — and reads no message window to build it", async ({ mount, page }) => {
  const trpc = await stub(page, true);
  await mount(<PersonaThisChatStory />);

  await page.getByRole("button", { name: "Restamp my messages to this persona" }).click();

  await expect
    .poll(() => trpc.lastInput(RESTAMP_PROC), { intervals: [20, 50, 100] })
    .toMatchObject({
      chatId: CHAT_ID,
      scope: { kind: "mine" },
      personaId: NOVA,
    });
  // No `messageIds` anywhere on the wire: the client no longer enumerates rows it cannot fully page.
  expect(trpc.lastInput(RESTAMP_PROC)).not.toHaveProperty("scope.messageIds"); // ONESHOT-OK: settled — the poll above already resolved this exact input
  // The window read is a NEGATIVE, and it is settled: the old client fetched it BEFORE mutating, so by the
  // time the mutation input polled above exists, a window read would already have been recorded.
  expect(trpc.count("chat.listMessages")).toBe(0); // ONESHOT-OK: settled — the restamp call the poll awaited strictly follows any window read
});

test("the restamp's confirming notify honors persona.showNotifications (ON ⇒ a toast; OFF ⇒ none)", async ({ mount, page }) => {
  await stub(page, true);
  await mount(<PersonaThisChatStory />);
  await page.getByRole("button", { name: "Restamp my messages to this persona" }).click();
  await expect(page.getByTestId("notified")).toHaveText("Your messages in this chat now read as Nova.");
});

test("with showNotifications OFF, the restamp still fires and stays quiet", async ({ mount, page }) => {
  const trpc = await stub(page, false);
  await mount(<PersonaThisChatStory />);
  await page.getByRole("button", { name: "Restamp my messages to this persona" }).click();
  await expect.poll(() => trpc.count(RESTAMP_PROC), { intervals: [20, 50, 100] }).toBe(1);
  await expect(page.getByTestId("notified")).toHaveText("");
});

// ── R2: the ROOM-PLANE surfaces (review F6). A persona the ROOM references is not always a persona the
// VIEWER owns — the anchor row resolved names against `persona.list` alone, so a host-pinned member-owned
// anchor read "Unknown persona" while the correct name sat on the same chat payload; and the Re-pin menu
// could only offer the host's OWN personas, though the verb has always accepted any present human's (and,
// since the resolver widened, such a pin actually resolves). The verb also accepts `personaId: null`, which
// had no affordance at all.

/** Stub with an explicit chat payload (the multi-human arms need their own). */
function stubChat(page: Page, chat: unknown): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "chat.getChat": () => chat,
    "settings.getUserSettings": () => ({
      userId: "user_ct",
      schemaVersion: 1,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: 0,
    }),
    "chat.setChatAnchorPersona": () => ({}),
  });
}

test("the anchor row names a MEMBER-OWNED pin from the chat's name producer, not the viewer's persona list", async ({ mount, page }) => {
  await stubChat(page, MULTI_HUMAN_CHAT);
  await mount(<PersonaThisChatStory />);

  // Zara is nowhere in `persona.list` — the viewer only owns Nova/Orion.
  await expect(page.getByText("Card sees you as Zara")).toBeVisible();
  await expect(page.getByText("Unknown persona")).toHaveCount(0);
});

test("the host's Re-pin menu offers each present MEMBER's persona (grouped) and a Clear pin", async ({ mount, page }) => {
  const trpc = await stubChat(page, MULTI_HUMAN_CHAT);
  await mount(<PersonaThisChatStory />);

  await page.getByRole("button", { name: "Re-pin" }).click();
  await expect(page.getByRole("menuitem", { name: "Nova" })).toBeVisible(); // the host's own, as before
  const memberItem = page.getByRole("menuitem", { name: "Zara (Rowan)" });
  await expect(memberItem).toBeVisible(); // …and the member's, attributed to them

  await memberItem.click();
  await expect.poll(() => (trpc.lastInput("chat.setChatAnchorPersona") as { personaId?: PersonaId | null } | undefined)?.personaId).toBe(ZARA);
});

test("Clear pin sends the verb's null arm (the pin could be moved but never removed)", async ({ mount, page }) => {
  const trpc = await stubChat(page, MULTI_HUMAN_CHAT);
  await mount(<PersonaThisChatStory />);

  await page.getByRole("button", { name: "Re-pin" }).click();
  await page.getByRole("menuitem", { name: "Clear pin" }).click();

  await expect.poll(() => trpc.lastInput("chat.setChatAnchorPersona") as { personaId?: PersonaId | null } | undefined).toMatchObject({ personaId: null });
});

test("a SOLO room's menu renders no members' group (the affordance appears only when it can act)", async ({ mount, page }) => {
  await stubChat(page, CHAT);
  await mount(<PersonaThisChatStory />);

  await page.getByRole("button", { name: "Re-pin" }).click();
  await expect(page.getByText("Members' personas")).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Clear pin" })).toBeVisible();
});

// MEMBER-PERSONA-SWITCH. The reported symptom is "a member cannot change which persona they play once inside
// a room". The switch is VIEWER-SCOPED and ungated by construction — it reads `viewerActivePersonaId` and
// writes through `persona.setActivePersona`, whose verb defaults its target to the caller — but NOTHING
// pinned that: every arm above mounts `viewerIsHost: true`, so the member seat had zero coverage and a gate
// could have appeared on it silently, exactly as one appeared on the anchor. These are that pin.
const MEMBER_CHAT = {
  ...MULTI_HUMAN_CHAT,
  viewerIsHost: false,
  viewerUserId: "user_member",
  viewerActivePersonaId: NOVA,
};

/** The member's stub — their own `persona.list`, their own settings, and the section's write. */
function stubMember(page: Page, procs: Record<string, () => unknown> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "persona.list": () => PERSONAS,
    "chat.getChat": () => MEMBER_CHAT,
    "settings.getUserSettings": () => ({ userId: "user_member", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    ...procs,
  });
}

test("a MEMBER sees the same Playing-as switch, and it fires for their own seat", async ({ mount, page }) => {
  const trpc = await stubMember(page, { [UPDATE_PROC]: () => ({}) });
  await mount(<PersonaThisChatStory />);

  await switchToOrion(page);
  await expect.poll(() => (trpc.lastInput(UPDATE_PROC) as { personaId?: PersonaId } | undefined)?.personaId, { intervals: [20, 50, 100] }).toBe(ORION);
});

test("a MEMBER gets no Re-pin control — the ANCHOR is the only host-gated thing in this section", async ({ mount, page }) => {
  await stubMember(page);
  await mount(<PersonaThisChatStory />);

  // Present: the member's own switch, and the read-only anchor line.
  await expect(page.getByRole("button", { name: "Nova" })).toBeVisible();
  await expect(page.getByText("Card sees you as Zara")).toBeVisible();
  // Absent: the host-only re-pin.
  await expect(page.getByRole("button", { name: "Re-pin" })).toHaveCount(0);
});
