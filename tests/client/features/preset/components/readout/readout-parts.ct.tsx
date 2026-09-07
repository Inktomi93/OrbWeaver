// CT: the CONTEXT readout's EFFECTIVE-GENERATION panel has no "you have no chat model" state — because that
// state is not reachable (the F-02 lying-pending-arm class, the same one `CapabilityGate` was fixed for).
//
// `preset.resolveEffective` returns a REQUIRED profile and resolves against whatever chat model the caller
// has, THROWING when routing is broken. So an absent profile is exhaustively PENDING (no error) or FAILED (an
// error) — and the panel's old "Connect a chat model in Connections…" line was rendered on BOTH: it flashed
// at every user who opened the panel WITH a model connected, and on a routing failure it stood there
// permanently naming the wrong cause.
//
// AND (2026-08-08) the panel's SECOND wrong-confident-cause: the F-02 fix replaced the false
// "missing connection" claim with an UNCONDITIONAL "this is a routing problem", printed over whatever raw
// string the transport handed up. Three failure arms are pinned now — the `BAD_REQUEST` that EARNS the
// routing verdict (kept verbatim), the `NOT_FOUND` that means the preset is gone, and a `data`-less
// transport failure where the band may name no cause at all — plus the Retry that keeps a transient failure
// from being a dead end, and a RELATIVE geometry pin on the skeleton actually matching the settled panel.
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
import { makeModelCapability, makeResolvedChatCapability } from "../../../../../support/factories/resolved-connection.ts";
import { routeTrpc, trpcError } from "../../../../../support/node/route-trpc.ts";
import {
  EffectiveProfileFailedStory,
  EffectiveProfileMissingPresetStory,
  EffectiveProfilePendingStory,
  EffectiveProfileSettledStory,
  EffectiveProfileShapeMatchStory,
  EffectiveProfileTransportFailureStory,
  LongModelPathReadoutStory,
  PresetReadoutParamsBoundStory,
  PresetReadoutRetryStory,
} from "./_readout-stories.tsx";

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
/** P3-3: the staleness line as a USER reads it, and the internal noun it must never carry again. */
const STALE_IN_PARAMS_RE = /this model ignores — clear them in Params/;
const THE_DECK_RE = /the deck/i;
/** The NOT_FOUND arm's headline — it names the PRESET, which is what actually failed to read. */
const MISSING_PRESET_RE = /preset couldn't be read/i;
/** The causeless arm's headline — it names the READ and nothing about which half of it broke. */
const CAUSELESS_FAILURE_RE = /generation profile couldn't be resolved/i;
/** The place to LOOK, which every failure arm still offers even when it withholds a cause. */
const MODEL_ROLES_PATH_RE = /Settings → Connections → Model roles/;
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

