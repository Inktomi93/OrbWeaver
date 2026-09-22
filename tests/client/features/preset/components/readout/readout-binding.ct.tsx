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
import { testId } from "../../../../../../packages/client/src/lib/test-ids.ts";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../../support/node/route-trpc.ts";
import {
  PresetReadoutBoundStory,
  PresetReadoutParamsBoundStory,
  PresetReadoutPromptBoundStory,
  PresetReadoutPromptUnboundStory,
  PresetReadoutUnboundStory,
} from "./_readout-stories.tsx";

const PRESET = "preset_ct_readoutbind";
const CHAT = "chat_ct_readoutbind";
const CHAT_TITLE = "Azarael & the Court";

const PRESET_DETAIL: TrpcWireOutput<"preset.get"> = {
  id: PRESET,
  name: "Preset R",
  kind: "custom",
  isSystemDefault: false,
  forkedFrom: null,
  createdAt: 0,
  updatedAt: 0,
  config: DEFAULT_PROMPT_CONFIG,
  schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
  configUnreadable: null,
};

/** What the SERVER returns for the bound read — the resolution already happened chat-side (Ruling B), so the
 *  fixture is shaped exactly as the verb shapes it: identity REAL, fire-time tokens intact. */
const RESOLVED: TrpcWireOutput<"chat.previewActionTemplates"> = {
  identity: { user: "Nate", char: "Azarael" },
  templates: [
    { id: "impersonate", resolved: "Write Nate's next message from a {{person}}-person perspective. {{input}}" },
    { id: "response", resolved: "Azarael responds. {{input}}" },
  ],
};

/** The BINDING vocabulary, as a reader sees it — one home per phrase so an arm rename cannot half-land. */
const INSPECTING_AGAINST_RE = /inspecting against/i;
const RESOLVES_IN_CHAT_RE = /resolves in chat/i;
const DISMISS_RE = /dismiss/i;
const REBIND_RE = /inspect against/i;
const MATERIALIZED_COUNT_RE = /3 rows in the bound chat/;

/** What the SERVER returns for the bound PROMPT read (D121-G) — `chat.previewAssembly` with the editor's
 *  preset as `presetOverride`. Shaped as the verb shapes it: the per-SOURCE partition the chat Preview tab
 *  draws, plus the per-SECTION partition (keyed by `DEFAULT_PROMPT_CONFIG`'s own rack ids) that this readout
 *  prices its bars off — one read, two projections. The `chat-history` CARRIER is the row that matters: the
 *  editor cannot price it chat-free, and here it materializes into three real wire turns. */
const ASSEMBLY_TRACE = {
  staticSections: ["main", "chat-history"],
  dynamicSections: [],
  worldInfoIncluded: 1,
  worldInfoDropped: [],
  worldInfoActivated: [],
  matchedKeys: [],
  compactSummaryIncluded: false,
  memoryIncluded: false,
  guidedInstructionIncluded: false,
  staticCacheBusters: [],
  chatInjectionsIncluded: 0,
  afterHistorySections: [],
  memoryRecall: null,
  databankIncluded: false,
};

const ASSEMBLY: TrpcWireOutput<"chat.previewAssembly"> = {
  prompt: { static: "You are Azarael.", dynamic: "", afterHistory: [], sendHistory: true, trace: ASSEMBLY_TRACE },
  trace: ASSEMBLY_TRACE,
  budget: {
    ceilingTokens: 8192,
    ceilingEstimated: false,
    totalTokens: 2266,
    sources: [
      { source: "system", detail: "Main", tokens: 412, parts: [{ label: "Main", tokens: 412, text: "You are Azarael." }], text: "You are Azarael." },
      { source: "world-info", detail: "World info (before)", tokens: 230, parts: [{ label: "World info (before)", tokens: 230, text: "LORE" }], text: "LORE" },
      { source: "history", detail: "3 turns · 2 dropped", tokens: 1624, parts: [], text: "" },
    ],
    sections: [
      { sectionId: "main", tokens: 412, rows: [{ label: "Main", tokens: 412 }] },
      { sectionId: "wi-before", tokens: 230, rows: [{ label: "World info (before)", tokens: 230 }] },
      {
        sectionId: "chat-history",
        tokens: 1624,
        rows: [
          { label: "user", tokens: 300 },
          { label: "Azarael", tokens: 924 },
          { label: "user", tokens: 400 },
        ],
      },
    ],
  },
};

/** The PROMPT readout's two cost vocabularies, as a screen reader hears them (the visible cell is an
 *  `aria-hidden` glyph — side-eye F-27, so the SPOKEN form is the datum a test must assert). */
const CARRIER_UNPRICED = "Chat history cost not counted — this section's substance comes from the conversation";
const CARRIER_PRICED = "Chat history approximately 1,624 tokens";

const SETTINGS_VIEW: TrpcWireOutput<"settings.getUserSettings"> = {
  userId: "user_ct_readout",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
  configUnreadable: null,
};
// The binding NAMES the room off `chat.getChat` (2026-08-09) — the readout binds to the OPEN chat, so the
// room read is the exact, already-warm answer; it used to scan the whole `listChats` array for a title,
// which a keyset page can no longer promise carries it.
const CHAT_DETAIL = { id: CHAT, title: CHAT_TITLE, starred: false, archived: false, temporary: false, parentChatId: null, participants: [] };

/** Every read the readout fires. `connection.resolveChatCapability` deliberately FAILS (no model connected):
 *  the binding must not depend on a connection, and the Actions panel has no capability half. */
function readoutRoutes(): TrpcRoutes<
  | "preset.get"
  | "preset.list"
  | "settings.getUserSettings"
  | "connection.resolveChatCapability"
  | "preset.resolveEffective"
  | "preset.listUsage"
  | "chat.getChat"
  | "chat.previewActionTemplates"
  | "chat.previewAssembly"
