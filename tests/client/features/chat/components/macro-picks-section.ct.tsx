// CT: the Macro picks pane (macro-picks-section.tsx) — the per-chat user-macro INPUT picks over the
// committed data layer (chat.getUserMacroPicks + chat.setUserMacroValues). Proves: the pickable declarations
// render one control per typed input; an UNSET input shows its unset state (what the default resolves to),
// never the fallback dressed as a pick; each edit fires the MUTATION with the exact rebuilt bag (asserted via
// routeTrpc's recorder — the mutation count/input, never a UI reaction, per assert-the-mutation-fired); the
// "Use default" arms UNSET a stored pick (select item / button); the no-declarations empty state teaches.

import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { MacroPicksSectionStory, MacroPicksSectionToastStory } from "../_ct-stories.tsx";

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

/** A MULTI-SELECT input — the second vocabulary-bound kind (#1356/#1582). Its store is a string ARRAY the
 *  turn filters to the declared options and joins; unlike `random-pick`, a selection nothing survives is
 *  UNPICKED rather than "the whole pool". */
const TEXTURE_INPUT = {
  kind: "multi-select",
  name: "texture",
  label: "Texture",
  options: [
    { label: "Terse", value: "terse" },
    { label: "Lush", value: "lush" },
  ],
  separator: ", ",
  onValue: "true",
  offValue: "",
  defaultValue: "lush",
};

const PROSE_MACRO = { name: "prose", description: "How the narration reads.", inputs: [TEXTURE_INPUT], source: "preset" };

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

// #1110's COUNTER-PIN. The quiet checked skin is scoped to groups whose default is ALL-ON (Backup's
// "Include" fieldset); a random-pick pool is a DELIBERATE choice per option, so its checked rows keep the
// ember. Without this, "quiet" could spread across every checkbox group in the app and the ruling's whole
// point — spend the accent on a decision — would be lost with every assertion still green.
test("a deliberate-choice pool keeps the ACCENT checked skin — quiet is Backup's group only (#1110)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "grim", weather: ["storm"] } } }),
    "chat.getVariablePicks": () => NO_VARIABLES,
  });

  const component = await mount(<MacroPicksSectionStory />);

  const storm = component.getByRole("checkbox", { name: "Storm" });
  await expect(storm).toBeChecked();
  await expect(storm).toHaveAttribute("data-tone", "accent");
  await expect(storm).toHaveCSS("background-color", TOKENS["color.primary"].value);
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

// ── #1582 · A STORED PICK OUTLIVES ITS DEFINITION ─────────────────────────────────────────────────────
// #1356 gave the turn a resolve-side belt (kit `resolveStaticInput`): a select pick naming a value the
// input no longer declares is NEUTRALISED — a single-select falls to the default ladder, a multi-select
// keeps only the survivors and reads a wholly-foreign selection as unpicked. The PANE went on rendering the
// stored value as the chosen one, so the control said one thing and the reply used another; and because
// `setUserMacroValues` is a whole-column flush, the next unrelated edit carried that dead value back to a
// server that now REFUSES it (`unknown_macro_pick`). The pane therefore rebuilds its bag against the live
// declarations before it renders or flushes.

test("a stale stored single-select pick shows the DEFAULT it will resolve to, not the stale value (#1582)", async ({ mount, page }) => {
  await routeTrpc(page, {
    // `bleak` was an authored option once; the preset's options are now Grim/Warm.
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "bleak" } } }),
    "chat.getVariablePicks": () => NO_VARIABLES,
  });

  const component = await mount(<MacroPicksSectionStory />);

  // NOT "bleak", and not a blank trigger: the fallback the turn actually resolves, said as the unset arm.
  await expect(page.getByRole("combobox", { name: "Tone" })).toHaveText("Use default (warm)");
  // Unset ⇒ no un-set affordance, exactly as a never-picked input renders.
  await expect(component.getByRole("button", { name: "Use default" })).toHaveCount(0);
});

test("…and the next edit's whole-bag flush does not carry the dead value back (#1582)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: { mood: { tone: "bleak" } } }),
    "chat.getVariablePicks": () => NO_VARIABLES,
    "chat.setUserMacroValues": () => ({}),
  });

  const component = await mount(<MacroPicksSectionStory />);
  await component.getByRole("checkbox", { name: "Storm" }).click();

  await expect.poll(() => trpc.count("chat.setUserMacroValues")).toBe(1);
  // `tone` is ABSENT — a surviving `tone: "bleak"` is the whole defect: the server refuses the flush the
  // user's unrelated pool edit just produced, and the pool edit is lost with it.
  await expect.poll(() => trpc.lastInput("chat.setUserMacroValues")).toEqual({ chatId: "chat_ct_keystone", values: { mood: { weather: ["storm"] } } });
});

