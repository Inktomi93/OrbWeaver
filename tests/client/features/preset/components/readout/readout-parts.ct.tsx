// CT: the CONTEXT readout's EFFECTIVE-GENERATION panel has no "you have no chat model" state — because that
// state is not reachable (the F-02 lying-pending-arm class, the same one `CapabilityGate` was fixed for).
//
// `preset.resolveEffective` returns a REQUIRED profile and resolves against whatever chat model the caller
// has, THROWING when routing is broken. So an absent profile is exhaustively PENDING (no error) or FAILED (an
// error) — and the panel's old "Connect a chat model in Connections…" line was rendered on BOTH: it flashed
// at every user who opened the panel WITH a model connected, and on a routing failure it stood there
// permanently naming the wrong cause.
//
// TWO TIERS, deliberately:
//   ARMS      — `EffectiveProfile` mounted PROP-DIRECT. It is a pure projection of `(effective, error)`, so
//               each arm is a SETTLED rendered state with nothing in flight. Holding the real query open
//               instead cannot pin PENDING here: tRPC batches `preset.get` with `preset.resolveEffective`,
//               so holding one holds both and the enclosing readout renders "Loading the readout…" — the
//               assertion would chase a state the story cannot produce.
//   WIRING    — the real `<PresetReadout>` on its Params view, proving the CALLER hands the resolve's ERROR
//               down and not only its data. An arm that renders correctly off a prop nobody passes is a
//               component that works and a screen that doesn't.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../../support/ct/route-trpc.ts";
import { makeModelCapability, makeResolvedChatCapability } from "../../../../../support/factories/resolved-connection.ts";
import { EffectiveProfileFailedStory, EffectiveProfilePendingStory, EffectiveProfileSettledStory, PresetReadoutParamsBoundStory } from "./_readout-stories.tsx";

/** Any prose claiming something about the user's chat model. Deliberately BROADER than the deleted string:
 *  on an UNSETTLED read the panel asserts NOTHING about the connection, so a future arm re-introducing any
 *  such claim on the pending path fails here too. NOT applied to the failure arm — "your chat model couldn't
 *  be resolved" is a claim the panel has EARNED at that point, and the narrower invitation regex below is
 *  what must stay absent there. */
const CHAT_MODEL_CLAIM_RE = /chat model/i;
/** The INVITATION the F-02 fix deleted — an instruction to go connect a model. It is false in all three arms
 *  (the user's connection is not the question), so this one is asserted absent everywhere, including on the
 *  failure path where the broader claim regex above is legitimately satisfied. */
const CONNECT_INVITATION_RE = /connect a chat model|in Connections/i;
const PANEL_KICKER = "Effective generation";
const FAILURE_RE = /couldn't be resolved/i;
/** The routing fault a real broken resolve throws — quoted VERBATIM by the failure arm (F-02's P1). */
const ROUTING_FAULT = "incoherent routing (agent-sdk × local-light)";
/** The failure arm's two remaining sentences, as a reader meets them — the diagnosis and the routing verdict. */
const ROUTING_VERDICT_RE = /routing problem, not a missing connection/i;
/** The model line the SETTLED arm signs its numbers with (`resolvedForLabel` + the readout's `· chat role`). */
const RESOLVED_FOR_RE = /resolved for qwen3-32b · chat role/;

// ── ARMS ────────────────────────────────────────────────────────────────────────────────────────────────

test("PENDING — the panel holds a skeleton and says NOTHING about the user's chat model", async ({ mount }) => {
  const probe = await mount(<EffectiveProfilePendingStory />);

  // The kicker still stands (the slot is held, so the readout does not jump when the resolve lands) and the
  // bars under it are the shared `SkeletonRows` — a real busy region, not a sentence.
  await expect(probe.getByRole("heading", { name: PANEL_KICKER })).toBeVisible();
  await expect(probe.locator('[aria-busy="true"] [data-slot="skeleton"]').first()).toBeVisible();

  // THE REGRESSION: the old panel printed the connect-a-model note in exactly this state.
  await expect(probe.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);
  await expect(probe.getByText(CONNECT_INVITATION_RE)).toHaveCount(0);
  await expect(probe.getByText(FAILURE_RE)).toHaveCount(0);
});

