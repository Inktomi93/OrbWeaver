// CT: the MU picks pane (user-macro-picks-section.tsx) — the per-chat user-macro INPUT picks over the
// committed data layer (chat.getUserMacroPicks + chat.setUserMacroValues). Proves: the pickable declarations
// render one control per typed input; an UNSET input shows its unset state (what the default resolves to),
// never the fallback dressed as a pick; each edit fires the MUTATION with the exact rebuilt bag (asserted via
// routeTrpc's recorder — the mutation count/input, never a UI reaction, per assert-the-mutation-fired); the
// "Use default" arms UNSET a stored pick (select item / button); the no-declarations empty state teaches.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { UserMacroPicksSectionStory } from "../_ct-stories";

// The wire shape `chat.getUserMacroPicks` returns (the server's least-privilege projection: identity +
// inputs, never the macro BODY). Spelled locally — `UserMacroPicksView` is a SERVER-domain contract type
// (packages/server/src/domain/chat/contract/views.ts), not importable from the client across the cake.
const TONE_INPUT = {
  kind: "single-select",
  name: "tone",
  label: "Tone",
  options: [
    { label: "Grim", value: "grim" },
    { label: "Warm", value: "warm" },
  ],
  separator: ", ",
  onValue: "true",
  offValue: "",
  defaultValue: "warm",
};

const WEATHER_INPUT = {
  kind: "random-pick",
  name: "weather",
  label: "Weather pool",
  options: [
    { label: "Storm", value: "storm" },
    { label: "Clear", value: "clear" },
  ],
  separator: ", ",
  onValue: "true",
  offValue: "",
  defaultValue: "",
};

const MOOD_MACRO = { name: "mood", description: "The scene's emotional weather.", inputs: [TONE_INPUT, WEATHER_INPUT] };

test("renders the declared macro + one control per typed input, and an UNSET input shows what the default resolves to", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: {} }),
  });

  const component = await mount(<UserMacroPicksSectionStory />);

  await expect(component.getByText("{{mood}}")).toBeVisible();
  await expect(component.getByText("The scene's emotional weather.")).toBeVisible();
  // The unset single-select names the fallback the TURN would resolve (defaultValue "warm") — the trigger
  // must not read "Warm" as though someone had picked it.
  await expect(page.getByRole("combobox", { name: "Tone" })).toHaveText("Use default (warm)");
  // The unset random-pick names its real unpicked behavior (the pool is every option).
  await expect(component.getByText("Use default (draws from all 2 options each reply)")).toBeVisible();
  // Unset ⇒ no un-set affordance to offer.
  await expect(component.getByRole("button", { name: "Use default" })).toHaveCount(0);
});

test("a stored pick renders as the picked option (not the default)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "grim", weather: ["storm"] } } }),
  });

  const component = await mount(<UserMacroPicksSectionStory />);

  await expect(page.getByRole("combobox", { name: "Tone" })).toHaveText("Grim");
  await expect(component.getByRole("checkbox", { name: "Storm" })).toBeChecked();
  await expect(component.getByRole("checkbox", { name: "Clear" })).not.toBeChecked();
  await expect(component.getByText("Draws one of the checked options each reply.")).toBeVisible();
});

test("picking a single-select option fires setUserMacroValues with the rebuilt bag", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: {} }),
    "chat.setUserMacroValues": () => ({}),
  });

  await mount(<UserMacroPicksSectionStory />);

  await page.getByRole("combobox", { name: "Tone" }).click();
  await page.getByRole("option", { name: "Grim", exact: true }).click();

  await expect.poll(() => trpc.count("chat.setUserMacroValues")).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.setUserMacroValues")).toMatchObject({ values: { mood: { tone: "grim" } } });
});

test("checking a random-pick option fires the mutation with the ARRAY pool, merged beside the sibling pick", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "grim" } } }),
    "chat.setUserMacroValues": () => ({}),
  });

  const component = await mount(<UserMacroPicksSectionStory />);

  await component.getByRole("checkbox", { name: "Storm" }).click();

  await expect.poll(() => trpc.count("chat.setUserMacroValues")).toBe(1);
  // The whole bag is rewritten every edit (the verb is a column flush) — the sibling `tone` pick must survive.
  await expect.poll(() => trpc.lastInput("chat.setUserMacroValues")).toMatchObject({ values: { mood: { tone: "grim", weather: ["storm"] } } });
});

test("Use default UNSETS a stored pick — the select item drops the key, the button drops the array", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "grim", weather: ["storm"] } } }),
    "chat.setUserMacroValues": () => ({}),
  });

  const component = await mount(<UserMacroPicksSectionStory />);

  // The select-family's unset arm is its leading item.
  await page.getByRole("combobox", { name: "Tone" }).click();
  await page.getByRole("option", { name: "Use default (warm)", exact: true }).click();
  await expect.poll(() => trpc.lastInput("chat.setUserMacroValues")).toMatchObject({ values: { mood: { weather: ["storm"] } } });

  // The checkbox-family's unset arm is the button (unchecking everything would store an explicit []).
  await component.getByRole("button", { name: "Use default" }).click();
  await expect.poll(() => trpc.count("chat.setUserMacroValues")).toBe(2);
  // Both picks gone ⇒ the emptied macro entry is dropped, so the bag is the never-picked shape.
  await expect.poll(() => trpc.lastInput("chat.setUserMacroValues")).toEqual({ chatId: "chat_ct_keystone", values: {} });
});

test("no declared macro inputs ⇒ a teaching empty state, never a blank section", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
  });

  const component = await mount(<UserMacroPicksSectionStory />);

  await expect(component.getByText("The preset this chat runs declares no macro inputs.", { exact: false })).toBeVisible();
});
