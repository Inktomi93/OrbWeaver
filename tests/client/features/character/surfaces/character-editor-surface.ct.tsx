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

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { beginAutosaveStatusTranscript, readAutosaveStatusTranscript } from "../../../../support/ct/autosave-status-transcript.ts";
import { resolvedTokenColor } from "../../../../support/ct/resolved-token-color.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { readPhantomScrollers } from "../../../../support/ct/scroll-containing-block.ts";
import { touchFloorPx } from "../../../../support/ct/touch-floor.ts";
import type { ChatSummaryFixture } from "../../chat/fixtures.ts";
import { chatListResponder, makeSeatPortrait } from "../../chat/fixtures.ts";
import { CharacterDetailContributorStory, CharacterEditorSurfaceStory, CharacterFacetInspectorStory } from "../_ct-stories.tsx";
import { CHARACTER_EDITOR_AMBIENT_ROUTES, makeCharacterDetail, makeTagFixture } from "../fixtures.ts";

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
  handle: castId<CharacterHandle>("aria"),
  description: "A wandering cartographer with a sharp tongue.",
  greetings: [{ text: GREETING_0 }],
  systemPrompt: "You are Aria.",
  exampleMessages: EXAMPLE_MESSAGES,
});

// A two-greeting card for the §7 array-TRAP removal path (needs a content-bearing alternate to remove).
const GREETINGS_CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  handle: castId<CharacterHandle>("aria"),
  greetings: [{ text: "First hello." }, { text: "Second hello." }],
});

/** The shape the editor sends to `character.update`: the changed-keys diff under `input`. */
interface UpdateCall {
  readonly input?: { readonly name?: string; readonly greetings?: readonly { readonly text: string; readonly groupOnly?: boolean }[] };
}

async function routeEditor(page: Page): Promise<void> {
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => CARD,
    "chat.listChats": chatListResponder([]),
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

// ── DRAFT-TRUST arm 1: the greeting preview resolves RENDER POLICY, it does not read the raw override ──
// The editor has no server-resolved `renderPolicy` (there is no roster for a card you are editing), so it
// used to render `trusted={card.trustHtml === true}` — the card's raw OVERRIDE column. That answers a
// different question than the renderer does: `resolveRenderPolicy` is `override ?? deploymentFloor`, so an
// INHERIT card (`trustHtml: null` — the fixture default, and every card's default) resolves to TRUSTED on a
// deployment whose floor trusts HTML, while the preview rendered it untrusted. A preview whose entire job is
// "show me what this will look like" must not disagree with the thing it previews.
//
// The discriminator is the IMAGE: `img` is the documented trusted-vs-untrusted element difference (the
// untrusted allowlist is Tier-A MINUS img — `ui/src/markdown/policy.ts`, and `markdown.ct.tsx` pins the
// untrusted arm at the primitive). Markdown image syntax, and a RELATIVE src, so neither the raw-HTML
// question nor the untrusted URL gate is what is being measured — the element allowlist is.
const HTML_GREETING_CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  handle: castId<CharacterHandle>("aria"),
  // trustHtml stays the fixture default of `null` = INHERIT — the whole point: the card defers to the floor.
  greetings: [{ text: "A sketch of the road: ![hand-drawn map](/map.png)" }],
});

async function stubDeploymentFloor(page: Page, trustHtml: boolean): Promise<void> {
  await page.route("**/api/auth/config", (httpRoute) =>
    httpRoute.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "single-user",
        requiresLogin: false,
        localEnabled: false,
        oidcEnabled: false,
        discreetLogin: false,
        defaultHandle: null,
        multiHumanCapable: false,
        forbidExternalMedia: false,
        trustHtml,
      }),
    }),
  );
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => HTML_GREETING_CARD,
    "chat.listChats": () => [],
    "character.update": () => HTML_GREETING_CARD,
  });
}

// PRESENCE, not visibility: Streamdown mounts a rendered image `hidden` until its src loads and shows an
// "Image not available" fallback beside it (verified against the real seal), and the CT server has no
// /map.png. Whether the img ELEMENT exists at all is exactly the trust verdict — the untrusted allowlist
// drops it before it can be mounted.
const PREVIEW_IMAGE = 'img[alt="hand-drawn map"]';

test("DRAFT-TRUST: an INHERIT card previews TRUSTED when the deployment floor trusts HTML", async ({ mount, page }) => {
  await stubDeploymentFloor(page, true);
  const component = await mount(<CharacterEditorSurfaceStory />);
  await expect(component.locator(PREVIEW_IMAGE)).toHaveCount(1);
});

test("DRAFT-TRUST: the same INHERIT card previews UNTRUSTED on a strict floor (the combine, not a constant)", async ({ mount, page }) => {
  await stubDeploymentFloor(page, false);
  const component = await mount(<CharacterEditorSurfaceStory />);
  // The greeting still renders — only the img is dropped by the untrusted element allowlist.
  await expect(component.getByText("A sketch of the road:")).toBeVisible();
  await expect(component.locator(PREVIEW_IMAGE)).toHaveCount(0);
});