test("a multi-select keeps the SURVIVING picks and drops only the dead ones (#1582)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [PROSE_MACRO], values: { prose: { texture: ["terse", "baroque"] } } }),
    "chat.getVariablePicks": () => NO_VARIABLES,
    "chat.setUserMacroValues": () => ({}),
  });

  const component = await mount(<MacroPicksSectionStory />);

  // Still a real pick — `terse` survives, so this is NOT the unset arm.
  await expect(component.getByRole("checkbox", { name: "Terse" })).toBeChecked();
  await expect(component.getByRole("checkbox", { name: "Lush" })).not.toBeChecked();
  await expect(component.getByText("The checked options, joined.")).toBeVisible();

  await component.getByRole("checkbox", { name: "Lush" }).click();
  await expect.poll(() => trpc.lastInput("chat.setUserMacroValues")).toEqual({ chatId: "chat_ct_keystone", values: { prose: { texture: ["terse", "lush"] } } });
});

test("a multi-select nothing survives reads as UNPICKED — the resolver's own ladder (#1582)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [PROSE_MACRO], values: { prose: { texture: ["baroque"] } } }),
    "chat.getVariablePicks": () => NO_VARIABLES,
  });

  const component = await mount(<MacroPicksSectionStory />);

  await expect(component.getByRole("checkbox", { name: "Terse" })).not.toBeChecked();
  await expect(component.getByRole("checkbox", { name: "Lush" })).not.toBeChecked();
  // The unset consequence, not "the checked options, joined" over an empty set.
  await expect(component.getByText("Use default (lush)")).toBeVisible();
  await expect(component.getByRole("button", { name: "Use default" })).toHaveCount(0);
});

// The OTHER half of #1582: the server's own refusal had no client handler at all, so a member whose knob
// went stale under them got the generic "Couldn't save the macro picks." — a sentence about the app, not
// about the one thing they can fix. The refusal now lands beside the control that caused it (WCAG 3.3.1),
// naming the options the input DOES offer, and the generic toast is suppressed so there is one surface.
test("an unknown_macro_pick refusal is said BESIDE the knob that caused it, naming the options (#1582)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: {} }),
    "chat.getVariablePicks": () => NO_VARIABLES,
    "chat.setUserMacroValues": () =>
      trpcError({ code: "BAD_REQUEST", message: 'mood.tone: "grim" is not one of the declared options []', reason: "unknown_macro_pick" }),
  });

  const component = await mount(<MacroPicksSectionStory />);
  await page.getByRole("combobox", { name: "Tone" }).click();
  await page.getByRole("option", { name: "Grim", exact: true }).click();

  await expect(component.getByText("That pick is no longer one of this input's options, so nothing was saved. Pick one of: Grim, Warm.")).toBeVisible();
  // The refused write is rolled back — the trigger must not keep showing a pick the server refused.
  await expect(page.getByRole("combobox", { name: "Tone" })).toHaveText("Use default (warm)");
});

// ── ONE REFUSAL, ONE SURFACE — the half of #1582 that was never observable (#1632 item 4) ─────────────
// `useSetUserMacroValues` suppresses its `errorToast` for `unknown_macro_pick` on the stated ground that the
// pane always says that refusal beside the knob, so a toast on top would be one refusal in two spellings.
// Nothing pinned it: every test above mounts `MacroPicksSectionStory`, whose `CtDataProviders` QueryClient
// has NO MutationCache error channel at all, so the toast half is invisible there and a "no toast" assertion
// would read zero with the suppression removed too. These two mount the REAL app QueryClient + the
// production Toaster, and they come as a PAIR: the second is the positive control that proves the channel is
// live, which is the only thing that makes the first one's zero a measurement.

/** The app's toast outlet — `CtToastSurface`'s production `AppToaster` renders one root per notice. */
const TOAST_ROOT = '[data-slot="toast-root"]';

test("the off-vocabulary refusal is said ONCE — beside the knob, with no toast over it (#1582)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: {} }),
    "chat.getVariablePicks": () => NO_VARIABLES,
    "chat.setUserMacroValues": () =>
      trpcError({ code: "BAD_REQUEST", message: 'mood.tone: "grim" is not one of the declared options []', reason: "unknown_macro_pick" }),
  });

  const component = await mount(<MacroPicksSectionToastStory />);
  await page.getByRole("combobox", { name: "Tone" }).click();
  await page.getByRole("option", { name: "Grim", exact: true }).click();

  // The surface that IS owed — and it is the BARRIER, so the toast count below is read on a settled failure
  // rather than in the window before the mutation has rejected at all.
  await expect(component.getByText("That pick is no longer one of this input's options, so nothing was saved. Pick one of: Grim, Warm.")).toBeVisible();
  // …and the one that is NOT. Asserted on the toast ROOT, not on copy: a text query answers zero for a toast
  // that rendered with different words, which is the false clean.
  await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
});

test("…while ANY OTHER refusal of the same write still toasts — the channel is live (#1582 control)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getUserMacroPicks": () => ({ macros: [MOOD_MACRO], values: {} }),
    "chat.getVariablePicks": () => NO_VARIABLES,
    // No `reason`, so `isUnknownMacroPick` is false and the suppression does not apply.
    "chat.setUserMacroValues": () => trpcError({ message: "the chat is gone" }),
  });

  await mount(<MacroPicksSectionToastStory />);
  await page.getByRole("combobox", { name: "Tone" }).click();
  await page.getByRole("option", { name: "Grim", exact: true }).click();

  await expect(page.locator(TOAST_ROOT)).toHaveCount(1);
  await expect(page.locator(TOAST_ROOT)).toContainText("Couldn't save the macro picks.");
});
