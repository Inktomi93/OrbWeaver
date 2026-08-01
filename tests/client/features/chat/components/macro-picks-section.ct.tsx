// CT: the Macro picks pane (macro-picks-section.tsx) — the per-chat user-macro INPUT picks over the
// committed data layer (chat.getUserMacroPicks + chat.setUserMacroValues). Proves: the pickable declarations
// render one control per typed input; an UNSET input shows its unset state (what the default resolves to),
// never the fallback dressed as a pick; each edit fires the MUTATION with the exact rebuilt bag (asserted via
// routeTrpc's recorder — the mutation count/input, never a UI reaction, per assert-the-mutation-fired); the
// "Use default" arms UNSET a stored pick (select item / button); the no-declarations empty state teaches.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { MacroPicksSectionStory } from "../_ct-stories";

// The wire shape `chat.getUserMacroPicks` returns (the server's least-privilege projection: identity +
// inputs + the authoring home, never the macro BODY). Spelled locally — `UserMacroPicksView` is a SERVER-domain contract type
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

const MOOD_MACRO = { name: "mood", description: "The scene's emotional weather.", inputs: [TONE_INPUT, WEATHER_INPUT], source: "preset" };

/** The GAME's own declaration (the second definition home) — same wire shape, `source: "game"`, which the
 *  pane glosses so a picker can tell the knob came with the game (a preset macro stays unmarked). */
const OMEN_MACRO = { name: "omen", description: "The night's omen.", inputs: [TONE_INPUT], source: "game" };

// The wire shape `chat.getVariablePicks` returns — the pane's OTHER knob family (ChoiceBlock variables,
// projected WHOLE: a ChoiceBlock has no body class to withhold). Spelled locally for the same reason.
const POV_VARIABLE = {
  name: "pov",
  question: "Narration POV",
  options: [
    { label: "First", value: "first person" },
    { label: "Third", value: "third person" },
  ],
  defaultValue: "third person",
  multiSelect: false,
  separator: ", ",
  randomPick: false,
};

const WEATHER_VARIABLE = {
  name: "weather",
  question: "Weather pool",
  options: [
    { label: "Storm", value: "storm" },
    { label: "Clear", value: "clear" },
  ],
  multiSelect: true,
  separator: ", ",
  randomPick: true,
};

/** The "this preset declares none of THIS family" arms — the pane mounts BOTH reads, so every test answers
 *  both procs (an unlisted proc resolves `null`, which is not a view). */
const NO_VARIABLES = { variables: [], values: {} };
const NO_MACROS = { macros: [], values: {} };

test("renders the declared macro + one control per typed input, and an UNSET input shows what the default resolves to", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: {} }),
    "chat.getVariablePicks": () => NO_VARIABLES,
  });

  const component = await mount(<MacroPicksSectionStory />);

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

test("a GAME-declared macro carries a quiet 'from game' gloss; a preset one is unmarked", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [OMEN_MACRO, MOOD_MACRO], values: {} }),
    "chat.getVariablePicks": () => NO_VARIABLES,
  });

  const component = await mount(<MacroPicksSectionStory />);

  await expect(component.getByText("{{omen}}")).toBeVisible();
  // Exactly ONE gloss — the game's. The preset half is the unmarked default (labelling every row would be
  // noise, not provenance).
  await expect(component.getByText("from game")).toHaveCount(1);
});

test("a stored pick renders as the picked option (not the default)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "grim", weather: ["storm"] } } }),
    "chat.getVariablePicks": () => NO_VARIABLES,
  });

  const component = await mount(<MacroPicksSectionStory />);

  await expect(page.getByRole("combobox", { name: "Tone" })).toHaveText("Grim");
  await expect(component.getByRole("checkbox", { name: "Storm" })).toBeChecked();
  await expect(component.getByRole("checkbox", { name: "Clear" })).not.toBeChecked();
  await expect(component.getByText("Draws one of the checked options each reply.")).toBeVisible();
});

test("picking a single-select option fires setUserMacroValues with the rebuilt bag", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: {} }),
    "chat.getVariablePicks": () => NO_VARIABLES,
    "chat.setUserMacroValues": () => ({}),
  });

  await mount(<MacroPicksSectionStory />);

  await page.getByRole("combobox", { name: "Tone" }).click();
  await page.getByRole("option", { name: "Grim", exact: true }).click();

  await expect.poll(() => trpc.count("chat.setUserMacroValues")).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.setUserMacroValues")).toMatchObject({ values: { mood: { tone: "grim" } } });
});

test("checking a random-pick option fires the mutation with the ARRAY pool, merged beside the sibling pick", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "grim" } } }),
    "chat.getVariablePicks": () => NO_VARIABLES,
    "chat.setUserMacroValues": () => ({}),
  });

  const component = await mount(<MacroPicksSectionStory />);

  await component.getByRole("checkbox", { name: "Storm" }).click();

  await expect.poll(() => trpc.count("chat.setUserMacroValues")).toBe(1);
  // The whole bag is rewritten every edit (the verb is a column flush) — the sibling `tone` pick must survive.
  await expect.poll(() => trpc.lastInput("chat.setUserMacroValues")).toMatchObject({ values: { mood: { tone: "grim", weather: ["storm"] } } });
});