test("FAILED (BAD_REQUEST) — the server's message is quoted verbatim and named as ROUTING, never as a missing connection", async ({ mount }) => {
  const probe = await mount(<EffectiveProfileFailedStory />);

  await expect(probe.getByText(FAILURE_RE)).toBeVisible();
  await expect(probe.getByText(ROUTING_FAULT, { exact: true })).toBeVisible();
  await expect(probe.getByText(ROUTING_VERDICT_RE)).toBeVisible();
  // A settled failure never stands on the skeleton, and never invites the user to connect anything.
  await expect(probe.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(probe.getByText(CONNECT_INVITATION_RE)).toHaveCount(0);
});

// ── WHICH CAUSE THE BAND IS ENTITLED TO NAME (side-eye 2026-08-08 P2) ────────────────────────────────────
// The arm above is the ONE error that earns "this is a routing problem". The two below are the errors the
// verdict was ALSO being printed over — a preset deleted in another tab, and a dropped socket. Asserted
// through the rendered SENTENCE, not through the classifier, so the pin survives any refactor of it.

test("FAILED (NOT_FOUND) — a missing preset is named as one, and the routing verdict is WITHHELD", async ({ mount }) => {
  const probe = await mount(<EffectiveProfileMissingPresetStory />);

  await expect(probe.getByText(MISSING_PRESET_RE)).toBeVisible();
  await expect(probe.getByText("preset not found", { exact: true })).toBeVisible();
  // THE REGRESSION: the panel claimed a routing fault over a deleted row.
  await expect(probe.getByText(ROUTING_VERDICT_RE)).toHaveCount(0);
  await expect(probe.getByText(CONNECT_INVITATION_RE)).toHaveCount(0);
});

test("FAILED (no tRPC data — a transport failure) — the band states NO cause at all", async ({ mount }) => {
  const probe = await mount(<EffectiveProfileTransportFailureStory />);

  // It names the READ, never which half of (preset × chat model) broke.
  await expect(probe.getByText(CAUSELESS_FAILURE_RE)).toBeVisible();
  await expect(probe.getByText("Failed to fetch", { exact: true })).toBeVisible();
  await expect(probe.getByText(ROUTING_VERDICT_RE)).toHaveCount(0);
  // The place to LOOK is still offered — withholding a cause is not withholding help.
  await expect(probe.getByText(MODEL_ROLES_PATH_RE)).toBeVisible();
});

test("FAILED — Retry reaches the caller, so a transient read failure is not a dead end", async ({ mount }) => {
  const probe = await mount(<EffectiveProfileTransportFailureStory />);

  await expect(probe.getByTestId("retry-count")).toHaveText("0");
  await probe.getByRole("button", { name: "Retry" }).click();
  await expect(probe.getByTestId("retry-count")).toHaveText("1");
});

// ── #115: the panel NAMES the model, it does not quote its path ─────────────────────────────────────────
// A self-hosted engine identifies its model by local weights path. This one is 106 characters, and the
// panel printed it TWICE — the capability `model` row and the `resolved for …` gloss ~100px below — with the
// capability row wrapping onto four lines inside a 380px CONTEXT column. Asserted as a reader meets it:
// the readable name is visible in both places, the raw path is visible in NEITHER, and it is still
// recoverable from the row it describes.
const LOCAL_WEIGHTS_PATH = "/media/inktomi/Data/vllm-models/quantized/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token";
const LOCAL_WEIGHTS_DISPLAY = "Huihui-ThinkingCap-Qwen3.6-27B-abliterated · W8A8";
/** The settled panel's own column, so the wrap pin is relative to the mount and names no px of its own. */
const PANEL_WIDTH_PX = 380;
/** Two text lines' slack: the pin is "this row is not a paragraph", not an exact leading. */
const DATUM_ROW_MAX_HEIGHT_PX = 44;

test("a long local model path is NAMED, not quoted — twice-stated becomes twice-derived", async ({ mount }) => {
  const probe = await mount(<LongModelPathReadoutStory />);

  // Both surfaces state the same readable name — the capability datum and the readout's signature.
  await expect(probe.getByText(LOCAL_WEIGHTS_DISPLAY, { exact: true })).toBeVisible();
  await expect(probe.getByText(`resolved for ${LOCAL_WEIGHTS_DISPLAY} · chat role`)).toBeVisible();
  // THE DEFECT: the raw 106-character path, rendered as visible text, anywhere in the panel.
  await expect(probe.getByText(LOCAL_WEIGHTS_PATH)).toHaveCount(0);
  // Nothing is LOST — the full identifier still describes the row it belongs to.
  await expect(probe.getByText(LOCAL_WEIGHTS_DISPLAY, { exact: true })).toHaveAttribute("title", LOCAL_WEIGHTS_PATH);

  // …and the capability row is a ROW again, not a four-line paragraph inside the column.
  const modelRow = probe.getByText(LOCAL_WEIGHTS_DISPLAY, { exact: true });
  const rowBox = await modelRow.boundingBox();
  expect(rowBox?.width ?? 0).toBeLessThanOrEqual(PANEL_WIDTH_PX);
  expect(rowBox?.height ?? 0).toBeLessThanOrEqual(DATUM_ROW_MAX_HEIGHT_PX);

  // A hosted id derives to ITSELF, so the gloss must not appear: a tooltip that repeats the text under
  // the cursor is hover-noise and a screen-reader stutter, not a gloss.
  await expect(probe.getByTestId("hosted-id-panel").getByText("claude-opus-4-8", { exact: true })).not.toHaveAttribute("title");
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

// ── THE SKELETON'S ONE JOB IS TO NOT MOVE (side-eye 2026-08-08 P2) ──────────────────────────────────────
// Measured, not assumed: with the `line` arm's control-height bars the PENDING panel was 233px against an
// 89px settled panel, so the panel a skeleton exists to hold still COLLAPSED ~144px every time a resolve
// landed. The pin is RELATIVE — pending vs the settled panel `PENDING_ROWS` is standing in for — so nothing
// here breaks when a token moves, and a regression to a control-height bar reds it by 100+px.

/** One `DatumRow` pitch of slack (a text line + the `tight` gap): the residual is the settled panel's
 *  trailing provenance line, which a placeholder row deliberately does not stand in for. */
const SETTLE_JUMP_TOLERANCE_PX = 32;

test("PENDING — the skeleton is SHAPE-MATCHED: settling does not collapse the panel", async ({ mount }) => {
  const probe = await mount(<EffectiveProfileShapeMatchStory />);
  await expect.poll(async () => await probe.getByTestId("pending-panel").locator("section").first().boundingBox()).not.toBeNull();
  const pendingBox = await probe.getByTestId("pending-panel").locator("section").first().boundingBox();
  await expect.poll(async () => await probe.getByTestId("settled-panel").locator("section").first().boundingBox()).not.toBeNull();
  const settledBox = await probe.getByTestId("settled-panel").locator("section").first().boundingBox();

  const jump = Math.abs((pendingBox?.height ?? 0) - (settledBox?.height ?? 0));
  expect(jump).toBeLessThanOrEqual(SETTLE_JUMP_TOLERANCE_PX);
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
// `BAD_REQUEST` on purpose: that is the code a real routing refusal carries (a `DomainOperationError` →
// `error-mapping.ts`), and it is what makes the wiring assertion below a pin on the CALLER handing the error
// OBJECT down. A caller that flattened it to `.message` first would strip `data.code`, and the band would
// fall to its causeless arm — so the routing verdict appearing here proves the whole error travelled.
function failingResolve(): unknown {
  return trpcError({ code: "BAD_REQUEST", message: ROUTING_FAULT });
}

function settledResolve(): unknown {
  return { presetId: PRESET, model: "qwen3-32b", knobs: { maxOutputTokens: { value: 2048, provenance: "floor" } }, stale: [], qualityMapping: null };
}

/** A settled resolve carrying a STALE knob — the one arm that renders the "…this model ignores…" sentence
 *  P3-3 is about. `top_k` is a real knob name; the readout only counts the array. */
function staleResolve(): unknown {
  return { presetId: PRESET, model: "qwen3-32b", knobs: { maxOutputTokens: { value: 2048, provenance: "floor" } }, stale: ["topK"], qualityMapping: null };
}

function readoutRoutes(effective: () => unknown): Record<string, unknown> {
  return {
    "preset.get": () => PRESET_DETAIL,
    "preset.list": () => [PRESET_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.resolveEffective": effective,
    // #649 — the CONTEXT panel's backward-BINDINGS read (`preset.listUsage`). Not this file's subject, but
    // every readout mount fires it, and unfed it rode `routeTrpc`'s null so the usage/gm-room resolve path
    // ran INERT here. The honest default for a preset nobody has picked and no room routes its GM voice to;
    // `usage-readout.ct.tsx` is the suite that varies it.
    "preset.listUsage": () => ({ isUserDefault: false, gmRooms: [] }),
    "chat.getChat": () => null,
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
  // The verdict only renders when `data.code` survived the hand-off — see `failingResolve` above.
  await expect(probe.getByText(ROUTING_VERDICT_RE)).toBeVisible();
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

// P3-3 (side-eye 2026-08-22): the staleness line was the ONE piece of jargon on an otherwise jargon-free
// surface — it reported a problem and then sent the reader to "the deck", this feature's internal name for
// the Params tab (`params-deck.tsx` + ~14 comment sites), a place that appears nowhere in the UI. The pin
// reads the sentence a user reads, and refuses the internal noun by name.
test("P3-3: the staleness line names the TAB, never the module's own word for it", async ({ mount, page }) => {
  await routeTrpc(page, readoutRoutes(staleResolve));
  const probe = await mount(<PresetReadoutParamsBoundStory />);

  await expect(probe.getByText(STALE_IN_PARAMS_RE)).toBeVisible();
  await expect(probe.getByText(THE_DECK_RE)).toHaveCount(0);
});

test("WIRING — Retry fires a REAL re-read: the click issues a second resolve that RECOVERS the panel", async ({ mount, page }) => {
  // The gap the prop-direct RetryProbe cannot close: it proves the onRetry CALLBACK fires, not that the real
  // caller's `onRetry` (`() => effective.refetch()`) issues a fresh read over the wire. The wire fails the
  // FIRST read and settles every read after it — the documented route-trpc fail-then-succeed script — so the
  // recovery below can ONLY come from a real second read the panel asked for. Asserted through RENDERED state,
  // never a node-side call count (`ct-no-oneshot-live-read-assert`): a diagnostic drive confirmed the failed
  // panel does NOT recover on its own (no auto-refetch of an idle errored query — retry:false, staleTime:∞),
  // so the settled row appearing after the click is attributable to Retry's refetch and nothing else.
  let calls = 0;
  const resolve = (): unknown => (calls++ === 0 ? failingResolve() : settledResolve());
  await routeTrpc(page, readoutRoutes(resolve));
  // The FOCUS-SAFE story: an errored query is stale, so react-query's `refetchOnWindowFocus` default would
  // heal this panel on any focus event between the barrier and the assertion — a pass with the Retry button
  // never doing anything (graduation verifier, 2026-08-08).
  const probe = await mount(<PresetReadoutRetryStory />);

  // The first read failed and rendered as such — the settle barrier. The panel is on its failure arm and has
  // NOT recovered on its own: the settled row is absent.
  await expect(probe.getByText(ROUTING_FAULT, { exact: true })).toBeVisible();
  await expect(probe.getByText("max output", { exact: true })).toHaveCount(0);

  // THE PIN: the Retry click issues a real second read and the panel recovers to the settled row. If onRetry
  // were not wired to `refetch`, no read would fire and the settled row would never appear.
  await probe.getByRole("button", { name: "Retry" }).click();
  await expect(probe.getByText("max output", { exact: true })).toBeVisible();
  await expect(probe.getByText(FAILURE_RE)).toHaveCount(0);
});