test("§6.5/§7 the header carries the token split + AutosaveStatus, and editing debounce-persists a diff", async ({ mount, page }) => {
  let updateInput: UpdateCall | null = null;
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => CARD,
    "chat.listChats": chatListResponder([]),
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

// ── THE HEADER MAY NOT SAY "Saved" OVER AN UNCOMMITTED EDIT (side-eye #81 P0) ─────────────────────────
// The test above proves the edit eventually PERSISTS; this one proves the header does not LIE while it is
// still in the debounce window. `AutosaveStatus` was fed the raw driver lifecycle, which starts and stays
// "saved" until the debounced submit begins — so for the whole ~500ms window (and forever, if the tab is
// closed inside it — the factory's own teardown note says a reload never unmounts React) the one line
// whose entire job is to say whether this character is saved said "Saved" over text that was nowhere but
// in the box. The fold now lives at the factory seam, which is why this pin lives at the EDITOR: the
// finding was filed against this surface, and a factory-only test would not prove this surface reads it.
//
// The proof is a recorded TRANSCRIPT, not a polled assertion — see the helper's header for why a window
// defect cannot be pinned by racing it.
test("#81 P0 — the header reads Saving… the instant the name is edited, never 'Saved' over the pending write", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // BARRIER: the clean mount has settled on its resting state before anything is recorded.
  const status = component.getByRole("status");
  await expect(status).toHaveText("Saved");

  await beginAutosaveStatusTranscript(page);
  await component.getByRole("textbox", { name: "Name" }).fill("Aria N.");

  // BARRIER: the debounced save has landed and the header is back to its resting state — the window the
  // transcript covers is closed, so the array below is final.
  await expect(status).toHaveText("Saved");

  // THE PIN: the first thing the header said after the keystroke was "Saving…", and it settled to "Saved"
  // only once the write actually landed. On the unfixed tree this reads ["Saved"] — the lie, recorded.
  expect(await readAutosaveStatusTranscript(page)).toEqual(["Saving…", "Saved"]);
});

test("§7/D78 — adding an opening persists the structural push via the store driver, then its content autosaves", async ({ mount, page }) => {
  let updateInput: UpdateCall | null = null;
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => CARD, // one greeting
    "chat.listChats": chatListResponder([]),
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
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => GREETINGS_CARD, // two greetings
    "chat.listChats": chatListResponder([]),
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
  await expect(component.getByRole("textbox", { name: "System prompt" })).toBeVisible();

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
  // ONE name in both directions since #840 — the state rides `aria-pressed`, not the label.
  await component.getByRole("button", { name: SPOILER_NAME }).click();
  await expect(fields.first()).toHaveClass(BLUR_CLASS_RE);
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");

  // Toggle off → the blur is gone (pure view state).
  await component.getByRole("button", { name: SPOILER_NAME }).click();
  await expect(fields.first()).not.toHaveClass(BLUR_CLASS_RE);
});

test("§6.2 removing a tag chip fires bulkRemoveCardTag by name — an immediate commit outside the card form", async ({ mount, page }) => {
  const tagged = makeCharacterDetail({ tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" })] });
  let removedInput: unknown = null;
  let cardUpdated = false;
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => tagged,
    "chat.listChats": chatListResponder([]),
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

// ── The stickler 2026-08-01 visual findings (F2 · F3 · F4) ─────────────────────────────────────────
// Folded into this file rather than new mirrors: all three are the character EDITOR experience (the hero
// band, its suggestion strip, and the CONTEXT tab that stands beside it), and each is a RENDERED defect —
// so every assertion below reads computed geometry or computed color, never a class string (a gate can be
// green while the pixels are wrong).

test("F2 the portrait trigger's box IS the portrait — no overflow past its own button", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  const trigger = component.getByRole("button", { name: "Replace portrait" });
  const readTriggerBoxAtAssertion = async (): Promise<typeof triggerBox> => await trigger.boundingBox();
  const triggerBox = await trigger.boundingBox();
  const avatarBox = await trigger.locator('[data-slot="avatar-root"]').boundingBox();

  // Under `size="icon"` the button stayed 34×34 while the avatar painted 64×64 over the Name label: the
  // image escaped its own click target by ~15px on every side, and the real hit area was the invisible box.
  await expect.poll(async () => (await readTriggerBoxAtAssertion())?.width).toBeCloseTo(avatarBox?.width ?? 0, 0);
  await expect.poll(async () => (await readTriggerBoxAtAssertion())?.height).toBeCloseTo(avatarBox?.height ?? 0, 0);
  await expect.poll(async () => (await readTriggerBoxAtAssertion())?.x).toBeCloseTo(avatarBox?.x ?? 0, 0);
  await expect.poll(async () => (await readTriggerBoxAtAssertion())?.y).toBeCloseTo(avatarBox?.y ?? 0, 0);
});

// F3 — twelve `intent="info"` pills were the loudest thing on the editor (UI-Density-Law §3.2 CD3:
// one focal element per surface). The strip is now GHOST chips: EVERY suggestion renders (owner ruling
// 2026-08-01 — the read surface shows everything, D113 (4b)) and weight, not count, carries the quiet —
// no fill at all, muted text. Fill stays reserved for the ACCEPTED tags in the row above.
const SUGGESTION_NAMES = ["noir", "detective", "mystery", "urban", "gritty", "1920s", "rain", "jazz", "smoke", "crime", "femme", "whiskey"];
const FIRST_SUGGESTION = "noir";
const ACCEPT_BUTTON_RE = /^Accept /;
const MORE_BUTTON_RE = /more$/;
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const TOKEN_TOTAL_RE = /\d+ total/;
const TOKEN_PERMANENT_RE = /permanent — sent every turn/;
/** The content header's own gloss (#493) — the pointer half of the same explanation. */
const TOKEN_SENT_EVERY_TURN_RE = /sent every turn/;
const INSPECT_HINT_RE = /to inspect it here/;

/** Twelve pending suggestions on this character (`TagSuggestionView` = a TagView + its characterId). */
function suggestionFixtures(): readonly unknown[] {
  return SUGGESTION_NAMES.map((name, index) => ({ ...makeTagFixture({ id: `tag_sug_${index}`, name }), characterId: "char_ct_1" }));
}

/** The same card, carrying ONE accepted tag — the accepted chip is the fill this strip must stay under. */
const SUGGESTIONS_CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  handle: castId<CharacterHandle>("aria"),
  greetings: [{ text: GREETING_0 }],
  tags: [makeTagFixture({ id: "tag_accepted", name: "rpg" })],
});

async function routeSuggestions(page: Page): Promise<void> {
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => SUGGESTIONS_CARD,
    "chat.listChats": chatListResponder([]),
    // The SUBJECT of this helper — listed after the spread, so it wins over the ambient empty default.
    "tag.listPendingSuggestions": () => suggestionFixtures(),
  });
}

