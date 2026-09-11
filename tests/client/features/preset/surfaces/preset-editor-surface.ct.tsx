// CT: the preset CONTENT editor's two P0 regressions (stickler review 2026-07-16-merge-block-28523122),
// the live repros as tests — now pinned against the D78 L1 session BOUNDARY. The original P0 was a frozen
// seed surviving a switch/reset because the remount key lived BELOW the hook owner; the boundary OWNS the
// key (its keyed Session) so both pins ride the real production mechanism:
//   • SWITCH pin — pick A (dirty) → B: the editor must show B's REAL config, and NO `preset.update` may
//     fire against B carrying A's values (the "one keystroke persists the previous preset into the new
//     one" bug). Asserted on the update save-spy (routeTrpc recorder — the house wire-payload pattern).
//   • RESET pin — reset-to-starter: the editor must show the STARTER config AND no `preset.update` may
//     write the pre-reset values back over the freshly-reset row (the durable no-op reset — the boundary's
//     discard-flagged teardown, driven by `session.reseed(row.config)` off the mutation response).
//
// The Quality dial (`params.quality`, the Params view's first cluster, no capability needed) is the
// visible+editable config field: A = "fast", B = "deep", the starter = unset (the dial's named OFF arm).
// `preset.get`/`settings.getUserSettings` are stubbed at the NETWORK (routeTrpc). No chat model is
// configured → the SAMPLING/REASONING/OUTPUT clusters show the connect-a-model note; QUALITY still renders,
// which is all these pins touch.
//
// Post-redesign (preset-surface-redesign.md §3/§4): the editor is ONE flat tab level and Params is the
// DEFAULT view, so these pins need no tab navigation at all; the dial is a `Select` (owner ruling O-18 —
// the segmented strip died), so its state reads off the TRIGGER'S TEXT and its options live in a portal.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, MAX_INJECTION_TEMPLATE_LENGTH } from "@orb/contracts/preset";
import { PROSE_COUNTER_AT, PROSE_MAX_CHARS, PROSE_SLOTS } from "@orb/contracts/prose";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { VersionedParseFailure } from "@orb/contracts/versioned-config";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { SCROLL_FADE_X_CLASS } from "@orb/ui/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { beginAutosaveStatusTranscript, readAutosaveStatusTranscript } from "../../../../support/browser/autosave-status-transcript.ts";
import { pixelExtremaContrast, pixelSurface } from "../../../../support/browser/pixel-contrast.ts";
import { readPhantomScrollers } from "../../../../support/browser/scroll-containing-block.ts";
import { makeModelCapability, makeResolvedChatCapability } from "../../../../support/factories/resolved-connection.ts";
import { assertTokenRoundtrip } from "../../../../support/node/assert-token-roundtrip.ts";
import { resolvedTokenColor } from "../../../../support/node/resolved-token-color.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import {
  PresetEditorCapabilityFreshnessStory,
  PresetEditorNarrowStory,
  PresetEditorStripFadeStory,
  PresetEditorSurfaceStory,
  PresetEditorSwitchStory,
  PresetEditorWidePaneStory,
  PresetForkChoiceStory,
  PresetForkOnceAnnouncedStory,
  PresetForkOnceStory,
} from "./_ct-stories.tsx";

// The three fixed ids — the literal mirror of the story module's branded PresetIds (biome forbids the
// story exporting non-component consts, so the literals live in both places), cast to the brand here.
const PRESET_A = castId<PresetId>("preset_ct_aaaaaaaaaa");
const PRESET_B = castId<PresetId>("preset_ct_bbbbbbbbbb");
const BUILT_IN = castId<PresetId>("preset_00000000000000000000000000");
const FORK = castId<PresetId>("preset_ct_forkedddddd");

// Quality-dial option labels. The dial is a SELECT since owner ruling O-18 (the segmented strip died), so
// the state is the TRIGGER'S TEXT — and "no dial" is the named OFF arm, not an empty selection.
const FAST = "Fast";
const BALANCED = "Balanced";
const DEEP = "Deep";
const QUALITY_OFF_LABEL = "Don't use quality";
const RESET_ITEM_RE = /Reset to starter/;
/** The header's reset door, by its O-3 one-string name — the band's TRAILING element, which is what the
 *  content-column pin measures the right inset from. */
const RESET_NAME_RE = /^Reset to starter arrangement$/;
/** The Activate command, matched on the half of its name that is NOT under test (the visible label is what
 *  the WCAG 2.5.3 pin reads off the DOM and compares). */
const ACTIVATE_NAME_RE = /use this preset for generation/i;
/** A band flush to the pane is ~one padding step in; a band sharing a capped column at 1520px is >300px in.
 *  Stated as a floor well clear of any padding so the pin cannot pass on chrome alone. */
const MIN_COLUMN_INSET_PX = 100;
/** The view strip's own accessible name (P3-4) — the surface's last DOM-fallback selector. */
const TABLIST_NAME = "Preset sections";
// The G7 provenance chip, matched loosely so its ABSENCE can be asserted without naming a model. The
// grammar is the READOUT's (crunch-list O-2): "resolved for <model>", never the bare "for <model>" that
// read as "this preset is FOR anthropic/…" — a claim about the preset instead of a statement about which
// model the ghosted numbers were resolved against.
/** The Actions cross-link's accessible name — its health arm prefixes the label, so match the tail. */
const DELIVERS_VIA_RE = /Delivers via Guided instruction/;
const FOR_MODEL_RE = /^resolved for /;

/** The quality dial's trigger — its text IS the current arm (the fixture the dial edits, in one locator). */
function qualityDial(root: Locator): Locator {
  return root.getByRole("combobox", { name: "Quality" });
}

/** Pick a dial arm. The listbox renders in a PORTAL (document.body), outside the mounted root, so the
 *  option is located on the PAGE — the same rule the menu/dialog locators below already follow. */
async function pickQuality(root: Locator, page: Page, label: string): Promise<void> {
  await qualityDial(root).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

const SETTINGS_VIEW = {
  userId: "user_ct_preset",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
  configUnreadable: null,
};

interface PresetDetailFixture {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly isSystemDefault: boolean;
  readonly forkedFrom: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly config: PromptConfig;
  readonly schemaVersion: number;
  /** #1716: the server's read verdict on the stored blob. `null` on every fixture below except the
   *  unreadable-state stories — required, not optional, so a stub cannot omit the field the editor now
   *  branches on. */
  readonly configUnreadable: VersionedParseFailure | null;
}

/** A PresetDetail whose config differs only in `params.quality` — the dial the CT reads + edits. A detail is
 *  a superset of the summary the LIST returns, so the same fixtures double as `preset.list` rows (the editor
 *  reads the list to answer the built-in's fork question). */
function presetDetail(id: string, name: string, quality: "fast" | "balanced" | "deep" | undefined): PresetDetailFixture {
  const config: PromptConfig = quality === undefined ? { ...DEFAULT_PROMPT_CONFIG, params: {} } : { ...DEFAULT_PROMPT_CONFIG, params: { quality } };
  return {
    id,
    name,
    kind: "custom",
    isSystemDefault: false,
    forkedFrom: null,
    createdAt: 0,
    updatedAt: 0,
    config,
    schemaVersion: config.schemaVersion,
    // #1716: every fixture here is a preset whose stored blob READ FINE — the unreadable state has its own
    // stories at the bottom of this file, and they pass the failure kind explicitly.
    configUnreadable: null,
  };
}

const PRESET_A_DETAIL = presetDetail(PRESET_A, "Preset A", "fast");
const PRESET_B_DETAIL = presetDetail(PRESET_B, "Preset B", "deep");
const STARTER_DETAIL = presetDetail(PRESET_A, "Preset A", undefined);

/** The value the editor sends to `preset.update` — `config.params.quality` is the dial the pins read. */
interface UpdateCall {
  readonly id?: string;
  readonly config?: { readonly params?: { readonly quality?: string; readonly maxOutputTokens?: number } };
}

function updatesAgainst(trpc: TrpcRecorder, presetId: PresetId): UpdateCall[] {
  return (trpc.inputs("preset.update") as UpdateCall[]).filter((call) => call.id === presetId);
}

// ── The capability-freshness pin (owner dogfood: "connected a model, the editor still said connect one
// until I reloaded"). Connections persists `routing.roleDefaults` through the busDriven
// `settings.updateUserSettingsSection`, so the user-bus `settingsChanged` row in data/invalidation.ts is the
// ONLY thing that can refresh `connection.resolveChatCapability` (staleTime Infinity, no focus refetch).
// The FIRST resolve FAILS → the deck stands on `CapabilityGate`'s FAILURE arm (side-eye F-02's P1: a failed
// read is a routing problem, NOT "connect a chat model" — different problem, different fix, and the server's
// own message is shown verbatim); after the event the second resolve succeeds and the OUTPUT KnobRows render
// — each GHOSTED at its effective value (the twin's blank-means-default placeholder, redesign §4.1) with the
// provenance gloss under the track.
// The read returns the descriptor PLUS the identity it resolved for (`ResolvedChatCapability`); this panel
// reads the descriptor half only.
//
// THE BARRIER IS THE RENDERED FAILURE ARM, not the request count (lane FLK, 2026-08-02). This pin used to
// assert the gate's NO-MODEL note and to gate its bus tick on `count(...) === 1`. Both were races the harness
// lost under battery contention, and both for the same reason: a recorded request proves the ROUTE HANDLER
// ran node-side, never that the browser settled the query. So (a) the no-model note is only ever on screen
// during the in-flight window — the instant the scripted rejection lands, F-02's failure arm replaces it, so
// the assertion was chasing a flash that a busy machine paints past (repro: 3/3 losses on `pnpm test`'s
// battery, "element(s) not found" on that first assertion), and (b) ticking the bus off the count could
// invalidate an IN-FLIGHT query, which yields no second call at all. The FAILURE ARM is a SETTLED, durable
// render — waiting for it is a real browser-side barrier for both hazards, with no timeout anywhere.
/** The headline of the gate's ROUTING arm — the one failure that has EARNED naming the chat model as the
 *  cause. Both fixtures below therefore throw `BAD_REQUEST`, the code a real routing refusal carries
 *  (`DomainOperationError` → `transport/trpc/error-mapping.ts`): these two tests are ABOUT the routing fault
 *  they name, and an unstamped throw is an `INTERNAL_SERVER_ERROR`, whose honest arm names only the READ.
 *  They passed unstamped while the gate asserted this sentence over every code alike (2026-08-08). */
const CAPABILITY_FAILURE_RE = /Your chat model couldn't be resolved/;
const ROUTING_FAULT_MESSAGE = "no chat connection configured";
const CAPABILITY = makeResolvedChatCapability({
  capability: makeModelCapability({
    sampling: { temperature: { min: 0, max: 2 } },
    output: { maxTokens: { min: 1, max: 8192 } },
    context: { window: 32_768 },
  }),
});
// The funnel's own projection for this preset (`preset.resolveEffective`, §4.3) — `maxOutputTokens` resolves
// to the engine FLOOR (nothing explicit, nothing dialed), which is exactly what the ghost must show.
const EFFECTIVE_FLOOR = {
  presetId: PRESET_A,
  model: "qwen3-32b",
  knobs: { maxOutputTokens: { value: 2048, provenance: "floor" } },
  stale: [],
};

/**
 * THE EDITOR'S AMBIENT READS (#649) — spread FIRST into every `routeTrpc` call in this file.
 *
 * Every mount of the preset editor brings up the capability half (which model role this preset will run
 * against), the funnel's own projection of the knobs, the display-script attachment cluster, and the
 * active-pick write. None of them is any ONE test's subject — but `routeTrpc` answers an unlisted procedure
 * `null`, which is not a view, so five pipelines ran INERT across thirty-two mounts here.
 *
 * DEFAULTS, NOT A CEILING. The capability-freshness / hold / fault tests list `connection.resolveChatCapability`
 * (or intercept it by URL) AFTER the spread and still win, which is why the SUCCESS descriptor is safe as the
 * default: it is the arm every non-capability test in this file already assumed.
 */
const PRESET_EDITOR_AMBIENT_ROUTES: Readonly<Record<string, unknown>> = {
  // A settled, REQUIRED capability descriptor — the connected-model arm.
  "connection.resolveChatCapability": CAPABILITY,
  // The funnel's projection for this preset (§4.3) — the ghost values the knob rows read.
  "preset.resolveEffective": EFFECTIVE_FLOOR,
  // The display-script cluster: the viewer's whole script library and the ones attached to THIS preset.
  // Empty ARRAYS are honest for a fresh viewer AND are real shapes, so the attachment resolve path runs.
  "regex.listScripts": [],
  "regex.listForPreset": [],
  // The active-pick WRITE (`useSetDefaultPreset` — a `seeds` patch). It is `busDriven` and its output is
  // typed `unknown` and never read (use-preset-mutations.ts:67), so `{}` moves nothing observable; it only
  // stops a real mutation riding the lenient null fulfil.
  "settings.updateUserSettingsSection": {},
};

test("capability freshness — a settingsChanged tick swaps the failed-capability note for the live Output knobs", async ({ mount, page }) => {
  // Fail-then-succeed script (the routeTrpc header's own counter idiom): resolve #1 rejects — the routing
  // fault the owner's receipt named — and every later resolve returns the capability, i.e. the user fixed the
  // model role in Connections. The refetch COUNT below is what proves the invalidation seam fired; the script
  // only decides what that refetch gets back.
  let resolves = 0;
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => (resolves++ === 0 ? trpcError({ code: "BAD_REQUEST", message: ROUTING_FAULT_MESSAGE }) : CAPABILITY),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorCapabilityFreshnessStory />);

  // THE BARRIER (see the block header): the failure arm rendered IS the proof that resolve #1 settled in the
  // browser — so the bus tick below can never land on an in-flight query (which yields no second call at all).
  // It doubles as the F-02 P1's only pin: a failed read must NOT read as "connect a chat model", and it must
  // quote the server's own message rather than swallowing it.
  await expect(component.getByText(CAPABILITY_FAILURE_RE)).toBeVisible();
  await expect(component.getByText(ROUTING_FAULT_MESSAGE, { exact: true })).toBeVisible();
  await expect.poll(() => trpc.count("connection.resolveChatCapability")).toBe(1);

  await component.getByRole("button", { name: "connect a chat model" }).click();

  // The seam refetches the capability (proof the map row exists) and the axis re-renders with the knobs.
  await expect.poll(() => trpc.count("connection.resolveChatCapability")).toBe(2);
  await expect(component.getByText(CAPABILITY_FAILURE_RE)).toBeHidden();
  // The GHOST: each twin is genuinely EMPTY (blank-means-default is the storage semantic) while showing the
  // effective value as its placeholder — max output from the funnel's floor, max context from the model's
  // own window — each with its provenance gloss visible.
  await expect(component.getByRole("textbox", { name: "Max output tokens value", exact: true })).toHaveAttribute("placeholder", "2048");
  await expect(component.getByRole("textbox", { name: "Max output tokens value", exact: true })).toHaveValue("");
  await expect(component.getByRole("textbox", { name: "Max context tokens value", exact: true })).toHaveAttribute("placeholder", "32768");
  await expect(component.getByText("default", { exact: true })).toBeVisible();
  await expect(component.getByText("full window", { exact: true })).toBeVisible();
});

