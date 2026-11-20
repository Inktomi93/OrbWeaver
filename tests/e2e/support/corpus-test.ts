// Every corpus browser case selects its native viewer preference before the flow starts.

import { authMeSchema, CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { Page, TestInfo } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { z } from "zod";
import { loginLocal } from "./actors.ts";
import { waitForAppReady } from "./chat-room.ts";
import { openConfigGroup } from "./config-flow.ts";
import { CORPUS_LOCAL_PASSWORDS, SELECTED_LOCAL_CORPUS_FIXTURE } from "./modes.ts";
import { createTrpcClient } from "./trpc.ts";

export { expect } from "@playwright/test";

interface CorpusFixtures {
  /** A page that has navigated nowhere, on a context that has loaded nothing. */
  readonly coldPage: Page;
}

/** Write this project's chat style, if it has one, and read it back. */
async function selectChatStyle(baseURL: string, info: TestInfo): Promise<ThemeChatStyle | undefined> {
  const selected: unknown = info.project.metadata["chatStyle"];
  if (selected === undefined) {
    return undefined;
  }
  const chatStyle = z.enum(THEME_CHAT_STYLES).parse(selected);
  const owner = SELECTED_LOCAL_CORPUS_FIXTURE?.wire.reads["sessions.me"][0]?.output;
  const localPassword = CORPUS_LOCAL_PASSWORDS.owner;
  const client =
    info.project.metadata["authMode"] === "local" && owner !== undefined && localPassword !== undefined
      ? (await loginLocal(baseURL, viewerViewSchema.parse(owner).handle, localPassword)).trpc
      : createTrpcClient(baseURL);
  await client.settings.updateUserSettingsSection.mutate({ section: "appearance", patch: { chatStyle } });
  expect((await client.settings.getUserSettings.query(undefined)).config.appearance.chatStyle).toBe(chatStyle);
  return chatStyle;
}

export const test = base.extend<CorpusFixtures>({
  context: async ({ context, baseURL }, use, info) => {
    if (info.project.metadata["authMode"] === "local" && SELECTED_LOCAL_CORPUS_FIXTURE !== undefined) {
      const owner = SELECTED_LOCAL_CORPUS_FIXTURE.wire.reads["sessions.me"][0]?.output;
      const password = CORPUS_LOCAL_PASSWORDS.owner;
      if (owner === undefined || password === undefined) {
        throw new Error("Corpus local browser requires its captured owner and fresh password");
      }
      const login = await context.request.post("/api/auth/login", { form: { handle: owner.handle, password }, headers: { [CSRF_HEADER]: "1" } });
      const me = await context.request.get(`${baseURL}/api/auth/me`, { headers: { forwarded: "" } });
      const identity = authMeSchema.parse(await me.json());
      const sessionResponse = await context.request.get("/api/trpc/sessions.me", { headers: { forwarded: "", [CSRF_HEADER]: "1" } });
      const session = z.object({ result: z.object({ data: viewerViewSchema }) }).parse(await sessionResponse.json()).result.data;
      if (
        !(login.ok() && me.ok() && identity.authenticated) ||
        identity.handle !== owner.handle ||
        identity.role !== owner.globalRole ||
        session.userId !== owner.userId ||
        session.handle !== owner.handle ||
        session.globalRole !== owner.globalRole
      ) {
        throw new Error("Corpus browser cookie did not admit its captured owner");
      }
    }
    await use(context);
  },
  page: async ({ page, baseURL }, use, info) => {
    const chatStyle = await selectChatStyle(baseURL ?? "", info);
    if (chatStyle === undefined) {
      await use(page);
      return;
    }
    await openConfigGroup(page, "appearance");
    const radio = page.getByRole("radio").filter({ has: page.locator(`[data-chat-style="${chatStyle}"]`) });
    await expect(radio).toBeChecked();
    await page.goto("/home");
    await waitForAppReady(page);
    await use(page);
  },
  // Selecting the style goes through the settings door, so a case that watches the first navigation sees all of it.
  coldPage: async ({ context, baseURL }, use, info) => {
    await selectChatStyle(baseURL ?? "", info);
    await using page = await context.newPage();
    await use(page);
  },
});