test("F3 suggestions render as ghost chips — muted, unfilled, never info blue (the accepted tag keeps the fill)", async ({ mount, page }) => {
  await routeSuggestions(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  const chip = component.locator('[data-slot="character-tag-suggestions"] [data-slot="badge"]').first();
  await expect(chip).toBeVisible();
  // The muted voice: the intent's own text color, NOT the info pair the surface uses nowhere else.
  await expect(chip).toHaveCSS("color", resolvedTokenColor("color.muted-foreground"));
  await expect
    .poll(async () => chip.evaluate((node: Element): string => globalThis.getComputedStyle(node).backgroundColor))
    .not.toBe(resolvedTokenColor("color.info"));
  // GHOST weight — a resting suggestion paints NO fill at all; the accepted tag beside it still does.
  await expect.poll(async () => chip.evaluate((node: Element): string => globalThis.getComputedStyle(node).backgroundColor)).toBe(TRANSPARENT);
  const accepted = component.locator('[data-slot="character-tags"] [data-slot="badge"]').first();
  await expect.poll(async () => accepted.evaluate((node: Element): string => globalThis.getComputedStyle(node).backgroundColor)).not.toBe(TRANSPARENT);
});

test("F3 every pending suggestion renders at rest — no cap, no disclosure", async ({ mount, page }) => {
  await routeSuggestions(page);
  const component = await mount(<CharacterEditorSurfaceStory />);

  // All twelve, visible without a click: the read surface shows everything (D113 (4b)).
  await expect(component.getByRole("button", { name: ACCEPT_BUTTON_RE })).toHaveCount(SUGGESTION_NAMES.length);
  await expect(component.getByRole("button", { name: MORE_BUTTON_RE })).toHaveCount(0);
  await expect(component.getByRole("button", { name: `Dismiss ${FIRST_SUGGESTION}` })).toBeVisible();
});

// F4 — the CONTEXT Field tab used to open to 480×1000px of "Open a field to inspect it" beside a data-rich
// editor. It now rests on the overview instrument card, with the pick-a-field hint as its FOOTER.
const OVERVIEW_CARD = makeCharacterDetail({
  name: "Aria Nightshade",
  handle: castId<CharacterHandle>("aria"),
  greetings: [{ text: GREETING_0 }, { text: "A second hello." }],
  importedFrom: "chub",
  tags: [makeTagFixture({ id: "tag_rpg", name: "rpg" }), makeTagFixture({ id: "tag_noir", name: "noir" })],
});

/** One chat with this character + one with somebody else (the count must scope to the open character). */
const OVERVIEW_CHATS: readonly ChatSummaryFixture[] = [
  {
    id: "chat_ct_1",
    title: "A rainy night",
    starred: false,
    archived: false,
    parentChatId: null,
    lastMessageAt: 1_750_000_100_000,
    messageCount: 4,
    participantNames: ["Aria Nightshade"],
    participantCharacterIds: ["char_ct_1"],
    participantPortraits: [makeSeatPortrait("char_ct_1", "Aria Nightshade")],
    lastMessagePreview: null,
    isGame: false,
    gamePaused: false,
    viewerRole: "host",
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_100_000,
  },
  {
    id: "chat_ct_2",
    title: "Elsewhere",
    starred: false,
    archived: false,
    parentChatId: null,
    lastMessageAt: 1_750_000_200_000,
    messageCount: 2,
    participantNames: ["Someone else"],
    participantCharacterIds: ["char_other"],
    participantPortraits: [makeSeatPortrait("char_other", "Someone else")],
    lastMessagePreview: null,
    isGame: false,
    gamePaused: false,
    viewerRole: "host",
    createdAt: 1_750_000_000_000,
    updatedAt: 1_750_000_200_000,
  },
];

// #493 (side-eye 2026-08-22 rail-characters P2-4) — `1257 total · 1017 permanent` is the first thing on the
// editor and its jargon had NO explanation on this surface: `title`, `aria-label` and `aria-describedby` all
// verified null, while the only copy that says what "permanent" means ("sent every turn") lives in the
// CONTEXT pane, 300px away and closed by default. The datum now carries its own gloss where it is read.
test("#493 the editor header's token census glosses its own jargon", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHARACTER_EDITOR_AMBIENT_ROUTES, "character.get": () => OVERVIEW_CARD, "chat.listChats": chatListResponder([]) });
  const component = await mount(<CharacterEditorSurfaceStory />);

  const census = component.getByText(TOKEN_TOTAL_RE).first();
  await expect(census).toBeVisible();
  // The SPOKEN name explains the split; the visible mono line is untouched (it is the glanceable one).
  await expect(census).toHaveAttribute("aria-label", TOKEN_PERMANENT_RE);
  await expect(census).toHaveAttribute("title", TOKEN_SENT_EVERY_TURN_RE);
});