// ── PENDING IS NOT AN EMPTY STATE (lane FLK's F-02 class, owner-boarded) ──────────────────────────────
// `CapabilityGate`'s connect-a-model note was reachable ONLY while the capability read was in flight:
// `connection.resolveChatCapability` returns a REQUIRED descriptor, so a settled-successful read always
// carries one and a settled failure carries an error — leaving `capability===undefined && error===null` as
// the PENDING state and nothing else. So EVERY editor open flashed "connect a chat model" at users who had
// one, and the state the note described was never actually rendered by anyone.
//
// The in-flight window is HELD OPEN here (the FORK-ONCE pin's `page.route` + delay idiom), so the pending
// render is a stable, deterministic state for the whole hold rather than a flash the assertion chases: the
// barrier is the rendered skeleton, and the negative assertion runs inside a window we own.
const CAPABILITY_HOLD_MS = 1500;
// Any prose claiming something about the user's chat model. Deliberately BROADER than the deleted string:
// the pin is "the gate asserts NOTHING about the connection until the read settles", so a future arm that
// re-introduces any such claim on the pending path fails here too.
const CHAT_MODEL_CLAIM_RE = /chat model/;
const SAMPLING_KICKER = "Sampling · reasoning · output";

/** Hold every `connection.resolveChatCapability` request open for `CAPABILITY_HOLD_MS`, then let routeTrpc
 *  answer it. Registered AFTER routeTrpc so Playwright runs it FIRST and defers via `fallback()`. The proc
 *  rides the batch URL's comma-joined path, so matching the path is enough (and it deliberately holds
 *  whatever else shares that batch — the suspense reads have already settled by then). */
async function holdCapability(page: Page): Promise<void> {
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("connection.resolveChatCapability")) {
      await new Promise<void>((resolve) => setTimeout(resolve, CAPABILITY_HOLD_MS));
    }
    await route.fallback();
  });
}

test("PENDING — a user WITH a chat model never sees a connect-a-model note; the gate holds a skeleton until the read lands", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  await holdCapability(page);
  const component = await mount(<PresetEditorSurfaceStory />);

  // THE BARRIER: the gate's PENDING render, which is stable for the whole hold. The kicker still stands (the
  // clusters' slot is held, so the deck does not jump when the descriptor lands) and the placeholder rows
  // under it are the shared `SkeletonRows` — a real busy region, not a sentence.
  const gate = component.locator("section").filter({ has: page.getByRole("heading", { name: SAMPLING_KICKER }) });
  await expect(gate.locator('[aria-busy="true"] [data-slot="skeleton"]').first()).toBeVisible();

  // THE PIN: nothing on screen claims anything about this user's chat model — they HAVE one, and the read
  // simply has not landed. This is the regression: the old gate printed the connect-a-model note here.
  await expect(component.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);

  // …and when the read lands, the model-fed clusters replace the skeleton with the descriptor's own knobs.
  await expect(component.getByRole("slider", { name: "Temperature" })).toBeVisible();
  await expect(component.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);
  await expect(gate.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("PENDING — a FAILED read says nothing until it settles, then states the routing fault verbatim", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => trpcError({ code: "BAD_REQUEST", message: ROUTING_FAULT_MESSAGE }),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  await holdCapability(page);
  const component = await mount(<PresetEditorSurfaceStory />);

  const gate = component.locator("section").filter({ has: page.getByRole("heading", { name: SAMPLING_KICKER }) });
  await expect(gate.locator('[aria-busy="true"] [data-slot="skeleton"]').first()).toBeVisible();
  // Neither arm's prose may be on screen before the read settles — a pending gate makes no claim at all.
  await expect(component.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);

  // SETTLED no-capability: the failure arm, quoting the server (F-02's P1 — a routing fault, not "connect
  // a model"), and the skeleton is gone.
  await expect(component.getByText(CAPABILITY_FAILURE_RE)).toBeVisible();
  await expect(component.getByText(ROUTING_FAULT_MESSAGE, { exact: true })).toBeVisible();
  await expect(gate.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

// ── THE HEADER MAY NOT SAY "Saved" OVER AN UNCOMMITTED EDIT (side-eye #81 P0) ─────────────────────────
// The preset editor's twin of the character editor's pin. `AutosaveStatus` was fed the raw driver
// lifecycle, which starts and stays "saved" until the debounced submit begins — so for the whole ~500ms
// window the header read "Saved" over a knob that was nowhere but in the box, and a tab closed inside
// that window loses it silently (the factory's own teardown note: a reload never unmounts React, so no
// flush runs). The `blocked` and read-only arms of this same lie were already folded at the factory seam;
// this is the third, and it is folded in the same place for the same reason — but the PIN belongs to the
// surface the finding was filed against, because a factory-only test cannot prove this header reads it.
//
// Max output tokens (not the Quality dial) is the subject deliberately: a Select opens a PORTAL, and the
// listbox's mutations would land in the transcript while the status still legitimately read "Saved".
test("#81 P0 — the header reads Saving… the instant a knob is edited, never 'Saved' over the pending write", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // BARRIER: the capability has landed (the knob exists) and the header has settled on its resting state.
  const knob = component.getByRole("textbox", { name: MAX_OUTPUT_LABEL, exact: true });
  await expect(knob).toBeVisible();
  const status = component.getByRole("status");
  await expect(status).toHaveText("Saved");

  await beginAutosaveStatusTranscript(page);
  await knob.fill("1234");

  // BARRIER: the debounced save has landed and the header is back to its resting state — the window the
  // transcript covers is closed, so the array below is final.
  await expect(status).toHaveText("Saved");

  // THE PIN: on the unfixed tree this reads ["Saved"] — the header never once admitted the pending write.
  expect(await readAutosaveStatusTranscript(page)).toEqual(["Saving…", "Saved"]);
});

test("SWITCH pin — A(dirty)→B shows B's real config and never persists A's values into B", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": (input: unknown) => ((input as { id?: string }).id === PRESET_B ? PRESET_B_DETAIL : PRESET_A_DETAIL),
    "preset.list": () => [PRESET_A_DETAIL, PRESET_B_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSwitchStory />);

  // A is open: its name + its Quality dial ("fast") are shown.
  await expect(component.getByText("Preset A")).toBeVisible();
  await expect(qualityDial(component)).toHaveText(FAST);

  // Dirty A to "balanced" (a value DISTINCT from B's "deep", so the frozen-seed bug can't hide behind a
  // coincidental match). The debounced autosave persists it AGAINST A, proving the edit took.
  await pickQuality(component, page, BALANCED);
  await expect.poll(() => updatesAgainst(trpc, PRESET_A).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("balanced");

  // Switch A→B (the rail prop change). The boundary rekeys its Session on the new entityId and seeds from
  // B's REAL row — the header shows B and the dial shows B's "deep", NOT A's frozen edited "balanced" seed.
  await component.getByRole("button", { name: "switch to B" }).click();
  await expect(component.getByText("Preset B")).toBeVisible();
  await expect(qualityDial(component)).toHaveText(DEEP);

  // THE PIN (Finding 1): the ONE keystroke on the newly-selected B must persist as B's own value — never
  // A's frozen "balanced". Pick "fast" on B; the autosave fires against B with "fast", and NO update
  // against B ever carries A's "balanced" (the frozen-seed persist-the-previous-preset bug).
  await pickQuality(component, page, FAST);
  await expect.poll(() => updatesAgainst(trpc, PRESET_B).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("fast");
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  expect(updatesAgainst(trpc, PRESET_B).some((call) => call.config?.params?.quality === "balanced")).toBe(false);
});

function routeReset(page: Page): Promise<TrpcRecorder> {
  let didReset = false;
  return routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    // Before reset → A ("fast"); after `preset.resetToDefault` fires → the starter (unset quality).
    "preset.get": () => (didReset ? STARTER_DETAIL : PRESET_A_DETAIL),
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resetToDefault": () => {
      didReset = true;
      return STARTER_DETAIL;
    },
    "preset.update": () => ({}),
  });
}

test("RESET pin — reset-to-starter shows the starter config and never writes the pre-reset values back", async ({ mount, page }) => {
  const trpc = await routeReset(page);
  const component = await mount(<PresetEditorSurfaceStory />);

  // A is open with "fast". Dirty it to "balanced" so the pre-reset form is non-default (isDefaultValue
  // false — the exact precondition under which the teardown flush would re-persist the old values). This
  // fires ONE legit autosave against A (the pre-reset edit); the pin below counts only writes AFTER reset.
  await expect(qualityDial(component)).toHaveText(FAST);
  await pickQuality(component, page, BALANCED);
  await expect.poll(() => updatesAgainst(trpc, PRESET_A).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("balanced");

  // Snapshot the update count once the pre-reset edit has settled — any write past this line is the
  // teardown clobber the fix must prevent (the debounce window has elapsed, so nothing else is pending).
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  const updatesBeforeReset = trpc.count("preset.update");

  // Reset to starter: the header's reset DOOR → confirm. The command is its own named control now, not an
  // item behind a ⋯ that held nothing else (side-eye F-18). The ConfirmDialog still renders in a PORTAL
  // (document.body), outside the mounted component root — locate it on `page`, not `component`.
  await component.getByRole("button", { name: RESET_ITEM_RE }).click();
  await page.getByRole("button", { name: "Reset" }).click();

  // The editor reseeds from the FRESH starter row — the dial returns to its OFF arm (params unset), and it
  // SAYS so (owner ruling O-18) rather than rendering as an empty control.
  await expect(qualityDial(component)).toHaveText(QUALITY_OFF_LABEL);

  // THE PIN: the reset calls `session.reseed(starter)`, whose discard-flagged teardown must NOT flush the
  // dirty pre-reset form. With the old frozen-seed bug (or a non-discard teardown) that flush writes the
  // pre-reset "balanced" back over the starter — a NEW `preset.update` past the snapshot. Wait it out; none.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 700)));
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the preceding 700ms real-timer wait is the negative-assertion window itself (proving NO late `preset.update` fires); there is no later state to race against.
  expect(trpc.count("preset.update")).toBe(updatesBeforeReset);
});

// ── The FORK-ONCE pin (owner dogfood, live: "editing the built-in default minted a NEW 'Default (edited)' on
// EVERY field save — I have ten — and Active-for-generation still points at the built-in, so none of my edits
// generate anything"). The built-in is copy-on-write SERVER-side (`preset.update` against the system default
// inserts a fork and returns ITS id); the editor is what must close that loop, and didn't.
//
// The race arm is the flood MECHANISM, so it is DRIVEN, not assumed: the mint response is held in flight (a
// route handler ahead of routeTrpc delays exactly the built-in-targeted POST, then falls back) while a SECOND
// field's debounce fires. Unserialized, that second save still carries the built-in id → mint #2.
const MINT_DELAY_MS = 2000;
const BUILT_IN_DETAIL = { ...presetDetail(BUILT_IN, "Default", undefined), isSystemDefault: true };
/** The numeric TWIN's accessible name — `<label> value`, distinct from the slider's bare `<label>` since the
 *  2026-08-19 P1-2 name split (the pair used to share one name, so a walk could not tell them apart). */
const MAX_OUTPUT_LABEL = "Max output tokens value";

test("FORK-ONCE pin — a built-in edit mints exactly ONE copy; the editor, the racing save and the active pick all retarget to it", async ({ mount, page }) => {
  // The server's fork row, accumulating every patch — the CT's stand-in for the persisted copy.
  let forkConfig: PromptConfig = BUILT_IN_DETAIL.config;
  let activeId: string | null = null;
  const forkDetail = (): PresetDetailFixture => ({
    ...presetDetail(FORK, "Default (edited)", undefined),
    config: forkConfig,
    schemaVersion: forkConfig.schemaVersion,
  });

  // The owner has NO fork yet — the copy-on-write stays silent (nothing to forget), which is what keeps this
  // pin about the fork-ONCE mechanism. The minted fork joins the list, exactly as the real invalidation does.
  let minted = false;
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": (input: unknown) => ((input as { id?: string }).id === BUILT_IN ? BUILT_IN_DETAIL : forkDetail()),
    "preset.list": () => (minted ? [BUILT_IN_DETAIL, { ...forkDetail(), forkedFrom: BUILT_IN }] : [BUILT_IN_DETAIL]),
    "settings.getUserSettings": () => ({
      ...SETTINGS_VIEW,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
    }),
    "settings.updateUserSettingsSection": (input: unknown) => {
      activeId = (input as { patch: { defaultPresetId: string | null } }).patch.defaultPresetId;
      return {};
    },
    "connection.resolveChatCapability": () => CAPABILITY,
    // Every write lands on the fork row; targeting the built-in is what MINTS it (a NEW id in the response).
    "preset.update": (input: unknown) => {
      forkConfig = (input as { config: PromptConfig }).config;
      minted = true;
      return forkDetail();
    },
  });

  // Hold the mint in flight. Registered AFTER routeTrpc so it runs FIRST and defers via fallback(); only the
  // built-in-targeted MUTATION body matches (queries carry their input on the URL, so reads stay fast).
  let mintRequests = 0;
  await page.route("**/api/trpc/**", async (route) => {
    if ((route.request().postData() ?? "").includes(`"${BUILT_IN}"`)) {
      mintRequests += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, MINT_DELAY_MS));
    }
    await route.fallback();
  });

  const component = await mount(<PresetForkOnceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();
  await expect(qualityDial(component)).toHaveText(QUALITY_OFF_LABEL);

  // FIELD 1 — the Quality dial. Its debounce fires the first save, which the route handler holds open.
  await pickQuality(component, page, BALANCED);
  await expect.poll(() => mintRequests, { intervals: [50, 100, 200, 300] }).toBe(1);

  // FIELD 2, fired INSIDE the mint's in-flight window — the race arm. Serialized, it must wait for the fork id
  // and patch the copy; unserialized it re-targets the built-in and mints a second "(edited)" row.
  await component.getByRole("textbox", { name: MAX_OUTPUT_LABEL, exact: true }).fill("1234");

  // THE PIN: the retarget is complete — the selection, the editor's own save target, and the
  // active-for-generation pick are all the fork (a fork nothing generates with is a no-op edit).
  await expect.poll(() => activeId, { intervals: [100, 200, 300, 500, 500] }).toBe(FORK);
  await expect(component.getByText(`selected=${FORK}`)).toBeVisible();
  // Both field values landed on the ONE copy (the racing save patched it, never a second fork).
  await expect
    .poll(() => updatesAgainst(trpc, FORK).at(-1)?.config?.params, { intervals: [100, 200, 300, 500] })
    .toMatchObject({ quality: "balanced", maxOutputTokens: 1234 });

  // Let any late debounce / teardown flush land, then assert the mint stayed at exactly one.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 900)));
  expect(updatesAgainst(trpc, BUILT_IN).length).toBe(1);
  expect(updatesAgainst(trpc, FORK).length).toBeGreaterThanOrEqual(1);
});

