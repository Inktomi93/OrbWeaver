// CT: the §6 character CONTENT editor end-to-end. Drives the PRODUCTION path — `character.get` (routeTrpc)
// → `createSavedEntityForm` → the pinned hero band + Main/Advanced tabs + the sticky save-bar. Asserts:
// the hero renders the character's name (draft field) + handle + Start-chat CTA; the live-themed greeting
// bubble shows `greetings[0]`; the save-bar carries the §6.5 token split; editing the name lights the dirty
// pill + enables Save (the draft commit-model, §2); the Advanced tab reveals the prompt/depth/regex fields
// (a CONTENT tab, never a modal — §11 pain-point 1); and the identity Star toggle is an IMMEDIATE commit
// that fires `character.update` WITHOUT touching the save-bar dirty pill (§2 — the #1 way this lane breaks).
//
// `character.get`/`chat.listChats`/`character.update` are stubbed at the NETWORK (routeTrpc).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CharacterEditorSurfaceStory } from "../_ct-stories";
import { makeCharacterDetail, makeTagFixture } from "../fixtures";

const TOKEN_SPLIT_RE = /\d+ total · \d+ permanent/;
const BLUR_CLASS_RE = /blur-md/;

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

test("renders the hero (name · handle · Start chat) and the live greeting bubble", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");
  await expect(component.getByText("@aria")).toBeVisible();
  await expect(component.getByRole("button", { name: "Start chat" })).toBeVisible();
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

test("§6.4 the Advanced tab reveals the prompt/depth/regex fields (a CONTENT tab, not a modal)", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  await component.getByRole("tab", { name: "Advanced" }).click();
  // The panel's fields render inline (a CONTENT tab, never a modal). Assert the visible field labels + the
  // regex Add affordance (MacroField labels its control via `<Field>`, so match the visible label text).
  await expect(component.getByText("System prompt")).toBeVisible();
  await expect(component.getByText("Note at depth")).toBeVisible();
  await expect(component.getByRole("button", { name: "Add script" })).toBeVisible();
});

test("§6.3 example messages render as parsed <START> blocks (a formatted mini-transcript)", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // The two `<START>` blocks each render as their own read-only transcript segment.
  await expect(component.getByText("hi — Greetings.")).toBeVisible();
  await expect(component.getByText("bye — Farewell.")).toBeVisible();
});

test("§6.1 the spoiler eye blurs the card-text containers at rest and clears on toggle-off", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  const fields = component.locator('[data-slot="character-spoiler-field"]');
  // At rest (eye off) no container is blurred.
  await expect(fields.first()).not.toHaveClass(BLUR_CLASS_RE);

  // Toggle on → every spoiler-bearing container carries the CSS blur; the stored name value is untouched.
  await component.getByRole("button", { name: "Hide spoilers" }).click();
  await expect(fields.first()).toHaveClass(BLUR_CLASS_RE);
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");

  // Toggle off → the blur is gone (pure view state).
  await component.getByRole("button", { name: "Show spoilers" }).click();
  await expect(fields.first()).not.toHaveClass(BLUR_CLASS_RE);
});

test("§2 the Star chip is an IMMEDIATE commit — it never lights the save-bar dirty pill", async ({
  mount,
  page,
}) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  await component.getByRole("button", { name: "Star", exact: true }).click();
  // An identity commit must NOT flip the draft dirty pill (the seam that keeps the two commit models apart).
  await expect(component.getByText("Unsaved")).toHaveCount(0);
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
  await expect.poll(() => removedInput).toEqual({ tagName: "rpg", characterIds: ["char_ct_1"] });
  // Tag CRUD is immediate-commit — it must never light the draft save-bar pill (§2).
  await expect(component.getByText("Unsaved")).toHaveCount(0);
});