// F4 (the ruling: a CONTEXT panel that opens to "Open a field to inspect it" fails its instrument tier)
// SURVIVES — its INPUT changed. #513 replaced the card's four ECHO rows (tokens · openings · tags · chats,
// all of which CONTENT prints 300px to the left) with rows CONTENT never shows. So this pin asserts BOTH
// halves — the panel is still an instrument, and it is no longer a second copy of the editor.
//
// #513'S OWN LINKS + OPTIONS GROUPS ARE GONE, AND THAT RULING SURVIVES TOO — ITS INPUT CHANGED (#860, owner
// 2026-08-30). They were minted here as a glance AHEAD of the Links and Options tabs, which was right while
// those tabs were a strip away. The 2026-08-30 delta pass then measured both rendering as a section INSIDE
// this tab *and* as their own tabs, simultaneously visible in one 384px pane — two homes for one concept,
// the exact IA defect the card exists to avoid — and the context-panel program put every tab on a
// persistent foot rail, so a preview of a control that is always on screen is chrome, not a glance. What
// replaces them is the ruled Overview roster: ORIGIN + ACTIVITY + TAGS.
test("F4/#513 the Overview tab rests on an overview card carrying what CONTENT does not", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => OVERVIEW_CARD,
    "chat.listChats": chatListResponder(OVERVIEW_CHATS),
  });
  const component = await mount(<CharacterFacetInspectorStory />);

  const overview = component.locator('[data-slot="character-overview"]');
  await expect(overview).toBeVisible();
  const row = (label: string): ReturnType<typeof overview.locator> => overview.locator('[data-slot="overview-row"]').filter({ hasText: label });

  // ORIGIN — where this card came from (the import source is a fact CONTENT never states).
  await expect(overview.getByText("chub")).toBeVisible();
  // ACTIVITY — recency, not a census: the hero's "N chats ›" is the count.
  await expect(row("Last chat")).toBeVisible();
  // TAGS — read-only, the count as the datum (the EDITING strip stays in the CONTENT hero).
  await expect(row("Applied")).toBeVisible();

  // THE ECHOES ARE GONE (#513): each of these is printed by CONTENT on the same screen.
  await expect(overview.getByText(TOKEN_TOTAL_RE)).toHaveCount(0);
  await expect(row("Openings")).toHaveCount(0);
  await expect(row("Handle")).toHaveCount(0);
  await expect(row("Chats")).toHaveCount(0);
  // …AND SO ARE THE TAB PREVIEWS (#860): Links and Options each had a home here AND a tab of their own.
  await expect(row("World books")).toHaveCount(0);
  await expect(row("Personas")).toHaveCount(0);
  await expect(row("HTML")).toHaveCount(0);
  await expect(row("External media")).toHaveCount(0);

  // The old resting state is still gone; the instruction survives as the footer gloss.
  await expect(component.getByText("Open a field to inspect it")).toHaveCount(0);
  await expect(overview.getByText(INSPECT_HINT_RE)).toBeVisible();
});