// ── THE COPY-ON-WRITE IS NO LONGER SILENT (side-eye 2026-08-30 P2-A, #856) ──────────────────────────────
//
// The mechanism above is right; what it had no half of was FEEDBACK. Measured on the live surface: a knob
// edit on the built-in took the row count 3→4, retargeted the editor title `Default` → `Default (edited)`,
// opened no dialog, and left the only status on screen reading "Saved" — so three beliefs were available and
// all three false ("I changed Default", "my change is in effect", "nothing else happened"). The two halves
// pinned here are the FOREWARNING (the body says the rule before the first keystroke, on whatever tab the
// edit happens) and the ANNOUNCEMENT (the mint is spoken over the same `notify` seam activation uses).
const COW_NOTICE_RE = /editing it never changes it/;
const COW_NOTICE_ACTIVE_RE = /that copy becomes your active preset/;
const FORK_ANNOUNCEMENT_RE = /Your edit created Default \(edited\) and it is now your active preset — Default is unchanged\./;

test("P2-A the BUILT-IN states its copy-on-write rule IN THE BODY, on every view — and an owned preset never does", async ({ mount, page }) => {
  // The rule used to live in exactly one place: a paragraph inside the Transforms tab's Regex section, which
  // a user dragging a slider on Params never opens. Asserted across views for that reason, not for coverage.
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => BUILT_IN_DETAIL,
    "preset.list": () => [BUILT_IN_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
  });
  const component = await mount(<PresetForkOnceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();

  const notice = component.getByRole("note").filter({ hasText: COW_NOTICE_RE });
  await expect(notice).toBeVisible();
  // The default settings' `seeds.defaultPresetId` is null, which IS the built-in — so the promise the notice
  // makes is the ACTIVE one, and it must be the arm that renders on the first-run state.
  await expect(notice).toHaveText(COW_NOTICE_ACTIVE_RE);
  // ONE instance, not one per view: only the open panel is mounted, and a second copy would mean the notice
  // had been hoisted somewhere that renders five times.
  await expect(component.locator('[data-slot="preset-built-in-notice"]')).toHaveCount(1);

  for (const view of ["Prompt", "Actions", "Data", "Transforms"]) {
    await component.getByRole("tab", { name: view, exact: true }).click();
    await expect(component.getByRole("note").filter({ hasText: COW_NOTICE_RE }), `${view}: the rule is stated here too`).toBeVisible();
  }
});

test("P2-A an OWNED preset carries no copy-on-write notice — the rule is the built-in's, not a permanent caption", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await expect(qualityDial(component)).toHaveText(FAST);
  await expect(component.locator('[data-slot="preset-built-in-notice"]')).toHaveCount(0);
});

test("P2-A the silent fork ANNOUNCES — naming the copy, the untouched source, and the active pick it inherited", async ({ mount, page }) => {
  // Same server script as the FORK-ONCE pin, minus the in-flight hold: one edit, one mint, and the sentence
  // it now owes. The active pick starts at `null` — the built-in — so the fork INHERITS it (owner ruling
  // 2026-08-30), and the announcement must SAY the activation rather than leave it to be discovered.
  let forkConfig: PromptConfig = BUILT_IN_DETAIL.config;
  let activeId: string | null = null;
  let minted = false;
  const forkDetail = (): PresetDetailFixture => ({
    ...presetDetail(FORK, "Default (edited)", undefined),
    config: forkConfig,
    schemaVersion: forkConfig.schemaVersion,
  });
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": (input: unknown) => ((input as { id?: string }).id === BUILT_IN ? BUILT_IN_DETAIL : forkDetail()),
    "preset.list": () => (minted ? [BUILT_IN_DETAIL, { ...forkDetail(), forkedFrom: BUILT_IN }] : [BUILT_IN_DETAIL]),
    "settings.getUserSettings": () => ({
      ...SETTINGS_VIEW,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
    }),
    "settings.updateUserSettingsSection": (input: unknown) => {
      activeId = (input as { patch: { defaultPresetId: string | null } }).patch.defaultPresetId;
      return {};
    },
    "preset.update": (input: unknown) => {
      forkConfig = (input as { config: PromptConfig }).config;
      minted = true;
      return forkDetail();
    },
  });

  const component = await mount(<PresetForkOnceAnnouncedStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();
  await component.getByRole("textbox", { name: MAX_OUTPUT_LABEL, exact: true }).fill("1234");

  // The toast viewport is a PORTAL and `aria-live="polite"` — the same one activation announces through, so
  // the sentence is read to AT and painted for the eye in one act. Located on the page for that reason.
  await expect(page.getByText(FORK_ANNOUNCEMENT_RE)).toBeVisible();
  // …and the claim the sentence makes is true: the pick actually moved to the fork.
  await expect.poll(() => activeId, { intervals: [100, 200, 300, 500] }).toBe(FORK);
});

// ── The FORK-CHOICE pins (owner ruling). The silent copy-on-write above is right exactly ONCE: the first
// fork has nothing to forget. Once the owner already HAS a fork of the built-in, a second silent COW either
// converges onto a copy they had moved on from or hides the edit in a row they can't find — so the editor
// asks BEFORE the write, at the one place a built-in edit enters the mutation path (`usePresetAutosave`).
// The library list is mounted beside the editor because the answer is only legible against those rows.
const FORK_ONE = castId<PresetId>("preset_ct_fork0000001");
const FORK_ONE_NAME = "Default (edited)";
const FORK_TWO = "preset_ct_fork0000002";
const SUGGESTED_NAME = "Default fork 2";
const KEEP_EDITING_LABEL = `Keep editing ${FORK_ONE_NAME}`;
const NEW_FORK_LABEL = "Start a new fork";
const LINEAGE_RE = /forked from Default/;
// The dialog's own copy, not the library row behind it: it must NAME the fork the primary arm targets.
const NAMES_THE_FORK_RE = /You already have one: Default \(edited\)/;
const SETTLE_MS = 500;

interface ForkUpdateCall {
  readonly id?: string;
  readonly fork?: { readonly mode?: string; readonly name?: string };
  readonly config?: { readonly params?: { readonly quality?: string } };
}

/** The owner's library: the built-in plus ONE existing fork of it — the precondition for the choice. The
 *  fake server mirrors the verb: a `new` intent MINTS a row, an absent/`converge` one lands on the existing
 *  fork (recorded either way, so a test can prove which arm actually ran). */
function routeForkChoice(page: Page, updateOverride?: (input: unknown) => unknown): Promise<TrpcRecorder> {
  const forkOne = { ...presetDetail(FORK_ONE, FORK_ONE_NAME, undefined), forkedFrom: BUILT_IN };
  const rows: PresetDetailFixture[] = [BUILT_IN_DETAIL, forkOne, PRESET_A_DETAIL];
  let activeId: string | null = null;
  const patch = (id: string, config: PromptConfig): PresetDetailFixture => {
    const index = rows.findIndex((row) => row.id === id);
    const next = { ...(rows[index] ?? forkOne), config, schemaVersion: config.schemaVersion };
    rows[index] = next;
    return next;
  };
  return routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": (input: unknown) => rows.find((row) => row.id === (input as { id?: string }).id) ?? BUILT_IN_DETAIL,
    "preset.list": () => rows,
    "settings.getUserSettings": () => ({
      ...SETTINGS_VIEW,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
    }),
    "settings.updateUserSettingsSection": (input: unknown) => {
      activeId = (input as { patch: { defaultPresetId: string | null } }).patch.defaultPresetId;
      return {};
    },
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.update": (input: unknown) => {
      if (updateOverride !== undefined) {
        return updateOverride(input);
      }
      const call = input as ForkUpdateCall & { config: PromptConfig };
      if (call.id === BUILT_IN && call.fork?.mode === "new") {
        const minted = {
          ...presetDetail(FORK_TWO, call.fork.name ?? "", undefined),
          forkedFrom: BUILT_IN,
          config: call.config,
          schemaVersion: call.config.schemaVersion,
        };
        rows.push(minted);
        return minted;
      }
      // Both the plain patch of a fork and the (unwanted here) silent convergence land through one seam.
      return patch(call.id === BUILT_IN ? FORK_ONE : (call.id ?? FORK_ONE), call.config);
    },
  });
}

test("FORK-CHOICE — with a fork already in the library, a built-in edit is INTERCEPTED: both arms, the fork NAMED, and nothing written yet", async ({
  mount,
  page,
}) => {
  const trpc = await routeForkChoice(page);
  const component = await mount(<PresetForkChoiceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();

  await pickQuality(component, page, BALANCED);

  // The dialog renders in a PORTAL (document.body) — and it NAMES the fork, since "your edits live in a copy"
  // is useless if the owner can't tell which of their rows that is.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: KEEP_EDITING_LABEL })).toBeVisible();
  await expect(dialog.getByRole("button", { name: NEW_FORK_LABEL })).toBeVisible();
  await expect(dialog.getByText(NAMES_THE_FORK_RE)).toBeVisible();

  // THE PIN: the save is PARKED. A dialog that appears after the write already landed is theatre.
  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), SETTLE_MS);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the preceding wait is the negative-assertion window itself (the debounce + a full save round-trip have had their chance; the dialog is what holds the chain).
  expect(trpc.count("preset.update")).toBe(0);
});

test("FORK-CHOICE keep-editing — the edit lands on the EXISTING fork, the editor retargets, and nothing is minted", async ({ mount, page }) => {
  const trpc = await routeForkChoice(page);
  const component = await mount(<PresetForkChoiceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();

  await pickQuality(component, page, BALANCED);
  await page.getByRole("dialog").getByRole("button", { name: KEEP_EDITING_LABEL }).click();

  // The pending edit applies THERE (the arm is a retarget, not a discard).
  await expect.poll(() => updatesAgainst(trpc, FORK_ONE).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("balanced");
  // …and the editor follows it, exactly as the silent COW's retarget does.
  await expect(component.getByText(`selected=${FORK_ONE}`)).toBeVisible();

  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), SETTLE_MS);
  // THE PIN (mutation count): the built-in is never written to, so the server never COWs — the library still
  // holds exactly the ONE fork it started with, no second copy minted behind the owner's back.
  expect(updatesAgainst(trpc, BUILT_IN).length).toBe(0);
  await expect.poll(async () => (trpc.inputs("preset.update") as ForkUpdateCall[]).every((call) => call.id === FORK_ONE)).toBe(true);
  await expect(component.getByText(LINEAGE_RE)).toHaveCount(1);
});

test("FORK-CHOICE delayed completion cannot retarget selection after the user opens another preset", async ({ mount, page }) => {
  const held = trpcHold();
  await routeForkChoice(page, () => held);
  const component = await mount(<PresetForkChoiceStory />);

  await pickQuality(component, page, BALANCED);
  await page.getByRole("dialog").getByRole("button", { name: KEEP_EDITING_LABEL }).click();
  await held.requested;
  await component.getByRole("button", { name: "select Preset A directly" }).click();
  await expect(component.getByText(`selected=${PRESET_A}`)).toBeVisible();

  held.release(presetDetail(FORK_ONE, FORK_ONE_NAME, undefined));
  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), SETTLE_MS);
  await expect(component.getByText(`selected=${PRESET_A}`)).toBeVisible();
  await expect(component.getByText(`selected=${FORK_ONE}`)).toHaveCount(0);
});

