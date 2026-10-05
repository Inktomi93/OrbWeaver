import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { REGEX_READS_EMPTY } from "../../../../support/node/regex-reads-empty.ts";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { storyClockFixture } from "../../../../support/node/story-clock-fixture.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { HostControlTruthStory } from "./_host-control-truth-stories.tsx";

async function routes(page: Page, panels = true, isHost = true): Promise<ChatId> {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const pluginId = mintTypeId(ID_PREFIX.plugin);
  const clocks = await storyClockFixture();
  await routeTrpc(page, {
    ...REGEX_READS_EMPTY,
    "databank.listActiveForChat": [],
    "worldInfo.listForChat": [],
    "chat.listChatInjections": [],
    "chat.getChat": { id: chatId, viewerIsHost: isHost, participants: [], memberPersonaLore: true, roomOverrides: {} },
    "settings.getUserSettings": userSettingsView(),
    "plugin.list": (): TrpcWireOutput<"plugin.list"> => [
      {
        id: pluginId,
        slug: "story-clocks",
        name: "Story Clocks",
        version: "1.0.0",
        status: "enabled",
        origin: "upload",
        sourceUrl: null,
        sourceCommit: null,
        updateSource: null,
        declaredCapabilities: ["ui.surface"],
        grantedCapabilities: ["ui.surface"],
        netHosts: null,
        reconsentPending: false,
        widenedNetHosts: [],
        builtAgainst: null,
        description: "Story clocks for this room",
        lastError: null,
        installedAt: 0,
        updatedAt: 0,
      },
    ],
    "plugin.listSurfaces": (): TrpcWireOutput<"plugin.listSurfaces"> => (panels ? clocks.surfaces.map((surface) => ({ ...surface, pluginId })) : []),
    "plugin.getSurfaceState": (): TrpcWireOutput<"plugin.getSurfaceState"> => clocks.state,
  });
  return chatId;
}

test("the actual Story Clocks panel is visible without opening native or unrelated controls", async ({ mount, page }) => {
  const chatId = await routes(page);
  const component = await mount(<HostControlTruthStory chatId={chatId} />);
  await expect(component.getByRole("button", { name: "Host controls", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByRole("button", { name: "Unrelated rules", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByRole("button", { name: "Plugin panels", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByRole("textbox", { name: "Clock", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Unrelated action", exact: true })).toBeHidden();
  await test.info().attach("story-host-controls", { body: await component.screenshot(), contentType: "image/png" });
});

test("a remembered collapse survives leaving and returning to This chat", async ({ mount, page }) => {
  const chatId = await routes(page);
  const component = await mount(<HostControlTruthStory chatId={chatId} />);
  const panels = component.getByRole("button", { name: "Plugin panels", exact: true });
  await expect(panels).toHaveAttribute("aria-expanded", "true");
  await panels.click();
  await expect(panels).toHaveAttribute("aria-expanded", "false");
  await component.getByRole("button", { name: "Toggle tab mount", exact: true }).click();
  await expect(panels).toHaveCount(0);
  await component.getByRole("button", { name: "Toggle tab mount", exact: true }).click();
  await expect(panels).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByRole("textbox", { name: "Clock", exact: true })).toBeHidden();
});

test("members do not mount host or plugin controls", async ({ mount, page }) => {
  const chatId = await routes(page, true, false);
  const component = await mount(<HostControlTruthStory chatId={chatId} isHost={false} />);
  await expect(component.getByRole("heading", { name: "Field overrides", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Host controls", exact: true })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Plugin panels", exact: true })).toHaveCount(0);
  await expect(component.getByRole("textbox", { name: "Clock", exact: true })).toHaveCount(0);
});

test("no applicable panel produces no empty Plugin panels chrome", async ({ mount, page }) => {
  const chatId = await routes(page, false);
  const component = await mount(<HostControlTruthStory chatId={chatId} />);
  await expect(component.getByRole("button", { name: "Host controls", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Plugin panels", exact: true })).toBeHidden();
});
