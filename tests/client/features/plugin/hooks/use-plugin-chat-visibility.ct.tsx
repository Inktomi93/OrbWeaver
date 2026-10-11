// CT: the per-user list of plugins whose chat panels are hidden, over the REAL settings read and section write.
// The hide → Undo → re-show round trip for one plugin is pinned beside the anchors (lib/chat-anchors.ct.tsx);
// what is pinned here is the property only the hook owns: an Undo restores the list AS IT IS WHEN PRESSED,
// so a hide made after the notice it came from is not swept away with it.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcInput, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { CHAT_AMBIENT_ROUTES, makeMessagesPage, makeMessageView } from "../../chat/fixtures.ts";
import { PluginChatVisibilityStory } from "../_ct-stories.tsx";

type PluginListRow = TrpcWireOutput<"plugin.list">[number];

const FIRST_ID = mintTypeId(ID_PREFIX.plugin);
const SECOND_ID = mintTypeId(ID_PREFIX.plugin);

function pluginRow(id: PluginId, name: string): PluginListRow {
  return {
    id,
    slug: name.toLowerCase(),
    name,
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
    description: "A fixture plugin.",
    lastError: null,
    installedAt: 0,
    updatedAt: 0,
  };
}

test("an Undo restores the list as it is now, not as it was: a later hide of another plugin stays hidden", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let hidden: readonly PluginId[] = [];
  const view = (): ReturnType<typeof userSettingsView> => userSettingsView({ profile: { hiddenChatPluginIds: [...hidden] } });
  const settings: TrpcRoutes<"settings.getUserSettings" | "settings.updateUserSettingsSection"> = {
    "settings.getUserSettings": () => view(),
    "settings.updateUserSettingsSection": (input: TrpcInput<"settings.updateUserSettingsSection">) => {
      hidden = input.patch["hiddenChatPluginIds"] as readonly PluginId[];
      return view();
    },
  };
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ content: "Hi Aria", role: "user", seq: 1 })]),
    "chat.listReactions": () => ({ reactionsEnabled: true, groups: [] }),
    "chat.getChat": () => ({ participants: [], anchorPersonaId: null, identities: [], group: DEFAULT_GROUP_CONFIG }),
    "chat.previewContextFit": () => ({
      boundaryMessageId: null,
      usedTokens: 120,
      ceilingTokens: 32_768,
      ceilingEstimated: false,
      limit: null,
      reserveOutputTokens: 2048,
      droppedCount: 0,
      compactSummary: null,
    }),
    ...settings,
    "plugin.list": () => [pluginRow(FIRST_ID, "First Plugin"), pluginRow(SECOND_ID, "Second Plugin")],
    "plugin.listSurfaces": (): TrpcWireOutput<"plugin.listSurfaces"> => [
      { pluginId: FIRST_ID, id: "first_panel", anchor: "chat-flank", title: "One", tier: "static", spec: { kind: "text", value: "first body" } },
      { pluginId: SECOND_ID, id: "second_panel", anchor: "chat-flank", title: "Two", tier: "static", spec: { kind: "text", value: "second body" } },
    ],
    "plugin.getSurfaceState": () => null,
  });
  const component = await mount(<PluginChatVisibilityStory />);

  await page.getByRole("button", { name: "Hide First Plugin" }).click();
  await expect(component.getByText("first body")).toHaveCount(0);
  const firstNotice = page.getByLabel("Alerts").getByText("First Plugin hidden from chat", { exact: true });
  await expect(firstNotice).toBeVisible();

  await page.getByRole("button", { name: "Hide Second Plugin" }).click();
  await expect(component.getByText("second body")).toHaveCount(0);

  // Pressing the FIRST notice's Undo brings back the first plugin only.
  // Hovering expands the stacked notices so the older one is actionable.
  await page.getByLabel("Alerts").hover();
  await page.getByLabel("Alerts").getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect(component.getByText("first body")).toBeVisible();
  await expect(component.getByText("second body")).toHaveCount(0);
});
