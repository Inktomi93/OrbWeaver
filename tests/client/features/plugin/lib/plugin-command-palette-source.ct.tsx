// CT: plugin-registered commands as FIRST-CLASS command-palette rows (plugin-ui-plane #679 U8, §4.5/§5 row 9).
// Drives the production path — `plugin.listCommands` (the caller's OWN granted-and-enabled plugins' commands)
// → the U8 `pluginCommandPaletteSource` fanned through the real palette-source registry → cmdk rows — and the
// dispatch half: a picked row runs `plugin.invokeUiCommand` (the SAME guest-handler round-trip the `/plugin`
// dispatch uses) and its host-mediated SUCCESS OUTCOME reaches a real toast.
//
// What U8 closes (the stickler audit's #1 ST-parity gap): before this, a plugin command was reachable ONLY as
// `/plugin <slug> <cmd>` — you had to already know both names. Now each command is its own searchable row,
// plugin-labelled, discoverable in the palette like any house action. These tests pin all four claims the
// mandate names: renders as a row, is plugin-labelled, is searchable, RUNS the real dispatch when picked — and
// that a caller with no granted plugin commands shows no plugin group at all (the per-caller scope is the wall).

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginCommandPaletteStory } from "../_ct-stories.tsx";

const ORACLE_ID = castId<PluginId>("plugin_ct_oracle00000001");
const CHIPS_ID = castId<PluginId>("plugin_ct_chips000000001");

/** Two granted-and-enabled plugins, one command each — the "one row per command, across plugins" case. Each
 *  object is one `plugin.listCommands` row as the wire projects it (`PluginCommandView`): the command PLUS the
 *  slug and plugin name only this side knows — the projection the palette row is built from. */
const TWO_COMMANDS: Readonly<Record<string, unknown>> = {
  "chat.listChats": () => ({ items: [], nextCursor: null }),
  // `args: []` — these commands declare NO typed args (the U8 shape); a picked row dispatches directly.
  "plugin.listCommands": () => [
    { pluginId: ORACLE_ID, slug: "oracle-deck", pluginName: "Oracle Deck", name: "draw", describe: "Draw a card from the deck", args: [] },
    { pluginId: CHIPS_ID, slug: "scene-chips", pluginName: "Scene Chips", name: "shuffle", describe: "Shuffle the scene chips", args: [] },
  ],
};

/** No commands come back — the shape a caller sees when their plugins are DISABLED or UNGRANTED (the server's
 *  owner-scoped `listCommands` returns none). The source runs and yields zero rows. */
const NO_COMMANDS: Readonly<Record<string, unknown>> = {
  "chat.listChats": () => ({ items: [], nextCursor: null }),
  "plugin.listCommands": () => [],
};

test("a plugin command is a FIRST-CLASS, plugin-labelled palette row (one per command, across plugins)", async ({ mount, page }) => {
  await routeTrpc(page, TWO_COMMANDS);

  const component = await mount(<PluginCommandPaletteStory />);

  // The group heading, then one row per registered command — each rendered by its command name.
  await expect(component.getByText("Plugin commands")).toBeVisible();
  await expect(page.getByRole("option", { name: "draw" })).toBeVisible();
  await expect(page.getByRole("option", { name: "shuffle" })).toBeVisible();
  // PLUGIN-LABELLED: the owning plugin's name is on the row (the disambiguator, visible AND in the acc name).
  await expect(component.getByText("Oracle Deck")).toBeVisible();
  await expect(component.getByText("Scene Chips")).toBeVisible();
});

test("the palette search matches a plugin command by name (cmdk scores it like any row)", async ({ mount, page }) => {
  await routeTrpc(page, TWO_COMMANDS);

  const component = await mount(<PluginCommandPaletteStory />);
  await expect(page.getByRole("option", { name: "draw" })).toBeVisible();

  await component.getByRole("combobox").fill("shuffle");
  await expect(page.getByRole("option", { name: "shuffle" })).toBeVisible();
  // The non-matching plugin command is filtered out by cmdk, exactly like a house command would be.
  await expect(page.getByRole("option", { name: "draw" })).toBeHidden();
});

test("picking a plugin command RUNS the guest-handler dispatch and surfaces its outcome", async ({ mount, page }) => {
  let invoked: { pluginId: PluginId; name: string } | null = null;
  await routeTrpc(page, {
    ...TWO_COMMANDS,
    // The SAME `/plugin <slug> <cmd>` round-trip the U5 dispatch uses — the palette is a surfacing layer over it.
    "plugin.invokeUiCommand": (input: unknown): unknown => {
      const { pluginId, name } = input as { pluginId: PluginId; name: string };
      invoked = { pluginId, name };
      return { toasts: [{ level: "success", message: "Oracle Deck: drew the Tower" }] };
    },
  });

  await mount(<PluginCommandPaletteStory />);
  await page.getByRole("option", { name: "draw" }).click();

  // The host-mediated success outcome reached a real toast — proof the full path ran (row → shared runner →
  // invokeUiCommand → applyPluginUiOutcome → notify.success).
  await expect(page.getByText("Oracle Deck: drew the Tower")).toBeVisible();
  // …and it dispatched THIS command, resolved off the wire projection (pluginId + guest-local name).
  expect(invoked).toEqual({ pluginId: ORACLE_ID, name: "draw" });
});

test("a caller with no granted-and-enabled plugin commands shows NO plugin group", async ({ mount, page }) => {
  await routeTrpc(page, NO_COMMANDS);

  const component = await mount(<PluginCommandPaletteStory />);
  // The palette mounted (its input is present) but the plugin group is absent — the source yielded zero rows.
  await expect(component.getByRole("combobox")).toBeVisible();
  await expect(page.getByText("Plugin commands")).toBeHidden();
});

test("with the source unregistered the palette is byte-identical — no plugin group even with commands on the wire", async ({ mount, page }) => {
  await routeTrpc(page, TWO_COMMANDS);

  // `sourced={false}` mounts an EMPTY palette-source registry: the palette never reads plugin commands at all.
  const component = await mount(<PluginCommandPaletteStory sourced={false} />);

  await expect(component.getByRole("combobox")).toBeVisible();
  await expect(page.getByText("Plugin commands")).toBeHidden();
  await expect(page.getByRole("option", { name: "draw" })).toBeHidden();
});
