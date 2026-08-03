// CT: the D22 read-only, level-clamped member card-viewer (member-card-viewer.tsx). Drives the
// production path over the stubbed network (routeTrpc `chat.getMemberCard`). Proves three shapes:
//  - a `sheet`-clamped card: the description renders, the `full`-tier system-prompt section is ABSENT,
//    and the "hidden at this level" note stands in for the withheld prompt-internals tier.
//  - a `full` card: every present tier renders (description + lore + system prompt), zero hidden notes.
//  - the transport NOT_FOUND arm: a TYPED gone-arm (not a crash, not the transient Retry) — the card
//    left the roster / no access.
// The read is GATED on `open` and the viewer starts open, so the CT asserts the loaded card directly.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { MemberCardViewerStory } from "../_ct-stories.tsx";

const CHARACTER_ID = "character_ct_membercard";
const NAME_RE = /Aria Vex/u;

// The always-present name-avatar floor every clamp level carries.
const FLOOR = {
  characterId: CHARACTER_ID,
  name: "Aria Vex",
  avatarAssetId: null,
  avatarHash: null,
};

// A `sheet`-level projection: sheet fields present, sheet+lore and full fields NULL (clamped away).
function sheetCard(): unknown {
  return {
    ...FLOOR,
    visibility: "sheet",
    description: "A wandering cartographer who maps places that do not want to be found.",
    personality: "Curious, dry-humored, allergic to authority.",
    scenario: "The tavern at the edge of the mapped world.",
    greetings: ["You look lost. Good — the lost see more."],
    exampleMessages: "{{char}}: The map is not the territory.",
    tags: ["explorer", "rogue"],
    creatorNotes: null,
    lore: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    authorsNoteDepth: null,
  };
}

// A `full` projection: every tier present.
function fullCard(): unknown {
  return {
    ...FLOOR,
    visibility: "full",
    description: "A wandering cartographer.",
    personality: "Curious.",
    scenario: "The tavern.",
    greetings: ["You look lost."],
    exampleMessages: "{{char}}: The map is not the territory.",
    tags: ["explorer"],
    creatorNotes: "Based on a dream.",
    lore: ["The mapped world ends at the Grey Shelf."],
    systemPrompt: "You are Aria, a cartographer. Speak tersely.",
    postHistoryInstructions: "Stay in character.",
    authorsNoteDepth: 4,
  };
}

test("a sheet-clamped card shows the sheet fields and HIDES the prompt internals behind a note", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getMemberCard": () => sheetCard() });

  await mount(<MemberCardViewerStory />);
  const viewer = page.getByTestId("member-card-viewer");

  // The name-avatar floor + the sheet content render. The name renders exactly ONCE (side-eye P2 — the
  // avatar+name block IS the dialog title; no duplicate span beneath the h2).
  await expect(viewer.getByText("Aria Vex", { exact: true })).toHaveCount(1);
  await expect(viewer.getByText("Card sheet", { exact: false })).toBeVisible();
  await expect(viewer.getByText("wandering cartographer", { exact: false })).toBeVisible();
  await expect(viewer.getByText("explorer", { exact: true })).toBeVisible();

  // Section titles are REAL h3 headings in the ARIA tree (side-eye P2 a11y — an SR user navigates by
  // heading), visual style unchanged. The dialog title is the h2 (the name); the sections are h3.
  await expect(viewer.getByRole("heading", { level: 3, name: "Description" })).toBeVisible();
  await expect(viewer.getByRole("heading", { level: 3, name: "Personality" })).toBeVisible();
  await expect(viewer.getByRole("heading", { level: 2, name: NAME_RE })).toBeVisible();

  // The `full` tier (system prompt) is ABSENT — never sent over the wire — and its withholding is
  // surfaced as the quiet hidden-tier note, never an empty box. A `sheet` card withholds BOTH the
  // sheet+lore tier AND the full tier, so exactly two hidden-tier notes render.
  await expect(viewer.getByText("You are Aria", { exact: false })).toHaveCount(0);
  await expect(viewer.getByTestId("member-card-hidden-note")).toHaveCount(2);
  await expect(viewer.getByText("Prompt internals hidden", { exact: false })).toBeVisible();
  await expect(viewer.getByText("Lore hidden", { exact: false })).toBeVisible();
});

test("a name-avatar-clamped card shows ONLY the floor, with a single hidden-tier note", async ({ mount, page }) => {
  // The floor-only clamp: every field above name-avatar is null. The tier gating keys on `visibility`
  // (NOT a field null), so exactly ONE hidden note (the sheet gate) renders — not stacked lore/full notes.
  await routeTrpc(page, {
    "chat.getMemberCard": () => ({
      ...FLOOR,
      visibility: "name-avatar",
      description: null,
      personality: null,
      scenario: null,
      greetings: null,
      exampleMessages: null,
      tags: null,
      creatorNotes: null,
      lore: null,
      systemPrompt: null,
      postHistoryInstructions: null,
      authorsNoteDepth: null,
    }),
  });

  await mount(<MemberCardViewerStory />);
  const viewer = page.getByTestId("member-card-viewer");

  // The name renders exactly once even at the floor clamp (side-eye P2 — single title, no duplicate span).
  await expect(viewer.getByText("Aria Vex", { exact: true })).toHaveCount(1);
  await expect(viewer.getByText("Name & avatar only", { exact: false })).toBeVisible();
  // One note — the sheet gate — never three stacked tier notes.
  await expect(viewer.getByTestId("member-card-hidden-note")).toHaveCount(1);
  await expect(viewer.getByText("name and avatar", { exact: false })).toBeVisible();
});

test("a full card renders every tier (description + lore + system prompt) with no hidden note", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getMemberCard": () => fullCard() });

  await mount(<MemberCardViewerStory />);
  const viewer = page.getByTestId("member-card-viewer");

  await expect(viewer.getByText("Full card", { exact: false })).toBeVisible();
  await expect(viewer.getByText("wandering cartographer", { exact: false })).toBeVisible();
  await expect(viewer.getByText("Grey Shelf", { exact: false })).toBeVisible();
  await expect(viewer.getByText("You are Aria", { exact: false })).toBeVisible();

  // The name renders once (the h2 title); the full-tier sections are real h3 headings in the ARIA tree.
  await expect(viewer.getByText("Aria Vex", { exact: true })).toHaveCount(1);
  await expect(viewer.getByRole("heading", { level: 3, name: "System prompt" })).toBeVisible();
  await expect(viewer.getByRole("heading", { level: 3, name: "Lore" })).toBeVisible();

  // Nothing is clamped away — no hidden-tier note anywhere.
  await expect(viewer.getByTestId("member-card-hidden-note")).toHaveCount(0);
});

test("a NOT_FOUND read is a typed gone-arm — never a crash or the transient Retry", async ({ mount, page }) => {
  // The verb's leak-free member/roster collapse maps to NOT_FOUND at transport.
  await routeTrpc(page, { "chat.getMemberCard": () => trpcError({ code: "NOT_FOUND", message: "no such member card" }) });

  await mount(<MemberCardViewerStory />);
  const viewer = page.getByTestId("member-card-viewer");

  await expect(viewer.getByText("This card isn't available", { exact: false })).toBeVisible();
  // The gone-arm is NOT the transient Retry surface.
  await expect(viewer.getByRole("button", { name: "Retry" })).toHaveCount(0);
});