test("FAILED — the server's message is quoted verbatim and named as ROUTING, never as a missing connection", async ({ mount }) => {
  const probe = await mount(<EffectiveProfileFailedStory />);

  await expect(probe.getByText(FAILURE_RE)).toBeVisible();
  await expect(probe.getByText(ROUTING_FAULT, { exact: true })).toBeVisible();
  await expect(probe.getByText(ROUTING_VERDICT_RE)).toBeVisible();
  // A settled failure never stands on the skeleton, and never invites the user to connect anything.
  await expect(probe.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(probe.getByText(CONNECT_INVITATION_RE)).toHaveCount(0);
});

test("SETTLED — the funnel's own row renders with its provenance rung and the model it resolved against", async ({ mount }) => {
  const probe = await mount(<EffectiveProfileSettledStory />);

  // The DISPLAY name, never the schema key (F-13), plus the rung that explains where the number came from.
  await expect(probe.getByText("max output", { exact: true })).toBeVisible();
  await expect(probe.getByText("2,048", { exact: true })).toBeVisible();
  await expect(probe.getByText("default", { exact: true })).toBeVisible();
  // The window row the funnel deliberately does not resolve, supplied by the capability read (F-13).
  await expect(probe.getByText("context", { exact: true })).toBeVisible();
  await expect(probe.getByText("32,768", { exact: true })).toBeVisible();
  await expect(probe.getByText(RESOLVED_FOR_RE)).toBeVisible();
  await expect(probe.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

// ── WIRING ──────────────────────────────────────────────────────────────────────────────────────────────

const PRESET = "preset_ct_readoutbind";

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

const SETTINGS_VIEW = { userId: "user_ct_readout", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** The SETTLED-successful capability read, through the typed factory (a new required descriptor field is a
 *  compile error there, never a silently-absent key here). Settled in BOTH wiring arms: this file pins the
 *  EFFECTIVE panel, and a co-pending capability read would let its own gate account for a quiet screen. */
const CAPABILITY = makeResolvedChatCapability({ capability: makeModelCapability() });

/** `effective` is the routeTrpc HANDLER for `preset.resolveEffective`, not its value — routeTrpc CALLS each
 *  map value, so wrapping a handler again answers with a function and the query settles to an error. */
// The resolve handler for each wiring arm, hoisted so the route map reads as one line per arm. Written as
// camelCase FUNCTIONS, not SCREAMING consts: in a `.tsx` file biome reads a capitalised const arrow as a
// React component and `useComponentExportOnlyModules` reds it.
function failingResolve(): unknown {
  return trpcError({ message: ROUTING_FAULT });
}

function settledResolve(): unknown {
  return { presetId: PRESET, model: "qwen3-32b", knobs: { maxOutputTokens: { value: 2048, provenance: "floor" } }, stale: [], qualityMapping: null };
}

function readoutRoutes(effective: () => unknown): Record<string, unknown> {
  return {
    "preset.get": () => PRESET_DETAIL,
    "preset.list": () => [PRESET_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.resolveEffective": effective,
    "chat.listChats": () => [],
  };
}

test("WIRING — a FAILED resolve reaches the panel as an ERROR, not as an absent profile", async ({ mount, page }) => {
  await routeTrpc(page, readoutRoutes(failingResolve));
  const probe = await mount(<PresetReadoutParamsBoundStory />);

  // THE CALLER'S HALF: `preset-readout.tsx` must hand `effective.error` down. Handing only `.data` would
  // leave the panel on its PENDING arm forever on a permanent failure — a skeleton that never resolves,
  // which is the same lie in the other direction.
  await expect(probe.getByText(FAILURE_RE)).toBeVisible();
  await expect(probe.getByText(ROUTING_FAULT, { exact: true })).toBeVisible();
  await expect(probe.getByText(CONNECT_INVITATION_RE)).toHaveCount(0);
});

test("WIRING — a SETTLED resolve renders the funnel's rows through the real readout", async ({ mount, page }) => {
  await routeTrpc(page, readoutRoutes(settledResolve));
  const probe = await mount(<PresetReadoutParamsBoundStory />);

  await expect(probe.getByText("max output", { exact: true })).toBeVisible();
  await expect(probe.getByText(FAILURE_RE)).toHaveCount(0);
  await expect(probe.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);
  await expect(probe.getByText(CONNECT_INVITATION_RE)).toHaveCount(0);
});
