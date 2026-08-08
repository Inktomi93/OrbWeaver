// CT: the Actions readout's DELIVERY PATH is PER-KIND (the Actions-tab IA §2.3 / UI-Arch §4.2 — CONTEXT is
// config OF the active artifact). The founding defect (side-eye 2026-08-08, receipt
// `reports/snaps/readout-update-party.png`): the marker cluster was a STANDING render, so a guided steer, a
// game-turn teach, and an extraction tool description all read the byte-identical "Guided instruction ·
// position SETUP · role system" — a FALSE path for everything outside the guided family — and the trailing
// gloss claimed chat-macro resolution for tokens the chat macro engine deliberately passes through.
//
// Each pin selects a REAL row through the production store door (the story's `selectPresetTemplate`) and
// asserts the KIND's truth plus the ABSENCE of the marker cluster — the absence is the defect's exact shape,
// so a regression that re-promotes the standing cluster reds here by name.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../../support/ct/route-trpc.ts";
import {
  PresetReadoutExtractBoundStory,
  PresetReadoutExtractSelectedStory,
  PresetReadoutTeachSelectedStory,
  PresetReadoutUnboundStory,
} from "./_readout-stories.tsx";

const PRESET = "preset_ct_readoutbind";
const CHAT = "chat_ct_readoutbind";

const PRESET_DETAIL = {
  id: PRESET,
  name: "Preset R",
  kind: "custom",
  isSystemDefault: false,
  forkedFrom: null,
  createdAt: 0,
  updatedAt: 0,
  config: DEFAULT_PROMPT_CONFIG,
  schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
};

/** The bound read's answer for the EXTRACT case: the chat resolved what it could and passed the seam's DATA
 *  tokens through untouched (`kit/macro`'s unknown-macro passthrough) — exactly the verb's real shape. */
const RESOLVED = {
  identity: { user: "Nate", char: "Azarael" },
  templates: [
    { id: "response", resolved: "Azarael responds. {{input}}" },
    { id: "rpg.extract.tool.updateParty", resolved: "Record changes to any actor. {{actorTrackers}} {{partyExample}}" },
  ],
};

const SETTINGS_VIEW = { userId: "user_ct_readout", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const CHAT_SUMMARY = { id: CHAT, title: "Azarael & the Court", star: false, messageCount: 4, lastMessageAt: 1, parentChatId: null };

/** The guided family's unbound-gloss tell — the sibling suite's own spelling (`readout-binding.ct.tsx`). */
const RESOLVES_IN_CHAT_RE = /resolves in chat/i;

function readoutRoutes(): Record<string, unknown> {
  return {
    "preset.get": () => PRESET_DETAIL,
    "preset.list": () => [PRESET_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => trpcError({ message: "no chat connection configured" }),
    "preset.resolveEffective": () => ({ presetId: PRESET, model: "qwen3-32b", knobs: {}, stale: [] }),
    "chat.listChats": () => [CHAT_SUMMARY],
    "chat.previewActionTemplates": () => RESOLVED,
  };
}

test("a TEACH row's delivery path is the game turn's steering reminder — never the guided marker", async ({ mount, page }) => {
  await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutTeachSelectedStory />);

  await expect(probe.getByRole("heading", { name: "Delivery path" })).toBeVisible();
  await expect(probe.getByText("The game turn", { exact: true })).toBeVisible();
  await expect(probe.getByText("steering reminder", { exact: false })).toBeVisible();
  // The row-specific condition rides the panel — the reader may have scrolled the list away.
  await expect(probe.getByText("This row — A game turn with Deception on", { exact: false })).toBeVisible();
  // THE DEFECT'S EXACT SHAPE: no marker cluster for a row that never rides it.
  await expect(probe.getByText("Guided instruction", { exact: false })).toHaveCount(0);
  await expect(probe.getByText("position", { exact: true })).toHaveCount(0);
  // The unbound gloss states the names-only identity resolution, not the guided family's chat-macro claim.
  await expect(probe.getByText("identity registry", { exact: false })).toBeVisible();
  await expect(probe.getByText("Every macro here resolves in chat", { exact: false })).toHaveCount(0);
});

test("an EXTRACT row's delivery path is the state round — its bytes never enter the chat prompt", async ({ mount, page }) => {
  await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutExtractSelectedStory />);

  await expect(probe.getByRole("heading", { name: "Delivery path" })).toBeVisible();
  await expect(probe.getByText("The state round", { exact: true })).toBeVisible();
  await expect(probe.getByText("never enter the chat prompt", { exact: false })).toBeVisible();
  await expect(probe.getByText("Guided instruction", { exact: false })).toHaveCount(0);
  // The RESOLVED kicker wears the row's HUMAN label (the P2 grammar fix) — never the wire name shouted.
  await expect(probe.getByRole("heading", { name: "Resolved — Party update" })).toBeVisible();
  // The unbound gloss: seam-spliced DATA, not chat macros.
  await expect(probe.getByText("spliced from the game's own data", { exact: false })).toBeVisible();
  await expect(probe.getByText("Every macro here resolves in chat", { exact: false })).toHaveCount(0);
});

test("a GUIDED row keeps the marker cluster — health, position, role, and the cross-link", async ({ mount, page }) => {
  await routeTrpc(page, readoutRoutes());
  // The default story selects `impersonate` (voice) — a marker-family kind.
  const probe = await mount(<PresetReadoutUnboundStory />);

  await expect(probe.getByRole("heading", { name: "Delivery path" })).toBeVisible();
  await expect(probe.getByText("Guided instruction", { exact: true })).toBeVisible();
  await expect(probe.getByText("position", { exact: true })).toBeVisible();
  await expect(probe.getByText("role", { exact: true })).toBeVisible();
  // The guided family's unbound gloss is unchanged — every macro there really does resolve in chat.
  await expect(probe.getByText(RESOLVES_IN_CHAT_RE)).toBeVisible();
});

test("BOUND + extract — the deferred-token tail states the state-round splice, never a click", async ({ mount, page }) => {
  await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutExtractBoundStory />);

  // The chat resolved identity; the seam's data tokens survived as tokens (the verb's real passthrough).
  await expect(probe.getByRole("heading", { name: "Resolved — Party update" })).toBeVisible();
  await expect(probe.getByText("{{actorTrackers}}", { exact: true })).toBeVisible();
  // The tail names the real fill-in moment. The old copy said "they fill in when you click" — a click fires
  // nothing for an extraction row.
  await expect(probe.getByText("spliced from game data at the state round", { exact: false })).toBeVisible();
  await expect(probe.getByText("when you click", { exact: false })).toHaveCount(0);
});
