// CT: the §6 character CONTENT editor end-to-end. Drives the PRODUCTION path — `character.get` (routeTrpc)
// → the D78 session boundary (`createAutosaveEntityForm`) → the pinned hero band + the facet
// master-list → drill-in + the sticky header (the character-editor redesign REPLACED the flat Main/Advanced
// tabs with a facet list that drills into a full-width body editor). Asserts: the hero renders the
// character's name (draft field) + handle + New-chat CTA; the live-themed greeting bubble shows
// `greetings[0]`; the header carries the §6.5 token split; AUTOSAVE (D66 A4 / north-star §7) — editing the
// name debounce-persists a diff and the shared AutosaveStatus reads "Saved" (no Save/Discard buttons);
// structural greeting array ops (add + remove) persist through the boundary's store-subscription driver
// with ZERO call-site flush (D78 §3, the retired §7 TRAP); clicking a facet row drills CONTENT into that
// field's body (a CONTENT drill-in, never a modal — §11 pain-point 1).
//
// `character.get`/`chat.listChats`/`character.update` are stubbed at the NETWORK (routeTrpc).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CharacterDetailContributorStory, CharacterEditorSurfaceStory } from "../_ct-stories";
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

const GREETING_0 = "Hello, traveler. What brings you to my door?";

const CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  handle: "aria",
  description: "A wandering cartographer with a sharp tongue.",
  greetings: [{ text: GREETING_0 }],
  systemPrompt: "You are Aria.",
  exampleMessages: EXAMPLE_MESSAGES,
});

// A two-greeting card for the §7 array-TRAP removal path (needs a content-bearing alternate to remove).
const GREETINGS_CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  handle: "aria",
  greetings: [{ text: "First hello." }, { text: "Second hello." }],
});

/** The shape the editor sends to `character.update`: the changed-keys diff under `input`. */
interface UpdateCall {
  readonly input?: { readonly name?: string; readonly greetings?: readonly { readonly text: string; readonly groupOnly?: boolean }[] };
}

async function routeEditor(page: Page): Promise<void> {
  await routeTrpc(page, {
    "character.get": () => CARD,
    "chat.listChats": () => [],
    "character.update": () => CARD,
  });
}

test("renders the hero (name · handle · New chat) and the live greeting bubble", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");
  await expect(component.getByText("@aria")).toBeVisible();
  await expect(component.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(component.getByText("Hello, traveler. What brings you to my door?")).toBeVisible();
});

