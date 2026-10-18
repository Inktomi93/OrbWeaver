// Every corpus browser case selects its native viewer preference before the flow starts.

import { authMeSchema, CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { test as base, expect } from "@playwright/test";
import { z } from "zod";
import { loginLocal } from "./actors.ts";
import { waitForAppReady } from "./chat-room.ts";
import { openConfigGroup } from "./config-flow.ts";
import { CORPUS_LOCAL_PASSWORDS, SELECTED_LOCAL_CORPUS_FIXTURE } from "./modes.ts";
import { createTrpcClient } from "./trpc.ts";

export { expect } from "@playwright/test";

export const test = base.extend({
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
      const sessionResponse = await context.request.get("/api/trpc/sessions.me", { headers: { forwarded: "" } });
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
    const selected = info.project.metadata["chatStyle"];
    if (selected === undefined) {
      await use(page);
      return;
    }
    const chatStyle = z.enum(THEME_CHAT_STYLES).parse(selected);
    const owner = SELECTED_LOCAL_CORPUS_FIXTURE?.wire.reads["sessions.me"][0]?.output;
    const localPassword = CORPUS_LOCAL_PASSWORDS.owner;
    const client =
      info.project.metadata["authMode"] === "local" && owner !== undefined && localPassword !== undefined
        ? (await loginLocal(baseURL ?? "", viewerViewSchema.parse(owner).handle, localPassword)).trpc
        : createTrpcClient(baseURL ?? "");
    await client.settings.updateUserSettingsSection.mutate({ section: "appearance", patch: { chatStyle } });
    await openConfigGroup(page, "appearance");
    const radio = page.getByRole("radio").filter({ has: page.locator(`[data-chat-style="${chatStyle}"]`) });
    await expect(radio).toBeChecked();
    expect((await client.settings.getUserSettings.query(undefined)).config.appearance.chatStyle).toBe(chatStyle);
    await page.goto("/home");
    await waitForAppReady(page);
    await use(page);
  },
});