test("FORK-CHOICE new fork — the suggested name is pre-filled, the mint carries the intent, and the list shows BOTH forks", async ({ mount, page }) => {
  const trpc = await routeForkChoice(page);
  const component = await mount(<PresetForkChoiceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();

  await pickQuality(component, page, BALANCED);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: NEW_FORK_LABEL }).click();

  // The name step opens pre-filled and FOCUSED (the owner types over it, never hunts for the field).
  const nameField = dialog.getByLabel("New fork name");
  await expect(nameField).toHaveValue(SUGGESTED_NAME);
  await expect(nameField).toBeFocused();
  await nameField.fill("Deep run");
  await dialog.getByRole("button", { name: "Create fork" }).click();

  // THE PIN: the write goes against the BUILT-IN carrying the explicit `new` intent + the name — the arm that
  // mints a sibling instead of converging on the fork the owner already had.
  await expect
    .poll(() => (trpc.inputs("preset.update") as ForkUpdateCall[]).at(-1)?.fork, { intervals: [100, 200, 300, 500] })
    .toEqual({
      mode: "new",
      name: "Deep run",
    });
  expect(updatesAgainst(trpc, FORK_ONE).length).toBe(0);
  await expect.poll(async () => (trpc.inputs("preset.update") as ForkUpdateCall[]).at(-1)?.config?.params?.quality).toBe("balanced");

  // The editor retargets onto the NEW fork, and the library now shows two rows both scented "forked from
  // Default" — the lineage that makes a library of forks navigable at all.
  await expect(component.getByText(`selected=${FORK_TWO}`)).toBeVisible();
  // The new row is IN THE LIBRARY (a row button), not just in the editor header the retarget also updated.
  await expect(component.getByRole("button", { name: "Deep run", exact: true })).toBeVisible();
  await expect(component.getByText(LINEAGE_RE)).toHaveCount(2);
});

// ── The FIVE-VIEW SHELL (redesign §3) + the macro-gate belt ───────────────────────────────────────────
// The two-level tree is gone: ONE tab strip, five views, Params first. The Actions view is where the
// guided templates + nudges now live (§3's map moved them out of the Prompt tab's collapsibles), and a
// template-text editor is exactly the surface the macro-resolution ruling covers — so the re-homed nudge
// editor carries the SHARED roundtrip assertion (tests/support/node/assert-token-roundtrip.ts), never a
// hand-rolled one. That gate is import-keyed and blind to this data flow; the helper is its belt.
test("FIVE VIEWS — one flat strip (Params default), and the re-homed nudge editor round-trips a raw {{token}}", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // ONE level: exactly the five views, in strip order, with Params selected by default (the store's unset
  // read resolves to the tuple's first entry). The old Generation/Prompt/Context/Transforms group strip and
  // its ten leaves are gone — a second tablist would fail this count.
  await expect(component.getByRole("tab")).toHaveText(["Params", "Prompt", "Actions", "Data", "Transforms"]);
  await expect(component.getByRole("tab", { name: "Params" })).toHaveAttribute("aria-selected", "true");

  await component.getByRole("tab", { name: "Actions" }).click();
  await expect(component.getByRole("tab", { name: "Actions" })).toHaveAttribute("aria-selected", "true");

  // The nudge's editor is its DRILL-IN now — the template's ONE editing home (§6.1; the round-4 inline
  // accordion is dead). The row is registry-derived, so reaching the field is: chevron, then the field.
  await component.getByRole("button", { name: "Edit Continue nudge" }).click();
  await expect(component.getByRole("button", { name: "Back to actions" })).toBeVisible();

  // THE BELT: the nudge editor must SHOW and SAVE raw template text. A resolver anywhere in this path would
  // persist "Nate is watching …" — irreversibly, and every other assertion here would stay green.
  await assertTokenRoundtrip({
    trpc,
    // The field is labelled "Template" (side-eye F-32): the drill-in header already names the template, so
    // a field label repeating it was the same word at three levels.
    field: component.getByRole("textbox", { name: "Template", exact: true }),
    proc: "preset.update",
    payloadKey: "config.formatStrings.continueNudge",
  });
});

// ── THE PROSE CAP (verifier finding on the EXTRACTION merge) ──────────────────────────────────────────
// `proseOverridesSchema` wraps every override in a per-key `.catch(undefined)`. That is right at the contract
// — one malformed row must not make a whole stored blob unparseable — but it means an over-cap framing
// template does not BOUNCE, it VANISHES: the write "succeeds", the key heals to absent, the shipped default
// rides, and the host's wording is gone with nothing anywhere having said so. Fail-open, silently, on the
// user's own words. The schema stays; the EDITOR is what must stop the loss before the wire, and these are
// the three halves of that — cap the typing, show the ceiling coming, refuse a save that would delete text.
//
// The framing rows are the third form path (`promptConfig.prose`), so they are the surface at risk: the
// `formatStrings`/`guidedActions` rows next to them in this same list are plain strings with no such heal.
// "Continuation cue" is the framing row with NO required-token capability, so its footer carries only the
// length signals and nothing else can be mistaken for them.
const CONTINUATION_ROW = "Edit Continuation cue";
const CONTINUATION_SLOT = "chat.assembly.continuationNudge";
const TEMPLATE_FIELD = "Template";
/** The `hint-editor` grammar the cap adopts: quiet until 80% of the cap, then a live count. */
const COUNTER_FROM = PROSE_MAX_CHARS * PROSE_COUNTER_AT;
/** A field one character short of the cap, plus the ONE keystroke the cap still admits. */
const AT_CAP = `${"x".repeat(PROSE_MAX_CHARS - 1)}a`;
/** Longer than the cap can ever be TYPED — the shape only pre-existing data can have. */
const OVERLONG = "y".repeat(PROSE_MAX_CHARS + 500);
/** The withheld-save alert, AFTER one deletion: 499, because the count tracks the live field. */
const OVER_CAP_ALERT_RE = /499 characters over the 4000 limit/;

/** `PRESET_A` carrying one stored framing override — the pre-existing-data arm's fixture. */
function presetWithProse(text: string): PresetDetailFixture {
  const base = presetDetail(PRESET_A, "Preset A", "fast");
  return {
    ...base,
    config: { ...base.config, prose: { [CONTINUATION_SLOT]: { text, baseVersion: PROSE_SLOTS[CONTINUATION_SLOT].version } } },
  };
}

/** Open the Continuation-cue framing template's drill-in and return its textarea. */
async function openContinuationCue(component: Locator): Promise<Locator> {
  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: CONTINUATION_ROW }).click();
  // BARRIER: the drill-in's back row is the settled render of the editor — never assert into the swap.
  await expect(component.getByRole("button", { name: "Back to actions" })).toBeVisible();
  return component.getByRole("textbox", { name: TEMPLATE_FIELD, exact: true });
}

test("PROSE CAP — the counter is quiet until 80% of the cap, then typing HARD-STOPS at it", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  const field = await openContinuationCue(component);

  // Well under the cap: no counter. An always-on counter is chrome; the affordance IS its lateness.
  await field.fill("x".repeat(100));
  await expect(component.getByText(`100/${String(PROSE_MAX_CHARS)}`)).toHaveCount(0);

  // One character under the counter threshold — still silent. The boundary is asserted from BOTH sides so a
  // future off-by-one in the threshold cannot pass by simply showing the counter earlier.
  await field.fill("x".repeat(COUNTER_FROM - 1));
  await expect(component.getByText(`${String(COUNTER_FROM - 1)}/${String(PROSE_MAX_CHARS)}`)).toHaveCount(0);

  // At the threshold the count appears and tracks the box.
  await field.fill("x".repeat(PROSE_MAX_CHARS - 1));
  await expect(component.getByText(`${String(PROSE_MAX_CHARS - 1)}/${String(PROSE_MAX_CHARS)}`)).toBeVisible();

  // THE PIN: real keystrokes at the boundary. `pressSequentially` goes through the keyboard (unlike `fill`,
  // which assigns the value and would sail past a native cap), so this is the affordance a person meets —
  // two more characters, exactly ONE of which is allowed to land.
  await field.pressSequentially("ab");
  await expect(field).toHaveValue(AT_CAP);
  await expect(component.getByText(`${String(PROSE_MAX_CHARS)}/${String(PROSE_MAX_CHARS)}`)).toBeVisible();
  // …and it is a stop, not a lag: further typing changes nothing at all.
  await field.pressSequentially("cde");
  await expect(field).toHaveValue(AT_CAP);
});

test("PROSE CAP — an ALREADY-over-cap stored override shows its real text and REFUSES to save until trimmed", async ({ mount, page }) => {
  // The only way to be over the cap now that the field stops at it: text that arrived that way — an imported
  // preset, a direct API write, a blob predating the cap. Truncating it would be the same data loss the
  // schema's self-heal already commits, just with a friendlier name, so the editor refuses instead.
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => presetWithProse(OVERLONG),
    "preset.list": () => [presetWithProse(OVERLONG)],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  const field = await openContinuationCue(component);

  // THE AUTHOR'S BYTES ARE ON SCREEN, all 4500 of them — never silently clipped to the cap behind their back.
  await expect(field).toHaveValue(OVERLONG);

  // A real edit — the author starts deleting. Under the old code this debounced straight into a write whose
  // payload the server would heal away to nothing.
  await field.press("End");
  await field.press("Backspace");
  await expect(field).toHaveValue("y".repeat(PROSE_MAX_CHARS + 499));

  // THE PIN, FIRST: no write, ever. The debounce (500ms) plus a full round-trip have had their chance. It
  // leads deliberately — an assertion ordered behind a cosmetic one is an assertion that never runs on the
  // red side, and THIS is the defect (measured on the unfixed tree: exactly one `preset.update` fired,
  // carrying 4499 characters the schema would then heal to nothing).
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 900)));
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the preceding 900ms real-timer wait IS the negative-assertion window.
  expect(trpc.count("preset.update")).toBe(0);

  // …and the withheld save is STATED, as an alert: the autosave that would normally reassure is the thing
  // being held back, so this badge is the only place that state is legible.
  await expect(component.getByRole("alert")).toHaveText(OVER_CAP_ALERT_RE);

  // …AND THE REFUSAL LIFTS. A form that stayed invalid forever would be a worse bug than the one being fixed:
  // trimming under the cap must let the edit through, carrying the author's own trimmed text.
  await field.fill("y".repeat(3000));
  await expect(component.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() => (trpc.inputs("preset.update") as ProseUpdateCall[]).at(-1)?.config?.prose?.[CONTINUATION_SLOT]?.text?.length, {
      intervals: [100, 200, 300, 500],
    })
    .toBe(3000);
});

// ── THE GEOMETRY OF THE REFUSAL + THE HEADER'S TRUTH (side-eye PROSE-LIMIT P1/P2/P3) ──────────────────
// The cap above stopped the data loss and then hid its own affordances: `field-sizing: content` has no
// ceiling, so the over-cap value all three signals are ABOUT rendered as one 2300px box and pushed the
// counter, the `role="alert"` refusal and the header's save status below the fold. Meanwhile the header kept
// reading "Saved" — the save driver gates on `form.state.isValid`, so the write was being held, and the one
// line whose whole job is to say whether this preset is saved said the opposite of the truth.
test("PROSE GEOMETRY — the box scrolls at its cap, the refusal stays on screen, and the header stops saying Saved", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => presetWithProse(OVERLONG),
    "preset.list": () => [presetWithProse(OVERLONG)],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  const field = await openContinuationCue(component);
  await expect(field).toHaveValue(OVERLONG);

  // THE BOX IS CAPPED AND SCROLLS — every byte still reachable, none of it spent on page height.
  const box = await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }));
  await expect
    .poll(async () => (await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }))).content)
    .toBeGreaterThan(box.client);
  await expect
    .poll(async () => (await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }))).client)
    .toBeLessThan((page.viewportSize()?.height ?? 0) / 2);

  await field.press("End");
  await field.press("Backspace");

  // THE REFUSAL IS ON SCREEN WITH THE FIELD it refuses — scrolling the FIELD into view (never the alert,
  // which would place the thing under test by hand) is what an author editing this template does.
  await field.scrollIntoViewIfNeeded();
  const alert = component.getByRole("alert");
  await expect(alert).toHaveText(OVER_CAP_ALERT_RE);
  await expect(alert).toBeInViewport();
  // …and the counter beside it reads as part of that refusal rather than as quiet chrome (P3).
  const counter = component.getByText(`${String(PROSE_MAX_CHARS + 499)}/${String(PROSE_MAX_CHARS)}`);
  await expect(counter).toBeInViewport();
  await expect(counter).toHaveCSS("color", resolvedTokenColor("color.destructive"));

  // THE HEADER STATES THE STATE (P2). The badge is the REASON; this line is whether the editor is saved —
  // and it is the live region a screen-reader user hears when they leave the field expecting an autosave.
  const status = component.getByRole("status");
  await expect(status).toContainText("Not saved");
  // …AND IT LIFTS when the refusal does.
  await field.fill("y".repeat(3000));
  await expect(status).toContainText("Saved");
  await expect(status).not.toContainText("Not saved");
});