test("Use default UNSETS a stored pick — the select item drops the key, the button drops the array", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "grim", weather: ["storm"] } } }),
    "chat.getVariablePicks": () => NO_VARIABLES,
    "chat.setUserMacroValues": () => ({}),
  });

  const component = await mount(<MacroPicksSectionStory />);

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

test("neither knob family declared ⇒ a teaching empty state, never a blank section", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => NO_MACROS,
    "chat.getVariablePicks": () => NO_VARIABLES,
  });

  const component = await mount(<MacroPicksSectionStory />);

  await expect(component.getByText("declares no variables and no macro inputs", { exact: false })).toBeVisible();
});

// ── The ChoiceBlock family — the SAME pane, the second knob family ────────────────────────────────────

test("declared variables render beside the macro inputs in ONE pane, each showing its unset default", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: {} }),
    "chat.getVariablePicks": () => ({ variables: [POV_VARIABLE, WEATHER_VARIABLE], values: {} }),
  });

  const component = await mount(<MacroPicksSectionStory />);

  // Both families in the one section — the spec's "one client pane, two knob families".
  await expect(component.getByText("Variables")).toBeVisible();
  await expect(component.getByText("{{mood}}")).toBeVisible();
  // The unset single-pick variable names the fallback the TURN resolves (`defaultValue`), never a fake pick.
  await expect(page.getByRole("combobox", { name: "Narration POV" })).toHaveText("Use default (third person)");
  // The unset multi-select+randomPick names its real unpicked behavior (the default string, one part drawn).
  await expect(component.getByText("Use default (storm) — one part drawn each reply")).toBeVisible();
});

test("a stored variable pick renders as the picked option; a multi-select splits its joined store", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => NO_MACROS,
    "chat.getVariablePicks": () => ({ variables: [POV_VARIABLE, WEATHER_VARIABLE], values: { pov: "first person", weather: "storm, clear" } }),
  });

  const component = await mount(<MacroPicksSectionStory />);

  await expect(page.getByRole("combobox", { name: "Narration POV" })).toHaveText("First");
  await expect(component.getByRole("checkbox", { name: "Storm" })).toBeChecked();
  await expect(component.getByRole("checkbox", { name: "Clear" })).toBeChecked();
  await expect(component.getByText("Draws one of the checked options each reply.")).toBeVisible();
});

test("picking a variable fires setVariables with the rebuilt map — orphan keys survive", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => NO_MACROS,
    // `retired` is a stored pick the preset no longer declares (the resolver's orphan-preserve arm) — the
    // pane never renders it, and an edit must not silently drop it from the flushed column.
    "chat.getVariablePicks": () => ({ variables: [POV_VARIABLE], values: { retired: "kept" } }),
    "chat.setVariables": () => ({}),
  });

  await mount(<MacroPicksSectionStory />);

  await page.getByRole("combobox", { name: "Narration POV" }).click();
  await page.getByRole("option", { name: "First", exact: true }).click();

  await expect.poll(() => trpc.count("chat.setVariables")).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.setVariables")).toEqual({ chatId: "chat_ct_keystone", values: { retired: "kept", pov: "first person" } });
});

test("a multi-select variable stores its picks SEPARATOR-JOINED, and unchecking the last one unsets the key", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => NO_MACROS,
    "chat.getVariablePicks": () => ({ variables: [WEATHER_VARIABLE], values: { weather: "storm" } }),
    "chat.setVariables": () => ({}),
  });

  const component = await mount(<MacroPicksSectionStory />);

  // Checking a second option joins both in the AUTHORED option order (never click order). Each edit builds
  // on the last: the write is optimistic + bus-reconciled, so the pane's own read carries the running bag.
  await component.getByRole("checkbox", { name: "Clear" }).click();
  await expect.poll(() => trpc.lastInput("chat.setVariables")).toMatchObject({ values: { weather: "storm, clear" } });

  await component.getByRole("checkbox", { name: "Storm" }).click();
  await expect.poll(() => trpc.lastInput("chat.setVariables")).toMatchObject({ values: { weather: "clear" } });

  // Unchecking the LAST one DROPS the key: a ChoiceBlock stores one string and `""` reads as unpicked, so
  // "no checkboxes" is the unset arm (no separate "Use default" button, unlike the macro-input array family).
  await component.getByRole("checkbox", { name: "Clear" }).click();
  await expect.poll(() => trpc.count("chat.setVariables")).toBe(3);
  await expect.poll(() => trpc.lastInput("chat.setVariables")).toEqual({ chatId: "chat_ct_keystone", values: {} });
});

test("Use default UNSETS a stored variable pick; a value the preset no longer offers still shows", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => NO_MACROS,
    "chat.getVariablePicks": () => ({ variables: [POV_VARIABLE], values: { pov: "second person" } }),
    "chat.setVariables": () => ({}),
  });

  await mount(<MacroPicksSectionStory />);

  // The stored pick is not among the authored options any more (the author edited them) — the turn still
  // resolves it, so the trigger must SAY it rather than render blank.
  await expect(page.getByRole("combobox", { name: "Narration POV" })).toHaveText("second person (no longer offered)");

  await page.getByRole("combobox", { name: "Narration POV" }).click();
  await page.getByRole("option", { name: "Use default (third person)", exact: true }).click();
  await expect.poll(() => trpc.lastInput("chat.setVariables")).toEqual({ chatId: "chat_ct_keystone", values: {} });
});