// MACU-2 (owner ruling 2026-08-03, "the macro plane goes everywhere macros WORK") — a card's free-text facets
// complete against the USER-MACRO PLANE, not a two-item hand list. They qualify on MECHANISM: card fields are
// rendered during turn assembly by `renderMemberField` → `renderMacros` with the PER-TURN registry
// `buildTurnUserMacros` composes (builtins + the active preset's `userMacros` + the game's), so a macro the
// author declared on their preset genuinely resolves in a description. The plane is read from the ACTIVE
// preset (`seeds.defaultPresetId`), which is the closest true answer a card editor can have — a card is
// authored once and played in many rooms. The assertion is the popover ROW (the affordance), and the fixture
// macro's name has no builtin fuzzy match, so the row cannot be satisfied by the builtin catalog alone.

const MACRO_USER_ROW = "{{sceneTone}}";
const MACRO_USER_GLOSS = "This game's tonal register.";

test("MACU-2: a card facet completes against the ACTIVE PRESET's user macros", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => CARD,
    "chat.listChats": chatListResponder([]),
    "character.update": () => CARD,
    // The SUBJECT here — the seeded default preset. After the spread, so this partial wins over the
    // ambient full-defaults settings row.
    "settings.getUserSettings": () => ({ config: { seeds: { defaultPresetId: "preset_ct_active" } } }),
    "preset.get": () => ({
      config: { userMacros: [{ name: "sceneTone", description: MACRO_USER_GLOSS, args: [], body: "hushed", inputs: [], strict: false }] },
    }),
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  await component.getByRole("button", { name: DESCRIPTION_ROW }).click();
  const body = component.getByRole("textbox", { name: "Description" });
  await expect(body).toBeVisible();
  await body.click();
  await body.pressSequentially("{{scen");

  await expect(page.getByRole("option", { name: MACRO_USER_ROW })).toBeVisible();
  await expect(page.getByText(MACRO_USER_GLOSS)).toBeVisible();
});

// THE CONTAINING-BLOCK PIN (phantom-scroll CLASS sweep, 2026-08-14). This surface owns its scroll axis (`h-full overflow-y-auto`).
// An `overflow` scroller only clips — and only absorbs the scrollable overflow of — an absolutely-positioned
// descendant whose CONTAINING BLOCK is inside it. A `position: static` scroller establishes none, so the
// `sr-only` boxes Base UI form primitives emit (`position: absolute` — NumberField's bounds announcer,
// Switch/Checkbox's hidden input, the combobox status line) resolve theirs further up and add their static
// positions to a POSITIONED ancestor's scrollable area instead. That is the owner's 2026-08-13 "scrolls past
// the end of its results" defect (fixed once for the settings pane region, swept as a class here), and
// `relative` on the scroller is the whole fix. `readPhantomScrollers` measures the MECHANISM document-wide —
// the SYMPTOM needs a positioned scrolling host, which is the settings shell CT's own story.
test("no absolutely-positioned box escapes the character editor's scroller (the containing-block pin)", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);
  // SETTLED: the hero's draft field is the surface's own last paint, so every facet row (and its form
  // primitives' sr-only boxes) exists by the time the sweep walks the document.
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Aria Nightshade");

  expect(await readPhantomScrollers(page)).toEqual([]);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE 2026-08-18 SIDE-EYE PASS (rail sweep 3/9, reports/design/rail-characters-2026-08-18.md).

/** The phone the review measured both editor findings at. */
const PHONE_PX = 430;
/** The character's name at that width, and the five letters it was clipped to. */
const HERO_NAME = "Aria Nightshade";
/** An unfilled facet row's gloss is any authored sentence — the claim is that one is ANNOUNCED, not which. */
const ANY_TEXT = /./u;
/** The card's own prose — the wall that must never be back in an accessible NAME or DESCRIPTION. */
const CARD_BODY_RE = /cartographer/u;
/** What a filled row's description carries instead since #254: a state and a magnitude, no body. */
const FILL_STATE_RE = /^Filled, \d+ characters$/u;
/** The OWN LOOK badge, and the tab name that never existed. */
const OWN_LOOK_RE = /carries its own look/u;
const APPEARANCE_TAB_RE = /Appearance tab/u;

// ── The 2026-08-30 delta pass's vocabulary (#840 / #843) ──
/** The chip's VISIBLE text, which is now also its accessible name (WCAG 2.5.3). */
const OWN_LOOK_NAME = "Own look";
/** …and the gloss it used to carry as that name, now its DESCRIPTION. */
const OWN_LOOK_SENTENCE = "This card carries its own look — edit it in the Look tab.";
/** The spoiler toggle's ONE name — it no longer flips (`aria-pressed` carries the state). */
const SPOILER_NAME = "Hide spoilers";
/** design-audit's `undersized-ui-text` floor: the smallest a CONTROL's own label may compute. */
const UI_TEXT_FLOOR_PX = 11;