// ── THE {{note}} CARRIER REFUSAL (owner ruling 2026-08-08, option C of note-token-intent-history.md) ───
// `{{note}}` carries the injection's ENTIRE payload: `spliceProseTokens` is a replace, so a frame override
// that dropped it ships `[Note from user: ]` with the host's note gone. That is now a WRITE REFUSAL, and this
// is the rendered half — the same three-signal shape the over-cap regime above wears, because a save that
// fires and bounces off the server while the header reads "Saved" is the defect, not the fix.
const USER_NOTE_ROW = "Edit User-note frame";
const USER_NOTE_SLOT = "chat.injection.userNote";
/** A legal override — the shipped wording, so the baseline arm starts from a frame that really does save. */
const NOTE_FRAME_LEGAL = "[Operator: {{note}}]";
/** The same frame with its carrier deleted: the wrapper survives, the payload has nowhere to land. */
const NOTE_FRAME_BROKEN = "[Operator: ]";

/** `PRESET_A` carrying one stored USER-NOTE frame override. */
function presetWithNoteFrame(text: string): PresetDetailFixture {
  const base = presetDetail(PRESET_A, "Preset A", "fast");
  return {
    ...base,
    config: { ...base.config, prose: { [USER_NOTE_SLOT]: { text, baseVersion: PROSE_SLOTS[USER_NOTE_SLOT].version } } },
  };
}

test("NOTE CARRIER — dropping {{note}} holds the save, says why in the field, and the header stops saying Saved", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => presetWithNoteFrame(NOTE_FRAME_LEGAL),
    "preset.list": () => [presetWithNoteFrame(NOTE_FRAME_LEGAL)],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: USER_NOTE_ROW }).click();
  // BARRIER: the drill-in's back row is the settled render of the editor — never assert into the swap.
  await expect(component.getByRole("button", { name: "Back to actions" })).toBeVisible();
  const field = component.getByRole("textbox", { name: TEMPLATE_FIELD, exact: true });
  await expect(field).toHaveValue(NOTE_FRAME_LEGAL);

  // DELETE THE CARRIER. The wrapper is still perfectly readable prose — which is exactly why the author
  // cannot see the mistake in the field itself, and why the surface has to say it.
  await field.fill(NOTE_FRAME_BROKEN);
  await expect(component.getByText("Missing {{note}}")).toBeVisible();
  const status = component.getByRole("status");
  await expect(status).toContainText("Not saved");

  // …AND IT LIFTS the moment the carrier comes back — the hold is about the token, not about having edited.
  await field.fill(NOTE_FRAME_LEGAL);
  await expect(status).toContainText("Saved");
  await expect(status).not.toContainText("Not saved");
});

// ── THE FORMAT-STRING CAP (the SECOND of the three regimes on this surface) ────────────────────────────
// `formatStringsSchema` bounds every slot at MAX_INJECTION_TEMPLATE_LENGTH and the SAME schema is the read path
// (`parsePromptConfig` degrades a failed parse to DEFAULT_PROMPT_CONFIG), so an over-cap nudge is not one
// bounced field — it is the whole preset reading as defaults. The field wore no cap and no counter at all:
// three cap regimes met on this one drill-in and exactly one of them was signalled.
const CONTINUE_NUDGE_ROW = "Edit Continue nudge";
/** The format-string counter's threshold — the shared capped-field grammar's default 80%. */
const FORMAT_COUNTER_FROM = MAX_INJECTION_TEMPLATE_LENGTH * 0.8;

test("FORMAT-STRING CAP — the nudge field wears the schema's cap and counts toward it", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: CONTINUE_NUDGE_ROW }).click();
  await expect(component.getByRole("button", { name: "Back to actions" })).toBeVisible();
  const field = component.getByRole("textbox", { name: TEMPLATE_FIELD, exact: true });

  // THE CAP IS THE SCHEMA'S, worn by the control the browser enforces it in.
  await expect(field).toHaveAttribute("maxlength", String(MAX_INJECTION_TEMPLATE_LENGTH));

  // The counter is quiet until 80% of it, asserted from both sides so an off-by-one can't pass by showing
  // the count earlier.
  await field.fill("x".repeat(FORMAT_COUNTER_FROM - 1));
  await expect(component.getByText(`${String(FORMAT_COUNTER_FROM - 1)}/${String(MAX_INJECTION_TEMPLATE_LENGTH)}`)).toHaveCount(0);
  await field.fill("x".repeat(FORMAT_COUNTER_FROM));
  await expect(component.getByText(`${String(FORMAT_COUNTER_FROM)}/${String(MAX_INJECTION_TEMPLATE_LENGTH)}`)).toBeVisible();

  // …and the box that now holds 8000 characters is still a field, not a page: it scrolls at its ceiling.
  const box = await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }));
  await expect
    .poll(async () => (await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }))).content)
    .toBeGreaterThan(box.client);
  await expect
    .poll(async () => (await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }))).client)
    .toBeLessThan((page.viewportSize()?.height ?? 0) / 2);
});

// ── THE GUIDED-PROMPT CAP (the THIRD regime — owner ruling 2026-08-08, parked-options §2 option 2) ──────
// `guidedActionConfigSchema.prompt` was an unbounded `z.string()` and this field wore no `maxLength` at all,
// with a comment saying so: the editor could author text of any length, which reached both the preset row and
// the model's system block. Now the contract caps it at the SAME shared constant `formatStrings` wears, and
// the field wears that constant — so the editor and the write boundary agree instead of the field inviting
// text the server would bounce.
const IMPERSONATE_ROW = "Edit Impersonate";

test("GUIDED-PROMPT CAP — the steer field wears the shared injection-template cap and counts toward it", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await component.getByRole("tab", { name: "Actions" }).click();
  // `exact` because "Edit Impersonate" is a PREFIX of "Edit Impersonate nudge" — the nudge is the OTHER cap
  // regime, and a substring match would silently test the field that was already capped.
  await component.getByRole("button", { name: IMPERSONATE_ROW, exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to actions" })).toBeVisible();
  const field = component.getByRole("textbox", { name: TEMPLATE_FIELD, exact: true });

  await expect(field).toHaveAttribute("maxlength", String(MAX_INJECTION_TEMPLATE_LENGTH));

  // The same 80% counter grammar the nudge field speaks, asserted from both sides.
  await field.fill("x".repeat(FORMAT_COUNTER_FROM - 1));
  await expect(component.getByText(`${String(FORMAT_COUNTER_FROM - 1)}/${String(MAX_INJECTION_TEMPLATE_LENGTH)}`)).toHaveCount(0);
  await field.fill("x".repeat(FORMAT_COUNTER_FROM));
  await expect(component.getByText(`${String(FORMAT_COUNTER_FROM)}/${String(MAX_INJECTION_TEMPLATE_LENGTH)}`)).toBeVisible();

  // …and the box holding 8000 characters is still a field, not a page.
  const box = await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }));
  await expect
    .poll(async () => (await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }))).content)
    .toBeGreaterThan(box.client);
  await expect
    .poll(async () => (await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }))).client)
    .toBeLessThan((page.viewportSize()?.height ?? 0) / 2);
});

/** The framing override as it rides `preset.update` — the payload the cap exists to keep parseable. */
interface ProseUpdateCall {
  readonly config?: { readonly prose?: Record<string, { readonly text?: string } | undefined> };
}

// ── G7: HEADER TRUTH (redesign §10 G7 / §16 row 3 echo b) ────────────────────────────────────────
// Two facts change UNDER an open editor and are otherwise only legible in another pane: whether this preset
// is the ACTIVE one (the fork-once retarget moves it mid-edit), and which model the deck's effective column
// resolved against. The Activate affordance exists ONLY in the not-active state — a status chip naming an
// actionable state must act — and it rides the SAME `settings.updateUserSettingsSection` seeds patch as the
// LIST row toggle and its kebab mirror.

function settingsWithActive(activeId: string | null): Record<string, unknown> {
  return {
    ...SETTINGS_VIEW,
    config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
  };
}

interface SeedsPatchCall {
  readonly patch?: { readonly defaultPresetId?: string | null };
}

test("G7 a NOT-active preset's header offers Activate — the same setDefault seeds patch the LIST row fires", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(null),
    "settings.updateUserSettingsSection": () => ({}),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await expect(component.getByText("Preset A", { exact: true })).toBeVisible();
  // No chip while it isn't the pick — the state that IS true is the one that shows.
  await expect(component.getByText("Active", { exact: true })).toHaveCount(0);

  // The header's command NAMES ITSELF as one, distinctly from the LIST's one-of-N radio (2026-08-19 P2:
  // both used to be `Activate <name> for generation`, in two different roles).
  await expect(component.getByRole("radio", { name: "Activate Preset A for generation" })).toHaveCount(0);
  await component.getByRole("button", { name: "Use this preset for generation" }).click();
  await expect
    .poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SeedsPatchCall[]).map((call) => call.patch?.defaultPresetId))
    .toEqual([PRESET_A]);
});

test("P2 TRANSFORMS speaks ONE field layout — DELIVERY docks its controls like COLLAPSING, not full-width", async ({ mount, page }) => {
  // Side-eye 2026-08-19 P2: DELIVERY's two selects were the only Fields in the view rendering VERTICAL —
  // label over a full-width control — with COLLAPSING's right-docked rows three inches under them. Asserted
  // on `data-orientation`, which is the Field primitive's own rendered statement of which arm it took, and
  // COMPARATIVELY: the claim is that the view speaks one grammar, so the neighbour is the oracle.
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "regex.listForPreset": () => [],
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await component.getByRole("tab", { name: "Transforms" }).click();

  const fieldRoot = (label: string): Locator => component.getByText(label, { exact: true }).locator('xpath=ancestor::*[@data-slot="field-root"][1]');
  await expect(component.getByText("Speaker names", { exact: true })).toBeVisible();
  await expect(fieldRoot("Speaker names")).toHaveAttribute("data-orientation", "horizontal");
  await expect(fieldRoot("Continue delimiter")).toHaveAttribute("data-orientation", "horizontal");
  // The oracle: the cluster right under it, whose arm nobody disputed.
  await expect(fieldRoot("Collapse blank lines")).toHaveAttribute("data-orientation", "horizontal");
});

test("P1-2 the Activate command's ACCESSIBLE NAME contains its visible label (WCAG 2.5.3)", async ({ mount, page }) => {
  // The F-5 split gave the header command a name distinct from the LIST radio's, and in doing so dropped the
  // visible word out of the accessible name entirely: visible "Activate", name "Use this preset for
  // generation", `contains: false`. Speech users say what they see, so the control became unaddressable by
  // its own label. The fix keeps BOTH halves — the distinct role-appropriate gloss AND the visible word.
  //
  // Asserted as the LAW, not as the new string: whatever the button says, its name must contain it.
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(null),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  const activate = component.getByRole("button", { name: ACTIVATE_NAME_RE });
  await expect(activate).toBeVisible();
  const visible = (await activate.innerText()).trim();
  const name = (await activate.getAttribute("aria-label")) ?? "";
  expect(visible.length, "the command has a visible word at all").toBeGreaterThan(0);
  expect(name.toLowerCase(), `accessible name "${name}" must contain the visible label "${visible}"`).toContain(visible.toLowerCase());
});

test("P1-1 the VIEW STRIP degrades to a scroller — every view reachable in a 390px pane, nothing painting past it", async ({ mount, page }) => {
  // MEASURED on the shipped strip: a 503px tablist inside a 390px content pane, so "Transforms" painted
  // under the CONTEXT panel and no pointer could reach it. The house rule for a strip that outgrows its box
  // is already written (shell.css: "degrade to a SCROLL, never into an ellipsis"); this makes the preset
  // editor's strip obey it.
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorNarrowStory />);
  const strip = component.getByRole("tablist");
  await expect(strip).toBeVisible();

  const pane = await component.boundingBox();
  // The strip's own box is its CONTENT width by design (the tabs measure their words — degrade to a scroll,
  // never to an ellipsis). What must fit the pane is the box it scrolls inside, found by walking up to the
  // first ancestor that actually clips the inline axis — structure-agnostic, so the pin survives a re-wrap.
  const measured = await strip.evaluate((el: HTMLElement) => {
    let box: HTMLElement | null = el.parentElement;
    while (box !== null && getComputedStyle(box).overflowX === "visible") {
      box = box.parentElement;
    }
    if (box === null) {
      return null;
    }
    const rect = box.getBoundingClientRect();
    return { client: Math.round(rect.width), right: Math.round(rect.right), scrollable: box.scrollWidth - box.clientWidth };
  });
  expect(measured, "the strip sits inside a box that clips the inline axis").not.toBeNull();
  // CONTAINED: the scroll box stays inside the pane…
  expect(measured?.client ?? 0, "the strip's box is laid out inside its pane, not through it").toBeLessThanOrEqual(Math.round(pane?.width ?? 0));
  expect(measured?.right ?? 0, "…and its trailing edge does not paint past the pane's").toBeLessThanOrEqual(
    Math.round((pane?.x ?? 0) + (pane?.width ?? 0)) + 1,
  );
  // …and it is a SCROLLER, not a clipper: the tabs that do not fit are still reachable.
  expect(measured?.scrollable ?? 0, "the overflowing views are scrolled to, never cut off").toBeGreaterThan(0);
  const scrollBox = component.locator(".scroll-fade-x");
  // The driver and stylesheet are one @orb/ui mechanism: the hidden tail arms the trailing cue, while a
  // never-scrolled leading edge stays fully opaque. The resolved mask pins the paint half as well as the
  // data-attribute seam — either assertion alone can survive losing the other half of the recipe.
  await expect(scrollBox).toHaveAttribute("data-fade-end", "");
  await expect(scrollBox).not.toHaveAttribute("data-fade-start", "");
  await expect.poll(() => scrollBox.evaluate((el) => globalThis.getComputedStyle(el).maskImage)).toMatch(/linear-gradient/u);

  // …and REACHABLE: the last view scrolls into the box and takes a real click.
  const last = component.getByRole("tab", { name: "Transforms" });
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(last).toHaveAttribute("aria-selected", "true");
  await expect(scrollBox).toHaveAttribute("data-fade-start", "");
  await expect(scrollBox).not.toHaveAttribute("data-fade-end", "");
});

