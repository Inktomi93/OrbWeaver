// CT: the readout's D8 CHAT BINDING + the Actions RESOLVED PREVIEW (preset-surface-redesign §7.1, owner
// ruling 08-02). Three arms, one component:
//
//   BOUND     — a chat is open, so the readout AUTO-BINDS to it (no click, no opt-in), names it, and the
//               Actions panel resolves the selected template through the ONE `previewActionTemplates` read.
//   DISMISSED — the ✕ falls back to the token view WITHOUT any server write (the readout is read-only, §7).
//   UNBOUND   — no recent chat: the honest-token arm, which must be a real panel and never a broken one.
//
// The pins are deliberately about the two things a mock can't assert and a green typecheck can't see:
// (a) the resolution is REAL — the identity macro shows the chat's persona NAME while the FIRE-TIME tokens
// (`{{input}}`/`{{person}}`) survive as tokens (a preview that resolved those would be fabricating a value
// the user has not supplied — the §7 honesty pin's exact prohibition); (b) the binding is a READ — dismissing
// and re-binding fires no mutation at all.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../../../../packages/client/src/lib/test-ids";
import { routeTrpc, trpcError } from "../../../../../support/ct/route-trpc";
import { PresetReadoutBoundStory, PresetReadoutUnboundStory } from "./_readout-stories";

const PRESET = "preset_ct_readoutbind";
const CHAT = "chat_ct_readoutbind";
const CHAT_TITLE = "Azarael & the Court";

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

/** What the SERVER returns for the bound read — the resolution already happened chat-side (Ruling B), so the
 *  fixture is shaped exactly as the verb shapes it: identity REAL, fire-time tokens intact. */
const RESOLVED = {
  identity: { user: "Alex", char: "Azarael" },
  templates: [
    { id: "impersonate", resolved: "Write the owner's next message from a {{person}}-person perspective. {{input}}" },
    { id: "response", resolved: "Azarael responds. {{input}}" },
  ],
};

/** The BINDING vocabulary, as a reader sees it — one home per phrase so an arm rename cannot half-land. */
const INSPECTING_AGAINST_RE = /inspecting against/i;
const RESOLVES_IN_CHAT_RE = /resolves in chat/i;
const DISMISS_RE = /dismiss/i;
const REBIND_RE = /inspect against/i;

const SETTINGS_VIEW = { userId: "user_ct_readout", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };
const CHAT_SUMMARY = { id: CHAT, title: CHAT_TITLE, star: false, messageCount: 4, lastMessageAt: 1, parentChatId: null };

/** Every read the readout fires. `connection.resolveChatCapability` deliberately FAILS (no model connected):
 *  the binding must not depend on a connection, and the Actions panel has no capability half. */
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

test("BOUND — the readout auto-binds to the last-open chat and NAMES it", async ({ mount, page }) => {
  await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutBoundStory />);

  // AUTO-bind: nothing was clicked. The chat is named, not merely counted.
  await expect(probe.getByText(INSPECTING_AGAINST_RE)).toBeVisible();
  await expect(probe.getByText(CHAT_TITLE, { exact: true })).toBeVisible();
});

test("BOUND — the Actions preview resolves identity for REAL and keeps the fire-time tokens as tokens", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutBoundStory />);

  await expect(probe.getByText(INSPECTING_AGAINST_RE)).toBeVisible();

  // The read is aimed at BOTH the bound chat and the INSPECTED preset — that pairing IS the presetOverride
  // (assemble this room as if this preset were active), and getting either half wrong yields a preview of
  // the wrong thing while looking perfectly fine.
  await expect.poll(() => trpc.inputs("chat.previewActionTemplates")).toEqual([{ chatId: CHAT, presetId: PRESET }]);

  // The panel NAMES which template it is showing — the mock's own `Resolved — Impersonate` kicker. Without
  // it a resolved block is prose with no subject, and the echo of the row you selected is unreadable.
  await expect(probe.getByRole("heading", { name: "Resolved — Impersonate" })).toBeVisible();

  // THE HONESTY PIN, both halves in one assertion set. `{{user}}` came back as "Alex" (the chat resolved it),
  // and the two fire-time tokens are still tokens because the user has typed no steer and picked no
  // perspective. A preview that resolved those would be inventing a value.
  const preview = probe.getByTestId(testId("presetResolvedPreview"));
  await expect(preview).toContainText("Write the owner's next message");
  await expect(preview).not.toContainText("{{user}}");
  await expect(preview).toContainText("{{person}}");
  await expect(preview).toContainText("{{input}}");
});

test("DISMISSED — the ✕ falls back to the token view, and the whole binding writes NOTHING", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutBoundStory />);

  await expect(probe.getByText(CHAT_TITLE, { exact: true })).toBeVisible();
  await probe.getByRole("button", { name: DISMISS_RE }).click();

  // The bound resolution is gone and the honest arm stands in its place — never a blank pane.
  await expect(probe.getByText("Write the owner's next message")).toBeHidden();
  await expect(probe.getByText(RESOLVES_IN_CHAT_RE)).toBeVisible();

  // ONE control, two states (§16 row 33): the same slot now offers the re-bind, and taking it restores the
  // bound arm — a dismissal that required a section round-trip to undo would be the trap the ruling names.
  await probe.getByRole("button", { name: REBIND_RE }).click();
  await expect(probe.getByText(CHAT_TITLE, { exact: true })).toBeVisible();

  // READ-ONLY BY CONSTRUCTION (§7's standing invariant): binding, dismissing and re-binding are VIEW state.
  // Nothing in the readout may mutate — not the chat, not the preset. POLLED, not read once: a mutation
  // fired by the click above races the re-render this test already awaited, so a single sample could miss
  // the very write it exists to catch (the DEF-14 class).
  await expect.poll(() => trpc.count("preset.update")).toBe(0);
  await expect.poll(() => trpc.count("chat.setChatInjection")).toBe(0);
});

test("UNBOUND — no recent chat renders the honest token arm, not an empty pane", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutUnboundStory />);

  // The delivery path still stands (it is chat-free), and the preview arm states the CONDITION rather than
  // going blank — an empty pane reads as unbuilt ([[empty-states-are-load-bearing]]).
  await expect(probe.getByRole("heading", { name: "Delivery path" })).toBeVisible();
  await expect(probe.getByText(RESOLVES_IN_CHAT_RE)).toBeVisible();
  await expect(probe.getByText(INSPECTING_AGAINST_RE)).toBeHidden();

  // With nothing bound there is nothing to resolve AGAINST — firing the read anyway would be a wasted
  // round-trip whose answer the panel could not honestly show. Polled: a query mounted by the render this
  // test just awaited lands on the recorder a tick later, so one sample proves nothing.
  await expect.poll(() => trpc.count("chat.previewActionTemplates")).toBe(0);
});