> {
  return {
    "preset.get": () => PRESET_DETAIL,
    "preset.list": () => [PRESET_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => trpcError({ message: "no chat connection configured" }),
    "preset.resolveEffective": () => ({ presetId: PRESET, model: "qwen3-32b", knobs: {}, stale: [], qualityMapping: null }),
    // #649 — the CONTEXT panel's backward-BINDINGS read (`preset.listUsage`). Not this file's subject, but
    // every readout mount fires it, and unfed it rode `routeTrpc`'s null so the usage/gm-room resolve path
    // ran INERT here. The honest default for a preset nobody has picked and no room routes its GM voice to;
    // `usage-readout.ct.tsx` is the suite that varies it.
    "preset.listUsage": () => ({ isUserDefault: false, gmRooms: [] }),
    "chat.getChat": () => CHAT_DETAIL,
    "chat.previewActionTemplates": () => RESOLVED,
    "chat.previewAssembly": () => ASSEMBLY,
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

  // The panel NAMES which template it is showing. Without it a resolved block is prose with no subject, and
  // the echo of the row you selected is unreadable. The name lives on the panel's own HEADER since side-eye
  // 2026-08-08 P2 (it was a suffix on the Resolved kicker, one section down and easy to read as belonging to
  // that section alone), and the whole region carries it as its accessible name.
  await expect(probe.getByRole("heading", { name: "Impersonate", exact: true })).toBeVisible();
  await expect(probe.getByRole("region", { name: "Action readout — Impersonate" })).toBeVisible();

  // THE HONESTY PIN, both halves in one assertion set. `{{user}}` came back as "Nate" (the chat resolved it),
  // and the two fire-time tokens are still tokens because the user has typed no steer and picked no
  // perspective. A preview that resolved those would be inventing a value.
  const preview = probe.getByTestId(testId("presetResolvedPreview"));
  await expect(preview).toContainText("Write Nate's next message");
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
  await expect(probe.getByText("Write Nate's next message")).toBeHidden();
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

// ── PROMPT (D121-G): the binding's other half — materialized carrier rows + true token costs ───────────────

test("PROMPT + BOUND — the rack is priced by the bound chat, and the selected CARRIER shows its materialized rows", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutPromptBoundStory />);

  // The chip JOINS the Prompt view (the clause-G membership change): the readout says what it is priced
  // against, because a resolution is now genuinely happening here.
  await expect(probe.getByText(INSPECTING_AGAINST_RE)).toBeVisible();
  await expect(probe.getByText(CHAT_TITLE, { exact: true })).toBeVisible();

  // The read is aimed at BOTH the bound chat and the INSPECTED preset — that pairing IS the presetOverride
  // (price this room as if this preset were active); either half wrong prices the wrong thing, convincingly.
  await expect.poll(() => trpc.inputs("chat.previewAssembly")).toEqual([{ chatId: CHAT, presetOverride: PRESET }]);

  // THE DEFECT THIS CLOSES: the conversation carrier's bar read "cost not counted" — the honest unbound floor
  // — while a real chat was open. Bound, it reports what the conversation ACTUALLY costs. The assertion goes
  // through the bar's accessible name (the visible cell is an aria-hidden glyph by design).
  await expect(probe.getByRole("button", { name: CARRIER_PRICED })).toBeVisible();
  await expect(probe.getByRole("button", { name: CARRIER_UNPRICED })).toBeHidden();

  // ST's inspect panel, with honest data: the selected carrier's MATERIALIZED rows, ordinalled (three
  // `user`/`Azarael` turns are only told apart by position) and each with its own true cost.
  await expect(probe.getByRole("heading", { name: "Selected — materialized" })).toBeVisible();
  await expect(probe.getByText("2. Azarael")).toBeVisible();
  await expect(probe.getByText("~924")).toBeVisible();
  await expect(probe.getByText(MATERIALIZED_COUNT_RE)).toBeVisible();
});

test("PROMPT + UNBOUND — carriers stay at the honest `~—` floor and NOTHING is fetched to price them", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutPromptUnboundStory />);

  // The panel is a real panel (the bars, the pivot health) — the carrier simply says it cannot be priced here.
  await expect(probe.getByRole("button", { name: CARRIER_UNPRICED })).toBeVisible();
  await expect(probe.getByRole("heading", { name: "Selected — materialized" })).toBeHidden();
  await expect(probe.getByText(INSPECTING_AGAINST_RE)).toBeHidden();

  // With nothing bound there is nothing to price AGAINST — firing the read anyway would be a wasted round trip
  // whose answer the panel could not honestly show. Polled: a query mounted by the render this test just
  // awaited lands on the recorder a tick later, so one sample proves nothing.
  await expect.poll(() => trpc.count("chat.previewAssembly")).toBe(0);
});

test("PARAMS + BOUND — the chip does NOT render on a view the binding cannot change", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, readoutRoutes());
  const probe = await mount(<PresetReadoutParamsBoundStory />);

  // `BINDING_VIEWS.params === false`: the effective profile is preset × capability, so a chip claiming
  // "inspecting against <chat>" over it would name a resolution that is not happening (the §7 honesty pin,
  // inverted). The panel itself still stands.
  await expect(probe.getByRole("heading", { name: "Effective generation" })).toBeVisible();
  await expect(probe.getByText(INSPECTING_AGAINST_RE)).toBeHidden();
  await expect(probe.getByRole("button", { name: REBIND_RE })).toBeHidden();
  await expect.poll(() => trpc.count("chat.previewAssembly")).toBe(0);
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
