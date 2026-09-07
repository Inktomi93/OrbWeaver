// CT: the #791 command-args modal — a plugin command that DECLARES typed args collects them (typed inputs) and
// dispatches the TYPED values, and a missing required arg BLOCKS the dispatch with a clear message. Drives the
// production collect → coerce → dispatch path: the real body reads the intent store, renders the house form
// primitive per arg (an enum → a Select), coerces the collected strings through the ONE contracts coercion, and
// fires the SAME `plugin.invokeUiCommand` round-trip the `/plugin` composer dispatch and the palette use.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginCommandArgsStory } from "../_ct-stories.tsx";

const ARGS_PLUGIN_ID = castId<PluginId>("plugin_ct_argmodal0000001");

/** `listCommands` must carry the SAME command the modal seeds (the shared runner resolves the invoke off it by
 *  slug+name), declaring one required enum arg. */
const ROUTES: Readonly<Record<string, unknown>> = {
  "chat.listChats": () => ({ items: [], nextCursor: null }),
  "plugin.listCommands": () => [
    {
      pluginId: ARGS_PLUGIN_ID,
      slug: "oracle-deck",
      pluginName: "Oracle Deck",
      name: "cast",
      describe: "Cast a spell",
      args: [{ name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] }],
    },
  ],
};

test("an enum arg renders a typed input and the run dispatches the TYPED value", async ({ mount, page }) => {
  let captured: { name: string; values: unknown } | null = null;
  await routeTrpc(page, {
    ...ROUTES,
    "plugin.invokeUiCommand": (input: unknown): unknown => {
      const { name, values } = input as { name: string; values: unknown };
      captured = { name, values };
      return { toasts: [] };
    },
  });

  const component = await mount(<PluginCommandArgsStory />);

  // The declared enum arg is a typed SELECT (not a free text box), labelled by the arg's name.
  const suit = component.getByRole("combobox", { name: "suit" });
  await expect(suit).toBeVisible();
  await suit.click();
  await page.getByRole("option", { name: "cups" }).click();

  await component.getByRole("button", { name: "Run cast" }).click();

  // The dispatch carried the TYPED value bag — `suit: "cups"` — resolved off the declared spec.
  await expect.poll(() => captured).not.toBeNull();
  expect(captured).toEqual({ name: "cast", values: { suit: "cups" } });
});

test("a required arg left empty BLOCKS the dispatch with a clear message", async ({ mount, page }) => {
  let invoked = false;
  await routeTrpc(page, {
    ...ROUTES,
    "plugin.invokeUiCommand": (): unknown => {
      invoked = true;
      return { toasts: [] };
    },
  });

  const component = await mount(<PluginCommandArgsStory />);
  // Run WITHOUT choosing a value for the required enum.
  await component.getByRole("button", { name: "Run cast" }).click();

  // The block is a visible sentence naming the offending arg — and the dispatch never ran.
  await expect(page.getByText("suit is required")).toBeVisible();
  expect(invoked).toBe(false);
});