test("P1-1 the header band shares the BODY's content column — capped and centered, not full-bleed", async ({ mount, page }) => {
  // At a 1520px pane the header spanned the whole pane while the body sat in a capped, centered column, so
  // the preset's name and its own Activate/Reset cluster stood a hand-span outside the thing they belong to.
  // Asserted structure-agnostically: the band is INSET from both pane edges, and by the SAME amount.
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(null),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorWidePaneStory />);
  const heading = component.getByRole("heading", { level: 2, name: "Preset A" });
  await expect(heading).toBeVisible();
  const reset = component.getByRole("button", { name: RESET_NAME_RE });

  const pane = await component.boundingBox();
  const lead = await heading.boundingBox();
  const trail = await reset.boundingBox();
  const leftInset = Math.round((lead?.x ?? 0) - (pane?.x ?? 0));
  const rightInset = Math.round((pane?.x ?? 0) + (pane?.width ?? 0) - ((trail?.x ?? 0) + (trail?.width ?? 0)));

  expect(leftInset, "the band is inset from the pane's leading edge, not flush to it").toBeGreaterThan(MIN_COLUMN_INSET_PX);
  expect(Math.abs(leftInset - rightInset), `the band is centered (left ${String(leftInset)} vs right ${String(rightInset)})`).toBeLessThanOrEqual(2);
});

// P2-1 (side-eye 2026-08-22) read the header as 176px wider than the body and asked for the `@5xl` arm to
// be added or dropped. RE-DERIVED on the live tree: the two columns already carry the identical class pair
// and measure x=220 w=896 on every tab — what that report measured was the Params DECK's own 720px
// instrument cap one level deeper (`params-deck.tsx`, side-eye 2026-08-19 P2), which is why the offset
// showed on Params and no other tab. This is a FENCE, not a defect proof: it passes pre-change, and its job
// is to make the pair fail loudly if one side ever gains a breakpoint arm the other does not.
test("P2-1 FENCE — the header column and the view's content column are the SAME column above the wide breakpoint", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(null),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorWidePaneStory />);
  // SETTLED barrier: the first tab is the header column's own content, so its presence means the band has
  // painted at its final width. Located by the TAB and not by the tablist's name, deliberately — this fence
  // must be able to run against a tree that predates P3-4's `aria-label`, or its red says "the name is
  // missing" instead of "the columns disagree".
  await expect(component.getByRole("tab", { name: "Params" })).toBeVisible();

  const columns = await component.evaluate((root: HTMLElement) => {
    const capped = [...root.querySelectorAll<HTMLElement>(".mx-auto")].filter((el) => el.closest("[role=tablist]") === null);
    const header = capped.find((el) => el.querySelector("[role=tablist]") !== null);
    const panel = capped.find((el) => el.closest("[role=tabpanel]") !== null);
    const read = (el: HTMLElement | undefined): { x: number; w: number } | null =>
      el === undefined ? null : { x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width) };
    return { header: read(header), panel: read(panel) };
  });

  expect(columns.header, "the header's capped column resolved").not.toBeNull();
  expect(columns.panel, "the view body's capped column resolved").not.toBeNull();
  await expect
    .poll(
      async () =>
        (
          await component.evaluate((root: HTMLElement) => {
            const capped = [...root.querySelectorAll<HTMLElement>(".mx-auto")].filter((el) => el.closest("[role=tablist]") === null);
            const header = capped.find((el) => el.querySelector("[role=tablist]") !== null);
            const panel = capped.find((el) => el.closest("[role=tabpanel]") !== null);
            const read = (el: HTMLElement | undefined): { x: number; w: number } | null =>
              el === undefined ? null : { x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width) };
            return { header: read(header), panel: read(panel) };
          })
        ).panel?.x,
    )
    .toBe(columns.header?.x);
  await expect
    .poll(
      async () =>
        (
          await component.evaluate((root: HTMLElement) => {
            const capped = [...root.querySelectorAll<HTMLElement>(".mx-auto")].filter((el) => el.closest("[role=tablist]") === null);
            const header = capped.find((el) => el.querySelector("[role=tablist]") !== null);
            const panel = capped.find((el) => el.closest("[role=tabpanel]") !== null);
            const read = (el: HTMLElement | undefined): { x: number; w: number } | null =>
              el === undefined ? null : { x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width) };
            return { header: read(header), panel: read(panel) };
          })
        ).panel?.w,
    )
    .toBe(columns.header?.w);
});

// P3-4 (side-eye 2026-08-22): the tablist was the ONE element of 112 mapped controls on this surface with
// no stable accessible identity — its name computed from its own contents (`ParamsPromptActionsDataTransforms`)
// and `snap --map` resolved it by DOM path. Pinned by NAME, which is exactly the affordance that was missing.
test("P3-4: the view strip has an accessible name of its own, not one computed from its tabs", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(null),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorWidePaneStory />);
  await expect(component.getByRole("tablist", { name: TABLIST_NAME })).toHaveAccessibleName(TABLIST_NAME);
});

test("G7 the ACTIVE preset's header wears the chip and offers NO Activate", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(PRESET_A),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await expect(component.getByText("Preset A", { exact: true })).toBeVisible();
  await expect(component.getByText("Active", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Use this preset for generation" })).toHaveCount(0);
});

test("P1-3 the header spends its width on the NAME — the model chip is gone, resolved or not", async ({ mount, page }) => {
  // THE REVERSAL (side-eye 2026-08-19 P1-3, reversing the 2026-08-02 sanctioned-echo call recorded in the
  // surface): the chip was a strict PREFIX of a line the CONTEXT readout renders in full at the same time,
  // and at 568px the header truncated the preset's own name to pay for it. Resolution truth homes in the
  // readout; the header states the one fact that is only legible here (Active).
  await page.setViewportSize({ width: 568, height: 900 });
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(PRESET_A),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  const name = component.getByRole("heading", { name: "Preset A", level: 2 });
  await expect(name).toBeVisible();
  // The chip is ABSENT even on a fully-resolved read — the arm that used to render it.
  await expect(component.getByText(FOR_MODEL_RE)).toHaveCount(0);
  // …and the name is unclipped at the narrow end, which is what the chip was costing.
  const overflow = await name.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, "the preset's own name fits at 568px").toBeLessThanOrEqual(0);
});

// ── O-13★: THE GUIDED-INSTRUCTION CROSS-LINK IS A REAL DOOR ───────────────────────────────────────────
// It selected the marker's rack row and left you standing in ACTIONS, where no rack exists — a control
// that does nothing you can see. The door is both halves (view + selection), which is exactly the
// navigation the Actions readout's own note promises. Only a whole-surface test can see it: the view axis
// and the selection axis live in different stores, and the button writes through both.

test("O-13 — the Delivers-via chip OPENS the Guided instruction row in the Prompt view", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: DELIVERS_VIA_RE }).click();

  // The VIEW moved…
  await expect(component.getByRole("tab", { name: "Prompt" })).toHaveAttribute("aria-selected", "true");
  // …and the row it named is the SELECTED one (ListRow paints `aria-current` on the selection).
  await expect(component.getByRole("button", { name: "Guided instruction", exact: true })).toHaveAttribute("aria-current", "true");
});

// ── THE SECTION DRILL'S LIFECYCLE (graduation verifier, 2026-08-08) ───────────────────────────────────
// Moving the drill from local component state onto a store fixed the fork-eject — and, with no reset story,
// bought three defects the local state never had, because a `useState` died on unmount and a store does not.
// All three are properties of the WHOLE surface (view axis, selection axis and drill axis are three stores),
// so nothing below the surface can see them. The door test above stayed green throughout the regression
// only because it never drilled first — which is exactly what the first pin does.

