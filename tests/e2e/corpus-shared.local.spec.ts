// Two native local cookies read the same committed corpus room, with role-specific rendered controls.

import { renderMessageForDisplay } from "@orb/client/lib";
import { authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { devices } from "@playwright/test";
import { z } from "zod";
import { loginLocal } from "./support/actors.ts";
import { openChatByTitle, waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { BROWSER_PROJECTS, CORPUS_LOCAL_PASSWORDS, SELECTED_LOCAL_CORPUS_FIXTURE } from "./support/modes.ts";

test("a second corpus human opens shared history without gaining host or admin controls", { tag: "@smoke" }, async ({ page, browser, baseURL }, info) => {
  const wire = SELECTED_LOCAL_CORPUS_FIXTURE?.wire;
  const human = wire?.memberIdentities?.sharedMember.viewer;
  const password = CORPUS_LOCAL_PASSWORDS.member;
  const room = wire?.reads["chat.getChat"].find(({ output }) => output.participants.some((participant) => participant.userId === human?.userId))?.output;
  if (human === undefined || password === undefined || room === undefined || room.title === null) {
    throw new Error("Shared corpus smoke requires its captured human, room and run-owned password");
  }
  const member = await loginLocal(baseURL ?? "", human.handle, password);
  await member.trpc.settings.updateUserSettingsSection.mutate({
    section: "appearance",
    patch: { chatStyle: z.enum(THEME_CHAT_STYLES).parse(info.project.metadata["chatStyle"]) },
  });
  const detail = await member.trpc.chat.getChat.query({ chatId: room.id });
  expect(detail.viewerUserId).toBe(human.userId);
  expect(detail.viewerIsHost).toBe(false);
  const history = await member.trpc.chat.listMessages.query({ chatId: room.id, limit: 30 });
  const last = history.messages.findLast((message) => message.content.trim().length > 0);
  if (last === undefined) {
    throw new Error("Shared corpus room has no visible history");
  }
  const rendered = renderMessageForDisplay(
    last.content,
    {
      characterNamesById: new Map<CharacterId, RowCharacterName>(),
      personaNamesById: new Map<PersonaId, RowPersonaName>(),
      displayScripts: [
        ...(await member.trpc.regex.listRoomDisplayScripts.query({ chatId: room.id })),
        ...(await member.trpc.regex.listScripts.query(undefined)),
      ],
    },
    last.characterId,
    last.personaId,
  );
  const project = BROWSER_PROJECTS.find(({ name }) => name === info.project.name);
  if (project === undefined) {
    throw new Error("Shared corpus browser has no native device project");
  }
  const second = await browser.newContext({ ...devices[project.device], baseURL: baseURL ?? "", locale: "en-US", timezoneId: "UTC" });
  try {
    const login = await second.request.post("/api/auth/login", { form: { handle: human.handle, password }, headers: { [CSRF_HEADER]: "1" } });
    expect(login.ok()).toBe(true);
    const me = await second.request.get("/api/auth/me", { headers: { forwarded: "" } });
    expect(authMeSchema.parse(await me.json())).toMatchObject({ authenticated: true, handle: human.handle, role: human.globalRole });
    const memberPage = await second.newPage();
    await openChatByTitle(page, room.title);
    await openChatByTitle(memberPage, room.title);
    await expect(memberPage.locator(`[data-message-id="${last.id}"]`)).toContainText(rendered);
    const hostEntry = page.getByRole("button", { name: /^Members /u });
    const memberEntry = memberPage.getByRole("button", { name: /^Members /u });
    await hostEntry.click();
    await memberEntry.click();
    await expect(page.getByRole("button", { name: "Invite people", exact: true })).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Invite people", exact: true })).toHaveCount(0);
    await memberPage.goto("/config");
    await waitForAppReady(memberPage);
    await expect(memberPage.locator('button[data-config-group="about"]')).toBeVisible();
    await expect(memberPage.locator('button[data-config-group="admin"]')).toHaveCount(0);
    await memberPage.reload();
    await waitForAppReady(memberPage);
    await openChatByTitle(memberPage, room.title);
    await expect(memberPage.locator(`[data-message-id="${last.id}"]`)).toContainText(rendered);
  } finally {
    await second.close();
  }
});