/** One node's COMPUTED font size — the route design-audit takes, and the only one that sees the defect: a
 *  suggestion pill's BUTTON computes 13px while the label span inside it computed 10.5. */
function fontSizePx(node: Locator): Promise<number> {
  return node.evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize));
}

// P1-2 — every facet row's Button carried the whole field BODY as its accessible name: the Description
// row measured 1,283 characters, Example messages ~2,000, announced as the NAME of a control with nothing
// saying what activating it does (WCAG 2.4.6 / 4.1.2). The correct pattern already shipped one component
// over (the list rows' aria-label + aria-describedby; Lighthouse's mismatch flag on it is a FALSE POSITIVE
// — the review's retraction R2 — so the list rows are deliberately untouched).
test("P1-2 a FILLED facet row is named by its LABEL, not by the field body it previews", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue(HERO_NAME);

  // The row whose preview is a paragraph of the card's own prose.
  const row = component.getByRole("button", { name: "Description", exact: true });
  await expect(row).toHaveAccessibleName("Description");
  // The preview is still on screen — this is a NAMING fix, not a content one.
  await expect(component.getByText(CARD.description ?? "")).toBeVisible();
  // …and the BODY is not the row's DESCRIPTION either: a 1,283-character description only moves the wall.
  // The pin is the WALL's absence, not an empty description — #254 found that an empty one made a filled
  // row and an empty one announce identically, so the description now carries a terse fill STATE (the count,
  // never the prose; the full arms live in character-facet-row.ct.tsx). The original ruling is intact: what
  // it forbade was the body, and the body is still gone.
  await expect(row).not.toHaveAccessibleDescription(CARD_BODY_RE);
  await expect(row).toHaveAccessibleDescription(FILL_STATE_RE);
});

test("P1-2 an EMPTY facet row keeps its gloss as the DESCRIPTION — the one line worth announcing", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);
  // An UNFILLED facet on this card (the fixture authors name/description/systemPrompt/exampleMessages).
  const row = component.getByRole("button", { name: "Note at depth", exact: true });
  await expect(row).toHaveAccessibleName("Note at depth");
  // The gloss tells a screen-reader user what the facet DOES; it is short, authored, and not an echo.
  await expect(row).toHaveAccessibleDescription(ANY_TEXT);
});

// P1-4 — at 430px the save bar rendered `Sabin…  Character  1257 total · 1017 permanent  Saved`: the name
// got 54px (of a 90px string) while the diagnostic got 231px, 54% of the viewport. The title was the one
// box allowed to yield because every trailing sibling was `shrink-0`.
test("P1-4 on a phone the save bar prints the NAME whole — the census takes its own line", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory width={PHONE_PX} />);
  const title = component.locator('[data-slot="save-bar-title"]');
  await expect(title).toHaveText(HERO_NAME);

  // Not clipped — the whole point. (`scrollWidth > clientWidth` is what "Sabin…" looked like.)
  await expect.poll(async () => title.evaluate((el: Element) => el.scrollWidth > el.clientWidth)).toBe(false);

  // The census is not hidden, abbreviated or behind a tap — it moved to its own full-width line BELOW the
  // identity, which is what makes both readable at once.
  const meta = component.locator('[data-slot="save-bar-meta"]');
  await expect(meta.getByText(TOKEN_SPLIT_RE)).toBeVisible();
  const [titleBox, metaBox] = await Promise.all([title.boundingBox(), meta.boundingBox()]);
  expect(metaBox?.y ?? 0).toBeGreaterThan(titleBox?.y ?? 0);
});

test("P1-4 at desk width the census stays INLINE — the wrap is a narrow arm, not the new normal", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);
  const title = component.locator('[data-slot="save-bar-title"]');
  const meta = component.locator('[data-slot="save-bar-meta"]');
  await expect(meta.getByText(TOKEN_SPLIT_RE)).toBeVisible();
  const [titleBox, metaBox] = await Promise.all([title.boundingBox(), meta.boundingBox()]);
  // Same LINE: the two boxes overlap vertically (they are baseline- vs centre-aligned, so their tops are
  // near but not equal) and the census sits to the RIGHT of the name, never under it.
  expect(metaBox?.y ?? 0).toBeLessThan((titleBox?.y ?? 0) + (titleBox?.height ?? 0));
  expect(metaBox?.x ?? 0).toBeGreaterThan(titleBox?.x ?? 0);
});

