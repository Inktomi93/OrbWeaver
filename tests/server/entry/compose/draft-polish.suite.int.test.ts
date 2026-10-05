import "../../../support/composed-real.ts";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { connectionBindings, userConnections } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("a plain user's visible Polish replacement reaches persisted canon byte-for-byte through the normal commit path", async ({ db, services, clock }) => {
  const user = await seedUser(db);
  const caller: Principal = { userId: user.id, handle: user.handle, role: user.role, externalId: user.externalId, via: "header" };
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId: user.id,
    label: "Canonical commit fixture",
    providerId: providerIdSchema.parse("custom-openai"),
    model: modelIdSchema.parse("polish-fixture"),
    baseUrl: "https://polish-fixture.example/v1",
    modelCheck: "listed",
    declared: { kind: "generation", generation: makeGenerationCapability() },
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: user.id, task: "chat", connectionId });
  await services.settings.updateUserSettingsSection({ principal: caller, input: { section: "memory", patch: { enabled: false } } });
  const root = join(import.meta.dirname, "..", "..", "..", "..");
  const bundle = await packPluginDirectory({
    pluginDirectory: join(root, "packages/showcase-plugins/bundles/draft-polish"),
    sdkDirectory: join(root, "packages/plugin-sdk"),
  });
  expect(bundle.diagnostics).toEqual([]);
  if (bundle.bundle === null) {
    throw new Error("Draft Polish did not compile");
  }
  const { chat } = await services.chat.startChat({ principal: caller, characterIds: [], opening: "none" });
  const installed = await services.plugin.install({ caller, bundle: bundle.bundle, grant: ["ui.surface", "chat.transform"] });
  await services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
  try {
    const code = '`a  ...  b`\n```ts\nconst x = "...";  \n\t x  += 1 ;\n```';
    const outcome = await services.plugin.invokeUiCommand({
      caller,
      pluginId: installed.id,
      name: "polish",
      args: "",
      chatId: chat.id,
      composerDraft: ` \nHello...  ran ${code}\nDone  !  \n`,
    });
    const replacement = outcome.composerDraft;
    expect(replacement).toBe(`Hello… ran ${code}\nDone!`);
    if (replacement === undefined) {
      throw new Error("Polish returned no visible replacement");
    }
    expect(replacement.trim()).toBe(replacement);
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: replacement });
    const canon = await services.chat.listMessages({ principal: caller, chatId: chat.id });
    expect(canon.messages.map((message) => ({ role: message.role, content: message.content, author: message.authorUserId }))).toEqual([
      { role: "user", content: replacement, author: user.id },
    ]);
  } finally {
    await services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: false });
  }
});