test("§6.5/§7 the header carries the token split + AutosaveStatus, and editing debounce-persists a diff", async ({ mount, page }) => {
  let updateInput: UpdateCall | null = null;
  await routeTrpc(page, {
    "character.get": () => CARD,
    "chat.listChats": () => [],
    "character.update": (input: unknown) => {
      updateInput = input as UpdateCall;
      return CARD;
    },
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  // The split reads "N total · M permanent" (mono, off the draft).
  await expect(component.getByText(TOKEN_SPLIT_RE)).toBeVisible();
  // Autosave everywhere (§7): the live status stands where Save used to — no Save/Discard buttons.
  await expect(component.getByText("Saved")).toBeVisible();
  await expect(component.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Discard changes" })).toHaveCount(0);

  // Editing a draft field debounce-persists ONLY the changed key (never a full-object PUT).
  await component.getByRole("textbox", { name: "Name" }).fill("Aria N.");
  await expect.poll(() => updateInput, { intervals: [100, 200, 300, 500] }).toEqual({ characterId: "char_ct_1", input: { name: "Aria N." } });
});

test("§7/D78 — adding an opening persists the structural push via the store driver, then its content autosaves", async ({ mount, page }) => {
  let updateInput: UpdateCall | null = null;
  await routeTrpc(page, {
    "character.get": () => CARD, // one greeting
    "chat.listChats": () => [],
    "character.update": (input: unknown) => {
      updateInput = input as UpdateCall;
      return CARD;
    },
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  // Add opening → pushFieldValue; the D78 store-subscription driver persists the structural push with NO
  // call-site flush. The new slot then autosaves its content on the first keystroke.
  await component.getByRole("button", { name: "Add opening" }).click();
  await component.getByLabel("Opening 2").fill("A second greeting.");

  // The 2nd greeting reaches the server (proving the add path persists, not silently dropped).
  await expect.poll(() => updateInput?.input?.greetings, { intervals: [100, 200, 300, 500] }).toEqual([{ text: GREETING_0 }, { text: "A second greeting." }]);
});

test("§7/D78 — removing an alternate persists the structural removal to the server via the store driver", async ({ mount, page }) => {
  let updateInput: UpdateCall | null = null;
  await routeTrpc(page, {
    "character.get": () => GREETINGS_CARD, // two greetings
    "chat.listChats": () => [],
    "character.update": (input: unknown) => {
      updateInput = input as UpdateCall;
      return GREETINGS_CARD;
    },
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  // Select the 2nd opening + enter edit mode → the "Remove opening" affordance appears (index > 0).
  await component.getByRole("button", { name: "Opening 2" }).click();
  await component.getByRole("button", { name: "Edit" }).click();
  await component.getByRole("button", { name: "Remove opening" }).click();

  // removeFieldValue routes through setFieldValue → the store driver debounce-persists the shrunk array.
  await expect.poll(() => updateInput?.input?.greetings, { intervals: [50, 100, 200, 300] }).toEqual([{ text: "First hello." }]);
});

test("§6.4 a facet row drills CONTENT into that field's body editor (a drill-in, not a modal)", async ({ mount, page }) => {
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

test("§6.3 example messages render as parsed <START> blocks in the facet drill-in", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // Drill into the Example-messages facet; the two `<START>` blocks each render as a transcript segment.
  await component.getByRole("button", { name: EXAMPLE_MESSAGES_ROW }).click();
  await expect(component.getByText("hi — Greetings.")).toBeVisible();
  await expect(component.getByText("bye — Farewell.")).toBeVisible();
});

test("§6.1 the spoiler eye blurs the drilled card-text container and clears on toggle-off", async ({ mount, page }) => {
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

test("§6.2 removing a tag chip fires bulkRemoveCardTag by name — an immediate commit outside the card form", async ({ mount, page }) => {
  const tagged = makeCharacterDetail({ tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })] });
  let removedInput: unknown = null;
  let cardUpdated = false;
  await routeTrpc(page, {
    "character.get": () => tagged,
    "chat.listChats": () => [],
    "character.update": () => {
      cardUpdated = true;
      return tagged;
    },
    "character.bulkRemoveCardTag": (input: unknown) => {
      removedInput = input;
      return { removed: 1 };
    },
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  await component.getByRole("button", { name: "Remove rpg" }).click();
  // The by-name detach fires with THIS character's id (an immediate junction write).
  await expect.poll(() => removedInput, { intervals: [20, 50, 100] }).toEqual({ tagName: "rpg", characterIds: ["char_ct_1"] });
  // Tags are an immediate-commit identity write OUTSIDE the card form — they must never trip the card
  // autosave (character.update) whose status stays "Saved".
  await expect(component.getByText("Saved")).toBeVisible();
  expect(cardUpdated).toBe(false);
});

// ── The character-DETAIL contributor seam (client-architecture-lockdown.md §6c — the one named seam gap) ──
// A fake `CharacterDetailContribution` at the `editor-sections` anchor, registered at a door-mirroring
// `CtCharacterContributorSectionRegistry` in place of main.tsx's empty registry, mounted through the REAL
// `characters` section's `content()` → `CharacterContent` → `CharacterEditorSurface` anchor-consumer path.

test("a fake editor-sections contribution renders as a review section in the editor body", async ({ mount, page }) => {
  await routeEditor(page);

  const component = await mount(<CharacterDetailContributorStory visible={true} />);

  // The editor mounts (its hero name proves the real section→content→surface path ran), and the fake
  // review section renders in the contributed sections region beside it.
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");
  await expect(component.getByTestId("ct-fake-detail-section")).toBeVisible();
  await expect(page.locator('[data-slot="character-editor-sections"]')).toHaveCount(1);
});

test("a fake editor-sections contribution's `when:false` renders NO sections region (today's layout, unchanged)", async ({ mount, page }) => {
  await routeEditor(page);

  const component = await mount(<CharacterDetailContributorStory visible={false} />);

  // The editor still mounts, but the contribution is `when`-gated out — zero sections ⇒ no wrapper at all.
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");
  await expect(component.getByTestId("ct-fake-detail-section")).toHaveCount(0);
  await expect(page.locator('[data-slot="character-editor-sections"]')).toHaveCount(0);
});