test("the Delivers-via chip lands on the RACK even when a DIFFERENT section is already drilled", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // Drill into "Main" — the state the door test never established.
  await component.getByRole("tab", { name: "Prompt" }).click();
  await component.getByRole("button", { name: "Edit Main", exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to rack" })).toBeVisible();

  // Now take the cross-link from Actions, naming a DIFFERENT section.
  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: DELIVERS_VIA_RE }).click();

  // THE REGRESSION: the door painted the still-drilled "Main" EDITOR, so it named one section and opened
  // another — and the row it selected was never rendered at all. The rack must be standing.
  await expect(component.getByRole("button", { name: "Back to rack" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Guided instruction", exact: true })).toHaveAttribute("aria-current", "true");
});

test("leaving the Prompt view while drilled and returning lands on the RACK, not back inside the editor", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await component.getByRole("tab", { name: "Prompt" }).click();
  await component.getByRole("button", { name: "Edit Main", exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to rack" })).toBeVisible();

  // Away and back — the old local drill state died with the unmount; the store's did not.
  await component.getByRole("tab", { name: "Params" }).click();
  await component.getByRole("tab", { name: "Prompt" }).click();

  await expect(component.getByRole("button", { name: "Back to rack" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Main", exact: true })).toBeVisible();
});

test("a drill in preset A does not leak into preset B — the section ids are the SAME literals", async ({ mount, page }) => {
  // The leak's whole mechanism: rack section ids are `DEFAULT_PROMPT_CONFIG` literals, so A and B carry the
  // byte-identical "main". An unscoped drill therefore RESOLVED in B and opened B directly inside its own
  // "Main" editor — a preset the user had just opened for the first time, already drilled.
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": (input: unknown) => ((input as { id?: string }).id === PRESET_B ? PRESET_B_DETAIL : PRESET_A_DETAIL),
    "preset.list": () => [PRESET_A_DETAIL, PRESET_B_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSwitchStory />);

  await component.getByRole("tab", { name: "Prompt" }).click();
  await component.getByRole("button", { name: "Edit Main", exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to rack" })).toBeVisible();

  // Open B (the rail's prop change) — B is a different preset, so its rack is what opens.
  await component.getByRole("button", { name: "switch to B" }).click();
  await expect(component.getByText("Preset B")).toBeVisible();
  await expect(component.getByRole("button", { name: "Back to rack" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Main", exact: true })).toBeVisible();
});

// ── O-16★: EXPORT HAS ONE HOME, AND IT IS THE LIST ROW ────────────────────────────────────────────────
// The editor-header kebab carried an Export echo (the fix-all's §16 rows 7+27 sanctioned it). Overruled:
// lifecycle lives list-side, matching characters/chats. The kebab keeps exactly one item.

test("O-16 + F-18 — the header offers Reset as its OWN named door; Export is not a second home, and there is no ⋯", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // F-18: a ⋯ that hid exactly ONE command bought nothing and cost discoverability twice — `⋯` promises
  // "there is more here" (there wasn't) and says nothing about WHAT. The command wears its own glyph, its
  // own name, and the O-3 icon-door anatomy (aria-label === title, from one string).
  await expect(component.getByRole("button", { name: "Preset options" })).toHaveCount(0);
  const reset = component.getByRole("button", { name: "Reset to starter arrangement" });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveAttribute("title", "Reset to starter arrangement");
  // O-16 stands: Export is single-homed in the LIST row's kebab, nowhere in the editor header.
  await expect(component.getByRole("button", { name: "Export" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Export" })).toHaveCount(0);
});

// ── O-17★: THE WIRE-SHAPING TAIL LIVES IN TRANSFORMS ──────────────────────────────────────────────────
// Delivery (speaker names · continue delimiter) and Collapsing (adjacent-role merging · squash system
// notes) shape the WIRE, not the prompt's content — owner sort. They must be in ONE view, not both.

test("O-17 — Delivery + Collapsing render under Transforms and are gone from Prompt", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await component.getByRole("tab", { name: "Prompt" }).click();
  await expect(component.getByRole("combobox", { name: "Speaker names" })).toHaveCount(0);
  await expect(component.getByRole("combobox", { name: "Adjacent-role merging" })).toHaveCount(0);

  await component.getByRole("tab", { name: "Transforms" }).click();
  await expect(component.getByRole("combobox", { name: "Speaker names" })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "Continue delimiter" })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "Adjacent-role merging" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Squash system notes" })).toBeVisible();
});

// THE CONTAINING-BLOCK PIN (phantom-scroll CLASS sweep, 2026-08-14). This surface owns its scroll axis
// (`h-full min-h-0 overflow-y-auto`), and it was `position: static` — measured here with
// `readPhantomScrollers` before the fix: ELEVEN absolutely-positioned boxes resolved their containing block
// past the scroller and out to `<body>` (`[number-field-bounds].sr-only`, the Quality select's hidden
// `<input>`, the Switch inputs). An `overflow` scroller only clips — and only absorbs the scrollable
// overflow of — descendants whose containing block is INSIDE it, so under a positioned scrolling ancestor
// (the shell, or a `DialogPopup`) their static positions get added to THAT element's scrollable area
// instead. That is the owner's 2026-08-13 "scrolls past the end of its results" defect, generalized: it is
// the same mechanism the settings pane region was fixed for, and the sr-only boxes Base UI form primitives
// emit put every form-bearing scroller in the class. `relative` is the one-class fix.
test("no absolutely-positioned box escapes the preset editor's scroller (the containing-block pin)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  // A SETTLED barrier: the model-fed sampling knob only paints once the capability read has landed, which
  // is also when the NumberField/Switch sr-only boxes this pin is about exist at all.
  await expect(component.getByRole("slider", { name: "Temperature" })).toBeVisible();

  expect(await readPhantomScrollers(page)).toEqual([]);
});

// ── #483: the open preset can be RENAMED from where you are standing ─────────────────────────────
// THE DEFECT (side-eye 2026-08-22, flow verdict 1): `New` mints a preset called "New preset", opens THIS
// editor, and the only rename door was the OTHER pane's row kebab — a control far from where its effect
// shows, on the very first thing a new user does, and unreachable at all on a phone (the LIST is a closed
// sheet there). The band's own recorded grammar already sanctions exactly this for Activate: "a status
// naming an actionable state must be able to act".
//
// The pin is the WIRE: a name-only `preset.update` carrying the OPEN preset's id — a rename that wrote the
// config too could clobber the autosave, and a rename that wrote nothing would be a dialog that lies.
// The dialog renders in a PORTAL, so it is located on `page`, not the mounted component.

interface RenameCall {
  readonly id?: string;
  readonly name?: string;
  readonly config?: unknown;
}

const RENAME_DOOR = "Rename preset";

test("#483 the editor header renames the open preset — one name-only update against its own id", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await expect(component.getByRole("heading", { level: 2, name: "Preset A" })).toBeVisible();

  // O-3 anatomy: the icon door's accessible name and its native tooltip are ONE string.
  const door = component.getByRole("button", { name: RENAME_DOOR, exact: true });
  await expect(door).toHaveAttribute("title", RENAME_DOOR);
  await door.click();

  // The dialog seeds with the CURRENT name — a rename that starts empty is a retype, not an edit.
  const field = page.getByRole("textbox", { name: "Preset name" });
  await expect(field).toHaveValue("Preset A");
  await field.fill("Renamed in the editor");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect
    .poll(() => (trpc.inputs("preset.update") as RenameCall[]).filter((call) => call.name !== undefined))
    .toEqual([{ id: PRESET_A, name: "Renamed in the editor" }]);
});

// ── #1140 · THE VIEW STRIP'S EDGE FADE DISSOLVED LIVE TABS (the INLINE twin of #1128) ───────────────
// `.scroll-fade-x` is the recipe the strip above wears (P1-1 — "degrade to a SCROLL, never an ellipsis"),
// and it ramped to ZERO alpha over `--fade-edge-stop` (10%) of the strip's own box. So the tab that
// straddles a scrolled edge — the one whose word is half the reason to scroll — dissolves into the header
// band behind it, while a mask keeps it fully hit-testable: a user can click a view they cannot read.
// RED on the unmodified recipe, this exact matrix: at 360px the trailing 13px of `Transforms` decoded
// 2.01:1 dark and 1.91:1 light, and at 390px the leading 22px of the ACTIVE `Params` tab decoded 3.24:1
// light — against 7.75:1 dark / 11.55:1 light for every tab clear of the band in the same run. With the
// floor those three cells read 4.82 / 5.33 / 7.55:1 and the clear rows do not move.
//
// WHY THE SAMPLER NEEDS A REGION HERE AND DID NOT ON THE BLOCK AXIS. #1128's band was 75px deep and its
// subjects sat WHOLLY inside it, so the whole box was the honest clip. An inline edge band reaches only the
// trailing slice of the tab that straddles it, and the unfaded rest of that same tab supplies both extremes
// — `pixelExtremaContrast` over the whole box comes back at the tab's FULL ratio while its last characters
// are gone. The clip is therefore the tab's OWN overlap with the RESOLVED band, computed per width off the
// element, never a fraction chosen by eye or restated from the stylesheet. Everything else is #1128's
// instrument unchanged, for its stated reason: a mask is PAINT, invisible to `getComputedStyle`, so
// snap --contrast, axe, design-audit and `pixelContrast` itself all report this strip clean.
//
// A POINT MEASUREMENT NEVER PROVES A RANGE PROPERTY, and this band is a fraction of a box that moves: the
// matrix is a pane sweep x BOTH scrolled edges x both POLARITIES. The light arm is the demanding one (the
// alpha a fade may bottom out at is polarity-dependent arithmetic — 0.60 against the dark arm's 0.48) and
// it is derived from `background`, so the whole ramp inverts with it rather than a hand-listed palette.
//
// ITS OWN POSITIVE CONTROL, in the same decode: every tab CLEAR of the band is measured over its whole
// visible box in the same run and must read the full ink ratio. A uniformly dim page takes those down too.
// Both ends AND the crossover: 320/360 are real phone panes, 390 is the narrowest DESKTOP content pane
// (a 1280 viewport with both panels docked — the P1-1 measurement above), and 450 is past the strip's own
// overflow, where the recipe must paint no band at all and every row reads `clear`.
const STRIP_FADE_PANES = [320, 360, 390, 450] as const;
/** WCAG 1.4.3 normal text — the tabs are 13px/500, so the 3:1 large-text relaxation does not apply. */
const STRIP_FADE_INK_FLOOR = 4.5;
/** A light scope by DERIVATION, never a hand-listed palette — `background` grows the whole ramp. */
const STRIP_LIGHT_SCOPE_BACKGROUND = "oklch(0.98 0.004 75)";
/** Below this a clip is sub-pixel noise, not a slice of a tab anyone reads. */
const STRIP_CLIP_MIN_PX = 3;
/** sRGB midpoint — the polarity arm proves itself off the strip's COMPOSITED surface, not a token string. */
const STRIP_POLARITY_MIDPOINT = 128;

interface StripBand {
  /** Viewport-space x of the CLIPPING box's edges (the scroller's client box, not the tablist's). */
  readonly left: number;
  readonly right: number;
  /** The resolved band depth in px at each edge — 0 where that edge currently hides nothing. */
  readonly startDepth: number;
  readonly endDepth: number;
}

/** The strip's own resolved fade geometry, read off the element rather than restated from the stylesheet:
 *  the two sanctioned stop properties resolve to whatever the recipe currently says (a percentage of the
 *  box or a length) AND to 0 on an edge that hides nothing, so this pin keeps measuring the REAL band
 *  across a change to the recipe itself and needs no second read of the data-attribute seam. */
async function readStripBand(page: Page): Promise<StripBand> {
  const band = await page.evaluate((hook) => {
    const strip = document.querySelector(`.${hook}`);
    if (strip === null) {
      return null;
    }
    const rect = strip.getBoundingClientRect();
    const style = getComputedStyle(strip);
    const depth = (token: string): number => {
      const raw = style.getPropertyValue(token).trim();
      const value = Number.parseFloat(raw);
      if (Number.isNaN(value)) {
        return 0;
      }
      return raw.endsWith("%") ? (strip.clientWidth * value) / 100 : value;
    };
    return { left: rect.left, right: rect.left + strip.clientWidth, startDepth: depth("--fade-start-stop"), endDepth: depth("--fade-end-stop") };
  }, SCROLL_FADE_X_CLASS);
  if (band === null) {
    throw new Error("#1140: no .scroll-fade-x scroller — the fixture is not the surface under test");
  }
  return band;
}

interface StripTabReading {
  readonly label: string;
  readonly ratio: number;
  readonly inBand: boolean;
  readonly describe: string;
}

interface StripClip {
  readonly from: number;
  readonly to: number;
  readonly inBand: boolean;
}

/** Which slice of one tab's VISIBLE span the fade actually reaches. A tab the band misses entirely reports
 *  its whole visible span and `inBand: false` — that row is the run's positive control, not a skip. */
function stripClip(visibleFrom: number, visibleTo: number, band: StripBand): StripClip {
  const leadingTo = Math.min(visibleTo, band.left + band.startDepth);
  if (leadingTo - visibleFrom >= STRIP_CLIP_MIN_PX) {
    return { from: visibleFrom, to: leadingTo, inBand: true };
  }
  const trailingFrom = Math.max(visibleFrom, band.right - band.endDepth);
  if (visibleTo - trailingFrom >= STRIP_CLIP_MIN_PX) {
    return { from: trailingFrom, to: visibleTo, inBand: true };
  }
  return { from: visibleFrom, to: visibleTo, inBand: false };
}

/** The inline span of one tab's own rendered TEXT — the Range rects, not the padded box.
 *
 *  THE POPULATION IS TEXT, and saying so is what keeps the pin honest in both directions. WCAG 1.4.3 is a
 *  claim about text, and a tab scrolled down to a 4px sliver shows no glyph at all: measuring its box there
 *  decodes the accent INDICATOR against the strip's fill and reports a 3.46:1 "failure" that names nothing
 *  a reader could have read (measured, before this narrowing). Clipping to the label's own rects makes
 *  every row a real ink-on-its-surface reading, and a cell with no glyph left inside the band drops out of
 *  the declared population instead of fabricating one. */
async function readStripText(tab: Locator): Promise<{ readonly left: number; readonly right: number } | null> {
  return await tab.evaluate((element) => {
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    return rects.length === 0 ? null : { left: Math.min(...rects.map((rect) => rect.left)), right: Math.max(...rects.map((rect) => rect.right)) };
  });
}

/** Every tab whose LABEL is still painted inside the scroller's client box, clipped by {@link stripClip}
 *  and then narrowed to the glyphs themselves. */
async function readStripTabs(page: Page, tablist: Locator, band: StripBand): Promise<readonly StripTabReading[]> {
  const readings: StripTabReading[] = [];
  for (const tab of await tablist.getByRole("tab").all()) {
    const box = await tab.boundingBox();
    const text = await readStripText(tab);
    if (box === null || text === null) {
      continue;
    }
    const clip = stripClip(Math.max(box.x, band.left), Math.min(box.x + box.width, band.right), band);
    const from = Math.max(clip.from, text.left);
    const to = Math.min(clip.to, text.right);
    if (to - from < STRIP_CLIP_MIN_PX) {
      continue;
    }
    const receipt = await pixelExtremaContrast(page, tab, { region: { x0: (from - box.x) / box.width, x1: (to - box.x) / box.width, y0: 0, y1: 1 } });
    readings.push({ label: (await tab.textContent())?.trim() ?? "?", ratio: receipt.ratio, inBand: clip.inBand, describe: receipt.describe });
  }
  return readings;
}

/** The scroller's SETTLED fade state as one word — what the stylesheet is currently painting, not what the
 *  scroll offset implies it should be. */
async function readStripFadeState(scroller: Locator): Promise<string> {
  return await scroller.evaluate((el) => {
    const armed = ["start", "end"].filter((edge) => el.hasAttribute(`data-fade-${edge}`));
    return armed.length === 0 ? "none" : armed.join("+");
  });
}

/** One cell of the matrix: park the strip at one edge, let the DRIVER settle, and decode every tab.
 *
 *  THE BARRIER IS THE RENDERED FADE STATE, NEVER `scrollLeft`. Assigning `el.scrollLeft` updates the
 *  property SYNCHRONOUSLY while the `scroll` event that drives `useScrollFadeX` fires on a later task, so a
 *  poll on the offset returns while the stylesheet is still painting the PREVIOUS cell's band — measured:
 *  a `trailing` cell decoded with `data-fade-start` still set from the leading cell before it, which put a
 *  leading-edge clip and a leading-edge label on the wrong tab. Polling the attributes waits for the state
 *  the paint actually keys on, and re-reading it after the decode catches a cell that moved mid-sample —
 *  an unusable measurement, so it throws rather than reporting a row nobody can trust. */
async function readStripCell(page: Page, scroller: Locator, tablist: Locator, edge: "leading" | "trailing"): Promise<readonly StripTabReading[]> {
  const overflow = await scroller.evaluate((el) => el.scrollWidth - el.clientWidth);
  const target = Math.round(edge === "leading" ? overflow : 0);
  await scroller.evaluate((el, left) => {
    el.scrollLeft = left;
  }, target);
  // A strip that FITS arms no edge at all — the scroll-aware half of the recipe, asserted rather than
  // special-cased away.
  const armedEdge = edge === "leading" ? "start" : "end";
  const expected = overflow <= STRIP_CLIP_MIN_PX ? "none" : armedEdge;
  await expect.poll(async () => await readStripFadeState(scroller)).toBe(expected);
  const readings = await readStripTabs(page, tablist, await readStripBand(page));
  const settled = await readStripFadeState(scroller);
  if (settled !== expected) {
    throw new Error(`#1140: the strip's fade went ${expected} -> ${settled} while the ${edge} cell was being decoded`);
  }
  return readings;
}

for (const polarity of ["dark", "light"] as const) {
  test(`#1140 the view strip's edge fade never takes a tab below AA — ${polarity} polarity, the pane sweep`, async ({ mount, page }) => {
    await routeTrpc(page, {
      ...PRESET_EDITOR_AMBIENT_ROUTES,
      "preset.get": () => PRESET_A_DETAIL,
      "preset.list": () => [PRESET_A_DETAIL],
      "settings.getUserSettings": () => SETTINGS_VIEW,
    });
    const component = await mount(
      <PresetEditorStripFadeStory />,
      polarity === "light" ? { hooksConfig: { theme: { background: STRIP_LIGHT_SCOPE_BACKGROUND } } } : undefined,
    );
    // SETTLED, never "not busy": the decode must not land between the strip's mount and its first sync.
    const tablist = component.getByRole("tablist", { name: TABLIST_NAME });
    await expect(tablist).toBeVisible();
    await expect(component.getByRole("tab", { name: "Transforms" })).toBeVisible();
    const scroller = component.locator(`.${SCROLL_FADE_X_CLASS}`);

    // THE POLARITY IS PROVEN, NEVER ASSUMED — a "light arm" whose scope failed to invert is a second dark
    // arm wearing a label, and it would retire the demanding half of this matrix while reading as coverage.
    // Proven from the FRAMEBUFFER (the same place every ratio below comes from) rather than a token string.
    const surface = await pixelSurface(page, scroller);
    const mean = (surface.rgb.r + surface.rgb.g + surface.rgb.b) / 3;
    expect(mean > STRIP_POLARITY_MIDPOINT, `${polarity} arm composited the strip's surface at ${surface.describe}`).toBe(polarity === "light");

    const rows: string[] = [];
    const failures: string[] = [];
    const banded: number[] = [];
    const clear: number[] = [];
    let bandedCells = 0;
    for (const pane of STRIP_FADE_PANES) {
      await page.evaluate((inline) => {
        const box = document.querySelector("[data-preset-fade-pane]");
        if (box instanceof HTMLElement) {
          box.style.setProperty("inline-size", `${String(inline)}px`);
        }
      }, pane);
      // The driver re-syncs its attributes from a ResizeObserver, so the resize must LAND before a pixel is
      // read — poll the RENDERED pane to the exact width. An inequality here is not a barrier at all: every
      // width in this sweep is wider than the last, so `<= pane` is already true of the PREVIOUS pane and
      // the poll returns on the frame the resize was queued in (measured — it decoded one cell's tabs under
      // another cell's geometry).
      await expect
        .poll(async () => await page.evaluate(() => Math.round(document.querySelector("[data-preset-fade-pane]")?.getBoundingClientRect().width ?? 0)))
        .toBe(pane);
      for (const edge of ["trailing", "leading"] as const) {
        const readings = await readStripCell(page, scroller, tablist, edge);
        bandedCells += readings.some((reading) => reading.inBand) ? 1 : 0;
        banded.push(...readings.filter((reading) => reading.inBand).map((reading) => reading.ratio));
        clear.push(...readings.filter((reading) => !reading.inBand).map((reading) => reading.ratio));
        rows.push(
          ...readings.map(
            (reading) =>
              `${String(pane)}px\t${polarity}\t${edge}\t${reading.label}\t${reading.ratio.toFixed(2)}:1\t${reading.inBand ? "IN BAND" : "clear"}\t${reading.describe}`,
          ),
        );
        failures.push(
          ...readings
            .filter((reading) => reading.ratio < STRIP_FADE_INK_FLOOR)
            .map((reading) => `${String(pane)}px ${polarity} ${edge}: "${reading.label}" ${reading.ratio.toFixed(2)}:1 — ${reading.describe}`),
        );
      }
    }
    // Printed on PASS as well as fail — this table IS #1140's closing receipt, and the `clear` rows are the
    // positive control that says the sampler reads ink rather than a uniformly dimmed page.
    console.info(`\n#1140 strip-fade ink (framebuffer extrema inside each tab's own band overlap)\n${rows.join("\n")}\n`);
    // A sweep that never armed a band would pass vacuously — the premise is asserted, not assumed.
    expect(bandedCells, "no pane in the sweep put a tab under the fade — the matrix proves nothing").toBeGreaterThan(0);
    expect(failures, failures.join("\n")).toEqual([]);
    // THE CUE MUST STILL BE A CUE. A floor of 1.0 is a recipe that paints no fade at all, and it would
    // satisfy every assertion above — this is the other side of the same fence: the dimmest thing the band
    // reaches still reads DIMMER than the dimmest thing outside it, so "more — scroll" survives the fix.
    const dimmest = Math.min(...banded);
    const unfaded = Math.min(...clear);
    expect(dimmest, `the band dims nothing: faded floor ${dimmest.toFixed(2)}:1 vs unfaded floor ${unfaded.toFixed(2)}:1`).toBeLessThan(unfaded);
  });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// #1716 — THE UNREADABLE STORED BLOB. `preset.get` now carries the server's own read verdict
// (`configUnreadable`), which is the read-time twin of the refusal `preset.update` would answer with
// (`stored_config_unreadable`, the #1026 guard). Before it the editor showed a DEFAULTS-looking form and a
// header reading "Saved", and the user only found out after typing — from a generic failure whose Retry
// could never succeed, because the bytes are what they are.
//
// These pins assert through what a user can SEE and what the WIRE carries: the state's own words, the
// header's status line, and the absence of a `preset.update` after a real edit + the full debounce.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** `PRESET_A`, but the server says its stored blob could not be read. */
function unreadablePreset(failure: VersionedParseFailure): PresetDetailFixture {
  return { ...presetDetail(PRESET_A, "Preset A", "fast"), configUnreadable: failure };
}

test("UNREADABLE — a corrupt stored preset says so on OPEN, disables saving, and names the repair doors", async ({ mount, page }) => {
  const detail = unreadablePreset("schema-rejected");
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => detail,
    "preset.list": () => [detail],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.update": () => detail,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // BARRIER: the settled editor. The dial is the last thing the Params view paints, so its presence is the
  // signal that `preset.get` landed and the body is the real render, not the boundary's skeleton.
  await expect(qualityDial(component)).toBeVisible();

  // THE STATE, on ARRIVAL — before any interaction. It names what is on screen (defaults, not the stored
  // preset), why saving is off, and BOTH doors.
  const notice = component.locator('[data-slot="stored-config-unreadable"]');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("This preset couldn't be read");
  await expect(notice).toContainText("Reset it to the default, or import a preset file over it.");

  // …and the header's live status says it too, with NO retry affordance: a retry cannot succeed.
  await expect(component.locator('[data-slot="autosave-status"]')).toHaveText("Can't save — this couldn't be read");
  await expect(component.getByRole("button", { name: "Retry" })).toHaveCount(0);

  // THE WRITE IS ACTUALLY DISARMED, not merely labelled: a real edit, then the whole debounce window, and
  // nothing reaches the wire. (`preset.update` is stubbed above, so a fired write would be recorded.)
  await pickQuality(component, page, DEEP);
  // BARRIER on the RENDERED settled edit before timing anything — the dial's trigger text IS the form's
  // committed value, so this is the instant the debounce would have armed from.
  await expect(qualityDial(component)).toHaveText(DEEP);
  // The negative-assertion WINDOW — a real-timer sleep evaluated in the page (`page.waitForTimeout` is
  // biome-banned, `noPlaywrightWaitForTimeout`; this is the house idiom the prose-cap pin above uses).
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 1200)));
  // Polling can only wait for a call that must never come; the barrier is the rendered settled edit above
  // plus the full debounce window, so the read IS settled at this line.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a NEGATIVE recorder read, taken after the rendered settled edit and the whole debounce window.
  expect(trpc.count("preset.update")).toBe(0);
  // The status has not drifted to "Saving…"/"Saved" behind the edit either — the one lie this state exists
  // to kill is a success word over a write that cannot happen.
  await expect(component.locator('[data-slot="autosave-status"]')).toHaveText("Can't save — this couldn't be read");
});

test("UNREADABLE — a blob from a NEWER build gets a different story, and is NOT told to reset first", async ({ mount, page }) => {
  const detail = unreadablePreset("version-from-future");
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => detail,
    "preset.list": () => [detail],
    "settings.getUserSettings": () => SETTINGS_VIEW,
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await expect(qualityDial(component)).toBeVisible();

  const notice = component.locator('[data-slot="stored-config-unreadable"]');
  await expect(notice).toContainText("saved by a newer version of Orbweaver");
  // THE LOAD-BEARING DIFFERENCE: this blob is INTACT data an older build cannot represent, so leading with
  // "reset it" would tell the user to destroy what the newer version stored. The corrupt arm's imperative
  // must not appear here.
  await expect(notice).not.toContainText("Reset it to the default, or import a preset file over it.");
  await expect(notice).toContainText("would discard what the newer version stored");
});

test("READABLE — an intact preset is byte-identical to before: no state, no disabled save", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.update": () => PRESET_A_DETAIL,
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await expect(qualityDial(component)).toBeVisible();

  // THE CONTROL for the two pins above — without it they prove only that SOMETHING renders a band.
  await expect(component.locator('[data-slot="stored-config-unreadable"]')).toHaveCount(0);
  await pickQuality(component, page, DEEP);
  await expect(qualityDial(component)).toHaveText(DEEP);
  await expect.poll(() => trpc.count("preset.update")).toBeGreaterThan(0);
});

// ── #1770 — a Params row binds its control to its LABEL, never to the pane ────────────────────────────
// design-audit's `row-void` fired five times on the Params tab (46-57% of a 544px row empty between a name
// and the control it names). The rows were `FieldLayout orientation="horizontal"` in its DEFAULT `block`
// arm: a flex `justify-between` against the pane with a `w-(--width-control-col)` dock, so the distance
// from a name to its control was whatever the window happened to be. Measured on this surface before the
// fix: "Quality" 452px of gap at a 720 pane and 476px at a 1520 pane, with the control's x moving 496 → 520
// between them — the eye re-learns the traverse per pane, which is the rule's own complaint.
//
// The fix is #932's ratified answer (`SettingRowGroup` — `FieldLayout align="track"` over a subgrid whose
// label track is `--width-control-col`), so this pin asserts the PROPERTY that arm buys rather than the
// classes that implement it: the control starts at ONE shared x for every row and that x does NOT move with
// the pane. A SWEEP, never a point: "the gap is small at 720" is satisfied by a layout that still grows with
// the window, which is the defect.
// 520 is in the sweep on purpose: it is the 64px container band (between the horizontal arm's own
// `@max-md` stack and the group's `@lg` track step) where a `track`-aligned row used to fall back to the
// flex DOCK and void at 51% — measured, and closed in `@orb/ui`'s field variants by the same #1770 pass.
const ROW_VOID_PANES = [390, 520, 560, 720, 1120, 1520] as const;
/** design-audit's own absolute fence (`checkRowVoid`, ROW_VOID_MIN_PX) — a gap it would file as a void. */
const ROW_VOID_MAX_GAP_PX = 240;
/** Sub-pixel layout rounding between two panes' readings of one fixed track. */
const ROW_VOID_X_TOLERANCE_PX = 1;

interface ParamsRowReading {
  readonly label: string;
  readonly gap: number;
  readonly controlX: number;
  readonly stacked: boolean;
}

/** Every horizontal Field row on the deck, as the `row-void` rule measures one: the distance from the end of
 *  the label to the start of the control column, and where that column starts inside its row. */
async function readParamsRows(page: Page): Promise<ParamsRowReading[]> {
  return await page.evaluate(() => {
    const readings: { label: string; gap: number; controlX: number; stacked: boolean }[] = [];
    for (const root of Array.from(document.querySelectorAll('[data-slot="field-root"][data-orientation="horizontal"]'))) {
      const label = root.querySelector('[data-slot="field-label"]');
      const control = root.querySelector('[data-slot="field-control-col"]');
      if (label === null || control === null) {
        continue;
      }
      const rowBox = root.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      const controlBox = control.getBoundingClientRect();
      readings.push({
        label: (label.textContent ?? "").trim(),
        gap: Math.round(controlBox.left - labelBox.right),
        controlX: Math.round(controlBox.left - rowBox.left),
        // The narrow arm drops the group to one track: the control takes the whole row UNDER its label, so
        // there is no horizontal gap to judge and its x is the row's own start.
        stacked: controlBox.top >= labelBox.bottom,
      });
    }
    return readings;
  });
}

test("#1770 a Params row's control sits a FIXED distance from its label at every pane width", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PRESET_EDITOR_AMBIENT_ROUTES,
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
  });
  const component = await mount(<PresetEditorStripFadeStory />);
  await expect(component.getByRole("tablist", { name: TABLIST_NAME })).toBeVisible();
  // The Params view is the default (`PRESET_EDITOR_VIEWS[0]`), and this row is the one the audit named.
  await expect(component.getByRole("combobox", { name: "Quality", exact: true })).toBeVisible();

  const rows: string[] = [];
  const failures: string[] = [];
  const columns: number[] = [];
  let sideBySideRows = 0;
  for (const pane of ROW_VOID_PANES) {
    await page.evaluate((inline) => {
      const box = document.querySelector("[data-preset-fade-pane]");
      if (box instanceof HTMLElement) {
        box.style.setProperty("inline-size", `${String(inline)}px`);
      }
    }, pane);
    await expect
      .poll(async () => await page.evaluate(() => Math.round(document.querySelector("[data-preset-fade-pane]")?.getBoundingClientRect().width ?? 0)))
      .toBe(pane);
    const readings = await readParamsRows(page);
    expect(readings.length, `no horizontal Field row rendered at ${String(pane)}px — the sweep would prove nothing`).toBeGreaterThan(0);
    for (const reading of readings) {
      rows.push(`${String(pane)}px\t${reading.label}\t${reading.stacked ? "stacked" : `gap ${String(reading.gap)}px @ x=${String(reading.controlX)}`}`);
      if (reading.stacked) {
        continue;
      }
      sideBySideRows += 1;
      columns.push(reading.controlX);
      if (reading.gap >= ROW_VOID_MAX_GAP_PX) {
        failures.push(
          `${String(pane)}px "${reading.label}": ${String(reading.gap)}px between the label and its control (design-audit row-void files at ${String(ROW_VOID_MAX_GAP_PX)}px)`,
        );
      }
    }
  }
  console.info(`\n#1770 Params row measure (label → control)\n${rows.join("\n")}\n`);
  expect(sideBySideRows, "every pane stacked its rows — the void the sweep is about is only reachable side-by-side").toBeGreaterThan(0);
  expect(failures, failures.join("\n")).toEqual([]);

  // AND THE COLUMN DOES NOT MOVE. This is the half a per-pane gap check cannot state: one shared control x
  // across the whole sweep is what stops the eye re-learning the traverse when the pane resizes — and it is
  // the assertion the pre-fix layout fails even where a single pane's gap happens to look modest.
  const spread = Math.max(...columns) - Math.min(...columns);
  expect(spread, `the control column moved ${String(spread)}px across ${String(ROW_VOID_PANES.length)} panes (${columns.join(", ")})`).toBeLessThanOrEqual(
    ROW_VOID_X_TOLERANCE_PX,
  );
});
