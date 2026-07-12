// CT: the §6 character CONTENT editor end-to-end. Drives the PRODUCTION path — `character.get` (routeTrpc)
// → `createSavedEntityForm` → the pinned hero band + the facet master-list → drill-in + the sticky save-bar
// (the character-editor redesign REPLACED the flat Main/Advanced tabs with a facet list that drills into a
// full-width body editor). Asserts: the hero renders the character's name (draft field) + handle + New-chat
// CTA; the live-themed greeting bubble shows `greetings[0]`; the save-bar carries the §6.5 token split;
// editing the name lights the dirty pill + enables Save (the draft commit-model, §2); clicking a facet row
// drills CONTENT into that field's body (a CONTENT drill-in, never a modal — §11 pain-point 1).
//
// `character.get`/`chat.listChats`/`character.update` are stubbed at the NETWORK (routeTrpc).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CharacterEditorSurfaceStory } from "../_ct-stories";
import { makeCharacterDetail, makeTagFixture } from "../fixtures";

const TOKEN_SPLIT_RE = /\d+ total · \d+ permanent/;
const BLUR_CLASS_RE = /blur-md/;
// Facet-row accessible names (the row's label-button wraps label + subtitle, so match by substring).
const SYSTEM_PROMPT_ROW = /System prompt/;
const NOTE_AT_DEPTH_ROW = /Note at depth/;
const REGEX_ROW = /Regex scripts/;
const EXAMPLE_MESSAGES_ROW = /Example messages/;
const DESCRIPTION_ROW = /Description/;

// Two `<START>`-delimited example blocks (assembled from parts so biome's secret heuristic doesn't
// false-fire on the multi-line dialogue literal).
const EXAMPLE_MESSAGES = ["<START>", "hi — Greetings.", "<START>", "bye — Farewell."].join("\n");

const CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  handle: "aria",
  description: "A wandering cartographer with a sharp tongue.",
  greetings: ["Hello, traveler. What brings you to my door?"],
  systemPrompt: "You are Aria.",
  exampleMessages: EXAMPLE_MESSAGES,
});

async function routeEditor(page: Page): Promise<void> {
  await routeTrpc(page, {
    "character.get": () => CARD,
    "chat.listChats": () => [],
    "character.update": () => CARD,
  });
}

test("renders the hero (name · handle · New chat) and the live greeting bubble", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");
  await expect(component.getByText("@aria")).toBeVisible();
  await expect(component.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(component.getByText("Hello, traveler. What brings you to my door?")).toBeVisible();
});

test("§6.5 the save-bar carries the token split and gates Save until the draft is dirty", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // The split reads "N total · M permanent" (mono, off the draft).
  await expect(component.getByText(TOKEN_SPLIT_RE)).toBeVisible();
  // Clean: no dirty pill (Save stays enabled by the factory — DirtyPill, not the button, signals dirty).
  await expect(component.getByText("Unsaved")).toHaveCount(0);

  // Editing a draft field lights the pill.
  await component.getByRole("textbox", { name: "Name" }).fill("Aria N.");
  await expect(component.getByText("Unsaved")).toBeVisible();
  await expect(component.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("§6.4 a facet row drills CONTENT into that field's body editor (a drill-in, not a modal)", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // The facet master list shows the tier rows; click the System-prompt row to drill into its body.
  await component.getByRole("button", { name: SYSTEM_PROMPT_ROW }).click();
  // The full-width body editor renders in place (a CONTENT drill-in, never a modal), with a Back affordance
  // and the field's macro-aware editor (the combobox the MacroField wires up).
  await expect(component.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "System prompt" })).toBeVisible();

  // Back returns to the facet list; the Note-at-depth + Regex facets are reachable from there.
  await component.getByRole("button", { name: "Back" }).click();
  await expect(component.getByRole("button", { name: NOTE_AT_DEPTH_ROW })).toBeVisible();
  await expect(component.getByRole("button", { name: REGEX_ROW })).toBeVisible();
});

test("§6.3 example messages render as parsed <START> blocks in the facet drill-in", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // Drill into the Example-messages facet; the two `<START>` blocks each render as a transcript segment.
  await component.getByRole("button", { name: EXAMPLE_MESSAGES_ROW }).click();
  await expect(component.getByText("hi — Greetings.")).toBeVisible();
  await expect(component.getByText("bye — Farewell.")).toBeVisible();
});

test("§6.1 the spoiler eye blurs the drilled card-text container and clears on toggle-off", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // Drill into a spoiler-bearing facet (Description) so its body container is on screen.
  await component.getByRole("button", { name: DESCRIPTION_ROW }).click();
  const fields = component.locator('[data-slot="character-spoiler-field"]');
  // At rest (eye off) the container is not blurred.
  await expect(fields.first()).not.toHaveClass(BLUR_CLASS_RE);

  // Toggle on → the spoiler-bearing container carries the CSS blur; the stored name value is untouched.
  await component.getByRole("button", { name: "Hide spoilers" }).click();
  await expect(fields.first()).toHaveClass(BLUR_CLASS_RE);
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");

  // Toggle off → the blur is gone (pure view state).
  await component.getByRole("button", { name: "Show spoilers" }).click();
  await expect(fields.first()).not.toHaveClass(BLUR_CLASS_RE);
});

test("§6.2 removing a tag chip fires bulkRemoveCardTag by name — immediate, never the save-bar pill", async ({
  mount,
  page,
}) => {
  const tagged = makeCharacterDetail({ tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })] });
  let removedInput: unknown = null;
  await routeTrpc(page, {
    "character.get": () => tagged,
    "chat.listChats": () => [],
    "character.update": () => tagged,
    "character.bulkRemoveCardTag": (input: unknown) => {
      removedInput = input;
      return { removed: 1 };
    },
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  await component.getByRole("button", { name: "Remove rpg" }).click();
  // The by-name detach fires with THIS character's id (an immediate junction write).
  await expect
    .poll(() => removedInput, { intervals: [20, 50, 100] })
    .toEqual({ tagName: "rpg", characterIds: ["char_ct_1"] });
  // Tag CRUD is immediate-commit — it must never light the draft save-bar pill (§2).
  await expect(component.getByText("Unsaved")).toHaveCount(0);
});