// P2-5 — the suggestion block was 588px on a 932px phone (63% of the viewport), in 8 ragged rows whose
// median fill was ~55%, because every chip carried TWO 44px coarse icon buttons and ran 125-236px wide.
// This is GEOMETRY, not the D113(4b) cap ruling: every suggestion still renders.
test.describe("P2-5 suggestion chips at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("the chips PACK — one control per verb, both still at the touch floor", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await routeSuggestions(page);
    const component = await mount(<CharacterEditorSurfaceStory width={PHONE_PX} />);
    const block = component.locator('[data-slot="character-tag-suggestions"]');
    await expect(component.getByRole("button", { name: ACCEPT_BUTTON_RE })).toHaveCount(SUGGESTION_NAMES.length);

    // THE TOUCH FLOOR IS LAW (D62 P1) — the fix is the control COUNT, never a shaved target. Both verbs
    // are read from the live token, not a literal 44.
    const floor = await touchFloorPx(page);
    const accept = await component.getByRole("button", { name: `Accept ${FIRST_SUGGESTION}` }).boundingBox();
    const dismiss = await component.getByRole("button", { name: `Dismiss ${FIRST_SUGGESTION}` }).boundingBox();
    expect(accept?.height ?? 0).toBeGreaterThanOrEqual(floor);
    expect(dismiss?.height ?? 0).toBeGreaterThanOrEqual(floor);
    expect(dismiss?.width ?? 0).toBeGreaterThanOrEqual(floor);

    // ROW FILL is the finding, stated directly: group the chips by their top edge and measure how much of
    // the block's width each row actually spends. The review measured a ~55% median over 8 rows.
    const readFillAtAssertion = async (): Promise<typeof fill> =>
      await block.evaluate((el: Element) => {
        const chips = [...el.querySelectorAll('[data-slot="badge"]')].map((node) => node.getBoundingClientRect());
        const rows = new Map<number, number>();
        for (const box of chips) {
          rows.set(Math.round(box.top), (rows.get(Math.round(box.top)) ?? 0) + box.width);
        }
        const width = el.getBoundingClientRect().width;
        const spent = [...rows.values()].map((sum) => sum / width).toSorted((a, b) => a - b);
        return { rows: rows.size, median: spent[Math.floor(spent.length / 2)] ?? 0, height: el.getBoundingClientRect().height };
      });
    const fill = await block.evaluate((el: Element) => {
      const chips = [...el.querySelectorAll('[data-slot="badge"]')].map((node) => node.getBoundingClientRect());
      const rows = new Map<number, number>();
      for (const box of chips) {
        rows.set(Math.round(box.top), (rows.get(Math.round(box.top)) ?? 0) + box.width);
      }
      const width = el.getBoundingClientRect().width;
      const spent = [...rows.values()].map((sum) => sum / width).toSorted((a, b) => a - b);
      return { rows: rows.size, median: spent[Math.floor(spent.length / 2)] ?? 0, height: el.getBoundingClientRect().height };
    });
    // MEASURED on this fixture (12 suggestions, 430px, coarse): median row fill 0.71 over 6 rows, block
    // height 380px — against 0.55 over 8 rows and 588px before. Both fences sit BELOW the measurement, so
    // they fence the CLASS of defect (a rail that cannot pack) rather than a pixel that a token retune moves.
    await expect.poll(async () => (await readFillAtAssertion()).median).toBeGreaterThan(0.65);
    // …and the block stops owning two thirds of the phone.
    await expect.poll(async () => (await readFillAtAssertion()).height).toBeLessThan(450);
  });
});

// P2-7 — the surface's ONE help pointer named a tab that does not exist. The CONTEXT tabs are
// Field / Links / Options (`characters-section.tsx`), the theme editor lives under Options, and the
// Settings modal DOES have an "Appearance" category — so anyone who followed the old sentence landed in
// the wrong surface entirely.
test("P2-7 the OWN LOOK badge points at the tab that actually holds the theme editor", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => ({ ...CARD, themeOverride: { primary: "#ff8800" } }),
    "chat.listChats": chatListResponder([]),
    "character.update": () => CARD,
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  // The SENTENCE is still delivered — it moved from the badge's NAME to the tooltip it describes itself
  // with (#840, below), which is where a gloss belongs. What this test has always been about is that the
  // sentence names a tab that EXISTS, so it reads the sentence where a user now meets it.
  const badge = component.getByRole("button", { name: OWN_LOOK_NAME });
  await badge.focus();
  await expect(page.getByRole("tooltip")).toHaveText(OWN_LOOK_SENTENCE);
  // The name a user could follow to nowhere.
  await expect(component.getByText(APPEARANCE_TAB_RE)).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE 2026-08-30 SIDE-EYE DELTA PASS (docs/reviews/side-eye/2026-08-30-rail-characters-delta.md).
// Three controls that described themselves wrongly (#840) + the suggestion pills' type step (#843).

// #840a — THE SPOILER EYE ANNOUNCED THE INVERSE OF REALITY IN ONE OF ITS TWO STATES. It flipped BOTH its
// accessible name (`Hide spoilers` → `Show spoilers`) and `aria-pressed` (false → true), so with spoilers
// HIDDEN it announced "Show spoilers, toggle button, pressed" — which a screen-reader user reads as
// "showing is ON". ARIA APG allows a flipping NAME (describing the next action) or `aria-pressed`
// (describing the current state), never both. The receipt is the pair, before and after one click.
test("#840 the spoiler eye keeps ONE name and lets aria-pressed carry the state", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue(HERO_NAME);

  const eye = component.getByRole("button", { name: SPOILER_NAME });
  await expect(eye).toHaveAttribute("aria-pressed", "false");
  await eye.click();
  // The SAME control, still findable by the SAME name — that is the half that used to move.
  await expect(component.getByRole("button", { name: SPOILER_NAME })).toHaveAttribute("aria-pressed", "true");
  // …and the inverted announcement is gone: nothing on the surface is named "Show spoilers" any more.
  // (The model this copies is `Select multiple` on the LIBRARY pane — static name, `aria-pressed` false→
  // true — which is what makes the eye a defect rather than a house style; it is pinned on that surface.)
  await expect(component.getByRole("button", { name: "Show spoilers" })).toHaveCount(0);
});

// #840b — THE `Own look` CHIP: `role="img"` on a text badge, a whole SENTENCE as its accessible name while
// its visible text read `Own look` (WCAG 2.5.3 Label in Name), and `tabindex=-1` with no `title`, so the
// one sentence on the surface that says WHERE a character's look is edited reached a screen reader and a
// mouse and nobody else. The pin is all three at once, through the affordance: a focusable control NAMED
// by its visible text, DESCRIBED by the sentence.
test("#840 the Own look chip is named by its visible text and its gloss is keyboard-reachable", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => ({ ...CARD, themeOverride: { primary: "#ff8800" } }),
    "chat.listChats": chatListResponder([]),
    "character.update": () => CARD,
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  const chip = component.getByRole("button", { name: OWN_LOOK_NAME });
  // 2.5.3: the accessible name IS the visible label, exactly.
  await expect(chip).toHaveAccessibleName(OWN_LOOK_NAME);
  // The role a text badge never had any business carrying.
  await expect(component.getByRole("img", { name: OWN_LOOK_RE })).toHaveCount(0);
  // KEYBOARD REACH — the half a name/role fix alone would not have bought, and the half that was
  // structurally impossible at `tabindex=-1`. Focus it directly (a tab walk from an arbitrary resting
  // position is a different assertion) and read the gloss it opens.
  await chip.focus();
  await expect(chip).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText(OWN_LOOK_SENTENCE);
  // …and the tooltip is what DESCRIBES it, so the sentence is announced as a description rather than
  // impersonating the name. (`aria-describedby` resolves only while the popup is mounted — the seal wires
  // the id on the trigger and the id onto the popup, so the pairing is only observable open.)
  await expect(chip).toHaveAccessibleDescription(OWN_LOOK_SENTENCE);
});

// #840c — THE TAG ROW HAD NO NAME. Its accessible tree read `paragraph: Empty` then `button "Add tag"`;
// the word "Tags" appeared nowhere in it, so the value was unlabelled and the datum had to be inferred
// from the verb beside it. The four ADVANCED facet rows name their datum; this is the same grammar.
test("#840 the tag row is a group NAMED Tags", async ({ mount, page }) => {
  await routeEditor(page);
  const component = await mount(<CharacterEditorSurfaceStory />);
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue(HERO_NAME);

  const tags = component.getByRole("group", { name: "Tags" });
  await expect(tags).toBeVisible();
  // The name covers the VALUE, which is the thing that was anonymous — the verb was always named.
  await expect(tags.getByRole("button", { name: "Add tag" })).toBeVisible();
});

// #843(1) — THE SUGGESTION PILLS' LABEL SPANS WERE 10.5px INTERACTIVE TEXT (`design-audit`
// `undersized-ui-text` ×6, both pointer arms). The trap the review recorded: the BUTTON computes 13px and
// the label SPAN inside it computed 10.5, so reading the button node dismisses a true finding. This reads
// the span, by the same route design-audit does — the text node's own computed size.
test("#843 a suggestion pill's own label clears the 11px functional floor", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => CARD,
    "chat.listChats": chatListResponder([]),
    "character.update": () => CARD,
    "tag.listPendingSuggestions": () => [makeTagFixture({ id: "tag_banter", name: "banter" })],
  });
  const component = await mount(<CharacterEditorSurfaceStory />);

  const pill = component.getByRole("button", { name: "Accept banter" });
  await expect(pill).toBeVisible();
  await expect.poll(() => fontSizePx(pill.getByText("banter", { exact: true }))).toBeGreaterThanOrEqual(UI_TEXT_FLOOR_PX);
  // The `Suggested` kicker stays at the micro step — the finding was about a CONTROL's own label, and a
  // blanket bump would have taken the footnote voice with it.
  await expect.poll(() => fontSizePx(component.getByText("Suggested", { exact: true }))).toBeLessThan(UI_TEXT_FLOOR_PX);
});
